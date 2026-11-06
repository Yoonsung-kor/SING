// OpenAI Responses API client. Runs only on the server: the key never reaches the browser.
const ENDPOINT = 'https://api.openai.com/v1/responses';
// Measured 2026-11-02 with gpt-5.5: default reasoning took 40-55 s, low took 16 s with the same quality.
const REASONING = { effort: 'low' };
const TIMEOUT_MS = 60000;

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}

const nullable = type => ({ anyOf: [{ type }, { type: 'null' }] });
const VOCAL_SCHEMA = { anyOf: [{ type: 'string', enum: ['male', 'female', 'mixed'] }, { type: 'null' }] };
const SONG_RANGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['found', 'chestHighest', 'falsettoHighest', 'lowest', 'sourceUrl', 'sourceQuote', 'vocal'],
  properties: { found: { type: 'boolean' }, chestHighest: nullable('string'), falsettoHighest: nullable('string'), lowest: nullable('string'), sourceUrl: nullable('string'), sourceQuote: nullable('string'), vocal: VOCAL_SCHEMA },
};
const CLAIM_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['chestHighest', 'falsettoHighest', 'lowest', 'sourceUrl', 'sourceQuote'],
  properties: { chestHighest: nullable('string'), falsettoHighest: nullable('string'), lowest: nullable('string'), sourceUrl: nullable('string'), sourceQuote: nullable('string') },
};
const RECOMMENDATION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['intent', 'items'],
  properties: {
    intent: { type: 'string', enum: ['comfortable', 'challenge', 'any'] },
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'artist', 'reason', 'songUrl', 'highest', 'vocal'],
        properties: { title: { type: 'string' }, artist: { type: 'string' }, reason: { type: 'string' }, songUrl: { type: 'string' }, highest: { anyOf: [CLAIM_SCHEMA, { type: 'null' }] }, vocal: VOCAL_SCHEMA },
      },
    },
  },
};

// Shared by the per-song lookup and the recommendation request. It names no preferred site on purpose.
export const HIGHEST_RULES = [
  '- 웹 검색으로 원곡 보컬의 최고음이 글자로 적힌 페이지를 찾는다. 어느 사이트든 된다. 라이브나 편곡이 아니라 원곡 기준이어야 한다.',
  '- sourceUrl에는 그 페이지의 https 주소를, sourceQuote에는 페이지에서 최고음이 적힌 부분을 고치지 말고 그대로 120자 이내로 복사한다.',
  '- 음은 과학적 음이름(가온 도 = C4, A4 = 440Hz, 예: F#5)으로 바꿔 적는다. 한국 가요식 \'n옥타브\' 표기는 과학적 표기보다 옥타브 번호가 2 작다(2옥타브 라 = A4, 3옥타브 도 = C5).',
  '- 일본식 표기는 옥타브 이름이 A에서 바뀐다: hiA = A4(440Hz), hiC = C5, mid2G# = G#4, mid2A = A3.',
  '- 진성과 가성이 나뉘어 적혀 있으면 chestHighest와 falsettoHighest에 각각 넣는다. 구분 없이 하나만 적혀 있으면 chestHighest에 넣고 falsettoHighest는 null로 둔다.',
  '- 같은 페이지에 최저음이 적혀 있으면 lowest에 넣고, 없으면 null로 둔다.',
  '- vocal은 원곡 보컬이 남성이면 male, 여성이면 female, 듀엣이나 혼성이면 mixed, 모르면 null이다.',
  '- 숫자나 음을 추측하지 않는다. 표기를 확신할 수 없으면 찾지 못한 것으로 둔다.',
];

export const RECOMMEND_INSTRUCTIONS = [
  '너는 한국 노래방에서 부를 곡을 고르는 도우미다.',
  '입력은 JSON이다. playlistName은 사용자가 붙인 플레이리스트 이름, songs는 그 리스트에 담긴 곡이다(keyOffset은 사용자의 노래방 키 반음 수, highestMidi는 원곡 진성 최고음의 MIDI 번호, fromAi는 예전에 AI 추천으로 담은 곡). exclude는 사용자가 이미 담은 모든 곡, rejected는 사용자가 "별로예요"를 누른 곡이다.',
  'voice가 있으면 voice.comfortableHigh는 사용자가 편하게 내는 진성 최고음(과학적 음이름), voice.voiceType은 주로 부르는 키(male은 남자 키, female은 여자 키)다.',
  '규칙:',
  '1. intent를 정한다. 리스트 이름과 담긴 곡을 보고 편하게 부르는 곡이면 comfortable, 도전할 곡이면 challenge, 친구들과 신나게 부르는 곡처럼 음역이 중요하지 않으면 any다.',
  '2. 이 리스트에 어울리는 곡 8개를 고른다. voice가 있으면 intent에 맞춰 고른다: challenge는 원곡 최고음이 comfortableHigh보다 반음 1~3개 높은 곡, comfortable은 comfortableHigh 이하인 곡이다. 남자 키 사용자가 여자 곡을 부르면 한 옥타브 아래로 부른다고 본다.',
  '   한 가수당 1곡까지만 고른다. 리스트에 이미 담긴 가수의 곡은 8개 중 2개까지만 고른다.',
  '3. 웹 검색으로 곡이 실제로 있는지 확인하고, 그 곡을 보여 주는 https 페이지 주소를 songUrl에 넣는다. 확인하지 못한 곡은 넣지 않는다.',
  '4. exclude와 rejected에 있는 곡은 고르지 않는다.',
  '5. reason은 한국어 한 문장, 80자 이내로 쓰고, 담긴 곡과의 공통점을 말한다.',
  '6. 곡마다 highest에 원곡 최고음 정보를 아래 규칙대로 넣는다. 찾지 못하면 highest는 null이다.',
  ...HIGHEST_RULES,
  '7. 사용자의 목소리나 실력을 평가하는 말은 쓰지 않는다.',
].join('\n');

export const SONG_RANGE_INSTRUCTIONS = [
  '너는 노래의 원곡 보컬 최고음을 찾는 도우미다. 입력은 JSON으로 곡 제목(title)과 가수(artist)다.',
  ...HIGHEST_RULES,
  '- 찾았으면 found는 true, 찾지 못했으면 found는 false로 두고 나머지는 모두 null로 둔다.',
].join('\n');

function redact(text, apiKey) {
  return String(text).split(apiKey).join('[key]').replace(/sk-[\w*-]+/g, '[key]');
}

async function requestJson({ apiKey, model, fetchImpl, timeoutMs, instructions, input, schemaName, schema, webSearch = true }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let body;
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, instructions, input, ...(webSearch ? { tools: [{ type: 'web_search' }] } : {}), reasoning: REASONING, text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } } }),
      signal: controller.signal,
    });
    body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof body?.error?.message === 'string' ? `: ${body.error.message.slice(0, 200)}` : '';
      throw new AiError('upstream', redact(`OpenAI ${response.status}${detail}`, apiKey));
    }
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (controller.signal.aborted) throw new AiError('timeout', 'OpenAI 응답 시간이 지났어요.');
    throw new AiError('upstream', 'OpenAI에 연결하지 못했어요.');
  } finally {
    clearTimeout(timer);
  }
  const text = (Array.isArray(body?.output) ? body.output : [])
    .filter(item => item?.type === 'message')
    .flatMap(item => Array.isArray(item.content) ? item.content : [])
    .filter(part => part?.type === 'output_text')
    .map(part => part.text).join('');
  try { return JSON.parse(text); }
  catch { throw new AiError('format', 'AI 응답 형식이 올바르지 않아요.'); }
}

export function fetchRecommendations(request, { apiKey, model, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  return requestJson({ apiKey, model, fetchImpl, timeoutMs, instructions: RECOMMEND_INSTRUCTIONS, input: JSON.stringify(request), schemaName: 'recommendations', schema: RECOMMENDATION_SCHEMA });
}

export function fetchSongRange({ title, artist }, { apiKey, model, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  return requestJson({ apiKey, model, fetchImpl, timeoutMs, instructions: SONG_RANGE_INSTRUCTIONS, input: JSON.stringify({ title, artist }), schemaName: 'song_range', schema: SONG_RANGE_SCHEMA });
}

// Practice feedback: the app measured everything; the model only explains those numbers (no web search).
const LINK_SCHEMA = { anyOf: [{ type: 'string', enum: ['practice', 'learn'] }, { type: 'null' }] };
const PRACTICE_ITEM = { type: 'object', additionalProperties: false, required: ['text', 'link'], properties: { text: { type: 'string' }, link: LINK_SCHEMA } };
const feedbackSchema = point => ({
  type: 'object', additionalProperties: false, required: ['good', 'improve', 'practice'],
  properties: { good: { type: 'array', items: point }, improve: { type: 'array', items: point }, practice: { type: 'array', items: PRACTICE_ITEM } },
});
const LINE_POINT = { type: 'object', additionalProperties: false, required: ['lineId', 'text'], properties: { lineId: { type: 'integer' }, text: { type: 'string' } } };
const FEEDBACK_RULES = `너는 친절한 보컬 코치다. 앱이 잰 숫자만 근거로 한국어로 피드백한다. 숫자에 없는 내용은 지어내지 않는다.
- good(잘한 점) 1~2개, improve(아쉬운 점) 1~2개, practice(추천 연습) 1~2개. 항목마다 80자 이내.
- 실력을 평가하거나 깎아내리는 말은 쓰지 않는다. 성장에 초점을 두고 부드럽게 말한다. 의학적 진단은 하지 않는다.
- 음 이름은 받은 그대로 쓴다(예: 2옥 라). 센트·비율 같은 숫자나 voiced, wobble 같은 측정 이름은 그대로 쓰지 않고 쉬운 말로 바꾼다(예: '조금 낮았어요', '음이 살짝 흔들렸어요', '중간에 숨이 끊겼어요').
- practice.link: 허밍 연습이 도움이 되면 'practice', 읽을거리가 도움이 되면 'learn', 아니면 null.
- 통증(pain)이 있었거나 stoppedForPain이 true면 improve 첫 항목은 무리하지 말고 쉬어 가자는 말이다.`;
const HUMMING_INSTRUCTIONS = `${FEEDBACK_RULES}
입력은 허밍 연습 한 번이다. attempts: target(목표음), sung(낸 음), centsOff(목표음과의 차이, 센트), comfort(comfortable 편함 / effort 힘듦 / unsure 모름 / pain 불편), reason(측정 결과). comfortableNotes는 편하게 확인한 음, todayHigh는 오늘 가장 높게 편했던 음, previousHigh는 지난번, comfortableHigh는 내 편한 최고음이다.`;
const SONG_INSTRUCTIONS = `${FEEDBACK_RULES}
입력은 노래 한 곡을 따라 부른 측정이다. 가사는 받지 않았으니 가사를 지어내지 않는다. good과 improve는 반드시 lines에 있는 id 하나를 lineId로 가리킨다.
lines: section(구간 이름), voiced(소리를 낸 비율), top(가장 높은 음), overComfort(내 편한 최고음보다 높았던 비율), wobble(음이 반음 넘게 튄 비율), gaps(0.4초 넘게 끊긴 횟수). chorusDiffs는 같은 멜로디를 두 번 부른 줄끼리의 중간음 차이(반음)이다. 0에 가까우면 일정하게 부른 것이다.`;

export function fetchPracticeFeedback(payload, { apiKey, model, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  const song = payload.kind === 'song';
  return requestJson({ apiKey, model, fetchImpl, timeoutMs, webSearch: false, instructions: song ? SONG_INSTRUCTIONS : HUMMING_INSTRUCTIONS, input: JSON.stringify(payload), schemaName: song ? 'practice_feedback_song' : 'practice_feedback_humming', schema: feedbackSchema(song ? LINE_POINT : { type: 'string' }) });
}
