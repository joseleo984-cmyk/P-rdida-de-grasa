// PWA: el service worker cachea los assets (incluido schema.js) y la app abre sin conexión.
const { test, expect, state } = require('./helpers');

test.use({ serviceWorkers: 'allow' });

test('tras la primera visita, la app carga sin conexión con sus datos', async ({ app, page, context }) => {
  await app.open({ state: state(), time: null });
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys.find((k) => k.startsWith('perdida-grasa-')));
    return { name: keys, urls: (await c.keys()).map((r) => new URL(r.url).pathname) };
  });
  expect(cached.urls).toEqual(expect.arrayContaining(['/index.html', '/app.js', '/schema.js', '/calc.js', '/photos.js', '/styles.css']));
  await context.setOffline(true);
  await app.reload();
  await expect(page.locator('#st-weight')).toContainText('70');
  expect(await page.evaluate(() => typeof Schema.normalize)).toBe('function');
  await context.setOffline(false);
});
