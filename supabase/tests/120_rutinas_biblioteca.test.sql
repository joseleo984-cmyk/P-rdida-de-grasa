-- Etapa 2b (r1 v1.8): biblioteca de rutinas del coach («Mis rutinas»), asignar (copias independientes), mostrar/ocultar y «Rutina de hoy».
--   · La migración conserva las rutinas de v1.7 (una por coach+cliente) como asignadas VISIBLES y deja que un cliente tenga varias.
--   · Plantillas: solo del coach; límites (50 plantillas, 20 rutinas por cliente); asignar crea una COPIA: editar la plantilla no cambia las copias.
--   · Ocultar: el cliente no ve la rutina oculta; un cliente no ve la de otro; otro coach no ve ni toca nada ajeno.
--   · Rutina de hoy: solo con vínculo activo, solo si el día publicado coincide con la fecha de hoy que manda el cliente.
--   · Un GIF usado por una plantilla, una asignada o la del día no se borra. La baja de cuenta se lleva todo.
begin;
select set_config('t.today', (grasa.today_bogota())::text, true);
select tests.cloud('ana'); select tests.cloud('bea'); select tests.agree('x'); select tests.agree('y');

select tests.login('x');
select core.join_app('grasa');
select set_config('t.code_x', (select invite_code from grasa.become_coach('Coach X Fit')), true);
reset role; select tests.login('y');
select core.join_app('grasa');
select grasa.become_coach('Coach Y Fit');
reset role; select tests.login('ana');
select core.join_app('grasa');
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')));
reset role; select tests.login('bea');
select core.join_app('grasa');
select grasa.join_coach(current_setting('t.code_x'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')));
reset role;

-- ---------- La migración conserva los datos de v1.7 ----------
-- Se vuelve al estado ANTERIOR (sin columna visible, con el único coach+cliente), se guarda una rutina «vieja» y se aplica la migración encima.
alter table grasa.routines drop column visible;
alter table grasa.routines add constraint routines_coach_id_client_id_key unique (coach_id, client_id);
insert into grasa.routines (id, coach_id, client_id, title, content) values
  ('c0000000-0000-4000-8000-000000000001', tests.uid('x'), tests.uid('ana'), 'Rutina vieja de Ana', '{"days":[{"title":"Día 1","exercises":[{"name":"Sentadilla","sets":"4 × 10"}]}]}'::jsonb);
update grasa.routines set created_at = now() - interval '30 days' where id = 'c0000000-0000-4000-8000-000000000001';   -- en la vida real es de antes (en una transacción now() es igual para todas)
\ir ../migrations/20261026120000_r1_rutinas_biblioteca.sql
select tests.ok((select title from grasa.routines where id = 'c0000000-0000-4000-8000-000000000001') = 'Rutina vieja de Ana'
                and (select visible from grasa.routines where id = 'c0000000-0000-4000-8000-000000000001'), 'migración: la rutina de v1.7 se conserva y queda VISIBLE');
select tests.ok(not exists (select 1 from pg_constraint where conrelid = 'grasa.routines'::regclass and contype = 'u'), 'migración: ya no hay único (coach, cliente)');
select tests.ok((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'grasa' and c.relname in ('routine_templates', 'daily_routines') and c.relrowsecurity) = 2, 'las dos tablas nuevas tienen RLS');
\ir ../migrations/20261026120000_r1_rutinas_biblioteca.sql
select tests.ok((select count(*) from grasa.routines) = 1, 'migración idempotente: aplicarla otra vez no duplica ni borra filas');

select tests.login('ana');
select tests.ok(jsonb_array_length(grasa.my_routines()) = 1 and (grasa.my_routines() -> 0 ->> 'title') = 'Rutina vieja de Ana', 'Ana sigue viendo su rutina de antes en my_routines');
select tests.ok((grasa.my_routine() ->> 'title') = 'Rutina vieja de Ana', 'la app vieja: my_routine sigue devolviendo esa rutina');
reset role;

-- ---------- Tablas cerradas ----------
select tests.login('x');
select tests.throws($$select count(*) from grasa.routine_templates$$, 'permission denied', 'el coach no lee grasa.routine_templates directamente');
select tests.throws($$select count(*) from grasa.daily_routines$$, 'permission denied', 'el coach no lee grasa.daily_routines directamente');
select tests.throws($$insert into grasa.routine_templates (coach_id, title, content) values (auth.uid(), 'x', '{}')$$, 'permission denied', 'ni inserta plantillas saltándose save_template');
reset role; select tests.login('ana');
select tests.throws($$select count(*) from grasa.routine_templates$$, 'permission denied', 'el cliente no lee plantillas directamente');
select tests.throws($$update grasa.routines set visible = true$$, 'permission denied', 'el cliente no toca grasa.routines (ni su visibilidad)');
reset role; select tests.login('anon');
select tests.throws($$select grasa.my_routines()$$, 'permission denied', 'anon no ejecuta my_routines');
select tests.throws($$select grasa.my_daily(current_date)$$, 'permission denied', 'anon no ejecuta my_daily');
select tests.throws($$select grasa.list_templates()$$, 'permission denied', 'anon no ejecuta list_templates');
reset role;

-- ---------- Plantillas: crear, editar, validar ----------
select tests.login('x');
select grasa.register_gif('a0000000-0000-4000-8000-000000000001', 'Press de banca', 'image/gif', 1000, '474946383961010001000000');
select grasa.register_gif('a0000000-0000-4000-8000-000000000002', 'Sentadilla', 'image/gif', 1000, '474946383961010001000000');
select set_config('t.pecho', $j${"days":[
  {"title":"Día 1 – Pecho","exercises":[
    {"name":"Press de banca","sets":"4 × 12","note":"Baja despacio","gif":"a0000000-0000-4000-8000-000000000001"},
    {"name":"Fondos","sets":"3 × 10"}]},
  {"title":"Día 2 – Descanso","exercises":[]}]}$j$, true);
select set_config('t.pierna', '{"days":[{"title":"Día 1 – Piernas","exercises":[{"name":"Sentadilla","sets":"4 × 10","gif":"a0000000-0000-4000-8000-000000000002"}]}]}', true);
select set_config('t.tpl_pecho', (grasa.save_template(null, '  Pecho  ', current_setting('t.pecho')::jsonb) ->> 'id'), true);
select tests.ok((select title from jsonb_to_recordset(grasa.list_templates()) as x(id uuid, title text) where id = current_setting('t.tpl_pecho')::uuid) = 'Pecho', 'el coach crea la plantilla «Pecho» (título recortado) y la ve en su biblioteca');
select set_config('t.tpl_pierna', (grasa.save_template(null, 'Piernas', current_setting('t.pierna')::jsonb) ->> 'id'), true);
select tests.ok(jsonb_array_length(grasa.list_templates()) = 2, 'tiene 2 plantillas');
select tests.ok((grasa.save_template(current_setting('t.tpl_pierna')::uuid, 'Piernas y glúteos', current_setting('t.pierna')::jsonb) ->> 'title') = 'Piernas y glúteos'
                and jsonb_array_length(grasa.list_templates()) = 2, 'guardar con id REEMPLAZA (no duplica)');
select tests.throws(format($$select grasa.save_template(null, '', %L::jsonb)$$, current_setting('t.pecho')), 'invalid', 'título vacío rechazado');
select tests.throws(format($$select grasa.save_template(null, %L, %L::jsonb)$$, repeat('t', 61), current_setting('t.pecho')), 'invalid', 'título de 61 caracteres rechazado');
select tests.throws($$select grasa.save_template(null, 'T', '{"days":[]}'::jsonb)$$, 'invalid', 'cero días rechazado');
select tests.throws(format($$select grasa.save_template(null, 'T', %L::jsonb)$$,
  (select jsonb_build_object('days', jsonb_agg(jsonb_build_object('title', 'D' || g, 'exercises', '[]'::jsonb)))::text from generate_series(1, 8) g)), 'invalid', '8 días rechazado');
select tests.throws(format($$select grasa.save_template(null, 'T', %L::jsonb)$$,
  (select jsonb_build_object('days', jsonb_build_array(jsonb_build_object('title', 'D', 'exercises', jsonb_agg(jsonb_build_object('name', 'E' || g, 'sets', '3')))))::text from generate_series(1, 13) g)), 'invalid', '13 ejercicios rechazados');
select tests.throws($$select grasa.save_template(null, 'T', '{"days":[{"title":"D","exercises":[{"name":"E","sets":"3","gif":"b0000000-0000-4000-8000-000000000001"}]}]}'::jsonb)$$, 'gif_not_found', 'un GIF que no es del coach se rechaza');
select tests.throws($$select grasa.save_template('00000000-0000-4000-8000-0000000000ff', 'T', '{"days":[{"title":"D","exercises":[]}]}'::jsonb)$$, 'not_found', 'editar una plantilla que no existe: not_found');

-- ---------- Otro coach y el cliente no ven ni tocan plantillas ajenas ----------
reset role; select tests.login('y');
select tests.ok(grasa.list_templates() = '[]'::jsonb, 'Y no ve las plantillas de X');
select tests.throws(format($$select grasa.save_template(%L, 'Mía', %L::jsonb)$$, current_setting('t.tpl_pecho'), current_setting('t.pierna')), 'not_found', 'Y no edita una plantilla de X (ni sabe que existe)');
select tests.throws(format($$select grasa.assign_template(%L, array[%L]::uuid[])$$, current_setting('t.tpl_pecho'), tests.uid('ana')), 'not_found', 'Y no asigna una plantilla de X');
select tests.throws(format($$select grasa.publish_daily(%L, current_setting('t.today')::date)$$, current_setting('t.tpl_pecho')), 'not_found', 'Y no publica una plantilla de X como rutina de hoy');
select grasa.delete_template(current_setting('t.tpl_pecho')::uuid);
select tests.throws(format($$select grasa.list_client_routines(%L)$$, tests.uid('ana')), 'forbidden', 'Y no ve las rutinas del cliente de X');
select tests.throws(format($$select grasa.save_client_routine(%L, null, 'Mía', %L::jsonb)$$, tests.uid('ana'), '{"days":[{"title":"D","exercises":[]}]}'), 'forbidden', 'Y no crea una rutina para el cliente de X');
select grasa.delete_client_routine('c0000000-0000-4000-8000-000000000001');
select tests.throws($$select grasa.set_routine_visible('c0000000-0000-4000-8000-000000000001', false)$$, 'not_found', 'Y no oculta la rutina de un cliente de X');
select tests.ok(grasa.get_daily() is null, 'Y no tiene rutina de hoy');
reset role; select tests.login('x');
select tests.ok(jsonb_array_length(grasa.list_templates()) = 2, 'Y no pudo borrar plantillas de X');
select tests.ok(exists (select 1 from jsonb_array_elements(grasa.list_client_routines(tests.uid('ana'))) e where e ->> 'id' = 'c0000000-0000-4000-8000-000000000001'), 'ni la rutina de Ana (delete_client_routine solo borra las propias)');
reset role; select tests.login('ana');
select tests.throws($$select grasa.list_templates()$$, 'forbidden', 'un cliente no usa list_templates');
select tests.throws($$select grasa.save_template(null, 'T', '{"days":[{"title":"D","exercises":[]}]}'::jsonb)$$, 'forbidden', 'un cliente no crea plantillas');
select tests.throws($$select grasa.publish_daily(gen_random_uuid(), current_setting('t.today')::date)$$, 'forbidden', 'un cliente no publica la rutina de hoy');
select tests.throws(format($$select grasa.assign_template(%L, array[%L]::uuid[])$$, current_setting('t.tpl_pecho'), tests.uid('ana')), 'forbidden', 'un cliente no asigna');
reset role;

-- ---------- Asignar: copias independientes ----------
select tests.login('x');
select tests.throws(format($$select grasa.assign_template(%L, array[]::uuid[])$$, current_setting('t.tpl_pecho')), 'invalid', 'asignar a nadie se rechaza');
select tests.throws(format($$select grasa.assign_template(%L, array[%L, %L]::uuid[])$$, current_setting('t.tpl_pecho'), tests.uid('ana'), tests.uid('y')), 'forbidden', 'asignar a alguien que no es su asesorado: forbidden (y no se crea ninguna copia)');
select tests.ok(jsonb_array_length(grasa.list_client_routines(tests.uid('ana'))) = 1 and jsonb_array_length(grasa.list_client_routines(tests.uid('bea'))) = 0, 'todo o nada: no se creó ninguna copia');
select tests.ok(jsonb_array_length(grasa.assign_template(current_setting('t.tpl_pecho')::uuid, array[tests.uid('ana'), tests.uid('bea'), tests.uid('ana')])) = 2, 'asigna «Pecho» a Ana y a Bea (el repetido cuenta una vez): 2 copias');
select tests.ok(jsonb_array_length(grasa.list_client_routines(tests.uid('ana'))) = 2, 'Ana tiene ahora VARIAS rutinas (la de antes y «Pecho»)');
select tests.ok((select bool_and((e ->> 'visible')::boolean) from jsonb_array_elements(grasa.list_client_routines(tests.uid('ana'))) e), 'por defecto, visibles');
select set_config('t.r_ana', (select e ->> 'id' from jsonb_array_elements(grasa.list_client_routines(tests.uid('ana'))) e where e ->> 'title' = 'Pecho'), true);
select set_config('t.r_bea', (select e ->> 'id' from jsonb_array_elements(grasa.list_client_routines(tests.uid('bea'))) e where e ->> 'title' = 'Pecho'), true);
select tests.ok(current_setting('t.r_ana') <> current_setting('t.r_bea') and current_setting('t.r_ana') <> current_setting('t.tpl_pecho'), 'cada copia tiene su propio id');
-- Editar la COPIA de Ana no cambia la de Bea ni la plantilla
select grasa.save_client_routine(tests.uid('ana'), current_setting('t.r_ana')::uuid, 'Pecho de Ana', '{"days":[{"title":"Día A","exercises":[{"name":"Flexiones","sets":"3 × 15"}]}]}'::jsonb);
select tests.ok((grasa.list_client_routines(tests.uid('bea')) -> 0 ->> 'title') = 'Pecho'
                and (grasa.list_client_routines(tests.uid('bea')) -> 0 -> 'content' -> 'days' -> 0 ->> 'title') = 'Día 1 – Pecho', 'editar la copia de Ana NO cambia la de Bea');
select tests.ok((select title from jsonb_to_recordset(grasa.list_templates()) as x(id uuid, title text) where id = current_setting('t.tpl_pecho')::uuid) = 'Pecho', '... ni la plantilla');
-- Editar la PLANTILLA no cambia las copias ya asignadas
select grasa.save_template(current_setting('t.tpl_pecho')::uuid, 'Pecho v2', '{"days":[{"title":"Nuevo","exercises":[]}]}'::jsonb);
select tests.ok((grasa.list_client_routines(tests.uid('bea')) -> 0 ->> 'title') = 'Pecho' and (grasa.list_client_routines(tests.uid('bea')) -> 0 -> 'content' -> 'days' -> 0 ->> 'title') = 'Día 1 – Pecho', 'editar la plantilla NO cambia la copia ya asignada');
select tests.throws(format($$select grasa.save_client_routine(%L, %L, 'T', %L::jsonb)$$, tests.uid('bea'), current_setting('t.r_ana'), '{"days":[{"title":"D","exercises":[]}]}'), 'not_found', 'no se edita la copia de Ana diciendo que es de Bea');
select tests.ok((grasa.save_client_routine(tests.uid('ana'), null, 'Hecha para Ana', '{"days":[{"title":"D","exercises":[]}]}'::jsonb) ->> 'title') = 'Hecha para Ana', 'el coach crea una rutina directamente para Ana');
select tests.ok(jsonb_array_length(grasa.list_client_routines(tests.uid('ana'))) = 3, 'Ana tiene 3 rutinas');
-- Borrar la plantilla no toca las copias
select grasa.delete_template(current_setting('t.tpl_pecho')::uuid);
select tests.ok(jsonb_array_length(grasa.list_templates()) = 1 and jsonb_array_length(grasa.list_client_routines(tests.uid('bea'))) = 1, 'borrar la plantilla no borra las copias asignadas');

-- ---------- Ocultar / mostrar ----------
select tests.ok((grasa.set_routine_visible(current_setting('t.r_ana')::uuid, false) ->> 'visible') = 'false', 'el coach oculta «Pecho de Ana»');
reset role; select tests.login('ana');
select tests.ok(jsonb_array_length(grasa.my_routines()) = 2 and not exists (select 1 from jsonb_array_elements(grasa.my_routines()) e where e ->> 'id' = current_setting('t.r_ana')), 'Ana ya no ve la oculta (ve las otras 2)');
select tests.ok(not exists (select 1 from jsonb_array_elements(grasa.my_routines()) e where e ->> 'title' = 'Pecho de Ana'), 'my_routines no devuelve la oculta (ni su contenido)');
reset role; select tests.login('bea');
select tests.ok(jsonb_array_length(grasa.my_routines()) = 1 and (grasa.my_routines() -> 0 ->> 'client_id') = tests.uid('bea')::text, 'Bea solo ve la suya (nunca las de Ana)');
reset role; select tests.login('x');
select tests.ok((grasa.set_routine_visible(current_setting('t.r_ana')::uuid, true) ->> 'visible') = 'true', 'el coach la vuelve a mostrar');
reset role; select tests.login('ana');
select tests.ok(jsonb_array_length(grasa.my_routines()) = 3, 'Ana vuelve a ver las 3');
select tests.ok(grasa.payment_blocked_me() and jsonb_array_length(grasa.my_routines()) = 3, 'con el acceso en pausa por pago, Ana sigue viendo sus rutinas (lectura)');
reset role; select tests.login('x');
select tests.throws($$select grasa.set_routine_visible('c0000000-0000-4000-8000-000000000001', null)$$, 'invalid', 'visible nulo rechazado');
-- v1.7: save_routine / get_routine / delete_routine / my_routine actúan sobre la PRIMERA rutina
select tests.ok((grasa.get_routine(tests.uid('ana')) ->> 'id') = 'c0000000-0000-4000-8000-000000000001', 'v1.7: get_routine devuelve la primera (la más antigua)');
select grasa.save_routine(tests.uid('ana'), 'Vieja editada', '{"days":[{"title":"D","exercises":[]}]}'::jsonb);
select tests.ok((select title from jsonb_to_recordset(grasa.list_client_routines(tests.uid('ana'))) as x(id uuid, title text) where id = 'c0000000-0000-4000-8000-000000000001') = 'Vieja editada'
                and jsonb_array_length(grasa.list_client_routines(tests.uid('ana'))) = 3, 'v1.7: save_routine edita la primera, no crea otra');
select grasa.set_routine_visible('c0000000-0000-4000-8000-000000000001', false);
reset role; select tests.login('ana');
select tests.ok((grasa.my_routine() ->> 'id') <> 'c0000000-0000-4000-8000-000000000001', 'v1.7: my_routine devuelve la primera VISIBLE');
reset role; select tests.login('x');
select grasa.set_routine_visible('c0000000-0000-4000-8000-000000000001', true);

-- ---------- Límites ----------
select grasa.save_client_routine(tests.uid('bea'), null, 'B' || g, '{"days":[{"title":"D","exercises":[]}]}'::jsonb) from generate_series(1, 18) g;
select tests.ok(jsonb_array_length(grasa.list_client_routines(tests.uid('bea'))) = 19, 'Bea llega a 19 rutinas');
select tests.ok(jsonb_array_length(grasa.assign_template(current_setting('t.tpl_pierna')::uuid, array[tests.uid('bea')])) = 1, 'la número 20 sí');
select tests.ok(jsonb_array_length(grasa.list_client_routines(tests.uid('bea'))) = 20, 'Bea tiene 20');
select tests.throws(format($$select grasa.assign_template(%L, array[%L]::uuid[])$$, current_setting('t.tpl_pierna'), tests.uid('bea')), 'routine_limit', 'la 21 por asignación se rechaza');
select tests.throws(format($$select grasa.save_client_routine(%L, null, 'Una más', '{"days":[{"title":"D","exercises":[]}]}'::jsonb)$$, tests.uid('bea')), 'routine_limit', 'la 21 creada directamente también');
select tests.throws(format($$select grasa.assign_template(%L, array[%L, %L]::uuid[])$$, current_setting('t.tpl_pierna'), tests.uid('ana'), tests.uid('bea')), 'routine_limit', 'todo o nada: si uno está lleno no se crea la copia de los demás');
select tests.ok(jsonb_array_length(grasa.list_client_routines(tests.uid('ana'))) = 3, '... (Ana sigue con 3)');
select grasa.save_template(null, 'P' || g, '{"days":[{"title":"D","exercises":[]}]}'::jsonb) from generate_series(1, 49) g;
select tests.ok(jsonb_array_length(grasa.list_templates()) = 50, 'el coach llega a 50 plantillas');
select tests.throws($$select grasa.save_template(null, 'La 51', '{"days":[{"title":"D","exercises":[]}]}'::jsonb)$$, 'template_limit', 'la 51 se rechaza');
select tests.ok((grasa.save_template(current_setting('t.tpl_pierna')::uuid, 'Piernas y glúteos', current_setting('t.pierna')::jsonb) ->> 'title') = 'Piernas y glúteos', 'con 50 plantillas todavía se pueden EDITAR');
-- Se limpian las de relleno (borrar siempre se puede)
select grasa.delete_template((e ->> 'id')::uuid) from jsonb_array_elements(grasa.list_templates()) e where e ->> 'title' ~ '^P[0-9]+$';
select tests.ok(jsonb_array_length(grasa.list_templates()) = 1, 'quedan solo «Piernas y glúteos»');
select grasa.delete_client_routine((e ->> 'id')::uuid) from jsonb_array_elements(grasa.list_client_routines(tests.uid('bea'))) e where e ->> 'title' ~ '^B[0-9]+$';
select tests.ok(jsonb_array_length(grasa.list_client_routines(tests.uid('bea'))) = 2, 'se limpian las de relleno de Bea (quedan 2)');

-- ---------- Rutina de hoy ----------
select tests.throws(format($$select grasa.publish_daily(%L, current_setting('t.today')::date + 3)$$, current_setting('t.tpl_pierna')), 'bad_day', 'un día fuera de hoy ± 2 se rechaza');
select tests.throws(format($$select grasa.publish_daily(%L, null)$$, current_setting('t.tpl_pierna')), 'bad_day', 'sin día se rechaza');
select tests.ok(grasa.get_daily() is null, 'todavía no hay rutina de hoy');
select tests.ok((grasa.publish_daily(current_setting('t.tpl_pierna')::uuid, current_setting('t.today')::date) ->> 'day') = current_setting('t.today')::date::text, 'el coach publica «Piernas y glúteos» como rutina de hoy');
reset role; select tests.login('ana');
select tests.ok((grasa.my_daily(current_setting('t.today')::date) ->> 'title') = 'Piernas y glúteos' and (grasa.my_daily(current_setting('t.today')::date) ->> 'coach_id') = tests.uid('x')::text, 'Ana la ve el día publicado');
select tests.ok(grasa.my_daily(current_setting('t.today')::date - 1) is null, 'si «hoy» del cliente es otro día (ayer), no se muestra');
select tests.ok(grasa.my_daily(current_setting('t.today')::date + 1) is null, '... ni si «hoy» del cliente ya es mañana (la de ayer no aparece hoy)');
select tests.ok(grasa.my_daily(null) is null, 'sin fecha, nada');
select tests.ok(grasa.payment_blocked_me() and grasa.my_daily(current_setting('t.today')::date) is not null, 'con el acceso en pausa por pago también la ve');
reset role; select tests.login('bea');
select tests.ok(grasa.my_daily(current_setting('t.today')::date) is not null, 'Bea (otra asesorada de X) también la ve, sin que se la asignen');
reset role; select tests.login('admin');
select tests.ok(grasa.my_daily(current_setting('t.today')::date) is null, 'alguien sin coach no ve nada');
reset role; select tests.login('y');
select grasa.publish_daily((grasa.save_template(null, 'Rutina de Y', '{"days":[{"title":"D","exercises":[]}]}'::jsonb) ->> 'id')::uuid, current_setting('t.today')::date);
reset role; select tests.login('ana');
select tests.ok((grasa.my_daily(current_setting('t.today')::date) ->> 'title') = 'Piernas y glúteos', 'Ana sigue viendo la de SU coach (la de Y no se mezcla)');
-- Cambiarla: reemplaza (una por coach)
reset role; select tests.login('x');
select set_config('t.tpl_hoy', (grasa.save_template(null, 'Pecho de hoy', current_setting('t.pecho')::jsonb) ->> 'id'), true);
select tests.ok((grasa.publish_daily(current_setting('t.tpl_hoy')::uuid, current_setting('t.today')::date) ->> 'title') = 'Pecho de hoy', 'cambiar la rutina de hoy la reemplaza');
reset role; select tests.login('ana');
select tests.ok((grasa.my_daily(current_setting('t.today')::date) ->> 'title') = 'Pecho de hoy', 'Ana ve la nueva');
-- La del día es una COPIA: editar la plantilla no la cambia
reset role; select tests.login('x');
select grasa.save_template(current_setting('t.tpl_hoy')::uuid, 'Otro nombre', '{"days":[{"title":"Otro","exercises":[]}]}'::jsonb);
select tests.ok((grasa.get_daily() ->> 'title') = 'Pecho de hoy' and (grasa.get_daily() -> 'content' -> 'days' -> 0 ->> 'title') = 'Día 1 – Pecho', 'editar la plantilla no cambia la rutina de hoy ya publicada');
select grasa.clear_daily();
select tests.ok(grasa.get_daily() is null, 'el coach quita la rutina de hoy');
reset role; select tests.login('ana');
select tests.ok(grasa.my_daily(current_setting('t.today')::date) is null, 'Ana ya no la ve');
reset role; select tests.login('x');
select tests.ok(grasa.publish_daily(current_setting('t.tpl_pierna')::uuid, current_setting('t.today')::date - 1) is not null, 'la fecha de ayer también se acepta (hoy ± 2: zonas horarias)');
reset role; select tests.login('ana');
select tests.ok(grasa.my_daily(current_setting('t.today')::date) is null and grasa.my_daily(current_setting('t.today')::date - 1) is not null, 'solo se ve cuando el «hoy» del cliente coincide con el día publicado');
reset role; select tests.login('x');

-- ---------- Un GIF en uso (plantilla, asignada o la de hoy) no se borra ----------
select grasa.register_gif('a0000000-0000-4000-8000-000000000003', 'Remo', 'image/gif', 1000, '474946383961010001000000');
select grasa.register_gif('a0000000-0000-4000-8000-000000000004', 'Dominadas', 'image/gif', 1000, '474946383961010001000000');
select set_config('t.remo', '{"days":[{"title":"D","exercises":[{"name":"Remo","sets":"3 × 10","gif":"a0000000-0000-4000-8000-000000000003"}]}]}', true);
select set_config('t.tpl_remo', (grasa.save_template(null, 'Con remo', current_setting('t.remo')::jsonb) ->> 'id'), true);
select tests.ok((select uses from grasa.my_gifs() where id = 'a0000000-0000-4000-8000-000000000003') = 1, 'my_gifs cuenta el uso en una plantilla');
select tests.throws($$select grasa.delete_gif('a0000000-0000-4000-8000-000000000003')$$, 'gif_in_use', 'un GIF usado solo por una plantilla no se borra');
select grasa.publish_daily(current_setting('t.tpl_remo')::uuid, current_setting('t.today')::date);
select grasa.delete_template(current_setting('t.tpl_remo')::uuid);
select tests.ok((select uses from grasa.my_gifs() where id = 'a0000000-0000-4000-8000-000000000003') = 1, 'sin la plantilla, la rutina de hoy (copia) lo sigue usando');
select tests.throws($$select grasa.delete_gif('a0000000-0000-4000-8000-000000000003')$$, 'gif_in_use', 'un GIF usado solo por la rutina de hoy no se borra');
select grasa.clear_daily();
select grasa.delete_gif('a0000000-0000-4000-8000-000000000003');
select tests.ok(not exists (select 1 from grasa.my_gifs() where id = 'a0000000-0000-4000-8000-000000000003'), 'sin ningún uso, se borra');
select grasa.save_client_routine(tests.uid('ana'), null, 'Con dominadas', '{"days":[{"title":"D","exercises":[{"name":"Dominadas","sets":"3 × 8","gif":"a0000000-0000-4000-8000-000000000004"}]}]}'::jsonb);
select tests.throws($$select grasa.delete_gif('a0000000-0000-4000-8000-000000000004')$$, 'gif_in_use', 'un GIF usado solo por una rutina asignada no se borra');
select tests.throws($$select grasa.delete_gif('a0000000-0000-4000-8000-000000000002')$$, 'gif_in_use', 'el GIF de «Piernas» (plantilla y copia de Bea) tampoco');
select grasa.publish_daily(current_setting('t.tpl_pierna')::uuid, current_setting('t.today')::date);

-- ---------- Sin acuerdo vigente ----------
reset role; select tests.consent('x', 'coach_agreement', false); select tests.login('x');
select tests.throws($$select grasa.list_templates()$$, 'coach_agreement_required', 'sin acuerdo: list_templates falla');
select tests.throws($$select grasa.save_template(null, 'T', '{"days":[{"title":"D","exercises":[]}]}'::jsonb)$$, 'coach_agreement_required', 'sin acuerdo: save_template falla');
select tests.throws(format($$select grasa.assign_template(%L, array[%L]::uuid[])$$, current_setting('t.tpl_pierna'), tests.uid('ana')), 'coach_agreement_required', 'sin acuerdo: assign_template falla');
select tests.throws(format($$select grasa.list_client_routines(%L)$$, tests.uid('ana')), 'coach_agreement_required', 'sin acuerdo: list_client_routines falla');
select tests.throws(format($$select grasa.publish_daily(%L, current_setting('t.today')::date)$$, current_setting('t.tpl_pierna')), 'coach_agreement_required', 'sin acuerdo: publish_daily falla');
select tests.throws($$select grasa.set_routine_visible('c0000000-0000-4000-8000-000000000001', true)$$, 'coach_agreement_required', 'sin acuerdo no se MUESTRA una rutina');
select tests.ok((grasa.set_routine_visible('c0000000-0000-4000-8000-000000000001', false) ->> 'visible') = 'false', '... pero sí se puede ocultar (reduce acceso)');
select grasa.clear_daily();
reset role; select tests.login('ana');
select tests.ok(grasa.my_daily(current_setting('t.today')::date) is null, 'y quitar la rutina de hoy tampoco exige acuerdo');
reset role; select tests.agree('x'); select tests.login('x');
select grasa.set_routine_visible('c0000000-0000-4000-8000-000000000001', true);

-- ---------- Sin vínculo activo ----------
reset role; select tests.login('bea');
select grasa.leave_coach();
select tests.ok(grasa.my_routines() = '[]'::jsonb and grasa.my_routine() is null, 'Bea se desvincula: ya no ve rutinas');
reset role; select tests.login('x');
select grasa.publish_daily(current_setting('t.tpl_pierna')::uuid, current_setting('t.today')::date);
reset role; select tests.login('bea');
select tests.ok(grasa.my_daily(current_setting('t.today')::date) is null, '... ni la rutina de hoy');
reset role; select tests.login('x');
select tests.throws(format($$select grasa.list_client_routines(%L)$$, tests.uid('bea')), 'forbidden', 'el coach ya no ve las rutinas de quien se fue');
select tests.throws(format($$select grasa.assign_template(%L, array[%L]::uuid[])$$, current_setting('t.tpl_pierna'), tests.uid('bea')), 'forbidden', '... ni le asigna');
select tests.throws(format($$select grasa.save_client_routine(%L, null, 'T', '{"days":[{"title":"D","exercises":[]}]}'::jsonb)$$, tests.uid('bea')), 'forbidden', '... ni le crea');
select tests.throws(format($$select grasa.set_routine_visible(%L, true)$$, current_setting('t.r_bea')), 'forbidden', '... ni le muestra una rutina');

-- ---------- Baja de cuenta ----------
reset role; select tests.login('ana');
select core.delete_my_account();
reset role;
select tests.ok(not exists (select 1 from grasa.routines where client_id = tests.uid('ana')), 'la baja del cliente borra sus rutinas asignadas');
select tests.ok(exists (select 1 from grasa.routine_templates where coach_id = tests.uid('x')) and exists (select 1 from grasa.daily_routines where coach_id = tests.uid('x')), '... y no toca las plantillas ni la rutina de hoy de su coach');
select tests.login('x');
select core.delete_my_account();
reset role;
select tests.ok(not exists (select 1 from grasa.routine_templates where coach_id = tests.uid('x')) and not exists (select 1 from grasa.daily_routines where coach_id = tests.uid('x'))
                and not exists (select 1 from grasa.routines where coach_id = tests.uid('x')) and not exists (select 1 from grasa.exercise_gifs where coach_id = tests.uid('x')),
  'la baja del coach borra sus plantillas, su rutina de hoy, las rutinas que asignó y sus GIFs');

-- ---------- Seguridad ----------
select tests.ok(not has_function_privilege('authenticated', 'grasa.template_out(grasa.routine_templates)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.daily_out(grasa.daily_routines)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.check_routine_input(uuid, text, jsonb)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.require_coach_of(uuid)', 'execute')
                and not has_function_privilege('authenticated', 'grasa.require_active_coach()', 'execute')
                and not has_function_privilege('authenticated', 'grasa.gif_uses(uuid, uuid)', 'execute')
                and not has_function_privilege('anon', 'grasa.assign_template(uuid, uuid[])', 'execute')
                and has_function_privilege('authenticated', 'grasa.assign_template(uuid, uuid[])', 'execute'),
  'los ayudantes son internos; anon no ejecuta nada; authenticated solo las funciones de la persona en sesión');
select tests.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'grasa' and p.proname in ('save_template', 'list_templates', 'delete_template', 'assign_template', 'list_client_routines', 'save_client_routine',
    'delete_client_routine', 'set_routine_visible', 'publish_daily', 'get_daily', 'clear_daily', 'my_routines', 'my_daily')
    and (not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false))), 'las funciones nuevas son SECURITY DEFINER con search_path fijo');
select tests.ok(not has_table_privilege('authenticated', 'grasa.routine_templates', 'select') and not has_table_privilege('authenticated', 'grasa.daily_routines', 'select')
                and not has_table_privilege('authenticated', 'grasa.routines', 'update'), 'las tablas no tienen permisos directos');
rollback;
