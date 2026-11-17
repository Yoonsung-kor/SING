import assert from 'node:assert/strict';
import test from 'node:test';
import { EXERCISES, exerciseFor, exercisesFor } from '../src/exercises.js';
import { COLUMNS } from '../src/columns.js';

const spot = (kind, outcome = null, extra = {}) => ({ id: 's1', kind, outcome, over: null, ...extra });

test('each kind of spot gets its exercise', () => {
  assert.equal(exerciseFor(spot('leap')).id, 'straw-glide');
  assert.equal(exerciseFor(spot('high-hold', 'sag')).id, 'lip-trill');
  const key = exerciseFor(spot('leap', 'sag', { over: 3 }));
  assert.equal(key.id, 'key-down');
  assert.equal(key.steps, '노래방 키를 3칸 낮추면 이 자리가 편한 음 안으로 들어와요.');
  assert.equal(key.caution, null);
  assert.equal(key.columnId, null);
  assert.equal(exerciseFor(spot('over', null, { over: 9 })).steps, '노래방 키를 6칸 낮추면 이 자리가 편한 음 안으로 들어와요.');
});

test('a spot that went well needs no exercise; a break is practised only when the singer says it flipped', () => {
  assert.equal(exerciseFor(spot('leap', 'kept')), null);
  assert.equal(exerciseFor(spot('high-hold', 'ask')), null);
  assert.equal(exerciseFor(spot('high-hold', 'ask'), { answer: 'no' }), null);
  assert.equal(exerciseFor(spot('high-hold', 'ask', { over: 4 }), { answer: 'yes' }).id, 'passaggio-slide');
});

test('two spots of a kind get two different exercises when there are two', () => {
  const picked = exercisesFor([spot('leap', 'sag'), { ...spot('leap'), id: 's2' }, { ...spot('high-hold', 'kept'), id: 's3' }]);
  assert.deepEqual(Object.fromEntries(Object.entries(picked).map(([id, exercise]) => [id, exercise.id])), { s1: 'straw-glide', s2: 'passaggio-slide' });
  const asked = exercisesFor([{ ...spot('high-hold', 'ask'), id: 's1' }], { s1: 'yes' });
  assert.equal(asked.s1.id, 'passaggio-slide');
  assert.deepEqual(exercisesFor([{ ...spot('high-hold', 'ask'), id: 's1' }]), {});
});

test('every exercise links to a column that exists, and the words are the checked ones', () => {
  const ids = new Set(COLUMNS.map(column => column.id));
  for (const exercise of Object.values(EXERCISES)) if (exercise.columnId) assert.ok(ids.has(exercise.columnId), exercise.columnId);
  assert.deepEqual(EXERCISES['straw-glide'], { title: '빨대로 미끄러지듯 오르내리기', steps: '컵에 물을 반쯤 담고 빨대를 꽂아 ‘우—’ 소리를 내요. 낮은 음에서 높은 음으로 천천히 오르내려요.', caution: '목에 힘이 들어가지 않게 해요. 불편하면 멈춰요.', columnId: 'straw' });
  assert.deepEqual(EXERCISES['lip-trill'], { title: '립트릴로 편한 음 길게', steps: '물속에서 거품을 불듯 입술을 떨며 내쉬어요. 익숙해지면 편한 음 하나를 정해 그 음으로 떨어요.', caution: '입술을 오므리지 않아요. 숨이 차기 전에, 불편하거나 힘이 들어가면 멈춰요.', columnId: 'lip-trill' });
  assert.deepEqual(EXERCISES['passaggio-slide'], { title: '끊지 말고 미끄러지듯 넘어가기', steps: '소리가 바뀌는 자리를 툭 끊어 넘지 말고 미끄러지듯 이어 봐요. 넘어갈 때는 숨을 미는 힘을 살짝 빼요.', caution: '작고 가볍게 해요. 목이 불편하면 멈춰요.', columnId: 'passaggio' });
  assert.equal(EXERCISES['key-down'].title, '노래방 키 낮추기');
  assert.equal(EXERCISES['key-down'].steps(2), '노래방 키를 2칸 낮추면 이 자리가 편한 음 안으로 들어와요.');
  assert.deepEqual(Object.keys(EXERCISES).sort(), ['key-down', 'lip-trill', 'passaggio-slide', 'straw-glide']);
});
