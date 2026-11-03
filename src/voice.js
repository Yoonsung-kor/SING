import { rootFor, SampleBank } from './piano.js';

// Recorded human hum examples, one entry per recorded grid note (36 + 3k). `ai: true` marks generated audio.
// Add an entry only after tests/browser-hum.html passes for that file.
export const HUM_SAMPLES = Object.freeze([]);

export function humSampleFor(midi, samples = HUM_SAMPLES) {
  if (!Number.isInteger(midi) || midi < 36 || midi > 84) return null;
  const root = rootFor(midi);
  const entry = samples.find(sample => sample.midi === root.midi);
  if (!entry) return null;
  return { midi: root.midi, url: `/assets/hum-${root.name}.mp3`, playbackRate: 2 ** ((midi - root.midi) / 12), ai: Boolean(entry.ai) };
}

export class HumBank extends SampleBank {
  constructor(fetchAudio) {
    super(midi => humSampleFor(midi), '사람 목소리 예시를 불러오지 못했어요. 피아노 기준음을 들어 주세요.', fetchAudio);
  }
}
