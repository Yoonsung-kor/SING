import assert from 'node:assert/strict';
import test from 'node:test';
import { inAppBrowser, platform, isStandalone, externalUrl } from '../src/environment.js';
import { renderView } from '../src/views.js';
import { defaultState } from '../src/storage.js';

const UA = {
  kakaoAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-F956N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.107 Mobile Safari/537.36;KAKAOTALK 10.4.5',
  kakaoIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-F956N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-F956N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 341.0.0.21.97 (iPhone14,5; iOS 17_5; ko_KR; ko; scale=3.00; 1170x2532; 624318227)',
  naver: 'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.10.3)',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
};

test('in-app browsers are recognised', () => {
  assert.equal(inAppBrowser(UA.kakaoAndroid), 'kakaotalk');
  assert.equal(inAppBrowser(UA.kakaoIphone), 'kakaotalk');
  assert.equal(inAppBrowser(UA.instagram), 'other');
  assert.equal(inAppBrowser(UA.naver), 'other');
  for (const name of ['chromeAndroid', 'safariIphone', 'samsung', 'mac']) assert.equal(inAppBrowser(UA[name]), null, name);
  assert.equal(inAppBrowser(undefined), null);
});

test('the platform is told apart, an iPad that calls itself a Mac included', () => {
  assert.equal(platform(UA.chromeAndroid), 'android');
  assert.equal(platform(UA.safariIphone), 'ios');
  assert.equal(platform(UA.mac, { maxTouchPoints: 5 }), 'ios');
  assert.equal(platform(UA.mac, { maxTouchPoints: 0 }), 'desktop');
});

test('a home-screen launch is recognised', () => {
  assert.equal(isStandalone({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(isStandalone({ matchMedia: () => ({ matches: false }), standalone: true }), true);
  assert.equal(isStandalone({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(isStandalone({}), false);
});

test('KakaoTalk is asked to open the whole address, invite included, in the default browser', () => {
  const link = externalUrl('kakaotalk', 'https://x.app/#invite=abc12345');
  assert.ok(link.startsWith('kakaotalk://web/openExternal?url='));
  assert.equal(decodeURIComponent(link.split('url=')[1]), 'https://x.app/#invite=abc12345');
  assert.equal(link.split('url=')[1], encodeURIComponent('https://x.app/#invite=abc12345'));
  assert.equal(externalUrl('other', 'https://x.app/'), null);
});

test('the open-outside screen explains and offers the way out', () => {
  const view = outsideUrl => renderView({ page: 'open-outside', outsideUrl, state: defaultState(), session: null, busy: false, demo: false });
  const kakao = view('kakaotalk://web/openExternal?url=x');
  assert.match(kakao, /다른 브라우저에서 열어 주세요/);
  assert.match(kakao, /카카오톡 같은 앱 안에서는 마이크와 저장이 잘 안 될 수 있어요\./);
  assert.match(kakao, /안 열리면 화면 구석의 ⋮\(또는 공유\) 버튼에서 ‘다른 브라우저로 열기’를 눌러 주세요\./);
  assert.match(kakao, /data-action="open-outside"[^>]*>기본 브라우저로 열기</);
  assert.match(kakao, /data-action="stay-inside"[^>]*>그냥 여기서 쓸게요</);
  assert.doesNotMatch(kakao, /class="navigation"/);
  const other = view(null);
  assert.doesNotMatch(other, /기본 브라우저로 열기/);
  assert.match(other, /그냥 여기서 쓸게요/);
});
