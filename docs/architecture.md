# SING 시스템 구조

기준일: 2026-10-13. 현재는 **1단계 모바일 웹 프로토타입**이며, 아래의 현재 구조와 확장 구조를 구분한다.

## 현재 구조

```mermaid
flowchart TD
    Static[Node.js 정적 개발 서버] --> UI[브라우저 화면 · app / views]
    User[사용자] -->|허밍 · 체감 입력| UI
    UI -->|기준음 재생| Piano[Web Audio · 로컬 피아노 샘플]
    UI --> Capture[마이크 입력 · 짧은 녹음]
    Capture --> Pitch[pitch.js · 음높이와 신뢰도 추정]
    Pitch --> Lesson[lesson.js · 진행 규칙]
    UI -->|편안함 응답| Lesson
    Lesson -->|결과 · 다음 과제| UI
    UI <--> Songs[플레이리스트 · 곡 입력 / 검색 / AI 추천]
    UI <--> SongScreen[노래 화면 · 영상 · 구간 · 구간 메모]
    SongScreen -->|재생 · nocookie 플레이어| YTPlayer[YouTube 플레이어]
    SongScreen -->|동의 후 · 곡 화면을 열 때| Server
    SongScreen -->|이어폰 · 따라 부르기| SingAlong[sing-along.js · 50ms마다 음높이 · 가사 줄별 숫자]
    SingAlong -->|동의 후 · 피드백을 받을 때| Server
    Lesson -->|결과 화면 · 지난 기록 · 피드백을 받을 때| Server
    UI <--> Voice[내 음역 온보딩 · 오선지 · 노래방 키 줄]
    Songs -->|동의 후| Server[로컬 서버 · /api/recommend · /api/song-range · /api/song-search · /api/practice-feedback]
    Voice -->|동의 후| Server
    Server --> OpenAI[OpenAI · 웹 검색 · 연습 피드백은 검색 없이]
    Server --> Check[출처 페이지 확인 · 인용 문장과 음 표기 대조]
    Server --> TJ[TJ미디어 노래방 검색 · 검색할 때만 조회]
    Server --> MB[MusicBrainz · TJ가 못 찾을 때]
    Server --> YT[YouTube Data API · MV와 금영 노래방 영상 후보]
    Server --> LRC[LRCLIB 가사 시간 · 구간 계산 · 가사 줄은 화면으로 전달만]
    UI <--> Store[storage.js · IndexedDB]
    Store <--> Backup[사용자 백업 파일]
```

서버는 HTML·JavaScript·CSS·동봉 자산을 제공한다. 음높이 계산과 저장은 브라우저 안에서 수행하며, 음성 업로드 API와 회원 서버는 없다. 곡 추천(`POST /api/recommend`)과 최고음 찾기(`POST /api/song-range`)는 서버를 거쳐 OpenAI를 호출하고, 곡 검색(`GET /api/song-search`)은 서버가 TJ미디어 노래방 검색에 먼저 묻고(사용자가 검색할 때만, 결과는 쌓지 않음), 찾지 못하면 MusicBrainz에 묻는다. 노래 화면은 곡 상세 화면을 처음 열 때 영상 후보(`GET /api/song-videos`, YouTube Data API)와 구간(`GET /api/song-sections`, LRCLIB 가사 시간)을 서버에 묻는다. 서버는 구간 시간과 이름, 그리고 가사 줄을 돌려준다. 화면은 구간만 곡에 저장하고 가사 줄은 메모리에만 두어 화면에 보여준다(기기 저장소·백업·서버 디스크·로그에 남기지 않는다). 원곡은 YouTube 공식 음원 트랙("가수 - Topic")을 곡 길이로 맞춰 먼저 쓰고, 없으면 MV를 쓴다. 키는 서버의 `.env`에만 있고, 모두 사용자 동의(버전 5) 후에만 요청한다. 연습 피드백(`POST /api/practice-feedback`)은 앱이 잰 숫자만 서버를 거쳐 OpenAI로 보낸다(아래 ‘연습 피드백 데이터 흐름’). AI가 준 최고음은 서버가 출처 페이지를 열어 인용 문장과 음 표기를 대조한 뒤에만 앱으로 보낸다. 이때 사설·루프백 주소로는 접속하지 않는다.

| 구성 | 책임 | 주요 파일 |
| --- | --- | --- |
| 화면과 조정 | 화면 전환, 입력, 저장 호출, 체험/실제 상태 분리 | `src/app.js`, `src/views.js`, `src/styles.css` |
| 오디오 | 피아노 샘플 선택·재생, 마이크 요청, 녹음, 취소 처리 | `src/piano.js`, `src/audio.js`, `src/capture.js` |
| 음높이 분석 | 단일 음의 주기성에서 주파수·음이름·신뢰도 요약 | `src/pitch.js` |
| 레슨 규칙 | 시작음 확인, 목표음 비교, 체감에 따른 진행·종료 | `src/lesson.js` |
| 곡과 플레이리스트 | 곡 검증, 제목·가수 검색, 키 변경 표시, 사용자 이름 플레이리스트와 AI 추천 | `src/songs.js`, `src/song-views.js`, `src/playlists.js`, `src/playlist-views.js`, `src/recommend.js` |
| 내 음역 | 자신 있는 곡으로 편한 최고음 어림, 남녀 곡 옥타브 제안, 편함·도전·무리 분류, 오선지와 노래방 키 줄(원키 가운데, 맞는 키 표시) | `src/onboarding.js`, `src/onboarding-views.js`, `src/vocal-range.js`, `src/notes.js`, `src/range-graphics.js` |
| AI와 외부 연결 | 추천·최고음 찾기 흐름, 출처 확인, 곡 검색(TJ 우선, MusicBrainz 대체), 요청 간격, 동의 버전 | `scripts/services.mjs`, `scripts/ai.mjs`, `scripts/verify-source.mjs`, `scripts/song-search.mjs`, `scripts/tj.mjs`, `scripts/throttle.mjs`, `scripts/musicbrainz.mjs`, `src/consent.js` |
| 노래 화면 | 원곡(음원 트랙, 없으면 MV)·금영 노래방 영상 재생(플레이어를 지운 채 다시 그리지 않음), 자동 구간과 흐름 막대, 영상별 시작 맞추기, 구간 메모, 영상 바꾸기·링크 붙여넣기 | `src/song-media.js`, `src/song-media-views.js`, `src/song-player.js`, `src/sections.js`, `scripts/youtube.mjs`, `scripts/lrclib.mjs`, `scripts/title-match.mjs` |
| 저장 | 상태/원음 저장, 백업 검증과 복원 | `src/storage.js` |
| 개발 서버 | 허용된 정적 파일 제공과 API 전달(입력 한도, 키는 `.env`) | `scripts/serve.mjs`, `scripts/server.mjs` |

## 화면 보안 설정 (CSP)

- 기본은 `'self'`만 허용한다. 노래 화면의 플레이어 때문에 `script-src`에 `https://www.youtube.com`(IFrame API), `frame-src`에 `https://www.youtube-nocookie.com`만 더했다.
- `style-src`는 `'self'`뿐이라 화면 문자열에 인라인 스타일을 쓰지 않는다. 흐름 막대 같은 위치는 SVG 속성으로 정한다.
- `Referrer-Policy`는 두지 않는다. YouTube는 페이지 주소를 받지 못하면 퍼간 영상을 재생하지 않는다(오류 153).

## 연습 피드백 데이터 흐름

측정은 앱이, 설명은 AI가 한다. AI는 녹음이나 가사 글자를 받지 않는다.

1. 허밍: 결과 화면이나 지난 기록에서 ‘AI 피드백 받기’를 누르면 시도별 목표음·낸 음(한국식 음 이름)·목표음과의 차이(센트)·체감·측정 결과, 편하게 확인한 음, 오늘·지난번 최고음, 내 편한 최고음, 통증 중단 여부를 `POST /api/practice-feedback`으로 보낸다.
2. 따라 부르기: 노래 화면에서 이어폰을 끼고 부르는 동안 50ms마다 마이크 음높이(선명도 0.85 이상만)를 곡 시간과 함께 메모리에 모은다. 멈추면 가사 줄마다 소리를 낸 비율, 가장 높은 음, 내 편한 최고음을 넘은 비율, 반음 넘게 튄 비율, 0.4초 넘는 끊김 수를 계산하고, 두 후렴의 같은 순서 줄끼리 중간음 차이를 잰다. 4줄 이상 불렀을 때만 곡 제목·가수·구간 이름·줄 번호와 이 숫자들을 보낸다.
3. 서버는 요청 형식(키·개수·음 이름 형식·범위)을 확인하고 OpenAI Responses API를 웹 검색 없이 JSON 스키마로 부른다.
4. 서버는 답에서 항목마다 80자 이내, 목록마다 2개까지만 남기고, 노래 피드백은 보낸 줄 번호를 가리키는 항목만 남긴다. 남은 게 없으면 실패로 답한다.
5. 허밍 피드백은 그 레슨에 함께 저장한다(백업에도 포함). 따라 부르기 피드백은 화면에만 보여주고 저장하지 않으며, 줄 글자는 기기 메모리의 가사에서 붙인다. 화면을 떠나면 마이크를 닫는다.

## 한 번의 연습 데이터 흐름

1. 첫 시도는 편한 높이에서 허밍한다. 이후 목표음이 정해지면 피아노를 듣고 짧게 따라 한다.
2. 마이크 입력을 짧은 프레임으로 나눠 분석한다. 신호가 부족하거나 음높이 변화가 큰 시도는 미확인으로 처리한다.
3. 측정값과 별도로 사용자가 편안함·힘듦·모름·불편함을 입력한다.
4. 레슨 규칙이 같은 음 재확인, 종료, 선택적 반음 상승 여부를 결정한다. 측정 실패를 임의의 성공값으로 바꾸지 않는다.
5. 확인한 음, 시도별 결과와 체감을 저장한다. 사용자가 원음 보관을 선택했을 때만 녹음도 저장한다.

분석 결과는 해당 시도의 음높이 정보다. 전체 음역이나 발성 원인을 확정하는 결과가 아니다.

## 저장 구조

- IndexedDB `sing-practice`의 `state`와 `recordings`를 사용한다.
- 상태에는 완료 레슨, 진행 중 초안, 학습/휴식 활동, 개인 곡, 원음 보관 설정이 포함된다.
- 곡에는 선택 필드 `media`가 붙을 수 있다: MV·노래방 영상(자동으로 찾은 것은 후보 3개까지, 30일 뒤 지우고 다시 찾음), 찾지 못한 기록("없음", 7일), 구간 시간과 이름, 영상별 시작 차이, 구간 메모(영상 ID와 그 영상의 시간). 가사 글자는 저장하지 않는다. 곡 제목이나 가수를 고치면 자동으로 찾은 영상과 구간만 지운다.
- 백업 파일은 상태와 선택적으로 보관한 원음을 함께 담는다. 복원 전 형식·용량을 검증한다.
- 체험 모드는 메모리 안에서 동작하며 실제 저장소에 예시 결과를 쓰지 않는다.
- 브라우저·기기·접속 주소가 달라지면 저장소도 달라진다. 현재 계정과 기기 간 동기화는 없다.

## 확장 구조 — 계획

```mermaid
flowchart LR
    Measure[브라우저 측정 지표] --> Input[지표 · 체감 · 관련 이력]
    Input --> Backend[추가 예정 서버 API]
    Backend --> Model[생성형 AI API]
    Model --> Validate[응답 형식 · 근거 검증]
    Validate --> Feedback[설명 · 준비된 연습 중 다음 과제]
    Catalog[출처가 확인된 곡 데이터] --> Filter[음역 · 키 · 취향 기반 후보 선정]
    Filter --> Backend
```

연습 피드백은 위 흐름으로 구현했다. 아래는 그 밖의 계획이다. 서버·모델·곡 데이터 공급원은 미정이다. 서버에서 API 키를 관리하고, 초기 AI 입력은 원음보다 측정 지표를 중심으로 설계할 계획이다. 전송 범위 안내와 동의, 실패 시 기본 피드백은 연결 단계에서 구현한다. 아직 존재하는 서비스로 해석하면 안 된다.

관련 문서: [AI 활용 계획](ai-plan.md) · [로드맵](roadmap.md)
