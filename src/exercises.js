// Exercises the report can suggest, chosen by code from the kind of spot. The words are shortened from the
// 알아두기 columns whose sources were checked (straw, lip-trill, passaggio); do not change their meaning,
// and add a new exercise only after checking its sources the same way.
export const EXERCISES = Object.freeze({
  'straw-glide': { title: '빨대로 미끄러지듯 오르내리기', steps: '컵에 물을 반쯤 담고 빨대를 꽂아 ‘우—’ 소리를 내요. 낮은 음에서 높은 음으로 천천히 오르내려요.', caution: '목에 힘이 들어가지 않게 해요. 불편하면 멈춰요.', columnId: 'straw' },
  'lip-trill': { title: '립트릴로 편한 음 길게', steps: '물속에서 거품을 불듯 입술을 떨며 내쉬어요. 익숙해지면 편한 음 하나를 정해 그 음으로 떨어요.', caution: '입술을 오므리지 않아요. 숨이 차기 전에, 불편하거나 힘이 들어가면 멈춰요.', columnId: 'lip-trill' },
  'passaggio-slide': { title: '끊지 말고 미끄러지듯 넘어가기', steps: '소리가 바뀌는 자리를 툭 끊어 넘지 말고 미끄러지듯 이어 봐요. 넘어갈 때는 숨을 미는 힘을 살짝 빼요.', caution: '작고 가볍게 해요. 목이 불편하면 멈춰요.', columnId: 'passaggio' },
  'key-down': { title: '노래방 키 낮추기', steps: n => `노래방 키를 ${n}칸 낮추면 이 자리가 편한 음 안으로 들어와요.`, caution: null, columnId: null },
});

const KEY_STEPS_MAX = 6;

/** The exercises that fit a spot, best first; empty when it needs none. */
function choicesFor(spot, answer) {
  if (spot.outcome === 'kept') return [];
  if (spot.outcome === 'ask') return answer === 'yes' ? ['passaggio-slide', 'straw-glide'] : [];
  if (Number.isInteger(spot.over) && spot.over >= 2) return ['key-down'];
  if (spot.kind === 'leap') return ['straw-glide', 'passaggio-slide'];
  if (spot.kind === 'high-hold') return ['lip-trill', 'straw-glide'];
  return [];
}

/** The exercise for one spot: the first fitting one not used yet (the first one if all are). */
export function exerciseFor(spot, { used = [], answer = null } = {}) {
  const choices = choicesFor(spot, answer);
  if (!choices.length) return null;
  const id = choices.find(choice => !used.includes(choice)) ?? choices[0];
  const exercise = EXERCISES[id];
  const steps = typeof exercise.steps === 'function' ? exercise.steps(Math.min(spot.over, KEY_STEPS_MAX)) : exercise.steps;
  return { id, title: exercise.title, steps, caution: exercise.caution, columnId: exercise.columnId };
}

/** Exercises for the report's spots in order, varied where possible: { [spotId]: exercise }. */
export function exercisesFor(spots, answers = {}) {
  const picked = {};
  const used = [];
  for (const spot of spots) {
    const exercise = exerciseFor(spot, { used, answer: answers[spot.id] ?? null });
    if (!exercise) continue;
    picked[spot.id] = exercise;
    used.push(exercise.id);
  }
  return picked;
}
