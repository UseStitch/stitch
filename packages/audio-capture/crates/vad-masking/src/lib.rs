// Vendored from https://github.com/fastrepl/hyprnote (crates/vad-masking/src/lib.rs), MIT licensed.

mod earshot;
mod masking;
mod streaming;

pub use masking::*;
pub use streaming::*;
