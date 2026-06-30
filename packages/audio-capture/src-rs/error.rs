use std::fmt;

#[derive(Debug)]
pub enum NativeError {
  PermissionDenied(String),
  DeviceNotFound(String),
  StreamFailed(String),
  Internal(String),
}

impl fmt::Display for NativeError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Self::PermissionDenied(msg) => write!(f, "permission denied: {msg}"),
      Self::DeviceNotFound(msg) => write!(f, "device not found: {msg}"),
      Self::StreamFailed(msg) => write!(f, "stream failed: {msg}"),
      Self::Internal(msg) => write!(f, "internal error: {msg}"),
    }
  }
}

impl std::error::Error for NativeError {}

impl NativeError {
  pub fn code(&self) -> &'static str {
    match self {
      Self::PermissionDenied(_) => "permission_denied",
      Self::DeviceNotFound(_) => "device_not_found",
      Self::StreamFailed(_) => "stream_failed",
      Self::Internal(_) => "internal_error",
    }
  }
}

impl From<NativeError> for napi::Error {
  fn from(error: NativeError) -> Self {
    napi::Error::from_reason(format!("{} ({})", error, error.code()))
  }
}

#[cfg(test)]
mod tests {
  use super::NativeError;

  #[test]
  fn maps_error_codes_consistently() {
    let cases = vec![
      (
        NativeError::PermissionDenied("x".to_string()),
        "permission_denied",
      ),
      (
        NativeError::DeviceNotFound("x".to_string()),
        "device_not_found",
      ),
      (NativeError::StreamFailed("x".to_string()), "stream_failed"),
      (NativeError::Internal("x".to_string()), "internal_error"),
    ];

    for (error, expected) in cases {
      assert_eq!(error.code(), expected);
    }
  }
}
