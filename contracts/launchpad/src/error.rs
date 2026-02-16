use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Curve not found for token {token}")]
    CurveNotFound { token: String },

    #[error("Curve already graduated")]
    AlreadyGraduated {},

    #[error("Insufficient creation fee: expected {expected}, got {got}")]
    InsufficientCreationFee { expected: u128, got: u128 },

    #[error("Insufficient XYZ sent")]
    InsufficientFunds {},

    #[error("Slippage exceeded: expected at least {expected}, got {actual}")]
    SlippageExceeded { expected: u128, actual: u128 },

    #[error("Invalid token address")]
    InvalidToken {},

    #[error("No tokens available for sale")]
    NoTokensAvailable {},

    #[error("Token symbol already exists: {symbol}")]
    SymbolAlreadyExists { symbol: String },

    #[error("Invalid fee configuration")]
    InvalidFees {},

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Zero price not allowed")]
    ZeroPrice {},

    #[error("Invalid threshold bounds: min {min} must be <= max {max}")]
    InvalidThresholdBounds { min: u128, max: u128 },
}
