// Sprint 6: textos A1–A8, versiones, huellas y estado local de las autorizaciones (lógica pura).
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const CT = require('../consent-texts.js');
const Schema = require('../schema.js');
const Sync = require('../sync.js');
const CloudView = require('../cloud-view.js');
const RemoteFake = require('../remote-fake.js');
const Remote = require('../remote.js');

const sha = (t) => crypto.createHash('sha256').update(t.replace(/\r\n?/g, '\n'), 'utf8').digest('hex');

test('A1–A7: cada texto tiene id estable, versión, tipos de consentimiento y no se puede dejar vacío', () => {
  assert.deepStrictEqual(Object.keys(CT.TEXTS), ['A1', 'A2', 'A3', 'A4', 'A4code', 'A5', 'A6a', 'A6b', 'A7']);
  const kindsOf = (id) => CT.kinds(id);
  assert.deepStrictEqual(kindsOf('A1'), ['adult']);
  assert.deepStrictEqual(kindsOf('A2'), ['terms', 'privacy']);
  assert.deepStrictEqual(kindsOf('A3'), ['sensitive_health']);
  assert.deepStrictEqual(kindsOf('A4'), ['cloud_transfer']);
  assert.deepStrictEqual(kindsOf('A5'), ['share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos']);
  assert.deepStrictEqual(kindsOf('A6a'), ['photos_cloud']);   // A6a conserva el tipo que ya existía en la base
  assert.deepStrictEqual(kindsOf('A6b'), ['photo_view_coach']);
  assert.deepStrictEqual(kindsOf('A7'), ['coach_agreement']);
  for (const id of Object.keys(CT.TEXTS)) {
    assert.match(CT.version(id), /^[\w.-]{1,20}$/, id);
    assert.ok(CT.fullText(id, { coach: 'Fit Ana', legalVersion: '0.1' }).length > 20, id);
  }
  assert.throws(() => CT.get('A9'), /desconocido/);
});

test('versiones: A5 sube a compartir-2 y el resto lleva el prefijo del borrador', () => {
  assert.strictEqual(CT.version('A5'), 'compartir-2');
  for (const id of ['A1', 'A2', 'A3', 'A4', 'A6a', 'A6b', 'A7', 'A8'].filter((x) => x !== 'A8')) assert.match(CT.version(id), /^0\.2-A/);
  assert.strictEqual(CT.A8.version, '0.2-A8');
});

test('A4 nombra a Supabase (EE. UU.) y a Brevo, avisa de la transmisión internacional y que es opcional', () => {
  const t = CT.fullText('A4');
  assert.match(t, /Supabase/);
  assert.match(t, /EE\. UU\./);
  assert.match(t, /Brevo/);
  assert.match(t, /transmisión internacional/);
  assert.match(t, /Es opcional/);
  assert.match(CT.fullText('A4code'), /Brevo/);
  assert.match(CT.fullText('A3'), /datos sensibles/);
  assert.match(CT.fullText('A3'), /voluntario/);
});

test('A6a y A6b son textos distintos, opcionales y A6b nombra al coach', () => {
  assert.notStrictEqual(CT.fullText('A6a'), CT.fullText('A6b', { coach: 'Fit Ana' }));
  assert.match(CT.fullText('A6a'), /opcional/);
  assert.match(CT.fullText('A6b', { coach: 'Fit Ana' }), /Fit Ana vea la foto/);
  assert.match(CT.fullText('A6b', { coach: 'Fit Ana' }), /una a una/);
  assert.match(CT.fullText('A6b', { coach: 'Fit Ana' }), /60 segundos/);
  assert.match(CT.fullText('A6b', { coach: 'Fit Ana' }), /No condiciona nada/);
});

test('A5: una línea por categoría, con el nombre del coach; la huella cambia con una sola palabra', () => {
  const a = CT.fullText('A5', { coach: 'Fit Ana' });
  assert.match(a, /Compartir con Fit Ana/);
  for (const w of ['Peso y medidas', 'Notas personales', 'Comidas', 'Hábitos', 'Fotos']) assert.ok(a.includes('- ' + w), w);
  assert.notStrictEqual(sha(a), sha(CT.fullText('A5', { coach: 'Fit Ano' })));
  assert.strictEqual(sha(CT.fullText('A5', { coach: 'Fit Ana' })), sha(a)); // estable
  assert.match(sha(a), /^[0-9a-f]{64}$/);
});

test('A2 muestra la versión VIGENTE de los textos legales (hoy 0.1, enlaces a legal/*.html)', () => {
  const t = CT.fullText('A2', { legalVersion: Schema.LEGAL_VERSIONS.terms });
  assert.match(t, /\(versión 0\.1\)/);
  assert.deepStrictEqual(CT.get('A2').links.map((l) => l.href), ['legal/terminos.html', 'legal/privacidad.html']);
  assert.strictEqual(Schema.LEGAL_VERSIONS.terms, '0.1'); // no se suben hasta que el abogado apruebe los textos
});

test('A7: el resumen incluye lo esencial del acuerdo', () => {
  const t = CT.fullText('A7');
  for (const w of [/solo para acompañar a ese cliente/, /no descargas, capturas ni compartes fotos/, /confidencialidad/, /planes de alimentación terapéuticos/, /24–48 h/, /borras al terminar el vínculo/, /respondes por tu propio uso/, /Acepto el Acuerdo del coach/]) assert.match(t, w);
});

test('A8: avisos de retiro, borrado y fin de vínculo (coach)', () => {
  assert.match(CT.A8text.withdraw('la copia en la nube'), /Retirarás la copia en la nube\. Tu coach deja de verlo ya\. Lo ya guardado en la nube se queda en tu cuenta hasta que la borres\./);
  assert.match(CT.A8text.withdraw('x', { borra: true }), /se borrará/);
  assert.match(CT.A8text.withdraw('x'), /prueba mínima de tu autorización anterior, sin tu nombre/);
  assert.match(CT.A8text.delete(), /no se puede deshacer/);
  assert.match(CT.A8text.delete(), /3 a 5 años una prueba mínima y sin tu nombre/);
  assert.strictEqual(CT.A8text.coachEnded('Luis'), 'Perdiste el acceso a los datos de Luis. Borra cualquier copia que tengas en un máximo de 30 días.');
});

test('estado local: la copia en la nube exige A3 y A4 vigentes; retirar una la apaga', () => {
  const ev = (id, kind, granted) => ({ kind, granted, version: CT.version(id), textHash: sha(id), clientAt: '2026-10-22T10:00:00.000Z' });
  let m = {};
  assert.strictEqual(CT.cloudAllowed(m), false);
  assert.strictEqual(CT.cloudAllowed(null), false);
  m = CT.applyEvent(m, ev('A3', 'sensitive_health', true));
  assert.strictEqual(CT.cloudAllowed(m), false);              // falta A4
  m = CT.applyEvent(m, ev('A4', 'cloud_transfer', true));
  assert.strictEqual(CT.cloudAllowed(m), true);
  assert.strictEqual(m.consentQueue.length, 2);               // en cola hasta que haya conexión
  m = CT.applyEvent(m, ev('A4', 'cloud_transfer', false));
  assert.strictEqual(CT.cloudAllowed(m), false);              // retirada
  assert.strictEqual(m.consentQueue.length, 3);               // se conserva cada decisión, en orden
  assert.deepStrictEqual(m.consentQueue.map((e) => e.granted), [true, true, false]);
  assert.strictEqual(CT.dropSent(m, 2).consentQueue.length, 1);
  // Una autorización de una versión anterior del texto ya no vale
  assert.strictEqual(CT.cloudAllowed({ consents: { sensitive_health: { granted: true, version: '0.1' }, cloud_transfer: { granted: true, version: CT.version('A4') } } }), false);
  // applyEvent es pura
  const base = { consentQueue: [] };
  CT.applyEvent(base, ev('A3', 'sensitive_health', true));
  assert.strictEqual(base.consentQueue.length, 0);
});

test('estado local: acuerdo del coach y migración de compartir-1 a compartir-2', () => {
  assert.strictEqual(CT.coachAgreementOK({}), false);
  assert.strictEqual(CT.coachAgreementOK({ consents: { coach_agreement: { granted: true, version: CT.version('A7') } } }), true);
  assert.strictEqual(CT.coachAgreementOK({ consents: { coach_agreement: { granted: false, version: CT.version('A7') } } }), false);
  assert.strictEqual(CT.coachAgreementOK({ consents: { coach_agreement: { granted: true, version: '0.1-A7' } } }), false);
  assert.strictEqual(CT.shareMigrationNeeded({}), false);                                  // sin vínculo no hay nada que migrar
  assert.strictEqual(CT.shareMigrationNeeded({ link: { businessName: 'x' } }), true);       // vínculo anterior (compartir-1)
  assert.strictEqual(CT.shareMigrationNeeded({ link: { businessName: 'x' }, shareVersion: 'compartir-1' }), true);
  assert.strictEqual(CT.shareMigrationNeeded({ link: { businessName: 'x' }, shareVersion: 'compartir-2' }), false);
});

test('mergeServer: gana lo más reciente por tipo y no toca la cola', () => {
  const m = { consents: { cloud_transfer: { granted: true, version: '0.2-A4', clientAt: '2026-10-22T10:00:00.000Z' } }, consentQueue: [{ kind: 'x' }] };
  const out = CT.mergeServer(m, {
    cloud_transfer: { granted: false, version: '0.2-A4', textHash: 'h', clientAt: '2026-10-22T11:00:00.000Z' },
    coach_agreement: { granted: true, version: '0.2-A7', textHash: 'h', clientAt: '2026-10-22T09:00:00.000Z' },
  });
  assert.strictEqual(out.consents.cloud_transfer.granted, false);
  assert.strictEqual(out.consents.coach_agreement.granted, true);
  assert.deepStrictEqual(out.consentQueue, [{ kind: 'x' }]);
  const older = CT.mergeServer(m, { cloud_transfer: { granted: false, version: '0.2-A4', textHash: 'h', clientAt: '2026-10-22T08:00:00.000Z' } });
  assert.strictEqual(older.consents.cloud_transfer.granted, true);
});

test('sync: sin la autorización de la copia en la nube no se sube ni se baja nada', async () => {
  const calls = [];
  const remote = { sync: { push: async () => { calls.push('push'); return {}; }, pull: async () => { calls.push('pull'); return { records: [], photos: [], comments: [], cursor: 'c' }; }, uploadPhoto: async () => {} } };
  let allowed = false, meta = { userId: 'u1', deviceId: 'd' };
  const store = { getState: () => Schema.emptyState(), saveMerged() {}, getMeta: () => meta, setMeta: (m) => { meta = m; }, healthAllowed: () => true, ownerId: () => 'u1', cloudAllowed: () => allowed, photosCloudAllowed: () => false };
  const eng = Sync.createSync({ remote, store });
  assert.deepStrictEqual((await eng.run()).status, 'nocloud');
  assert.strictEqual(eng.status().state, 'nocloud');
  assert.deepStrictEqual(calls, []);
  allowed = true;
  assert.strictEqual((await eng.run()).status, 'ok');
  assert.ok(calls.includes('pull'));
  assert.match(CloudView.syncText({ state: 'nocloud' }), /copia en la nube está apagada/);
});

test('servidor falso: acepta los tipos nuevos, rechaza otros y la baja deja solo la prueba mínima sin datos personales', async () => {
  const be = new RemoteFake.FakeBackend();
  const r = RemoteFake.createFake({ backend: be, storage: null });
  await r.auth.sendCode('ana@ejemplo.com');
  const { user } = await r.auth.verifyCode('ana@ejemplo.com', be.lastCode('ana@ejemplo.com'));
  await r.account.joinApp();
  const H = sha('texto');
  const T = '2026-10-22T10:00:00.000Z';
  for (const kind of ['cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement']) {
    await r.account.recordConsents([{ kind, granted: true, version: '0.2-X', textHash: H, clientAt: T }]);
  }
  await assert.rejects(r.account.recordConsents([{ kind: 'photo_cloud', granted: true, version: '0.2-X', textHash: H, clientAt: T }]), (e) => e.code === 'invalid');
  await r.account.recordConsents([{ kind: 'photo_view_coach', granted: false, version: '0.2-X', textHash: H, clientAt: '2026-10-22T10:05:00.000Z', coachId: 'c0a0c0a0-0000-4000-8000-000000000001' }]);
  assert.strictEqual((await r.account.consents()).photo_view_coach.granted, false);
  await r.account.deleteAccount();
  assert.strictEqual(be.consentEvents.length, 0);
  assert.strictEqual(be.consentArchive.length, 5);
  const dump = JSON.stringify(be.consentArchive);
  assert.ok(!dump.includes(user.id) && !dump.includes('ana@ejemplo.com') && !dump.includes('c0a0c0a0'));
  assert.ok(be.consentArchive.every((x) => /^[0-9a-f]{64}$/.test(x.userPseudoId) && /^[0-9a-f]{64}$/.test(x.textHash)));
  assert.deepStrictEqual(be.consentArchive.map((x) => x.action), ['grant', 'grant', 'grant', 'grant', 'revoke']);
  assert.strictEqual(new Set(be.consentArchive.map((x) => x.userPseudoId)).size, 1);
});

test('servidor falso: comidas y hábitos nacen apagados al vincularse', async () => {
  const be = new RemoteFake.FakeBackend();
  const mk = async (email) => { const r = RemoteFake.createFake({ backend: be, storage: null }); await r.auth.sendCode(email); await r.auth.verifyCode(email, be.lastCode(email)); await r.account.joinApp(); return r; };
  const coach = await mk('coach@ejemplo.com');
  await coach.coach.becomeCoach('Fit Ana');
  const code = (await coach.coach.myCoach()).inviteCode;
  const cli = await mk('cli@ejemplo.com');
  const link = await cli.client.joinCoach(code, { body: true, version: CT.version('A5'), textHash: sha('a5') });
  assert.deepStrictEqual(link.shares, { body: true, notes: false, nutrition: false, habits: false, photos: false });
});

test('Remote.textHash coincide con SHA-256 del texto exacto de cada autorización', async () => {
  for (const id of ['A1', 'A3', 'A4', 'A6a', 'A7']) assert.strictEqual(await Remote.textHash(CT.fullText(id)), sha(CT.fullText(id)), id);
});
