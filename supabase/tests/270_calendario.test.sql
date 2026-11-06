-- v1.24: calendario de clases. El coach programa días por adelantado; el asesorado ve SOLO la clase de hoy; sin lectura cruzada; al desvincularse no ve nada.
begin;
select set_config('t.today', grasa.today_bogota()::text, true);
select tests.agree('x'); select tests.agree('y'); select tests.cloud('ana'); select tests.cloud('bea');
select tests.login('x');
select set_config('t.code', (select invite_code from grasa.become_coach('Coach Cal')), true);
select set_config('t.tpl', (grasa.save_template(null, 'Pierna', '{"days":[{"title":"Día 1 – Pierna","exercises":[{"name":"Sentadilla","sets":"3×10"}]}]}'::jsonb)->>'id'), true);
select set_config('t.tpl2', (grasa.save_template(null, 'Torso', '{"days":[{"title":"Día 1 – Torso","exercises":[{"name":"Remo","sets":"3×10"}]}]}'::jsonb)->>'id'), true);
reset role; select tests.login('ana');
select grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')));
reset role; select tests.login('bea');
select grasa.join_coach(current_setting('t.code'), jsonb_build_object('body', true, 'version', '0.1', 'text_hash', tests.h('c')));

-- programar: hoy, mañana y dentro de una semana a Ana
reset role; select tests.login('x');
select tests.ok((grasa.schedule_set(tests.uid('ana'), array[current_setting('t.today')::date, current_setting('t.today')::date + 1, current_setting('t.today')::date + 7], current_setting('t.tpl')::uuid)->>'days')::int = 3, 'programa 3 días');
select grasa.schedule_set(tests.uid('ana'), array[current_setting('t.today')::date + 1], current_setting('t.tpl2')::uuid);
select tests.ok((select jsonb_array_length(grasa.coach_schedule(tests.uid('ana'), current_setting('t.today')::date, current_setting('t.today')::date + 30))) = 3, 'el coach ve lo programado (sin repetir días)');
select tests.ok((select grasa.coach_schedule(tests.uid('ana'), current_setting('t.today')::date, current_setting('t.today')::date + 30)->1->>'title') = 'Torso', 'programar otra vez el mismo día lo reemplaza');
select tests.ok(grasa.coach_schedule(tests.uid('ana'), current_setting('t.today')::date, current_setting('t.today')::date + 30)::text !~ 'Sentadilla|content', 'la lista del coach no trae el contenido de la rutina');
select tests.throws($$select grasa.schedule_set(tests.uid('ana'), array[current_setting('t.today')::date - 30], current_setting('t.tpl')::uuid)$$, 'invalid', 'no se programa en el pasado lejano');
select tests.throws($$select grasa.schedule_set(tests.uid('ana'), array[current_setting('t.today')::date + 400], current_setting('t.tpl')::uuid)$$, 'invalid', 'ni más allá de 120 días');
select tests.throws($$select grasa.schedule_set(tests.uid('ana'), array[]::date[], current_setting('t.tpl')::uuid)$$, 'invalid', 'sin días no hay nada que programar');
select tests.throws($$select grasa.schedule_set(tests.uid('ana'), array[current_setting('t.today')::date], gen_random_uuid())$$, 'not_found', 'la plantilla debe ser del coach');

-- el asesorado ve SOLO la de hoy
reset role; select tests.login('ana');
select tests.ok((grasa.my_daily(current_setting('t.today')::date)->>'title') = 'Pierna', 'Ana ve la clase de hoy');
select tests.ok((grasa.my_daily(current_setting('t.today')::date + 1)->>'title') = 'Torso', 'cada día trae la suya cuando llega');
select tests.ok(grasa.my_daily(current_setting('t.today')::date + 3) is null, 'un día sin clase no trae nada');
select tests.throws($$select grasa.coach_schedule(tests.uid('ana'), current_setting('t.today')::date, current_setting('t.today')::date + 30)$$, 'forbidden', 'el asesorado no puede listar el calendario');
select tests.throws($$select count(*) from grasa.class_schedule$$, 'permission denied', 'la tabla no se lee directo');

-- Bea no ve lo de Ana; otro coach no toca el calendario
reset role; select tests.login('bea');
select tests.ok(grasa.my_daily(current_setting('t.today')::date) is null, 'Bea no ve la clase de Ana');
reset role; select tests.login('y'); select grasa.become_coach('Coach Y Cal');
select tests.throws($$select grasa.schedule_set(tests.uid('ana'), array[current_setting('t.today')::date], gen_random_uuid())$$, 'forbidden', 'un coach sin vínculo no programa');
select tests.throws($$select grasa.coach_schedule(tests.uid('ana'), current_setting('t.today')::date, current_setting('t.today')::date + 5)$$, 'forbidden', 'ni lo lista');
select grasa.schedule_clear(tests.uid('ana'), array[current_setting('t.today')::date]);   -- no es suyo: no borra nada

-- quitar un día
reset role; select tests.login('x');
select tests.ok((select jsonb_array_length(grasa.coach_schedule(tests.uid('ana'), current_setting('t.today')::date, current_setting('t.today')::date + 30))) = 3, 'otro coach no borró nada');
select grasa.schedule_clear(tests.uid('ana'), array[current_setting('t.today')::date]);
select tests.ok((select jsonb_array_length(grasa.coach_schedule(tests.uid('ana'), current_setting('t.today')::date, current_setting('t.today')::date + 30))) = 2, 'el coach quita un día');

-- al desvincularse el asesorado deja de ver la clase y el coach deja de verlo
reset role; select tests.login('ana');
select grasa.leave_coach();
select tests.ok(grasa.my_daily(current_setting('t.today')::date + 1) is null, 'sin vínculo no hay clase programada');
reset role; select tests.login('x');
select tests.throws($$select grasa.coach_schedule(tests.uid('ana'), current_setting('t.today')::date, current_setting('t.today')::date + 5)$$, 'forbidden', 'el coach pierde el acceso al desvincularse');
rollback;
