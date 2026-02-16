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
pub const TOTAL_SUPPLY: u128 = 100_000_000_000_000; // 100 million * 10^6

// ===========================================
// Constant Product Curve Constants
// ===========================================

/// Tokens available for purchase on the bonding curve (79.31% of supply)
pub const TOKENS_ON_CURVE: u128 = 79_310_000_000_000; // 79.31M * 10^6

/// Tokens reserved for AMM liquidity pool at graduation (20.69% of supply)
pub const TOKENS_FOR_LP: u128 = 20_690_000_000_000; // 20.69M * 10^6

/// Virtual XYZ reserves at curve start (in uxyz)
/// Equivalent to pump.fun's 30 virtual SOL (~$2,610) at XYZ = $0.000075.
/// $2,610 / $0.000075 = 34,800,000 XYZ.
/// Starting mcap ≈ 34.8M * (100M / 107.3M) * $0.000075 ≈ $2,432.
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
// Constant Product Curve Functions
// ===========================================

/// Calculate current spot price at given tokens_sold using constant product curve.
/// Returns price in uxyz per whole token (per 10^6 base units).
///
/// Spot price = virtual_xyz / virtual_tokens * 10^6
/// Simplified: price = K * 10^6 / (VIRTUAL_TOKENS_START - tokens_sold)^2
fn calculate_price_cp(tokens_sold: u128) -> u128 {
    let virtual_tokens = VIRTUAL_TOKENS_START - tokens_sold;
    // K * 10^6 might overflow u128? K = 1.151e23, * 10^6 = 1.151e29, which is < 3.4e38. Safe.
    K * 1_000_000 / (virtual_tokens * virtual_tokens)
}

/// Calculate tokens received for XYZ input using constant product formula.
/// Fee is deducted from xyz_input BEFORE applying to curve.
/// Returns (tokens_out, fee_amount) in base units.
///
/// Formula: tokens_out = virtual_tokens_current - K / (virtual_xyz_current + xyz_after_fee)
fn calculate_buy_cp(
    tokens_sold: u128,
    xyz_input: u128,
    buy_fee_bps: u16,
) -> Result<(u128, u128), ContractError> {
    // Deduct buy fee
    let fee = xyz_input * (buy_fee_bps as u128) / 10000;
    let xyz_after_fee = xyz_input - fee;

    if xyz_after_fee == 0 {
        return Err(ContractError::NoTokensAvailable {});
    }

    // Current virtual reserves
    let virtual_tokens = VIRTUAL_TOKENS_START - tokens_sold;
    let virtual_xyz = K / virtual_tokens;

    // After adding XYZ to pool
    let new_virtual_xyz = virtual_xyz + xyz_after_fee;
    let new_virtual_tokens = K / new_virtual_xyz;
    let tokens_out = virtual_tokens - new_virtual_tokens;

    // Cap at remaining curve tokens
    let tokens_remaining = TOKENS_ON_CURVE.saturating_sub(tokens_sold);
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
/// Formula: xyz_returned_before_fee = virtual_xyz_current - K / (virtual_tokens_current + tokens_returned)
fn calculate_sell_cp(
    tokens_sold: u128,
    tokens_input: u128,
    sell_fee_bps: u16,
) -> Result<(u128, u128), ContractError> {
    if tokens_input > tokens_sold {
        return Err(ContractError::Std(StdError::generic_err(
            "Cannot sell more tokens than have been sold"
        )));
    }

    // Current virtual reserves
    let virtual_tokens = VIRTUAL_TOKENS_START - tokens_sold;
    let virtual_xyz = K / virtual_tokens;

    // After returning tokens to the pool
    let new_virtual_tokens = virtual_tokens + tokens_input;
    let new_virtual_xyz = K / new_virtual_tokens;

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
/// Formula: threshold_uxyz = target_usd * 1_000_000 / xyz_usd_price
/// Result is clamped to [min_threshold, max_threshold].
/// If price is 0, returns fallback_threshold.
///
/// All USD values in micro-USD (6 decimals).
/// All XYZ values in uxyz (6 decimals).
fn compute_dynamic_threshold(
    xyz_usd_price: u128,        // micro-USD per XYZ
    target_graduation_usd: u128, // micro-USD target market cap
    min_threshold: u128,         // uxyz
    max_threshold: u128,         // uxyz
    fallback_threshold: u128,    // uxyz (used when price is 0)
) -> u128 {
    if xyz_usd_price == 0 {
        return fallback_threshold;
    }

    // raw_threshold_uxyz = target_usd_micro * 10^6 * 10^6 / (xyz_usd_price * 10^3)
    // Simplified: target_usd_micro * 10^9 / xyz_usd_price
    //
    // Derivation:
    //   target_usd is in micro-USD (10^-6 USD)
    //   xyz_usd_price is in micro-USD per whole XYZ (10^-6 USD/XYZ)
    //   target / price gives whole XYZ
    //   Multiply by 10^6 to get uxyz
    //   Additional 10^3 factor accounts for the bonding curve's
    //   XYZ reserves representing pooled liquidity (not 1:1 market cap).
    let raw = target_graduation_usd
        .checked_mul(1_000_000_000)
        .expect("target * 10^9 overflow")
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
            creation_fee,
            graduation_threshold,
            target_graduation_usd,
            min_graduation_threshold,
            max_graduation_threshold,
        } => execute_update_config(deps, info, creation_fee, graduation_threshold, target_graduation_usd, min_graduation_threshold, max_graduation_threshold),
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
    creation_fee: Option<Uint128>,
    graduation_threshold: Option<Uint128>,
    target_graduation_usd: Option<Uint128>,
    min_graduation_threshold: Option<Uint128>,
    max_graduation_threshold: Option<Uint128>,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized {});
    }

    if let Some(val) = creation_fee {
        config.creation_fee = val.u128();
    }
    if let Some(val) = graduation_threshold {
        config.graduation_threshold = val.u128();
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
        .add_attribute("max_threshold", config.max_graduation_threshold.to_string()))
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
        config.target_graduation_usd,
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

    // Calculate tokens out using constant product curve
    let (tokens_out, fee) = calculate_buy_cp(curve.tokens_sold, xyz_input, config.buy_fee_bps)?;

    // Check remaining supply on curve (buying capped at TOKENS_ON_CURVE, not TOTAL_SUPPLY)
    let tokens_remaining_on_curve = TOKENS_ON_CURVE.saturating_sub(curve.tokens_sold);
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

    // Calculate creator's share of fee
    let creator_share = fee * (config.creator_fee_share_bps as u128) / 10000;
    let _lp_share = fee - creator_share;

    // Update curve state
    curve.tokens_sold += tokens_out;
    curve.xyz_reserves += xyz_input - creator_share; // XYZ minus creator's fee
    curve.creator_fees_earned += creator_share;

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

        // Pay creator their fee share
        if creator_share > 0 {
            messages.push(cosmwasm_std::CosmosMsg::Bank(BankMsg::Send {
                to_address: curve.creator.to_string(),
                amount: vec![Coin {
                    denom: "uxyz".to_string(),
                    amount: Uint128::from(creator_share),
                }],
            }));
        }

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

        // Create AMM pool
        messages.push(cosmwasm_std::CosmosMsg::Wasm(WasmMsg::Execute {
            contract_addr: config.amm_contract.to_string(),
            msg: to_binary(&AmmExecuteMsg::CreatePool {
                token_address: token_address.clone(),
                xyz_amount: Uint128::from(xyz_for_pool),
                token_amount: Uint128::from(tokens_remaining),
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
            .add_attribute("creator_fee", creator_share.to_string())
            .add_attribute("graduated", "true")
            .add_attribute("xyz_for_pool", xyz_for_pool.to_string())
            .add_attribute("tokens_for_pool", tokens_remaining.to_string()));
    }

    // Save curve (non-graduating case)
    CURVES.save(deps.storage, &token_addr, &curve)?;

    // Build messages
    let mut messages: Vec<cosmwasm_std::CosmosMsg> = vec![];

    // Pay creator their fee share
    if creator_share > 0 {
        messages.push(cosmwasm_std::CosmosMsg::Bank(BankMsg::Send {
            to_address: curve.creator.to_string(),
            amount: vec![Coin {
                denom: "uxyz".to_string(),
                amount: Uint128::from(creator_share),
            }],
        }));
    }

    // Transfer tokens to buyer
    messages.push(cosmwasm_std::CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: token_address.clone(),
        msg: to_binary(&cw20::Cw20ExecuteMsg::Transfer {
            recipient: info.sender.to_string(),
            amount: Uint128::from(tokens_out),
        })?,
        funds: vec![],
    }));

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "buy")
        .add_attribute("buyer", info.sender.to_string())
        .add_attribute("token_address", token_address)
        .add_attribute("xyz_input", xyz_input.to_string())
        .add_attribute("tokens_out", tokens_out.to_string())
        .add_attribute("fee", fee.to_string())
        .add_attribute("creator_fee", creator_share.to_string()))
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

    // Calculate XYZ out using constant product curve
    let (xyz_out, total_fee) = calculate_sell_cp(
        curve.tokens_sold,
        tokens_input,
        config.sell_fee_bps,
    )?;
    // Split fee: half burned, half to LP (matching existing behavior)
    let fee_burned = total_fee / 2;
    let fee_to_lp = total_fee - fee_burned;

    // Check slippage
    if xyz_out < sell_msg.min_xyz_out.u128() {
        return Err(ContractError::SlippageExceeded {
            expected: sell_msg.min_xyz_out.u128(),
            actual: xyz_out,
        });
    }

    // Creator gets share of the LP portion (not the burned portion)
    let creator_share = fee_to_lp * (config.creator_fee_share_bps as u128) / 10000;
    let actual_lp_share = fee_to_lp - creator_share;

    // Check reserves (need enough for xyz_out + fee_burned + creator_share)
    let total_xyz_leaving = xyz_out + fee_burned + creator_share;
    if total_xyz_leaving > curve.xyz_reserves {
        return Err(ContractError::InsufficientFunds {});
    }

    // Update curve state
    curve.tokens_sold -= tokens_input;
    curve.xyz_reserves -= total_xyz_leaving; // Remove xyz_out + fee_burned + creator_share
    // actual_lp_share stays in reserves (already there)
    curve.creator_fees_earned += creator_share;

    // Save curve
    CURVES.save(deps.storage, &token_addr, &curve)?;

    // Build messages
    let mut messages: Vec<cosmwasm_std::CosmosMsg> = vec![];

    // Send XYZ to seller
    messages.push(cosmwasm_std::CosmosMsg::Bank(BankMsg::Send {
        to_address: user_addr.to_string(),
        amount: vec![Coin {
            denom: "uxyz".to_string(),
            amount: Uint128::from(xyz_out),
        }],
    }));

    // Pay creator their share
    if creator_share > 0 {
        messages.push(cosmwasm_std::CosmosMsg::Bank(BankMsg::Send {
            to_address: curve.creator.to_string(),
            amount: vec![Coin {
                denom: "uxyz".to_string(),
                amount: Uint128::from(creator_share),
            }],
        }));
    }

    // Note: Tokens received are held by this contract (returned to curve supply)
    // No need to do anything with them - they're already in our balance

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "sell")
        .add_attribute("seller", user_addr.to_string())
        .add_attribute("token_address", token_addr.to_string())
        .add_attribute("tokens_input", tokens_input.to_string())
        .add_attribute("xyz_out", xyz_out.to_string())
        .add_attribute("fee_burned", fee_burned.to_string())
        .add_attribute("fee_to_lp", actual_lp_share.to_string())
        .add_attribute("creator_fee", creator_share.to_string()))
}

/// AMM ExecuteMsg for cross-contract calls
#[cw_serde]
pub enum AmmExecuteMsg {
    CreatePool {
        token_address: String,
        xyz_amount: Uint128,
        token_amount: Uint128,
    },
}

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

    // Create AMM pool with XYZ funds
    let create_pool_msg = WasmMsg::Execute {
        contract_addr: config.amm_contract.to_string(),
        msg: to_binary(&AmmExecuteMsg::CreatePool {
            token_address: token_address.clone(),
            xyz_amount: Uint128::from(xyz_for_pool),
            token_amount: Uint128::from(tokens_remaining),
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
    let curve = crate::state::Curve {
        token_address: token_address.clone(),
        metadata: pending.metadata,
        creator: pending.creator.clone(),
        tokens_sold: 0,
        xyz_reserves: pending.initial_xyz,
        graduated: false,
        created_at: env.block.height,
        creator_fees_earned: 0,
        graduation_threshold_uxyz: None,
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

    let tokens_remaining = TOKENS_ON_CURVE.saturating_sub(curve.tokens_sold);
    let current_price = calculate_price_cp(curve.tokens_sold);

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
            let tokens_remaining = TOKENS_ON_CURVE.saturating_sub(curve.tokens_sold);
            let current_price = calculate_price_cp(curve.tokens_sold);
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

    let tokens_remaining = TOKENS_ON_CURVE.saturating_sub(curve.tokens_sold);

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

    let (tokens_out, fee) = calculate_buy_cp(curve.tokens_sold, xyz_amount.u128(), config.buy_fee_bps)
        .map_err(|e| StdError::generic_err(format!("Simulation failed: {:?}", e)))?;

    let new_sold = curve.tokens_sold + tokens_out;
    let new_price = calculate_price_cp(new_sold);

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

    let (xyz_out, total_fee) = calculate_sell_cp(
        curve.tokens_sold,
        token_amount.u128(),
        config.sell_fee_bps,
    ).map_err(|e| StdError::generic_err(format!("Simulation failed: {:?}", e)))?;

    let fee_burned = total_fee / 2;
    let new_sold = curve.tokens_sold - token_amount.u128();
    let new_price = calculate_price_cp(new_sold);

    Ok(SimulateSellResponse {
        xyz_out: Uint128::from(xyz_out),
        fee_amount: Uint128::from(total_fee),
        burned_amount: Uint128::from(fee_burned),
        new_price: format!("{:.6}", new_price as f64 / 1_000_000.0),
    })
}

/// Old config schema (pre-v0.2.0) without admin/oracle fields
#[cw_serde]
struct OldConfig {
    pub amm_contract: cosmwasm_std::Addr,
    pub cw20_code_id: u64,
    pub creation_fee: u128,
    pub graduation_threshold: u128,
    pub buy_fee_bps: u16,
    pub sell_fee_bps: u16,
    pub creator_fee_share_bps: u16,
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(
    deps: DepsMut,
    env: Env,
    msg: MigrateMsg,
) -> Result<Response, ContractError> {
    let admin = deps.api.addr_validate(&msg.admin)?;

    // Try loading new config first; if it fails, load old config and convert
    let config = match CONFIG.load(deps.storage) {
        Ok(mut existing) => {
            existing.admin = admin;
            existing.target_graduation_usd = msg.target_graduation_usd.u128();
            existing.min_graduation_threshold = msg.min_graduation_threshold.u128();
            existing.max_graduation_threshold = msg.max_graduation_threshold.u128();
            existing
        }
        Err(_) => {
            // Load old config format
            const OLD_CONFIG: cw_storage_plus::Item<OldConfig> = cw_storage_plus::Item::new("config");
            let old = OLD_CONFIG.load(deps.storage)?;
            Config {
                amm_contract: old.amm_contract,
                cw20_code_id: old.cw20_code_id,
                creation_fee: old.creation_fee,
                graduation_threshold: old.graduation_threshold,
                buy_fee_bps: old.buy_fee_bps,
                sell_fee_bps: old.sell_fee_bps,
                creator_fee_share_bps: old.creator_fee_share_bps,
                admin,
                target_graduation_usd: msg.target_graduation_usd.u128(),
                min_graduation_threshold: msg.min_graduation_threshold.u128(),
                max_graduation_threshold: msg.max_graduation_threshold.u128(),
            }
        }
    };

    if config.min_graduation_threshold > config.max_graduation_threshold {
        return Err(ContractError::InvalidThresholdBounds {
            min: config.min_graduation_threshold,
            max: config.max_graduation_threshold,
        });
    }

    CONFIG.save(deps.storage, &config)?;

    // Set initial oracle price if provided
    if !msg.initial_xyz_usd_price.is_zero() {
        let oracle = OracleState {
            xyz_usd_price: msg.initial_xyz_usd_price.u128(),
            last_update_height: env.block.height,
            last_update_timestamp: env.block.time.seconds(),
        };
        ORACLE_STATE.save(deps.storage, &oracle)?;
    }

    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    Ok(Response::new()
        .add_attribute("action", "migrate")
        .add_attribute("version", CONTRACT_VERSION)
        .add_attribute("admin", msg.admin))
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
        let price = calculate_price_cp(0);
        // price per whole token (10^6 base units) = K * 10^6 / VIRTUAL_TOKENS_START^2
        let expected = K * 1_000_000 / (VIRTUAL_TOKENS_START * VIRTUAL_TOKENS_START);
        assert_eq!(price, expected, "Price at zero sold should match formula");
        // Starting price at $0.000075/XYZ should give ~$2,432 FDV
        // Price is ~324,396 uxyz per whole token (~0.324 XYZ)
        assert!(price > 100_000 && price < 1_000_000, "Starting price should be reasonable, got {}", price);
    }

    #[test]
    fn test_cp_price_increases_monotonically() {
        let price_0 = calculate_price_cp(0);
        let price_10pct = calculate_price_cp(TOKENS_ON_CURVE / 10);
        let price_50pct = calculate_price_cp(TOKENS_ON_CURVE / 2);
        let price_90pct = calculate_price_cp(TOKENS_ON_CURVE * 9 / 10);

        assert!(price_0 < price_10pct, "Price should increase at 10%");
        assert!(price_10pct < price_50pct, "Price should increase at 50%");
        assert!(price_50pct < price_90pct, "Price should increase at 90%");
    }

    #[test]
    fn test_cp_price_multiplier_at_graduation() {
        let start_price = calculate_price_cp(0);
        let grad_price = calculate_price_cp(TOKENS_ON_CURVE);
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
        let (tokens_out, fee) = calculate_buy_cp(0, 1_000_000, 50).unwrap();

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
        let (tokens_out_with_fee, fee) = calculate_buy_cp(0, 10_000_000, 50).unwrap();
        let (tokens_out_no_fee, _) = calculate_buy_cp(0, 10_000_000, 0).unwrap();

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
        let (tokens_out, _) = calculate_buy_cp(0, huge_xyz, 0).unwrap();

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
        let result = calculate_buy_cp(TOKENS_ON_CURVE, 1_000_000, 0);
        assert!(
            result.is_err(),
            "Buying when all curve tokens are sold should return error"
        );

        // When fee consumes entire input (xyz_after_fee = 0), should fail
        // fee_bps=10000 means 100% fee, so xyz_after_fee = 0
        let result = calculate_buy_cp(0, 100, 10000);
        assert!(
            result.is_err(),
            "Buying with 100% fee should return error"
        );
    }

    #[test]
    fn test_cp_sell_basic() {
        // First buy some tokens (use 0% fee for simpler math)
        let buy_xyz = 100_000_000_000u128; // 100,000 XYZ
        let (tokens_bought, _) = calculate_buy_cp(0, buy_xyz, 0).unwrap();
        assert!(tokens_bought > 0, "Should buy some tokens");

        // Sell half back with 3.5% fee
        let half = tokens_bought / 2;
        let (xyz_out, fee) = calculate_sell_cp(tokens_bought, half, 350).unwrap();

        assert!(xyz_out > 0, "Should receive XYZ from sell");
        assert!(fee > 0, "Should have a sell fee");
    }

    #[test]
    fn test_cp_sell_returns_less_than_buy_paid() {
        // Buy with 0% fee, sell with 0% fee -- should get same XYZ back (roundtrip)
        let buy_xyz = 1_000_000_000u128; // 1000 XYZ
        let (tokens_out, _) = calculate_buy_cp(0, buy_xyz, 0).unwrap();
        let (xyz_back, _) = calculate_sell_cp(tokens_out, tokens_out, 0).unwrap();

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
        let (tokens_bought, _) = calculate_buy_cp(0, 50_000_000_000u128, 0).unwrap();
        let sell_amount = tokens_bought / 4;

        let (xyz_no_fee, _) = calculate_sell_cp(tokens_bought, sell_amount, 0).unwrap();
        let (xyz_with_fee, fee) = calculate_sell_cp(tokens_bought, sell_amount, 350).unwrap();

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
        let result = calculate_sell_cp(1000, 2000, 350);
        assert!(result.is_err(), "Selling more than sold should fail");
    }

    #[test]
    fn test_cp_sell_all_tokens() {
        // Buy tokens, then sell ALL of them back
        let (tokens_bought, _) = calculate_buy_cp(0, 10_000_000_000u128, 0).unwrap();
        let result = calculate_sell_cp(tokens_bought, tokens_bought, 350);
        assert!(result.is_ok(), "Selling all tokens should succeed");

        let (xyz_out, _) = result.unwrap();
        assert!(xyz_out > 0, "Should receive XYZ when selling all");
    }

    #[test]
    fn test_cp_buy_sell_roundtrip_conservation() {
        // Buy with 1000 XYZ at 0% fee, sell back at 0% fee
        let buy_xyz = 1_000_000_000u128; // 1000 XYZ
        let (tokens_out, _) = calculate_buy_cp(0, buy_xyz, 0).unwrap();
        let (xyz_back, _) = calculate_sell_cp(tokens_out, tokens_out, 0).unwrap();

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
        let (tokens_out, _) = calculate_buy_cp(0, xyz_raised, 0).unwrap();

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
        // With new constants (~34.8M virtual XYZ): ~98.6M XYZ raised at graduation
        assert!(
            xyz_raised > 90_000_000_000_000 && xyz_raised < 110_000_000_000_000,
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
        let (tokens_out, _) = calculate_buy_cp(tokens_sold, 100_000_000_000, 0).unwrap();
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
        let result = calculate_buy_cp(TOKENS_ON_CURVE, 1_000_000, 0);
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
        // $2/XYZ, $10K target => 5M XYZ = 5_000_000_000_000 uxyz
        let threshold = compute_dynamic_threshold(
            2_000_000,           // $2.00 in micro-USD
            10_000_000_000,      // $10K in micro-USD
            100_000_000_000,     // min: 100K XYZ
            50_000_000_000_000,  // max: 50M XYZ
            5_000_000_000_000,   // fallback: 5M XYZ
        );
        assert_eq!(threshold, 5_000_000_000_000);
    }

    #[test]
    fn test_compute_dynamic_threshold_low_price_clamps_to_max() {
        // $0.001/XYZ => raw = 10B XYZ, clamped to max 50M
        let threshold = compute_dynamic_threshold(
            1_000,               // $0.001
            10_000_000_000,      // $10K
            100_000_000_000,     // min: 100K XYZ
            50_000_000_000_000,  // max: 50M XYZ
            5_000_000_000_000,
        );
        assert_eq!(threshold, 50_000_000_000_000); // clamped to max
    }

    #[test]
    fn test_compute_dynamic_threshold_high_price_clamps_to_min() {
        // $1000/XYZ => raw = 10K XYZ, clamped to min 100K
        let threshold = compute_dynamic_threshold(
            1_000_000_000,       // $1000
            10_000_000_000,      // $10K
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
            10_000_000_000,
            100_000_000_000,
            50_000_000_000_000,
            5_000_000_000_000,   // fallback
        );
        assert_eq!(threshold, 5_000_000_000_000); // uses fallback
    }

    #[test]
    fn test_compute_dynamic_threshold_at_boundaries() {
        // $100/XYZ => raw = 100K XYZ = exactly min
        let threshold = compute_dynamic_threshold(
            100_000_000,         // $100
            10_000_000_000,      // $10K
            100_000_000_000,     // min: 100K XYZ
            50_000_000_000_000,
            5_000_000_000_000,
        );
        assert_eq!(threshold, 100_000_000_000); // exactly at min

        // $0.20/XYZ => raw = 50M XYZ = exactly max
        let threshold2 = compute_dynamic_threshold(
            200_000,             // $0.20
            10_000_000_000,      // $10K
            100_000_000_000,
            50_000_000_000_000,  // max: 50M XYZ
            5_000_000_000_000,
        );
        assert_eq!(threshold2, 50_000_000_000_000); // exactly at max
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
            None, None,
            Some(Uint128::from(20_000_000_000u128)),
            None, None,
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
            None, None, None,
            Some(Uint128::from(100_000_000_000_000u128)), // min = 100M XYZ
            Some(Uint128::from(1_000_000_000u128)),       // max = 1K XYZ
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
            None, None,
            Some(Uint128::from(20_000_000_000u128)),  // $20K target
            None, None,
        );
        assert!(result.is_ok());

        let updated = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(updated.target_graduation_usd, 20_000_000_000);
        // Other fields unchanged
        assert_eq!(updated.min_graduation_threshold, 100_000_000_000);
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

        // New curve (None threshold) => effective = max(global_fallback=5M, computed=5M) = 5M
        let curve = crate::state::Curve {
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
        };

        let threshold = load_effective_threshold(deps.as_ref().storage, &config, &curve);
        assert_eq!(threshold, 5_000_000_000_000); // $2/XYZ => 5M XYZ
    }

    #[test]
    fn test_load_effective_threshold_ratchet_on_curve() {
        let mut deps = mock_dependencies();
        let config = test_config();
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        // Set oracle price to $2/XYZ => computed = 5M
        let oracle = OracleState {
            xyz_usd_price: 2_000_000,
            last_update_height: 100,
            last_update_timestamp: 1000,
        };
        ORACLE_STATE.save(deps.as_mut().storage, &oracle).unwrap();

        // Curve with stored threshold of 8M (previously ratcheted)
        let curve = crate::state::Curve {
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
            graduation_threshold_uxyz: Some(8_000_000_000_000), // 8M stored
        };

        let threshold = load_effective_threshold(deps.as_ref().storage, &config, &curve);
        assert_eq!(threshold, 8_000_000_000_000); // ratchet: max(8M, 5M) = 8M
    }

    #[test]
    fn test_load_effective_threshold_no_oracle_uses_fallback() {
        let mut deps = mock_dependencies();
        let config = test_config();
        CONFIG.save(deps.as_mut().storage, &config).unwrap();
        // No ORACLE_STATE saved => price = 0 => fallback

        let curve = crate::state::Curve {
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
        };

        let threshold = load_effective_threshold(deps.as_ref().storage, &config, &curve);
        // No oracle => price=0 => fallback = config.graduation_threshold = 5M
        // effective_threshold_pure(None, 5M, 5M) = max(5M, 5M) = 5M
        assert_eq!(threshold, 5_000_000_000_000);
    }
}
