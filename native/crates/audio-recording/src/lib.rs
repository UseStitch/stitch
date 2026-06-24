mod aec;
mod capture;
pub mod device;
mod resample;
pub mod session;
mod speaker;

use std::sync::mpsc::Receiver;
use std::thread;

use audio_core::error::NativeError;

/// Common return type for audio source spawning functions.
type AudioSourceResult = Result<
  (
    Receiver<Vec<f32>>,
    thread::JoinHandle<Result<Vec<String>, NativeError>>,
  ),
  NativeError,
>;

pub use device::{device_display_name, is_tap_device};
pub use session::{ActiveSession, start_session, stop_session};
#[cfg(target_os = "macos")]
pub use speaker::{SystemAudioPrime, prime_system_audio_tap};
