const SAMPLE_NAMES = ['C', 'Ds', 'Fs', 'A'];

export function sampleFor(midi) {
  if (!Number.isInteger(midi) || midi < 36 || midi > 84) throw new Error('피아노 기준음 범위를 확인해 주세요.');
  const index = Math.round((midi - 36) / 3);
  const root = 36 + index * 3;
  const name = `${SAMPLE_NAMES[index % 4]}${2 + Math.floor(index / 4)}`;
  return { midi: root, url: `/assets/piano-${name}.mp3`, playbackRate: 2 ** ((midi - root) / 12) };
}

/** Decoded AudioBuffers can be reused by subsequent AudioContexts. */
export class PianoBank {
  constructor(fetchAudio = (...args) => fetch(...args)) {
    this.fetchAudio = fetchAudio;
    this.samples = new Map();
  }
  async load(context, midi) {
    const sample = sampleFor(midi);
    let pending = this.samples.get(sample.midi);
    if (!pending) {
      pending = (async () => {
        const response = await this.fetchAudio(sample.url);
        if (!response.ok) throw new Error('missing sample');
        return context.decodeAudioData(await response.arrayBuffer());
      })();
      this.samples.set(sample.midi, pending);
    }
    try { return { buffer: await pending, playbackRate: sample.playbackRate }; }
    catch {
      if (this.samples.get(sample.midi) === pending) this.samples.delete(sample.midi);
      throw new Error('피아노 소리를 불러오지 못했어요. 다시 듣기를 눌러 주세요.');
    }
  }
}
