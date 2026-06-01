use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "windows")]
use std::sync::mpsc::TrySendError;
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

#[cfg(target_os = "macos")]
use std::sync::mpsc::SyncSender;

use crate::opus_writer::OggOpusWriter;
use crate::resample::StreamResampler;
use audio_core::error::NativeError;

#[cfg(target_os = "macos")]
use ca::aggregate_device_keys as agg_keys;
#[cfg(target_os = "macos")]
use cidre::{
  av, cat, cf, cm, core_audio as ca, define_obj_type, dispatch, ns, objc, os, sc, sc::StreamOutput,
};

#[cfg(target_os = "windows")]
use std::collections::VecDeque;
#[cfg(target_os = "windows")]
use wasapi::{
  DeviceEnumerator, Direction, SampleType, ShareMode, StreamMode, WaveFormat, initialize_mta,
};

const SPEAKER_SOURCE_QUEUE_CAPACITY: usize = 128;
const SPEAKER_CAPTURE_RECV_TIMEOUT: Duration = Duration::from_millis(100);
#[cfg(target_os = "macos")]
const SPEAKER_CHUNK_SAMPLES: usize = 960;
#[cfg(target_os = "macos")]
const SCK_CAPTURE_DIMENSION: usize = 2;
#[cfg(target_os = "macos")]
const SCK_SOURCE_POLL_INTERVAL: Duration = Duration::from_millis(10);
#[cfg(target_os = "windows")]
const WASAPI_EVENT_WAIT_MS: u32 = 250;
#[cfg(target_os = "windows")]
const WASAPI_STOP_SETTLE_DELAY: Duration = Duration::from_millis(50);

#[cfg(target_os = "macos")]
define_obj_type!(
  SckAudioOutput + sc::StreamOutputImpl,
  SckAudioOutputInner,
  SCK_AUDIO_OUTPUT_CLS
);

#[cfg(target_os = "macos")]
struct SckAudioOutputInner {
  tx: SyncSender<Vec<f32>>,
}

#[cfg(target_os = "macos")]
impl sc::StreamOutput for SckAudioOutput {}

#[cfg(target_os = "macos")]
#[objc::add_methods]
impl sc::StreamOutputImpl for SckAudioOutput {
  extern "C" fn impl_stream_did_output_sample_buf(
    &mut self,
    _sel: Option<&objc::Sel>,
    _stream: &sc::Stream,
    sample_buf: &mut cm::SampleBuf,
    kind: sc::OutputType,
  ) {
    if !matches!(kind, sc::OutputType::Audio) {
      return;
    }

    let num_samples = sample_buf.num_samples();
    if num_samples <= 0 {
      return;
    }

    let Ok(abl) = sample_buf.audio_buf_list::<1>() else {
      return;
    };

    let buf = &abl.list().buffers[0];
    if buf.data.is_null() || buf.data_bytes_size == 0 {
      return;
    }

    let byte_count = buf.data_bytes_size as usize;
    let float_count = byte_count / std::mem::size_of::<f32>();
    if float_count == 0 {
      return;
    }

    let samples = unsafe { std::slice::from_raw_parts(buf.data as *const f32, float_count) };

    let channels = buf.number_channels as usize;
    let mono = if channels <= 1 {
      samples.to_vec()
    } else {
      let frames = float_count / channels;
      let mut out = Vec::with_capacity(frames);
      for frame in 0..frames {
        let start = frame * channels;
        let mut acc = 0.0f32;
        for ch in 0..channels {
          if let Some(&s) = samples.get(start + ch) {
            acc += s;
          }
        }
        out.push(acc / channels as f32);
      }
      out
    };

    let tx = &self.inner().tx;
    for chunk in mono.chunks(SPEAKER_CHUNK_SAMPLES) {
      let _ = tx.try_send(chunk.to_vec());
    }
  }
}

#[cfg(target_os = "macos")]
struct TapCtx {
  tx: SyncSender<Vec<f32>>,
  channels: usize,
  resampler: StreamResampler,
  common_format: av::audio::CommonFormat,
}

#[cfg(target_os = "macos")]
#[derive(Clone, Copy, PartialEq, Eq)]
enum SpeakerSourceChoice {
  Pending,
  ProcessTap,
  ScreenCaptureKit,
}

#[cfg(target_os = "macos")]
fn tap_send_mono(ctx: &mut TapCtx, samples: &[f32]) {
  if ctx.channels <= 1 {
    tap_send_resampled(ctx, samples);
    return;
  }

  let frame_count = samples.len() / ctx.channels;
  let mut mono = Vec::with_capacity(frame_count);
  for frame in 0..frame_count {
    let start = frame * ctx.channels;
    let mut sum = 0.0f32;
    for sample in &samples[start..start + ctx.channels] {
      sum += *sample;
    }
    mono.push(sum / ctx.channels as f32);
  }

  tap_send_resampled(ctx, &mono);
}

#[cfg(target_os = "macos")]
fn tap_send_resampled(ctx: &mut TapCtx, mono: &[f32]) {
  if let Ok(chunk) = ctx.resampler.process(mono) {
    for c in chunk.chunks(SPEAKER_CHUNK_SAMPLES) {
      let _ = ctx.tx.try_send(c.to_vec());
    }
  }
}

#[cfg(target_os = "macos")]
fn tap_read_samples<T: Copy>(buffer: &cat::AudioBuf) -> Option<&[T]> {
  let byte_count = buffer.data_bytes_size as usize;
  if byte_count == 0 || buffer.data.is_null() {
    return None;
  }
  let ptr = buffer.data as *const T;
  if !(ptr as usize).is_multiple_of(std::mem::align_of::<T>()) {
    return None;
  }
  let count = byte_count / std::mem::size_of::<T>();
  if count == 0 {
    return None;
  }
  Some(unsafe { std::slice::from_raw_parts(ptr, count) })
}

#[cfg(target_os = "macos")]
fn start_process_tap(tx: SyncSender<Vec<f32>>, target_sample_rate_hz: u32) -> Option<Box<TapCtx>> {
  let tap_desc = ca::TapDesc::with_mono_global_tap_excluding_processes(&ns::Array::new());
  let tap = tap_desc.create_process_tap().ok()?;
  let asbd = tap.asbd().ok()?;
  let format = av::AudioFormat::with_asbd(&asbd)?;

  let sub_tap = cf::DictionaryOf::with_keys_values(
    &[ca::sub_device_keys::uid()],
    &[tap.uid().unwrap().as_type_ref()],
  );
  let agg_desc = cf::DictionaryOf::with_keys_values(
    &[
      agg_keys::is_private(),
      agg_keys::tap_auto_start(),
      agg_keys::name(),
      agg_keys::uid(),
      agg_keys::tap_list(),
    ],
    &[
      cf::Boolean::value_true().as_type_ref(),
      cf::Boolean::value_true().as_type_ref(),
      cf::String::from_str("stitch-audio-tap").as_ref(),
      &cf::Uuid::new().to_cf_string(),
      &cf::ArrayOf::from_slice(&[sub_tap.as_ref()]),
    ],
  );

  let agg_device = ca::AggregateDevice::with_desc(&agg_desc).ok()?;
  let resampler =
    StreamResampler::new(asbd.sample_rate.round() as u32, target_sample_rate_hz).ok()?;

  let mut ctx = Box::new(TapCtx {
    tx,
    channels: asbd.channels_per_frame as usize,
    resampler,
    common_format: format.common_format(),
  });

  extern "C" fn io_proc(
    _device: ca::Device,
    _now: &cat::AudioTimeStamp,
    input_data: &cat::AudioBufList<1>,
    _input_time: &cat::AudioTimeStamp,
    _output_data: &mut cat::AudioBufList<1>,
    _output_time: &cat::AudioTimeStamp,
    ctx: Option<&mut TapCtx>,
  ) -> os::Status {
    let Some(ctx) = ctx else {
      return os::Status::NO_ERR;
    };
    let first = &input_data.buffers[0];
    if first.data_bytes_size == 0 || first.data.is_null() {
      return os::Status::NO_ERR;
    }
    match ctx.common_format {
      av::audio::CommonFormat::PcmF32 => {
        if let Some(samples) = tap_read_samples::<f32>(first) {
          tap_send_mono(ctx, samples);
        }
      }
      av::audio::CommonFormat::PcmF64 => {
        if let Some(samples) = tap_read_samples::<f64>(first) {
          let converted: Vec<f32> = samples.iter().map(|s| *s as f32).collect();
          tap_send_mono(ctx, &converted);
        }
      }
      av::audio::CommonFormat::PcmI32 => {
        if let Some(samples) = tap_read_samples::<i32>(first) {
          let converted: Vec<f32> = samples
            .iter()
            .map(|s| *s as f32 / i32::MAX as f32)
            .collect();
          tap_send_mono(ctx, &converted);
        }
      }
      av::audio::CommonFormat::PcmI16 => {
        if let Some(samples) = tap_read_samples::<i16>(first) {
          let converted: Vec<f32> = samples
            .iter()
            .map(|s| *s as f32 / i16::MAX as f32)
            .collect();
          tap_send_mono(ctx, &converted);
        }
      }
      _ => {}
    }
    os::Status::NO_ERR
  }

  let proc_id = agg_device.create_io_proc_id(io_proc, Some(&mut ctx)).ok()?;
  ca::device_start(agg_device, Some(proc_id)).ok()?;

  Some(ctx)
}

#[cfg(target_os = "macos")]
fn spawn_macos_speaker_source(
  _speaker_device_id: Option<String>,
  target_sample_rate_hz: u32,
  stop_flag: Arc<AtomicBool>,
) -> Result<
  (
    Receiver<Vec<f32>>,
    thread::JoinHandle<Result<Vec<String>, NativeError>>,
  ),
  NativeError,
> {
  let (tx, rx) = mpsc::sync_channel(SPEAKER_SOURCE_QUEUE_CAPACITY);
  let builder = thread::Builder::new().name("stitch-audio-speaker-source".to_string());

  let worker = builder
    .spawn(move || {
      let (tap_tx, tap_rx) = mpsc::sync_channel::<Vec<f32>>(SPEAKER_SOURCE_QUEUE_CAPACITY);
      let (sck_tx, sck_rx) = mpsc::sync_channel::<Vec<f32>>(SPEAKER_SOURCE_QUEUE_CAPACITY);

      let _tap_ctx = start_process_tap(tap_tx, target_sample_rate_hz);

      let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| NativeError::Internal(format!("failed to create tokio runtime: {e}")))?;

      rt.block_on(async {
        let sck_ok = async {
          let content = sc::ShareableContent::current().await.ok()?;
          let displays = content.displays();
          let display = displays.first()?;

          let mut cfg = sc::StreamCfg::new();
          cfg.set_captures_audio(true);
          cfg.set_excludes_current_process_audio(true);
          cfg.set_sample_rate(target_sample_rate_hz as i64);
          cfg.set_channel_count(1);
          cfg.set_width(SCK_CAPTURE_DIMENSION);
          cfg.set_height(SCK_CAPTURE_DIMENSION);
          cfg.set_minimum_frame_interval(cm::Time::new(1, 1));

          let windows = ns::Array::new();
          let filter = sc::ContentFilter::with_display_excluding_windows(display, &windows);
          let stream = sc::Stream::new(&filter, &cfg);

          let q = dispatch::Queue::serial_with_ar_pool();
          let handler = SckAudioOutput::with(SckAudioOutputInner { tx: sck_tx });
          stream
            .add_stream_output(handler.as_ref(), sc::OutputType::Audio, Some(&q))
            .ok()?;
          stream.start().await.ok()?;
          Some(())
        }
        .await;

        let mut source_choice = SpeakerSourceChoice::Pending;
        let mut decision_ticks: u32 = 0;
        // Allow ~2 seconds (200 ticks at 10ms) for audio to start flowing
        const DECISION_GRACE_TICKS: u32 = 200;

        while !stop_flag.load(Ordering::Relaxed) {
          tokio::time::sleep(SCK_SOURCE_POLL_INTERVAL).await;

          let mut tap_has_signal = false;
          while let Ok(chunk) = tap_rx.try_recv() {
            if !tap_has_signal {
              tap_has_signal = chunk.iter().any(|&s| s.abs() > 1e-6);
            }
            if matches!(
              source_choice,
              SpeakerSourceChoice::Pending | SpeakerSourceChoice::ProcessTap
            ) {
              for c in chunk.chunks(SPEAKER_CHUNK_SAMPLES) {
                let _ = tx.try_send(c.to_vec());
              }
            }
          }

          let mut got_sck = false;
          while let Ok(chunk) = sck_rx.try_recv() {
            got_sck = true;
            if source_choice == SpeakerSourceChoice::ScreenCaptureKit {
              let _ = tx.try_send(chunk);
            }
          }

          if source_choice == SpeakerSourceChoice::Pending {
            decision_ticks += 1;

            if tap_has_signal {
              source_choice = SpeakerSourceChoice::ProcessTap;
            } else if got_sck && decision_ticks >= DECISION_GRACE_TICKS {
              source_choice = SpeakerSourceChoice::ScreenCaptureKit;
            } else if decision_ticks >= DECISION_GRACE_TICKS {
              source_choice = if sck_ok.is_some() {
                SpeakerSourceChoice::ScreenCaptureKit
              } else {
                SpeakerSourceChoice::ProcessTap
              };
            }
          }
        }

        Ok(vec![match source_choice {
          SpeakerSourceChoice::Pending | SpeakerSourceChoice::ProcessTap => {
            "speaker_source_process_tap".to_string()
          }
          SpeakerSourceChoice::ScreenCaptureKit => "speaker_source_screencapturekit".to_string(),
        }])
      })
    })
    .map_err(|error| {
      NativeError::Internal(format!(
        "failed to spawn macOS speaker capture thread: {error}"
      ))
    })?;

  Ok((rx, worker))
}

#[cfg(target_os = "windows")]
fn decode_speaker_frames(
  bytes: &[u8],
  channels: usize,
  sample_type: SampleType,
  bits_per_sample: u16,
) -> Result<Vec<f32>, NativeError> {
  if channels == 0 {
    return Ok(Vec::new());
  }

  // Preserve existing transcription behavior by using the first channel as mono.
  match (sample_type, bits_per_sample) {
    (SampleType::Float, 32) => {
      let frame_size = channels * 4;
      let frame_count = bytes.len() / frame_size;
      let mut out = Vec::with_capacity(frame_count);
      for frame_index in 0..frame_count {
        let offset = frame_index * frame_size;
        let raw = [
          bytes[offset],
          bytes[offset + 1],
          bytes[offset + 2],
          bytes[offset + 3],
        ];
        out.push(f32::from_le_bytes(raw));
      }
      Ok(out)
    }
    (SampleType::Int, 16) => {
      let frame_size = channels * 2;
      let frame_count = bytes.len() / frame_size;
      let mut out = Vec::with_capacity(frame_count);
      for frame_index in 0..frame_count {
        let offset = frame_index * frame_size;
        let raw = [bytes[offset], bytes[offset + 1]];
        out.push(i16::from_le_bytes(raw) as f32 / i16::MAX as f32);
      }
      Ok(out)
    }
    (SampleType::Int, 32) => {
      let frame_size = channels * 4;
      let frame_count = bytes.len() / frame_size;
      let mut out = Vec::with_capacity(frame_count);
      for frame_index in 0..frame_count {
        let offset = frame_index * frame_size;
        let raw = [
          bytes[offset],
          bytes[offset + 1],
          bytes[offset + 2],
          bytes[offset + 3],
        ];
        out.push(i32::from_le_bytes(raw) as f32 / i32::MAX as f32);
      }
      Ok(out)
    }
    _ => Err(NativeError::StreamFailed(format!(
      "unsupported WASAPI format: {:?} {}-bit",
      sample_type, bits_per_sample
    ))),
  }
}

#[cfg(target_os = "windows")]
fn spawn_windows_speaker_source(
  target_sample_rate_hz: u32,
  stop_flag: Arc<AtomicBool>,
) -> Result<
  (
    Receiver<Vec<f32>>,
    thread::JoinHandle<Result<Vec<String>, NativeError>>,
  ),
  NativeError,
> {
  let (tx, rx) = mpsc::sync_channel(SPEAKER_SOURCE_QUEUE_CAPACITY);
  let builder = thread::Builder::new().name("stitch-audio-speaker-source".to_string());

  let worker = builder
    .spawn(move || {
      initialize_mta().ok().map_err(|error| {
        NativeError::Internal(format!("failed to initialize WASAPI MTA: {error}"))
      })?;

      let enumerator = DeviceEnumerator::new().map_err(|error| {
        NativeError::StreamFailed(format!("failed to create WASAPI enumerator: {error}"))
      })?;
      let device = enumerator
        .get_default_device(&Direction::Render)
        .map_err(|error| {
          NativeError::DeviceNotFound(format!("failed to get default render device: {error}"))
        })?;
      let mut audio_client = device.get_iaudioclient().map_err(|error| {
        NativeError::StreamFailed(format!("failed to get IAudioClient: {error}"))
      })?;

      let mix_format = audio_client.get_mixformat().map_err(|error| {
        NativeError::StreamFailed(format!("failed to get WASAPI mix format: {error}"))
      })?;
      let desired_format = WaveFormat::new(
        32,
        32,
        &SampleType::Float,
        mix_format.get_samplespersec() as usize,
        mix_format.get_nchannels() as usize,
        Some(mix_format.get_dwchannelmask()),
      );
      let accepted_format = audio_client
        .is_supported(&desired_format, &ShareMode::Shared)
        .map_err(|error| {
          NativeError::StreamFailed(format!(
            "failed to query WASAPI shared-mode support: {error}"
          ))
        })?
        .unwrap_or(desired_format);

      let channels = accepted_format.get_nchannels() as usize;
      let source_sample_rate_hz = accepted_format.get_samplespersec() as u32;
      let mut resampler = StreamResampler::new(source_sample_rate_hz, target_sample_rate_hz)?;
      let sample_type = accepted_format.get_subformat().map_err(|error| {
        NativeError::StreamFailed(format!("unsupported WASAPI sample type: {error}"))
      })?;
      let bits_per_sample = accepted_format.get_bitspersample();

      let (_default_period, min_period) = audio_client.get_device_period().map_err(|error| {
        NativeError::StreamFailed(format!("failed to get WASAPI device period: {error}"))
      })?;
      let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: min_period,
      };

      audio_client
        .initialize_client(&accepted_format, &Direction::Capture, &mode)
        .map_err(|error| {
          NativeError::PermissionDenied(format!(
            "failed to initialize WASAPI loopback stream: {error}"
          ))
        })?;

      let event = audio_client.set_get_eventhandle().map_err(|error| {
        NativeError::StreamFailed(format!("failed to create WASAPI event handle: {error}"))
      })?;
      let capture_client = audio_client.get_audiocaptureclient().map_err(|error| {
        NativeError::StreamFailed(format!("failed to get WASAPI capture client: {error}"))
      })?;

      audio_client.start_stream().map_err(|error| {
        NativeError::PermissionDenied(format!("failed to start WASAPI loopback stream: {error}"))
      })?;

      let mut queue = VecDeque::new();
      let mut dropped_chunks = 0u64;

      while !stop_flag.load(Ordering::Relaxed) {
        if event.wait_for_event(WASAPI_EVENT_WAIT_MS).is_err() {
          continue;
        }

        queue.clear();
        if let Err(error) = capture_client.read_from_device_to_deque(&mut queue) {
          let _ = audio_client.stop_stream();
          return Err(NativeError::StreamFailed(format!(
            "failed reading WASAPI loopback stream: {error}"
          )));
        }

        if queue.is_empty() {
          continue;
        }

        let samples = decode_speaker_frames(
          queue.make_contiguous(),
          channels,
          sample_type,
          bits_per_sample,
        )?;
        let resampled = resampler.process(&samples)?;
        if resampled.is_empty() {
          continue;
        }

        match tx.try_send(resampled) {
          Ok(()) => {}
          Err(TrySendError::Full(_)) => {
            dropped_chunks = dropped_chunks.saturating_add(1);
          }
          Err(TrySendError::Disconnected(_)) => break,
        }
      }

      thread::sleep(WASAPI_STOP_SETTLE_DELAY);
      let _ = audio_client.stop_stream();

      let mut warnings = Vec::new();
      if dropped_chunks > 0 {
        warnings.push(format!(
          "speaker_source_backpressure_dropped_chunks_{dropped_chunks}"
        ));
      }

      Ok(warnings)
    })
    .map_err(|error| {
      NativeError::Internal(format!("failed to spawn speaker capture thread: {error}"))
    })?;

  Ok((rx, worker))
}

pub(crate) fn spawn_speaker_source(
  speaker_device_id: Option<String>,
  target_sample_rate_hz: u32,
  stop_flag: Arc<AtomicBool>,
) -> Result<
  (
    Receiver<Vec<f32>>,
    thread::JoinHandle<Result<Vec<String>, NativeError>>,
  ),
  NativeError,
> {
  #[cfg(target_os = "macos")]
  {
    return spawn_macos_speaker_source(speaker_device_id, target_sample_rate_hz, stop_flag);
  }

  #[cfg(target_os = "windows")]
  {
    let _ = speaker_device_id;
    return spawn_windows_speaker_source(target_sample_rate_hz, stop_flag);
  }

  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  {
    let _ = speaker_device_id;
    let _ = target_sample_rate_hz;
    let _ = stop_flag;
    Err(NativeError::StreamFailed(
      "speaker capture is currently supported on Windows and macOS only".to_string(),
    ))
  }
}

pub(crate) fn spawn_speaker_capture(
  output_path: String,
  speaker_device_id: Option<String>,
  target_sample_rate_hz: u32,
  stop_flag: Arc<AtomicBool>,
) -> Result<thread::JoinHandle<Result<Vec<String>, NativeError>>, NativeError> {
  let (rx, source_worker) =
    spawn_speaker_source(speaker_device_id, target_sample_rate_hz, stop_flag.clone())?;

  let builder = thread::Builder::new().name("stitch-audio-speaker-capture".to_string());
  builder
    .spawn(move || {
      let mut writer = OggOpusWriter::create(&output_path)?;

      while !stop_flag.load(Ordering::Relaxed) {
        if let Ok(samples) = rx.recv_timeout(SPEAKER_CAPTURE_RECV_TIMEOUT) {
          writer.write_samples(&samples)?;
        }
      }

      while let Ok(samples) = rx.try_recv() {
        writer.write_samples(&samples)?;
      }

      writer.finalize()?;

      let mut warnings = source_worker
        .join()
        .map_err(|_| NativeError::Internal("speaker source thread panicked".to_string()))??;
      warnings.push(format!(
        "speaker_capture_sample_rate_{target_sample_rate_hz}"
      ));

      Ok(warnings)
    })
    .map_err(|error| {
      NativeError::Internal(format!("failed to spawn speaker capture thread: {error}"))
    })
}

#[cfg(test)]
mod tests {
  #[cfg(target_os = "macos")]
  #[test]
  fn tap_send_mono_passes_through_single_channel() {
    use super::{TapCtx, tap_send_mono};
    use cidre::av;
    use std::sync::mpsc;

    let (tx, rx) = mpsc::sync_channel(1);
    let mut ctx = TapCtx {
      tx,
      channels: 1,
      resampler: super::StreamResampler::new(16_000, 16_000).expect("resampler init"),
      common_format: av::audio::CommonFormat::PcmF32,
    };

    tap_send_mono(&mut ctx, &[0.1, 0.2, 0.3]);
    let chunk = rx.recv().expect("chunk should be sent");
    assert_eq!(chunk, vec![0.1, 0.2, 0.3]);
  }

  #[cfg(target_os = "macos")]
  #[test]
  fn tap_send_mono_downmixes_multichannel() {
    use super::{TapCtx, tap_send_mono};
    use cidre::av;
    use std::sync::mpsc;

    let (tx, rx) = mpsc::sync_channel(1);
    let mut ctx = TapCtx {
      tx,
      channels: 2,
      resampler: super::StreamResampler::new(16_000, 16_000).expect("resampler init"),
      common_format: av::audio::CommonFormat::PcmF32,
    };

    tap_send_mono(&mut ctx, &[0.2, 0.4, -0.2, 0.2]);
    let chunk = rx.recv().expect("chunk should be sent");
    assert_eq!(chunk.len(), 2);
    assert!((chunk[0] - 0.3).abs() < 0.0001);
    assert!((chunk[1] - 0.0).abs() < 0.0001);
  }

  #[cfg(target_os = "windows")]
  #[test]
  fn decode_wasapi_float32_frames_uses_first_channel() {
    use super::decode_speaker_frames;
    use wasapi::SampleType;

    let left = 0.5f32.to_le_bytes();
    let right = (-0.5f32).to_le_bytes();
    let bytes = [
      left[0], left[1], left[2], left[3], right[0], right[1], right[2], right[3],
    ];

    let decoded =
      decode_speaker_frames(&bytes, 2, SampleType::Float, 32).expect("decode should work");
    assert_eq!(decoded.len(), 1);
    assert!((decoded[0] - 0.5).abs() < 0.001);
  }

  #[cfg(target_os = "windows")]
  #[test]
  fn decode_wasapi_i16_frames_uses_first_channel() {
    use super::decode_speaker_frames;
    use wasapi::SampleType;

    let left = (i16::MAX / 2).to_le_bytes();
    let right = i16::MIN.to_le_bytes();
    let bytes = [left[0], left[1], right[0], right[1]];

    let decoded =
      decode_speaker_frames(&bytes, 2, SampleType::Int, 16).expect("decode should work");
    assert_eq!(decoded.len(), 1);
    assert!(decoded[0] > 0.4 && decoded[0] < 0.6);
  }
}
