// Vendored from https://github.com/fastrepl/hyprnote (crates/audio-actual/src/capture/stream.rs),
// MIT licensed. Trimmed: the dual-stream loop, AEC processing, and reference alignment were dropped.

use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};

use futures_util::{Stream, StreamExt};
use hypr_resampler::ResampleExtDynamicNew;
use tokio::task::JoinHandle;
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;

use hypr_audio::{CaptureFrame, CaptureStream, Error};

use crate::mic::MicInput;
use crate::speaker::SpeakerInput;

pub(crate) type ChunkStream =
  Pin<Box<dyn Stream<Item = Result<Vec<f32>, hypr_resampler::Error>> + Send>>;

struct CaptureStreamInner {
  inner: ReceiverStream<Result<CaptureFrame, Error>>,
  cancel_token: CancellationToken,
  task: JoinHandle<()>,
}

impl Stream for CaptureStreamInner {
  type Item = Result<CaptureFrame, Error>;

  fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
    Pin::new(&mut self.inner).poll_next(cx)
  }
}

impl Drop for CaptureStreamInner {
  fn drop(&mut self) {
    self.cancel_token.cancel();
    self.task.abort();
  }
}

pub(crate) fn setup_mic_stream(
  sample_rate: u32,
  chunk_size: usize,
  mic_device: Option<String>,
) -> Result<ChunkStream, Error> {
  let mic = MicInput::new(mic_device).map_err(|_| Error::MicOpenFailed)?;
  mic
    .stream()
    .resampled_chunks(sample_rate, chunk_size)
    .map(|stream| Box::pin(stream) as ChunkStream)
    .map_err(|_| Error::MicStreamSetupFailed)
}

pub(crate) fn setup_speaker_stream(
  sample_rate: u32,
  chunk_size: usize,
) -> Result<ChunkStream, Error> {
  let speaker = SpeakerInput::new().map_err(|_| Error::SpeakerStreamSetupFailed)?;
  speaker
    .stream()
    .map_err(|_| Error::SpeakerStreamSetupFailed)?
    .resampled_chunks(sample_rate, chunk_size)
    .map(|stream| Box::pin(stream) as ChunkStream)
    .map_err(|_| Error::SpeakerStreamSetupFailed)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CaptureSide {
  Mic,
  Speaker,
}

pub(crate) fn open_single(chunk_stream: ChunkStream, side: CaptureSide) -> CaptureStream {
  let cancel_token = CancellationToken::new();
  let (tx, rx) = tokio::sync::mpsc::channel(32);
  let task = tokio::spawn(run_single_loop(
    tx,
    cancel_token.clone(),
    chunk_stream,
    side,
  ));

  CaptureStream::new(CaptureStreamInner {
    inner: ReceiverStream::new(rx),
    cancel_token,
    task,
  })
}

async fn run_single_loop(
  tx: tokio::sync::mpsc::Sender<Result<CaptureFrame, Error>>,
  cancel_token: CancellationToken,
  mut chunk_stream: ChunkStream,
  side: CaptureSide,
) {
  loop {
    tokio::select! {
        _ = cancel_token.cancelled() => return,
        item = chunk_stream.next() => {
            match item {
                Some(Ok(data)) => {
                    let data = Arc::<[f32]>::from(data);
                    let silence = Arc::<[f32]>::from(vec![0.0f32; data.len()]);
                    let frame = match side {
                        CaptureSide::Mic => CaptureFrame {
                            raw_mic: data,
                            raw_speaker: silence,
                            aec_mic: None,
                        },
                        CaptureSide::Speaker => CaptureFrame {
                            raw_mic: silence,
                            raw_speaker: data,
                            aec_mic: None,
                        },
                    };
                    if tx.send(Ok(frame)).await.is_err() {
                        return;
                    }
                }
                Some(Err(_)) => {
                    let err = match side {
                        CaptureSide::Mic => Error::MicResampleFailed,
                        CaptureSide::Speaker => Error::SpeakerResampleFailed,
                    };
                    let _ = tx.send(Err(err)).await;
                    return;
                }
                None => {
                    let err = match side {
                        CaptureSide::Mic => Error::MicStreamEnded,
                        CaptureSide::Speaker => Error::SpeakerStreamEnded,
                    };
                    let _ = tx.send(Err(err)).await;
                    return;
                }
            }
        }
    }
  }
}
