/** AudioWorkletProcessor that captures PCM float32 data and posts it to the main thread. */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._buffer = [];
    this._bufferLength = 0;
    this._chunkSize = options.processorOptions.chunkSize;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    this._buffer.push(new Float32Array(channelData));
    this._bufferLength += channelData.length;

    if (this._bufferLength >= this._chunkSize) {
      const merged = new Float32Array(this._bufferLength);
      let offset = 0;
      for (const chunk of this._buffer) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      this._buffer = [];
      this._bufferLength = 0;
      this.port.postMessage(merged.buffer, [merged.buffer]);
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
