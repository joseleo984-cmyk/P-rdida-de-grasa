const test = require('node:test');
const assert = require('node:assert');
const V = require('../cloud-view.js');

const NOW = Date.parse('2026-10-22T14:00:00-05:00');
const TZ = 'America/Bogota';
const at = (iso) => new Date(iso).toISOString();

test('when: hoy / ayer / fecha, con hora', () => {
  assert.match(V.when(at('2026-10-22T09:41:00-05:00'), NOW, TZ), /^hoy 9:41/);
  assert.match(V.when(at('2026-10-21T21:41:00-05:00'), NOW, TZ), /^ayer 9:41/);
  assert.match(V.when(at('2026-10-12T09:41:00-05:00'), NOW, TZ), /^el 12 oct, 9:41/);
  assert.equal(V.when('basura', NOW, TZ), '');
});

test('syncText: un texto claro por estado', () => {
  assert.match(V.syncText({ state: 'ok', lastOkAt: at('2026-10-22T09:41:00-05:00') }, NOW, TZ), /^Se guardó en tu cuenta hoy 9:41/);
  assert.equal(V.syncText({ state: 'ok', lastOkAt: null }, NOW, TZ), 'Se guardó en tu cuenta');
  assert.equal(V.syncText({ state: 'offline' }), 'Sin internet: se guardará en tu cuenta cuando vuelva.');
  assert.match(V.syncText({ state: 'error' }), /^No se pudo guardar en tu cuenta/);
  assert.equal(V.syncText({ state: 'owner' }), 'Falta que confirmes que estos datos son tuyos.');
  assert.equal(V.syncText({ state: 'blocked' }), 'No se guarda en tu cuenta porque no autorizaste los datos de salud.');
  assert.match(V.syncText({ state: 'auth' }), /sesión se cerró/);
  assert.equal(V.syncText({ state: 'syncing' }), 'Guardando en tu cuenta…');
  assert.equal(V.syncText({ state: 'idle' }), '');
  assert.equal(V.stateKey({ state: 'syncing' }), 'running');
});

test('dataMode: la nube solo se afirma con servidor, cuenta, salud autorizada y sync correcto', () => {
  const ok = { state: 'ok', lastOkAt: at('2026-10-22T09:41:00-05:00') };
  const base = { remoteOn: true, signedIn: true, healthOk: true, st: ok, now: NOW };
  assert.deepEqual(V.dataMode(base), { cloud: true, quietBackup: true });
  assert.deepEqual(V.dataMode({ ...base, remoteOn: false }), { cloud: false, quietBackup: false }); // app oficial
  assert.deepEqual(V.dataMode({ ...base, signedIn: false }), { cloud: false, quietBackup: false });
  assert.deepEqual(V.dataMode({ ...base, healthOk: false }), { cloud: false, quietBackup: false });
  for (const state of ['offline', 'error', 'owner', 'blocked', 'auth', 'idle']) assert.equal(V.dataMode({ ...base, st: { ...ok, state } }).cloud, false, state);
  assert.equal(V.dataMode({ ...base, st: { state: 'syncing', lastOkAt: ok.lastOkAt } }).cloud, true);
  assert.equal(V.dataMode({ ...base, st: { state: 'syncing', lastOkAt: null } }).cloud, false);
});

test('dataMode: el aviso de copia se calla solo si el último sync fue hace menos de 24 h', () => {
  const old = { state: 'ok', lastOkAt: at('2026-10-20T09:00:00-05:00') };
  const m = V.dataMode({ remoteOn: true, signedIn: true, healthOk: true, st: old, now: NOW });
  assert.equal(m.cloud, true);
  assert.equal(m.quietBackup, false);
  const off = V.dataMode({ remoteOn: true, signedIn: true, healthOk: true, st: { state: 'offline', lastOkAt: at('2026-10-22T09:00:00-05:00') }, now: NOW });
  assert.deepEqual(off, { cloud: false, quietBackup: true });
});

test('ago y savedLine: texto de la cabecera de Más', () => {
  const ok = (iso) => ({ state: 'ok', lastOkAt: at(iso) });
  assert.equal(V.ago(at('2026-10-22T13:59:50-05:00'), NOW, TZ), 'hace un momento');
  assert.equal(V.ago(at('2026-10-22T13:55:00-05:00'), NOW, TZ), 'hace 5 min');
  assert.equal(V.ago(at('2026-10-22T11:00:00-05:00'), NOW, TZ), 'hace 3 h');
  assert.match(V.ago(at('2026-10-20T11:00:00-05:00'), NOW, TZ), /^el 20 oct/);
  assert.equal(V.ago('basura', NOW, TZ), '');
  assert.equal(V.savedLine(ok('2026-10-22T13:55:00-05:00'), NOW, TZ), 'Guardado en tu cuenta · hace 5 min');
  assert.equal(V.savedLine({ state: 'idle' }, NOW, TZ), 'Tu cuenta está activa');
  assert.equal(V.savedLine({ state: 'offline', lastOkAt: at('2026-10-22T13:55:00-05:00') }, NOW, TZ), 'Sin internet: se guardará en tu cuenta cuando vuelva.');
});
