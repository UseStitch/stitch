#[macro_use]
extern crate napi_derive;

mod encode;
mod output_resample;
mod permissions;
mod protocol;

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use hypr_audio_actual::{AudioInput, CaptureConfig, CaptureStream};
use hypr_vad_masking::VadMask;
use napi::threadsafe_function::ThreadsafeFunction;

use crate::output_resample::OutputResampler;
use crate::protocol::{
  AudioChunkEncoding, AudioChunkSource, CaptureEvent, DeviceList, Emitter, Permissions, StartInput,
  StopResult, emit_audio_chunk, emit_warning, parse_encoding,
};

const RUNTIME_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);

struct Session {
  started_at_ms: f64,
  runtime: tokio::runtime::Runtime,
  tasks: Vec<tokio::task::JoinHandle<()>>,
  warnings: Arc<Mutex<Vec<String>>>,
}

fn session_lock() -> &'static Mutex<Option<Session>> {
  static HANDLE: OnceLock<Mutex<Option<Session>>> = OnceLock::new();
  HANDLE.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> f64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("system clock must be after Unix epoch")
    .as_millis() as f64
}

fn push_warning(warnings: &Arc<Mutex<Vec<String>>>, warning: String) {
  warnings
    .lock()
    .unwrap_or_else(|e| e.into_inner())
    .push(warning);
}

/// earshot's WebRTC VAD operates on 16kHz frames; masking is bypassed at other rates.
const VAD_MASK_SAMPLE_RATE_HZ: u32 = 16_000;
/// The AEC ONNX models are trained on 16kHz mono audio.
const AEC_SAMPLE_RATE_HZ: u32 = 16_000;

fn vad_mask_for(source: AudioChunkSource, sample_rate_hz: u32) -> Option<VadMask> {
  (source == AudioChunkSource::Mic && sample_rate_hz == VAD_MASK_SAMPLE_RATE_HZ).then(VadMask::new)
}

fn emit_mic_chunk(
  emitter: &Emitter,
  vad_mask: &mut Option<VadMask>,
  samples: &[f32],
  sample_rate_hz: u32,
  encoding: AudioChunkEncoding,
) {
  if let Some(mask) = vad_mask {
    let mut masked = samples.to_vec();
    mask.process(&mut masked);
    emit_audio_chunk(
      emitter,
      AudioChunkSource::Mic,
      &masked,
      sample_rate_hz,
      encoding,
    );
  } else {
    emit_audio_chunk(
      emitter,
      AudioChunkSource::Mic,
      samples,
      sample_rate_hz,
      encoding,
    );
  }
}

/// Forwards capture frames to JS as `audioChunk` events; capture errors surface
/// as `warning` events and end the stream. Mic audio is VAD-masked (non-speech
/// frames zeroed) before emission.
fn spawn_forward_task(
  runtime: &tokio::runtime::Runtime,
  mut stream: CaptureStream,
  source: AudioChunkSource,
  sample_rate_hz: u32,
  encoding: AudioChunkEncoding,
  emitter: Emitter,
  warnings: Arc<Mutex<Vec<String>>>,
) -> tokio::task::JoinHandle<()> {
  let mut vad_mask = vad_mask_for(source, sample_rate_hz);

  runtime.spawn(async move {
    while let Some(item) = stream.next().await {
      match item {
        Ok(frame) => match source {
          AudioChunkSource::Mic => {
            emit_mic_chunk(
              &emitter,
              &mut vad_mask,
              &frame.raw_mic,
              sample_rate_hz,
              encoding,
            );
          }
          AudioChunkSource::Speaker => {
            emit_audio_chunk(
              &emitter,
              source,
              &frame.raw_speaker,
              sample_rate_hz,
              encoding,
            );
          }
        },
        Err(error) => {
          let code = error.to_string();
          push_warning(&warnings, code.clone());
          emit_warning(&emitter, code, error.to_string());
          return;
        }
      }
    }
  })
}

/// Emits samples for one source, converting from the AEC pipeline's native
/// 16kHz to the requested output rate when they differ.
fn forward_chunk(
  emitter: &Emitter,
  source: AudioChunkSource,
  samples: &[f32],
  resampler: &mut Option<OutputResampler>,
  sample_rate_hz: u32,
  encoding: AudioChunkEncoding,
) -> Result<(), hypr_resampler::Error> {
  match resampler {
    None => {
      emit_audio_chunk(emitter, source, samples, sample_rate_hz, encoding);
      Ok(())
    }
    Some(resampler) => {
      for chunk in resampler.process(samples)? {
        emit_audio_chunk(emitter, source, &chunk, sample_rate_hz, encoding);
      }
      Ok(())
    }
  }
}

/// AEC dual-stream capture plus per-source output resamplers (present when the
/// requested rate differs from the AEC's native 16kHz).
struct DualCapture {
  stream: CaptureStream,
  mic_resampler: Option<OutputResampler>,
  speaker_resampler: Option<OutputResampler>,
}

/// Forwards joined mic+speaker frames from the AEC dual-stream capture. The
/// echo-cancelled mic (falling back to raw mic if AEC is unavailable) is
/// VAD-masked at 16kHz, then both sources are resampled to the requested rate
/// before emission.
fn spawn_dual_forward_task(
  runtime: &tokio::runtime::Runtime,
  dual: DualCapture,
  sample_rate_hz: u32,
  encoding: AudioChunkEncoding,
  emitter: Emitter,
  warnings: Arc<Mutex<Vec<String>>>,
) -> tokio::task::JoinHandle<()> {
  let DualCapture {
    mut stream,
    mut mic_resampler,
    mut speaker_resampler,
  } = dual;
  // The dual pipeline always runs at 16kHz internally, so the mic can be
  // VAD-masked regardless of the requested output rate.
  let mut vad_mask = vad_mask_for(AudioChunkSource::Mic, AEC_SAMPLE_RATE_HZ);

  runtime.spawn(async move {
    while let Some(item) = stream.next().await {
      match item {
        Ok(frame) => {
          let mic = frame.preferred_mic();
          let mut masked = mic.to_vec();
          if let Some(mask) = &mut vad_mask {
            mask.process(&mut masked);
          }

          let forwarded = forward_chunk(
            &emitter,
            AudioChunkSource::Mic,
            &masked,
            &mut mic_resampler,
            sample_rate_hz,
            encoding,
          )
          .and_then(|()| {
            forward_chunk(
              &emitter,
              AudioChunkSource::Speaker,
              &frame.raw_speaker,
              &mut speaker_resampler,
              sample_rate_hz,
              encoding,
            )
          });

          if forwarded.is_err() {
            push_warning(&warnings, "aec_resample_failed".to_string());
            emit_warning(&emitter, "aec_resample_failed", "output resampling failed");
            return;
          }
        }
        Err(error) => {
          let code = error.to_string();
          push_warning(&warnings, code.clone());
          emit_warning(&emitter, code, error.to_string());
          return;
        }
      }
    }
  })
}

/// Best-effort start of the AEC dual-stream capture; any failure falls back to
/// the separate mic/speaker path with a warning. Capture always runs at the
/// AEC's native 16kHz; output is resampled to the requested rate.
fn try_start_dual_capture(
  input: &StartInput,
  emitter: &Emitter,
  warnings: &Arc<Mutex<Vec<String>>>,
) -> Option<DualCapture> {
  let aec_chunk_size = hypr_audio_utils::chunk_size_for_stt(AEC_SAMPLE_RATE_HZ);
  let output_chunk_size = hypr_audio_utils::chunk_size_for_stt(input.sample_rate_hz);

  let make_resampler = || {
    OutputResampler::for_rates(
      AEC_SAMPLE_RATE_HZ,
      input.sample_rate_hz,
      aec_chunk_size,
      output_chunk_size,
    )
  };
  let (mic_resampler, speaker_resampler) = match (make_resampler(), make_resampler()) {
    (Ok(mic), Ok(speaker)) => (mic, speaker),
    _ => {
      push_warning(warnings, "aec_start_failed".to_string());
      emit_warning(emitter, "aec_start_failed", "output resampler setup failed");
      return None;
    }
  };

  let config = CaptureConfig {
    sample_rate: AEC_SAMPLE_RATE_HZ,
    chunk_size: aec_chunk_size,
    mic_device: input.mic_device_id.clone(),
    enable_aec: true,
  };

  match catch_unwind(AssertUnwindSafe(|| {
    AudioInput::from_mic_and_speaker(config)
  })) {
    Ok(Ok(stream)) => Some(DualCapture {
      stream,
      mic_resampler,
      speaker_resampler,
    }),
    Ok(Err(error)) => {
      push_warning(warnings, "aec_start_failed".to_string());
      emit_warning(emitter, "aec_start_failed", error.to_string());
      None
    }
    Err(_) => {
      push_warning(warnings, "aec_start_failed".to_string());
      emit_warning(emitter, "aec_start_failed", "dual-stream capture panicked");
      None
    }
  }
}

#[napi]
pub fn start_capture(
  input: StartInput,
  callback: Arc<ThreadsafeFunction<CaptureEvent, ()>>,
) -> napi::Result<()> {
  let mut guard = session_lock().lock().unwrap_or_else(|e| e.into_inner());
  if guard.is_some() {
    return Err(napi::Error::from_reason(
      "audio capture is already running (already_recording)",
    ));
  }

  if input.sample_rate_hz == 0 {
    return Err(napi::Error::from_reason("sampleRateHz must be > 0"));
  }
  let encoding = parse_encoding(&input.encoding)
    .ok_or_else(|| napi::Error::from_reason(format!("unsupported encoding: {}", input.encoding)))?;

  let runtime = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .thread_name("stitch-audio-capture")
    .enable_all()
    .build()
    .map_err(|e| napi::Error::from_reason(format!("failed to create tokio runtime: {e}")))?;

  let sample_rate_hz = input.sample_rate_hz;
  let chunk_size = hypr_audio_utils::chunk_size_for_stt(sample_rate_hz);
  let emitter: Emitter = callback;
  let warnings = Arc::new(Mutex::new(Vec::new()));

  let dual_capture = if input.echo_cancellation.unwrap_or(false) {
    let _rt_guard = runtime.enter();
    try_start_dual_capture(&input, &emitter, &warnings)
  } else {
    None
  };

  if let Some(dual_capture) = dual_capture {
    let tasks = vec![spawn_dual_forward_task(
      &runtime,
      dual_capture,
      sample_rate_hz,
      encoding,
      emitter,
      warnings.clone(),
    )];

    *guard = Some(Session {
      started_at_ms: now_ms(),
      runtime,
      tasks,
      warnings,
    });

    return Ok(());
  }

  let (mic_stream, speaker_stream) = {
    let _rt_guard = runtime.enter();

    let mic_stream =
      AudioInput::from_mic_capture(input.mic_device_id.clone(), sample_rate_hz, chunk_size)
        .map_err(|e| napi::Error::from_reason(format!("mic capture failed: {e}")))?;

    // Speaker capture is best-effort; surface a warning but keep mic capture running.
    let speaker_stream = match catch_unwind(AssertUnwindSafe(|| {
      AudioInput::from_speaker_capture(sample_rate_hz, chunk_size)
    })) {
      Ok(Ok(stream)) => Some(stream),
      Ok(Err(error)) => {
        push_warning(&warnings, "speaker_start_failed".to_string());
        emit_warning(&emitter, "speaker_start_failed", error.to_string());
        None
      }
      Err(_) => {
        push_warning(&warnings, "speaker_start_failed".to_string());
        emit_warning(&emitter, "speaker_start_failed", "speaker capture panicked");
        None
      }
    };

    (mic_stream, speaker_stream)
  };

  let mut tasks = vec![spawn_forward_task(
    &runtime,
    mic_stream,
    AudioChunkSource::Mic,
    sample_rate_hz,
    encoding,
    emitter.clone(),
    warnings.clone(),
  )];
  if let Some(speaker_stream) = speaker_stream {
    tasks.push(spawn_forward_task(
      &runtime,
      speaker_stream,
      AudioChunkSource::Speaker,
      sample_rate_hz,
      encoding,
      emitter,
      warnings.clone(),
    ));
  }

  *guard = Some(Session {
    started_at_ms: now_ms(),
    runtime,
    tasks,
    warnings,
  });

  Ok(())
}

#[napi]
pub fn stop_capture(
  callback: Arc<ThreadsafeFunction<CaptureEvent, ()>>,
) -> napi::Result<Option<StopResult>> {
  let _ = callback;

  let session = {
    let mut guard = session_lock().lock().unwrap_or_else(|e| e.into_inner());
    guard.take()
  };

  let Some(session) = session else {
    return Ok(None);
  };

  for task in &session.tasks {
    task.abort();
  }
  session.runtime.shutdown_timeout(RUNTIME_SHUTDOWN_TIMEOUT);

  let ended_at = now_ms();
  let duration_ms = (ended_at - session.started_at_ms).max(0.0);
  let warnings = session
    .warnings
    .lock()
    .unwrap_or_else(|e| e.into_inner())
    .clone();

  Ok(Some(StopResult {
    ended_at,
    duration_ms,
    warnings,
  }))
}

#[napi]
pub fn list_devices() -> DeviceList {
  DeviceList {
    microphone_devices: permissions::list_microphone_devices(),
    speaker_devices: permissions::list_speaker_devices(),
  }
}

#[napi]
pub fn check_permissions() -> Permissions {
  permissions::check_permissions()
}

#[napi]
pub fn prime_system_audio() -> Permissions {
  permissions::prime_system_audio()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn vad_mask_applies_only_to_mic_at_16khz() {
    assert!(vad_mask_for(AudioChunkSource::Mic, 16_000).is_some());
    assert!(vad_mask_for(AudioChunkSource::Mic, 44_100).is_none());
    assert!(vad_mask_for(AudioChunkSource::Speaker, 16_000).is_none());
    assert!(vad_mask_for(AudioChunkSource::Speaker, 44_100).is_none());
  }
}
