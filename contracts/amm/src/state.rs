use cosmwasm_schema::cw_serde;
use cosmwasm_std::Addr;
use cw_storage_plus::{Item, Map};

/// Global AMM configuration
#[cw_serde]
pub struct Config {
    /// Addresses authorized to create pools (bonding curve + tokenlaunch module)
    pub authorized_creators: Vec<Addr>,
    /// Swap fee in basis points (100 = 1%)
    pub swap_fee_bps: u16,
}

/// Augmented fee configuration for a pool
#[cw_serde]
pub struct AugmentedFeeConfig {
    /// Extra fee in basis points (e.g., 100 = 1%)
    pub augmented_fee_bps: u16,
    /// Target pool value in uxyz (xyz_reserve * 2) to auto-disable augmented fees
    pub lp_target_uxyz: u128,
    /// Whether augmented fees are currently active
    pub active: bool,
}

/// Individual liquidity pool
#[cw_serde]
pub struct Pool {
    /// CW20 token address (always paired with native XYZ)
    pub token_address: Addr,
    /// XYZ reserves in the pool
    pub xyz_reserve: u128,
    /// Token reserves in the pool
    pub token_reserve: u128,
    /// LP token contract address
    pub lp_token_address: Addr,
    /// Total LP tokens minted (held by this contract)
    pub lp_total_supply: u128,
    /// Optional augmented fee configuration
    pub augmented_fee: Option<AugmentedFeeConfig>,
}

pub const CONFIG: Item<Config> = Item::new("config");
/// Map from CW20 token address to Pool
pub const POOLS: Map<&Addr, Pool> = Map::new("pools");
