// Vendored and trimmed for Stitch.
// Trimmed: playback (rodio), loudness normalization, recorded-audio streaming, and the
// AudioProvider impl were dropped; only mic + system/loopback capture is kept.

mod async_ring;
mod capture;
mod mic;
mod rt_ring;
mod speaker;
mod types;

pub use mic::*;
pub use speaker::*;

pub use cpal;

pub use stitch_resampler::AsyncSource;
pub use types::{CaptureConfig, CaptureFrame, CaptureStream, Error};

pub const TAP_DEVICE_NAME: &str = "stitch-audio-tap";

pub struct AudioInput;

impl AudioInput {
  pub fn from_mic_and_speaker(config: CaptureConfig) -> Result<CaptureStream, Error> {
    capture::open_capture(config)
  }

  pub fn from_speaker_capture(sample_rate: u32, chunk_size: usize) -> Result<CaptureStream, Error> {
    capture::open_speaker_capture(sample_rate, chunk_size)
  }

  pub fn from_mic_capture(
    device: Option<String>,
    sample_rate: u32,
    chunk_size: usize,
  ) -> Result<CaptureStream, Error> {
    capture::open_mic_capture(device, sample_rate, chunk_size)
  }
}
