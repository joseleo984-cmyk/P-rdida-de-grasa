// LEGAL-01: helper común para las E2E anteriores a la pantalla de consentimiento.
// `conConsentimiento(ctxOPage)` simula a una persona que YA aceptó en este dispositivo: al LEER el estado de
// localStorage le añade un consentimiento vigente (todas las casillas) si no lo trae. No escribe nada, así que
// las semillas, los datos corruptos o de versión futura y las comprobaciones de lo guardado siguen igual;
// la app solo persiste el consentimiento cuando ella misma guarda.
// El flujo de la pantalla legal se prueba aparte, sin este helper, en run-s2-1.js.
const path = require('path');
const Schema = require(path.join(__dirname, '../../schema.js'));

const CONSENT = Schema.buildConsent({ terms: true, privacy: true, adult: true, sensitiveHealth: true, photos: true }, '2026-10-01T12:00:00.000Z');

async function conConsentimiento(target) {
  await target.addInitScript((consent) => {
    const KEY = 'perdida-grasa:v1';
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      const raw = get.call(this, k);
      if (k !== KEY || this !== window.localStorage) return raw;
      // Sin datos guardados: la app arranca vacía, pero con el consentimiento ya dado.
      if (raw == null) return JSON.stringify({ schemaVersion: 3, entries: [], consent });
      try {
        const s = JSON.parse(raw);
        if (!s || typeof s !== 'object' || Array.isArray(s) || s.consent) return raw;
        return JSON.stringify({ ...s, consent });
      } catch { return raw; }
    };
  }, CONSENT);
}

module.exports = { conConsentimiento, CONSENT };
