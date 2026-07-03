// Vendored from https://github.com/fastrepl/hyprnote (crates/audio-actual/src/capture/mod.rs),
// MIT licensed.

mod joiner;
mod stream;

use crate::{CaptureConfig, CaptureStream, Error};
use stream::{CaptureSide, setup_mic_stream, setup_speaker_stream};

const AEC_SAMPLE_RATE_HZ: u32 = 16_000;

pub(crate) fn open_capture(config: CaptureConfig) -> Result<CaptureStream, Error> {
  let capture_sample_rate = if config.enable_aec {
    AEC_SAMPLE_RATE_HZ
  } else {
    config.sample_rate
  };
  let capture_chunk_size = if config.enable_aec {
    hypr_audio_utils::chunk_size_for_stt(AEC_SAMPLE_RATE_HZ)
  } else {
    config.chunk_size
  };

  let mic_stream = setup_mic_stream(capture_sample_rate, capture_chunk_size, config.mic_device)?;

  std::thread::sleep(std::time::Duration::from_millis(50));

  let speaker_stream = setup_speaker_stream(capture_sample_rate, capture_chunk_size)?;

  Ok(stream::open_dual(
    capture_sample_rate,
    config.sample_rate,
    config.chunk_size,
    mic_stream,
    speaker_stream,
    config.enable_aec,
  ))
}

pub(crate) fn open_speaker_capture(
  sample_rate: u32,
  chunk_size: usize,
) -> Result<CaptureStream, Error> {
  let speaker_stream = setup_speaker_stream(sample_rate, chunk_size)?;
  Ok(stream::open_single(speaker_stream, CaptureSide::Speaker))
}

pub(crate) fn open_mic_capture(
  device: Option<String>,
  sample_rate: u32,
  chunk_size: usize,
) -> Result<CaptureStream, Error> {
  let mic_stream = setup_mic_stream(sample_rate, chunk_size, device)?;
  Ok(stream::open_single(mic_stream, CaptureSide::Mic))
}
