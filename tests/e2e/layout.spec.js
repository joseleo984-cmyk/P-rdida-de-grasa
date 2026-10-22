// Regresión de maquetación: la barra de pestañas nunca se ensancha ni queda tapada, aunque la fuente sea
// más ancha que la local (las del runner de GitHub lo son). Caso real: con 6 pestañas «Perfil» se salía de la pantalla
// y un <select name="rate"> interceptaba el clic (s3-4.spec.js).
const { test, expect, state } = require('./helpers');

const WIDE = '*{font-family:"DejaVu Sans",Verdana,sans-serif !important; letter-spacing:.02em}';

// Revisa la barra con la pantalla desplazada al final: sin desborde horizontal, todos los botones dentro de la pantalla,
// cada botón recibe su toque (elementFromPoint en su centro y, el central, también en lo que sobresale de la barra),
// y el final del contenido queda por encima de la barra Y del botón central.
async function checkBar(page, where, expectedIds) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const W = page.viewportSize().width, H = page.viewportSize().height; // el viewport real, no el «layout» que un desborde ensancha
  const r = await page.evaluate(([W, H]) => {
    const bar = document.querySelector('.tabbar');
    const btns = [...bar.querySelectorAll('button')].filter((b) => b.offsetParent !== null);
    const out = { overflowX: document.documentElement.scrollWidth > W, barInside: bar.getBoundingClientRect().right <= W + 0.5 && bar.getBoundingClientRect().bottom <= H + 0.5, bad: [], ids: btns.map((b) => b.id), small: [], lastGap: 0, discGap: 99 };
    for (const b of btns) {
      const q = b.getBoundingClientRect();
      const hit = (x, y) => { const el = document.elementFromPoint(x, y); return el && b.contains(el); };
      if (!hit(q.x + q.width / 2, q.y + q.height / 2)) out.bad.push(b.id + ' (centro)');
      const disc = b.querySelector('.tab-disc');
      if (disc) {
        const d = disc.getBoundingClientRect();
        if (!hit(d.x + d.width / 2, d.y + 4)) out.bad.push(b.id + ' (parte que sobresale)');
        if (d.top < 0 || d.left < -0.5 || d.right > W + 0.5) out.bad.push(b.id + ' disco fuera de pantalla');
        out.discGap = d.top - document.querySelector('main').getBoundingClientRect().bottom;
      }
      if (q.left < -0.5 || q.right > W + 0.5) out.bad.push(b.id + ' fuera de pantalla');
      if (q.width < 44 || q.height < 44) out.small.push(b.id + ' ' + Math.round(q.width) + 'x' + Math.round(q.height));
      const label = b.querySelector('.tb-label');
      if (parseFloat(getComputedStyle(label).fontSize) < 12) out.small.push(b.id + ' etiqueta < 12 px');
      if (label.scrollWidth > label.clientWidth + 0.5) out.bad.push(b.id + ' etiqueta cortada');
    }
    out.lastGap = bar.getBoundingClientRect().top - document.querySelector('main').getBoundingClientRect().bottom;
    return out;
  }, [W, H]);
  expect(r.overflowX, `scroll horizontal en ${where}`).toBe(false);
  expect(r.barInside, `barra dentro de la pantalla en ${where}`).toBe(true);
  expect(r.ids, `botones de la barra en ${where}`).toEqual(expectedIds);
  expect(r.bad, `toques en la barra en ${where}`).toEqual([]);
  expect(r.small, `tamaños mínimos en ${where}`).toEqual([]);
  expect(r.lastGap, `contenido tapado por la barra en ${where}`).toBeGreaterThanOrEqual(-1);
  expect(r.discGap, `contenido tapado por el botón central en ${where}`).toBeGreaterThanOrEqual(0);
}

test('barra de 5 posiciones (cliente, fuente ancha): cabe, recibe los toques y no tapa el contenido en cada vista', async ({ app, page }) => {
  await app.open({ state: state() });
  await page.addStyleTag({ content: WIDE });
  const ids = ['tab-panel', 'tab-comidas', 'tab-registrar', 'tab-registro', 'tab-mas'];
  for (const v of ['panel', 'comidas', 'registro', 'mas']) {
    await page.locator(`#tab-${v}`).click();
    await expect(page.locator(`#view-${v}`)).toBeVisible();
    await expect(page.locator(`#tab-${v}`)).toHaveAttribute('aria-current', 'page');
    await checkBar(page, v, ids);
  }
  for (const [v, mode] of [['fotos'], ['perfil', 'all'], ['perfil', 'datos'], ['ayuda']]) {
    await page.evaluate(([v, m]) => PGNav.show(v, m), [v, mode]);
    await expect(page.locator(`#view-${v}`)).toBeVisible();
    await expect(page.locator('#tab-mas')).toHaveAttribute('aria-current', 'page');
    await checkBar(page, v + (mode ? ':' + mode : ''), ids);
  }
});

test('barra del coach (3 posiciones, fuente ancha): Clientes | Invitar | Más caben y reciben los toques', async ({ app, page }) => {
  await app.open({ state: state() });
  await page.addStyleTag({ content: WIDE });
  await page.evaluate(() => PGNav.applyNav(true));
  const ids = ['tab-coach', 'tab-invitar', 'tab-mas'];
  for (const v of ['coach', 'mas']) {
    await page.evaluate((v) => PGNav.show(v), v);
    await checkBar(page, 'coach/' + v, ids);
  }
  await page.evaluate(() => PGNav.show('invitar'));
  await checkBar(page, 'coach/invitar', ids);
  await page.evaluate(() => PGNav.applyNav(false));
  await checkBar(page, 'vuelve a cliente', ['tab-panel', 'tab-comidas', 'tab-registrar', 'tab-registro', 'tab-mas']);
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
    document.querySelector('#acc-share-title').textContent = `Te vas a conectar con «${t}».`;
  }, long);
  expect(await app.scrollWidth(), 'scroll horizontal en la cuenta').toBeLessThanOrEqual(390);
  await page.evaluate(() => { document.querySelector('#account').classList.add('hidden'); document.body.classList.remove('account-open'); });
  const r = await page.evaluate(() => { const q = document.querySelector('#tab-mas').getBoundingClientRect(); return [q.right, window.innerWidth]; });
  expect(r[1]).toBeLessThanOrEqual(390);
  expect(r[0]).toBeLessThanOrEqual(390.5);
});
