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

const RANGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['lowest', 'highest', 'sourceUrl', 'sourceNotation'],
  properties: { lowest: { type: 'string' }, highest: { type: 'string' }, sourceUrl: { type: 'string' }, sourceNotation: { type: 'string' } },
};
const nullable = type => ({ anyOf: [{ type }, { type: 'null' }] });
const VOCAL_SCHEMA = { anyOf: [{ type: 'string', enum: ['male', 'female', 'mixed'] }, { type: 'null' }] };
const SONG_RANGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['found', 'chestHighest', 'falsettoHighest', 'lowest', 'sourceUrl', 'sourceQuote', 'vocal'],
  properties: { found: { type: 'boolean' }, chestHighest: nullable('string'), falsettoHighest: nullable('string'), lowest: nullable('string'), sourceUrl: nullable('string'), sourceQuote: nullable('string'), vocal: VOCAL_SCHEMA },
};
const RECOMMENDATION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'artist', 'reason', 'songUrl', 'range'],
        properties: { title: { type: 'string' }, artist: { type: 'string' }, reason: { type: 'string' }, songUrl: { type: 'string' }, range: { anyOf: [RANGE_SCHEMA, { type: 'null' }] } },
      },
    },
  },
};

export const RECOMMEND_INSTRUCTIONS = [
  '너는 한국 노래방에서 부를 곡을 고르는 도우미다.',
  '입력은 JSON이다. playlistName은 사용자가 붙인 플레이리스트 이름, songs는 그 리스트에 담긴 곡이다(keyOffset은 사용자의 노래방 키 반음 수, lowestMidi/highestMidi는 원곡 보컬 음역의 MIDI 번호, fromAi는 예전에 AI 추천으로 담은 곡). exclude는 사용자가 이미 담은 모든 곡, rejected는 사용자가 \'별로예요\'를 누른 곡이다.',
  '규칙:',
  '1. 리스트 이름에 담긴 의도(예: 편하게 부르는 곡, 도전할 곡)와 담긴 곡의 분위기와 난이도를 보고, 이 리스트에 어울리는 곡 5개를 고른다.',
  '2. 웹 검색으로 곡이 실제로 있는지 확인하고, 그 곡을 보여 주는 https 페이지 주소를 songUrl에 넣는다. 확인하지 못한 곡은 넣지 않는다.',
  '3. exclude와 rejected에 있는 곡은 고르지 않는다.',
  '4. reason은 한국어 한 문장, 80자 이내로 쓰고, 담긴 곡과의 공통점을 말한다.',
  '5. 원곡 보컬의 최저음과 최고음은 출처 페이지에 적혀 있을 때만 range에 넣는다. 출처 주소는 sourceUrl에, 출처에 적힌 원래 표기는 sourceNotation에 그대로 적는다.',
  '   lowest와 highest는 과학적 음이름(가온 도 = C4, A4 = 440Hz, 예: F#4)으로 바꿔 적는다.',
  '   한국 가요식 \'n옥타브\' 표기는 과학적 표기보다 옥타브 번호가 2 작다(2옥타브 라 = A4, 3옥타브 도 = C5). 어느 표기인지 확실하지 않으면 range는 null로 둔다.',
  '6. 숫자나 음을 추측하지 않는다. 찾지 못한 정보는 null로 둔다.',
  '7. 사용자의 목소리나 실력을 평가하지 않는다.',
].join('\n');

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

export const SONG_RANGE_INSTRUCTIONS = [
  '너는 노래의 원곡 보컬 최고음을 찾는 도우미다. 입력은 JSON으로 곡 제목(title)과 가수(artist)다.',
  ...HIGHEST_RULES,
  '- 찾았으면 found는 true, 찾지 못했으면 found는 false로 두고 나머지는 모두 null로 둔다.',
].join('\n');

function redact(text, apiKey) {
  return String(text).split(apiKey).join('[key]').replace(/sk-[\w*-]+/g, '[key]');
}

async function requestJson({ apiKey, model, fetchImpl, timeoutMs, instructions, input, schemaName, schema }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let body;
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, instructions, input, tools: [{ type: 'web_search' }], reasoning: REASONING, text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } } }),
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
