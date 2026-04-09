use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "macos")]
use std::sync::mpsc::SyncSender;
use std::sync::mpsc::{self, Receiver, TrySendError};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use crate::error::NativeError;

#[cfg(target_os = "macos")]
use ca::aggregate_device_keys as agg_keys;
#[cfg(target_os = "macos")]
use cidre::{arc, av, cat, cf, core_audio as ca, ns, os};

#[cfg(target_os = "windows")]
use wasapi::{
  initialize_mta, DeviceEnumerator, Direction, SampleType, ShareMode, StreamMode, WaveFormat,
};

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

#[cfg(target_os = "macos")]
struct MacSpeakerCtx {
  tx: SyncSender<Vec<f32>>,
  channels: usize,
  common_format: av::audio::CommonFormat,
}

#[cfg(target_os = "macos")]
fn read_samples<T: Copy>(buffer: &cat::AudioBuf) -> Option<&[T]> {
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
fn send_mono_chunk_f32(ctx: &mut MacSpeakerCtx, samples: &[f32]) {
  if ctx.channels <= 1 {
    let _ = ctx.tx.try_send(samples.to_vec());
    return;
  }

  let frames = samples.len() / ctx.channels;
  let mut mono = Vec::with_capacity(frames);
  for frame in 0..frames {
    let start = frame * ctx.channels;
    let mut acc = 0.0f32;
    for sample in &samples[start..start + ctx.channels] {
      acc += *sample;
    }
    mono.push(acc / ctx.channels as f32);
  }

  let _ = ctx.tx.try_send(mono);
}

#[cfg(target_os = "macos")]
fn spawn_macos_speaker_source(
  speaker_device_id: Option<String>,
  stop_flag: Arc<AtomicBool>,
) -> Result<
  (
    Receiver<Vec<f32>>,
    thread::JoinHandle<Result<Vec<String>, NativeError>>,
  ),
  NativeError,
> {
  let (tx, rx) = mpsc::sync_channel(128);
  let builder = thread::Builder::new().name("stitch-audio-speaker-source".to_string());

  let worker = builder
    .spawn(move || {
      extern "C" fn proc(
        _device: ca::Device,
        _now: &cat::AudioTimeStamp,
        input_data: &cat::AudioBufList<1>,
        _input_time: &cat::AudioTimeStamp,
        _output_data: &mut cat::AudioBufList<1>,
        _output_time: &cat::AudioTimeStamp,
        ctx: Option<&mut MacSpeakerCtx>,
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
            if let Some(samples) = read_samples::<f32>(first) {
              send_mono_chunk_f32(ctx, samples);
            }
          }
          av::audio::CommonFormat::PcmF64 => {
            if let Some(samples) = read_samples::<f64>(first) {
              let converted: Vec<f32> = samples.iter().map(|s| *s as f32).collect();
              send_mono_chunk_f32(ctx, &converted);
            }
          }
          av::audio::CommonFormat::PcmI32 => {
            if let Some(samples) = read_samples::<i32>(first) {
              let converted: Vec<f32> = samples
                .iter()
                .map(|s| *s as f32 / i32::MAX as f32)
                .collect();
              send_mono_chunk_f32(ctx, &converted);
            }
          }
          av::audio::CommonFormat::PcmI16 => {
            if let Some(samples) = read_samples::<i16>(first) {
              let converted: Vec<f32> = samples
                .iter()
                .map(|s| *s as f32 / i16::MAX as f32)
                .collect();
              send_mono_chunk_f32(ctx, &converted);
            }
          }
          _ => {}
        }

        os::Status::NO_ERR
      }

      let tap_desc = ca::TapDesc::with_mono_global_tap_excluding_processes(&ns::Array::new());
      let tap = tap_desc.create_process_tap().map_err(|error| {
        NativeError::StreamFailed(format!("failed to create CoreAudio process tap: {error}"))
      })?;

      let asbd = tap.asbd().map_err(|error| {
        NativeError::StreamFailed(format!("failed to read tap format: {error}"))
      })?;
      let format = av::AudioFormat::with_asbd(&asbd).map_err(|error| {
        NativeError::StreamFailed(format!("failed to build audio format from tap: {error}"))
      })?;

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
          cf::Boolean::value_false(),
          cf::String::from_str("stitch-audio-tap").as_ref(),
          &cf::Uuid::new().to_cf_string(),
          &cf::ArrayOf::from_slice(&[sub_tap.as_ref()]),
        ],
      );

      let agg_device = ca::AggregateDevice::with_desc(&agg_desc).map_err(|error| {
        NativeError::PermissionDenied(format!("failed to create aggregate device: {error}"))
      })?;

      let mut ctx = Box::new(MacSpeakerCtx {
        tx,
        channels: asbd.channels_per_frame as usize,
        common_format: format.common_format(),
      });

      let proc_id = agg_device
        .create_io_proc_id(proc, Some(&mut ctx))
        .map_err(|error| NativeError::StreamFailed(format!("failed to create io proc: {error}")))?;
      let _started = ca::device_start(agg_device, Some(proc_id)).map_err(|error| {
        NativeError::PermissionDenied(format!("failed to start CoreAudio tap device: {error}"))
      })?;

      while !stop_flag.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_millis(50));
      }

      let mut warnings = vec!["macos_coreaudio_process_tap_enabled".to_string()];
      if speaker_device_id.is_some() {
        warnings.push("speaker_device_id_ignored_with_coreaudio_tap".to_string());
      }

      Ok(warnings)
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
  stop_flag: Arc<AtomicBool>,
) -> Result<
  (
    Receiver<Vec<f32>>,
    thread::JoinHandle<Result<Vec<String>, NativeError>>,
  ),
  NativeError,
> {
  let (tx, rx) = mpsc::sync_channel(128);
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

      while !stop_flag.load(Ordering::Acquire) {
        if event.wait_for_event(250).is_err() {
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

        match tx.try_send(samples) {
          Ok(()) => {}
          Err(TrySendError::Full(_)) => {}
          Err(TrySendError::Disconnected(_)) => break,
        }
      }

      thread::sleep(Duration::from_millis(50));
      let _ = audio_client.stop_stream();

      Ok(Vec::new())
    })
    .map_err(|error| {
      NativeError::Internal(format!("failed to spawn speaker capture thread: {error}"))
    })?;

  Ok((rx, worker))
}

pub(crate) fn spawn_speaker_source(
  speaker_device_id: Option<String>,
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
    return spawn_macos_speaker_source(speaker_device_id, stop_flag);
  }

  #[cfg(target_os = "windows")]
  {
    let _ = speaker_device_id;
    return spawn_windows_speaker_source(stop_flag);
  }

  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  {
    let _ = speaker_device_id;
    let _ = stop_flag;
    Err(NativeError::StreamFailed(
      "speaker capture is currently supported on Windows and macOS only".to_string(),
    ))
  }
}

pub(crate) fn spawn_speaker_capture(
  output_path: String,
  speaker_device_id: Option<String>,
  stop_flag: Arc<AtomicBool>,
) -> Result<thread::JoinHandle<Result<Vec<String>, NativeError>>, NativeError> {
  let (rx, source_worker) = spawn_speaker_source(speaker_device_id, stop_flag.clone())?;

  let builder = thread::Builder::new().name("stitch-audio-speaker-capture".to_string());
  builder
    .spawn(move || {
      let wav_spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16_000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
      };
      let mut writer = hound::WavWriter::create(output_path, wav_spec)
        .map_err(|error| NativeError::Internal(format!("failed to create wav file: {error}")))?;

      while !stop_flag.load(Ordering::Relaxed) {
        if let Ok(samples) = rx.recv_timeout(Duration::from_millis(100)) {
          write_samples_as_i16(&mut writer, &samples)?;
        }
      }

      while let Ok(samples) = rx.try_recv() {
        write_samples_as_i16(&mut writer, &samples)?;
      }

      writer
        .flush()
        .map_err(|error| NativeError::Internal(format!("failed to flush wav file: {error}")))?;
      writer
        .finalize()
        .map_err(|error| NativeError::Internal(format!("failed to finalize wav file: {error}")))?;

      let mut warnings = source_worker
        .join()
        .map_err(|_| NativeError::Internal("speaker source thread panicked".to_string()))??;
      warnings.push("speaker_capture_sample_rate_assumed_16000".to_string());

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
  fn send_mono_chunk_passes_through_single_channel() {
    use super::{send_mono_chunk_f32, MacSpeakerCtx};
    use cidre::av;
    use std::sync::mpsc;

    let (tx, rx) = mpsc::sync_channel(1);
    let mut ctx = MacSpeakerCtx {
      tx,
      channels: 1,
      common_format: av::audio::CommonFormat::PcmF32,
    };

    send_mono_chunk_f32(&mut ctx, &[0.1, 0.2, 0.3]);
    let chunk = rx.recv().expect("chunk should be sent");
    assert_eq!(chunk, vec![0.1, 0.2, 0.3]);
  }

  #[cfg(target_os = "macos")]
  #[test]
  fn send_mono_chunk_downmixes_multichannel() {
    use super::{send_mono_chunk_f32, MacSpeakerCtx};
    use cidre::av;
    use std::sync::mpsc;

    let (tx, rx) = mpsc::sync_channel(1);
    let mut ctx = MacSpeakerCtx {
      tx,
      channels: 2,
      common_format: av::audio::CommonFormat::PcmF32,
    };

    send_mono_chunk_f32(&mut ctx, &[0.2, 0.4, -0.2, 0.2]);
    let chunk = rx.recv().expect("chunk should be sent");
    assert_eq!(chunk.len(), 2);
    assert!((chunk[0] - 0.3).abs() < 0.0001);
    assert!((chunk[1] - 0.0).abs() < 0.0001);
  }

  #[cfg(target_os = "windows")]
  #[test]
  fn decode_wasapi_float32_frames_to_mono() {
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
  fn decode_wasapi_i16_frames_to_mono() {
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
