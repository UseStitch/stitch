use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;

use audio_core::error::NativeError;

use crate::resample::StreamResampler;

const AEC_SOURCE_QUEUE_CAPACITY: usize = 128;

/// Attempt to open an AEC-enabled mic capture stream.
/// Returns the receiver for echo-cancelled audio and the worker thread handle.
/// Returns Err if AEC is not supported — caller should fallback to regular capture.
#[allow(clippy::needless_return)]
pub(crate) fn spawn_aec_mic_source(
  preferred_device: Option<&str>,
  target_sample_rate_hz: u32,
  stop_flag: Arc<AtomicBool>,
) -> crate::AudioSourceResult {
  #[cfg(target_os = "windows")]
  {
    return spawn_windows_aec_mic_source(preferred_device, target_sample_rate_hz, stop_flag);
  }

  #[cfg(target_os = "macos")]
  {
    return spawn_macos_aec_mic_source(preferred_device, target_sample_rate_hz, stop_flag);
  }

  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  {
    let _ = (preferred_device, target_sample_rate_hz, stop_flag);
    Err(NativeError::StreamFailed(
      "AEC is not supported on this platform".to_string(),
    ))
  }
}

// ─── Windows AEC Implementation ───────────────────────────────────────────────

#[cfg(target_os = "windows")]
use std::collections::VecDeque;
#[cfg(target_os = "windows")]
use wasapi::{
  initialize_mta, AudioClientProperties, DeviceEnumerator, Direction, Role, SampleType, ShareMode,
  StreamCategory, StreamMode, WaveFormat,
};

#[cfg(target_os = "windows")]
const WASAPI_AEC_EVENT_WAIT_MS: u32 = 250;

#[cfg(target_os = "windows")]
fn spawn_windows_aec_mic_source(
  _preferred_device: Option<&str>,
  target_sample_rate_hz: u32,
  stop_flag: Arc<AtomicBool>,
) -> crate::AudioSourceResult {
  let (tx, rx) = mpsc::sync_channel(AEC_SOURCE_QUEUE_CAPACITY);
  let builder = thread::Builder::new().name("stitch-audio-aec-source".to_string());

  let worker = builder
    .spawn(move || -> Result<Vec<String>, NativeError> {
      initialize_mta().ok().map_err(|error| {
        NativeError::Internal(format!("failed to initialize WASAPI MTA: {error}"))
      })?;

      let enumerator = DeviceEnumerator::new().map_err(|error| {
        NativeError::StreamFailed(format!("failed to create WASAPI enumerator: {error}"))
      })?;

      // Use the Communications role capture device — this is the device Windows
      // designates for VOIP/communications scenarios.
      let device = enumerator
        .get_default_device_for_role(&Direction::Capture, &Role::Communications)
        .map_err(|error| {
          NativeError::DeviceNotFound(format!(
            "failed to get communications capture device: {error}"
          ))
        })?;

      let mut audio_client = device.get_iaudioclient().map_err(|error| {
        NativeError::StreamFailed(format!("failed to get IAudioClient: {error}"))
      })?;

      // Set category to Communications — this enables the OS audio pipeline's
      // AEC/NS Audio Processing Objects.
      let properties = AudioClientProperties::new().set_category(StreamCategory::Communications);
      audio_client.set_properties(properties).map_err(|error| {
        NativeError::StreamFailed(format!("failed to set communications properties: {error}"))
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
      let source_sample_rate_hz = accepted_format.get_samplespersec();
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
          NativeError::StreamFailed(format!(
            "failed to initialize WASAPI AEC capture stream: {error}"
          ))
        })?;

      // Check if AEC is actually supported and configure the render endpoint reference.
      let mut warnings = Vec::new();
      let aec_active = match audio_client.is_aec_supported() {
        Ok(true) => {
          // Set the render endpoint for echo reference.
          if let Ok(aec_ctrl) = audio_client.get_aec_control() {
            // Get the default render device to use as AEC reference.
            let render_endpoint_id = enumerator
              .get_default_device(&Direction::Render)
              .ok()
              .and_then(|d| d.get_id().ok());
            if let Err(error) = aec_ctrl.set_echo_cancellation_render_endpoint(render_endpoint_id) {
              warnings.push(format!("aec_set_render_endpoint_failed: {error}"));
            }
          }
          true
        }
        Ok(false) => {
          // AEC effect not present — return error to trigger fallback.
          return Err(NativeError::StreamFailed(
            "AEC not supported on this capture device".to_string(),
          ));
        }
        Err(error) => {
          // Could not determine AEC support — return error to trigger fallback.
          return Err(NativeError::StreamFailed(format!(
            "failed to check AEC support: {error}"
          )));
        }
      };

      if aec_active {
        warnings.push("aec_enabled_windows".to_string());
      }

      let event = audio_client.set_get_eventhandle().map_err(|error| {
        NativeError::StreamFailed(format!("failed to create WASAPI event handle: {error}"))
      })?;
      let capture_client = audio_client.get_audiocaptureclient().map_err(|error| {
        NativeError::StreamFailed(format!("failed to get WASAPI capture client: {error}"))
      })?;

      let mut resampler = StreamResampler::new(source_sample_rate_hz, target_sample_rate_hz)?;

      audio_client.start_stream().map_err(|error| {
        NativeError::StreamFailed(format!(
          "failed to start WASAPI AEC capture stream: {error}"
        ))
      })?;

      let mut queue = VecDeque::new();

      while !stop_flag.load(Ordering::Relaxed) {
        if event.wait_for_event(WASAPI_AEC_EVENT_WAIT_MS).is_err() {
          continue;
        }

        queue.clear();
        if let Err(error) = capture_client.read_from_device_to_deque(&mut queue) {
          let _ = audio_client.stop_stream();
          return Err(NativeError::StreamFailed(format!(
            "failed reading WASAPI AEC capture stream: {error}"
          )));
        }

        if queue.is_empty() {
          continue;
        }

        let samples = decode_aec_frames(
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
          Err(mpsc::TrySendError::Full(_)) => {}
          Err(mpsc::TrySendError::Disconnected(_)) => break,
        }
      }

      let _ = audio_client.stop_stream();
      Ok(warnings)
    })
    .map_err(|error| {
      NativeError::Internal(format!("failed to spawn AEC capture thread: {error}"))
    })?;

  Ok((rx, worker))
}

#[cfg(target_os = "windows")]
fn decode_aec_frames(
  bytes: &[u8],
  channels: usize,
  sample_type: SampleType,
  bits_per_sample: u16,
) -> Result<Vec<f32>, NativeError> {
  if channels == 0 {
    return Ok(Vec::new());
  }

  // Downmix to mono by taking the first channel.
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
      "unsupported WASAPI AEC format: {:?} {}-bit",
      sample_type, bits_per_sample
    ))),
  }
}

// ─── macOS AEC Implementation ─────────────────────────────────────────────────

#[cfg(target_os = "macos")]
use cidre::{at, os};

#[cfg(target_os = "macos")]
use std::ffi::c_void;

#[cfg(target_os = "macos")]
use std::sync::mpsc::SyncSender;

#[cfg(target_os = "macos")]
const MACOS_AEC_CHUNK_SAMPLES: usize = 960;

#[cfg(target_os = "macos")]
struct AecContext {
  tx: SyncSender<Vec<f32>>,
  resampler: Option<StreamResampler>,
}

#[cfg(target_os = "macos")]
fn spawn_macos_aec_mic_source(
  _preferred_device: Option<&str>,
  target_sample_rate_hz: u32,
  stop_flag: Arc<AtomicBool>,
) -> crate::AudioSourceResult {
  let (tx, rx) = mpsc::sync_channel(AEC_SOURCE_QUEUE_CAPACITY);
  let builder = thread::Builder::new().name("stitch-audio-aec-source".to_string());

  let worker = builder
    .spawn(move || -> Result<Vec<String>, NativeError> {
      let mut warnings = vec!["aec_enabled_macos".to_string()];

      // Create the VoiceProcessingIO audio unit — this provides AEC + NS.
      let mut output = at::au::Output::new_apple_vp().map_err(|status| {
        NativeError::StreamFailed(format!(
          "failed to create VoiceProcessingIO audio unit: {status:?}"
        ))
      })?;

      // Enable input (bus 1) for mic capture.
      output
        .set_io_enabled(at::au::Scope::INPUT, 1, true)
        .map_err(|status| {
          NativeError::StreamFailed(format!("failed to enable VPIO input: {status:?}"))
        })?;

      // Disable output (bus 0) — we only need input capture, not playback.
      // The VPIO unit will still use the output device as the AEC reference.
      output
        .set_io_enabled(at::au::Scope::OUTPUT, 0, false)
        .map_err(|status| {
          NativeError::StreamFailed(format!("failed to disable VPIO output: {status:?}"))
        })?;

      // Ensure voice processing is active (not bypassed).
      output
        .vp_set_bypass_voice_processing(false)
        .map_err(|status| {
          NativeError::StreamFailed(format!("failed to enable voice processing: {status:?}"))
        })?;

      // Mute the output so we don't play anything through the speaker.
      output.vp_set_mute_output(true).map_err(|status| {
        NativeError::StreamFailed(format!("failed to mute VPIO output: {status:?}"))
      })?;

      // Query the hardware input format to determine the native sample rate.
      let input_format = output.input_stream_format(1).map_err(|status| {
        NativeError::StreamFailed(format!("failed to get VPIO input format: {status:?}"))
      })?;

      let source_sample_rate = input_format.sample_rate as u32;

      // Set the desired format on the output scope of bus 1 (what we read from the AU).
      let desired_format = at::audio::StreamBasicDesc::common_f32(
        source_sample_rate as f64,
        1, // mono
        true,
      );
      output
        .set_input_stream_format(&desired_format)
        .map_err(|status| {
          NativeError::StreamFailed(format!(
            "failed to set VPIO input stream format: {status:?}"
          ))
        })?;

      // Set up the resampler if needed.
      let resampler = if source_sample_rate != target_sample_rate_hz {
        warnings.push(format!(
          "aec_resampling_from_{source_sample_rate}_to_{target_sample_rate_hz}"
        ));
        Some(StreamResampler::new(
          source_sample_rate,
          target_sample_rate_hz,
        )?)
      } else {
        None
      };

      // Allocate the context for the input callback.
      let ctx = Box::new(AecContext { tx, resampler });
      let ctx_ptr = Box::into_raw(ctx);

      // Set the input callback on bus 1 — this is called when audio data is available.
      extern "C-unwind" fn input_cb(
        in_ref_con: *mut c_void,
        _io_action_flags: &mut at::au::RenderActionFlags,
        in_timestamp: &at::AudioTimeStamp,
        in_bus_num: u32,
        in_number_frames: u32,
        _io_data: *mut at::AudioBufList<1>,
      ) -> os::Status {
        let ctx = unsafe { &mut *(in_ref_con as *mut AecContext) };
        let _ = (in_timestamp, in_bus_num, in_number_frames, ctx);
        // We don't process audio here — the actual rendering happens in the
        // polling loop below. This callback just signals data availability.
        os::Status::NO_ERR
      }

      output
        .set_input_cb(input_cb, ctx_ptr as *const c_void)
        .map_err(|status| {
          // Clean up ctx on failure.
          unsafe { drop(Box::from_raw(ctx_ptr)) };
          NativeError::StreamFailed(format!("failed to set VPIO input callback: {status:?}"))
        })?;

      output
        .set_should_allocate_input_buf(true)
        .map_err(|status| {
          unsafe { drop(Box::from_raw(ctx_ptr)) };
          NativeError::StreamFailed(format!(
            "failed to set should allocate input buffer: {status:?}"
          ))
        })?;

      // Initialize and start the audio unit.
      let mut output = output.allocate_resources().map_err(|status| {
        unsafe { drop(Box::from_raw(ctx_ptr)) };
        NativeError::StreamFailed(format!("failed to initialize VPIO audio unit: {status:?}"))
      })?;

      output.start().map_err(|status| {
        unsafe { drop(Box::from_raw(ctx_ptr)) };
        NativeError::StreamFailed(format!("failed to start VPIO audio unit: {status:?}"))
      })?;

      // Polling loop: render audio from the VPIO unit into our buffer.
      let render_frames = MACOS_AEC_CHUNK_SAMPLES as u32;
      let buf_byte_size = render_frames * std::mem::size_of::<f32>() as u32;

      let mut audio_buf = vec![0u8; buf_byte_size as usize];

      while !stop_flag.load(Ordering::Relaxed) {
        let mut buf_list = at::AudioBufList::<1> {
          number_buffers: 1,
          buffers: [at::AudioBuf {
            number_channels: 1,
            data_bytes_size: buf_byte_size,
            data: audio_buf.as_mut_ptr(),
          }],
        };

        let render_result = output.render(render_frames, &mut buf_list, 1);

        if render_result.is_err() {
          // Brief sleep on error to avoid spin.
          thread::sleep(std::time::Duration::from_millis(5));
          continue;
        }

        let actual_bytes = buf_list.buffers[0].data_bytes_size as usize;
        let float_count = actual_bytes / std::mem::size_of::<f32>();
        if float_count == 0 {
          thread::sleep(std::time::Duration::from_millis(5));
          continue;
        }

        let samples = unsafe {
          std::slice::from_raw_parts(buf_list.buffers[0].data as *const f32, float_count)
        };

        // The format is already mono f32 from our stream format setting.
        let ctx = unsafe { &mut *ctx_ptr };
        let chunk = match ctx.resampler.as_mut() {
          Some(resampler) => match resampler.process(samples) {
            Ok(resampled) => resampled,
            Err(_) => continue,
          },
          None => samples.to_vec(),
        };

        if chunk.is_empty() {
          continue;
        }

        for c in chunk.chunks(MACOS_AEC_CHUNK_SAMPLES) {
          match ctx.tx.try_send(c.to_vec()) {
            Ok(()) => {}
            Err(mpsc::TrySendError::Full(_)) => {}
            Err(mpsc::TrySendError::Disconnected(_)) => {
              stop_flag.store(true, Ordering::Relaxed);
              break;
            }
          }
        }
      }

      // Cleanup.
      let _ = output.stop();
      unsafe { drop(Box::from_raw(ctx_ptr)) };

      Ok(warnings)
    })
    .map_err(|error| {
      NativeError::Internal(format!("failed to spawn AEC capture thread: {error}"))
    })?;

  Ok((rx, worker))
}
