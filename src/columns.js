// 알아두기 칼럼: short reads written ahead (no AI writes them), each statement backed by the sources listed under it.
// Each person starts at column 1 on the day they first open 알아두기, then gets the next one each day, round again.
// Blocks: p (paragraph), h (subheading), point (numbered: title + text), hint (boxed), note (small print).
// A column that asks you to make a sound has tryIt and says to stop if it is uncomfortable.

const DAY_MS = 86400000;
const dayNumber = day => {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) / DAY_MS;
};
const daysSince = (startDay, today) => (startDay ? dayNumber(today) - dayNumber(startDay) : 0);

export const COLUMNS = [
  {
    id: 'start',
    title: '잘 부르기 전에,\n내 소리를 알아가기.',
    subtitle: '처음 연습할 때 알아두면 좋은 세 가지.',
    lead: '음이 높아지는 것과\n편하게 소리를 내는 것은 달라요.',
    tryIt: true,
    blocks: [
      { type: 'point', title: '음높이는 소리의 위치예요', text: '앱은 마이크로 소리의 높이를 확인해요. 정확한 음을 냈다고 해도, 목에 힘이 들지는 않았는지 내 느낌을 따로 살펴봐야 해요.' },
      { type: 'point', title: '허밍으로 편한 시작점을 찾아요', text: '입술만 살짝 맞대고, 턱과 어깨를 편하게 둬요. 편한 높이에서 작게 ‘음—’ 해보세요. 입술 주변이 살짝 울릴 수 있지만 그 느낌을 억지로 만들지는 않아요. 코로 밀거나 크게 내지 않아도 괜찮아요. 힘들거나 불편하면 멈춰요.' },
      { type: 'point', title: '매일의 목소리는 달라요', text: '어제 기록은 오늘의 출발점에 참고해요. 목이 쉬거나 피곤한 날은 발성을 쉬어가요. 한 번의 측정으로 내 전체 음역이나 발성 방법을 단정하지 않아요.' },
      { type: 'hint', text: '앱의 ‘도 · C4’에서 C4는 가온도예요. 음 이름을 외우지 않아도 기준음을 다시 들을 수 있어요.' },
      { type: 'note', text: '피아노 기준음은 음높이만 알려줘요. 피아노 음색을 흉내 낼 필요는 없어요. 사람의 허밍 시범은 아직 준비 중이에요.' },
    ],
    sources: [
      { label: '허밍 참고 · Cambridge University Hospitals', url: 'https://www.cuh.nhs.uk/patient-information/humming-exercises/' },
      { label: '목소리 관리 참고 · NIDCD', url: 'https://www.nidcd.nih.gov/health/taking-care-your-voice' },
      { label: '피아노 음원 · Alexander Holm / Salamander Grand Piano', url: '/assets/piano-credits.txt' },
    ],
  },
  {
    id: 'recording',
    title: '녹음한 내 목소리,\n왜 낯설까요?',
    lead: '내가 듣는 내 목소리와 녹음된 목소리는\n귀에 들어오는 길이 달라요.',
    blocks: [
      { type: 'p', text: '말하거나 노래할 때 내 목소리는 두 길로 들려요. 공기를 타고 귓구멍으로 들어오는 소리, 그리고 머리의 조직을 타고 달팽이관에 바로 닿는 소리예요.' },
      { type: 'p', text: '머리를 타고 오는 소리에서는 낮고 굵은 울림이 더 살아나요. 녹음에는 공기를 타고 온 소리만 담겨요. 평소엔 두 소리를 섞어 듣다가 한쪽만 따로 들으니 낯설게 들리는 거예요.' },
    ],
    sources: [
      { label: '내 목소리가 다르게 들리는 이유 · Scientific American', url: 'https://www.scientificamerican.com/article/why-does-my-voice-sound-different/' },
    ],
  },
  {
    id: 'straw',
    title: '빨대 하나로 하는\n목 풀기',
    lead: '빨대를 물고 소리 내는 연습이 있어요.\n병원 음성 치료에서도 써요.',
    tryIt: true,
    blocks: [
      { type: 'p', text: '빨대로 소리를 내면 성대 아래에 공기 압력이 차올라, 성대가 더 적은 근육 힘으로 맞닿도록 돕는다고 해요. 소리 낼 때 쓰는 근육의 지나친 긴장을 푸는 데도 써요.' },
      { type: 'h', text: '이렇게 해 보세요' },
      { type: 'p', text: '컵에 상온의 물을 반쯤 담고, 빨대를 바닥에 닿지 않게 꽂아요. 편하게 앉아 보글보글 부드럽게 불어요. 익숙해지면 ‘우—’ 소리를 더하고, 낮은 음에서 높은 음으로 천천히 오르내려요. 마지막엔 빨대를 빼고 같은 느낌으로 소리 내 봐요.' },
      { type: 'hint', text: '목에 힘이 들어가지 않게 해요. 불편하면 멈춰요.' },
      { type: 'note', text: '목소리에 문제가 있는 환자들을 대상으로 한 연구에서 도움이 됐다는 결과가 있어요.' },
    ],
    sources: [
      { label: '반쯤 막힌 성도 연습 · Cambridge University Hospitals', url: 'https://www.cuh.nhs.uk/patient-information/semi-occluded-vocal-tract-exercises/' },
      { label: '립트릴·빨대 발성 연구 · PubMed (2019)', url: 'https://pubmed.ncbi.nlm.nih.gov/30408272/' },
    ],
  },
  {
    id: 'passaggio',
    title: '소리가 바뀌는 길목,\n파사지오',
    lead: '음을 올리다 보면 어느 구간에서\n소리의 느낌이 확 바뀌곤 해요.',
    tryIt: true,
    blocks: [
      { type: 'p', text: '목소리에는 성대가 떠는 방식이 서로 다른 ‘성구(레지스터)’가 있어요. 한 성구에서 다른 성구로 넘어갈 때 소리가 갑자기 달라지는 경우가 많아요.' },
      { type: 'p', text: '이렇게 성구가 바뀌곤 하는 음높이 구간을 파사지오라고 불러요.' },
      { type: 'h', text: '그래서 연습할 땐' },
      { type: 'p', text: '클래식 가수들은 이 구간에서 소리의 느낌이 눈에 띄게 바뀌지 않도록 훈련해요. 그래도 전문 가수에게서도 성구가 바뀌는 소리가 들릴 때가 있다고 해요.' },
      { type: 'p', text: '노래 선생님들은 연습할 때 이 구간을 툭 끊어 넘어가지 말고 미끄러지듯 이어 보라고, 넘어갈 때는 숨을 미는 힘을 살짝 빼라고 조언해요.' },
      { type: 'hint', text: '해 볼 때는 작고 가볍게, 목이 불편하면 멈춰요.' },
    ],
    sources: [
      { label: '소프라노의 파사지오 연구 · PMC (2017)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5414960/' },
      { label: '전문 가수의 성구 변화 · ScienceDaily (2017)', url: 'https://www.sciencedaily.com/releases/2017/05/170503151910.htm' },
      { label: '성구가 바뀌는 곳 다루기 · Chorus America', url: 'https://archive.chorusamerica.org/singers/how-do-i-control-my-voice-break' },
      { label: '성대의 성구 · PMC (2025)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11966170/' },
    ],
  },
  {
    id: 'throat-clear',
    title: '헛기침 대신\n물 한 모금',
    lead: '목이 간질간질할 때,\n헛기침보다 물 한 모금을 삼켜 보세요.',
    blocks: [
      { type: 'p', text: '헛기침은 성대끼리 세게 부딪히게 해서 성대를 자극해요. 그러면 성대에 염증이 생기고, 헛기침을 더 하고 싶어지는 악순환이 생긴다고 해요.' },
      { type: 'p', text: '그럴 땐 물을 한 모금 마시거나 무설탕 사탕을 먹어 보라고 병원에서 권해요. 한 연구에서는 물 한 모금 삼키기가 목의 거슬리는 느낌을 줄이는 데 세게 헛기침하는 것만큼 효과적이었어요. 연구진은 이 결과가 헛기침 대신 물을 삼키라는 권고를 뒷받침한다고 했어요.' },
    ],
    sources: [
      { label: '목소리 관리 · Cambridge University Hospitals', url: 'https://www.cuh.nhs.uk/patient-information/voice-care-looking-after-your-voice/' },
      { label: '헛기침과 삼키기 연구 · PubMed (2012)', url: 'https://pubmed.ncbi.nlm.nih.gov/22717491/' },
    ],
  },
  {
    id: 'together',
    title: '함께 노래하면\n빨리 친해져요',
    lead: '노래 수업을 함께 들은 사람들이\n다른 수업보다 더 빨리 가까워졌대요.',
    blocks: [
      { type: 'p', text: '영국 연구팀이 새로 시작한 성인 수업 사람들을 7개월 동안 지켜봤어요. 노래 수업 사람들은 공예나 글쓰기 수업보다 훨씬 빨리 서로 가까워졌다고 느꼈어요. 연구진은 이를 노래의 ‘아이스브레이커 효과’라고 불렀어요. 다른 수업 사람들도 시간이 지나면서 따라잡았어요.' },
      { type: 'p', text: '또 다른 연구에서는 232명이 함께 부른 큰 합창이 작은 합창보다 서로 가깝다는 느낌이 더 크게 늘었어요. 가깝다는 느낌 자체는 작은 합창이 더 컸고요.' },
      { type: 'note', text: '참가자를 무작위로 나누지 않은 연구라서, 노래만의 효과라고 단정할 수는 없어요.' },
    ],
    sources: [
      { label: '노래의 아이스브레이커 효과 · PMC (2015)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4632513/' },
      { label: '큰 합창과 작은 합창 · PubMed (2016)', url: 'https://pubmed.ncbi.nlm.nih.gov/27158219/' },
    ],
  },
  {
    id: 'vocal-fry',
    title: '지글지글 낮은 소리,\n보컬 프라이',
    lead: '아주 낮게 ‘지글지글’ 끓는 듯한 소리,\n들어 본 적 있나요?',
    blocks: [
      { type: 'p', text: '보컬 프라이는 성대가 짧고 느슨해진 채로, 낼 수 있는 가장 낮은 진동으로 떨 때 나는 소리예요. 소리가 펄스처럼 툭툭 끊겨 나와서 지글지글하게 들려요.' },
      { type: 'p', text: '보컬 프라이가 해로운지는 아직 확실하지 않아요. 다만 건강한 10명이 30분 동안 일부러 보컬 프라이로 글을 읽은 작은 연구에서 목소리 지표 일부가 나빠졌어요. 목이 지칠 수 있으니 너무 많이 쓰지 말라고 권하는 병원도 있어요.' },
      { type: 'h', text: '그럼 왜 쓸까요?' },
      { type: 'p', text: '팝 같은 대중음악에서는 음을 시작하거나 끝낼 때 표현으로 보컬 프라이를 넣는 가수가 많아요. 말할 때는 특히 문장 끝에서 자주 나타나요. 왜 쓰는지는 여러 추측이 있지만, 아직 확실히 밝혀지지 않았어요.' },
    ],
    sources: [
      { label: '성대의 성구 · PMC (2025)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11966170/' },
      { label: '보컬 프라이 30분 실험 · PubMed (2018)', url: 'https://pubmed.ncbi.nlm.nih.gov/30178028/' },
      { label: '노래 속 보컬 프라이 · Acoustical Society of America (2016)', url: 'https://acoustics.org/2amu5-do-people-find-vocal-fry-in-popular-music-expressive-mackenzie-parrott/' },
      { label: '말할 때의 보컬 프라이 · PMC (2014)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4037169/' },
      { label: '목소리 관리 팁 · Mount Sinai', url: 'https://www.mountsinai.org/locations/grabscheid-voice-swallowing-center/our-services/professional-performance-voice-care/tips' },
    ],
  },
  {
    id: 'lip-trill',
    title: '입술을 부르르,\n립트릴',
    lead: '입술을 부르르 떨면서 소리 내는 연습,\n립트릴이에요.',
    tryIt: true,
    blocks: [
      { type: 'p', text: '립트릴은 입과 목을 편하게 풀어서 부드럽게 소리 내도록 도와요. 성대에 힘이 들어가는 걸 막고, 무리하지 않고 음역을 넓히는 데 쓴다고 해요.' },
      { type: 'h', text: '이렇게 해 보세요' },
      { type: 'p', text: '코로 들이쉬고 입으로 소리 없이 내쉬어요. 그다음 물속에서 거품을 불듯 입술을 떨며 내쉬어요. 처음엔 소리 없이, 편안한 만큼만 길게 10번 해요. 익숙해지면 편한 음 하나를 정해 그 음으로 떨어요.' },
      { type: 'hint', text: '입술을 오므리지 않아요. 숨이 차기 전에, 불편하거나 힘이 들어가면 멈춰요.' },
    ],
    sources: [
      { label: '립트릴 연습 · Cambridge University Hospitals', url: 'https://www.cuh.nhs.uk/patient-information/lip-trills-exercises/' },
      { label: '립트릴·빨대 발성 연구 · PubMed (2019)', url: 'https://pubmed.ncbi.nlm.nih.gov/30408272/' },
    ],
  },
  {
    id: 'vibrato',
    title: '음이 물결치는\n비브라토',
    lead: '길게 끄는 음에서 음이 규칙적으로\n살짝 오르내리는 것, 비브라토예요.',
    blocks: [
      { type: 'p', text: '비브라토는 음높이가 일정한 간격으로 물결치듯 오르내리는 거예요. 1초에 몇 번 물결치는지를 빠르기라고 하는데, 보통 1초에 4~7번쯤이라고 해요.' },
      { type: 'p', text: '빠르기는 장르에 따라 다르기도 해요. 한 연구에서는 록 가수의 비브라토가 오페라 가수보다 느렸어요. 얼마나 크게 오르내리는지(폭)는 나이에 따라 달라질 수 있다고 해요.' },
    ],
    sources: [
      { label: '비브라토의 빠르기 · Acoustical Society of America', url: 'https://acoustics.org/pressroom/httpdocs/165th/2aMU8_Pecoraro.html' },
    ],
  },
  {
    id: 'whisper',
    title: '목이 아플 땐\n속삭이는 게 나을까요?',
    lead: '의외로, 속삭임이 목에\n더 편한 건 아니에요.',
    blocks: [
      { type: 'p', text: '목을 아끼려고 속삭이는 경우가 많죠. 그런데 대부분의 사람은 목에 좋지 않은 방식으로 속삭인다고 해요. 속삭임이 오히려 성대에 무리를 줄 수 있다는 거예요.' },
      { type: 'p', text: '그래서 목소리를 쉬어야 할 때는 속삭임도 피하라고 권하는 병원이 있어요. 꼭 말해야 할 때는 필요한 만큼만, 작고 부드러운 목소리로 말해요.' },
    ],
    sources: [
      { label: '목 관리 Q&A · UT Southwestern Medical Center', url: 'https://utswmed.org/medblog/vocal-cords-care-qa/' },
      { label: '목소리 휴식 · Henry Ford Health', url: 'https://www.henryford.com/blog/2025/12/vocal-rest' },
    ],
  },
  {
    id: 'stutter',
    title: '노래할 때는\n말이 덜 막혀요',
    lead: '말을 더듬는 사람도 노래할 때는\n더듬음이 크게 줄거나 사라지기도 해요.',
    blocks: [
      { type: 'p', text: '왜 그런지는 아직 확실히 밝혀지지 않았어요. 전문가들이 꼽는 이유는 이래요.' },
      { type: 'point', title: '뇌가 다르게 일해요', text: '노래할 때와 말할 때 뇌가 다르게 작동한다는 근거가 있다고 해요.' },
      { type: 'point', title: '서두를 필요가 없어요', text: '노래에는 시간에 쫓기는 압박도, 대화의 부담도 없어요.' },
      { type: 'point', title: '가사를 이미 알아요', text: '노래는 보통 가사를 외워서 불러요. 할 말을 찾는 과정이 말더듬과 관련 있을 수 있다고 해요.' },
      { type: 'note', text: '다만 노래할 때의 유창함이 평소 말하기로 오래 이어지는 경우는 드물다고 해요.' },
    ],
    sources: [
      { label: '노래와 말더듬 · Stuttering Foundation', url: 'https://www.stutteringhelp.org/content/singing-and-stuttering' },
      { label: '노래와 말더듬, 알려진 것 · Stuttering Foundation', url: 'https://www.stutteringhelp.org/content/singing-and-stuttering-what-we-know-0' },
      { label: '노래하면 말더듬이 사라지는 이유 · NBC News', url: 'https://www.nbcnews.com/health/body-odd/why-idol-contestants-stutter-goes-away-when-he-sings-flna1c8086160' },
    ],
  },
  {
    id: 'vibration',
    title: '내 성대는\n1초에 몇 번 떨릴까요?',
    lead: '목소리의 높이는\n성대가 1초에 몇 번 떨리는지예요.',
    blocks: [
      { type: 'p', text: '말할 때 목소리의 기본 높이는 성대가 떨리는 빠르기와 같아요. 성인 남성은 평균 1초에 약 120번, 여성은 약 200번쯤 떨려요. 물론 사람마다 꽤 달라요.' },
      { type: 'p', text: '남녀의 차이는 주로 성대 길이 때문이에요. 성인이 되면 성대가 남성은 16mm, 여성은 10mm쯤까지 자라요.' },
      { type: 'hint', text: '기준음 2옥 라(A4)는 보통 440Hz로 맞춰요. 1초에 440번 떨리는 소리예요. 한 옥타브 올라가면 떨림이 두 배가 돼요.' },
    ],
    sources: [
      { label: '말할 때의 목소리 높이 · PMC (2012)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3281965/' },
      { label: '목소리 높이의 개인차 · PMC (2020)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7062086/' },
      { label: '음 이름과 주파수 · UNSW Physics', url: 'https://newt.phys.unsw.edu.au/jw/notes.html' },
    ],
  },
  {
    id: 'water',
    title: '노래 직전의 물 한 모금,\n성대에 닿을까요?',
    lead: '마신 물은 성대에\n직접 닿지 않아요.',
    blocks: [
      { type: 'p', text: '물을 마시면 성대를 바로 적시는 게 아니라 몸 전체에 수분을 채워요. 몸 전체의 수분에는 성대 조직 속 수분도 포함돼요. 그래서 하루 동안 물을 충분히 마시라고 권하는 병원이 있어요.' },
      { type: 'p', text: '카페인 음료나 술을 마셨다면 그만큼 물을 더 마시라고 권하는 병원도 있어요.' },
      { type: 'note', text: '수분이 목소리에 좋다는 권고는 많지만, 그 효과를 뒷받침하는 연구는 아직 충분하지 않다고 해요.' },
    ],
    sources: [
      { label: '목 관리 Q&A · UT Southwestern Medical Center', url: 'https://utswmed.org/medblog/vocal-cords-care-qa/' },
      { label: '성대와 수분 · PMC (2010)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2925668/' },
    ],
  },
  {
    id: 'perfect-pitch',
    title: '절대음감은\n얼마나 드물까요?',
    lead: '기준음 없이 음 이름을 바로 맞히거나\n그 음을 내는 능력, 절대음감이에요.',
    blocks: [
      { type: 'p', text: '절대음감은 아주 드물어요. 미국과 유럽에서는 1만 명 중 1명이 안 된다는 추정이 있어요. 다만 1만 명 중 1~7명이라는 추정도 있고, 음악 학교 학생처럼 특정 집단에서는 훨씬 높게 나오기도 해서, 조사 대상과 방법에 따라 숫자가 꽤 달라요.' },
      { type: 'p', text: '음악을 배우는 사람들 가운데서는, 음악을 일찍 시작했을수록, 그리고 중국어처럼 음의 높낮이로 뜻이 달라지는 언어를 쓰는 사람일수록 더 많이 나타났다는 연구가 있어요.' },
      { type: 'p', text: '음과 음 사이의 거리(음정)를 듣는 귀는 어떨까요? 음정 듣기 훈련으로 연습하지 않은 과제까지 나아졌다는 연구가 있지만, 효과가 작거나 없었다는 연구도 있어요.' },
    ],
    sources: [
      { label: '절대음감과 언어 · Acoustical Society of America (2004)', url: 'https://acoustics.org/pressroom/httpdocs/148th/deutsch.html' },
      { label: '절대음감의 비율 · Frontiers in Neuroscience (2016)', url: 'https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2016.00447/full' },
      { label: '음정 훈련 · PMC (2022)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9363605/' },
    ],
  },
  {
    id: 'lullaby',
    title: '처음 듣는 나라의 자장가도\n알아들을 수 있을까요?',
    lead: '어느 정도는 그렇다는\n연구가 있어요.',
    blocks: [
      { type: 'p', text: '2018년 하버드 연구에서 세계 여러 문화의 노래를 14초씩 들려주자, 사람들은 처음 듣는 문화의 노래인데도 자장가인지, 춤추는 노래인지, 치유의 노래인지를 꽤 잘 맞혔어요. 자장가는 춤곡보다 느리고 멜로디가 단순한 경향이 있었어요.' },
      { type: 'p', text: '2019년 연구에서는 조사한 모든 사회에서 음악이 발견됐어요. 2020년 연구에서는 미국 아기들이 처음 듣는 외국어 자장가에도 심장 박동이 느려지며 편안해졌어요.' },
    ],
    sources: [
      { label: '노래의 쓰임을 알아듣는 사람들 · Harvard Gazette (2018)', url: 'https://news.harvard.edu/gazette/story/2018/01/music-may-transcend-cultural-boundaries-to-become-universally-human' },
      { label: '모든 사회의 음악 · EurekAlert! (2019)', url: 'https://www.eurekalert.org/news-releases/692303' },
      { label: '아기와 외국어 자장가 · Harvard Gazette (2020)', url: 'https://news.harvard.edu/gazette/story/2020/10/research-shows-lullabies-in-any-language-relax-babies' },
    ],
  },
];

/** Which column is today's: 0 on the first day (or with no start yet), then one more each day. */
export function columnIndexFor(startDay, today, count = COLUMNS.length) {
  const days = daysSince(startDay, today);
  return days > 0 ? days % count : 0;
}

/** The columns already shown before today, newest first (each at most once). */
export function pastColumns(startDay, today, columns = COLUMNS) {
  const index = columnIndexFor(startDay, today, columns.length);
  const shown = Math.min(Math.max(0, daysSince(startDay, today)), columns.length - 1);
  return Array.from({ length: shown }, (_, k) => columns[(index - k - 1 + columns.length) % columns.length]);
}
