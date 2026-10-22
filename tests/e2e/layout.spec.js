// Regresión de maquetación: la barra de pestañas nunca se ensancha ni queda tapada, aunque la fuente sea
// más ancha que la local (las del runner de GitHub lo son). Caso real: con 6 pestañas «Perfil» se salía de la pantalla
// y un <select name="rate"> interceptaba el clic (s3-4.spec.js).
const { test, expect, state } = require('./helpers');

const WIDE = '*{font-family:"DejaVu Sans",Verdana,sans-serif !important; letter-spacing:.02em}';

test('la barra de pestañas (6 pestañas, fuente ancha) cabe y recibe los toques con el scroll abajo en cada vista', async ({ app, page }) => {
  await app.open({ state: state() });
  await page.addStyleTag({ content: WIDE });
  await page.evaluate(() => document.querySelector('#tab-coach').classList.remove('hidden'));
  for (const v of ['panel', 'registro', 'comidas', 'fotos', 'perfil']) {
    await page.locator(`#tab-${v}`).click();
    await expect(page.locator(`#view-${v}`)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const W = page.viewportSize().width, H = page.viewportSize().height; // el viewport real, no el «layout» que un desborde ensancha
    const r = await page.evaluate(([W, H]) => {
      const bar = document.querySelector('.tabbar');
      const out = { overflowX: document.documentElement.scrollWidth > W, barInside: bar.getBoundingClientRect().right <= W + 0.5 && bar.getBoundingClientRect().bottom <= H + 0.5, bad: [], lastGap: 0 };
      for (const b of bar.querySelectorAll('button')) {
        const q = b.getBoundingClientRect();
        const el = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
        if (!el || !bar.contains(el)) out.bad.push(b.id + ' <- ' + (el && el.tagName + '[name=' + (el.name || '') + ']'));
        if (q.left < -0.5 || q.right > W + 0.5) out.bad.push(b.id + ' fuera de pantalla');
      }
      // el final del contenido debe quedar por encima de la barra
      const main = document.querySelector('main').getBoundingClientRect();
      out.lastGap = bar.getBoundingClientRect().top - main.bottom;
      return out;
    }, [W, H]);
    expect(r.overflowX, `scroll horizontal en ${v}`).toBe(false);
    expect(r.barInside, `barra dentro de la pantalla en ${v}`).toBe(true);
    expect(r.bad, `toques en la barra en ${v}`).toEqual([]);
    expect(r.lastGap, `contenido tapado por la barra en ${v}`).toBeGreaterThanOrEqual(-1);
  }
});

test('un nombre largo sin espacios en la pantalla de cuenta no ensancha la página ni deja la barra fuera de pantalla', async ({ app, page }) => {
  await app.open({ state: state() });
  await page.addStyleTag({ content: WIDE });
  const long = 'Gimnasio<script>window.__xss=1</script>' + 'Superlargo'.repeat(6);
  // Vista de la cuenta con el paso «vincular»: se muestra a mano porque aquí solo importa la maquetación.
  await page.evaluate((t) => {
    const acc = document.querySelector('#account');
    acc.classList.remove('hidden');
    document.body.classList.add('account-open');
    for (let n = document.querySelector('#acc-share'); n && n !== acc; n = n.parentElement) n.classList.remove('hidden');
    document.querySelector('#acc-share-title').textContent = `Te vas a vincular con «${t}».`;
  }, long);
  expect(await app.scrollWidth(), 'scroll horizontal en la cuenta').toBeLessThanOrEqual(390);
  await page.evaluate(() => { document.querySelector('#account').classList.add('hidden'); document.body.classList.remove('account-open'); });
  const r = await page.evaluate(() => { const q = document.querySelector('#tab-perfil').getBoundingClientRect(); return [q.right, window.innerWidth]; });
  expect(r[1]).toBeLessThanOrEqual(390);
  expect(r[0]).toBeLessThanOrEqual(390.5);
});
