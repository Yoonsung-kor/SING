/** Ownership token prevents a late permission response from reopening an abandoned session. */
export class MicrophoneLease {
  constructor(mediaDevices = globalThis.navigator?.mediaDevices) {
    this.devices = mediaDevices;
    this.generation = 0;
    this.stream = null;
  }
  async acquire() {
    this.release();
    const generation = this.generation;
    if (!this.devices?.getUserMedia) throw new Error('마이크는 HTTPS 또는 localhost에서 사용할 수 있어요.');
    const stream = await this.devices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop());
      return null;
    }
    this.stream = stream;
    return stream;
  }
  release() {
    this.generation++;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
  }
}
