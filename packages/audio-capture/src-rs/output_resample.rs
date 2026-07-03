use hypr_resampler::{Async, FixedAsync, PolynomialDegree, RubatoChunkResampler};

/// Fixed-ratio chunk resampler for converting the AEC pipeline's native 16kHz
/// output to the sample rate requested by the caller.
pub struct OutputResampler {
  driver: RubatoChunkResampler<Async<f32>, 1>,
}

impl OutputResampler {
  /// Returns `None` when input and output rates match (no conversion needed).
  pub fn for_rates(
    input_rate_hz: u32,
    output_rate_hz: u32,
    input_block_size: usize,
    output_chunk_size: usize,
  ) -> Result<Option<Self>, hypr_resampler::Error> {
    if input_rate_hz == output_rate_hz {
      return Ok(None);
    }

    let ratio = output_rate_hz as f64 / input_rate_hz as f64;
    let resampler = Async::<f32>::new_poly(
      ratio,
      2.0,
      PolynomialDegree::Cubic,
      input_block_size.max(1),
      1,
      FixedAsync::Input,
    )?;

    Ok(Some(Self {
      driver: RubatoChunkResampler::new(resampler, output_chunk_size, input_block_size),
    }))
  }

  /// Pushes samples through the resampler and returns all completed output chunks.
  pub fn process(&mut self, samples: &[f32]) -> Result<Vec<Vec<f32>>, hypr_resampler::Error> {
    for &sample in samples {
      self.driver.push_sample(sample);
    }
    self.driver.process_all_ready_blocks()?;

    let mut chunks = Vec::new();
    while let Some(chunk) = self.driver.take_full_chunk() {
      chunks.push(chunk);
    }
    Ok(chunks)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn for_rates_returns_none_when_rates_match() {
    assert!(
      OutputResampler::for_rates(16_000, 16_000, 1920, 1920)
        .unwrap()
        .is_none()
    );
  }

  #[test]
  fn upsamples_16khz_to_24khz_in_fixed_chunks() {
    let input_block = 1920;
    let output_chunk = 2880;
    let mut resampler = OutputResampler::for_rates(16_000, 24_000, input_block, output_chunk)
      .unwrap()
      .unwrap();

    let input: Vec<f32> = (0..input_block * 4)
      .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 16_000.0).sin())
      .collect();

    let mut chunks = Vec::new();
    for block in input.chunks(input_block) {
      chunks.extend(resampler.process(block).unwrap());
    }

    // 4 input blocks upsampled by 1.5x should yield at least 3 full output chunks.
    assert!(
      chunks.len() >= 3,
      "expected >= 3 chunks, got {}",
      chunks.len()
    );
    assert!(chunks.iter().all(|chunk| chunk.len() == output_chunk));
    assert!(
      chunks
        .iter()
        .flatten()
        .all(|sample| sample.is_finite() && sample.abs() <= 1.1)
    );
  }
}
