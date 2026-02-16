use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized: only bonding curve contract can create pools")]
    UnauthorizedPoolCreation {},

    #[error("Pool already exists for token {token}")]
    PoolAlreadyExists { token: String },

    #[error("Pool not found for token {token}")]
    PoolNotFound { token: String },

    #[error("Insufficient liquidity in pool")]
    InsufficientLiquidity {},

    #[error("Slippage exceeded: expected minimum {expected}, got {actual}")]
    SlippageExceeded { expected: u128, actual: u128 },

    #[error("Zero amount not allowed")]
    ZeroAmount {},

    #[error("Invalid token: must send CW20 or native XYZ")]
    InvalidToken {},

    #[error("Augmented fee configuration invalid: fee_bps must be > 0 and <= 500 (5%), target must be > 0")]
    AugmentedFeeInvalid {},

    #[error("Both augmented_fee_bps and lp_target_uxyz must be provided together, or neither")]
    AugmentedFeeIncomplete {},
}
