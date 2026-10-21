// Autoprueba del helper `acceptLegalIfPresent` con una pantalla legal simulada. La pantalla real (S2-1) se
// evita sembrando un consentimiento vigente; su flujo completo está en s2-1.spec.js.
const { test, expect, acceptLegalIfPresent, CONSENT, state } = require('./helpers');

const gate = (withTestId) => `
<div ${withTestId ? 'data-testid="legal-gate"' : 'id="otra-cosa"'} style="position:fixed;inset:0;background:#fff;z-index:99;padding:16px">
  <h1>Antes de empezar</h1>
  <label><input type="checkbox" class="req"> Acepto los Términos y Condiciones</label>
  <label><input type="checkbox" class="req"> Acepto la Política de Tratamiento de Datos</label>
  <label><input type="checkbox"> Autorizo mis datos sensibles de salud</label>
  <label><input type="checkbox"> Autorizo el tratamiento de mis fotos de progreso</label>
  <label><input type="checkbox" class="req"> Declaro que soy mayor de 18 años</label>
  <button type="button" disabled>Continuar</button>
</div>
<script>
  (() => {
    const g = document.currentScript.previousElementSibling;
    const b = g.querySelector('button');
    g.addEventListener('change', () => { b.disabled = [...g.querySelectorAll('.req')].some((c) => !c.checked); });
    b.addEventListener('click', () => { window.__legal = [...g.querySelectorAll('input')].map((c) => c.checked); g.remove(); });
  })();
</script>`;

for (const withTestId of [true, false]) {
  test(`acepta la pantalla legal (${withTestId ? 'data-testid' : 'por texto y botón "Continuar"'})`, async ({ app, page }) => {
    await page.route('**/index.html', async (route) => {
      const res = await route.fetch();
      const html = (await res.text()).replace('</body>', gate(withTestId) + '</body>');
      await route.fulfill({ response: res, body: html });
    });
    await app.open({ legal: false, state: state({ consent: CONSENT }) });
    expect(await acceptLegalIfPresent(page, { photos: false })).toBe(true);
    expect(await page.evaluate(() => window.__legal)).toEqual([true, true, true, false, true]);
    await expect(page.getByRole('button', { name: 'Continuar' })).toHaveCount(0);
  });
}

test('sin pantalla legal el helper no hace nada', async ({ app, page }) => {
  await app.open({ legal: false, state: state({ consent: CONSENT }) });
  expect(await acceptLegalIfPresent(page)).toBe(false);
});
