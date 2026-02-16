use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128};
use crate::state::TokenMetadata;

#[cw_serde]
pub struct InstantiateMsg {
    pub amm_contract: String,
    pub cw20_code_id: u64,
    pub creation_fee: Uint128,
    pub graduation_threshold: Uint128,
    pub buy_fee_bps: u16,
    pub sell_fee_bps: u16,
    pub creator_fee_share_bps: u16,
    pub admin: String,
    pub target_graduation_usd: Uint128,
    pub min_graduation_threshold: Uint128,
    pub max_graduation_threshold: Uint128,
}

#[cw_serde]
pub enum ExecuteMsg {
    /// LAUNCH-01: Create new token with bonding curve
    CreateToken {
        name: String,
        symbol: String,
        image: String,
        description: String,
        social_links: Vec<String>,
    },
    /// LAUNCH-02: Buy tokens along curve
    Buy {
        token_address: String,
        min_tokens_out: Uint128,
    },
    /// LAUNCH-03: Sell tokens back to curve
    /// Note: Uses CW20 Receive pattern (send tokens to this contract)
    Receive(cw20::Cw20ReceiveMsg),
    /// LAUNCH-04: Graduate curve to AMM (permissionless)
    /// Can be called by anyone if threshold reached
    Graduate {
        token_address: String,
    },
    /// Update XYZ/USD oracle price (admin only)
    UpdateXyzPrice {
        /// Price in micro-USD (6 decimals). $2.00 = 2_000_000
        xyz_usd_price: Uint128,
    },
    /// Update config parameters (admin only)
    UpdateConfig {
        creation_fee: Option<Uint128>,
        graduation_threshold: Option<Uint128>,
        target_graduation_usd: Option<Uint128>,
        min_graduation_threshold: Option<Uint128>,
        max_graduation_threshold: Option<Uint128>,
    },
    // Note: Reply handler is implemented in contract.rs, not as an ExecuteMsg variant
}

/// Message sent inside CW20 Send for sells
#[cw_serde]
pub struct SellTokens {
    pub min_xyz_out: Uint128,
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Get curve info for a token
    #[returns(CurveResponse)]
    Curve { token_address: String },
    /// Get all active curves
    #[returns(AllCurvesResponse)]
    AllCurves {
        start_after: Option<String>,
        limit: Option<u32>,
    },
    /// LAUNCH-07: Query progress toward graduation
    #[returns(ProgressResponse)]
    Progress { token_address: String },
    /// Get config
    #[returns(ConfigResponse)]
    Config {},
    /// Simulate buy
    #[returns(SimulateBuyResponse)]
    SimulateBuy {
        token_address: String,
        xyz_amount: Uint128,
    },
    /// Simulate sell
    #[returns(SimulateSellResponse)]
    SimulateSell {
        token_address: String,
        token_amount: Uint128,
    },
    /// Get oracle state (price, last update)
    #[returns(OracleResponse)]
    Oracle {},
}

// Response types
#[cw_serde]
pub struct CurveResponse {
    pub token_address: Addr,
    pub metadata: TokenMetadata,
    pub creator: Addr,
    pub tokens_sold: Uint128,
    pub tokens_remaining: Uint128,
    pub xyz_reserves: Uint128,
    pub current_price: String,
    pub graduated: bool,
    pub created_at: u64,
}

#[cw_serde]
pub struct AllCurvesResponse {
    pub curves: Vec<CurveResponse>,
}

#[cw_serde]
pub struct ProgressResponse {
    pub token_address: Addr,
    pub xyz_raised: Uint128,
    pub graduation_threshold: Uint128,
    pub progress_percent: String,
    pub tokens_sold: Uint128,
    pub tokens_remaining: Uint128,
    pub graduated: bool,
}

#[cw_serde]
pub struct ConfigResponse {
    pub amm_contract: Addr,
    pub cw20_code_id: u64,
    pub creation_fee: Uint128,
    pub graduation_threshold: Uint128,
    pub buy_fee_bps: u16,
    pub sell_fee_bps: u16,
    pub admin: Addr,
    pub target_graduation_usd: Uint128,
    pub min_graduation_threshold: Uint128,
    pub max_graduation_threshold: Uint128,
}

#[cw_serde]
pub struct SimulateBuyResponse {
    pub tokens_out: Uint128,
    pub fee_amount: Uint128,
    pub new_price: String,
}

#[cw_serde]
pub struct SimulateSellResponse {
    pub xyz_out: Uint128,
    pub fee_amount: Uint128,
    pub burned_amount: Uint128,
    pub new_price: String,
}

#[cw_serde]
pub struct OracleResponse {
    pub xyz_usd_price: Uint128,
    pub last_update_height: u64,
    pub last_update_timestamp: u64,
}

#[cw_serde]
pub struct MigrateMsg {
    /// Admin address for oracle/config updates
    pub admin: String,
    /// Target graduation in micro-USD (default 10_000_000_000 = $10K)
    pub target_graduation_usd: Uint128,
    /// Min threshold in uxyz (default 100_000_000_000 = 100K XYZ)
    pub min_graduation_threshold: Uint128,
    /// Max threshold in uxyz (default 50_000_000_000_000 = 50M XYZ)
    pub max_graduation_threshold: Uint128,
    /// Initial XYZ/USD price in micro-USD (optional, 0 if no price yet)
    pub initial_xyz_usd_price: Uint128,
}
