import { localDay, weekDays, summarizeLesson, recommendedNote } from './lesson.js';
import { noteName } from './pitch.js';
import { songbookView, songFormView, songDetailView } from './song-views.js';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const e = escapeHtml;
const paths = {
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  book: '<path d="M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Z"/><path d="M12 5v15"/>',
  history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  mic: '<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  leaf: '<path d="M20 3C6 2 2 10 6 16s16 3 14-13Z"/><path d="M3 22 16 8"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  note: '<path d="M9 17V5l11-3v12M9 8l11-3"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="15" rx="3" ry="2.5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
};
export const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.note}</svg>`;
const button = (label, action, options = {}) => `<button class="button ${options.class || ''}" data-action="${action}" ${options.disabled ? 'disabled' : ''} ${options.id ? `data-id="${e(options.id)}"` : ''}>${options.icon ? icon(options.icon) : ''}${label}</button>`;
const note = midi => noteName(midi)?.label || '아직 미확인';
const dateText = value => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(value);
const dateStringText = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? dateText(new Date(`${value}T12:00:00`)) : '';
const waveform = active => `<div class="waveform ${active ? 'listening' : ''}" aria-hidden="true">${'<span></span>'.repeat(23)}</div>`;
const progress = current => `<div class="progress-steps" aria-label="레슨 단계"><span class="${current === 0 ? 'current' : ''}">준비</span><i></i><span class="${current === 1 ? 'current' : ''}">편한 음 찾기</span><i></i><span class="${current === 2 ? 'current' : ''}">맞춤 연습</span><i></i><span class="${current === 3 ? 'current' : ''}">오늘의 기록</span></div>`;
const back = (label = '오늘의 연습', action = 'home') => `<button class="back-button" data-action="${action}">${icon('back')}${label}</button>`;
const header = (title, description, step = null) => `<div class="lesson-header">${step === null ? '' : progress(step)}<h1>${title}</h1><p>${description}</p></div>`;

function week(state) {
  const days = weekDays();
  const activeDays = new Set(state.activities.filter(a => a.type !== 'rest' && days.includes(a.day)).map(a => a.day));
  return `<div class="weekly-top"><h2 class="section-label">이번 주의 발걸음</h2><small>${activeDays.size}일 / 목표 3일</small></div>
    <div class="week-days">${days.map((day, index) => {
      const activities = state.activities.filter(a => a.day === day);
      const done = activities.some(a => a.type !== 'rest');
      const rest = !done && activities.some(a => a.type === 'rest');
      return `<div class="day-item ${day === localDay() ? 'today' : ''} ${done ? 'done' : rest ? 'rest' : ''}" aria-label="${e(day)} ${done ? '학습 또는 연습 완료' : rest ? '휴식' : '기록 없음'}"><span>${['월', '화', '수', '목', '금', '토', '일'][index]}</span><span class="day-dot">${done ? icon('check') : rest ? icon('leaf') : Number(day.slice(-2))}</span></div>`;
    }).join('')}</div><p class="weekly-copy">${activeDays.size ? `<strong>${activeDays.size}일, 나를 위해 시간을 냈어요.</strong><br>작은 연습도 하나의 발걸음이에요.` : '<strong>첫 발걸음을 남겨볼까요?</strong><br>연습한 날도, 배운 날도 함께 기록해요.'}</p>`;
}

const noteArt = `<svg class="note-art" viewBox="0 0 300 250" fill="none" aria-hidden="true"><g stroke="#aecaba" stroke-width="1"><path d="M12 171h277M12 142h277M12 113h277M12 84h277M12 55h277"/></g><g stroke="#769c86" stroke-dasharray="3 5"><path d="M47 201V157M105 201v-74M165 201V95M226 201V63"/></g><path d="m48 157 58-29 59-30 61-32" stroke="#246c62" stroke-width="1.5" stroke-dasharray="4 5"/><g fill="#246c62"><ellipse cx="47" cy="157" rx="14" ry="10" transform="rotate(-20 47 157)"/><ellipse cx="105" cy="128" rx="14" ry="10" transform="rotate(-20 105 128)"/><ellipse cx="165" cy="98" rx="14" ry="10" transform="rotate(-20 165 98)"/></g><g stroke="#246c62" stroke-width="2.5"><path d="M60 154v-47M118 125V78M178 95V48"/></g><circle cx="226" cy="66" r="23" fill="#f2d3b4"/><path d="m216 66 7 7 13-15" stroke="#183e3b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><text x="120" y="230" fill="#5d7d69" font-size="12" font-family="sans-serif" letter-spacing="2">나의 속도로</text></svg>`;

function home(v) {
  const hasDraft = Boolean(v.state.draft);
  const today = v.state.activities.some(a => a.day === localDay() && a.type === 'practice');
  return `<div class="greeting"><h1>${today ? '오늘도 수고했어요.' : '반가워요.'}<br><strong>${today ? '차곡차곡, 나의 목소리 기록.' : '오늘의 목소리를 만나볼까요?'}</strong></h1><div class="date-label">${icon('sun')}${dateText(new Date())}</div></div>
  <div class="home-grid"><section class="lesson-cover"><div class="cover-top"><span class="lesson-tag">${icon('note')}${hasDraft ? '이어지는 나의 레슨' : '나에게 맞는 첫 레슨'}</span><span class="mini-pill">허밍으로 시작</span></div>${noteArt}<div class="cover-copy"><h2>편한 음부터,<br>한 걸음씩.</h2><p>${hasDraft ? '잠시 멈췄던 연습이 기다리고 있어요.<br>오늘의 상태를 확인하고 이어가요.' : '내가 편하게 낼 수 있는 음을 찾고,<br>그 높이에서 짧게 연습해요.'}</p></div><div class="cover-bottom">${button(hasDraft ? '이어서 연습하기' : today ? '새 레슨 시작하기' : '첫 레슨 시작하기', 'begin', { icon: 'arrow', disabled: v.loading })}<button class="text-button" data-action="demo">마이크 없이 둘러보기</button></div></section>
  <aside class="side-column"><section>${week(v.state)}</section><hr class="side-divider"><section><h2 class="section-label">오늘은 이렇게 연습해요</h2><ol class="next-steps"><li><span class="step-number">01</span><div><strong>편한 음 찾기</strong><small>내 목소리의 시작점</small></div></li><li><span class="step-number">02</span><div><strong>나에게 맞춰 연습</strong><small>확인한 음에서 한 번 더</small></div></li><li><span class="step-number">03</span><div><strong>오늘의 느낌 남기기</strong><small>다음 연습으로 이어지는 기록</small></div></li></ol></section></aside></div>
  <div class="home-lower"><button class="learn-teaser" data-action="learn"><span class="learn-symbol">${icon('book')}</span><span><strong>연습 전, 이것만 알아두세요</strong><p>음높이와 편안함은 어떻게 다를까요?</p></span>${icon('arrow')}</button><div class="rest-note">${icon('leaf')}<p>목소리가 피곤한 날에는 쉬어가도 괜찮아요.<br>오늘의 휴식도 나를 알아가는 기록이에요.</p></div></div>`;
}

function check(v) {
  return `<div class="narrow">${back()}${header('오늘, 목소리는 어떤가요?', '매일의 상태가 다르니까요.<br>지금의 느낌에서 시작해요.', 0)}<div class="choices"><button class="choice" data-action="well"><span>${icon('sun')}</span><span><strong>편안해요</strong><small>평소처럼 소리를 낼 수 있어요</small></span>${icon('arrow')}</button><button class="choice" data-action="rest"><span>${icon('leaf')}</span><span><strong>피곤하거나 목이 쉬었어요</strong><small>오늘은 소리 내지 않고 배울게요</small></span>${icon('arrow')}</button><button class="choice" data-action="rest"><span>${icon('pause')}</span><span><strong>아프거나 불편해요</strong><small>발성은 쉬고 상태를 기록할게요</small></span>${icon('arrow')}</button></div>${v.state.draft && v.state.draft.day !== localDay() ? '<div class="hint">이전 날의 탐색은 중간 기록으로 남겨두고, 오늘의 편한 음부터 다시 시작해요.</div>' : ''}</div>`;
}

function intro(v) {
  const hasSuggestion = Number.isInteger(v.session?.targetMidi);
  const suggestion = hasSuggestion ? `<div class="hint">지난 기록의 <strong>${e(note(v.session.targetMidi))}</strong>에서 시작해볼까요? 오늘도 편한지 새로 확인해요. ${button('다른 편한 음에서 시작', 'free-start', { class: 'quiet' })}</div>` : '';
  return `<div class="narrow">${back()}${header('먼저, 가볍게 허밍해볼까요?', '입을 다문 채 작게 ‘음—’.<br>오늘의 편한 시작음을 찾아볼 거예요.', 0)}${suggestion}
  <section class="surface humming-guide"><p class="eyebrow">처음 해보는 허밍</p><h2>크게 부르기보다, 작게 ‘음—’</h2><ol class="instructions"><li><strong>입술만 살짝 맞대요.</strong><br>이를 꽉 물지 말고, 턱과 어깨는 편하게 둬요.</li><li><strong>편한 높이에서 작게 ‘음—’ 해요.</strong><br>입술 주변이 살짝 울릴 수 있어요. 그 느낌을 억지로 만들 필요는 없어요.</li><li><strong>힘을 주지 않아도 이어지면 충분해요.</strong><br>코로 소리를 밀거나 높게 올리려고 애쓰지 않아요.</li></ol><p class="subtle">녹음은 3초예요. 숨이 부족하면 일찍 멈춰도 괜찮아요. 불편하면 쉬어가요.</p></section>
  <section class="piano-preview"><div><h2>앞으로는 이 소리를 듣고 따라가요</h2><p>피아노의 <strong>음높이만</strong> 따라 해요.<br>피아노 음색을 흉내 낼 필요는 없어요.</p></div>${button(v.busy === 'tone' ? '피아노를 듣고 있어요' : '피아노 기준음 미리 듣기', 'preview-piano', { icon: 'play', class: 'secondary', disabled: Boolean(v.busy) })}<p class="subtle">${hasSuggestion ? '지난 기록의 음을 미리 들려드려요. 오늘 편한지는 다시 확인해요.' : '미리듣기는 가온도(C4)예요. 첫 녹음에서는 이 음을 맞추지 않아도 돼요.'} 사람의 허밍 시범은 아직 준비 중이에요.</p></section>
  <label class="checkbox-label"><input id="keep-audio" type="checkbox" ${v.state.settings.keepAudio ? 'checked' : ''}><span>내 녹음도 이 기기에 보관할게요.<br>선택하지 않으면 음높이와 느낌만 남아요.</span></label>${!v.demo && !globalThis.isSecureContext ? '<div class="notice">현재 주소에서는 마이크를 사용할 수 없어요. HTTPS 주소 또는 이 기기의 localhost에서 열어 주세요. 체험 모드에서는 화면 흐름을 볼 수 있어요.</div>' : ''}<div class="action-row">${button('편한 음 찾기', 'explore', { icon: 'mic', disabled: v.busy })}</div><p class="subtle">조용한 곳에서 시작해 주세요. 녹음 뒤에 느낀 편안함을 알려주세요.</p></div>`;
}

const stopLabels = { effort: '힘들다고 느낀 지점에서 탐색을 마쳤어요.', unsure: '느낌이 분명하지 않아, 여기까지 확인했어요.', pain: '불편함을 알려주셔서 발성 연습을 마쳤어요.', measurement: '이번에는 소리를 충분히 확인하기 어려웠어요.', 'session-limit': '오늘 정해둔 탐색 분량을 마쳤어요.', 'measurement-range': '앱이 확인할 수 있는 높이까지 탐색했어요.', interrupted: '이전 탐색을 중간 기록으로 남겼어요.', user: '원하는 지점에서 탐색을 마쳤어요.' };
const comfortLabels = { comfortable: '편했어요', effort: '힘들거나 갈라졌어요', unsure: '잘 모르겠어요', pain: '불편해서 마쳤어요' };

function capture(v, practice = false) {
  const s = v.session;
  const target = practice ? recommendedNote(s) : s.targetMidi;
  const pending = v.pending;
  const ready = !practice && s.phase === 'ready';
  const n = target === null ? null : noteName(target);
  const heading = practice ? '내 음높이에서, 한 번 더.' : s.phase === 'start' ? '가장 편한 소리로 시작해요.' : ready ? '이 음은 편하게 확인했어요.' : s.phase === 'confirm' ? '같은 음을 한 번 더 확인해요.' : s.phase === 'retry' ? '소리를 한 번 더 확인할까요?' : '조금만 높이를 바꿔볼게요.';
  const description = practice ? '여러 번 편하다고 확인한 음이에요.<br>기준음을 듣고 짧게 ‘음—’ 해보세요.' : target === null ? '정답인 음은 없어요. 편한 높이에서 ‘음—’ 해보세요.' : ready ? '조금 더 탐색해도 좋고, 여기서 마쳐도 괜찮아요.' : s.phase === 'retry' ? '측정이 불확실하거나 다른 음이 들렸어요.<br>더 크게 내려고 애쓰지 않아도 돼요.' : '기준음이 끝난 뒤, 무리 없는 크기로 따라 해보세요.';
  return `<div class="narrow">${back('잠시 나가기', 'pause')}${header(heading, description, practice ? 2 : 1)}<section class="pitch-panel"><div class="label">${target === null ? '내가 편한 높이' : '따라갈 기준음'}</div><div class="pitch-name">${n ? e(n.name) + `<small>${e(n.scientific)}</small>` : '음—'}</div><div class="pitch-caption">${target === null ? '지금 내 목소리에서 시작' : '피아노의 음높이만 따라 해요'}</div>${waveform(v.busy === 'recording')}${target !== null ? `<button class="listen-button" data-action="tone" ${v.busy ? 'disabled' : ''}>${icon('play')}기준음 듣기</button>` : ''}<div id="capture-status" class="capture-status" role="status">${v.busy === 'tone' ? '피아노 소리를 듣고 준비해요' : v.busy === 'recording' ? '권한을 허용하면 녹음을 시작해요' : v.demo ? '체험 모드에서는 예시 음을 사용해요' : '녹음은 버튼을 누르면 시작해요'}</div><progress id="record-progress" class="record-progress" max="1" value="0" ${v.busy === 'recording' ? '' : 'hidden'} aria-label="녹음 진행"></progress></section>
  ${!practice ? `<div class="attempt-label"><span>허밍 · ${s.attempts.length}회 확인</span><span>이번 탐색은 최대 8회</span></div>` : ''}
  ${v.error ? `<div class="error-box" role="alert">${e(v.error)}</div>` : ''}
  ${pending ? pendingView(v, practice) : ready ? `<div class="hint">${e(note(s.attempts.at(-1)?.midi))}에서 편하다고 알려주셨어요.${summarizeLesson(s).repeated.length ? ' 이 음에서 이어갈 연습을 준비했어요.' : ''}</div><div class="action-row">${button('여기까지 확인하기', 'finish')}${button('반음 높여보기', 'higher', { class: 'secondary' })}</div>` : `<div class="action-row">${button(v.busy ? '소리를 확인하고 있어요' : target === null ? '내 목소리 녹음하기' : '기준음 듣고 따라 하기', practice ? 'record-practice' : 'record', { icon: 'mic', disabled: Boolean(v.busy) })}</div>${!practice ? `<button class="button quiet" data-action="finish" ${v.busy ? 'disabled' : ''}>오늘은 여기까지 확인할게요</button>` : ''}`}
  <button class="stop-link" data-action="pain">아프거나 불편해요 · 바로 마치기</button></div>`;
}

function pendingView(v, practice) {
  const m = v.pending.measurement;
  return `<div class="measurement"><div><small>실제로 감지한 음</small><strong>${m.reliable ? e(note(m.midi)) : '아직 미확인'}</strong></div><div class="measurement-meta">${m.reliable ? '소리를 확인했어요' : '음높이를 충분히<br>확인하지 못했어요'}</div></div>${v.playUrl ? `<audio class="audio-player" controls preload="metadata" src="${e(v.playUrl)}" aria-label="방금 녹음한 소리"></audio>` : ''}<h2 class="feedback-question">소리를 낼 때 어땠나요?</h2><div class="comfort-options"><button class="comfort-option" data-action="${practice ? 'practice-' : ''}comfortable" ${v.busy ? 'disabled' : ''}><span>○</span> 편했어요</button><button class="comfort-option" data-action="${practice ? 'practice-' : ''}effort" ${v.busy ? 'disabled' : ''}><span>△</span> 힘들거나 소리가 갈라졌어요</button><button class="comfort-option" data-action="${practice ? 'practice-' : ''}unsure" ${v.busy ? 'disabled' : ''}><span>?</span> 잘 모르겠어요</button></div><p class="subtle">${m.reliable ? '음높이와 편안함은 별개예요. 지금의 느낌을 알려주세요.' : '미확인은 연습 실패가 아니에요. 느낀 점은 따로 남길 수 있어요.'}</p>`;
}

function result(v, history = false) {
  const s = v.session;
  const summary = summarizeLesson(s);
  const recommended = recommendedNote(s);
  return `<div class="narrow">${back(history ? '나의 기록' : '오늘의 연습', history ? 'history' : 'home')}${header('오늘 확인한 나의 음.', '허밍으로 직접 확인한 음과<br>내가 느낀 편안함을 함께 담았어요.', history ? null : 2)}<div class="surface"><p class="eyebrow">${e(dateStringText(s.day))} · 허밍</p><div class="result-summary">${summary.notes.length ? `오늘은 ${e(note(summary.highest))}까지<br>편하다고 알려주셨어요.` : '오늘은 느낌을 기록했어요.<br>음높이는 아직 미확인이에요.'}</div><div class="result-notes">${summary.notes.map(n => `<span class="note-chip">${e(note(n))}${summary.repeated.includes(n) ? ' ✓' : ''}</span>`).join('')}</div><p class="subtle">${summary.notes.length ? '✓ 두 번 이상 확인한 음' : '유효한 음높이와 편안함 응답이 함께 있을 때 표시해요.'}</p><hr class="separator"><p>${e(stopLabels[s.stopReason] || '이번에 확인한 소리를 기록했어요.')}</p><p class="subtle">오늘 이 과제로 확인한 음이에요. 전체 음역의 최저음·최고음이나 발성의 완성도를 뜻하지 않아요.</p></div>
  ${!history && recommended !== null ? `<section class="recommendation"><span class="badge">${icon('note')}나에게 맞춘 다음 연습</span><h2>${e(note(recommended))}에서 짧은 허밍</h2><p>두 번 이상 편하게 확인한 음에서 시작해요.<br>위로 더 올리지 않고, 같은 소리를 한 번 내볼 거예요.</p>${button('이 음에서 연습하기', 'practice', { icon: 'play' })}</section>` : !history && s.stopReason !== 'pain' ? '<div class="hint">같은 음을 편하게 낸 기록이 두 번 모이면, 그 높이에 맞춘 연습을 제안해요. 오늘은 안내를 읽거나 여기서 마쳐도 좋아요.</div>' : ''}
  ${history && s.practice ? `<section class="surface"><h2>이어진 짧은 허밍</h2><p>기준음 ${e(note(s.practice.midi))} · ${e(comfortLabels[s.practice.comfort])}</p><p class="subtle">실제 감지음 ${s.practice.measurement?.reliable ? e(note(s.practice.measurement.midi)) : '미확인'}</p></section>` : ''}
  ${history ? `<section class="surface"><h2>시도별 기록</h2>${s.attempts.map((a, i) => `<div class="record-item"><div class="record-head"><div><h2>${i + 1}번째 · ${a.reliable ? e(note(a.midi)) : '미확인'}</h2><p>목표 ${a.targetMidi === null ? '자유롭게 시작' : e(note(a.targetMidi))} / ${e(comfortLabels[a.comfort])}</p></div>${a.recordingId ? button('듣기', 'play-saved', { class: 'secondary small', id: a.recordingId }) : ''}</div><div id="audio-${e(a.id)}"></div></div>`).join('')}${s.practice?.recordingId ? button('연습 녹음 듣기', 'play-saved', { class: 'secondary small', id: s.practice.recordingId }) : ''}<div id="saved-playback"></div></section>` : `<div class="action-row">${button('오늘은 여기까지 저장', 'save-session', { class: 'secondary', disabled: Boolean(v.busy) })}${s.stopReason !== 'pain' ? button('소리 없이 배우기', 'save-and-learn', { class: 'quiet', disabled: Boolean(v.busy) }) : ''}</div>`}</div>`;
}

function history(v) {
  return `<div class="narrow">${header('차곡차곡, 나의 기록.', '어제보다 높은 음보다,<br>내 목소리를 알아간 시간을 모아요.')}<section class="surface">${v.state.sessions.length ? v.state.sessions.slice().reverse().map(s => {
    const summary = summarizeLesson(s);
    return `<article class="record-item"><div class="record-head"><div><h2>${e(dateStringText(s.day))} · 편한 음 찾기</h2><p>${s.completedAt ? '탐색 마침' : '중간 기록'}${s.practice ? ' + 짧은 허밍' : ''}</p></div><span class="badge">허밍</span></div><div class="record-note">${summary.notes.length ? summary.notes.map(note).map(e).join(' / ') : '음높이 미확인 · 느낌 기록'}</div><div class="record-actions">${button('자세히 보기', 'detail', { class: 'secondary small', id: s.id })}${button('삭제', 'delete-session', { class: 'quiet small', id: s.id })}</div></article>`;
  }).join('') : `<div class="empty">${icon('history')}<h2>첫 기록을 기다리고 있어요</h2><p>편한 음을 찾아보고 오늘의 느낌을 남겨보세요.</p>${button('첫 레슨 시작하기', 'begin', { icon: 'arrow' })}</div>`}</section>
  ${v.state.activities.filter(a => a.type !== 'practice').length ? `<section class="surface"><h2>배움과 휴식</h2>${v.state.activities.filter(a => a.type !== 'practice').slice(-14).reverse().map(a => `<p>${e(dateStringText(a.day))} · ${a.type === 'learn' ? '연습 전 알아두기' : '목소리 쉬어가기'}</p>`).join('')}</section>` : ''}
  <details class="settings"><summary>기록과 개인정보 관리</summary><p>이 브라우저에만 저장돼요. 사이트 데이터를 지우거나 저장 공간이 정리되면 기록이 없어질 수 있어요. 소중한 기록은 백업해 두세요.</p><label class="checkbox-label"><input id="keep-audio" type="checkbox" ${v.state.settings.keepAudio ? 'checked' : ''}><span>앞으로의 원음도 보관하기 (기존 녹음은 유지돼요)</span></label><div class="action-row">${button('백업 내려받기', 'export', { class: 'secondary small', disabled: v.demo || Boolean(v.busy) })}${button('백업 가져오기', 'import', { class: 'secondary small', disabled: v.demo || Boolean(v.busy) })}</div><input class="file-input" type="file" id="backup-file" accept="application/json,.json"><p>노래장도 함께 백업해요. 가져오면 현재 기록과 노래장이 백업 내용으로 바뀝니다. 먼저 현재 기록을 백업해 주세요.</p>${button('모든 기록 삭제', 'clear', { class: 'quiet', disabled: v.demo || Boolean(v.busy) })}</details></div>`;
}

function learn() {
  return `<div class="narrow">${back()}${header('잘 부르기 전에,<br>내 소리를 알아가기.', '처음 연습할 때 알아두면 좋은 세 가지.')}<article class="surface learning-article"><p class="lead">음이 높아지는 것과<br>편하게 소리를 내는 것은 달라요.</p><div class="theory-block"><span class="theory-number">01</span><div><h2>음높이는 소리의 위치예요</h2><p>앱은 마이크로 소리의 높이를 확인해요. 정확한 음을 냈다고 해도, 목에 힘이 들지는 않았는지 내 느낌을 따로 살펴봐야 해요.</p></div></div><div class="theory-block"><span class="theory-number">02</span><div><h2>허밍으로 편한 시작점을 찾아요</h2><p>입술만 살짝 맞대고, 턱과 어깨를 편하게 둬요. 편한 높이에서 작게 ‘음—’ 해보세요. 입술 주변이 살짝 울릴 수 있지만 그 느낌을 억지로 만들지는 않아요. 코로 밀거나 크게 내지 않아도 괜찮아요. 힘들거나 불편하면 멈춰요.</p></div></div><div class="theory-block"><span class="theory-number">03</span><div><h2>매일의 목소리는 달라요</h2><p>어제 기록은 오늘의 출발점에 참고해요. 목이 쉬거나 피곤한 날은 발성을 쉬어가요. 한 번의 측정으로 내 전체 음역이나 발성 방법을 단정하지 않아요.</p></div></div><div class="hint">앱의 ‘도 · C4’에서 C4는 가온도예요. 음 이름을 외우지 않아도 기준음을 다시 들을 수 있어요.</div><p class="subtle">피아노 기준음은 음높이만 알려줘요. 피아노 음색을 흉내 낼 필요는 없어요. 사람의 허밍 시범은 아직 준비 중이에요.</p><a class="source-link" href="https://www.cuh.nhs.uk/patient-information/humming-exercises/" target="_blank" rel="noopener noreferrer">허밍 참고 · Cambridge University Hospitals</a><br><a class="source-link" href="https://www.nidcd.nih.gov/health/taking-care-your-voice" target="_blank" rel="noopener noreferrer">목소리 관리 참고 · NIDCD</a><br><a class="source-link" href="/assets/piano-credits.txt" target="_blank" rel="noopener noreferrer">피아노 음원 · Alexander Holm / Salamander Grand Piano</a></article><div class="action-row">${button('오늘의 배움으로 남기기', 'learn-complete', { icon: 'check' })}</div></div>`;
}

function rest() {
  return `<div class="narrow">${back()}<section class="completion"><div class="complete-icon">${icon('leaf')}</div><h1>오늘은 목소리를<br>쉬어가는 날.</h1><p>소리를 내지 않아도 괜찮아요.<br>지금의 상태를 알아차린 것도 소중한 기록이에요.</p><div class="hint">휴식은 따로 표시해요. 연습 일수나 높은 음 기록을 채우려고 무리할 필요 없어요.</div><div class="action-row">${button('오늘의 휴식 남기기', 'rest-complete', { icon: 'leaf' })}${button('소리 없이 배우기', 'learn', { class: 'secondary' })}</div></section></div>`;
}

function done(v) {
  const s = v.session;
  const p = s?.practice;
  return `<div class="narrow"><section class="completion">${progress(3)}<div class="complete-icon completion-mark">${icon('check')}</div><h1>${v.demo ? '첫 레슨, 이렇게 이어져요.' : '오늘의 나를 기록했어요.'}</h1><p>${v.demo ? '방금 본 음과 기록은 체험용 예시예요.<br>실제 레슨에서는 내 목소리와 느낌으로 채워져요.' : '조금씩, 내 목소리의 속도로.<br>다음에 오면 오늘의 기록을 다시 볼 수 있어요.'}</p>${p ? `<div class="surface"><h2>짧은 허밍 피드백</h2><p>${p.comfort === 'comfortable' && p.measurement.reliable ? `실제로 ${e(note(p.measurement.midi))}이 감지됐고, 편했다고 알려주셨어요.` : p.comfort === 'comfortable' ? '편안함은 기록했어요. 음높이는 충분히 확인되지 않았어요.' : '오늘은 더 반복하지 않고 느낌을 기록했어요.'}</p><p class="subtle">발성 방법의 정확성이나 고음 개선 효과를 판정하는 피드백은 아니에요.</p></div>` : ''}<div class="surface">${week(v.state)}</div><div class="action-row">${button(v.demo ? '체험 마치기' : '오늘의 연습으로', v.demo ? 'exit-demo' : 'home')}${button('기록 보기', 'history', { class: 'secondary' })}</div></section></div>`;
}

export function renderView(v) {
  const renderers = { home, check, intro, explore: x => capture(x), result, practice: x => capture(x, true), done, history, detail: x => result(x, true), learn, rest, songs: songbookView, 'song-form': songFormView, 'song-detail': songDetailView };
  const nav = ['songs', 'song-form', 'song-detail'].includes(v.page) ? 'songs' : v.page === 'learn' ? 'learn' : ['history', 'detail'].includes(v.page) ? 'history' : 'home';
  return `${v.demo ? '<div class="demo-banner">체험 모드 · 연습과 노래장은 기기에 저장되지 않아요.<button data-action="exit-demo">체험 마치기</button></div>' : ''}<div class="wrap"><header class="site-header"><button class="brand" data-action="home" aria-label="SING 오늘의 연습"><span class="wordmark">sing<span>•</span></span><span class="brand-caption">나의 작은<br>보컬 연습실</span></button><nav class="navigation" aria-label="주요 메뉴">${[['home', '오늘의 연습', 'home'], ['songs', '뭐 부르지?', 'note'], ['learn', '알아두기', 'book'], ['history', '나의 기록', 'history']].map(([page, title, glyph]) => `<button class="nav-button ${nav === page ? 'active' : ''}" data-action="${page}" ${nav === page ? 'aria-current="page"' : ''}>${icon(glyph)}${title}</button>`).join('')}</nav></header><main id="main" class="page" tabindex="-1">${v.storageError ? `<div class="notice" role="alert">${e(v.storageError)} <button class="text-button" data-action="retry-storage">다시 저장</button></div>` : ''}${renderers[v.page]?.(v) || home(v)}</main><footer class="site-footer"><span>차근차근, 내 목소리의 속도로.<span class="prototype-label">개발 버전 0.1</span></span><span class="footer-lock">${icon('lock')}이 기기에만 남기는 기록</span></footer></div>`;
}
