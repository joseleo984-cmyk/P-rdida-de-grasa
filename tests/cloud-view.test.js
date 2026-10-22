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
  assert.match(V.syncText({ state: 'ok', lastOkAt: at('2026-10-22T09:41:00-05:00') }, NOW, TZ), /^Sincronizado hoy 9:41/);
  assert.equal(V.syncText({ state: 'ok', lastOkAt: null }, NOW, TZ), 'Sincronizado');
  assert.equal(V.syncText({ state: 'offline' }), 'Sin conexión: se subirá al volver.');
  assert.match(V.syncText({ state: 'error' }), /^No se pudo sincronizar/);
  assert.equal(V.syncText({ state: 'owner' }), 'Falta confirmar que estos datos son tuyos.');
  assert.equal(V.syncText({ state: 'blocked' }), 'No sincroniza: no autorizaste datos de salud.');
  assert.match(V.syncText({ state: 'auth' }), /sesión caducó/);
  assert.equal(V.syncText({ state: 'syncing' }), 'Sincronizando…');
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
