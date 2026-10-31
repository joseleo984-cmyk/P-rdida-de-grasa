// UX Etapa 1 (punto 10): lista «Necesitan atención» con semáforo (texto + forma), ficha con resumen semanal arriba, reacciones de 1 toque,
// Anterior / Siguiente y las 18 insignias. Producto 'coach', servidor FALSO, miércoles 21-oct-2026.
const { test, expect } = require('@playwright/test');
const H = require('./ux1-helpers');

const CLIENTS = [
  { email: 'ana@c.co', name: 'Ana Martínez', paidDays: 20, habitDays: [0, -1, -2, -3, -4, -5].map((n) => H.hab(n, { trained: n % 2 === 0, effort: n === 0 ? 'duro' : 'normal', close: 'si' })) },
  { email: 'beto@c.co', name: 'Beto Ruiz', paidDays: 3, habitDays: [H.hab(-4), H.hab(-5)] },
  { email: 'carla@c.co', name: 'Carla Soto', paidDays: -2, habitDays: [H.hab(-9)] },
  { email: 'diego@c.co', name: 'Diego Paz', paidDays: 20, habits: false },
];

test('Coach C01: «Necesitan atención» primero con semáforo en texto y forma (ámbar a los 3 días, rojo a los 7); el pago queda en segundo plano', async ({ browser }, testInfo) => {
  const { p, errors } = await H.coachApp(browser, testInfo, CLIENTS);
  await p.locator('#tab-coach').click();
  await p.addStyleTag({ content: H.WIDE });
  await expect(p.locator('#coach-filters button:nth-child(-n+4)')).toHaveText([/^Necesitan atención · \d$/, /^Todos · 4$/, /^Vencen pronto · 1$/, /^Sin pagar · 1$/]);
  await expect(p.locator('#coach-filters [aria-pressed="true"]')).toContainText('Necesitan atención');
  const rows = p.locator('#coach-clients .cli-pay-row');
  await expect(rows).toHaveCount(4);
  const names = await rows.locator('.cli-name').allTextContents();
  // Rojo (más días / nunca) → ámbar → al día
  expect(names.indexOf('Carla Soto')).toBeLessThan(names.indexOf('Beto Ruiz'));
  expect(names.indexOf('Beto Ruiz')).toBeLessThan(names.indexOf('Ana Martínez'));
  const row = (n) => rows.filter({ hasText: n });
  await expect(row('Carla Soto').locator('.sem')).toHaveText('▲ Atención');
  await expect(row('Carla Soto').locator('.cli-motivo')).toHaveText('Sin registrar desde hace 9 días');
  await expect(row('Beto Ruiz').locator('.sem')).toHaveText('● Revisar');
  await expect(row('Beto Ruiz').locator('.cli-motivo')).toHaveText('4 días sin registrar');
  await expect(row('Ana Martínez').locator('.sem')).toHaveText('✓ Al día');
  // Forma distinta por estado (no solo color) y el pago como línea secundaria + chip
  const icons = await rows.locator('.sem > [aria-hidden]').allTextContents();
  expect(new Set(icons).size).toBe(3);
  await expect(row('Beto Ruiz').locator('.cli-pago')).toContainText('vence en 3 días');
  await expect(row('Carla Soto').locator('.chip-pay')).toHaveText('No pagó');
  // El color solo nunca es la única señal: cada fila lleva el motivo en su nombre accesible
  await expect(row('Carla Soto').locator('.cli-main')).toHaveAttribute('aria-label', /Atención: Sin registrar desde hace 9 días/);
  // Filtros
  await p.locator('#coach-filters button', { hasText: 'Todos' }).click();
  expect(await rows.locator('.cli-name').allTextContents()).toEqual(['Ana Martínez', 'Beto Ruiz', 'Carla Soto', 'Diego Paz']);
  await p.locator('#coach-filters button', { hasText: 'Vencen pronto' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.locator('.cli-name')).toHaveText('Beto Ruiz');
  await p.locator('#coach-filters button', { hasText: 'Sin pagar' }).click();
  await expect(rows.locator('.cli-name')).toHaveText('Carla Soto');
  await H.layout(p); await H.tall(p, '#view-coach');
  await H.shot(p, 'ux1-coach-lista.png', { fullPage: true });
  expect(errors).toEqual([]);
});

test('Coach C02: ficha con resumen semanal arriba, reacciones de 1 toque (notas del coach), Revisado, Anterior / Siguiente e insignias sin peso ni kcal', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const { p, errors } = await H.coachApp(browser, testInfo, CLIENTS);
  await p.locator('#tab-coach').click();
  await p.addStyleTag({ content: H.WIDE });
  await p.locator('#coach-clients .cli-main', { hasText: 'Ana Martínez' }).click();
  await expect(p.locator('#coach-detail-title')).toHaveText('Ana Martínez');
  await expect(p.locator('#coach-detail-last')).toHaveText('Último registro: hoy');
  // El resumen semanal va ANTES que las medidas, los hábitos y las comidas
  const order = await p.evaluate(() => ['fc-semana', 'fc-react', 'coach-detail-medidas-card', 'coach-detail-habits-card', 'fc-const'].map((id) => document.getElementById(id).getBoundingClientRect().top));
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await expect(p.locator('#fc-semana-title')).toHaveText(/^Esta semana \(\d+–\d+ \w+\)$/);
  await expect(p.locator('#fc-sum')).toContainText('adherencia');
  await expect(p.locator('#fc-sum')).toContainText('de 7');
  await expect(p.locator('#fc-esfuerzo')).toContainText('Duro');
  // Reacción de 1 toque = una nota del coach que el asesorado ve en su Inicio
  await expect(p.locator('#fc-react-btns button').first()).toHaveAttribute('aria-pressed', 'true');   // la primera viene elegida
  await p.locator('#fc-react-btns button', { hasText: 'Sigue así' }).click();
  await expect(p.locator('#fc-react-btns button', { hasText: 'Sigue así' })).toHaveAttribute('aria-pressed', 'true');
  await p.locator('#btn-fc-enviar').click();
  await expect(p.locator('#toast')).toHaveText('Enviado: «Sigue así»');
  const sent = async () => Object.values((await H.backend(p)).comments).map((c) => c.body);
  await expect.poll(sent).toEqual(['Sigue así']);
  await p.locator('#fc-react-btns button', { hasText: 'Te falta medirte' }).click();
  await p.locator('#btn-fc-enviar').click();
  await expect.poll(async () => (await sent()).length).toBe(2);
  // Revisado: queda marcado en este teléfono
  await p.locator('#btn-fc-revisado').click();
  await expect(p.locator('#btn-fc-revisado')).toHaveText('Revisado hoy ✓');
  await expect(p.locator('#btn-fc-revisado')).toHaveAttribute('aria-pressed', 'true');
  // Constancia e insignias (computadas en local, por proceso: nunca por peso ni kcal)
  await expect(p.locator('#fc-ins li')).toHaveCount(18);
  await expect(p.locator('#fc-const-sum')).toContainText('insignias');
  expect(await p.locator('#fc-const').evaluate((e) => e.innerText)).not.toMatch(/kg|kcal|perdiste|bajaste/i);
  // Anterior / Siguiente recorre la lista en el orden de la pantalla
  const first = await p.locator('#coach-detail-title').textContent();
  await p.locator('#btn-coach-next').click();
  await expect(p.locator('#coach-detail-title')).not.toHaveText(first);
  await p.locator('#btn-coach-prev').click();
  await expect(p.locator('#coach-detail-title')).toHaveText(first);
  // Quien no comparte sus hábitos lo dice, sin inventar datos
  await p.locator('#btn-coach-back').click();
  await p.locator('#coach-clients .cli-main', { hasText: 'Diego Paz' }).click();
  await expect(p.locator('#fc-sum')).toContainText('No comparte');
  await H.layout(p); await H.tall(p, '#coach-detail-view');
  await H.shot(p, 'ux1-coach-ficha.png', { fullPage: true });
  expect(errors).toEqual([]);
});
