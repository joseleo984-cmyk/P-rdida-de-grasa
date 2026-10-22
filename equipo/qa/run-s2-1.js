// E2E de S2-1 / LEGAL-01 (aceptar T&C y Política, autorizaciones aparte, Privacidad). Uso: node equipo/qa/run-s2-1.js
// Sin legal-helper: aquí se prueba la pantalla de consentimiento de verdad. 390x844 móvil, Bogotá.
// La parte "sin conexión" levanta un servidor http local (el service worker no funciona en file://).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const URL = 'file://' + ROOT + '/index.html';
const SHOTS = path.join(ROOT, 'equipo/qa-capturas/');
const Schema = require(path.join(ROOT, 'schema.js'));
let fails = 0;
const log = (n, ok, d = '') => { if (!ok) fails++; console.log((ok ? 'OK   ' : 'FALLO') + ' ' + n + (d ? ' :: ' + String(d).slice(0, 220) : '')); };
const KEY = 'perdida-grasa:v1';
const BOXES = ['terms', 'privacy', 'sensitiveHealth', 'photos', 'adult'];
const box = (page, k) => page.locator(`#form-consent [name=${k}]`);

async function setup(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: 'America/Bogota', acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const dialogs = [];
  page.answer = true;
  page.on('dialog', (d) => { dialogs.push(d.message()); page.answer ? d.accept() : d.dismiss(); });
  return { ctx, page, errors, dialogs };
}
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const visible = (page, sel) => page.locator(sel).first().isVisible();
async function accept(page, marks) {
  for (const k of marks) await box(page, k).check();
  await page.locator('#btn-consent').click();
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // ===== 1. Primer uso =====
  {
    const { page, errors, dialogs, ctx } = await setup(browser);
    await page.goto(URL);
    log('Primer uso: pantalla de consentimiento visible', await visible(page, '#consent'));
    log('…y nada más: ni vistas ni barra de pestañas', !(await visible(page, 'main')) && !(await visible(page, '.tabbar')));
    log('Foco en el título de la pantalla', (await page.evaluate(() => document.activeElement.id)) === 'consent-title');
    const states = await Promise.all(BOXES.map((k) => box(page, k).isChecked()));
    log('5 casillas separadas y SIN marcar', states.length === 5 && states.every((c) => c === false));
    const labels = await Promise.all(BOXES.map((k) => box(page, k).evaluate((el) => el.closest('label').textContent.replace(/\s+/g, ' ').trim())));
    log('Cada casilla con su etiqueta', labels.every((l) => l.length > 10), labels.join(' | '));
    log('Continuar deshabilitado al inicio', await page.locator('#btn-consent').isDisabled());
    await box(page, 'terms').check(); await box(page, 'privacy').check(); await box(page, 'sensitiveHealth').check(); await box(page, 'photos').check();
    log('Sin "mayor de 18" sigue deshabilitado', await page.locator('#btn-consent').isDisabled());
    await box(page, 'adult').check();
    log('Con las obligatorias se habilita', await page.locator('#btn-consent').isEnabled());
    await box(page, 'privacy').uncheck();
    log('Desmarcar una obligatoria lo deshabilita', await page.locator('#btn-consent').isDisabled());
    await box(page, 'privacy').check();
    for (const k of ['sensitiveHealth', 'photos']) await box(page, k).uncheck();
    log('Facultativas sin marcar: se puede continuar', await page.locator('#btn-consent').isEnabled());
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    log('Sin scroll horizontal a 390 px', sw <= 390, 'scrollWidth=' + sw);
    // Foco visible con teclado en una casilla
    await page.keyboard.press('Tab');
    await box(page, 'terms').focus();
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    const fv = await page.evaluate(() => ({ fv: document.activeElement.matches(':focus-visible'), o: getComputedStyle(document.activeElement).outlineStyle }));
    log('Foco visible en las casillas', fv.fv && fv.o !== 'none', JSON.stringify(fv));
    await page.screenshot({ path: SHOTS + 's2-1-consentimiento.png', fullPage: true });

    // Textos legales dentro de la app, sin perder lo marcado
    await page.locator('#consent a[href="legal/terminos.html"]').click();
    await page.waitForTimeout(300);
    log('Leer los Términos abre el visor dentro de la app', await visible(page, '#legal-dialog'));
    const frame = page.frameLocator('#legal-frame');
    const draft = await frame.locator('.draft').innerText().catch(() => '');
    log('Aviso visible "Borrador pendiente de revisión legal"', /Borrador pendiente de revisión legal/.test(draft), draft);
    log('El texto es el de los Términos', /Términos y Condiciones/.test(await frame.locator('h1').innerText()));
    log('Foco en Cerrar al abrir el visor', (await page.evaluate(() => document.activeElement.id)) === 'legal-close');
    await page.screenshot({ path: SHOTS + 's2-1-texto-legal.png' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    log('Escape cierra el visor y el foco vuelve al enlace', !(await visible(page, '#legal-dialog')) && (await page.evaluate(() => document.activeElement.getAttribute('href'))) === 'legal/terminos.html');
    const kept = await Promise.all(BOXES.map((k) => box(page, k).isChecked()));
    log('Lo marcado se conserva tras leer', kept.join() === 'true,true,false,false,true', kept.join());
    await page.locator('#consent a[href="legal/privacidad.html"]').first().click();
    log('La Política también se abre y avisa de borrador', /Política de Tratamiento/.test(await page.frameLocator('#legal-frame').locator('h1').innerText()) && /Borrador pendiente/.test(await page.frameLocator('#legal-frame').locator('body').innerText()));
    await page.locator('#legal-close').click();

    // Aceptar (sin datos de salud ni fotos)
    await page.locator('#btn-consent').click();
    const s = await stored(page);
    const c = s && s.consent;
    log('Se guarda consent con versiones, casillas y fechas', c && c.termsVersion === Schema.LEGAL_VERSIONS.terms && c.privacyVersion === Schema.LEGAL_VERSIONS.privacy &&
      c.adult === true && c.sensitiveHealth === false && c.photos === false && !Number.isNaN(Date.parse(c.acceptedAt)) && c.updatedAt === c.acceptedAt && s.schemaVersion === Schema.CURRENT_VERSION, JSON.stringify(c));
    log('Tras aceptar se ve la app (Perfil, sin perfil aún)', !(await visible(page, '#consent')) && await visible(page, '#view-perfil.active') && await visible(page, '.tabbar'));
    log('Sin datos de salud: formulario de perfil oculto, Privacidad y Datos visibles', !(await visible(page, '#form-profile')) && await visible(page, '#privacy-card') && await visible(page, '#btn-export'));
    await page.click('#tab-registro');
    log('Registro bloqueado con explicación y salida (exportar/borrar)', await visible(page, '#view-registro .health-gate') && !(await visible(page, '#form-entry')) &&
      await visible(page, '#view-registro [data-gate-action=export]') && await visible(page, '#view-registro [data-gate-action=reset]'));
    const blocked = await page.evaluate(() => { const f = document.querySelector('#form-entry'); f.elements.date.value = '2026-10-20'; f.elements.weight.value = '70'; f.requestSubmit(); return JSON.parse(localStorage.getItem('perdida-grasa:v1')).entries.length; });
    log('Un envío forzado del formulario no guarda datos de salud', blocked === 0);
    await page.click('#tab-panel');
    await page.screenshot({ path: SHOTS + 's2-1-sin-salud.png' });

    // Autorizar salud desde el bloqueo
    await page.locator('#view-panel [data-consent-grant=sensitiveHealth]').click();
    log('Autorizar datos de salud pide confirmación explícita', /Autorizo de forma expresa/.test(dialogs[dialogs.length - 1] || ''));
    log('…y desbloquea el seguimiento', !(await visible(page, '#view-panel .health-gate')) && await visible(page, '#panel-summary'));
    const c2 = (await stored(page)).consent;
    log('sensitiveHealth = true con su fecha', c2.sensitiveHealth === true && c2.sensitiveHealthAt >= c.acceptedAt && c2.acceptedAt === c.acceptedAt);

    // Fotos: bloqueadas → autorizar → retirar
    await page.evaluate(() => (window.PGNav ? PGNav.show('fotos') : document.querySelector('#tab-fotos').click()));
    log('Fotos sin autorizar: pestaña bloqueada con botón para autorizar', await visible(page, '#view-fotos .photos-gate') && !(await visible(page, '#form-photo')));
    // (requestSubmit no sirve: el campo de archivo es obligatorio y la validación nativa lo frena antes)
    const pBlocked = await page.evaluate(() => { document.querySelector('#form-photo').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return document.querySelector('#toast').textContent; });
    log('Un envío forzado de foto se bloquea', /Autoriza tus fotos/.test(pBlocked), pBlocked);
    await page.locator('#view-fotos [data-consent-grant=photos]').click();
    log('Autorizar fotos desbloquea la pestaña', !(await visible(page, '#view-fotos .photos-gate')) && await visible(page, '#form-photo') && (await stored(page)).consent.photos === true);

    // Perfil → Privacidad
    await page.evaluate(() => (window.PGNav ? PGNav.show('perfil', 'all') : document.querySelector('#tab-perfil').click()));
    const priv = await page.locator('#privacy-list').innerText();
    log('Privacidad muestra lo aceptado (versiones, salud, fotos)', priv.includes('Versión ' + Schema.LEGAL_VERSIONS.terms) && /Datos de salud\s+Autorizado/.test(priv) && /Fotos\s+Autorizado/.test(priv), priv.replace(/\n/g, ' / '));
    await page.locator('#privacy-card').scrollIntoViewIfNeeded();
    await page.screenshot({ path: SHOTS + 's2-1-privacidad.png' });
    await page.locator('#btn-toggle-photos').click();
    log('Retirar fotos: bloqueada otra vez', (await stored(page)).consent.photos === false && (await page.locator('#btn-toggle-photos').innerText()) === 'Autorizar fotos');
    await page.locator('#btn-toggle-health').click();
    log('Retirar datos de salud explica la consecuencia y ofrece exportar/borrar', /no podrás usar el seguimiento/.test(dialogs[dialogs.length - 1]) && /exportar/.test(dialogs[dialogs.length - 1]) && (await stored(page)).consent.sensitiveHealth === false);
    log('Sin errores ni avisos de consola (primer uso)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ===== 2. Usuario existente (datos v2 sin consentimiento), exportar e importar =====
  {
    const { page, errors, ctx } = await setup(browser);
    await page.goto(URL);
    const v2 = { schemaVersion: 2, profile: { name: 'Ana', sex: 'female', age: 35, height: 165, startWeight: 70, goalWeight: 62, startDate: '2026-10-01', activity: 1.375, rate: 0.005 },
      entries: [{ id: 'e1', date: '2026-10-01', weight: 70 }, { id: 'e2', date: '2026-10-10', weight: 69 }], foods: {}, habits: {}, library: {} };
    await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, v2]);
    await page.reload();
    log('Usuario con datos v2: se le pide aceptar', await visible(page, '#consent'));
    log('…y sus datos no se borran', (await stored(page)).entries.length === 2);
    await accept(page, ['terms', 'privacy', 'sensitiveHealth', 'adult']);
    await page.click('#tab-registro');
    log('Tras aceptar ve sus 2 registros', (await page.locator('#entries-table tbody tr').count()) === 2);
    const mine = (await stored(page)).consent;

    await page.evaluate(() => (window.PGNav ? PGNav.show('perfil', 'all') : document.querySelector('#tab-perfil').click()));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
    const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    await page.locator('#btn-backup-no').click();
    log('Exportar JSON incluye el registro de consentimiento', JSON.stringify(backup.consent) === JSON.stringify(mine));

    // Respaldo de OTRA persona con su propio consentimiento: no se adopta
    const other = { ...backup, entries: [{ id: 'x1', date: '2026-10-15', weight: 90 }],
      consent: { ...mine, photos: true, sensitiveHealth: true, acceptedAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' } };
    delete other.photos;
    const file = path.join(require('os').tmpdir(), 'pg-s2-1-otro.json');
    fs.writeFileSync(file, JSON.stringify(other));
    await page.setInputFiles('#file-import', file);
    await page.waitForTimeout(300);
    const after = await stored(page);
    log('Importar un respaldo NO importa el consentimiento de otra persona', after.entries.length === 1 && JSON.stringify(after.consent) === JSON.stringify(mine), JSON.stringify(after.consent));
    // Respaldo viejo (v1, sin consent) sigue importando y conserva el consentimiento actual
    const v1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/backup-v1.json'), 'utf8'));
    fs.writeFileSync(file, JSON.stringify(v1));
    await page.setInputFiles('#file-import', file);
    await page.waitForTimeout(500);
    const after2 = await stored(page);
    log('Respaldo v1 importa y conserva el consentimiento actual', after2.entries.length === v1.entries.length && JSON.stringify(after2.consent) === JSON.stringify(mine));

    // Re-aceptación por cambio de versión
    await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.consent.termsVersion = '0.0'; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await page.reload();
    const upd = await page.locator('#consent-update').innerText().catch(() => '');
    log('Cambio de versión: se vuelve a pedir con aviso "Actualizamos…"', await visible(page, '#consent') && /Actualizamos/.test(upd) && upd.includes('0.0') && upd.includes(Schema.LEGAL_VERSIONS.terms), upd);
    log('Re-aceptación: todas sin marcar y nota de lo autorizado antes (salud)', (await Promise.all(BOXES.map((k) => box(page, k).isChecked()))).every((x) => !x) && await visible(page, '#prev-sensitiveHealth') && /Antes autorizaste: datos de salud/.test(await page.locator('#consent-update').innerText()));
    await page.screenshot({ path: SHOTS + 's2-1-reaceptar.png' });
    await accept(page, ['terms', 'privacy', 'sensitiveHealth', 'adult']);
    log('Tras re-aceptar: versión vigente y datos intactos', (await stored(page)).consent.termsVersion === Schema.LEGAL_VERSIONS.terms && (await stored(page)).entries.length === v1.entries.length);

    // Retirar T&C/Política → Borrar todo con confirmación → vuelve la pantalla
    await page.evaluate(() => (window.PGNav ? PGNav.show('perfil', 'all') : document.querySelector('#tab-perfil').click()));
    page.answer = false;
    await page.locator('#btn-withdraw-legal').click();
    log('Retirar T&C: si se cancela no se borra nada', (await stored(page)) !== null && !(await visible(page, '#consent')));
    page.answer = true;
    await page.locator('#btn-withdraw-legal').click();
    await page.waitForTimeout(300);
    log('Retirar T&C: borra todo y vuelve a pedir la aceptación', (await stored(page)) === null && await visible(page, '#consent'));
    log('Sin errores ni avisos de consola (usuario existente)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ===== 3. Sin conexión: los textos legales están en la caché del service worker =====
  {
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
    const server = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}/`;
    const { page, ctx } = await setup(browser);
    await page.goto(base + 'index.html');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(500);
    await ctx.setOffline(true);
    await page.reload();
    log('Sin conexión: la app abre con la pantalla legal', await visible(page, '#consent'));
    await page.locator('#consent a[href="legal/privacidad.html"]').first().click();
    await page.waitForTimeout(300);
    const txt = await page.frameLocator('#legal-frame').locator('h1').innerText().catch(() => '');
    log('Sin conexión: la Política se lee dentro de la app', /Política de Tratamiento/.test(txt), txt);
    await ctx.close();
    server.close();
  }

  await browser.close();
  console.log(fails ? `\n${fails} FALLO(S)` : '\nTODO OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
