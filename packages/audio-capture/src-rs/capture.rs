use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender, TrySendError};
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SizedSample};

use crate::device::{device_display_name, is_tap_device};
use crate::error::NativeError;
use crate::protocol::{
  AudioChunkEncoding, AudioChunkSource, Emitter, emit_audio_chunk, emit_device_changed,
  emit_warning,
};
use crate::resample::StreamResampler;

const INPUT_QUEUE_CAPACITY: usize = 128;
const MIC_CAPTURE_RECV_TIMEOUT: Duration = Duration::from_millis(100);
const MIC_RECONNECT_DELAY: Duration = Duration::from_secs(2);
const MIC_MAX_RECONNECT_ATTEMPTS: u32 = 5;

fn device_name(device: &cpal::Device) -> Option<String> {
  device_display_name(device)
}

fn choose_input_device(
  host: &cpal::Host,
  preferred: Option<&str>,
  emitter: &Emitter,
) -> Result<cpal::Device, NativeError> {
  if let Some(name) = preferred {
    let mut devices = host.input_devices().map_err(|error| {
      NativeError::StreamFailed(format!("failed to enumerate input devices: {error}"))
    })?;

    if let Some(device) =
      devices.find(|d| device_name(d).as_deref() == Some(name) && !is_tap_device(name))
    {
      return Ok(device);
    }

    emit_warning(
      emitter,
      "preferred_device_unavailable",
      format!("preferred microphone '{name}' not found, falling back to default"),
    );
  }

  if let Some(device) = host.default_input_device() {
    if !device_name(&device).map_or(false, |n| is_tap_device(&n)) {
      return Ok(device);
    }
  }

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
  output_sample_rate_hz: u32,
  stream_error_flag: Arc<AtomicBool>,
  emitter: Emitter,
  convert: impl Fn(T) -> f32 + Send + 'static + Copy,
) -> Result<cpal::Stream, NativeError>
where
  T: SizedSample + Send + 'static,
{
  let channels = config.channels as usize;
  let input_sample_rate_hz = config.sample_rate;
  let mut resampler = StreamResampler::new(input_sample_rate_hz, output_sample_rate_hz)?;
  let err_emitter = emitter.clone();
  let err_handler = move |error: cpal::StreamError| {
    stream_error_flag.store(true, Ordering::Relaxed);
    emit_warning(&err_emitter, "stream_callback_error", error.to_string());
  };

  device
    .build_input_stream(
      config,
      move |data: &[T], _| {
        if stop_flag.load(Ordering::Relaxed) {
          return;
        }

        let mono = downmix_to_mono_f32(data, channels, convert);
        let chunk = match resampler.process(&mono) {
          Ok(resampled) => resampled,
          Err(error) => {
            emit_warning(&emitter, "resample_failed", error.to_string());
            return;
          }
        };

        if chunk.is_empty() {
          return;
        }

        match tx.try_send(chunk) {
          Ok(()) => {}
          Err(TrySendError::Full(_)) => {
            emit_warning(
              &emitter,
              "input_backpressure",
              "input queue is full; dropping audio chunk",
            );
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

fn open_mic_stream(
  device: &cpal::Device,
  tx: SyncSender<Vec<f32>>,
  stop_flag: Arc<AtomicBool>,
  target_sample_rate_hz: u32,
  stream_error_flag: Arc<AtomicBool>,
  emitter: &Emitter,
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
  let rate = target_sample_rate_hz;
  macro_rules! build_stream {
    ($sample:ty, $convert:expr) => {
      build_input_stream::<$sample>(
        device,
        &stream_config,
        tx,
        stop_flag,
        rate,
        stream_error_flag,
        emitter.clone(),
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
  emitter: Emitter,
}

impl MicStreamRuntime {
  fn new(
    tx: SyncSender<Vec<f32>>,
    stop_flag: Arc<AtomicBool>,
    sample_rate_hz: u32,
    emitter: Emitter,
  ) -> Self {
    Self {
      host: cpal::default_host(),
      tx,
      stop_flag,
      sample_rate_hz,
      stream_error_flag: Arc::new(AtomicBool::new(false)),
      active_stream: None,
      reconnect_attempts: 0,
      emitter,
    }
  }

  fn open_initial(&mut self, preferred_device: Option<&str>) -> Result<Vec<String>, NativeError> {
    let device = choose_input_device(&self.host, preferred_device, &self.emitter)?;
    let (stream, warnings) = open_mic_stream(
      &device,
      self.tx.clone(),
      self.stop_flag.clone(),
      self.sample_rate_hz,
      self.stream_error_flag.clone(),
      &self.emitter,
    )?;
    self.active_stream = Some(stream);
    Ok(warnings)
  }

  fn reset_reconnect_attempts(&mut self) {
    self.reconnect_attempts = 0;
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
      emit_warning(
        &self.emitter,
        "mic_reconnect_failed",
        "Microphone reconnection failed after maximum attempts",
      );
      return Ok(true);
    }

    emit_warning(
      &self.emitter,
      "mic_reconnecting",
      format!(
        "Microphone stream error detected, reconnection attempt {}/{MIC_MAX_RECONNECT_ATTEMPTS}",
        self.reconnect_attempts
      ),
    );

    thread::sleep(MIC_RECONNECT_DELAY);

    if self.stop_flag.load(Ordering::Relaxed) {
      return Ok(true);
    }

    let new_device = match choose_input_device(&self.host, None, &self.emitter) {
      Ok(device) => device,
      Err(_) => return Ok(false),
    };

    let Ok((new_stream, new_warnings)) = open_mic_stream(
      &new_device,
      self.tx.clone(),
      self.stop_flag.clone(),
      self.sample_rate_hz,
      self.stream_error_flag.clone(),
      &self.emitter,
    ) else {
      return Ok(false);
    };

    self.active_stream = Some(new_stream);
    warnings.extend(new_warnings);

    let new_name = device_name(&new_device).unwrap_or_default();
    warnings.push(format!("mic_reconnected_to_{new_name}"));

    emit_device_changed(&self.emitter, "input", Some(new_name));

    Ok(false)
  }
}

pub fn spawn_mic_worker(
  mic_device_id: Option<String>,
  sample_rate_hz: u32,
  encoding: AudioChunkEncoding,
  stop_flag: Arc<AtomicBool>,
  emitter: Emitter,
) -> Result<thread::JoinHandle<Result<Vec<String>, NativeError>>, NativeError> {
  let builder = thread::Builder::new().name("stitch-audio-mic-capture".to_string());
  builder
    .spawn(move || {
      let mut warnings = Vec::new();

      let (tx, rx): (SyncSender<Vec<f32>>, Receiver<Vec<f32>>) =
        mpsc::sync_channel(INPUT_QUEUE_CAPACITY);

      let mut mic_stream =
        MicStreamRuntime::new(tx, stop_flag.clone(), sample_rate_hz, emitter.clone());
      let open_warnings = mic_stream.open_initial(mic_device_id.as_deref())?;
      warnings.extend(open_warnings);

      while !stop_flag.load(Ordering::Relaxed) {
        if let Ok(samples) = rx.recv_timeout(MIC_CAPTURE_RECV_TIMEOUT) {
          emit_audio_chunk(
            &emitter,
            AudioChunkSource::Mic,
            &samples,
            sample_rate_hz,
            encoding,
          );
          mic_stream.reset_reconnect_attempts();
          continue;
        }

        if mic_stream.reconnect_if_needed(&mut warnings)? {
          break;
        }
      }

      while let Ok(samples) = rx.try_recv() {
        emit_audio_chunk(
          &emitter,
          AudioChunkSource::Mic,
          &samples,
          sample_rate_hz,
          encoding,
        );
      }

      drop(mic_stream);

      Ok(warnings)
    })
    .map_err(|error| NativeError::Internal(format!("failed to spawn capture thread: {error}")))
}

#[cfg(test)]
mod tests {
  use super::downmix_to_mono_f32;

  #[test]
  fn downmix_mono_passes_through() {
    let out = downmix_to_mono_f32(&[0.1f32, 0.2, 0.3], 1, |s| s);
    assert_eq!(out, vec![0.1, 0.2, 0.3]);
  }

  #[test]
  fn downmix_stereo_averages_channels() {
    let out = downmix_to_mono_f32(&[0.2f32, 0.4, -0.2, 0.2], 2, |s| s);
    assert_eq!(out.len(), 2);
    assert!((out[0] - 0.3).abs() < 0.0001);
    assert!((out[1] - 0.0).abs() < 0.0001);
  }
}
