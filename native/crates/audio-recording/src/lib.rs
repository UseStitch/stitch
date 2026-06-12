mod aec;
mod capture;
pub mod device;
mod opus_writer;
mod resample;
pub mod session;
mod speaker;

pub use device::{device_display_name, is_tap_device};
pub use session::{ActiveSession, start_session, stop_session};
#[cfg(target_os = "macos")]
pub use speaker::{SystemAudioPrime, prime_system_audio_tap};
