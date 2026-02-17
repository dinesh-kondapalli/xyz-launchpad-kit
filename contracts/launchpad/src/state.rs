use cosmwasm_schema::cw_serde;
use cosmwasm_std::Addr;
use cw_storage_plus::{Item, Map};

#[cw_serde]
pub struct Config {
    /// AMM contract address (for graduation)
    pub amm_contract: Addr,
    /// CW20 base code ID (for instantiating tokens)
    pub cw20_code_id: u64,
    /// Creation fee in uxyz (80,000 XYZ = 80_000_000_000 uxyz)
    pub creation_fee: u128,
    /// Graduation threshold in uxyz (5,000,000 XYZ = 5_000_000_000_000 uxyz)
    pub graduation_threshold: u128,
    /// Buy fee in basis points (50 = 0.5%)
    pub buy_fee_bps: u16,
    /// Sell fee in basis points (350 = 3.5%)
    pub sell_fee_bps: u16,
    /// Creator's share of fees in basis points (e.g., 2000 = 20%)
    pub creator_fee_share_bps: u16,
    /// Admin address authorized to update oracle price and config
    pub admin: Addr,
    /// Target graduation market cap in micro-USD (6 decimals). Default: $10,000 = 10_000_000_000
    pub target_graduation_usd: u128,
    /// Minimum graduation threshold in uxyz. Default: 100,000 XYZ = 100_000_000_000
    pub min_graduation_threshold: u128,
    /// Maximum graduation threshold in uxyz. Default: 50,000,000 XYZ = 50_000_000_000_000
    pub max_graduation_threshold: u128,
    /// Target starting market cap in micro-USD. Default: $1,000 = 1_000_000_000
    #[serde(default)]
    pub target_starting_mc_usd: u128,
    /// Target total USD raised to graduate in micro-USD. Default: $2,000 = 2_000_000_000
    #[serde(default)]
    pub target_raised_usd: u128,
}

#[cw_serde]
pub struct OracleState {
    /// XYZ/USD price in micro-USD (6 decimals). E.g., $2.00 = 2_000_000
    pub xyz_usd_price: u128,
    /// Block height of last price update
    pub last_update_height: u64,
    /// Timestamp (seconds) of last price update
    pub last_update_timestamp: u64,
}

#[cw_serde]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: String,
    pub image: String,
    pub description: String,
    pub social_links: Vec<String>,
}

#[cw_serde]
pub struct Curve {
    /// CW20 token address (set after instantiation)
    pub token_address: Addr,
    /// Token metadata
    pub metadata: TokenMetadata,
    /// Creator address
    pub creator: Addr,
    /// Total tokens sold (starts at 0)
    pub tokens_sold: u128,
    /// Total XYZ accumulated in reserves
    pub xyz_reserves: u128,
    /// Whether curve has graduated
    pub graduated: bool,
    /// Block height when created
    pub created_at: u64,
    /// Total fees earned by creator
    pub creator_fees_earned: u128,
    /// Per-curve graduation threshold (ratcheted -- only increases).
    /// None for legacy curves created before v2.0.
    pub graduation_threshold_uxyz: Option<u128>,
    /// Virtual XYZ reserves at curve start (uxyz). 0 = use legacy hardcoded constants.
    #[serde(default)]
    pub virtual_xyz_start: u128,
    /// Virtual token reserves at curve start (utokens). 0 = use legacy hardcoded constants.
    #[serde(default)]
    pub virtual_tokens_start: u128,
    /// Constant product invariant K = virtual_xyz * virtual_tokens.
    #[serde(default)]
    pub curve_k: u128,
    /// Tokens available for purchase on this curve (utokens).
    #[serde(default)]
    pub tokens_on_curve: u128,
    /// Tokens reserved for LP at graduation (utokens).
    #[serde(default)]
    pub tokens_for_lp: u128,
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const CURVES: Map<&Addr, Curve> = Map::new("curves");
/// Track pending token instantiation (token_addr not known yet)
pub const PENDING_CURVE: Item<PendingCurve> = Item::new("pending_curve");
pub const ORACLE_STATE: Item<OracleState> = Item::new("oracle_state");

#[cw_serde]
pub struct PendingCurve {
    pub metadata: TokenMetadata,
    pub creator: Addr,
    pub initial_xyz: u128,
    #[serde(default)]
    pub virtual_xyz_start: u128,
    #[serde(default)]
    pub virtual_tokens_start: u128,
    #[serde(default)]
    pub curve_k: u128,
    #[serde(default)]
    pub tokens_on_curve: u128,
    #[serde(default)]
    pub tokens_for_lp: u128,
    #[serde(default)]
    pub graduation_threshold_uxyz: u128,
}
