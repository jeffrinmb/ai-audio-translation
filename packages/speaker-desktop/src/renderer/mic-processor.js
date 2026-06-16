/**
 * AudioWorklet processor — runs in the audio thread.
 * Converts Float32 samples → Int16 PCM and posts them to the main thread
 * via MessagePort in 100ms chunks (1600 samples @ 16kHz).
 *
 * The renderer resamples the raw mic stream to 16kHz before piping here,
 * OR we accumulate and downsample from 44.1/48kHz here.
 */
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._targetSamples = 1600; // 100ms @ 16kHz
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0]; // Float32Array, one channel

    for (let i = 0; i < samples.length; i++) {
      // Clamp and convert Float32 [-1, 1] → Int16
      const s = Math.max(-1, Math.min(1, samples[i]));
      this._buffer.push(s < 0 ? s * 0x8000 : s * 0x7fff);
    }

    // Emit in 1600-sample (100ms @ 16kHz) chunks
    while (this._buffer.length >= this._targetSamples) {
      const chunk = this._buffer.splice(0, this._targetSamples);
      const int16 = new Int16Array(chunk);
      // Transfer the underlying buffer to avoid a copy
      this.port.postMessage({ pcm: int16.buffer }, [int16.buffer]);
    }

    return true; // keep processor alive
  }
}

registerProcessor('mic-processor', MicProcessor);
