use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128};

#[cw_serde]
pub struct MigrateMsg {
    /// Add an address to authorized creators list
    pub add_authorized_creator: Option<String>,
    /// Remove an address from authorized creators list
    pub remove_authorized_creator: Option<String>,
}

#[cw_serde]
pub struct InstantiateMsg {
    /// Addresses authorized to create pools (bonding curve + tokenlaunch module)
    pub authorized_creators: Vec<String>,
    /// Swap fee in basis points (100 = 1%). Fixed globally.
    pub swap_fee_bps: u16,
}

#[cw_serde]
pub enum ExecuteMsg {
    /// Create a new pool (internal - only authorized creators)
    /// Called when a token graduates from bonding curve or by tokenlaunch module
    CreatePool {
        /// CW20 token address to create pool for
        token_address: String,
        /// Initial XYZ amount for the pool
        xyz_amount: Uint128,
        /// Initial token amount for the pool
        token_amount: Uint128,
        /// Optional augmented fee in basis points (100 = 1%)
        augmented_fee_bps: Option<u16>,
        /// Optional target pool value in uxyz (as String for Uint128 compat)
        lp_target_uxyz: Option<String>,
    },
    /// Swap XYZ for tokens or tokens for XYZ
    Swap {
        /// Token address of the pool to swap in
        token_address: String,
        /// Direction: true = XYZ->Token, false = Token->XYZ
        /// If true, send native XYZ funds with this message
        /// If false, must call CW20 Send to this contract first
        offer_xyz: bool,
        /// Minimum output amount (slippage protection)
        min_output: Uint128,
    },
    /// Receive CW20 tokens (for Token->XYZ swaps)
    Receive(cw20::Cw20ReceiveMsg),
}

/// Message sent inside CW20 Send for Token->XYZ swaps
#[cw_serde]
pub struct SwapTokenForXyz {
    /// Minimum XYZ output (slippage protection)
    pub min_output: Uint128,
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Get pool info for a token
    #[returns(PoolResponse)]
    Pool { token_address: String },

    /// Get all pools
    #[returns(AllPoolsResponse)]
    AllPools {
        start_after: Option<String>,
        limit: Option<u32>,
    },

    /// Get swap simulation (how much output for given input)
    #[returns(SimulateSwapResponse)]
    SimulateSwap {
        token_address: String,
        offer_xyz: bool,
        offer_amount: Uint128,
    },

    /// Get contract config
    #[returns(ConfigResponse)]
    Config {},

    /// Get augmented fee status for a pool
    #[returns(AugmentedFeeStatusResponse)]
    AugmentedFeeStatus { token_address: String },
}

// Response types

#[cw_serde]
pub struct PoolResponse {
    pub token_address: Addr,
    pub xyz_reserve: Uint128,
    pub token_reserve: Uint128,
    pub lp_token_address: Addr,
    pub lp_total_supply: Uint128,
    /// Current price: XYZ per token
    pub price: String,
}

#[cw_serde]
pub struct AllPoolsResponse {
    pub pools: Vec<PoolResponse>,
}

#[cw_serde]
pub struct SimulateSwapResponse {
    pub output_amount: Uint128,
    pub fee_amount: Uint128,
    pub price_impact: String,
    pub augmented_fee_amount: Uint128,
}

#[cw_serde]
pub struct ConfigResponse {
    pub authorized_creators: Vec<Addr>,
    pub swap_fee_bps: u16,
}

#[cw_serde]
pub struct AugmentedFeeStatusResponse {
    pub active: bool,
    pub augmented_fee_bps: u16,
    pub lp_target_uxyz: Uint128,
    pub current_pool_value_uxyz: Uint128,
    pub progress_percent: String,
}
