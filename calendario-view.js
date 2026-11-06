// Calendario de clases del coach (R1 v1.24): en la ficha del asesorado, programa por adelantado las clases del mes. El asesorado solo ve la de hoy
// (en su «Rutina de hoy»). Se eligen días (toque en cada día o «todos los lunes»…), se escoge la clase de «Mis rutinas» y se programa. Antes de programar
// se avisa si la clase trae un ejercicio de la lista «a evitar» o con dolor reportado (mismo aviso que al asignar).
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const C = root.Calendario;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const A = () => root.PGAccount;
  const todayKey = () => { const d = new Date(); return C.key(d.getFullYear(), d.getMonth(), d.getDate()); };
  let st = null;   // { id, name, y, m0, sched: Map(día → título), sel: Set, tpls }

  const say = (t) => { const m = $('#cal-msg'); if (m) m.textContent = t || ''; };
  const errText = (e) => (e && e.code === 'offline' ? 'Sin conexión. Revisa tu internet e inténtalo de nuevo.' : e && e.code === 'agreement_required' ? 'Falta aceptar el Acuerdo del Coach actualizado.' : 'No pudimos completar la acción. Inténtalo de nuevo.');

  function render() {
    if (!st) return;
    $('#cal-month').textContent = C.monthLabel(st.y, st.m0);
    const t = todayKey();
    // Atajos por día de la semana
    const wd = $('#cal-wd'); wd.replaceChildren();
    C.WD.forEach((l, i) => {
      const b = el('button', 'btn btn-ghost', l); b.type = 'button'; b.setAttribute('aria-label', `Elegir todos los ${C.WD_NAMES[i]} del mes`);
      b.addEventListener('click', () => {
        const ds = C.daysOfWeekday(st.y, st.m0, i, (k) => C.canSchedule(k, t));
        const all = ds.length && ds.every((k) => st.sel.has(k));
        for (const k of ds) { if (all) st.sel.delete(k); else st.sel.add(k); }
        render();
      });
      wd.append(b);
    });
    // Cuadrícula
    const g = $('#cal-grid'); g.replaceChildren();
    const head = el('tr'); for (const l of C.WD) { const th = el('th', '', l); th.scope = 'col'; head.append(th); } g.append(head);
    for (const week of C.monthGrid(st.y, st.m0)) {
      const tr = el('tr');
      for (const k of week) {
        const td = el('td');
        if (k) {
          const title = st.sched.get(k), n = C.parse(k).d;
          const b = el('button', 'cal-day' + (k === t ? ' is-today' : ''));
          b.type = 'button'; b.dataset.day = k;
          b.append(el('span', 'cal-n', String(n))); if (title) b.append(el('span', 'cal-t', C.short(title)));
          b.setAttribute('aria-pressed', st.sel.has(k) ? 'true' : 'false');
          b.setAttribute('aria-label', `${n} de ${C.MONTHS[st.m0]}${k === t ? ', hoy' : ''}${title ? `: ${title}` : ': sin clase'}`);
          b.disabled = !C.canSchedule(k, t) && !title;
          b.addEventListener('click', () => { if (st.sel.has(k)) st.sel.delete(k); else st.sel.add(k); render(); });
          td.append(b);
        }
        tr.append(td);
      }
      g.append(tr);
    }
    const sel = $('#cal-tpl');
    if (sel.options.length !== (st.tpls || []).length) {
      sel.replaceChildren(); for (const tp of st.tpls || []) { const o = el('option', '', tp.title); o.value = tp.id; sel.append(o); }
    }
    $('#cal-set').disabled = !(st.tpls || []).length || !st.sel.size;
    $('#cal-clear').disabled = ![...st.sel].some((k) => st.sched.has(k));
    $('#cal-repeat').disabled = !(st.tpls || []).length;
    if (!(st.tpls || []).length) say('Primero crea una rutina en Mis rutinas (o carga las de ejemplo) para poder programarla.');
  }

  async function loadMonth() {
    if (!st) return;
    const { from, to } = C.monthRange(st.y, st.m0);
    try {
      const list = await A().remote.coach.clientSchedule(st.id, from, to);
      st.sched = new Map(list.map((x) => [x.day, x.title]));
    } catch (e) { say(errText(e)); }
    render();
  }

  async function onSet() {
    if (!st || !st.sel.size) return;
    const t = todayKey(), tpl = (st.tpls || []).find((x) => x.id === $('#cal-tpl').value);
    if (!tpl) return;
    const days = [...st.sel].filter((k) => C.canSchedule(k, t)).sort();
    if (!days.length) { say('Esos días ya pasaron: elige desde ayer en adelante.'); return; }
    const b = $('#cal-set'); b.disabled = true; say('');
    try {
      if (root.RestrView && !(await root.RestrView.confirmAssign([{ id: st.id, name: st.name || 'Asesorado' }], tpl))) return;
      for (const part of C.chunk(days)) await A().remote.coach.scheduleSet(st.id, part, tpl.id);
      st.sel.clear(); say(`Programaste «${tpl.title}» en ${days.length} ${days.length === 1 ? 'día' : 'días'}.`);
      await loadMonth();
    } catch (e) { say(errText(e)); }
    finally { render(); }
  }
  async function onClear() {
    if (!st) return;
    const days = [...st.sel].filter((k) => st.sched.has(k));
    if (!days.length) return;
    const b = $('#cal-clear'); b.disabled = true; say('');
    try {
      for (const part of C.chunk(days)) await A().remote.coach.scheduleClear(st.id, part);
      st.sel.clear(); say(`Quitaste la clase de ${days.length} ${days.length === 1 ? 'día' : 'días'}.`);
      await loadMonth();
    } catch (e) { say(errText(e)); }
    finally { render(); }
  }

  // Repite las 4 semanas anteriores: lee 28 días antes del mes (hasta 62 días en total), agrupa por rutina y programa cada grupo. Reemplaza lo que ya haya en esos días.
  async function onRepeat() {
    if (!st) return;
    const t = todayKey(), { from, to } = C.monthRange(st.y, st.m0);
    const b = $('#cal-repeat'); b.disabled = true; say('');
    try {
      const list = await A().remote.coach.clientSchedule(st.id, C.addDays(from, -28), to);
      const r = C.repeatPlan(list, st.y, st.m0, t);
      if (!r.days) { say(r.lost ? 'Esas clases venían de una rutina que ya borraste, no se pueden repetir.' : 'No hay clases en las 4 semanas anteriores para repetir.'); return; }
      const nRep = r.replace;
      if (!confirm(`Se programarán ${r.days} ${r.days === 1 ? 'clase' : 'clases'} en ${C.monthLabel(st.y, st.m0)}, copiando las de 4 semanas antes.${nRep ? ` Se reemplazan ${nRep} que ya tenías.` : ''} ¿Seguir?`)) return;
      for (const [id, g] of r.plan) {
        const tpl = (st.tpls || []).find((x) => x.id === id);
        if (!tpl) continue;
        if (root.RestrView && !(await root.RestrView.confirmAssign([{ id: st.id, name: st.name || 'Asesorado' }], tpl))) continue;
        for (const part of C.chunk(g.days)) await A().remote.coach.scheduleSet(st.id, part, id);
      }
      st.sel.clear(); say(`Listo: repetiste las clases de las 4 semanas anteriores${r.lost ? ` (${r.lost} no se pudieron copiar porque su rutina ya no existe)` : ''}.`);
      await loadMonth();
    } catch (e) { say(errText(e)); }
    finally { render(); }
  }

  async function coach(clientId, name) {
    const box = $('#fc-cal'); if (!box || !A()) return;
    const d = new Date();
    st = { id: clientId, name, y: d.getFullYear(), m0: d.getMonth(), sched: new Map(), sel: new Set(), tpls: [] };
    say(''); box.classList.remove('hidden');
    try { st.tpls = await A().remote.coach.listTemplates(); } catch (e) { say(errText(e)); }
    $('#cal-tpl').replaceChildren();
    render(); await loadMonth();
  }
  function move(n) { if (!st) return; const m = C.addMonths(st.y, st.m0, n); st.y = m.y; st.m0 = m.m0; st.sel.clear(); say(''); render(); loadMonth(); }

  function wire() {
    if (!$('#cal-set')) return;
    $('#cal-set').addEventListener('click', onSet); $('#cal-repeat').addEventListener('click', onRepeat); $('#cal-clear').addEventListener('click', onClear);
    $('#cal-prev').addEventListener('click', () => move(-1)); $('#cal-next').addEventListener('click', () => move(1));
  }
  root.CalView = { coach };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})(window);
