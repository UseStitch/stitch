// Vendored from https://github.com/fastrepl/hyprnote (crates/audio-utils/src/lib.rs), MIT licensed.
// Trimmed to the PCM conversion helpers and STT chunk sizing used by capture.

mod encode;
mod pcm;

pub use encode::*;
pub use pcm::*;

pub fn chunk_size_for_stt(sample_rate: u32) -> usize {
  // https://github.com/orgs/deepgram/discussions/224#discussioncomment-6234166
  const CHUNK_MS: u32 = 120;

  let samples = ((sample_rate as u64) * (CHUNK_MS as u64)) / 1000;
  samples.clamp(1024, 7168) as usize
}
