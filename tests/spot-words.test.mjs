import assert from 'node:assert/strict';
import test from 'node:test';
import { spotsPayload, defaultSentence, cleanSpotWords, validateSpotsRequest } from '../src/spot-words.js';
import { koreanNote } from '../src/notes.js';

const C4 = koreanNote(60), G4 = koreanNote(67), A4 = koreanNote(69), C5 = koreanNote(72);
const item = extra => ({ id: 's1', kind: 'leap', outcome: null, section: '', from: C4, to: G4, over: null, repeated: false, ...extra });
const payloadOf = (...items) => ({ kind: 'spots', song: { title: '곡', artist: '가수' }, comfortableHigh: A4, items });

test('the request carries the spots, never times, lines or lyrics', () => {
  const result = { status: 'ok', voicedSeconds: 80, spots: [{ id: 's1', kind: 'leap', outcome: 'sag', time: 34.2, end: 35.2, lineId: 7, section: '후렴 1', from: C4, to: G4, over: null, repeated: true }] };
  const payload = spotsPayload({ id: 'x', title: '곡', artist: '가수', lyrics: 'word-a' }, result, 69);
  assert.deepEqual(payload, { kind: 'spots', song: { title: '곡', artist: '가수' }, comfortableHigh: A4, items: [{ id: 's1', kind: 'leap', outcome: 'sag', section: '후렴 1', from: C4, to: G4, over: null, repeated: true }] });
  const text = JSON.stringify(payload);
  for (const word of ['time', 'lineId', 'word-a', '34.2']) assert.ok(!text.includes(word), word);
  assert.equal(spotsPayload({ title: '곡', artist: '' }, result, null).comfortableHigh, null);
});

test('the app\'s own sentences, one per kind and outcome', () => {
  const at = '후렴 1에서 ';
  const cases = [
    [{ kind: 'leap', outcome: null }, `${at}${C4}에서 ${G4}까지 한 번에 크게 올라가는 자리예요.`],
    [{ kind: 'leap', outcome: 'kept' }, `${at}${C4}에서 ${G4}까지 크게 올라가서, 닿은 음을 끝까지 지켰어요.`],
    [{ kind: 'leap', outcome: 'sag' }, `${at}${C4}에서 ${G4}까지 크게 올라간 뒤, 닿은 음이 끝으로 갈수록 내려왔어요.`],
    [{ kind: 'leap', outcome: 'ask' }, `${at}${C4}에서 ${G4}까지 크게 올라간 자리에서 소리가 잠깐 끊겼어요. 소리가 뒤집힌 느낌이 있었나요?`],
    [{ kind: 'high-hold', outcome: null, from: null, to: A4 }, `${at}높은 음(${A4})을 길게 내는 자리예요.`],
    [{ kind: 'high-hold', outcome: 'kept', from: null, to: A4 }, `${at}높은 음(${A4})을 끝까지 지키며 길게 냈어요.`],
    [{ kind: 'high-hold', outcome: 'sag', from: null, to: A4 }, `${at}높은 음(${A4})을 길게 낼 때 끝으로 갈수록 음이 내려왔어요.`],
    [{ kind: 'high-hold', outcome: 'ask', from: null, to: A4 }, `${at}높은 음(${A4})을 길게 낼 때 소리가 잠깐 끊겼어요. 소리가 뒤집힌 느낌이 있었나요?`],
    [{ kind: 'over', outcome: 'kept', from: null, to: C5, over: 3 }, `${at}편한 최고음보다 반음 3개 높은 ${C5}까지 올라갔어요.`],
  ];
  for (const [extra, sentence] of cases) assert.equal(defaultSentence(item({ section: '후렴 1', ...extra })), sentence);
  assert.ok(defaultSentence(item()).startsWith('이 자리에서 '));
  assert.ok(defaultSentence(item({ repeated: true })).endsWith(' 두 번 다 그랬어요.'));
  assert.ok(!defaultSentence(item({ repeated: true, outcome: 'ask' })).includes('두 번 다'));
  // A section name that brings the sentence to 75 characters: the extra words would pass 80, so they are left out.
  const plain = defaultSentence(item({ outcome: 'kept', section: 'x' }));
  const crowded = item({ outcome: 'kept', repeated: true, section: 'x'.repeat(1 + 75 - plain.length) });
  assert.equal(defaultSentence(crowded), defaultSentence({ ...crowded, repeated: false }));
  assert.equal(defaultSentence(crowded).length, 75);
});

test('the AI\'s words are used only where they hold up; the app\'s own words fill every gap', () => {
  const one = item({ id: 's1', outcome: 'sag', section: '노래 시작 · 후렴 1' });
  const two = item({ id: 's2', kind: 'over', outcome: null, from: null, to: C5, over: 3 });
  const three = item({ id: 's3', kind: 'high-hold', outcome: 'ask', from: null, to: A4 });
  const payload = payloadOf(one, two, three);
  const words = (raw, at = 0) => cleanSpotWords(raw, payload)[at].text;
  const fine = { items: [{ id: 's1', text: `후렴 1에서 ${G4}까지 올라간 뒤 음이 조금 내려왔어요.` }, { id: 's9', text: '없는 자리' }, { id: 's3', text: '높은 음에서 소리가 끊겼는데, 뒤집힌 느낌이었나요?' }] };
  const cleaned = cleanSpotWords(fine, payload);
  assert.deepEqual(cleaned.map(entry => entry.id), ['s1', 's2', 's3']);
  assert.equal(cleaned[0].text, fine.items[0].text);
  assert.equal(cleaned[1].text, defaultSentence(two), 'skipped by the AI');
  assert.equal(cleaned[2].text, fine.items[2].text);
  assert.equal(words({ items: [{ id: 's1', text: `${koreanNote(72)}까지 올라갔어요.` }] }), defaultSentence(one), 'a note it was not given');
  assert.equal(words({ items: [{ id: 's1', text: '1분 12초쯤 음이 내려왔어요.' }] }), defaultSentence(one), 'a time');
  assert.equal(words({ items: [{ id: 's1', text: '“사랑해”에서 음이 내려왔어요.' }] }), defaultSentence(one), 'quotes');
  assert.equal(words({ items: [{ id: 's1', text: '후렴 2에서 음이 내려왔어요.' }] }), defaultSentence(one), 'a number it was not given');
  assert.equal(words({ items: [{ id: 's1', text: '음이 끝으로 갈수록 내려왔나요?' }] }), defaultSentence(one), 'a question where there was no break');
  assert.equal(words({ items: [{ id: 's1', text: '가'.repeat(81) }] }), defaultSentence(one), 'too long');
  assert.equal(words({ items: [{ id: 's1', text: '   ' }] }), defaultSentence(one), 'empty');
  assert.equal(words({ items: [{ id: 's2', text: '편한 최고음보다 반음 3개 높이 올라갔어요.' }] }, 1), '편한 최고음보다 반음 3개 높이 올라갔어요.');
  assert.equal(words({ items: [{ id: 's3', text: '높은 음에서 소리가 뒤집혔어요.' }] }, 2), defaultSentence(three), 'a break is asked about, not stated');
  const overTwo = payloadOf(item({ id: 's1', kind: 'over', from: null, to: C5, over: 2 }));
  assert.equal(cleanSpotWords({ items: [{ id: 's1', text: '편한 최고음보다 반음 3개 높았어요.' }] }, overTwo)[0].text, defaultSentence(overTwo.items[0]));
  const noOver = payloadOf(item({ id: 's1' }));
  assert.equal(cleanSpotWords({ items: [{ id: 's1', text: '반음 3개만큼 크게 올라갔어요.' }] }, noOver)[0].text, defaultSentence(noOver.items[0]));
  for (const raw of [null, 'text', { items: 'x' }, { items: [{ id: 's1' }] }]) assert.equal(cleanSpotWords(raw, payload)[0].text, defaultSentence(one));
  // The section's own number (2절) cannot cover for a note that was not given (2옥 시).
  const verse = payloadOf(item({ id: 's1', section: '2절' }));
  assert.equal(cleanSpotWords({ items: [{ id: 's1', text: `2절에서 ${G4}까지 크게 올라갔어요.` }] }, verse)[0].text, `2절에서 ${G4}까지 크게 올라갔어요.`);
  assert.equal(cleanSpotWords({ items: [{ id: 's1', text: `2절에서 ${koreanNote(71)}까지 크게 올라갔어요.` }] }, verse)[0].text, defaultSentence(verse.items[0]));
});

test('the server takes only well-formed spot requests', () => {
  const good = payloadOf(item(), item({ id: 's2', kind: 'over', from: null, to: C5, over: 3 }), item({ id: 's3', kind: 'high-hold', outcome: 'kept', from: null, to: A4 }));
  assert.equal(validateSpotsRequest(good), good);
  const bad = [
    ['four items', { ...good, items: [...good.items, item({ id: 's1' })] }],
    ['no items', { ...good, items: [] }],
    ['unknown kind', payloadOf(item({ kind: 'crack' }))],
    ['unknown outcome', payloadOf(item({ outcome: 'fine' }))],
    ['same id twice', payloadOf(item(), item())],
    ['bad id', payloadOf(item({ id: 's4' }))],
    ['leap without from', payloadOf(item({ from: null }))],
    ['high-hold with from', payloadOf(item({ kind: 'high-hold', to: A4 }))],
    ['over of 1', payloadOf(item({ over: 1 }))],
    ['over kind without over', payloadOf(item({ kind: 'over', from: null, to: C5 }))],
    ['extra key', payloadOf({ ...item(), time: 34.2 })],
    ['not a note', payloadOf(item({ to: 'G4' }))],
    ['long section', payloadOf(item({ section: '가'.repeat(41) }))],
    ['repeated not boolean', payloadOf(item({ repeated: 'yes' }))],
    ['comfortable high not a note', { ...good, comfortableHigh: 69 }],
    ['other kind', { ...good, kind: 'song' }],
    ['extra top key', { ...good, lines: [] }],
  ];
  for (const [label, body] of bad) assert.throws(() => validateSpotsRequest(body), /bad practice request/, label);
});
