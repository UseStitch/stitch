use rubato::Resampler;
use rubato::audioadapter_buffers::direct::InterleavedSlice;

use crate::error::NativeError;

const RESAMPLE_CHUNK_SIZE: usize = 256;

pub struct StreamResampler {
  passthrough: bool,
  input_buffer: Vec<f32>,
  chunk_buffer: Vec<f32>,
  inner: Option<rubato::Fft<f32>>,
}

impl StreamResampler {
  pub fn new(input_rate_hz: u32, output_rate_hz: u32) -> Result<Self, NativeError> {
    if input_rate_hz == 0 || output_rate_hz == 0 {
      return Err(NativeError::StreamFailed(
        "resampler sample rates must be > 0".to_string(),
      ));
    }

    if input_rate_hz == output_rate_hz {
      return Ok(Self {
        passthrough: true,
        input_buffer: Vec::new(),
        chunk_buffer: Vec::new(),
        inner: None,
      });
    }

    let inner = rubato::Fft::<f32>::new(
      input_rate_hz as usize,
      output_rate_hz as usize,
      RESAMPLE_CHUNK_SIZE,
      1,
      1,
      rubato::FixedSync::Input,
    )
    .map_err(|error| {
      NativeError::StreamFailed(format!(
        "failed to initialize FFT resampler ({input_rate_hz}->{output_rate_hz}): {error}"
      ))
    })?;

    Ok(Self {
      passthrough: false,
      input_buffer: Vec::new(),
      chunk_buffer: Vec::with_capacity(RESAMPLE_CHUNK_SIZE),
      inner: Some(inner),
    })
  }

  pub fn process(&mut self, input: &[f32]) -> Result<Vec<f32>, NativeError> {
    if self.passthrough {
      return Ok(input.to_vec());
    }

    self.input_buffer.extend_from_slice(input);
    let mut output = Vec::new();

    while self.input_buffer.len() >= RESAMPLE_CHUNK_SIZE {
      self.chunk_buffer.clear();
      self
        .chunk_buffer
        .extend_from_slice(&self.input_buffer[..RESAMPLE_CHUNK_SIZE]);
      self.input_buffer.drain(..RESAMPLE_CHUNK_SIZE);

      let adapter =
        InterleavedSlice::new(&self.chunk_buffer, 1, self.chunk_buffer.len()).map_err(|error| {
          NativeError::StreamFailed(format!("failed to create input adapter: {error}"))
        })?;

      let resampled = self
        .inner
        .as_mut()
        .ok_or_else(|| NativeError::Internal("resampler state missing".to_string()))?
        .process(&adapter, 0, None)
        .map_err(|error| NativeError::StreamFailed(format!("resampler process failed: {error}")))?;

      output.extend(resampled.take_data());
    }

    Ok(output)
  }
}

#[cfg(test)]
mod tests {
  use super::StreamResampler;

  #[test]
  fn passthrough_returns_same_samples() {
    let mut resampler = StreamResampler::new(16_000, 16_000).expect("must initialize");
    let out = resampler
      .process(&[0.1, -0.2, 0.3])
      .expect("passthrough should succeed");
    assert_eq!(out, vec![0.1, -0.2, 0.3]);
  }

  #[test]
  fn resampler_produces_output_after_enough_input() {
    let mut resampler = StreamResampler::new(48_000, 16_000).expect("must initialize");
    let out = resampler
      .process(&vec![0.1; 512])
      .expect("resample should succeed");
    assert!(!out.is_empty());
  }
}
