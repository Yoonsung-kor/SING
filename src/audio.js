import { MicrophoneLease } from './capture.js';
import { detectPitch, summarizePitch } from './pitch.js';
import { PianoBank } from './piano.js';

export class AudioEngine {
  constructor({ piano = new PianoBank() } = {}) {
    this.piano = piano;
    this.lease = new MicrophoneLease();
    this.generation = 0;
    this.context = null;
    this.cancelPending = null;
    this.playback = null;
  }
  async contextForGesture() {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error('이 브라우저에서 소리 기능을 지원하지 않아요. Chrome에서 열어 주세요.');
    if (!this.context || this.context.state === 'closed') this.context = new Context();
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }
  cancel() {
    this.generation++;
    this.cancelPending?.();
    this.cancelPending = null;
    this.lease.release();
    this.playback?.pause();
    this.playback = null;
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.context = null;
  }
  async tone(midi, duration = 1600) {
    this.cancel();
    const generation = this.generation;
    const context = await this.contextForGesture();
    if (generation !== this.generation) return false;
    let sample;
    try { sample = await this.piano.load(context, midi); }
    catch (error) {
      if (generation !== this.generation) return false;
      this.cancel();
      throw error;
    }
    if (generation !== this.generation) return false;
    const source = context.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = sample.playbackRate;
    const volume = context.createGain();
    volume.gain.setValueAtTime(0, context.currentTime);
    volume.gain.linearRampToValueAtTime(0.7, context.currentTime + 0.005);
    volume.gain.setValueAtTime(0.7, context.currentTime + duration / 1000 - 0.3);
    volume.gain.linearRampToValueAtTime(0, context.currentTime + duration / 1000);
    source.connect(volume);
    volume.connect(context.destination);
    return new Promise(resolve => {
      let settled = false;
      const end = () => {
        if (settled) return;
        settled = true;
        source.disconnect();
        volume.disconnect();
        this.cancelPending = null;
        resolve(generation === this.generation);
      };
      source.onended = end;
      this.cancelPending = end;
      source.start();
      source.stop(context.currentTime + duration / 1000 + 0.02);
    });
  }
  async record({ duration = 3000, onProgress = () => {}, onPitch = () => {} } = {}) {
    this.cancel();
    const generation = this.generation;
    const context = await this.contextForGesture();
    if (generation !== this.generation) return null;
    let stream;
    try { stream = await this.lease.acquire(); }
    catch (error) {
      if (generation !== this.generation) return null;
      this.cancel();
      throw error;
    }
    if (!stream || generation !== this.generation) return null;
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const frames = [];
    const chunks = [];
    let recorder = null;
    try {
      if (globalThis.MediaRecorder) {
        const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      }
    } catch { /* Analysis works even when this browser cannot save audio. */ }
    return new Promise((resolve, reject) => {
      let settled = false;
      let interval;
      let timeout;
      const cleanup = () => {
        clearInterval(interval);
        clearTimeout(timeout);
        source.disconnect();
        analyser.disconnect();
        stream.getTracks().forEach(track => { track.onended = null; });
        if (generation === this.generation) this.lease.release();
        if (this.cancelPending === cancelThisRecording) this.cancelPending = null;
      };
      const finish = (cancelled = false, error = null) => {
        if (settled) return;
        settled = true;
        const result = () => {
          const blob = chunks.length ? new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }) : null;
          if (error) reject(error);
          else resolve(cancelled || generation !== this.generation ? null : { measurement: summarizePitch(frames), blob });
        };
        const recording = recorder?.state === 'recording';
        if (recording) {
          recorder.onstop = cancelled ? null : result;
          try { recorder.stop(); } catch (stopError) { error = stopError; result(); }
        }
        // Cleanup belongs to this operation and happens before another one can acquire a lease.
        cleanup();
        if (!recording || cancelled) result();
      };
      const cancelThisRecording = () => finish(true);
      this.cancelPending = cancelThisRecording;
      stream.getTracks().forEach(track => { track.onended = () => finish(true, new Error('마이크 연결이 끊겼어요. 연결을 확인하고 다시 시작해 주세요.')); });
      if (recorder) {
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => finish(true, new Error('녹음이 중단됐어요. 브라우저의 마이크 권한을 확인해 주세요.'));
        try { recorder.start(); } catch (error) { finish(true, error); return; }
      }
      const started = performance.now();
      onProgress(0);
      interval = setInterval(() => {
        if (generation !== this.generation) { finish(true); return; }
        analyser.getFloatTimeDomainData(samples);
        const frame = detectPitch(samples, context.sampleRate);
        frames.push(frame);
        onPitch(frame);
        onProgress(Math.min((performance.now() - started) / duration, 1));
      }, 60);
      timeout = setTimeout(() => finish(), duration);
    });
  }
}

export function microphoneError(error) {
  if (['NotAllowedError', 'SecurityError'].includes(error?.name)) return '마이크 권한이 꺼져 있어요. 주소창의 사이트 설정에서 마이크를 허용한 뒤 다시 시도해 주세요.';
  if (error?.name === 'NotFoundError') return '마이크를 찾지 못했어요. 연결된 마이크가 있는지 확인해 주세요.';
  if (error?.name === 'NotReadableError') return '다른 앱이 마이크를 사용 중일 수 있어요. 통화를 마치거나 마이크 연결을 확인해 주세요.';
  return error?.message || '녹음을 시작하지 못했어요. 연결과 권한을 확인해 주세요.';
}
