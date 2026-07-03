// Vendored from https://github.com/fastrepl/hyprnote (crates/resampler/src/lib.rs), MIT licensed.
// Trimmed: only the dynamic-rate chunk resampler used by capture is kept.

mod async_source;
mod driver;

pub use async_source::*;
pub use driver::RubatoChunkResampler;
pub use rubato::{
  Async, FixedAsync, Indexing, PolynomialDegree, Resampler, SincInterpolationParameters,
  SincInterpolationType, WindowFunction,
};

#[derive(thiserror::Error, Debug)]
pub enum Error {
  #[error(transparent)]
  ResampleError(#[from] rubato::ResampleError),
  #[error(transparent)]
  ResamplerConstructionError(#[from] rubato::ResamplerConstructionError),
}
