use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender, TrySendError};
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SizedSample};

use audio_core::error::NativeError;
use audio_core::output::{emit, emit_audio_chunk, now_ms};
use audio_core::protocol::{
  AudioChunkEncoding, AudioChunkSource, CaptureMode, CaptureStart, Event,
};

use crate::opus_writer::OggOpusWriter;
use crate::resample::StreamResampler;
use crate::speaker::{spawn_speaker_capture, spawn_speaker_source};

const INPUT_QUEUE_CAPACITY: usize = 128;
const UNPAIRED_FLUSH_TICKS: u32 = 5;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(1000);
const MIC_CAPTURE_RECV_TIMEOUT: Duration = Duration::from_millis(100);
const MIC_SOURCE_POLL_INTERVAL: Duration = Duration::from_millis(50);
const DUAL_MIXER_RECV_TIMEOUT: Duration = Duration::from_millis(20);
const MIC_RECONNECT_DELAY: Duration = Duration::from_secs(2);
const MIC_MAX_RECONNECT_ATTEMPTS: u32 = 5;

const TAP_DEVICE_NAME: &str = "stitch-audio-tap";

fn is_tap_device(name: &str) -> bool {
  name.contains(TAP_DEVICE_NAME)
}

fn device_name(device: &cpal::Device) -> Option<String> {
  crate::device::device_display_name(device)
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
  macro_rules! build_stream {
    ($sample:ty, $convert:expr) => {
      build_input_stream::<$sample>(
        device,
        &stream_config,
        tx,
        stop_flag,
        rate,
        stream_error_flag,
        $convert,
      )?
    };
  }

  let stream = match default_config.sample_format() {
    SampleFormat::I8 => build_stream!(i8, |s| s as f32 / i8::MAX as f32),
    SampleFormat::I16 => build_stream!(i16, |s| s as f32 / i16::MAX as f32),
    SampleFormat::I32 => build_stream!(i32, |s| s as f32 / i32::MAX as f32),
    SampleFormat::I64 => build_stream!(i64, |s| s as f32 / i64::MAX as f32),
    SampleFormat::U8 => build_stream!(u8, |s| (s as f32 / u8::MAX as f32) * 2.0 - 1.0),
    SampleFormat::U16 => build_stream!(u16, |s| (s as f32 / u16::MAX as f32) * 2.0 - 1.0),
    SampleFormat::U32 => build_stream!(u32, |s| (s as f32 / u32::MAX as f32) * 2.0 - 1.0),
    SampleFormat::U64 => build_stream!(u64, |s| (s as f32 / u64::MAX as f32) * 2.0 - 1.0),
    SampleFormat::F32 => build_stream!(f32, |s| s),
    SampleFormat::F64 => build_stream!(f64, |s| s as f32),
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

struct MicStreamRuntime {
  host: cpal::Host,
  tx: SyncSender<Vec<f32>>,
  stop_flag: Arc<AtomicBool>,
  sample_rate_hz: u32,
  stream_error_flag: Arc<AtomicBool>,
  active_stream: Option<cpal::Stream>,
  reconnect_attempts: u32,
}

impl MicStreamRuntime {
  fn new(tx: SyncSender<Vec<f32>>, stop_flag: Arc<AtomicBool>, sample_rate_hz: u32) -> Self {
    Self {
      host: cpal::default_host(),
      tx,
      stop_flag,
      sample_rate_hz,
      stream_error_flag: Arc::new(AtomicBool::new(false)),
      active_stream: None,
      reconnect_attempts: 0,
    }
  }

  fn open_initial(&mut self, preferred_device: Option<&str>) -> Result<Vec<String>, NativeError> {
    let device = choose_input_device(&self.host, preferred_device)?;
    let (stream, warnings) = open_mic_stream(
      &device,
      self.tx.clone(),
      self.stop_flag.clone(),
      self.sample_rate_hz,
      self.stream_error_flag.clone(),
    )?;
    self.active_stream = Some(stream);
    Ok(warnings)
  }

  fn reset_reconnect_attempts(&mut self) {
    self.reconnect_attempts = 0;
  }

  fn has_stream_error(&self) -> bool {
    self.stream_error_flag.load(Ordering::Relaxed)
  }

  fn reconnect_if_needed(&mut self, warnings: &mut Vec<String>) -> Result<bool, NativeError> {
    if !self.stream_error_flag.load(Ordering::Relaxed) {
      return Ok(false);
    }

    self.active_stream.take();
    self.stream_error_flag.store(false, Ordering::Relaxed);

    self.reconnect_attempts += 1;
    if self.reconnect_attempts > MIC_MAX_RECONNECT_ATTEMPTS {
      warnings.push("mic_reconnect_attempts_exhausted".to_string());
      let _ = emit(Event::Warning {
        code: "mic_reconnect_failed".to_string(),
        message: "Microphone reconnection failed after maximum attempts".to_string(),
      });
      return Ok(true);
    }

    let _ = emit(Event::Warning {
      code: "mic_reconnecting".to_string(),
      message: format!(
        "Microphone stream error detected, reconnection attempt {}/{MIC_MAX_RECONNECT_ATTEMPTS}",
        self.reconnect_attempts
      ),
    });

    thread::sleep(MIC_RECONNECT_DELAY);

    if self.stop_flag.load(Ordering::Relaxed) {
      return Ok(true);
    }

    let new_device = match choose_input_device(&self.host, None) {
      Ok(device) => device,
      Err(_) => return Ok(false),
    };

    let Ok((new_stream, new_warnings)) = open_mic_stream(
      &new_device,
      self.tx.clone(),
      self.stop_flag.clone(),
      self.sample_rate_hz,
      self.stream_error_flag.clone(),
    ) else {
      return Ok(false);
    };

    self.active_stream = Some(new_stream);
    warnings.extend(new_warnings);

    let new_name = device_name(&new_device).unwrap_or_default();
    warnings.push(format!("mic_reconnected_to_{new_name}"));

    let _ = emit(Event::DeviceChanged {
      kind: "input",
      device_name: Some(new_name),
    });

    Ok(false)
  }
}

pub(crate) fn start_progress_emitter(
  started_at: u64,
  stop: Arc<AtomicBool>,
) -> thread::JoinHandle<()> {
  thread::spawn(move || {
    while !stop.load(Ordering::Relaxed) {
      thread::sleep(PROGRESS_INTERVAL);
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
      let mut warnings = Vec::new();

      if requested_channels != 1 {
        warnings.push("channels_forced_to_mono".to_string());
      }

      let mut writer = OggOpusWriter::create(&output_path)?;

      let (tx, rx): (SyncSender<Vec<f32>>, Receiver<Vec<f32>>) =
        mpsc::sync_channel(INPUT_QUEUE_CAPACITY);

      let mut mic_stream = MicStreamRuntime::new(tx, stop_flag.clone(), sample_rate_hz);
      let open_warnings = mic_stream.open_initial(mic_device_id.as_deref())?;
      warnings.extend(open_warnings);

      while !stop_flag.load(Ordering::Relaxed) {
        if let Ok(samples) = rx.recv_timeout(MIC_CAPTURE_RECV_TIMEOUT) {
          write_samples(&mut writer, &samples)?;
          mic_stream.reset_reconnect_attempts();
          continue;
        }

        if mic_stream.reconnect_if_needed(&mut warnings)? {
          break;
        }
      }

      while let Ok(samples) = rx.try_recv() {
        write_samples(&mut writer, &samples)?;
      }

      drop(mic_stream);
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
      let mut warnings = Vec::new();

      if requested_channels != 1 {
        warnings.push("channels_forced_to_mono".to_string());
      }

      let mut mic_stream = MicStreamRuntime::new(tx, stop_flag.clone(), desired_rate);
      let open_warnings = mic_stream.open_initial(mic_device_id.as_deref())?;
      warnings.extend(open_warnings);

      while !stop_flag.load(Ordering::Relaxed) {
        thread::sleep(MIC_SOURCE_POLL_INTERVAL);

        let had_stream_error = mic_stream.has_stream_error();
        if mic_stream.reconnect_if_needed(&mut warnings)? {
          break;
        }

        if !had_stream_error {
          mic_stream.reset_reconnect_attempts();
        }
      }

      drop(mic_stream);
      Ok(warnings)
    })
    .map_err(|error| {
      NativeError::Internal(format!("failed to spawn mic source thread: {error}"))
    })?;

  Ok((rx, worker))
}

fn append_audio_chunk(
  buffer: &mut Vec<f32>,
  source: AudioChunkSource,
  chunk: Vec<f32>,
  sample_rate_hz: u32,
  encoding: AudioChunkEncoding,
) {
  emit_audio_chunk(source, &chunk, sample_rate_hz, encoding);
  buffer.extend_from_slice(&chunk);
}

fn drain_available_audio_chunks(
  rx: &Receiver<Vec<f32>>,
  buffer: &mut Vec<f32>,
  source: AudioChunkSource,
  sample_rate_hz: u32,
  encoding: AudioChunkEncoding,
) {
  while let Ok(chunk) = rx.try_recv() {
    append_audio_chunk(buffer, source, chunk, sample_rate_hz, encoding);
  }
}

fn next_mix_len(
  mic_len: usize,
  speaker_len: usize,
  mic_wait_ticks: &mut u32,
  speaker_wait_ticks: &mut u32,
  stop_requested: bool,
) -> usize {
  if mic_len > 0 && speaker_len > 0 {
    *mic_wait_ticks = 0;
    *speaker_wait_ticks = 0;
    return mic_len.min(speaker_len);
  }

  if mic_len > 0 {
    *mic_wait_ticks = mic_wait_ticks.saturating_add(1);
    if *mic_wait_ticks >= UNPAIRED_FLUSH_TICKS || stop_requested {
      *mic_wait_ticks = 0;
      return mic_len;
    }
  }

  if speaker_len > 0 {
    *speaker_wait_ticks = speaker_wait_ticks.saturating_add(1);
    if *speaker_wait_ticks >= UNPAIRED_FLUSH_TICKS || stop_requested {
      *speaker_wait_ticks = 0;
      return speaker_len;
    }
  }

  0
}

fn mix_dual_samples(
  mic_buf: &[f32],
  speaker_buf: &[f32],
  mix_len: usize,
  speaker_gain: f32,
) -> Vec<f32> {
  let mut out = Vec::with_capacity(mix_len);
  for i in 0..mix_len {
    let mic_val = mic_buf.get(i).copied().unwrap_or(0.0);
    let speaker_val = speaker_buf.get(i).copied().unwrap_or(0.0);
    out.push((mic_val + speaker_val * speaker_gain).clamp(-1.0, 1.0));
  }
  out
}

fn drain_mixed_samples(buffer: &mut Vec<f32>, count: usize) {
  if buffer.len() <= count {
    buffer.clear();
  } else {
    buffer.drain(..count);
  }
}

fn write_dual_realtime_output(
  start: &CaptureStart,
  stop_flag: Arc<AtomicBool>,
) -> Result<thread::JoinHandle<Result<Vec<String>, NativeError>>, NativeError> {
  let output_path = start.output_path.clone();
  let speaker_device_id = start.speaker_device_id.clone();
  let target_sample_rate_hz = start.sample_rate_hz;
  let speaker_gain = start.speaker_gain;
  let chunk_encoding = start
    .audio_chunk_config
    .as_ref()
    .map(|c| c.encoding)
    .unwrap_or(AudioChunkEncoding::F32Le);

  let (mic_rx, mic_worker) = spawn_mic_source(start, stop_flag.clone())?;
  let (speaker_rx, speaker_worker) =
    spawn_speaker_source(speaker_device_id, target_sample_rate_hz, stop_flag.clone())?;

  let builder = thread::Builder::new().name("stitch-audio-dual-mixer".to_string());
  builder
    .spawn(move || {
      let mut writer = OggOpusWriter::create(&output_path)?;

      let mut warnings = vec!["dual_realtime_mixer_enabled".to_string()];
      let mut mic_buf: Vec<f32> = Vec::new();
      let mut speaker_buf: Vec<f32> = Vec::new();
      let mut mic_wait_ticks = 0u32;
      let mut speaker_wait_ticks = 0u32;

      loop {
        use std::sync::mpsc::RecvTimeoutError;
        match mic_rx.recv_timeout(DUAL_MIXER_RECV_TIMEOUT) {
          Ok(chunk) => append_audio_chunk(
            &mut mic_buf,
            AudioChunkSource::Mic,
            chunk,
            target_sample_rate_hz,
            chunk_encoding,
          ),
          Err(RecvTimeoutError::Disconnected) => {
            if !stop_flag.load(Ordering::Relaxed) {
              warnings.push("mic_source_disconnected_early".to_string());
            }
            stop_flag.store(true, Ordering::Relaxed);
          }
          Err(RecvTimeoutError::Timeout) => {}
        }

        drain_available_audio_chunks(
          &mic_rx,
          &mut mic_buf,
          AudioChunkSource::Mic,
          target_sample_rate_hz,
          chunk_encoding,
        );
        drain_available_audio_chunks(
          &speaker_rx,
          &mut speaker_buf,
          AudioChunkSource::Speaker,
          target_sample_rate_hz,
          chunk_encoding,
        );

        let mix_len = next_mix_len(
          mic_buf.len(),
          speaker_buf.len(),
          &mut mic_wait_ticks,
          &mut speaker_wait_ticks,
          stop_flag.load(Ordering::Relaxed),
        );

        if mix_len > 0 {
          let out = mix_dual_samples(&mic_buf, &speaker_buf, mix_len, speaker_gain);
          write_samples(&mut writer, &out)?;
          drain_mixed_samples(&mut mic_buf, mix_len);
          drain_mixed_samples(&mut speaker_buf, mix_len);
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

      Ok(warnings)
    })
    .map_err(|error| NativeError::Internal(format!("failed to spawn dual mixer thread: {error}")))
}

pub(crate) fn spawn_capture_worker(
  start: &CaptureStart,
  stop_flag: Arc<AtomicBool>,
) -> Result<thread::JoinHandle<Result<Vec<String>, NativeError>>, NativeError> {
  match start.mode {
    CaptureMode::Mic => spawn_mic_capture(start, stop_flag),
    CaptureMode::Dual => write_dual_realtime_output(start, stop_flag),
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
  use super::{UNPAIRED_FLUSH_TICKS, drain_mixed_samples, mix_dual_samples, next_mix_len};

  #[test]
  fn next_mix_len_pairs_available_streams_and_resets_waits() {
    let mut mic_wait_ticks = 3;
    let mut speaker_wait_ticks = 2;

    let mix_len = next_mix_len(4, 6, &mut mic_wait_ticks, &mut speaker_wait_ticks, false);

    assert_eq!(mix_len, 4);
    assert_eq!(mic_wait_ticks, 0);
    assert_eq!(speaker_wait_ticks, 0);
  }

  #[test]
  fn next_mix_len_waits_before_flushing_unpaired_mic() {
    let mut mic_wait_ticks = UNPAIRED_FLUSH_TICKS - 2;
    let mut speaker_wait_ticks = 0;

    let first = next_mix_len(3, 0, &mut mic_wait_ticks, &mut speaker_wait_ticks, false);
    let second = next_mix_len(3, 0, &mut mic_wait_ticks, &mut speaker_wait_ticks, false);

    assert_eq!(first, 0);
    assert_eq!(second, 3);
    assert_eq!(mic_wait_ticks, 0);
    assert_eq!(speaker_wait_ticks, 0);
  }

  #[test]
  fn next_mix_len_flushes_unpaired_speaker_on_stop() {
    let mut mic_wait_ticks = 0;
    let mut speaker_wait_ticks = 0;

    let mix_len = next_mix_len(0, 2, &mut mic_wait_ticks, &mut speaker_wait_ticks, true);

    assert_eq!(mix_len, 2);
    assert_eq!(speaker_wait_ticks, 0);
  }

  #[test]
  fn mix_dual_samples_uses_missing_stream_as_silence_and_clamps() {
    let mixed = mix_dual_samples(&[0.75], &[0.5, -0.5], 2, 1.0);

    assert_eq!(mixed, vec![1.0, -0.5]);
  }

  #[test]
  fn drain_mixed_samples_removes_consumed_prefix() {
    let mut buffer = vec![1.0, 2.0, 3.0];
    drain_mixed_samples(&mut buffer, 2);
    assert_eq!(buffer, vec![3.0]);

    drain_mixed_samples(&mut buffer, 2);
    assert!(buffer.is_empty());
  }
}
