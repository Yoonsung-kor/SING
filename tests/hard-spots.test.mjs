import assert from 'node:assert/strict';
import test from 'node:test';
import { notesOf, findSpots, lineAt, SPOT_RULES } from '../src/hard-spots.js';
import { koreanNote } from '../src/notes.js';
import { sing, rest, glide } from './helpers/frames.mjs';

const COMFORT = 69;
// 25.2 s of ordinary singing between 60 and 64 (no spot in it), then 2 s of silence: the test parts start at 27.2 s.
const filler = Array.from({ length: 63 }, (_, i) => ({ d: 0.4, midi: [60, 62, 64, 62][i % 4] }));
const after = (parts, { hop, ...options } = {}) => findSpots(sing([...filler, rest(2), ...parts], { hop }), { comfortableHighMidi: COMFORT, ...options });
const spotsAfter = (parts, options) => { const result = after(parts, options); assert.equal(result.status, 'ok'); return result.spots; };
const saggedLeap = [{ d: 0.5, midi: 60 }, { d: 1, midi: glide(67.9, 66.6, 1) }];
const near = (a, b, within = 0.03) => Math.abs(a - b) <= within;

test('the rules are the plan\'s table', () => {
  assert.ok(Object.isFrozen(SPOT_RULES));
  assert.deepEqual(SPOT_RULES, { noteStep: 0.8, band: 1.5, bridge: 0.11, minNote: 0.15, edge: 0.06, leapMin: 5, leapMax: 12.5, leapGap: 1.0, leapFrom: 0.2, leapTo: 0.3, held: 0.6, sag: 0.6, keep: 0.35, keepFor: 0.4, breakMax: 0.6, breakPitch: 1, overComfort: 2, overFar: 7, overFarFor: 0.6, nearComfort: 1, minVoiced: 20, maxSpots: 3, apart: 5, sameKind: 2 });
});

test('a held pitch is one note; short silences join, longer ones split it or mark a break', () => {
  assert.deepEqual(notesOf(sing([{ d: 1, midi: 60 }])).map(note => [note.midi, note.breaks.length]), [[60, 0]]);
  assert.deepEqual(notesOf(sing([{ d: 0.5, midi: 60 }, rest(0.1), { d: 0.5, midi: 60 }])).map(note => note.breaks.length), [0]);
  const broken = notesOf(sing([{ d: 0.5, midi: 60 }, rest(0.3), { d: 0.5, midi: 60 }]));
  assert.equal(broken.length, 1);
  assert.equal(broken[0].breaks.length, 1);
  assert.ok(near(broken[0].breaks[0].seconds, 0.3), String(broken[0].breaks[0].seconds));
  assert.equal(notesOf(sing([{ d: 0.5, midi: 60 }, rest(0.3), { d: 0.5, midi: 64 }])).length, 2);
  assert.ok(notesOf(sing([{ d: 1, midi: glide(60, 64, 1) }])).length >= 2, 'a long slide is split by the band');
  assert.deepEqual(notesOf(sing([rest(1), { d: 0.1, midi: 70 }, rest(1)])), [], 'too short');
  assert.equal(notesOf(sing([{ d: 1, midi: t => 67 + 0.4 * Math.sin(2 * Math.PI * 5.5 * t) }])).length, 1, 'vibrato stays one note');
  assert.deepEqual(notesOf(sing([{ d: 1, midi: Number.NaN }])), [], 'NaN is silence');
});

test('a note\'s thirds leave out the way in and out', () => {
  const [note] = notesOf(sing([{ d: 1, midi: glide(67.9, 66.6, 1) }]));
  assert.ok(near(note.first - note.last, 0.75, 0.02), String(note.first - note.last));
  assert.ok(note.middle < note.first && note.middle > note.last);
  assert.ok(near(note.start, 0, 0.001) && near(note.end, 1, 0.001));
});

test('a big leap held steady was kept', () => {
  const spots = spotsAfter([{ d: 0.5, midi: 60 }, { d: 0.8, midi: 67 }]);
  assert.equal(spots.length, 1);
  const [spot] = spots;
  assert.deepEqual([spot.id, spot.kind, spot.outcome], ['s1', 'leap', 'kept']);
  assert.equal(spot.from, koreanNote(60));
  assert.equal(spot.to, koreanNote(67));
  assert.ok(near(spot.time, 27.7) && near(spot.end, 28.5), `${spot.time} ${spot.end}`);
  assert.equal(spot.over, null);
  assert.equal(spot.repeated, false);
});

test('a leap whose note drifts down more than a semitone sagged; a smaller drift is not judged', () => {
  const [sagged] = spotsAfter(saggedLeap);
  assert.deepEqual([sagged.kind, sagged.outcome], ['leap', 'sag']);
  const [mild] = spotsAfter([{ d: 0.5, midi: 60 }, { d: 1, midi: glide(67.5, 66.6, 1) }]);
  assert.deepEqual([mild.kind, mild.outcome], ['leap', null]);
});

test('a leap after a breath still counts, a long pause does not', () => {
  assert.equal(spotsAfter([{ d: 0.5, midi: 60 }, rest(0.7), { d: 0.6, midi: 67 }])[0]?.kind, 'leap');
  assert.deepEqual(spotsAfter([{ d: 0.5, midi: 60 }, rest(1.2), { d: 0.6, midi: 67 }]), []);
});

test('a melody that steps down after the leap is not a sag', () => {
  const spots = spotsAfter([{ d: 0.5, midi: 60 }, { d: 0.35, midi: 67 }, { d: 0.5, midi: 65 }]);
  assert.equal(spots.length, 1);
  assert.equal(spots[0].kind, 'leap');
  assert.notEqual(spots[0].outcome, 'sag');
});

test('a high note that steps down at once is not a sag', () => {
  const [spot] = spotsAfter([{ d: 0.5, midi: 69 }, { d: 0.5, midi: 68.3 }]);
  assert.equal(spot.kind, 'high-hold');
  assert.notEqual(spot.outcome, 'sag');
});

test('vibrato on a long high note was kept', () => {
  const [spot] = spotsAfter([{ d: 1.2, midi: t => 69 + 0.4 * Math.sin(2 * Math.PI * 5.5 * t) }]);
  assert.deepEqual([spot.kind, spot.outcome], ['high-hold', 'kept']);
});

test('letting the last note fall away is not a sag', () => {
  const [spot] = spotsAfter([{ d: 0.9, midi: 69 }, { d: 0.1, midi: glide(69, 66, 0.1) }]);
  assert.equal(spot.kind, 'high-hold');
  assert.notEqual(spot.outcome, 'sag');
});

test('a break inside a high note is asked about, never in a karaoke take; a low one is no spot', () => {
  const broken = midi => [{ d: 0.6, midi }, rest(0.25), { d: 0.4, midi }];
  const [high] = spotsAfter(broken(69));
  assert.deepEqual([high.kind, high.outcome], ['high-hold', 'ask']);
  const [karaoke] = spotsAfter(broken(69), { source: 'karaoke' });
  assert.equal(karaoke.kind, 'high-hold');
  assert.notEqual(karaoke.outcome, 'ask');
  assert.deepEqual(spotsAfter(broken(60)), []);
});

test('notes above the comfortable top say how far above', () => {
  const [leap] = spotsAfter([{ d: 0.5, midi: 62 }, rest(0.05), { d: 0.4, midi: 72 }]);
  assert.deepEqual([leap.kind, leap.over], ['leap', 3]);
  const [alone] = spotsAfter([{ d: 0.4, midi: 72 }]);
  assert.deepEqual([alone.kind, alone.over, alone.from], ['over', 3, null]);
  assert.deepEqual(spotsAfter([{ d: 0.4, midi: 70 }]), [], 'one semitone above is no spot');
});

test('measurement slips are not spots: a 20-semitone leap, a short note far above the top', () => {
  assert.ok(spotsAfter([{ d: 0.5, midi: 55 }, { d: 0.4, midi: 75 }]).every(spot => spot.kind !== 'leap'));
  assert.deepEqual(spotsAfter([{ d: 0.4, midi: 78 }]), []);
  assert.equal(spotsAfter([{ d: 0.7, midi: 78 }]).length, 1, 'held long enough, it is real');
});

test('without a comfortable top, the highest notes sung stand in and nothing is "above"', () => {
  const spots = spotsAfter([{ d: 0.4, midi: 72 }, rest(2), { d: 1, midi: 70 }], { comfortableHighMidi: null });
  assert.equal(spots.length, 1);
  assert.deepEqual([spots[0].kind, spots[0].to, spots[0].over], ['high-hold', koreanNote(70), null]);
});

test('a karaoke take reports long high notes only', () => {
  assert.deepEqual(spotsAfter([...saggedLeap, rest(2), { d: 0.4, midi: 72 }], { source: 'karaoke' }), []);
  const [held] = spotsAfter([{ d: 1.2, midi: 69 }], { source: 'karaoke' });
  assert.deepEqual([held.kind, held.outcome], ['high-hold', 'kept']);
});

test('three spots at most, two of a kind, five seconds apart', () => {
  const five = Array.from({ length: 5 }, () => [...saggedLeap, rest(8.5)]).flat();
  const spots = spotsAfter(five);
  assert.ok(spots.length <= 3);
  assert.ok(spots.filter(spot => spot.kind === 'leap').length <= 2);
  const close = spotsAfter([...saggedLeap, rest(2), { d: 1.2, midi: 69 }]);
  assert.equal(close.length, 1, 'three seconds apart: only the stronger one');
  assert.equal(close[0].kind, 'leap');
});

test('when all three are trouble, a well-sung spot takes the weakest place', () => {
  const saggedHigh = [{ d: 1, midi: glide(69.6, 68.3, 1) }];
  const keptHigh = [{ d: 1.2, midi: 69 }];
  const spots = spotsAfter([...saggedLeap, rest(9), ...saggedLeap, rest(9), ...saggedHigh, rest(9), ...keptHigh]);
  assert.equal(spots.length, 3);
  assert.deepEqual(spots.map(spot => [spot.kind, spot.outcome]), [['leap', 'sag'], ['leap', 'sag'], ['high-hold', 'kept']]);
  assert.deepEqual(spots.map(spot => spot.id), ['s1', 's2', 's3']);
});

test('the same spot in two choruses is told once, as happening both times', () => {
  const sections = [{ t: 0, label: '노래 시작 · 1절', kind: 'start' }, { t: 30, label: '후렴 1', kind: 'chorus' }, { t: 45, label: '2절', kind: 'verse' }, { t: 60, label: '후렴 2', kind: 'chorus' }];
  // Landings at 34.0 and 64.0: four seconds into each chorus.
  const spots = spotsAfter([rest(6.3), ...saggedLeap, rest(28.5), ...saggedLeap], { sections });
  assert.equal(spots.length, 1);
  assert.equal(spots[0].repeated, true);
  assert.equal(spots[0].section, '후렴 1');
  assert.ok(near(spots[0].time, 34));
});

test('each spot names its section and the lyric line it falls in', () => {
  const sections = [{ t: 0, label: '노래 시작 · 1절', kind: 'start' }, { t: 27, label: '후렴 1', kind: 'chorus' }];
  const lines = [{ t: 0, text: 'word-a' }, { t: 26, text: 'word-b' }, { t: 27.5, text: 'word-c' }, { t: 29, text: '' }, { t: 31, text: 'word-d' }];
  const [spot] = spotsAfter([{ d: 0.5, midi: 60 }, { d: 0.8, midi: 67 }], { sections, lines });
  assert.equal(spot.section, '후렴 1');
  assert.equal(spot.lineId, 2);
  const [blank] = spotsAfter([rest(1.9), { d: 0.5, midi: 60 }, { d: 0.8, midi: 67 }], { sections, lines });
  assert.equal(blank.lineId, null, 'a line with no words is not named');
  const [late] = spotsAfter([rest(11), { d: 0.5, midi: 60 }, { d: 0.8, midi: 67 }], { sections, lines });
  assert.equal(late.lineId, null, 'more than seven seconds after the line began');
  const [bare] = spotsAfter([{ d: 0.5, midi: 60 }, { d: 0.8, midi: 67 }]);
  assert.deepEqual([bare.section, bare.lineId], ['', null]);
});

test('lineAt is the spots\' lyric-line rule: the line the time falls in, with words, begun at most 7 s before', () => {
  const lines = [{ t: 0, text: 'word-a' }, { t: 26, text: 'word-b' }, { t: 29, text: '' }, { t: 31, text: 'word-d' }];
  assert.equal(lineAt(lines, 27), 1);
  assert.equal(lineAt(lines, 30), null, 'a line with no words');
  assert.equal(lineAt(lines, 38), 3);
  assert.equal(lineAt(lines, 38.5), null, 'more than seven seconds after it began');
  assert.equal(lineAt(lines, -1), null, 'before the first line');
  assert.equal(lineAt(null, 5), null);
});

test('fewer than twenty seconds of voice gives no report', () => {
  const result = findSpots(sing(filler.slice(0, 37)), { comfortableHighMidi: COMFORT });
  assert.equal(result.status, 'short');
  assert.ok(result.voicedSeconds < 20);
  assert.equal(findSpots([], {}).status, 'short');
  assert.equal(findSpots([]).status, 'short');
});

test('the answer does not depend on how often the pitch was read', () => {
  const song = [...saggedLeap, rest(6), { d: 1.2, midi: 69 }, rest(6), { d: 0.5, midi: 62 }, rest(0.05), { d: 0.4, midi: 72 }, rest(6), { d: 0.6, midi: 69 }, rest(0.25), { d: 0.4, midi: 69 }];
  const shape = hop => spotsAfter(song, { hop }).map(spot => [spot.kind, spot.outcome]);
  const at25 = shape(0.025);
  assert.ok(at25.length >= 2);
  assert.deepEqual(shape(0.05), at25);
  assert.deepEqual(shape(0.02), at25);
});

test('without a comfortable top, one short high slip does not hide the long high notes', () => {
  const long = { d: 1.2, midi: 70 };
  const parts = [long, rest(5.6), long, rest(5.6), { d: 0.2, midi: 80 }, rest(5.6), long, rest(5.6), long];
  for (const source of ['clean', 'karaoke']) {
    const result = after(parts, { comfortableHighMidi: null, source });
    assert.equal(result.status, 'ok');
    assert.ok(result.spots.some(spot => spot.kind === 'high-hold' && spot.to === koreanNote(70)), `${source}: ${JSON.stringify(result.spots.map(spot => [spot.kind, spot.to]))}`);
  }
});
