DE: Dev Backend + Datos → PARA: QA (cc: Scrum Master, Dev Frontend, Arquitecto)
HISTORIA: S1-1 — correcciones del veredicto `2026-10-21-S1-1-qa-veredicto.md` (D1-D4 y L2, L5, L6, L7)
BASE: `claude/agent-team-app-org-nnunot` en `f168206` (incluye S1-2 corregida y S1-3), integrada por fast-forward.

HECHO:
- **D1 (perfil heredado inválido)**
  - `Schema.normalize` devuelve además `rejected: { profile, reason }`. El borrador lleva tipos seguros: números
    finitos o `''`, `sex` solo `male`/`female`/`''` y fecha ISO o `''`.
  - `app.js` lo guarda en `pending`. `state.profile` sigue en `null`, así que no se calcula con un perfil incoherente.
  - `persist()` escribe el borrador en `profile` hasta que se guarde uno válido, de modo que **nunca se pierde**.
    En cada carga vuelve a salir como borrador (la operación es idempotente). La exportación también lo incluye.
  - `fillProfileForm()` precarga el formulario con el borrador. El nuevo `<p id="profile-issue" role="alert">`, en
    `index.html` sobre el formulario, muestra el motivo concreto y de forma persistente: «Revisa tu perfil: La meta
    debe ser menor que el peso inicial (meta 80 kg, inicial 70 kg). Corrige los datos y pulsa Guardar.».
  - `profileError` incluye ahora las cifras en ese mensaje.
  - `:backup` y `:corrupto` se escriben **solo si no existen** (`keepCopy`). Los mensajes ya no nombran claves internas.
- **D2 (el éxito tapaba el error)**
  - `save()` devuelve `true`/`false`. Si falla, muestra el aviso como error y **deshace el cambio en memoria**
    volviendo al último JSON guardado, así que la pantalla muestra lo que de verdad hay guardado.
  - Ningún llamador muestra éxito si `save()` falla: perfil, registro, alimento, hábitos, repetir comidas (S1-3) y borrados.
  - `toast(msg, isError)`: dura `max(2,2 s, 60 ms × caracteres)`, y los errores `max(6 s, …)`. Se añade la clase
    `.toast.error` (una línea en `styles.css`). La importación rechazada también se muestra como error.
- **D3**: «Borrar todo» borra las **claves** (`:v1`, `:backup`, `:corrupto`, `:lastBackup`, `:backupSnooze`) con
  `removeItem` en lugar de escribir un estado vacío. Así funciona aunque la cuota esté llena o el guardado bloqueado
  por versión. Si falla, avisa con un error y no dice «Datos borrados». Si no se pueden borrar las fotos, lo dice.
- **D4**: `loadPhotos()` pasa cada foto por `Schema.normalizeStoredPhoto`. Se ocultan las fotos sin fecha ISO, sin id
  o sin `Blob`, y una pose desconocida pasa a «frente». El id no se toca porque se usa para borrar, y ya se escapa al pintar.
- **L2**: si el respaldo trae fotos y **todas** son inválidas, se conserva la galería actual y el `confirm` lo dice.
- **L5**: duración del toast según la longitud (ver D2).
- **L6 (BUG-07)**: el formulario rechaza un nombre de alimento hecho solo de espacios.
- **L7**: el `confirm` de importación nombra el perfil inválido y su motivo, y dice que se cargará en el formulario.
- **L1**: el formulario no añade a la biblioteca nombres reservados (`Schema.isSafeKey`: `__proto__`, `constructor`,
  `prototype`). El alimento sí se guarda en el diario. Al recargar ya no aparece el aviso de «datos dañados».
- `sw.js`: `CACHE = 'perdida-grasa-v5'` (cambian `app.js`, `schema.js`, `index.html` y `styles.css`).

PRUEBAS:
- `npm test`: 31/31. Las nuevas cubren D1 (borrador con tipos seguros, idempotente al recargar), D4
  (`normalizeStoredPhoto`) e `isSafeKey`.
- `node equipo/qa/run-s1-1.js`: 23/23. Las nuevas cubren D1 (formulario precargado y motivo visible tras dos
  recargas; al corregir desaparece) y D2 (perfil con cuota llena: toast de error, sin éxito y sin cambio).
- `run-s1-2.js`, `qa-s1-2.js` y `run-s1-3.js`: TODO OK.
- `node equipo/qa/qa-s1-1.js`: **49/50**. El único fallo es «sw.js: … CACHE subido a v3»: la regex exige
  literalmente `perdida-grasa-v3`, pero S1-3 ya lo subió a v4 y esta corrección a v5. Debería comprobar
  `CACHE ≥ v3` (p. ej. `/perdida-grasa-v(\d+)/` y número ≥ 3). @QA, ¿lo ajustas?

DEUDA (no corregida, documentada):
- **L3**: `Number()` acepta `"1e2"` y `"0x10"`, y `"80,5"` descarta el campo. La suite de QA (§8 y §9 «Obs») fija
  hoy ese comportamiento como observación. Cambiarlo rompería esas comprobaciones y a la vez la compatibilidad con
  respaldos ya importados. Propuesta para Sprint 2: exigir `/^-?\d+([.,]\d+)?$/` con coma decimal, y actualizar las «Obs» de QA.
- **L4**: las notas de más de 140 caracteres se truncan sin aviso (la «Obs» de QA §9 lo fija). Son inofensivas porque
  el formulario ya limita a 140.
- Sigue pendiente un toast accesible con `role="alert"` en los errores. `#toast` es `role="status"` y lo lleva
  Frontend; el aviso del perfil sí es `role="alert"`.
- Pendiente de S1-1: prueba manual en iOS Safari (atob con fotos de 2-5 MB y transacción única).

PREGUNTAS:
- @QA: ¿te vale guardar el borrador en el propio campo `profile` del almacenamiento (y del respaldo) en lugar de una
  clave aparte? Lo elegí para que el borrador viaje con el respaldo y no haya una clave más que limpiar.
- @Frontend: `.toast.error` usa un rojo fijo `#b3261e` sobre blanco (contraste 6,5:1). Si prefieres un token del tema, cámbialo.
