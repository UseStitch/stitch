use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender, TrySendError};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SizedSample};

use crate::error::NativeError;
use crate::output::{emit, now_ms};
use crate::protocol::{CaptureMode, CaptureStart, Event};
use crate::speaker::{spawn_speaker_capture, spawn_speaker_source};

const INPUT_QUEUE_CAPACITY: usize = 128;

fn choose_input_device(
  host: &cpal::Host,
  preferred: Option<&str>,
) -> Result<cpal::Device, NativeError> {
  if let Some(name) = preferred {
    let mut devices = host.input_devices().map_err(|error| {
      NativeError::StreamFailed(format!("failed to enumerate input devices: {error}"))
    })?;

    if let Some(device) = devices.find(|device| {
      device
        .description()
        .map(|description| description.name().to_string())
        .ok()
        .as_deref()
        == Some(name)
    }) {
      return Ok(device);
    }

    return Err(NativeError::DeviceNotFound(format!(
      "microphone device not found: {name}"
    )));
  }

  host
    .default_input_device()
    .ok_or_else(|| NativeError::DeviceNotFound("no default input device available".to_string()))
}

fn downmix_to_mono_f32<T>(data: &[T], channels: usize, convert: impl Fn(T) -> f32) -> Vec<f32>
where
  T: Copy,
{
  if channels <= 1 {
    return data.iter().copied().map(convert).collect();
  }

  let frames = data.len() / channels;
  let mut out = Vec::with_capacity(frames);
  for frame in 0..frames {
    let start = frame * channels;
    let mut acc = 0.0f32;
    for sample in &data[start..start + channels] {
      acc += convert(*sample);
    }
    out.push(acc / channels as f32);
  }
  out
}

fn build_input_stream<T>(
  device: &cpal::Device,
  config: &cpal::StreamConfig,
  tx: SyncSender<Vec<f32>>,
  stop_flag: Arc<AtomicBool>,
  convert: impl Fn(T) -> f32 + Send + 'static + Copy,
) -> Result<cpal::Stream, NativeError>
where
  T: SizedSample + Send + 'static,
{
  let channels = config.channels as usize;
  let err_handler = move |error: cpal::StreamError| {
    let _ = emit(Event::Warning {
      code: "stream_callback_error".to_string(),
      message: error.to_string(),
    });
  };

  device
    .build_input_stream(
      config,
      move |data: &[T], _| {
        if stop_flag.load(Ordering::Relaxed) {
          return;
        }

        let mono = downmix_to_mono_f32(data, channels, convert);
        match tx.try_send(mono) {
          Ok(()) => {}
          Err(TrySendError::Full(_)) => {
            let _ = emit(Event::Warning {
              code: "input_backpressure".to_string(),
              message: "input queue is full; dropping audio chunk".to_string(),
            });
          }
          Err(TrySendError::Disconnected(_)) => {}
        }
      },
      err_handler,
      None,
    )
    .map_err(|error| {
      NativeError::StreamFailed(format!("failed to build microphone stream: {error}"))
    })
}

fn write_samples_as_i16(
  writer: &mut hound::WavWriter<std::io::BufWriter<std::fs::File>>,
  samples: &[f32],
) -> Result<(), NativeError> {
  for sample in samples {
    let clamped = sample.clamp(-1.0, 1.0);
    let pcm = (clamped * i16::MAX as f32) as i16;
    writer
      .write_sample(pcm)
      .map_err(|error| NativeError::Internal(format!("failed to write wav sample: {error}")))?;
  }
  Ok(())
}

fn estimate_lag_samples(mic: &[f32], speaker: &[f32], sample_rate: u32) -> isize {
  if mic.is_empty() || speaker.is_empty() {
    return 0;
  }

  let max_lag = (sample_rate as usize / 2).max(1);
  let window = (sample_rate as usize * 5)
    .min(mic.len())
    .min(speaker.len())
    .max(1);
  let step = 8usize;

  let mut best_lag = 0isize;
  let mut best_score = f32::MIN;

  for lag in -(max_lag as isize)..=(max_lag as isize) {
    let mut dot = 0.0f32;
    let mut energy_m = 0.0f32;
    let mut energy_s = 0.0f32;
    let mut idx = 0usize;

    while idx < window {
      let mic_idx = idx as isize;
      let speaker_idx = mic_idx + lag;
      if speaker_idx >= 0 && (speaker_idx as usize) < window {
        let m = mic[mic_idx as usize];
        let s = speaker[speaker_idx as usize];
        dot += m * s;
        energy_m += m * m;
        energy_s += s * s;
      }
      idx += step;
    }

    if energy_m <= 1e-6 || energy_s <= 1e-6 {
      continue;
    }

    let score = dot / (energy_m.sqrt() * energy_s.sqrt());
    if score > best_score {
      best_score = score;
      best_lag = lag;
    }
  }

  best_lag
}

pub(crate) fn start_progress_emitter(
  started_at: u64,
  stop: Arc<AtomicBool>,
) -> thread::JoinHandle<()> {
  thread::spawn(move || {
    while !stop.load(Ordering::Relaxed) {
      thread::sleep(Duration::from_millis(1000));
      if stop.load(Ordering::Relaxed) {
        break;
      }
      let elapsed = now_ms().saturating_sub(started_at);
      let _ = emit(Event::Progress {
        duration_ms: elapsed,
      });
    }
  })
}

fn spawn_mic_capture(
  start: &CaptureStart,
  stop_flag: Arc<AtomicBool>,
) -> Result<thread::JoinHandle<Result<Vec<String>, NativeError>>, NativeError> {
  let output_path = start.output_path.clone();
  let desired_rate = start.sample_rate_hz;
  let requested_channels = start.channels;
  let mic_device_id = start.mic_device_id.clone();

  let builder = thread::Builder::new().name("stitch-audio-mic-capture".to_string());
  builder
    .spawn(move || {
      let host = cpal::default_host();
      let device = choose_input_device(&host, mic_device_id.as_deref())?;
      let default_config = device.default_input_config().map_err(|error| {
        NativeError::StreamFailed(format!("failed to read default microphone config: {error}"))
      })?;

      let mut warnings = Vec::new();
      if default_config.sample_rate() != desired_rate {
        warnings.push(format!(
          "requested_sample_rate_{desired_rate}_unavailable_using_{}",
          default_config.sample_rate()
        ));
      }

      if requested_channels != 1 {
        warnings.push("channels_forced_to_mono".to_string());
      }

      let stream_config = default_config.config();
      let file_spec = hound::WavSpec {
        channels: 1,
        sample_rate: stream_config.sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
      };

      let mut writer = hound::WavWriter::create(&output_path, file_spec)
        .map_err(|error| NativeError::Internal(format!("failed to create wav file: {error}")))?;

      let (tx, rx): (SyncSender<Vec<f32>>, Receiver<Vec<f32>>) =
        mpsc::sync_channel(INPUT_QUEUE_CAPACITY);

      let stream = match default_config.sample_format() {
        SampleFormat::I8 => {
          build_input_stream::<i8>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            s as f32 / i8::MAX as f32
          })?
        }
        SampleFormat::I16 => {
          build_input_stream::<i16>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            s as f32 / i16::MAX as f32
          })?
        }
        SampleFormat::I32 => {
          build_input_stream::<i32>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            s as f32 / i32::MAX as f32
          })?
        }
        SampleFormat::I64 => {
          build_input_stream::<i64>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            s as f32 / i64::MAX as f32
          })?
        }
        SampleFormat::U8 => {
          build_input_stream::<u8>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            (s as f32 / u8::MAX as f32) * 2.0 - 1.0
          })?
        }
        SampleFormat::U16 => {
          build_input_stream::<u16>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            (s as f32 / u16::MAX as f32) * 2.0 - 1.0
          })?
        }
        SampleFormat::U32 => {
          build_input_stream::<u32>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            (s as f32 / u32::MAX as f32) * 2.0 - 1.0
          })?
        }
        SampleFormat::U64 => {
          build_input_stream::<u64>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            (s as f32 / u64::MAX as f32) * 2.0 - 1.0
          })?
        }
        SampleFormat::F32 => {
          build_input_stream::<f32>(&device, &stream_config, tx, stop_flag.clone(), |s| s)?
        }
        SampleFormat::F64 => {
          build_input_stream::<f64>(&device, &stream_config, tx, stop_flag.clone(), |s| s as f32)?
        }
        other => {
          return Err(NativeError::StreamFailed(format!(
            "unsupported microphone sample format: {other:?}"
          )));
        }
      };

      stream.play().map_err(|error| {
        NativeError::PermissionDenied(format!("failed to start microphone stream: {error}"))
      })?;

      while !stop_flag.load(Ordering::Relaxed) {
        if let Ok(samples) = rx.recv_timeout(Duration::from_millis(100)) {
          write_samples_as_i16(&mut writer, &samples)?;
        }
      }

      while let Ok(samples) = rx.try_recv() {
        write_samples_as_i16(&mut writer, &samples)?;
      }

      drop(stream);

      writer
        .flush()
        .map_err(|error| NativeError::Internal(format!("failed to flush wav file: {error}")))?;
      writer
        .finalize()
        .map_err(|error| NativeError::Internal(format!("failed to finalize wav file: {error}")))?;

      Ok(warnings)
    })
    .map_err(|error| NativeError::Internal(format!("failed to spawn capture thread: {error}")))
}

fn spawn_mic_source(
  start: &CaptureStart,
  stop_flag: Arc<AtomicBool>,
) -> Result<
  (
    Receiver<Vec<f32>>,
    thread::JoinHandle<Result<Vec<String>, NativeError>>,
  ),
  NativeError,
> {
  let desired_rate = start.sample_rate_hz;
  let requested_channels = start.channels;
  let mic_device_id = start.mic_device_id.clone();
  let (tx, rx): (SyncSender<Vec<f32>>, Receiver<Vec<f32>>) =
    mpsc::sync_channel(INPUT_QUEUE_CAPACITY);

  let builder = thread::Builder::new().name("stitch-audio-mic-source".to_string());
  let worker = builder
    .spawn(move || {
      let host = cpal::default_host();
      let device = choose_input_device(&host, mic_device_id.as_deref())?;
      let default_config = device.default_input_config().map_err(|error| {
        NativeError::StreamFailed(format!("failed to read default microphone config: {error}"))
      })?;

      let mut warnings = Vec::new();
      if default_config.sample_rate() != desired_rate {
        warnings.push(format!(
          "requested_sample_rate_{desired_rate}_unavailable_using_{}",
          default_config.sample_rate()
        ));
      }

      if requested_channels != 1 {
        warnings.push("channels_forced_to_mono".to_string());
      }

      let stream_config = default_config.config();
      let stream = match default_config.sample_format() {
        SampleFormat::I8 => {
          build_input_stream::<i8>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            s as f32 / i8::MAX as f32
          })?
        }
        SampleFormat::I16 => {
          build_input_stream::<i16>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            s as f32 / i16::MAX as f32
          })?
        }
        SampleFormat::I32 => {
          build_input_stream::<i32>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            s as f32 / i32::MAX as f32
          })?
        }
        SampleFormat::I64 => {
          build_input_stream::<i64>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            s as f32 / i64::MAX as f32
          })?
        }
        SampleFormat::U8 => {
          build_input_stream::<u8>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            (s as f32 / u8::MAX as f32) * 2.0 - 1.0
          })?
        }
        SampleFormat::U16 => {
          build_input_stream::<u16>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            (s as f32 / u16::MAX as f32) * 2.0 - 1.0
          })?
        }
        SampleFormat::U32 => {
          build_input_stream::<u32>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            (s as f32 / u32::MAX as f32) * 2.0 - 1.0
          })?
        }
        SampleFormat::U64 => {
          build_input_stream::<u64>(&device, &stream_config, tx, stop_flag.clone(), |s| {
            (s as f32 / u64::MAX as f32) * 2.0 - 1.0
          })?
        }
        SampleFormat::F32 => {
          build_input_stream::<f32>(&device, &stream_config, tx, stop_flag.clone(), |s| s)?
        }
        SampleFormat::F64 => {
          build_input_stream::<f64>(&device, &stream_config, tx, stop_flag.clone(), |s| s as f32)?
        }
        other => {
          return Err(NativeError::StreamFailed(format!(
            "unsupported microphone sample format: {other:?}"
          )));
        }
      };

      stream.play().map_err(|error| {
        NativeError::PermissionDenied(format!("failed to start microphone stream: {error}"))
      })?;

      while !stop_flag.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(50));
      }

      drop(stream);
      Ok(warnings)
    })
    .map_err(|error| {
      NativeError::Internal(format!("failed to spawn mic source thread: {error}"))
    })?;

  Ok((rx, worker))
}

fn aligned_sample(buffer: &[f32], idx: usize, lag: isize) -> f32 {
  let mapped = idx as isize - lag;
  if mapped < 0 {
    return 0.0;
  }
  *buffer.get(mapped as usize).unwrap_or(&0.0)
}

fn write_dual_realtime_output(
  start: &CaptureStart,
  stop_flag: Arc<AtomicBool>,
) -> Result<thread::JoinHandle<Result<Vec<String>, NativeError>>, NativeError> {
  let output_path = start.output_path.clone();
  let enable_aec = start.enable_aec;
  let speaker_device_id = start.speaker_device_id.clone();

  let (mic_rx, mic_worker) = spawn_mic_source(start, stop_flag.clone())?;
  let (speaker_rx, speaker_worker) = spawn_speaker_source(speaker_device_id, stop_flag.clone())?;

  let builder = thread::Builder::new().name("stitch-audio-dual-mixer".to_string());
  builder
    .spawn(move || {
      let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16_000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
      };
      let mut writer = hound::WavWriter::create(output_path, spec)
        .map_err(|error| NativeError::Internal(format!("failed to create wav file: {error}")))?;

      let mut mic_queue: VecDeque<Vec<f32>> = VecDeque::new();
      let mut speaker_queue: VecDeque<Vec<f32>> = VecDeque::new();
      let mut aec_gain = 0.0f32;
      let mut warnings = vec!["dual_realtime_mixer_enabled".to_string()];

      loop {
        if let Ok(chunk) = mic_rx.recv_timeout(Duration::from_millis(20)) {
          mic_queue.push_back(chunk);
        }
        while let Ok(chunk) = speaker_rx.try_recv() {
          speaker_queue.push_back(chunk);
        }

        while let (Some(mic_chunk), Some(speaker_chunk)) =
          (mic_queue.pop_front(), speaker_queue.pop_front())
        {
          let lag = estimate_lag_samples(&mic_chunk, &speaker_chunk, 16_000);
          if lag != 0 {
            warnings.push(format!("realtime_sync_lag_samples_{lag}"));
          }

          let overlap = mic_chunk.len().min(speaker_chunk.len());
          if enable_aec && overlap > 0 {
            let mut dot = 0.0f32;
            let mut energy = 0.0f32;
            for idx in 0..overlap {
              let s = aligned_sample(&speaker_chunk, idx, lag);
              dot += mic_chunk[idx] * s;
              energy += s * s;
            }

            if energy > 1e-6 {
              let estimate = (dot / energy).clamp(0.0, 1.5);
              aec_gain = (aec_gain * 0.85) + (estimate * 0.15);
            }
          }

          let length = mic_chunk.len().max(speaker_chunk.len());
          for idx in 0..length {
            let mic_value = *mic_chunk.get(idx).unwrap_or(&0.0);
            let speaker_value = aligned_sample(&speaker_chunk, idx, lag);
            let cleaned_mic = if enable_aec {
              mic_value - (speaker_value * aec_gain)
            } else {
              mic_value
            };
            let mixed = ((cleaned_mic * 0.6) + (speaker_value * 0.4)).clamp(-1.0, 1.0);
            let pcm = (mixed * i16::MAX as f32) as i16;
            writer.write_sample(pcm).map_err(|error| {
              NativeError::Internal(format!("failed to write mixed sample: {error}"))
            })?;
          }
        }

        if stop_flag.load(Ordering::Relaxed) {
          if mic_queue.is_empty() && speaker_queue.is_empty() {
            break;
          }
        }
      }

      writer
        .flush()
        .map_err(|error| NativeError::Internal(format!("failed to flush wav file: {error}")))?;
      writer
        .finalize()
        .map_err(|error| NativeError::Internal(format!("failed to finalize wav file: {error}")))?;

      let mic_warnings = mic_worker
        .join()
        .map_err(|_| NativeError::Internal("microphone thread panicked".to_string()))??;
      let speaker_warnings = speaker_worker
        .join()
        .map_err(|_| NativeError::Internal("speaker thread panicked".to_string()))??;

      warnings.extend(mic_warnings);
      warnings.extend(speaker_warnings);
      if enable_aec {
        warnings.push(format!("realtime_aec_final_gain_{:.3}", aec_gain));
      }

      Ok(warnings)
    })
    .map_err(|error| NativeError::Internal(format!("failed to spawn dual mixer thread: {error}")))
}

pub(crate) fn spawn_capture_worker(
  start: &CaptureStart,
  stop_flag: Arc<AtomicBool>,
) -> Result<thread::JoinHandle<Result<Vec<String>, NativeError>>, NativeError> {
  let mut warnings = Vec::new();
  if start.enable_aec && !matches!(start.mode, CaptureMode::Dual) {
    warnings.push("aec_requested_but_only_applied_in_dual_mode".to_string());
  }

  match start.mode {
    CaptureMode::Mic => {
      let worker = spawn_mic_capture(start, stop_flag)?;
      Ok(thread::spawn(move || {
        let mut inner = worker
          .join()
          .map_err(|_| NativeError::Internal("microphone thread panicked".to_string()))??;
        inner.extend(warnings);
        Ok(inner)
      }))
    }
    CaptureMode::Dual => {
      let worker = write_dual_realtime_output(start, stop_flag)?;

      Ok(thread::spawn(move || {
        let mut inner = worker
          .join()
          .map_err(|_| NativeError::Internal("dual mixer thread panicked".to_string()))??;
        inner.extend(warnings);
        Ok(inner)
      }))
    }
    CaptureMode::Speaker => spawn_speaker_capture(
      start.output_path.clone(),
      start.speaker_device_id.clone(),
      stop_flag,
    ),
  }
}

#[cfg(test)]
mod tests {
  use super::{aligned_sample, estimate_lag_samples};

  #[test]
  fn estimate_lag_detects_positive_shift() {
    let mic = vec![0.9, -0.2, 0.5, 0.1, -0.7, 0.3, -0.1, 0.8, -0.4, 0.2];
    let speaker = vec![0.0, 0.0, 0.9, -0.2, 0.5, 0.1, -0.7, 0.3, -0.1, 0.8];

    let lag = estimate_lag_samples(&mic, &speaker, 16_000);
    assert!(lag != 0);
  }

  #[test]
  fn aligned_sample_respects_lag_boundaries() {
    let speaker = vec![0.1, 0.2, 0.3];

    assert_eq!(aligned_sample(&speaker, 0, 1), 0.0);
    assert_eq!(aligned_sample(&speaker, 1, 1), 0.1);
    assert_eq!(aligned_sample(&speaker, 2, 1), 0.2);
    assert_eq!(aligned_sample(&speaker, 2, -1), 0.0);
  }

  #[test]
  fn estimate_lag_returns_zero_for_identical_streams() {
    let signal = vec![0.0, 0.2, -0.1, 0.5, -0.4, 0.3, 0.0];
    let lag = estimate_lag_samples(&signal, &signal, 16_000);
    assert_eq!(lag, 0);
  }

  #[test]
  fn estimate_lag_handles_empty_inputs() {
    assert_eq!(estimate_lag_samples(&[], &[0.1, 0.2], 16_000), 0);
    assert_eq!(estimate_lag_samples(&[0.1, 0.2], &[], 16_000), 0);
  }
}
