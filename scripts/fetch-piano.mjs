// Development-only asset import. The app itself requests only bundled local audio.
import { writeFile } from 'node:fs/promises';
const names = Array.from({ length: 17 }, (_, i) => `${['C','Ds','Fs','A'][i % 4]}${2 + Math.floor(i / 4)}`);
for (const name of names) {
  const response = await fetch(`https://tonejs.github.io/audio/salamander/${name}.mp3`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1000 || bytes.length > 1024 * 1024) throw new Error(`${name}: unexpected file size`);
  await writeFile(new URL(`../assets/piano-${name}.mp3`, import.meta.url), bytes);
  console.log(`${name}: ${bytes.length} bytes`);
}
