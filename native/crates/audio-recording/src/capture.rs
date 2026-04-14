#[cfg(test)]
use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender, TrySendError};
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SizedSample};

use audio_core::error::NativeError;
use audio_core::output::{emit, now_ms};
use audio_core::protocol::{CaptureMode, CaptureStart, Event};

use crate::opus_writer::OggOpusWriter;
use crate::resample::StreamResampler;
use crate::speaker::{spawn_speaker_capture, spawn_speaker_source};

const INPUT_QUEUE_CAPACITY: usize = 128;
const UNPAIRED_FLUSH_TICKS: u32 = 5;
const DUAL_MIC_GAIN: f32 = 1.0;
#[cfg(test)]
const DEFAULT_SPEAKER_GAIN: f32 = 10.0;
const MIC_RECONNECT_DELAY: Duration = Duration::from_secs(2);
const MIC_MAX_RECONNECT_ATTEMPTS: u32 = 5;

const TAP_DEVICE_NAME: &str = "stitch-audio-tap";

fn is_tap_device(name: &str) -> bool {
  name.contains(TAP_DEVICE_NAME)
}

fn device_name(device: &cpal::Device) -> Option<String> {
  device.description().map(|d| d.name().to_string()).ok()
}

fn choose_input_device(
  host: &cpal::Host,
  preferred: Option<&str>,
) -> Result<cpal::Device, NativeError> {
  if let Some(name) = preferred {
    // Try the exact requested device first
    let mut devices = host.input_devices().map_err(|error| {
      NativeError::StreamFailed(format!("failed to enumerate input devices: {error}"))
    })?;

    if let Some(device) =
      devices.find(|d| device_name(d).as_deref() == Some(name) && !is_tap_device(name))
    {
      return Ok(device);
    }

    // Preferred device not found — fall back to default, then first available
    let _ = emit(Event::Warning {
      code: "preferred_device_unavailable".to_string(),
      message: format!("preferred microphone '{name}' not found, falling back to default"),
    });
  }

  // Try the default input device (if it's not our tap)
  if let Some(device) = host.default_input_device() {
    if !device_name(&device).map_or(false, |n| is_tap_device(&n)) {
      return Ok(device);
    }
  }

  // Last resort: first non-tap input device
  let mut devices = host.input_devices().map_err(|error| {
    NativeError::StreamFailed(format!("failed to enumerate input devices: {error}"))
  })?;

  devices
    .find(|d| !device_name(d).map_or(false, |n| is_tap_device(&n)))
    .ok_or_else(|| NativeError::DeviceNotFound("no input device available".to_string()))
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
  output_sample_rate_hz: Option<u32>,
  stream_error_flag: Arc<AtomicBool>,
  convert: impl Fn(T) -> f32 + Send + 'static + Copy,
) -> Result<cpal::Stream, NativeError>
where
  T: SizedSample + Send + 'static,
{
  let channels = config.channels as usize;
  let input_sample_rate_hz = config.sample_rate;
  let mut resampler = match output_sample_rate_hz {
    Some(target_rate_hz) => Some(StreamResampler::new(input_sample_rate_hz, target_rate_hz)?),
    None => None,
  };
  let err_handler = move |error: cpal::StreamError| {
    stream_error_flag.store(true, Ordering::Relaxed);
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
        let chunk = match resampler.as_mut() {
          Some(resampler) => match resampler.process(&mono) {
            Ok(resampled) => resampled,
            Err(error) => {
              let _ = emit(Event::Warning {
                code: "resample_failed".to_string(),
                message: error.to_string(),
              });
              return;
            }
          },
          None => mono,
        };

        if chunk.is_empty() {
          return;
        }

        match tx.try_send(chunk) {
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

fn write_samples(writer: &mut OggOpusWriter, samples: &[f32]) -> Result<(), NativeError> {
  writer.write_samples(samples)
}

fn open_mic_stream(
  device: &cpal::Device,
  tx: SyncSender<Vec<f32>>,
  stop_flag: Arc<AtomicBool>,
  target_sample_rate_hz: u32,
  stream_error_flag: Arc<AtomicBool>,
) -> Result<(cpal::Stream, Vec<String>), NativeError> {
  let default_config = device.default_input_config().map_err(|error| {
    NativeError::StreamFailed(format!("failed to read default microphone config: {error}"))
  })?;

  let mut warnings = Vec::new();
  if default_config.sample_rate() != target_sample_rate_hz {
    warnings.push(format!(
      "requested_sample_rate_{target_sample_rate_hz}_unavailable_using_{}",
      default_config.sample_rate()
    ));
  }

  let stream_config = default_config.config();
  let rate = Some(target_sample_rate_hz);
  let stream = match default_config.sample_format() {
    SampleFormat::I8 => build_input_stream::<i8>(
      &device,
      &stream_config,
      tx,
      stop_flag,
      rate,
      stream_error_flag,
      |s| s as f32 / i8::MAX as f32,
    )?,
    SampleFormat::I16 => build_input_stream::<i16>(
      &device,
      &stream_config,
      tx,
      stop_flag,
      rate,
      stream_error_flag,
      |s| s as f32 / i16::MAX as f32,
    )?,
    SampleFormat::I32 => build_input_stream::<i32>(
      &device,
      &stream_config,
      tx,
      stop_flag,
      rate,
      stream_error_flag,
      |s| s as f32 / i32::MAX as f32,
    )?,
    SampleFormat::I64 => build_input_stream::<i64>(
      &device,
      &stream_config,
      tx,
      stop_flag,
      rate,
      stream_error_flag,
      |s| s as f32 / i64::MAX as f32,
    )?,
    SampleFormat::U8 => build_input_stream::<u8>(
      &device,
      &stream_config,
      tx,
      stop_flag,
      rate,
      stream_error_flag,
      |s| (s as f32 / u8::MAX as f32) * 2.0 - 1.0,
    )?,
    SampleFormat::U16 => build_input_stream::<u16>(
      &device,
      &stream_config,
      tx,
      stop_flag,
      rate,
      stream_error_flag,
      |s| (s as f32 / u16::MAX as f32) * 2.0 - 1.0,
    )?,
    SampleFormat::U32 => build_input_stream::<u32>(
      &device,
      &stream_config,
      tx,
      stop_flag,
      rate,
      stream_error_flag,
      |s| (s as f32 / u32::MAX as f32) * 2.0 - 1.0,
    )?,
    SampleFormat::U64 => build_input_stream::<u64>(
      &device,
      &stream_config,
      tx,
      stop_flag,
      rate,
      stream_error_flag,
      |s| (s as f32 / u64::MAX as f32) * 2.0 - 1.0,
    )?,
    SampleFormat::F32 => build_input_stream::<f32>(
      &device,
      &stream_config,
      tx,
      stop_flag,
      rate,
      stream_error_flag,
      |s| s,
    )?,
    SampleFormat::F64 => build_input_stream::<f64>(
      &device,
      &stream_config,
      tx,
      stop_flag,
      rate,
      stream_error_flag,
      |s| s as f32,
    )?,
    other => {
      return Err(NativeError::StreamFailed(format!(
        "unsupported microphone sample format: {other:?}"
      )));
    }
  };

  stream.play().map_err(|error| {
    NativeError::PermissionDenied(format!("failed to start microphone stream: {error}"))
  })?;

  Ok((stream, warnings))
}

#[cfg(test)]
fn weighted_f32_chunk(chunk: &[f32], weight: f32) -> Vec<f32> {
  chunk
    .iter()
    .map(|s| (s * weight).clamp(-1.0, 1.0))
    .collect()
}

#[cfg(test)]
fn maybe_take_unpaired_pcm(
  queue: &mut VecDeque<Vec<f32>>,
  wait_ticks: &mut u32,
  stop_requested: bool,
  weight: f32,
  warning_code: &'static str,
  warned: &mut bool,
  warnings: &mut Vec<String>,
) -> Option<Vec<f32>> {
  if *wait_ticks < UNPAIRED_FLUSH_TICKS && !stop_requested {
    return None;
  }

  let chunk = queue.pop_front()?;
  if !*warned {
    warnings.push(warning_code.to_string());
    *warned = true;
  }

  *wait_ticks = 0;
  Some(weighted_f32_chunk(&chunk, weight))
}

#[cfg(test)]
fn mix_dual_chunks(
  mic_chunk: &[f32],
  speaker_chunk: &[f32],
  sample_rate_hz: u32,
  enable_aec: bool,
  aec_gain: &mut f32,
) -> (Vec<f32>, isize) {
  let lag = if enable_aec {
    estimate_lag_samples(mic_chunk, speaker_chunk, sample_rate_hz)
  } else {
    0
  };
  let overlap = mic_chunk.len().min(speaker_chunk.len());

  if enable_aec && overlap > 0 {
    let mut dot = 0.0f32;
    let mut energy = 0.0f32;
    for idx in 0..overlap {
      let s = aligned_sample(speaker_chunk, idx, lag);
      dot += mic_chunk[idx] * s;
      energy += s * s;
    }

    if energy > 1e-6 {
      let estimate = (dot / energy).clamp(0.0, 1.5);
      *aec_gain = (*aec_gain * 0.85) + (estimate * 0.15);
    }
  }

  let length = mic_chunk.len().max(speaker_chunk.len());
  let mut out = Vec::with_capacity(length);

  for idx in 0..length {
    let mic_value = *mic_chunk.get(idx).unwrap_or(&0.0);
    let speaker_value = aligned_sample(speaker_chunk, idx, lag);
    let cleaned_mic = if enable_aec {
      mic_value - (speaker_value * *aec_gain)
    } else {
      mic_value
    };
    let mixed =
      ((cleaned_mic * DUAL_MIC_GAIN) + (speaker_value * DEFAULT_SPEAKER_GAIN)).clamp(-1.0, 1.0);
    out.push(mixed);
  }

  (out, lag)
}

#[cfg(test)]
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
  let requested_channels = start.channels;
  let mic_device_id = start.mic_device_id.clone();
  let sample_rate_hz = start.sample_rate_hz;

  let builder = thread::Builder::new().name("stitch-audio-mic-capture".to_string());
  builder
    .spawn(move || {
      let host = cpal::default_host();
      let mut warnings = Vec::new();

      if requested_channels != 1 {
        warnings.push("channels_forced_to_mono".to_string());
      }

      let mut writer = OggOpusWriter::create(&output_path)?;

      let (tx, rx): (SyncSender<Vec<f32>>, Receiver<Vec<f32>>) =
        mpsc::sync_channel(INPUT_QUEUE_CAPACITY);

      let stream_error_flag = Arc::new(AtomicBool::new(false));

      let device = choose_input_device(&host, mic_device_id.as_deref())?;
      let (initial_stream, open_warnings) = open_mic_stream(
        &device,
        tx.clone(),
        stop_flag.clone(),
        sample_rate_hz,
        stream_error_flag.clone(),
      )?;
      warnings.extend(open_warnings);

      let mut active_stream: Option<cpal::Stream> = Some(initial_stream);
      let mut reconnect_attempts = 0u32;

      while !stop_flag.load(Ordering::Relaxed) {
        if let Ok(samples) = rx.recv_timeout(Duration::from_millis(100)) {
          write_samples(&mut writer, &samples)?;
          reconnect_attempts = 0;
          continue;
        }

        if !stream_error_flag.load(Ordering::Relaxed) {
          continue;
        }

        // Stream errored — attempt reconnect
        active_stream.take();
        stream_error_flag.store(false, Ordering::Relaxed);

        reconnect_attempts += 1;
        if reconnect_attempts > MIC_MAX_RECONNECT_ATTEMPTS {
          warnings.push("mic_reconnect_attempts_exhausted".to_string());
          let _ = emit(Event::Warning {
            code: "mic_reconnect_failed".to_string(),
            message: "Microphone reconnection failed after maximum attempts".to_string(),
          });
          break;
        }

        let _ = emit(Event::Warning {
          code: "mic_reconnecting".to_string(),
          message: format!(
            "Microphone stream error detected, reconnection attempt {reconnect_attempts}/{MIC_MAX_RECONNECT_ATTEMPTS}"
          ),
        });

        thread::sleep(MIC_RECONNECT_DELAY);

        if stop_flag.load(Ordering::Relaxed) {
          break;
        }

        let new_device = match choose_input_device(&host, None) {
          Ok(d) => d,
          Err(_) => continue,
        };

        match open_mic_stream(
          &new_device,
          tx.clone(),
          stop_flag.clone(),
          sample_rate_hz,
          stream_error_flag.clone(),
        ) {
          Ok((new_stream, new_warnings)) => {
            active_stream = Some(new_stream);
            warnings.extend(new_warnings);

            let new_name = device_name(&new_device).unwrap_or_default();
            warnings.push(format!("mic_reconnected_to_{new_name}"));

            let _ = emit(Event::DeviceChanged {
              kind: "input",
              device_name: Some(new_name),
            });
          }
          Err(_) => continue,
        }
      }

      while let Ok(samples) = rx.try_recv() {
        write_samples(&mut writer, &samples)?;
      }

      drop(active_stream);
      writer.finalize()?;

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
      let mut warnings = Vec::new();

      if requested_channels != 1 {
        warnings.push("channels_forced_to_mono".to_string());
      }

      let stream_error_flag = Arc::new(AtomicBool::new(false));

      let device = choose_input_device(&host, mic_device_id.as_deref())?;
      let (initial_stream, open_warnings) = open_mic_stream(
        &device,
        tx.clone(),
        stop_flag.clone(),
        desired_rate,
        stream_error_flag.clone(),
      )?;
      warnings.extend(open_warnings);

      let mut active_stream = Some(initial_stream);
      let mut reconnect_attempts = 0u32;

      while !stop_flag.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(50));

        if !stream_error_flag.load(Ordering::Relaxed) {
          reconnect_attempts = 0;
          continue;
        }

        // Stream errored — attempt reconnect
        active_stream.take();
        stream_error_flag.store(false, Ordering::Relaxed);

        reconnect_attempts += 1;
        if reconnect_attempts > MIC_MAX_RECONNECT_ATTEMPTS {
          warnings.push("mic_reconnect_attempts_exhausted".to_string());
          let _ = emit(Event::Warning {
            code: "mic_reconnect_failed".to_string(),
            message: "Microphone reconnection failed after maximum attempts".to_string(),
          });
          break;
        }

        let _ = emit(Event::Warning {
          code: "mic_reconnecting".to_string(),
          message: format!(
            "Microphone stream error detected, reconnection attempt {reconnect_attempts}/{MIC_MAX_RECONNECT_ATTEMPTS}"
          ),
        });

        thread::sleep(MIC_RECONNECT_DELAY);

        if stop_flag.load(Ordering::Relaxed) {
          break;
        }

        // Try to reconnect — fall back to system default
        let new_device = match choose_input_device(&host, None) {
          Ok(d) => d,
          Err(_) => continue,
        };

        match open_mic_stream(
          &new_device,
          tx.clone(),
          stop_flag.clone(),
          desired_rate,
          stream_error_flag.clone(),
        ) {
          Ok((new_stream, new_warnings)) => {
            active_stream = Some(new_stream);
            warnings.extend(new_warnings);

            let new_name = device_name(&new_device).unwrap_or_default();
            warnings.push(format!("mic_reconnected_to_{new_name}"));

            let _ = emit(Event::DeviceChanged {
              kind: "input",
              device_name: Some(new_name),
            });
          }
          Err(_) => continue,
        }
      }

      drop(active_stream);
      Ok(warnings)
    })
    .map_err(|error| {
      NativeError::Internal(format!("failed to spawn mic source thread: {error}"))
    })?;

  Ok((rx, worker))
}

#[cfg(test)]
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
  let target_sample_rate_hz = start.sample_rate_hz;
  let speaker_gain = start.speaker_gain;

  let (mic_rx, mic_worker) = spawn_mic_source(start, stop_flag.clone())?;
  let (speaker_rx, speaker_worker) =
    spawn_speaker_source(speaker_device_id, target_sample_rate_hz, stop_flag.clone())?;

  let builder = thread::Builder::new().name("stitch-audio-dual-mixer".to_string());
  builder
    .spawn(move || {
      let mut writer = OggOpusWriter::create(&output_path)?;

      let aec_gain = 0.0f32;
      let mut warnings = vec!["dual_realtime_mixer_enabled".to_string()];
      let mut mic_buf: Vec<f32> = Vec::new();
      let mut speaker_buf: Vec<f32> = Vec::new();
      let mut mic_wait_ticks = 0u32;
      let mut speaker_wait_ticks = 0u32;

      loop {
        use std::sync::mpsc::RecvTimeoutError;
        match mic_rx.recv_timeout(Duration::from_millis(20)) {
          Ok(chunk) => mic_buf.extend_from_slice(&chunk),
          Err(RecvTimeoutError::Disconnected) => {
            if !stop_flag.load(Ordering::Relaxed) {
              warnings.push("mic_source_disconnected_early".to_string());
            }
            stop_flag.store(true, Ordering::Relaxed);
          }
          Err(RecvTimeoutError::Timeout) => {}
        }
        while let Ok(chunk) = mic_rx.try_recv() {
          mic_buf.extend_from_slice(&chunk);
        }
        while let Ok(chunk) = speaker_rx.try_recv() {
          speaker_buf.extend_from_slice(&chunk);
        }

        let mix_len = if !mic_buf.is_empty() && !speaker_buf.is_empty() {
          mic_buf.len().min(speaker_buf.len())
        } else if !mic_buf.is_empty() && speaker_buf.is_empty() {
          mic_wait_ticks = mic_wait_ticks.saturating_add(1);
          if mic_wait_ticks >= UNPAIRED_FLUSH_TICKS || stop_flag.load(Ordering::Relaxed) {
            mic_wait_ticks = 0;
            mic_buf.len()
          } else {
            0
          }
        } else if !speaker_buf.is_empty() && mic_buf.is_empty() {
          speaker_wait_ticks = speaker_wait_ticks.saturating_add(1);
          if speaker_wait_ticks >= UNPAIRED_FLUSH_TICKS || stop_flag.load(Ordering::Relaxed) {
            speaker_wait_ticks = 0;
            speaker_buf.len()
          } else {
            0
          }
        } else {
          0
        };

        if mix_len > 0 {
          if !mic_buf.is_empty() && !speaker_buf.is_empty() {
            mic_wait_ticks = 0;
            speaker_wait_ticks = 0;
          }

          let mut out = Vec::with_capacity(mix_len);
          for i in 0..mix_len {
            let mic_val = mic_buf.get(i).copied().unwrap_or(0.0);
            let spk_val = speaker_buf.get(i).copied().unwrap_or(0.0);
            let mixed = (mic_val * DUAL_MIC_GAIN + spk_val * speaker_gain).clamp(-1.0, 1.0);
            out.push(mixed);
          }
          write_samples(&mut writer, &out)?;

          if mic_buf.len() <= mix_len {
            mic_buf.clear();
          } else {
            mic_buf.drain(..mix_len);
          }
          if speaker_buf.len() <= mix_len {
            speaker_buf.clear();
          } else {
            speaker_buf.drain(..mix_len);
          }
        }

        if stop_flag.load(Ordering::Relaxed) && mic_buf.is_empty() && speaker_buf.is_empty() {
          break;
        }
      }

      writer.finalize()?;

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
      start.sample_rate_hz,
      stop_flag,
    ),
  }
}

#[cfg(test)]
mod tests {
  use std::collections::VecDeque;

  use super::{
    UNPAIRED_FLUSH_TICKS, aligned_sample, estimate_lag_samples, maybe_take_unpaired_pcm,
    mix_dual_chunks, weighted_f32_chunk,
  };

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

  #[test]
  fn weighted_f32_chunk_keeps_signal_for_unpaired_streams() {
    let samples = weighted_f32_chunk(&[0.5, -0.5, 0.25], 0.6);
    assert_eq!(samples.len(), 3);
    assert!(samples.iter().any(|s| *s != 0.0));
  }

  #[test]
  fn maybe_take_unpaired_pcm_flushes_after_wait_threshold() {
    let mut queue = VecDeque::from([vec![0.5, -0.5]]);
    let mut wait_ticks = UNPAIRED_FLUSH_TICKS;
    let mut warnings = Vec::new();
    let mut warned = false;

    let samples = maybe_take_unpaired_pcm(
      &mut queue,
      &mut wait_ticks,
      false,
      0.6,
      "dual_fallback_mic_only_chunks",
      &mut warned,
      &mut warnings,
    );

    assert!(samples.is_some());
    assert!(queue.is_empty());
    assert_eq!(warnings, vec!["dual_fallback_mic_only_chunks"]);
    assert!(warned);
  }

  #[test]
  fn maybe_take_unpaired_pcm_flushes_on_stop_even_without_threshold() {
    let mut queue = VecDeque::from([vec![0.5]]);
    let mut wait_ticks = 0;
    let mut warnings = Vec::new();
    let mut warned = false;

    let samples = maybe_take_unpaired_pcm(
      &mut queue,
      &mut wait_ticks,
      true,
      0.6,
      "dual_fallback_mic_only_chunks",
      &mut warned,
      &mut warnings,
    );

    assert!(samples.is_some());
    assert!(queue.is_empty());
  }

  #[test]
  fn mix_dual_chunks_writes_audio_when_speaker_is_missing() {
    let mut aec_gain = 0.0;
    let (samples, lag) = mix_dual_chunks(&[0.3, -0.2, 0.1], &[], 16_000, true, &mut aec_gain);
    assert_eq!(lag, 0);
    assert_eq!(samples.len(), 3);
    assert!(samples.iter().any(|s| *s != 0.0));
  }
}
