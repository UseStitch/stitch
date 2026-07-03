// Vendored from https://github.com/fastrepl/hyprnote (crates/audio-interface/src/lib.rs), MIT licensed.
// Trimmed: the optional rodio blanket impl was dropped.

use futures_util::Stream;

pub trait AsyncSource {
  fn as_stream(&mut self) -> impl Stream<Item = f32> + '_;

  fn sample_rate(&self) -> u32;
}
