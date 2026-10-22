const test = require('node:test');
const assert = require('node:assert');
const G = require('../install-guide.js');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const FIREFOX_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0';

test('se muestra en Safari de iPhone y de iPad (también en modo escritorio) sin instalar ni descartar', () => {
  assert.equal(G.debeMostrarGuiaInstalacion({ ua: IPHONE, standalone: false, descartada: false }), true);
  assert.equal(G.debeMostrarGuiaInstalacion({ ua: IPAD_DESKTOP, standalone: false, descartada: false, maxTouchPoints: 5 }), true);
});
test('no se muestra en un Mac, otros navegadores de iPhone, Android ni escritorio', () => {
  assert.equal(G.debeMostrarGuiaInstalacion({ ua: IPAD_DESKTOP, standalone: false, descartada: false, maxTouchPoints: 0 }), false);
  for (const ua of [CHROME_IOS, FIREFOX_IOS, ANDROID, DESKTOP_CHROME, INSTAGRAM, '', undefined]) assert.equal(G.debeMostrarGuiaInstalacion({ ua, standalone: false, descartada: false }), false, String(ua));
});
test('no se muestra si la app ya está instalada o ya se descartó', () => {
  assert.equal(G.debeMostrarGuiaInstalacion({ ua: IPHONE, standalone: true, descartada: false }), false);
  assert.equal(G.debeMostrarGuiaInstalacion({ ua: IPHONE, standalone: false, descartada: true }), false);
  assert.equal(G.debeMostrarGuiaInstalacion(), false);
});
