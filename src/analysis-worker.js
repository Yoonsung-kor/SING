// Runs the karaoke analysis away from the page so the screen keeps moving. The recording arrives as samples,
// stays in this worker's memory, and only the report goes back.
import { analyzeKaraoke } from './karaoke-analysis.js';

self.onmessage = event => {
  const { samples, options } = event.data ?? {};
  try {
    const result = analyzeKaraoke(samples, { ...options, onProgress: progress => self.postMessage({ progress }) });
    self.postMessage({ result });
  } catch {
    self.postMessage({ error: true });
  }
};
