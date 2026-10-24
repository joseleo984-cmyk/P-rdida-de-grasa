// UX Etapa 1: ayudantes de las E2E nuevas (producto 'coach', servidor FALSO). Reloj fijo: miércoles 21-oct-2026 12:00 (Bogotá).
const { expect } = require('@playwright/test');
const H = require('./s11-helpers');

const TODAY = '2026-10-21';   // miércoles
const iso = (n) => new Date(Date.UTC(2026, 9, 21 + n)).toISOString().slice(0, 10);
const KEY = 'perdida-grasa:v1';

// Asesorado (Ana) ya vinculado con su coach (Laura) y con el pago al día.
async function clientApp(browser, testInfo, { habits = true, paid = 30, wide = false } = {}) {
  const ph = await H.phone(browser, testInfo);
  const { p } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p, { habits });
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.goto(`index.html?c=${code}`);
  await H.enterWithEmail(p, 'ana@c.co', 'Ana Martínez');
  await p.getByRole('button', { name: 'Conectarme y continuar' }).click();
  await p.getByRole('button', { name: 'Ir a la app' }).click();
  await setPaid(p, paid);
  await p.evaluate(() => PGAccount.refreshLink());
  if (wide) await p.addStyleTag({ content: H.WIDE });
  return { ...ph, code };
}
const setPaid = (p, days, email = 'ana@c.co') => p.evaluate(([d, e]) => window.__pgFakeBackend.setPaidUntil(e, new Date(window.__pgFakeBackend.clock.now() - 5 * 3600000 + d * 86400000).toISOString().slice(0, 10)), [days, email]);
const stored = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const habitsOf = async (p, d = TODAY) => (await stored(p)).habits[d];
// Escribe en el estado guardado (hábitos, comidas, medidas) y recarga la app.
async function seedState(p, patch) {
  await p.evaluate(([k, patch]) => {
    const s = JSON.parse(localStorage.getItem(k));
    const T = '2026-10-20T10:00:00.000Z';
    let n = 0;
    const id = () => `00000000-0000-4000-8000-${String(900000000000 + (n++))}`;
    for (const [d, h] of Object.entries(patch.habits || {})) s.habits[d] = { id: id(), trained: false, updatedAt: T, ...h };
    for (const [d, list] of Object.entries(patch.foods || {})) s.foods[d] = list.map((x) => ({ id: id(), meal: 'Almuerzo', carbs: 0, fat: 0, protein: 0, updatedAt: T, ...x }));
    for (const e of patch.entries || []) s.entries.push({ id: id(), updatedAt: T, ...e });
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, patch]);
  await p.reload();
  await H.ready(p);
}
// Contraste WCAG entre el color del texto de un elemento y el fondo que realmente tiene detrás.
const contrast = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); const v = m[1].split(',').map((x) => parseFloat(x)); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let bg = { r: 255, g: 255, b: 255, a: 0 };
  for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0.9) { bg = c; break; } }
  const fg = parse(getComputedStyle(el).color);
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}, sel);

// Coach (Laura) ya entrado en su teléfono con los asesorados que se le pidan: [{ email, name, paidDays, habits, habitDays, measures, foods }].
async function coachApp(browser, testInfo, clients) {
  const ph = await H.phone(browser, testInfo, { prefs: {} });
  const { p } = ph;
  await p.goto('index.html');
  await H.acceptSolo(p);
  const code = await H.seedCoach(p, 'laura@coach.co', 'Laura Fit');
  await p.evaluate(async () => {
    const be = window.__pgFakeBackend;
    const r = RemoteFake.createFake({ backend: be, storage: localStorage });
    await r.auth.sendCode('laura@coach.co');
    const { user } = await r.auth.verifyCode('laura@coach.co', be.lastCode('laura@coach.co'));
    const c = await r.coach.myCoach();
    const at = '2026-10-01T12:00:00.000Z', h = 'a'.repeat(64);
    localStorage.setItem('perdida-grasa:account', JSON.stringify({ userId: user.id, email: user.email, roles: ['client', 'coach'], onboarded: true, coach: c, cloudAsked: true,
      consents: { sensitive_health: { granted: true, version: '0.2-AU', textHash: h, clientAt: at }, cloud_transfer: { granted: true, version: '0.2-AU', textHash: h, clientAt: at }, coach_agreement: { granted: true, version: ConsentTexts.version('A7'), textHash: h, clientAt: at } } }));
    localStorage.setItem('perdida-grasa:owner', user.id);
  });
  // Se siembra con el pago al día (un asesorado en pausa no puede subir datos) y después se vence o se quita el pago.
  for (const c of clients) {
    const days = 'paidDays' in c ? c.paidDays : 20;
    await H.seedClient(p, c.email, c.name, code, { paidDays: days == null || days < 0 ? 5 : days, habits: c.habits !== false, measures: c.measures || [], habitDays: c.habitDays || [], foods: c.foods || [] });
    if (days != null && days < 0) await setPaid(p, days, c.email);
  }
  await p.reload(); await H.ready(p);
  return { ...ph, code };
}
const hab = (n, data = {}) => ({ date: iso(n), data: { water: 2, steps: 8000, sleep: 7.5, trained: false, ...data } });

module.exports = { coachApp, hab, ...H, TODAY, iso, KEY, clientApp, setPaid, stored, habitsOf, seedState, contrast };
