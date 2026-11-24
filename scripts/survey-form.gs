// Google Apps Script: makes the "SING 써 본 느낌" survey described in docs/deploy.md section 3,
// then logs the links. Paste into a new project at script.google.com and run makeSurvey.
// It only creates a form in your own Google Drive; it reads nothing else.
function makeSurvey() {
  const form = FormApp.create('SING 써 본 느낌');
  form.setDescription('SING을 써 봐 줘서 고마워요! 1~2분이면 끝나요. 1 = 전혀 아니에요, 5 = 매우 그래요.');
  form.setCollectEmail(false);
  try { form.setRequireLogin(false); } catch (e) { /* only for school or work accounts */ }

  const usage = form.addTextItem().setTitle('사용 기록 (자동으로 채워져요)');

  const scale = (title, required) => form.addScaleItem()
    .setTitle(title).setBounds(1, 5).setLabels('전혀 아니에요', '매우 그래요').setRequired(required);

  form.addSectionHeaderItem().setTitle('전체 느낌');
  ['전체적으로 만족해요', '처음 써도 쓰는 법을 알기 쉬웠어요', '멈춤 없이 잘 움직였어요',
    '노래 연습에 도움이 될 것 같아요', '또 써 보고 싶어요', '친구에게 추천하고 싶어요']
    .forEach(title => scale(title, true));

  form.addSectionHeaderItem().setTitle('써 본 기능만 답해 주세요')
    .setHelpText('안 써 본 기능은 비워 두세요. 도움이 됐으면 5, 아니면 1.');
  ['허밍 연습', '내 음역 찾기', '노래방 키 추천', 'AI 곡 추천', '노래 화면(가사·구간·영상)',
    '따라 부르기 리포트', '노래방 녹음 분석']
    .forEach(title => scale(title, false));

  form.addParagraphTextItem().setTitle('불편했던 점이나 바라는 점');

  try { form.setPublished(true); } catch (e) { /* older forms are published already */ }
  form.setAcceptingResponses(true);

  const prefilled = form.createResponse().withItemResponse(usage.createResponse('__USAGE__')).toPrefilledUrl();
  Logger.log('FEEDBACK_FORM_URL에 넣을 링크:\n' + prefilled);
  Logger.log('설문 고치는 화면:\n' + form.getEditUrl());
}
