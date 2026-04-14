#[cfg(target_os = "macos")]
mod macos_meeting_watch;
mod watch_output;
#[cfg(target_os = "windows")]
mod windows_meeting_watch;

pub fn run_meeting_watcher() {
  #[cfg(target_os = "macos")]
  {
    macos_meeting_watch::run_macos_meeting_watcher();
  }

  #[cfg(target_os = "windows")]
  {
    windows_meeting_watch::run_windows_meeting_watcher();
  }

  #[cfg(not(any(target_os = "macos", target_os = "windows")))]
  {
    loop {
      std::thread::park();
    }
  }
}
