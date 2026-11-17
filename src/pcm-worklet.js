// Runs on the audio thread (AudioWorklet): hands the microphone's first channel to the page in 4096-sample pieces.
// It only passes sound to the page that recorded it; nothing here stores or sends anything.
const PIECE = 4096;

class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.piece = new Float32Array(PIECE);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const size = Math.min(channel.length - offset, PIECE - this.filled);
      this.piece.set(channel.subarray(offset, offset + size), this.filled);
      this.filled += size;
      offset += size;
      if (this.filled === PIECE) {
        this.port.postMessage(this.piece, [this.piece.buffer]);
        this.piece = new Float32Array(PIECE);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-tap', PcmTap);
