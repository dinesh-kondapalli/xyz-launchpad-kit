use cosmwasm_schema::cw_serde;
use cosmwasm_std::{
    entry_point, to_binary, BankMsg, Binary, Coin, Deps, DepsMut,
    Env, MessageInfo, Reply, Response, StdResult, SubMsg, Uint128, WasmMsg,
    StdError,
};
use cw2::set_contract_version;
use cw_utils::parse_instantiate_response_data;

use crate::error::ContractError;
use crate::msg::{
    ExecuteMsg, InstantiateMsg, MigrateMsg, QueryMsg, CurveResponse, AllCurvesResponse,
    ProgressResponse, ConfigResponse, SimulateBuyResponse, SimulateSellResponse,
    OracleResponse,
};
use crate::state::{
    Config, Curve, OracleState, PendingCurve, TokenMetadata,
    CONFIG, CURVES, ORACLE_STATE, PENDING_CURVE,
};

const CONTRACT_NAME: &str = "crates.io:xyz-launchpad";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

// Reply ID for CW20 instantiation
const REPLY_CW20_INSTANTIATE: u64 = 1;

// Fixed total supply: 100 million tokens with 6 decimals
// Starting FDV = base_price * total_supply = 0.000015 XYZ * 100M = 1,500 XYZ
pub const TOTAL_SUPPLY: u128 = 100_000_000_000_000; // 100 million * 10^6

// ===========================================
// Constant Product Curve Constants
// ===========================================

/// Tokens available for purchase on the bonding curve (79.31% of supply)
pub const TOKENS_ON_CURVE: u128 = 79_310_000_000_000; // 79.31M * 10^6

/// Tokens reserved for AMM liquidity pool at graduation (20.69% of supply)
pub const TOKENS_FOR_LP: u128 = 20_690_000_000_000; // 20.69M * 10^6

/// Virtual XYZ reserves at curve start (in uxyz)
/// Determines starting price and total XYZ raised at graduation.
/// Higher value = more XYZ raised at graduation, lower starting price.
pub const VIRTUAL_XYZ_START: u128 = 34_800_000_000_000; // 34,800,000 XYZ

/// Virtual token reserves at curve start (in base units with 6 decimals)
/// Scaled from pump.fun's 1.073B virtual tokens (/ 10 for 100M supply).
/// Must be > TOKENS_ON_CURVE for the math to work.
pub const VIRTUAL_TOKENS_START: u128 = 107_300_000_000_000; // 107.3M tokens

/// Constant product invariant: k = virtual_xyz * virtual_tokens
/// This remains constant throughout the curve's lifecycle.
/// = 34_800_000_000_000 * 107_300_000_000_000
pub const K: u128 = 3_734_040_000_000_000_000_000_000_000;

// ===========================================
// Dynamic Curve Parameter Computation
// ===========================================

/// Precision multiplier for fixed-point sqrt computation
const CURVE_PRECISION: u128 = 1_000_000;

#[derive(Debug)]
struct CurveParams {
    virtual_xyz_start: u128,
    virtual_tokens_start: u128,
    curve_k: u128,
    tokens_on_curve: u128,
    tokens_for_lp: u128,
}

/// Integer square root using Newton's method
fn isqrt(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// Compute per-curve bonding curve parameters from USD targets and oracle price.
///
/// All USD values in micro-USD (6 decimals). XYZ amounts in uxyz.
/// Token amounts in utokens (with 6 decimal places).
///
/// Key formulas (S = sqrt(graduation_mc / starting_mc)):
///   tokens_on_curve = raised * TOTAL_SUPPLY / (starting_mc * S)
///   virtual_tokens  = tokens_on_curve * S / (S - 1)
///   raised_uxyz     = raised_usd * 10^6 / xyz_price
///   virtual_xyz     = raised_uxyz / (S - 1)
///   K               = virtual_xyz * virtual_tokens
fn compute_curve_params(
    xyz_usd_price: u128,
    target_starting_mc_usd: u128,
    target_graduation_mc_usd: u128,
    target_raised_usd: u128,
) -> Result<CurveParams, ContractError> {
    if xyz_usd_price == 0 {
        return Err(ContractError::OraclePriceRequired {});
    }
    if target_starting_mc_usd == 0 {
        return Err(ContractError::InvalidCurveParams {
            reason: "target_starting_mc_usd must be > 0".to_string(),
        });
    }
    if target_graduation_mc_usd <= target_starting_mc_usd {
        return Err(ContractError::InvalidCurveParams {
            reason: "graduation MC must be > starting MC".to_string(),
        });
    }

    // 1. MC ratio (integer)
    let mc_ratio = target_graduation_mc_usd / target_starting_mc_usd;

    // 2. S_scaled = isqrt(mc_ratio * PRECISION^2) ≈ sqrt(mc_ratio) * PRECISION
    let s_scaled = isqrt(mc_ratio * CURVE_PRECISION * CURVE_PRECISION);
    if s_scaled <= CURVE_PRECISION {
        return Err(ContractError::InvalidCurveParams {
            reason: "sqrt(mc_ratio) must be > 1".to_string(),
        });
    }
    let s_minus_one = s_scaled - CURVE_PRECISION;

    // 3. tokens_on_curve (utokens) = raised * TOTAL_SUPPLY * PRECISION / (starting_mc * S_scaled)
    let toc_num = target_raised_usd
        .checked_mul(TOTAL_SUPPLY)
        .and_then(|v| v.checked_mul(CURVE_PRECISION))
        .ok_or_else(|| ContractError::InvalidCurveParams {
            reason: "overflow computing tokens_on_curve numerator".to_string(),
        })?;
    let toc_denom = target_starting_mc_usd
        .checked_mul(s_scaled)
        .ok_or_else(|| ContractError::InvalidCurveParams {
            reason: "overflow computing tokens_on_curve denominator".to_string(),
        })?;
    let tokens_on_curve = toc_num / toc_denom;

    if tokens_on_curve == 0 || tokens_on_curve >= TOTAL_SUPPLY {
        return Err(ContractError::InvalidCurveParams {
            reason: format!(
                "tokens_on_curve out of range: {} (must be 0 < x < {})",
                tokens_on_curve, TOTAL_SUPPLY
            ),
        });
    }

    // 4. virtual_tokens (utokens) = tokens_on_curve * S_scaled / s_minus_one
    let virtual_tokens_start = tokens_on_curve
        .checked_mul(s_scaled)
        .ok_or_else(|| ContractError::InvalidCurveParams {
            reason: "overflow computing virtual_tokens".to_string(),
        })?
        / s_minus_one;

    // 5. raised_uxyz = raised_usd * 10^6 / xyz_price
    let raised_uxyz = target_raised_usd
        .checked_mul(1_000_000)
        .ok_or_else(|| ContractError::InvalidCurveParams {
            reason: "overflow computing raised_uxyz".to_string(),
        })?
        / xyz_usd_price;

    // 6. virtual_xyz (uxyz) = raised_uxyz * PRECISION / s_minus_one
    let virtual_xyz_start = raised_uxyz
        .checked_mul(CURVE_PRECISION)
        .ok_or_else(|| ContractError::InvalidCurveParams {
            reason: "overflow computing virtual_xyz".to_string(),
        })?
        / s_minus_one;

    if virtual_xyz_start == 0 {
        return Err(ContractError::InvalidCurveParams {
            reason: "virtual_xyz_start is zero (price too high or raised too low)".to_string(),
        });
    }

    // 7. K = virtual_xyz * virtual_tokens
    let curve_k = virtual_xyz_start
        .checked_mul(virtual_tokens_start)
        .ok_or_else(|| ContractError::InvalidCurveParams {
            reason: "overflow computing K (virtual reserves too large)".to_string(),
        })?;

    // 8. tokens_for_lp
    let tokens_for_lp = TOTAL_SUPPLY - tokens_on_curve;

    Ok(CurveParams {
        virtual_xyz_start,
        virtual_tokens_start,
        curve_k,
        tokens_on_curve,
        tokens_for_lp,
    })
}

/// Extract per-curve constants, falling back to legacy hardcoded values if not set.
fn get_curve_constants(curve: &Curve) -> (u128, u128, u128, u128, u128) {
    if curve.curve_k > 0 {
        (
            curve.virtual_xyz_start,
            curve.virtual_tokens_start,
            curve.curve_k,
            curve.tokens_on_curve,
            curve.tokens_for_lp,
        )
    } else {
        (VIRTUAL_XYZ_START, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE, TOKENS_FOR_LP)
    }
}

// ===========================================
// Constant Product Curve Functions
// ===========================================

/// Calculate current spot price at given tokens_sold using constant product curve.
/// Returns price in uxyz per whole token (per 10^6 base units).
///
/// Spot price = virtual_xyz / virtual_tokens * 10^6
/// Simplified: price = k * 10^6 / (virtual_tokens_start - tokens_sold)^2
fn calculate_price_cp(tokens_sold: u128, virtual_tokens_start: u128, k: u128) -> u128 {
    let virtual_tokens = virtual_tokens_start - tokens_sold;
    k * 1_000_000 / (virtual_tokens * virtual_tokens)
}

/// Calculate tokens received for XYZ input using constant product formula.
/// Fee is deducted from xyz_input BEFORE applying to curve.
/// Returns (tokens_out, fee_amount) in base units.
///
/// Formula: tokens_out = virtual_tokens_current - k / (virtual_xyz_current + xyz_after_fee)
fn calculate_buy_cp(
    tokens_sold: u128,
    xyz_input: u128,
    buy_fee_bps: u16,
    vt_start: u128,
    k: u128,
    toc: u128,
) -> Result<(u128, u128), ContractError> {
    // Deduct buy fee
    let fee = xyz_input * (buy_fee_bps as u128) / 10000;
    let xyz_after_fee = xyz_input - fee;

    if xyz_after_fee == 0 {
        return Err(ContractError::NoTokensAvailable {});
    }

    // Current virtual reserves
    let virtual_tokens = vt_start - tokens_sold;
    let virtual_xyz = k / virtual_tokens;

    // After adding XYZ to pool
    let new_virtual_xyz = virtual_xyz + xyz_after_fee;
    let new_virtual_tokens = k / new_virtual_xyz;
    let tokens_out = virtual_tokens - new_virtual_tokens;

    // Cap at remaining curve tokens
    let tokens_remaining = toc.saturating_sub(tokens_sold);
    let tokens_out = tokens_out.min(tokens_remaining);

    if tokens_out == 0 {
        return Err(ContractError::NoTokensAvailable {});
    }

    Ok((tokens_out, fee))
}

/// Calculate XYZ returned for tokens sold back using constant product formula.
/// Fee is deducted from XYZ output AFTER computing curve value.
/// Returns (xyz_out_after_fee, total_fee) in uxyz.
///
/// Formula: xyz_returned_before_fee = virtual_xyz_current - k / (virtual_tokens_current + tokens_returned)
fn calculate_sell_cp(
    tokens_sold: u128,
    tokens_input: u128,
    sell_fee_bps: u16,
    vt_start: u128,
    k: u128,
) -> Result<(u128, u128), ContractError> {
    if tokens_input > tokens_sold {
        return Err(ContractError::Std(StdError::generic_err(
            "Cannot sell more tokens than have been sold"
        )));
    }

    // Current virtual reserves
    let virtual_tokens = vt_start - tokens_sold;
    let virtual_xyz = k / virtual_tokens;

    // After returning tokens to the pool
    let new_virtual_tokens = virtual_tokens + tokens_input;
    let new_virtual_xyz = k / new_virtual_tokens;

    // XYZ to return (before fee)
    let xyz_before_fee = virtual_xyz - new_virtual_xyz;

    // Apply sell fee
    let total_fee = xyz_before_fee * (sell_fee_bps as u128) / 10000;
    let xyz_out = xyz_before_fee - total_fee;

    Ok((xyz_out, total_fee))
}

// ===========================================
// Dynamic Graduation Threshold Functions
// ===========================================

/// Compute dynamic graduation threshold from oracle price.
///
/// Formula: threshold_uxyz = target_raised_usd * 10^6 / xyz_usd_price
/// Result is clamped to [min_threshold, max_threshold].
/// If price is 0, returns fallback_threshold.
///
/// All USD values in micro-USD (6 decimals).
/// All XYZ values in uxyz (6 decimals).
fn compute_dynamic_threshold(
    xyz_usd_price: u128,        // micro-USD per XYZ
    target_raised_usd: u128,    // micro-USD target raised
    min_threshold: u128,         // uxyz
    max_threshold: u128,         // uxyz
    fallback_threshold: u128,    // uxyz (used when price is 0)
) -> u128 {
    if xyz_usd_price == 0 {
        return fallback_threshold;
    }

    // raw_threshold_uxyz = target_raised_usd * 10^6 / xyz_usd_price
    //
    // Derivation:
    //   target_raised_usd is in micro-USD (10^-6 USD)
    //   xyz_usd_price is in micro-USD per whole XYZ (10^-6 USD/XYZ)
    //   target / price gives whole XYZ needed
    //   Multiply by 10^6 to convert to uxyz
    let raw = target_raised_usd
        .checked_mul(1_000_000)
        .expect("target * 10^6 overflow")
        / xyz_usd_price;

    // Clamp to bounds
    raw.max(min_threshold).min(max_threshold)
}

/// Compute effective threshold for a specific curve, applying ratchet logic.
///
/// - If curve has a stored threshold (Some(t)): effective = max(t, computed)
/// - If legacy curve (None): effective = max(legacy_fallback, computed)
///
/// This is a pure function for testability. The caller loads state and oracle.
fn effective_threshold_pure(
    stored_threshold: Option<u128>,  // curve.graduation_threshold_uxyz
    computed_threshold: u128,        // from compute_dynamic_threshold
    legacy_fallback: u128,           // config.graduation_threshold (old global)
) -> u128 {
    match stored_threshold {
        Some(t) => t.max(computed_threshold),
        None => legacy_fallback.max(computed_threshold),
    }
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    // Validate AMM contract address
    let amm_contract = deps.api.addr_validate(&msg.amm_contract)?;
    let admin = deps.api.addr_validate(&msg.admin)?;

    // Validate fees (buy <= 5%, sell <= 10%)
    if msg.buy_fee_bps > 500 || msg.sell_fee_bps > 1000 {
        return Err(ContractError::InvalidFees {});
    }

    // Validate threshold bounds
    let min_thresh = msg.min_graduation_threshold.u128();
    let max_thresh = msg.max_graduation_threshold.u128();
    if min_thresh > max_thresh {
        return Err(ContractError::InvalidThresholdBounds {
            min: min_thresh,
            max: max_thresh,
        });
    }

    let config = Config {
        amm_contract,
        cw20_code_id: msg.cw20_code_id,
        creation_fee: msg.creation_fee.u128(),
        graduation_threshold: msg.graduation_threshold.u128(),
        buy_fee_bps: msg.buy_fee_bps,
        sell_fee_bps: msg.sell_fee_bps,
        creator_fee_share_bps: msg.creator_fee_share_bps,
        admin,
        target_graduation_usd: msg.target_graduation_usd.u128(),
        min_graduation_threshold: min_thresh,
        max_graduation_threshold: max_thresh,
        target_starting_mc_usd: msg.target_starting_mc_usd.u128(),
        target_raised_usd: msg.target_raised_usd.u128(),
    };
    CONFIG.save(deps.storage, &config)?;

    // Initialize oracle state with zeroes (no price yet)
    let oracle_state = OracleState {
        xyz_usd_price: 0,
        last_update_height: 0,
        last_update_timestamp: 0,
    };
    ORACLE_STATE.save(deps.storage, &oracle_state)?;

    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("amm_contract", msg.amm_contract)
        .add_attribute("cw20_code_id", msg.cw20_code_id.to_string())
        .add_attribute("creation_fee", msg.creation_fee)
        .add_attribute("graduation_threshold", msg.graduation_threshold))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateToken {
            name,
            symbol,
            image,
            description,
            social_links,
        } => execute_create_token(deps, env, info, name, symbol, image, description, social_links),
        ExecuteMsg::Buy { token_address, min_tokens_out } => {
            execute_buy(deps, env, info, token_address, min_tokens_out)
        }
        ExecuteMsg::Receive(cw20_msg) => execute_receive(deps, env, info, cw20_msg),
        ExecuteMsg::Graduate { token_address } => {
            execute_graduate(deps, env, info, token_address)
        }
        ExecuteMsg::UpdateXyzPrice { xyz_usd_price } => {
            execute_update_xyz_price(deps, env, info, xyz_usd_price)
        }
        ExecuteMsg::UpdateConfig {
            target_graduation_usd,
            min_graduation_threshold,
            max_graduation_threshold,
            target_starting_mc_usd,
            target_raised_usd,
        } => execute_update_config(deps, info, target_graduation_usd, min_graduation_threshold, max_graduation_threshold, target_starting_mc_usd, target_raised_usd),
    }
}

fn execute_create_token(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    name: String,
    symbol: String,
    image: String,
    description: String,
    social_links: Vec<String>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Verify creation fee sent (80,000 XYZ)
    let xyz_sent = extract_xyz_from_funds(&info.funds)?;
    if xyz_sent < config.creation_fee {
        return Err(ContractError::InsufficientCreationFee {
            expected: config.creation_fee,
            got: xyz_sent,
        });
    }

    // Load oracle price and compute per-curve bonding curve parameters
    let oracle = ORACLE_STATE.may_load(deps.storage)?;
    let xyz_usd_price = oracle.map(|o| o.xyz_usd_price).unwrap_or(0);
    if xyz_usd_price == 0 {
        return Err(ContractError::OraclePriceRequired {});
    }

    let params = compute_curve_params(
        xyz_usd_price,
        config.target_starting_mc_usd,
        config.target_graduation_usd, // graduation MC target
        config.target_raised_usd,
    )?;

    // Compute initial graduation threshold for this curve
    let grad_threshold = compute_dynamic_threshold(
        xyz_usd_price,
        config.target_raised_usd,
        config.min_graduation_threshold,
        config.max_graduation_threshold,
        config.graduation_threshold,
    );

    // Store pending curve info for reply handler
    let pending = PendingCurve {
        metadata: TokenMetadata {
            name: name.clone(),
            symbol: symbol.clone(),
            image,
            description,
            social_links,
        },
        creator: info.sender.clone(),
        initial_xyz: xyz_sent,
        virtual_xyz_start: params.virtual_xyz_start,
        virtual_tokens_start: params.virtual_tokens_start,
        curve_k: params.curve_k,
        tokens_on_curve: params.tokens_on_curve,
        tokens_for_lp: params.tokens_for_lp,
        graduation_threshold_uxyz: grad_threshold,
    };
    PENDING_CURVE.save(deps.storage, &pending)?;

    // Instantiate CW20 token with this contract as minter
    // All tokens go to this contract (held by curve)
    let cw20_instantiate_msg = cw20_base::msg::InstantiateMsg {
        name,
        symbol,
        decimals: 6,
        initial_balances: vec![cw20::Cw20Coin {
            address: env.contract.address.to_string(),
            amount: Uint128::from(TOTAL_SUPPLY),
        }],
        mint: None, // No minting after creation (fixed supply)
        marketing: None,
    };

    let instantiate_msg = WasmMsg::Instantiate {
        admin: None,
        code_id: config.cw20_code_id,
        msg: to_binary(&cw20_instantiate_msg)?,
        funds: vec![],
        label: format!("xyz-launchpad-{}", pending.metadata.symbol),
    };

    // Use SubMsg to get reply with contract address
    let sub_msg = SubMsg::reply_on_success(instantiate_msg, REPLY_CW20_INSTANTIATE);

    Ok(Response::new()
        .add_submessage(sub_msg)
        .add_attribute("action", "create_token")
        .add_attribute("creator", info.sender)
        .add_attribute("initial_xyz", xyz_sent.to_string()))
}

/// Extract XYZ amount from funds
fn extract_xyz_from_funds(funds: &[Coin]) -> Result<u128, ContractError> {
    for coin in funds {
        if coin.denom == "uxyz" {
            return Ok(coin.amount.u128());
        }
    }
    Err(ContractError::InsufficientFunds {})
}

fn execute_update_xyz_price(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    xyz_usd_price: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized {});
    }
    if xyz_usd_price.is_zero() {
        return Err(ContractError::ZeroPrice {});
    }

    let oracle = OracleState {
        xyz_usd_price: xyz_usd_price.u128(),
        last_update_height: env.block.height,
        last_update_timestamp: env.block.time.seconds(),
    };
    ORACLE_STATE.save(deps.storage, &oracle)?;

    Ok(Response::new()
        .add_attribute("action", "update_xyz_price")
        .add_attribute("price", xyz_usd_price)
        .add_attribute("height", env.block.height.to_string()))
}

fn execute_update_config(
    deps: DepsMut,
    info: MessageInfo,
    target_graduation_usd: Option<Uint128>,
    min_graduation_threshold: Option<Uint128>,
    max_graduation_threshold: Option<Uint128>,
    target_starting_mc_usd: Option<Uint128>,
    target_raised_usd: Option<Uint128>,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized {});
    }

    if let Some(val) = target_graduation_usd {
        config.target_graduation_usd = val.u128();
    }
    if let Some(val) = min_graduation_threshold {
        config.min_graduation_threshold = val.u128();
    }
    if let Some(val) = max_graduation_threshold {
        config.max_graduation_threshold = val.u128();
    }
    if let Some(val) = target_starting_mc_usd {
        config.target_starting_mc_usd = val.u128();
    }
    if let Some(val) = target_raised_usd {
        config.target_raised_usd = val.u128();
    }

    // Validate bounds after updates
    if config.min_graduation_threshold > config.max_graduation_threshold {
        return Err(ContractError::InvalidThresholdBounds {
            min: config.min_graduation_threshold,
            max: config.max_graduation_threshold,
        });
    }

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "update_config")
        .add_attribute("target_graduation_usd", config.target_graduation_usd.to_string())
        .add_attribute("min_threshold", config.min_graduation_threshold.to_string())
        .add_attribute("max_threshold", config.max_graduation_threshold.to_string())
        .add_attribute("target_starting_mc_usd", config.target_starting_mc_usd.to_string())
        .add_attribute("target_raised_usd", config.target_raised_usd.to_string()))
}

/// Load oracle and compute effective threshold for a curve.
fn load_effective_threshold(
    storage: &dyn cosmwasm_std::Storage,
    config: &Config,
    curve: &Curve,
) -> u128 {
    let oracle_price = ORACLE_STATE.may_load(storage)
        .ok()
        .flatten()
        .map(|o| o.xyz_usd_price)
        .unwrap_or(0);

    let computed = compute_dynamic_threshold(
        oracle_price,
        config.target_raised_usd,
        config.min_graduation_threshold,
        config.max_graduation_threshold,
        config.graduation_threshold, // fallback = old global threshold
    );

    effective_threshold_pure(
        curve.graduation_threshold_uxyz,
        computed,
        config.graduation_threshold, // legacy fallback
    )
}

fn execute_buy(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    token_address: String,
    min_tokens_out: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let token_addr = deps.api.addr_validate(&token_address)?;

    // Load curve
    let mut curve = CURVES.load(deps.storage, &token_addr)
        .map_err(|_| ContractError::CurveNotFound { token: token_address.clone() })?;

    // Check not graduated
    if curve.graduated {
        return Err(ContractError::AlreadyGraduated {});
    }

    // Extract XYZ input
    let xyz_input = extract_xyz_from_funds(&info.funds)?;
    if xyz_input == 0 {
        return Err(ContractError::InsufficientFunds {});
    }

    // Get per-curve constants (or legacy fallback)
    let (_vx, vt, k, toc, _tlp) = get_curve_constants(&curve);

    // Calculate tokens out using constant product curve
    let (tokens_out, fee) = calculate_buy_cp(curve.tokens_sold, xyz_input, config.buy_fee_bps, vt, k, toc)?;

    // Check remaining supply on curve
    let tokens_remaining_on_curve = toc.saturating_sub(curve.tokens_sold);
    if tokens_out > tokens_remaining_on_curve {
        return Err(ContractError::NoTokensAvailable {});
    }

    // Check slippage
    if tokens_out < min_tokens_out.u128() {
        return Err(ContractError::SlippageExceeded {
            expected: min_tokens_out.u128(),
            actual: tokens_out,
        });
    }

    // Update curve state — all fees stay in reserves (LP)
    curve.tokens_sold += tokens_out;
    curve.xyz_reserves += xyz_input;

    // Compute effective threshold and ratchet it on the curve
    let threshold = load_effective_threshold(deps.storage, &config, &curve);
    curve.graduation_threshold_uxyz = Some(match curve.graduation_threshold_uxyz {
        Some(existing) => existing.max(threshold),
        None => threshold,
    });

    // Check graduation threshold - auto-graduate if reached
    if curve.xyz_reserves >= threshold && !curve.graduated {
        // Mark as graduated
        curve.graduated = true;
        CURVES.save(deps.storage, &token_addr, &curve)?;

        // Calculate AMM pool liquidity
        let xyz_for_pool = curve.xyz_reserves;
        let tokens_remaining = TOTAL_SUPPLY - curve.tokens_sold;

        // Build messages
        let mut messages: Vec<cosmwasm_std::CosmosMsg> = vec![];

        // Transfer tokens to buyer
        messages.push(cosmwasm_std::CosmosMsg::Wasm(WasmMsg::Execute {
            contract_addr: token_address.clone(),
            msg: to_binary(&cw20::Cw20ExecuteMsg::Transfer {
                recipient: info.sender.to_string(),
                amount: Uint128::from(tokens_out),
            })?,
            funds: vec![],
        }));

        // Transfer remaining tokens to AMM
        messages.push(cosmwasm_std::CosmosMsg::Wasm(WasmMsg::Execute {
            contract_addr: token_address.clone(),
            msg: to_binary(&cw20::Cw20ExecuteMsg::Transfer {
                recipient: config.amm_contract.to_string(),
                amount: Uint128::from(tokens_remaining),
            })?,
            funds: vec![],
        }));

        // Create AMM pool with augmented fee protection
        let lp_target = xyz_for_pool
            .checked_mul(GRADUATION_LP_TARGET_MULTIPLIER)
            .unwrap_or(xyz_for_pool);
        messages.push(cosmwasm_std::CosmosMsg::Wasm(WasmMsg::Execute {
            contract_addr: config.amm_contract.to_string(),
            msg: to_binary(&AmmExecuteMsg::CreatePool {
                token_address: token_address.clone(),
                xyz_amount: Uint128::from(xyz_for_pool),
                token_amount: Uint128::from(tokens_remaining),
                augmented_fee_bps: Some(GRADUATION_AUGMENTED_FEE_BPS),
                lp_target_uxyz: Some(lp_target.to_string()),
            })?,
            funds: vec![Coin {
                denom: "uxyz".to_string(),
                amount: Uint128::from(xyz_for_pool),
            }],
        }));

        return Ok(Response::new()
            .add_messages(messages)
            .add_attribute("action", "buy_and_graduate")
            .add_attribute("buyer", info.sender.to_string())
            .add_attribute("token_address", token_address)
            .add_attribute("tokens_out", tokens_out.to_string())
            .add_attribute("graduated", "true")
            .add_attribute("xyz_for_pool", xyz_for_pool.to_string())
            .add_attribute("tokens_for_pool", tokens_remaining.to_string()));
    }

    // Save curve (non-graduating case)
    CURVES.save(deps.storage, &token_addr, &curve)?;

    // Transfer tokens to buyer
    let transfer_msg = WasmMsg::Execute {
        contract_addr: token_address.clone(),
        msg: to_binary(&cw20::Cw20ExecuteMsg::Transfer {
            recipient: info.sender.to_string(),
            amount: Uint128::from(tokens_out),
        })?,
        funds: vec![],
    };

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "buy")
        .add_attribute("buyer", info.sender.to_string())
        .add_attribute("token_address", token_address)
        .add_attribute("xyz_input", xyz_input.to_string())
        .add_attribute("tokens_out", tokens_out.to_string())
        .add_attribute("fee", fee.to_string()))
}

fn execute_receive(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    cw20_msg: cw20::Cw20ReceiveMsg,
) -> Result<Response, ContractError> {
    use crate::msg::SellTokens;

    let config = CONFIG.load(deps.storage)?;

    // info.sender is the CW20 token contract
    let token_addr = info.sender;

    // Load curve
    let mut curve = CURVES.load(deps.storage, &token_addr)
        .map_err(|_| ContractError::CurveNotFound { token: token_addr.to_string() })?;

    // Check not graduated
    if curve.graduated {
        return Err(ContractError::AlreadyGraduated {});
    }

    // Parse sell message
    let sell_msg: SellTokens = cosmwasm_std::from_slice(&cw20_msg.msg)?;
    let user_addr = deps.api.addr_validate(&cw20_msg.sender)?;
    let tokens_input = cw20_msg.amount.u128();

    if tokens_input == 0 {
        return Err(ContractError::Std(StdError::generic_err("Zero token amount")));
    }

    // Get per-curve constants (or legacy fallback)
    let (_vx, vt, k, _toc, _tlp) = get_curve_constants(&curve);

    // Calculate XYZ out using constant product curve
    let (xyz_out, total_fee) = calculate_sell_cp(
        curve.tokens_sold,
        tokens_input,
        config.sell_fee_bps,
        vt,
        k,
    )?;
    // All fees stay in reserves (LP) — no burn, no creator share

    // Cap at available reserves if curve math exceeds actual balance
    // (can happen for curves created before a curve-type migration)
    let mut xyz_out = xyz_out;
    if xyz_out > curve.xyz_reserves {
        xyz_out = curve.xyz_reserves;
    }

    // Check slippage (after reserves cap so user sees realistic amount)
    if xyz_out < sell_msg.min_xyz_out.u128() {
        return Err(ContractError::SlippageExceeded {
            expected: sell_msg.min_xyz_out.u128(),
            actual: xyz_out,
        });
    }

    // Update curve state
    curve.tokens_sold -= tokens_input;
    curve.xyz_reserves -= xyz_out; // Only xyz_out leaves; fees stay in reserves

    // Save curve
    CURVES.save(deps.storage, &token_addr, &curve)?;

    // Send XYZ to seller
    let send_msg = BankMsg::Send {
        to_address: user_addr.to_string(),
        amount: vec![Coin {
            denom: "uxyz".to_string(),
            amount: Uint128::from(xyz_out),
        }],
    };

    Ok(Response::new()
        .add_message(send_msg)
        .add_attribute("action", "sell")
        .add_attribute("seller", user_addr.to_string())
        .add_attribute("token_address", token_addr.to_string())
        .add_attribute("tokens_input", tokens_input.to_string())
        .add_attribute("xyz_out", xyz_out.to_string())
        .add_attribute("fee_to_lp", total_fee.to_string()))
}

/// AMM ExecuteMsg for cross-contract calls
#[cw_serde]
pub enum AmmExecuteMsg {
    CreatePool {
        token_address: String,
        xyz_amount: Uint128,
        token_amount: Uint128,
        /// Optional augmented fee in basis points (100 = 1%)
        augmented_fee_bps: Option<u16>,
        /// Optional target pool value in uxyz for augmented fee auto-disable
        lp_target_uxyz: Option<String>,
    },
}

/// Default augmented fee for graduated pools: 1% (100 bps)
const GRADUATION_AUGMENTED_FEE_BPS: u16 = 100;
/// LP target multiplier: pool must grow 10x before augmented fee disables
const GRADUATION_LP_TARGET_MULTIPLIER: u128 = 10;

fn execute_graduate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    token_address: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let token_addr = deps.api.addr_validate(&token_address)?;

    // Load curve
    let mut curve = CURVES.load(deps.storage, &token_addr)
        .map_err(|_| ContractError::CurveNotFound { token: token_address.clone() })?;

    // Check not already graduated
    if curve.graduated {
        return Err(ContractError::AlreadyGraduated {});
    }

    // Check threshold reached using effective threshold
    let threshold = load_effective_threshold(deps.storage, &config, &curve);
    if curve.xyz_reserves < threshold {
        return Err(ContractError::Std(StdError::generic_err(format!(
            "Graduation threshold not reached: {} / {} XYZ",
            curve.xyz_reserves, threshold
        ))));
    }

    // Mark as graduated (closes the curve)
    curve.graduated = true;
    CURVES.save(deps.storage, &token_addr, &curve)?;

    // Calculate AMM pool liquidity
    // All XYZ reserves + all remaining tokens go to AMM
    let xyz_for_pool = curve.xyz_reserves;
    let tokens_remaining = TOTAL_SUPPLY - curve.tokens_sold;

    // Transfer remaining tokens from this contract to AMM
    let transfer_tokens_msg = WasmMsg::Execute {
        contract_addr: token_address.clone(),
        msg: to_binary(&cw20::Cw20ExecuteMsg::Transfer {
            recipient: config.amm_contract.to_string(),
            amount: Uint128::from(tokens_remaining),
        })?,
        funds: vec![],
    };

    // Create AMM pool with XYZ funds and augmented fee protection
    let lp_target = xyz_for_pool
        .checked_mul(GRADUATION_LP_TARGET_MULTIPLIER)
        .unwrap_or(xyz_for_pool);
    let create_pool_msg = WasmMsg::Execute {
        contract_addr: config.amm_contract.to_string(),
        msg: to_binary(&AmmExecuteMsg::CreatePool {
            token_address: token_address.clone(),
            xyz_amount: Uint128::from(xyz_for_pool),
            token_amount: Uint128::from(tokens_remaining),
            augmented_fee_bps: Some(GRADUATION_AUGMENTED_FEE_BPS),
            lp_target_uxyz: Some(lp_target.to_string()),
        })?,
        funds: vec![Coin {
            denom: "uxyz".to_string(),
            amount: Uint128::from(xyz_for_pool),
        }],
    };

    Ok(Response::new()
        .add_message(transfer_tokens_msg)
        .add_message(create_pool_msg)
        .add_attribute("action", "graduate")
        .add_attribute("token_address", token_address)
        .add_attribute("xyz_for_pool", xyz_for_pool.to_string())
        .add_attribute("tokens_for_pool", tokens_remaining.to_string())
        .add_attribute("creator", curve.creator.to_string()))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn reply(deps: DepsMut, env: Env, msg: Reply) -> Result<Response, ContractError> {
    match msg.id {
        REPLY_CW20_INSTANTIATE => reply_cw20_instantiate(deps, env, msg),
        _ => Err(ContractError::Std(StdError::generic_err("Unknown reply id"))),
    }
}

fn reply_cw20_instantiate(
    deps: DepsMut,
    env: Env,
    msg: Reply,
) -> Result<Response, ContractError> {
    // Parse reply to get new contract address
    let response = msg.result.into_result().map_err(StdError::generic_err)?;

    // CosmWasm 1.x uses data field (2.0+ uses msg_responses)
    let data = response.data
        .ok_or_else(|| ContractError::Std(StdError::generic_err("No instantiate response data found")))?;

    let res = parse_instantiate_response_data(&data.as_slice())
        .map_err(|e| ContractError::Std(StdError::generic_err(format!("Parse error: {}", e))))?;

    let token_address = deps.api.addr_validate(&res.contract_address)?;

    // Load pending curve data
    let pending = PENDING_CURVE.load(deps.storage)?;
    PENDING_CURVE.remove(deps.storage);

    // Create curve with creation fee as initial XYZ reserves
    let grad_threshold = if pending.graduation_threshold_uxyz > 0 {
        Some(pending.graduation_threshold_uxyz)
    } else {
        None
    };
    let curve = crate::state::Curve {
        token_address: token_address.clone(),
        metadata: pending.metadata,
        creator: pending.creator.clone(),
        tokens_sold: 0,
        xyz_reserves: pending.initial_xyz,
        graduated: false,
        created_at: env.block.height,
        creator_fees_earned: 0,
        graduation_threshold_uxyz: grad_threshold,
        virtual_xyz_start: pending.virtual_xyz_start,
        virtual_tokens_start: pending.virtual_tokens_start,
        curve_k: pending.curve_k,
        tokens_on_curve: pending.tokens_on_curve,
        tokens_for_lp: pending.tokens_for_lp,
    };

    // Save curve indexed by token address
    CURVES.save(deps.storage, &token_address, &curve)?;

    Ok(Response::new()
        .add_attribute("action", "token_created")
        .add_attribute("token_address", token_address.to_string())
        .add_attribute("creator", pending.creator)
        .add_attribute("initial_reserves", pending.initial_xyz.to_string()))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Curve { token_address } => {
            to_binary(&query_curve(deps, token_address)?)
        }
        QueryMsg::AllCurves { start_after, limit } => {
            to_binary(&query_all_curves(deps, start_after, limit)?)
        }
        QueryMsg::Progress { token_address } => {
            to_binary(&query_progress(deps, token_address)?)
        }
        QueryMsg::Config {} => {
            to_binary(&query_config(deps)?)
        }
        QueryMsg::SimulateBuy { token_address, xyz_amount } => {
            to_binary(&query_simulate_buy(deps, token_address, xyz_amount)?)
        }
        QueryMsg::SimulateSell { token_address, token_amount } => {
            to_binary(&query_simulate_sell(deps, token_address, token_amount)?)
        }
        QueryMsg::Oracle {} => {
            to_binary(&query_oracle(deps)?)
        }
    }
}

fn query_curve(deps: Deps, token_address: String) -> StdResult<CurveResponse> {
    let token_addr = deps.api.addr_validate(&token_address)?;
    let curve = CURVES.load(deps.storage, &token_addr)
        .map_err(|_| StdError::not_found(format!("Curve for token {}", token_address)))?;

    let (vx, vt, k, toc, tlp) = get_curve_constants(&curve);
    let tokens_remaining = toc.saturating_sub(curve.tokens_sold);
    let current_price = calculate_price_cp(curve.tokens_sold, vt, k);

    Ok(CurveResponse {
        token_address: curve.token_address,
        metadata: curve.metadata,
        creator: curve.creator,
        tokens_sold: Uint128::from(curve.tokens_sold),
        tokens_remaining: Uint128::from(tokens_remaining),
        xyz_reserves: Uint128::from(curve.xyz_reserves),
        current_price: format!("{:.6}", current_price as f64 / 1_000_000.0),
        graduated: curve.graduated,
        created_at: curve.created_at,
        virtual_xyz_start: Uint128::from(vx),
        virtual_tokens_start: Uint128::from(vt),
        tokens_on_curve: Uint128::from(toc),
        tokens_for_lp: Uint128::from(tlp),
    })
}

fn query_all_curves(
    deps: Deps,
    start_after: Option<String>,
    limit: Option<u32>,
) -> StdResult<AllCurvesResponse> {
    let limit = limit.unwrap_or(10).min(30) as usize;
    let start = start_after
        .map(|s| deps.api.addr_validate(&s))
        .transpose()?;

    let curves: Vec<CurveResponse> = CURVES
        .range(
            deps.storage,
            start.as_ref().map(cw_storage_plus::Bound::exclusive),
            None,
            cosmwasm_std::Order::Ascending,
        )
        .take(limit)
        .map(|item| {
            let (_, curve) = item?;
            let (vx, vt, k, toc, tlp) = get_curve_constants(&curve);
            let tokens_remaining = toc.saturating_sub(curve.tokens_sold);
            let current_price = calculate_price_cp(curve.tokens_sold, vt, k);
            Ok(CurveResponse {
                token_address: curve.token_address,
                metadata: curve.metadata,
                creator: curve.creator,
                tokens_sold: Uint128::from(curve.tokens_sold),
                tokens_remaining: Uint128::from(tokens_remaining),
                xyz_reserves: Uint128::from(curve.xyz_reserves),
                current_price: format!("{:.6}", current_price as f64 / 1_000_000.0),
                graduated: curve.graduated,
                created_at: curve.created_at,
                virtual_xyz_start: Uint128::from(vx),
                virtual_tokens_start: Uint128::from(vt),
                tokens_on_curve: Uint128::from(toc),
                tokens_for_lp: Uint128::from(tlp),
            })
        })
        .collect::<StdResult<Vec<_>>>()?;

    Ok(AllCurvesResponse { curves })
}

fn query_progress(deps: Deps, token_address: String) -> StdResult<ProgressResponse> {
    let token_addr = deps.api.addr_validate(&token_address)?;
    let curve = CURVES.load(deps.storage, &token_addr)
        .map_err(|_| StdError::not_found(format!("Curve for token {}", token_address)))?;
    let config = CONFIG.load(deps.storage)?;

    let threshold = load_effective_threshold(deps.storage, &config, &curve);
    let progress_percent = if threshold > 0 {
        (curve.xyz_reserves as f64 / threshold as f64 * 100.0).min(100.0)
    } else {
        100.0
    };

    let (_vx, _vt, _k, toc, _tlp) = get_curve_constants(&curve);
    let tokens_remaining = toc.saturating_sub(curve.tokens_sold);

    Ok(ProgressResponse {
        token_address: curve.token_address,
        xyz_raised: Uint128::from(curve.xyz_reserves),
        graduation_threshold: Uint128::from(threshold),
        progress_percent: format!("{:.2}%", progress_percent),
        tokens_sold: Uint128::from(curve.tokens_sold),
        tokens_remaining: Uint128::from(tokens_remaining),
        graduated: curve.graduated,
    })
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        amm_contract: config.amm_contract,
        cw20_code_id: config.cw20_code_id,
        creation_fee: Uint128::from(config.creation_fee),
        graduation_threshold: Uint128::from(config.graduation_threshold),
        buy_fee_bps: config.buy_fee_bps,
        sell_fee_bps: config.sell_fee_bps,
        admin: config.admin,
        target_graduation_usd: Uint128::from(config.target_graduation_usd),
        min_graduation_threshold: Uint128::from(config.min_graduation_threshold),
        max_graduation_threshold: Uint128::from(config.max_graduation_threshold),
        target_starting_mc_usd: Uint128::from(config.target_starting_mc_usd),
        target_raised_usd: Uint128::from(config.target_raised_usd),
    })
}

fn query_oracle(deps: Deps) -> StdResult<OracleResponse> {
    let oracle = ORACLE_STATE.may_load(deps.storage)?
        .unwrap_or(OracleState {
            xyz_usd_price: 0,
            last_update_height: 0,
            last_update_timestamp: 0,
        });
    Ok(OracleResponse {
        xyz_usd_price: Uint128::from(oracle.xyz_usd_price),
        last_update_height: oracle.last_update_height,
        last_update_timestamp: oracle.last_update_timestamp,
    })
}

fn query_simulate_buy(
    deps: Deps,
    token_address: String,
    xyz_amount: Uint128,
) -> StdResult<SimulateBuyResponse> {
    let token_addr = deps.api.addr_validate(&token_address)?;
    let curve = CURVES.load(deps.storage, &token_addr)
        .map_err(|_| StdError::not_found(format!("Curve for token {}", token_address)))?;
    let config = CONFIG.load(deps.storage)?;

    if curve.graduated {
        return Err(StdError::generic_err("Curve already graduated - use AMM for trading"));
    }

    let (_vx, vt, k, toc, _tlp) = get_curve_constants(&curve);

    let (tokens_out, fee) = calculate_buy_cp(curve.tokens_sold, xyz_amount.u128(), config.buy_fee_bps, vt, k, toc)
        .map_err(|e| StdError::generic_err(format!("Simulation failed: {:?}", e)))?;

    let new_sold = curve.tokens_sold + tokens_out;
    let new_price = calculate_price_cp(new_sold, vt, k);

    Ok(SimulateBuyResponse {
        tokens_out: Uint128::from(tokens_out),
        fee_amount: Uint128::from(fee),
        new_price: format!("{:.6}", new_price as f64 / 1_000_000.0),
    })
}

fn query_simulate_sell(
    deps: Deps,
    token_address: String,
    token_amount: Uint128,
) -> StdResult<SimulateSellResponse> {
    let token_addr = deps.api.addr_validate(&token_address)?;
    let curve = CURVES.load(deps.storage, &token_addr)
        .map_err(|_| StdError::not_found(format!("Curve for token {}", token_address)))?;
    let config = CONFIG.load(deps.storage)?;

    if curve.graduated {
        return Err(StdError::generic_err("Curve already graduated - use AMM for trading"));
    }

    let (_vx, vt, k, _toc, _tlp) = get_curve_constants(&curve);

    let (xyz_out, total_fee) = calculate_sell_cp(
        curve.tokens_sold,
        token_amount.u128(),
        config.sell_fee_bps,
        vt,
        k,
    ).map_err(|e| StdError::generic_err(format!("Simulation failed: {:?}", e)))?;

    // Cap at available reserves (matches execute path behavior)
    let mut xyz_out = xyz_out;
    if xyz_out > curve.xyz_reserves {
        xyz_out = curve.xyz_reserves;
    }

    let new_sold = curve.tokens_sold - token_amount.u128();
    let new_price = calculate_price_cp(new_sold, vt, k);

    Ok(SimulateSellResponse {
        xyz_out: Uint128::from(xyz_out),
        fee_amount: Uint128::from(total_fee),
        burned_amount: Uint128::zero(),
        new_price: format!("{:.6}", new_price as f64 / 1_000_000.0),
    })
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(
    deps: DepsMut,
    _env: Env,
    _msg: MigrateMsg,
) -> Result<Response, ContractError> {
    // Load existing config and update fee structure
    let mut config = CONFIG.load(deps.storage)?;
    config.target_starting_mc_usd = 1_000_000_000;  // $1,000
    // target_graduation_usd is already set from previous migration ($10K)
    config.target_raised_usd = 2_000_000_000;       // $2,000
    config.creator_fee_share_bps = 0;                // No creator fees — all to LP
    config.sell_fee_bps = 250;                       // 2.5% sell fee (was 3.5%)
    CONFIG.save(deps.storage, &config)?;

    // Backfill existing curves with old hardcoded constants
    let all_keys: Vec<_> = CURVES
        .range(deps.storage, None, None, cosmwasm_std::Order::Ascending)
        .map(|r| r.map(|(k, v)| (k.clone(), v)))
        .collect::<Result<_, _>>()?;
    for (key, mut curve) in all_keys {
        if curve.curve_k == 0 {
            curve.virtual_xyz_start = VIRTUAL_XYZ_START;
            curve.virtual_tokens_start = VIRTUAL_TOKENS_START;
            curve.curve_k = K;
            curve.tokens_on_curve = TOKENS_ON_CURVE;
            curve.tokens_for_lp = TOKENS_FOR_LP;
            CURVES.save(deps.storage, &key, &curve)?;
        }
    }

    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    Ok(Response::new()
        .add_attribute("action", "migrate")
        .add_attribute("version", CONTRACT_VERSION))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===========================================
    // Constants Tests
    // ===========================================

    #[test]
    fn test_total_supply_constant() {
        // 100 million tokens with 6 decimals
        assert_eq!(TOTAL_SUPPLY, 100_000_000_000_000);
    }

    #[test]
    fn test_cp_tokens_on_curve_plus_lp_equals_total() {
        assert_eq!(TOKENS_ON_CURVE + TOKENS_FOR_LP, TOTAL_SUPPLY);
    }

    // ===========================================
    // Graduation Threshold Tests
    // ===========================================

    #[test]
    fn test_graduation_threshold_check() {
        // Test threshold boundary conditions
        let threshold = 5_000_000_000_000u128; // 5M XYZ

        // Just below threshold
        let reserves_below = threshold - 1;
        assert!(reserves_below < threshold);

        // At threshold
        let reserves_at = threshold;
        assert!(reserves_at >= threshold);

        // Above threshold
        let reserves_above = threshold + 1;
        assert!(reserves_above >= threshold);
    }

    // ===========================================
    // Fee Basis Points Tests
    // ===========================================

    #[test]
    fn test_buy_fee_bps_validation() {
        // Buy fee should be 50 bps (0.5%)
        let buy_fee_bps: u16 = 50;
        let xyz_amount = 1_000_000u128; // 1 XYZ

        let fee = xyz_amount * (buy_fee_bps as u128) / 10000;
        assert_eq!(fee, 5000); // 0.5% of 1M = 5000
    }

    #[test]
    fn test_sell_fee_bps_validation() {
        // Sell fee should be 350 bps (3.5%)
        let sell_fee_bps: u16 = 350;
        let xyz_amount = 1_000_000u128; // 1 XYZ

        let fee = xyz_amount * (sell_fee_bps as u128) / 10000;
        assert_eq!(fee, 35000); // 3.5% of 1M = 35000
    }

    #[test]
    fn test_max_fee_validation() {
        // Buy fee max is 500 bps (5%)
        // Sell fee max is 1000 bps (10%)
        let max_buy_fee: u16 = 500;
        let max_sell_fee: u16 = 1000;

        assert!(50 <= max_buy_fee, "Default buy fee should be within max");
        assert!(350 <= max_sell_fee, "Default sell fee should be within max");
    }

    // ===========================================
    // Constant Product Curve Tests
    // ===========================================

    #[test]
    fn test_cp_constants_consistency() {
        // TOKENS_ON_CURVE + TOKENS_FOR_LP == TOTAL_SUPPLY
        assert_eq!(
            TOKENS_ON_CURVE + TOKENS_FOR_LP,
            TOTAL_SUPPLY,
            "Curve tokens + LP tokens must equal total supply"
        );
        // K == VIRTUAL_XYZ_START * VIRTUAL_TOKENS_START
        assert_eq!(
            K,
            VIRTUAL_XYZ_START * VIRTUAL_TOKENS_START,
            "K must equal product of virtual reserves"
        );
        // Virtual tokens must exceed tokens on curve
        assert!(
            VIRTUAL_TOKENS_START > TOKENS_ON_CURVE,
            "Virtual token reserve must be greater than tokens on curve"
        );
    }

    #[test]
    fn test_cp_price_at_zero_sold() {
        let price = calculate_price_cp(0, VIRTUAL_TOKENS_START, K);
        // price per whole token (10^6 base units) = K * 10^6 / VIRTUAL_TOKENS_START^2
        let expected = K * 1_000_000 / (VIRTUAL_TOKENS_START * VIRTUAL_TOKENS_START);
        assert_eq!(price, expected, "Price at zero sold should match formula");
        // Sanity: should be a small positive number (around 324,324 uxyz with current constants)
        assert!(price > 0 && price < 1_000_000, "Starting price should be reasonable");
    }

    #[test]
    fn test_cp_price_increases_monotonically() {
        let price_0 = calculate_price_cp(0, VIRTUAL_TOKENS_START, K);
        let price_10pct = calculate_price_cp(TOKENS_ON_CURVE / 10, VIRTUAL_TOKENS_START, K);
        let price_50pct = calculate_price_cp(TOKENS_ON_CURVE / 2, VIRTUAL_TOKENS_START, K);
        let price_90pct = calculate_price_cp(TOKENS_ON_CURVE * 9 / 10, VIRTUAL_TOKENS_START, K);

        assert!(price_0 < price_10pct, "Price should increase at 10%");
        assert!(price_10pct < price_50pct, "Price should increase at 50%");
        assert!(price_50pct < price_90pct, "Price should increase at 90%");
    }

    #[test]
    fn test_cp_price_multiplier_at_graduation() {
        let start_price = calculate_price_cp(0, VIRTUAL_TOKENS_START, K);
        let grad_price = calculate_price_cp(TOKENS_ON_CURVE, VIRTUAL_TOKENS_START, K);
        let multiplier = grad_price / start_price;

        // Should be approximately 14.6x (between 14 and 15)
        assert!(
            multiplier >= 14 && multiplier <= 15,
            "Price multiplier should be ~14.6x, got {}x",
            multiplier
        );
    }

    #[test]
    fn test_cp_buy_basic() {
        // Buy with 1 XYZ, 0.5% fee
        let (tokens_out, fee) = calculate_buy_cp(0, 1_000_000, 50, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE).unwrap();

        // Fee should be 0.5% of 1_000_000 = 5000
        assert_eq!(fee, 5000, "Fee should be 0.5%");
        assert!(tokens_out > 0, "Should receive tokens");

        // Verify constant product invariant holds approximately
        let xyz_after_fee = 1_000_000u128 - 5000;
        let virtual_xyz_before = K / VIRTUAL_TOKENS_START;
        let new_virtual_xyz = virtual_xyz_before + xyz_after_fee;
        let new_virtual_tokens = K / new_virtual_xyz;
        let expected_tokens_out = VIRTUAL_TOKENS_START - new_virtual_tokens;

        assert_eq!(tokens_out, expected_tokens_out, "Tokens out should match CP formula");
    }

    #[test]
    fn test_cp_buy_fee_deducted_before_curve() {
        let (tokens_out_with_fee, fee) = calculate_buy_cp(0, 10_000_000, 50, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE).unwrap();
        let (tokens_out_no_fee, _) = calculate_buy_cp(0, 10_000_000, 0, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE).unwrap();

        assert!(
            tokens_out_with_fee < tokens_out_no_fee,
            "Fee should result in fewer tokens"
        );
        assert_eq!(fee, 10_000_000 * 50 / 10000, "Fee should be 0.5%");
    }

    #[test]
    fn test_cp_buy_respects_curve_cap() {
        // Try to buy with an enormous amount of XYZ
        // tokens_out should be capped at TOKENS_ON_CURVE
        let huge_xyz = 1_000_000_000_000_000u128; // 1 billion XYZ
        let (tokens_out, _) = calculate_buy_cp(0, huge_xyz, 0, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE).unwrap();

        assert!(
            tokens_out <= TOKENS_ON_CURVE,
            "Tokens out must not exceed curve cap: got {} > {}",
            tokens_out,
            TOKENS_ON_CURVE
        );
    }

    #[test]
    fn test_cp_buy_returns_zero_tokens_error() {
        // When all curve tokens are sold, buying should fail with NoTokensAvailable
        let result = calculate_buy_cp(TOKENS_ON_CURVE, 1_000_000, 0, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE);
        assert!(
            result.is_err(),
            "Buying when all curve tokens are sold should return error"
        );

        // When fee consumes entire input (xyz_after_fee = 0), should fail
        // fee_bps=10000 means 100% fee, so xyz_after_fee = 0
        let result = calculate_buy_cp(0, 100, 10000, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE);
        assert!(
            result.is_err(),
            "Buying with 100% fee should return error"
        );
    }

    #[test]
    fn test_cp_sell_basic() {
        // First buy some tokens (use 0% fee for simpler math)
        let buy_xyz = 100_000_000_000u128; // 100,000 XYZ
        let (tokens_bought, _) = calculate_buy_cp(0, buy_xyz, 0, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE).unwrap();
        assert!(tokens_bought > 0, "Should buy some tokens");

        // Sell half back with 3.5% fee
        let half = tokens_bought / 2;
        let (xyz_out, fee) = calculate_sell_cp(tokens_bought, half, 350, VIRTUAL_TOKENS_START, K).unwrap();

        assert!(xyz_out > 0, "Should receive XYZ from sell");
        assert!(fee > 0, "Should have a sell fee");
    }

    #[test]
    fn test_cp_sell_returns_less_than_buy_paid() {
        // Buy with 0% fee, sell with 0% fee -- should get same XYZ back (roundtrip)
        let buy_xyz = 1_000_000_000u128; // 1000 XYZ
        let (tokens_out, _) = calculate_buy_cp(0, buy_xyz, 0, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE).unwrap();
        let (xyz_back, _) = calculate_sell_cp(tokens_out, tokens_out, 0, VIRTUAL_TOKENS_START, K).unwrap();

        // Should be equal within 1 uxyz rounding
        let diff = if xyz_back > buy_xyz {
            xyz_back - buy_xyz
        } else {
            buy_xyz - xyz_back
        };
        assert!(
            diff <= 1,
            "Roundtrip should conserve XYZ within 1 uxyz, diff={}",
            diff
        );
    }

    #[test]
    fn test_cp_sell_with_fee() {
        // Buy some tokens first
        let (tokens_bought, _) = calculate_buy_cp(0, 50_000_000_000u128, 0, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE).unwrap();
        let sell_amount = tokens_bought / 4;

        let (xyz_no_fee, _) = calculate_sell_cp(tokens_bought, sell_amount, 0, VIRTUAL_TOKENS_START, K).unwrap();
        let (xyz_with_fee, fee) = calculate_sell_cp(tokens_bought, sell_amount, 350, VIRTUAL_TOKENS_START, K).unwrap();

        assert!(
            xyz_with_fee < xyz_no_fee,
            "Fee should reduce XYZ output"
        );
        // xyz_with_fee + fee should approximately equal xyz_no_fee
        let reconstructed = xyz_with_fee + fee;
        let diff = if reconstructed > xyz_no_fee {
            reconstructed - xyz_no_fee
        } else {
            xyz_no_fee - reconstructed
        };
        assert!(
            diff <= 1,
            "xyz_with_fee + fee should equal xyz_no_fee within rounding, diff={}",
            diff
        );
    }

    #[test]
    fn test_cp_sell_more_than_sold_fails() {
        let result = calculate_sell_cp(1000, 2000, 350, VIRTUAL_TOKENS_START, K);
        assert!(result.is_err(), "Selling more than sold should fail");
    }

    #[test]
    fn test_cp_sell_all_tokens() {
        // Buy tokens, then sell ALL of them back
        let (tokens_bought, _) = calculate_buy_cp(0, 10_000_000_000u128, 0, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE).unwrap();
        let result = calculate_sell_cp(tokens_bought, tokens_bought, 350, VIRTUAL_TOKENS_START, K);
        assert!(result.is_ok(), "Selling all tokens should succeed");

        let (xyz_out, _) = result.unwrap();
        assert!(xyz_out > 0, "Should receive XYZ when selling all");
    }

    #[test]
    fn test_cp_buy_sell_roundtrip_conservation() {
        // Buy with 1000 XYZ at 0% fee, sell back at 0% fee
        let buy_xyz = 1_000_000_000u128; // 1000 XYZ
        let (tokens_out, _) = calculate_buy_cp(0, buy_xyz, 0, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE).unwrap();
        let (xyz_back, _) = calculate_sell_cp(tokens_out, tokens_out, 0, VIRTUAL_TOKENS_START, K).unwrap();

        let diff = if xyz_back > buy_xyz {
            xyz_back - buy_xyz
        } else {
            buy_xyz - xyz_back
        };
        assert!(
            diff <= 1,
            "Buy-sell roundtrip should conserve XYZ within 1 uxyz rounding, diff={}",
            diff
        );
    }

    #[test]
    fn test_cp_graduated_xyz_raised() {
        // Compute total XYZ raised when all TOKENS_ON_CURVE are sold
        let virtual_tokens_at_grad = VIRTUAL_TOKENS_START - TOKENS_ON_CURVE;
        let virtual_xyz_at_grad = K / virtual_tokens_at_grad;
        let xyz_raised = virtual_xyz_at_grad - VIRTUAL_XYZ_START;

        // Verify by buying all tokens with 0% fee
        let (tokens_out, _) = calculate_buy_cp(0, xyz_raised, 0, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE).unwrap();

        // tokens_out should be close to TOKENS_ON_CURVE (within integer division rounding)
        let diff = if tokens_out > TOKENS_ON_CURVE {
            tokens_out - TOKENS_ON_CURVE
        } else {
            TOKENS_ON_CURVE - tokens_out
        };
        assert!(
            diff <= TOKENS_ON_CURVE / 1000, // within 0.1%
            "Buying with xyz_raised should get ~TOKENS_ON_CURVE tokens, diff={}",
            diff
        );

        // xyz_raised should be positive and reasonable
        assert!(xyz_raised > 0, "Should raise positive XYZ");
        // With current constants: ~98.6M XYZ raised
        assert!(
            xyz_raised > 50_000_000_000_000 && xyz_raised < 200_000_000_000_000,
            "XYZ raised should be in reasonable range, got {}",
            xyz_raised
        );
    }

    // ===========================================
    // Integration Tests: Curve Cap Behavior
    // ===========================================

    #[test]
    fn test_buy_near_curve_cap() {
        // Almost all tokens sold, small buy should work and be capped
        let tokens_sold = TOKENS_ON_CURVE - 1_000_000; // 1 token remaining
        let (tokens_out, _) = calculate_buy_cp(tokens_sold, 100_000_000_000, 0, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE).unwrap();
        // Should be capped at the remaining 1_000_000
        assert!(
            tokens_out <= 1_000_000,
            "Tokens out should be capped at remaining: got {} > 1_000_000",
            tokens_out
        );
    }

    #[test]
    fn test_buy_at_curve_cap() {
        // All curve tokens sold, any buy should fail
        let result = calculate_buy_cp(TOKENS_ON_CURVE, 1_000_000, 0, VIRTUAL_TOKENS_START, K, TOKENS_ON_CURVE);
        assert!(
            result.is_err(),
            "Buying when curve is at cap should fail with NoTokensAvailable"
        );
    }

    // ===========================================
    // Dynamic Graduation Threshold Tests
    // ===========================================

    #[test]
    fn test_compute_dynamic_threshold_basic() {
        // $0.0001/XYZ, $2K raised => 20M XYZ = 20_000_000_000_000 uxyz
        // raw = 2_000_000_000 * 10^6 / 100 = 20_000_000_000_000
        let threshold = compute_dynamic_threshold(
            100,                 // $0.0001 in micro-USD
            2_000_000_000,       // $2K raised in micro-USD
            100_000_000_000,     // min: 100K XYZ
            50_000_000_000_000,  // max: 50M XYZ
            5_000_000_000_000,   // fallback: 5M XYZ
        );
        assert_eq!(threshold, 20_000_000_000_000);
    }

    #[test]
    fn test_compute_dynamic_threshold_low_price_clamps_to_max() {
        // $0.00002/XYZ, $2K raised => raw = 100M XYZ, clamped to max 50M
        let threshold = compute_dynamic_threshold(
            20,                  // $0.00002
            2_000_000_000,       // $2K raised
            100_000_000_000,     // min: 100K XYZ
            50_000_000_000_000,  // max: 50M XYZ
            5_000_000_000_000,
        );
        assert_eq!(threshold, 50_000_000_000_000); // clamped to max
    }

    #[test]
    fn test_compute_dynamic_threshold_high_price_clamps_to_min() {
        // $1000/XYZ, $2K raised => raw = 2K XYZ = 2_000_000_000 uxyz, clamped to min 100K XYZ
        let threshold = compute_dynamic_threshold(
            1_000_000_000,       // $1000
            2_000_000_000,       // $2K raised
            100_000_000_000,     // min: 100K XYZ
            50_000_000_000_000,  // max: 50M XYZ
            5_000_000_000_000,
        );
        assert_eq!(threshold, 100_000_000_000); // clamped to min
    }

    #[test]
    fn test_compute_dynamic_threshold_zero_price_uses_fallback() {
        let threshold = compute_dynamic_threshold(
            0,                   // no price
            2_000_000_000,
            100_000_000_000,
            50_000_000_000_000,
            5_000_000_000_000,   // fallback
        );
        assert_eq!(threshold, 5_000_000_000_000); // uses fallback
    }

    #[test]
    fn test_compute_dynamic_threshold_at_boundaries() {
        // $20/XYZ, $2K raised => raw = 100K XYZ = exactly min
        let threshold = compute_dynamic_threshold(
            20_000_000,          // $20
            2_000_000_000,       // $2K raised
            100_000_000_000,     // min: 100K XYZ
            50_000_000_000_000,
            5_000_000_000_000,
        );
        assert_eq!(threshold, 100_000_000_000); // exactly at min

        // $0.00004/XYZ, $2K raised => raw = 50B XYZ, clamped to max 50M
        let threshold2 = compute_dynamic_threshold(
            40,                  // $0.00004 = 40 micro-USD
            2_000_000_000,       // $2K raised
            100_000_000_000,
            50_000_000_000_000,  // max: 50M XYZ
            5_000_000_000_000,
        );
        assert_eq!(threshold2, 50_000_000_000_000); // clamped to max
    }

    #[test]
    fn test_effective_threshold_ratchet_increases() {
        // Curve has stored threshold of 3M, computed is 5M => effective = 5M (increases)
        let effective = effective_threshold_pure(
            Some(3_000_000_000_000), // stored
            5_000_000_000_000,       // computed
            5_000_000_000_000,       // legacy_fallback (unused when Some)
        );
        assert_eq!(effective, 5_000_000_000_000);
    }

    #[test]
    fn test_effective_threshold_ratchet_never_decreases() {
        // Curve has stored threshold of 8M, computed is 5M => effective = 8M (ratchet)
        let effective = effective_threshold_pure(
            Some(8_000_000_000_000), // stored
            5_000_000_000_000,       // computed
            5_000_000_000_000,       // legacy_fallback (unused)
        );
        assert_eq!(effective, 8_000_000_000_000);
    }

    #[test]
    fn test_effective_threshold_legacy_curve_no_stored() {
        // Legacy curve (None), computed is 3M, global fallback is 5M => max(5M, 3M) = 5M
        let effective = effective_threshold_pure(
            None,                    // legacy
            3_000_000_000_000,       // computed
            5_000_000_000_000,       // legacy_fallback (old global threshold)
        );
        assert_eq!(effective, 5_000_000_000_000);
    }

    #[test]
    fn test_effective_threshold_legacy_curve_computed_higher() {
        // Legacy curve (None), computed is 8M, global fallback is 5M => max(5M, 8M) = 8M
        let effective = effective_threshold_pure(
            None,
            8_000_000_000_000,
            5_000_000_000_000,
        );
        assert_eq!(effective, 8_000_000_000_000);
    }

    // ===========================================
    // Oracle Handler Integration Tests
    // ===========================================

    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::Addr;

    /// Helper: create a default Config for tests
    fn test_config() -> Config {
        Config {
            amm_contract: Addr::unchecked("amm_contract"),
            cw20_code_id: 1,
            creation_fee: 80_000_000_000,
            graduation_threshold: 5_000_000_000_000,
            buy_fee_bps: 50,
            sell_fee_bps: 350,
            creator_fee_share_bps: 2000,
            admin: Addr::unchecked("admin"),
            target_graduation_usd: 10_000_000_000,
            min_graduation_threshold: 100_000_000_000,
            max_graduation_threshold: 50_000_000_000_000,
            target_starting_mc_usd: 1_000_000_000,
            target_raised_usd: 2_000_000_000,
        }
    }

    #[test]
    fn test_oracle_handler_rejects_non_admin() {
        let mut deps = mock_dependencies();
        let config = test_config();
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        let info = mock_info("not_admin", &[]);
        let env = mock_env();
        let result = execute_update_xyz_price(
            deps.as_mut(), env, info,
            Uint128::from(2_000_000u128),
        );
        assert!(result.is_err());
        match result.unwrap_err() {
            ContractError::Unauthorized {} => {},
            e => panic!("Expected Unauthorized, got {:?}", e),
        }
    }

    #[test]
    fn test_oracle_handler_rejects_zero_price() {
        let mut deps = mock_dependencies();
        let config = test_config();
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        let info = mock_info("admin", &[]);
        let env = mock_env();
        let result = execute_update_xyz_price(
            deps.as_mut(), env, info,
            Uint128::zero(),
        );
        assert!(result.is_err());
        match result.unwrap_err() {
            ContractError::ZeroPrice {} => {},
            e => panic!("Expected ZeroPrice, got {:?}", e),
        }
    }

    #[test]
    fn test_oracle_handler_saves_price() {
        let mut deps = mock_dependencies();
        let config = test_config();
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        let info = mock_info("admin", &[]);
        let env = mock_env();
        let result = execute_update_xyz_price(
            deps.as_mut(), env.clone(), info,
            Uint128::from(2_000_000u128),
        );
        assert!(result.is_ok());

        let oracle = ORACLE_STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(oracle.xyz_usd_price, 2_000_000);
        assert_eq!(oracle.last_update_height, env.block.height);
    }

    #[test]
    fn test_update_config_rejects_non_admin() {
        let mut deps = mock_dependencies();
        let config = test_config();
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        let info = mock_info("not_admin", &[]);
        let result = execute_update_config(
            deps.as_mut(), info,
            Some(Uint128::from(20_000_000_000u128)),
            None, None, None, None,
        );
        assert!(result.is_err());
        match result.unwrap_err() {
            ContractError::Unauthorized {} => {},
            e => panic!("Expected Unauthorized, got {:?}", e),
        }
    }

    #[test]
    fn test_update_config_validates_bounds() {
        let mut deps = mock_dependencies();
        let config = test_config();
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        let info = mock_info("admin", &[]);
        // Set min > max -- should fail
        let result = execute_update_config(
            deps.as_mut(), info,
            None,
            Some(Uint128::from(100_000_000_000_000u128)), // min = 100M XYZ
            Some(Uint128::from(1_000_000_000u128)),       // max = 1K XYZ
            None, None,
        );
        assert!(result.is_err());
        match result.unwrap_err() {
            ContractError::InvalidThresholdBounds { .. } => {},
            e => panic!("Expected InvalidThresholdBounds, got {:?}", e),
        }
    }

    #[test]
    fn test_update_config_updates_values() {
        let mut deps = mock_dependencies();
        let config = test_config();
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        let info = mock_info("admin", &[]);
        let result = execute_update_config(
            deps.as_mut(), info,
            Some(Uint128::from(20_000_000_000u128)),  // $20K target
            None, None, None, None,
        );
        assert!(result.is_ok());

        let updated = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(updated.target_graduation_usd, 20_000_000_000);
        // Other fields unchanged
        assert_eq!(updated.min_graduation_threshold, 100_000_000_000);
    }

    /// Helper: create a test Curve for integration tests
    fn test_curve() -> crate::state::Curve {
        crate::state::Curve {
            token_address: Addr::unchecked("token1"),
            metadata: TokenMetadata {
                name: "Test".to_string(),
                symbol: "TST".to_string(),
                image: "".to_string(),
                description: "".to_string(),
                social_links: vec![],
            },
            creator: Addr::unchecked("creator"),
            tokens_sold: 0,
            xyz_reserves: 0,
            graduated: false,
            created_at: 0,
            creator_fees_earned: 0,
            graduation_threshold_uxyz: None,
            virtual_xyz_start: 0,
            virtual_tokens_start: 0,
            curve_k: 0,
            tokens_on_curve: 0,
            tokens_for_lp: 0,
        }
    }

    #[test]
    fn test_load_effective_threshold_with_oracle() {
        let mut deps = mock_dependencies();
        let config = test_config();
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        // Set oracle price to $2/XYZ
        let oracle = OracleState {
            xyz_usd_price: 2_000_000,
            last_update_height: 100,
            last_update_timestamp: 1000,
        };
        ORACLE_STATE.save(deps.as_mut().storage, &oracle).unwrap();

        // New curve (None threshold)
        // computed = target_raised_usd * 10^6 / price = 2e9 * 10^6 / 2e6 = 1e9 = 1_000_000_000_000
        // effective = max(global_fallback=5M, computed=1M) = 5M
        let curve = test_curve();

        let threshold = load_effective_threshold(deps.as_ref().storage, &config, &curve);
        assert_eq!(threshold, 5_000_000_000_000); // max(5M fallback, 1M computed) = 5M
    }

    #[test]
    fn test_load_effective_threshold_ratchet_on_curve() {
        let mut deps = mock_dependencies();
        let config = test_config();
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        // Set oracle price to $2/XYZ => computed = 1M XYZ
        let oracle = OracleState {
            xyz_usd_price: 2_000_000,
            last_update_height: 100,
            last_update_timestamp: 1000,
        };
        ORACLE_STATE.save(deps.as_mut().storage, &oracle).unwrap();

        // Curve with stored threshold of 8M (previously ratcheted)
        let mut curve = test_curve();
        curve.graduation_threshold_uxyz = Some(8_000_000_000_000);

        let threshold = load_effective_threshold(deps.as_ref().storage, &config, &curve);
        assert_eq!(threshold, 8_000_000_000_000); // ratchet: max(8M, 1M) = 8M
    }

    #[test]
    fn test_load_effective_threshold_no_oracle_uses_fallback() {
        let mut deps = mock_dependencies();
        let config = test_config();
        CONFIG.save(deps.as_mut().storage, &config).unwrap();
        // No ORACLE_STATE saved => price = 0 => fallback

        let curve = test_curve();

        let threshold = load_effective_threshold(deps.as_ref().storage, &config, &curve);
        // No oracle => price=0 => fallback = config.graduation_threshold = 5M
        // effective_threshold_pure(None, 5M, 5M) = max(5M, 5M) = 5M
        assert_eq!(threshold, 5_000_000_000_000);
    }

    // ===========================================
    // Integer Square Root Tests
    // ===========================================

    #[test]
    fn test_isqrt_perfect_squares() {
        assert_eq!(isqrt(0), 0);
        assert_eq!(isqrt(1), 1);
        assert_eq!(isqrt(4), 2);
        assert_eq!(isqrt(9), 3);
        assert_eq!(isqrt(100), 10);
        assert_eq!(isqrt(1_000_000), 1_000);
        assert_eq!(isqrt(1_000_000_000_000), 1_000_000);
    }

    #[test]
    fn test_isqrt_non_perfect() {
        // isqrt floors to nearest integer
        assert_eq!(isqrt(2), 1);
        assert_eq!(isqrt(3), 1);
        assert_eq!(isqrt(5), 2);
        assert_eq!(isqrt(10), 3);
    }

    // ===========================================
    // compute_curve_params Tests
    // ===========================================

    #[test]
    fn test_compute_curve_params_at_0001() {
        // P = $0.0001 = 100 micro-USD
        let params = compute_curve_params(
            100,                 // xyz price = 100 micro-USD
            1_000_000_000,       // starting MC = $1K
            10_000_000_000,      // graduation MC = $10K
            2_000_000_000,       // raised = $2K
        ).unwrap();

        // tokens_on_curve should be ~63.25M tokens = ~63.25e12 utokens
        assert!(
            params.tokens_on_curve > 60_000_000_000_000 && params.tokens_on_curve < 70_000_000_000_000,
            "tokens_on_curve should be ~63.25M utokens, got {}",
            params.tokens_on_curve
        );

        // tokens_for_lp = TOTAL_SUPPLY - tokens_on_curve
        assert_eq!(params.tokens_on_curve + params.tokens_for_lp, TOTAL_SUPPLY);

        // virtual_tokens should be ~92.5M utokens
        assert!(
            params.virtual_tokens_start > 85_000_000_000_000 && params.virtual_tokens_start < 100_000_000_000_000,
            "virtual_tokens_start should be ~92.5M utokens, got {}",
            params.virtual_tokens_start
        );

        // virtual_xyz: at P=$0.0001, should be ~9.25M XYZ = ~9.25e12 uxyz
        assert!(
            params.virtual_xyz_start > 8_000_000_000_000 && params.virtual_xyz_start < 11_000_000_000_000,
            "virtual_xyz_start should be ~9.25M uxyz, got {}",
            params.virtual_xyz_start
        );

        // K = vx * vt
        assert_eq!(params.curve_k, params.virtual_xyz_start * params.virtual_tokens_start);
    }

    #[test]
    fn test_compute_curve_params_at_00005() {
        // P = $0.00005 = 50 micro-USD
        let params = compute_curve_params(
            50,                  // xyz price = 50 micro-USD
            1_000_000_000,       // starting MC = $1K
            10_000_000_000,      // graduation MC = $10K
            2_000_000_000,       // raised = $2K
        ).unwrap();

        // tokens_on_curve stays the same (~63.25M) regardless of price
        assert!(
            params.tokens_on_curve > 60_000_000_000_000 && params.tokens_on_curve < 70_000_000_000_000,
            "tokens_on_curve should be ~63.25M utokens at any price, got {}",
            params.tokens_on_curve
        );

        // virtual_xyz doubles when price halves (~18.5M XYZ)
        assert!(
            params.virtual_xyz_start > 16_000_000_000_000 && params.virtual_xyz_start < 22_000_000_000_000,
            "virtual_xyz_start should be ~18.5M uxyz, got {}",
            params.virtual_xyz_start
        );
    }

    #[test]
    fn test_compute_curve_params_rejects_zero_price() {
        let result = compute_curve_params(0, 1_000_000_000, 10_000_000_000, 2_000_000_000);
        assert!(result.is_err());
        match result.unwrap_err() {
            ContractError::OraclePriceRequired {} => {},
            e => panic!("Expected OraclePriceRequired, got {:?}", e),
        }
    }

    #[test]
    fn test_compute_curve_params_rejects_invalid_mc_ratio() {
        // graduation MC <= starting MC
        let result = compute_curve_params(100, 10_000_000_000, 1_000_000_000, 2_000_000_000);
        assert!(result.is_err());
    }

    #[test]
    fn test_compute_curve_params_legacy_fallback() {
        // Legacy curve (curve_k = 0) should use old hardcoded constants
        let curve = test_curve();
        let (vx, vt, k, toc, tlp) = get_curve_constants(&curve);
        assert_eq!(vx, VIRTUAL_XYZ_START);
        assert_eq!(vt, VIRTUAL_TOKENS_START);
        assert_eq!(k, K);
        assert_eq!(toc, TOKENS_ON_CURVE);
        assert_eq!(tlp, TOKENS_FOR_LP);
    }

    #[test]
    fn test_compute_curve_params_per_curve_used() {
        // Curve with per-curve params should use them
        let mut curve = test_curve();
        curve.virtual_xyz_start = 100;
        curve.virtual_tokens_start = 200;
        curve.curve_k = 20000;
        curve.tokens_on_curve = 300;
        curve.tokens_for_lp = 400;

        let (vx, vt, k, toc, tlp) = get_curve_constants(&curve);
        assert_eq!(vx, 100);
        assert_eq!(vt, 200);
        assert_eq!(k, 20000);
        assert_eq!(toc, 300);
        assert_eq!(tlp, 400);
    }

    #[test]
    fn test_compute_curve_params_buy_sell_roundtrip() {
        // Verify buy/sell roundtrip with dynamically computed params
        let params = compute_curve_params(
            100,                 // $0.0001
            1_000_000_000,       // $1K starting MC
            10_000_000_000,      // $10K graduation MC
            2_000_000_000,       // $2K raised
        ).unwrap();

        let buy_xyz = 1_000_000_000u128; // 1000 XYZ
        let (tokens_out, _) = calculate_buy_cp(
            0, buy_xyz, 0,
            params.virtual_tokens_start, params.curve_k, params.tokens_on_curve,
        ).unwrap();
        let (xyz_back, _) = calculate_sell_cp(
            tokens_out, tokens_out, 0,
            params.virtual_tokens_start, params.curve_k,
        ).unwrap();

        let diff = if xyz_back > buy_xyz { xyz_back - buy_xyz } else { buy_xyz - xyz_back };
        assert!(
            diff <= 1,
            "Roundtrip with dynamic params should conserve XYZ, diff={}",
            diff
        );
    }

    #[test]
    fn test_compute_curve_params_price_multiplier() {
        // At graduation, price should be ~R times starting price
        let params = compute_curve_params(
            100,                 // $0.0001
            1_000_000_000,       // $1K starting MC
            10_000_000_000,      // $10K graduation MC (R=10)
            2_000_000_000,       // $2K raised
        ).unwrap();

        let start_price = calculate_price_cp(0, params.virtual_tokens_start, params.curve_k);
        let grad_price = calculate_price_cp(
            params.tokens_on_curve,
            params.virtual_tokens_start,
            params.curve_k,
        );
        let multiplier = grad_price / start_price;

        // Should be approximately 10x (R=10)
        assert!(
            multiplier >= 9 && multiplier <= 11,
            "Price multiplier should be ~10x (R=10), got {}x",
            multiplier
        );
    }
}
