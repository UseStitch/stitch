// Vendored from https://github.com/fastrepl/hyprnote (crates/aec/src/onnx/model.rs),
// MIT licensed. Trimmed: the 256/512 model variants were dropped.

#[cfg(feature = "128")]
pub const BYTES_1: &[u8] = include_bytes!("../../data/models/model_128_1.onnx");
#[cfg(feature = "128")]
pub const BYTES_2: &[u8] = include_bytes!("../../data/models/model_128_2.onnx");
#[cfg(feature = "128")]
pub const STATE_SIZE: usize = 128;

// model already trained with these numbers.
pub const BLOCK_SIZE: usize = 512;
pub const BLOCK_SHIFT: usize = 128;
