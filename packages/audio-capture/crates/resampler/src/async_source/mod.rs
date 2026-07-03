// Vendored from https://github.com/fastrepl/hyprnote (crates/resampler/src/async_source/mod.rs),
// MIT licensed. Trimmed: the legacy/static resampler variants and fixture-based tests were dropped.

mod dynamic_new;

pub use dynamic_new::*;
