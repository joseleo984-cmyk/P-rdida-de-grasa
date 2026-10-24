-- R1 v1.11 · «App para coaches», UX Etapa 2: pregunta de salud (L4), meta de proteína del coach (L5), retos del coach y modo autónomo en pausa (P1).
-- Aditiva e idempotente: se aplica encima de v1.10. UNA sola migración en vuelo.
--   H1  grasa.health_answers: respuesta del ASESORADO a las dos preguntas de salud (L4 y la de embarazo, lactancia o posparto, concepto 3).
--       Una fila por (persona, pregunta): 'yes' | 'no' | 'skip' (Prefiero no responder), con la versión y el hash del bloque de texto que vio.
--       RLS: solo la dueña o el dueño la lee y la escribe (por la API de tablas o con grasa.set_health_answer, SECURITY INVOKER). Nunca se guarda
--       el diagnóstico ni ningún detalle. Escribirla exige A3 + A4 vigentes (es un dato de salud que va a la nube).
--       El coach NO tiene ninguna política sobre la tabla: solo recibe dos booleanos en coach_clients() (health_restriction, pregnancy_state),
--       y solo si la respuesta es 'yes', el vínculo está activo y el asesorado mantiene A3 + A4.
--   H2  grasa.coach_links.protein_goal_g: meta orientativa de proteína (g/día) que ESCRIBE EL COACH (set_protein_goal). La plataforma no la calcula
--       ni la sugiere: sin meta del coach queda null. El asesorado la lee en my_link().
--   H3  Retos del coach: grasa.challenges (título, hábito de proceso, días meta, fechas), grasa.challenge_members (a quién se asigna) y
--       grasa.challenge_marks (los días que el asesorado marca «lo cumplí»). Solo por funciones SECURITY DEFINER. Sin premios ni ranking:
--       el coach ve el avance de cada asesorado suyo; el asesorado solo ve el suyo.
--   H4  P1 · modo autónomo en pausa. Con el vínculo activo y vencido, sync_push ACEPTA hábitos (kind 'habit') y nada más (medidas, comidas,
--       perfil, biblioteca y fotos siguen con payment_required). Todo registro escrito mientras la persona está en pausa queda marcado
--       grasa.records.pause_private = true por un disparador (no lo decide el cliente y no se puede desmarcar: una vez privado, privado para siempre).
--       coach_pull y coach_clients (última actividad) NUNCA devuelven filas privadas, ni durante la pausa ni después de reactivar. Lo mismo para
--       las marcas de retos hechas en pausa.
--   H5  grasa.link_pauses: periodos de pausa ya cerrados de cada vínculo (los registra set_client_payment al pasar de vencido a pagado). my_link() y
--       coach_clients() devuelven `pauses` (cerrados + el actual si sigue en pausa) para CONGELAR la constancia en esos días.
-- Fuera de alcance (Etapa 3, sin activar): alertas L6, finalidad L6d, cláusulas 7.3/7.4 y política v1.1.

-- ============ H1: respuestas de salud ============
create table if not exists grasa.health_answers (
  user_id     uuid not null references auth.users(id) on delete cascade,
  question    text not null check (question in ('condition', 'pregnancy')),
  answer      text not null check (answer in ('yes', 'no', 'skip')),
  version     text not null check (char_length(version) between 1 and 20),
  text_hash   text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  answered_at timestamptz not null default now(),
  primary key (user_id, question)
);
alter table grasa.health_answers enable row level security;
revoke all on grasa.health_answers from public, anon, authenticated, service_role;
grant select, insert, update on grasa.health_answers to authenticated;
drop policy if exists health_owner_select on grasa.health_answers;
create policy health_owner_select on grasa.health_answers for select to authenticated using (user_id = auth.uid());
drop policy if exists health_owner_insert on grasa.health_answers;
create policy health_owner_insert on grasa.health_answers for insert to authenticated with check (user_id = auth.uid());
drop policy if exists health_owner_update on grasa.health_answers;
create policy health_owner_update on grasa.health_answers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- La escribe la persona en sesión (SECURITY INVOKER: pasa por la RLS de arriba). Exige A3 + A4. Devuelve la fila.
create or replace function grasa.set_health_answer(p_question text, p_answer text, p_version text, p_text_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r grasa.health_answers;
begin
  perform core.require_cloud_consent('grasa');
  if p_question not in ('condition', 'pregnancy') or p_answer not in ('yes', 'no', 'skip')
     or coalesce(p_version, '') = '' or char_length(p_version) > 20 or coalesce(p_text_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  insert into grasa.health_answers as t (user_id, question, answer, version, text_hash, answered_at)
  values (uid, p_question, p_answer, p_version, p_text_hash, now())
  on conflict (user_id, question) do update
    set answer = excluded.answer, version = excluded.version, text_hash = excluded.text_hash, answered_at = excluded.answered_at
  returning * into r;
  return jsonb_build_object('question', r.question, 'answer', r.answer, 'version', r.version, 'answered_at', r.answered_at);
end $$;

-- Mis respuestas (para que la app sepa si ya respondió). SECURITY INVOKER: la RLS solo deja ver las propias.
create or replace function grasa.my_health() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('question', h.question, 'answer', h.answer, 'version', h.version, 'answered_at', h.answered_at)
                  order by h.question), '[]'::jsonb)
  from grasa.health_answers h where h.user_id = auth.uid();
$$;

-- ¿Ese cliente respondió «Sí» a esa pregunta? INTERNA (con un uuid libre permitiría sondear a otros): solo la usan las funciones del coach.
create or replace function grasa.health_flag(p_client uuid, p_question text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from grasa.health_answers h where h.user_id = p_client and h.question = p_question and h.answer = 'yes');
$$;

-- ============ H2: meta de proteína del coach ============
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'grasa' and table_name = 'coach_links' and column_name = 'protein_goal_g') then
    alter table grasa.coach_links add column protein_goal_g int null check (protein_goal_g between 20 and 400);
  end if;
end $$;

-- El coach (activo, con acuerdo y vínculo activo) fija o quita (null) la meta de ese asesorado. La app nunca propone el número.
create or replace function grasa.set_protein_goal(p_client uuid, p_grams int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_coach_of(p_client);
begin
  if p_grams is not null and p_grams not between 20 and 400 then raise exception 'invalid' using errcode = '22023', detail = 'la meta va de 20 a 400 g'; end if;
  update grasa.coach_links set protein_goal_g = p_grams, updated_at = now()
    where coach_id = uid and client_id = p_client and status = 'active';
  return jsonb_build_object('client_id', p_client, 'protein_goal_g', p_grams);
end $$;

-- ============ H4: registros privados de la pausa ============
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'grasa' and table_name = 'records' and column_name = 'pause_private') then
    alter table grasa.records add column pause_private boolean not null default false;
  end if;
end $$;

-- Lo marca el SERVIDOR: la fila queda privada si la dueña está en pausa al escribir (vínculo activo vencido) o si la fecha del registro cae dentro
-- de una pausa ya cerrada de su vínculo activo (lo anotado sin conexión durante la pausa y subido después de reactivar). Una fila privada no vuelve
-- a ser visible (ni aunque se edite después de reactivar: su contenido nació en la pausa). El cliente no puede desmarcarla ni por la API de tablas.
create or replace function grasa.mark_pause_private() returns trigger
language plpgsql security definer set search_path = '' as $$
declare now_private boolean := grasa.client_payment_blocked(new.user_id) or (new.date is not null and grasa.day_in_pause(new.user_id, new.date));
begin
  if tg_op = 'UPDATE' then new.pause_private := old.pause_private or now_private;
  else new.pause_private := now_private; end if;
  return new;
end $$;
drop trigger if exists records_pause_private on grasa.records;
create trigger records_pause_private before insert or update on grasa.records for each row execute function grasa.mark_pause_private();

-- sync_push: mismo cuerpo que en r1_pagos_coach; en pausa se aceptan SOLO hábitos (al menos uno) y nada de fotos.
create or replace function grasa.sync_push(p_records jsonb default '[]', p_photos jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := grasa.require_uid(); r jsonb; got uuid; rejected_r jsonb := '[]'; rejected_p jsonb := '[]';
begin
  perform core.require_cloud_consent('grasa');
  if jsonb_typeof(coalesce(p_records, '[]')) <> 'array' or jsonb_typeof(coalesce(p_photos, '[]')) <> 'array' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if grasa.payment_blocked_me() and (jsonb_array_length(coalesce(p_photos, '[]')) > 0 or jsonb_array_length(coalesce(p_records, '[]')) = 0
      or exists (select 1 from jsonb_array_elements(coalesce(p_records, '[]')) e where e ->> 'kind' is distinct from 'habit')) then
    perform grasa.require_payment();   -- P1: en pausa solo el registro autónomo de hábitos; lo demás sigue en payment_required
  end if;
  if jsonb_array_length(coalesce(p_records, '[]')) + jsonb_array_length(coalesce(p_photos, '[]')) > 500 then
    raise exception 'invalid' using errcode = '22023', detail = 'máximo 500 elementos por llamada';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_records, '[]')) loop
    got := null;
    insert into grasa.records as t (id, user_id, kind, nkey, date, data, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, r ->> 'kind', r ->> 'nkey', (r ->> 'date')::date,
            coalesce(r -> 'data', '{}'::jsonb), (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (user_id, kind, nkey) do update
      set data = excluded.data, date = excluded.date, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
         or (excluded.updated_at = t.updated_at and excluded.data::text > t.data::text)
    returning t.id into got;
    if got is null then   -- ganó la fila del servidor: se devuelve para que el cliente la fusione
      rejected_r := rejected_r || (select to_jsonb(t) - 'user_id' - 'pause_private' from grasa.records t
                                   where t.user_id = uid and t.kind = r ->> 'kind' and t.nkey = r ->> 'nkey');
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_photos, '[]')) loop
    got := null;
    insert into grasa.photos as t (id, user_id, date, pose, width, height, storage_path, shared_with_coach,
                                   created_at, updated_at, deleted_at)
    values ((r ->> 'id')::uuid, uid, (r ->> 'date')::date, r ->> 'pose', (r ->> 'width')::int, (r ->> 'height')::int,
            r ->> 'storage_path', coalesce((r ->> 'shared_with_coach')::boolean, false),
            (r ->> 'created_at')::timestamptz, (r ->> 'updated_at')::timestamptz, (r ->> 'deleted_at')::timestamptz)
    on conflict (id) do update
      set date = excluded.date, pose = excluded.pose, width = excluded.width, height = excluded.height,
          shared_with_coach = excluded.shared_with_coach, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      where excluded.updated_at > t.updated_at
    returning t.id into got;
    if got is null then
      rejected_p := rejected_p || (select to_jsonb(t) - 'user_id' from grasa.photos t where t.id = (r ->> 'id')::uuid);
    end if;
  end loop;
  return jsonb_build_object('server_now', now(), 'rejected', jsonb_build_object('records', rejected_r, 'photos', rejected_p));
end $$;

-- coach_pull: mismo cuerpo que en r1_consentimientos_servidor; NUNCA devuelve filas escritas en pausa (pause_private).
create or replace function grasa.coach_pull(p_client uuid, p_since timestamptz default '1970-01-01T00:00:00Z')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l grasa.coach_links; since timestamptz := coalesce(p_since, '1970-01-01T00:00:00Z') - interval '30 seconds';
  recs jsonb; phs jsonb; cms jsonb; cur timestamptz;
begin
  perform grasa.require_uid();
  perform grasa.require_coach_agreement();
  select * into l from grasa.coach_links
    where coach_id = auth.uid() and client_id = p_client and status = 'active';
  if not found or not grasa.coach_can_see(p_client, 'body') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'nkey', r.nkey, 'date', r.date,
           'data', case when r.deleted_at is not null then '{}'::jsonb
                        when not l.share_notes then r.data - 'note' else r.data end,   -- H6: en TODO kind
           'updated_at', r.updated_at, 'deleted_at', r.deleted_at, 'server_updated_at', r.server_updated_at)
           order by r.server_updated_at), '[]'::jsonb), max(r.server_updated_at)
    into recs, cur
    from grasa.records r
    where r.user_id = p_client and r.server_updated_at > since
      and not r.pause_private                                        -- P1: lo de la pausa nunca llega al coach
      and (r.kind in ('profile','entry')
           or (r.kind = 'food' and l.share_nutrition)
           or (r.kind = 'habit' and l.share_habits));              -- 'library' nunca
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'date', p.date, 'pose', p.pose, 'width', p.width,
           'height', p.height, 'storage_path', p.storage_path, 'created_at', p.created_at, 'updated_at', p.updated_at,
           'server_updated_at', p.server_updated_at) order by p.server_updated_at), '[]'::jsonb)
    into phs
    from grasa.photos p
    where l.share_photos and p.user_id = p_client and p.shared_with_coach and p.deleted_at is null
      and p.server_updated_at > since;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.server_updated_at), '[]'::jsonb) into cms
    from grasa.comments c where c.link_id = l.id and c.server_updated_at > since;
  return jsonb_build_object('records', recs, 'photos', phs, 'comments', cms,
                            'cursor', coalesce(cur, p_since), 'server_now', now());
end $$;

-- ============ H5: periodos de pausa ============
create table if not exists grasa.link_pauses (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references grasa.coach_links(id) on delete cascade,
  from_day   date not null,
  to_day     date not null,
  created_at timestamptz not null default now(),
  check (from_day <= to_day)
);
create index if not exists link_pauses_link on grasa.link_pauses (link_id, from_day);
alter table grasa.link_pauses enable row level security;
revoke all on grasa.link_pauses from public, anon, authenticated, service_role;

-- ¿Ese día cae dentro de una pausa cerrada del vínculo activo de esa persona? INTERNA.
create or replace function grasa.day_in_pause(p_user uuid, p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from grasa.link_pauses x join grasa.coach_links l on l.id = x.link_id
                 where l.client_id = p_user and l.status = 'active' and p_day between x.from_day and x.to_day);
$$;

-- Pausas de un vínculo: [{from, to}] cerradas y, si sigue vencido, la actual con to = null. INTERNA.
create or replace function grasa.link_pauses_json(p_link uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_agg(jsonb_build_object('from', x.from_day, 'to', x.to_day) order by x.from_day)
                   from grasa.link_pauses x where x.link_id = p_link), '[]'::jsonb)
      || coalesce((select jsonb_build_array(jsonb_build_object('from',
                     coalesce(l.paid_until + 1, (l.paid_marked_at at time zone 'America/Bogota')::date, (l.created_at at time zone 'America/Bogota')::date),
                     'to', null))
                   from grasa.coach_links l
                   where l.id = p_link and l.status = 'active' and (l.paid_until is null or l.paid_until < grasa.today_bogota())), '[]'::jsonb);
$$;

-- set_client_payment: mismo cuerpo que en r1_pagos_coach; si el vínculo estaba vencido y pasa a pagado, se guarda la pausa que termina (hasta ayer).
create or replace function grasa.set_client_payment(p_client uuid, p_paid_until date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; today date := grasa.today_bogota(); since date;
begin
  perform grasa.require_coach_agreement();
  if p_client is null then raise exception 'invalid' using errcode = '22023'; end if;
  select x.* into l from grasa.coach_links x
    join grasa.coaches c on c.user_id = x.coach_id and c.active
    where x.coach_id = uid and x.client_id = p_client and x.status = 'active'
    for update of x;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_paid_until is not null and (p_paid_until < today - 400 or p_paid_until > today + 400) then
    raise exception 'invalid' using errcode = '22023', detail = 'la fecha de pago está fuera de un rango razonable';
  end if;
  if (l.paid_until is null or l.paid_until < today) and p_paid_until is not null and p_paid_until >= today then
    since := coalesce(l.paid_until + 1, (l.paid_marked_at at time zone 'America/Bogota')::date, (l.created_at at time zone 'America/Bogota')::date);
    if since <= today - 1 then insert into grasa.link_pauses (link_id, from_day, to_day) values (l.id, since, today - 1); end if;
  end if;
  update grasa.coach_links set paid_until = p_paid_until, paid_marked_at = now(), updated_at = now() where id = l.id;
  return jsonb_build_object('client_id', p_client, 'paid_until', p_paid_until, 'paid_marked_at', now(),
    'paid', p_paid_until is not null and p_paid_until >= today,
    'days_left', case when p_paid_until is null then null else p_paid_until - today end);
end $$;

-- ============ coach_clients y my_link con lo nuevo (cambian las columnas: borrar y volver a crear) ============
drop function if exists grasa.coach_clients();
create function grasa.coach_clients()
returns table (client_id uuid, display_name text, link_id uuid, since timestamptz, shares jsonb,
               last_activity timestamptz, over_free_limit boolean,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int,
               protein_goal_g int, health_restriction boolean, pregnancy_state boolean, pauses jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform grasa.require_coach_agreement();
  return query
  select l.client_id, p.display_name, l.id, l.created_at,
         jsonb_build_object('body', l.share_body, 'notes', l.share_notes, 'nutrition', l.share_nutrition,
                            'habits', l.share_habits, 'photos', l.share_photos),
         (select max(r.server_updated_at) from grasa.records r
          where r.user_id = l.client_id and not r.pause_private
            and core.consent_is_granted(l.client_id, 'grasa', 'sensitive_health')
            and core.consent_is_granted(l.client_id, 'grasa', 'cloud_transfer')
            and (r.kind in ('profile','entry') or (r.kind = 'food' and l.share_nutrition) or (r.kind = 'habit' and l.share_habits))),
         row_number() over (order by l.created_at, l.id) > c.free_clients,
         l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end,
         l.protein_goal_g,
         grasa.coach_can_see(l.client_id, 'body') and grasa.health_flag(l.client_id, 'condition'),
         grasa.coach_can_see(l.client_id, 'body') and grasa.health_flag(l.client_id, 'pregnancy'),
         grasa.link_pauses_json(l.id)
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  left join core.profiles p on p.id = l.client_id
  where l.coach_id = auth.uid() and l.status = 'active'
  order by l.created_at;
end $$;

drop function if exists grasa.my_link();
create function grasa.my_link()
returns table (id uuid, coach_id uuid, business_name text, share_body boolean, share_notes boolean,
               share_nutrition boolean, share_habits boolean, share_photos boolean, since timestamptz,
               paid_until date, paid_marked_at timestamptz, paid boolean, days_left int,
               protein_goal_g int, pauses jsonb)
language sql stable security definer set search_path = '' as $$
  select l.id, l.coach_id, c.business_name, l.share_body, l.share_notes, l.share_nutrition, l.share_habits,
         l.share_photos, l.created_at, l.paid_until, l.paid_marked_at,
         (l.paid_until is not null and l.paid_until >= grasa.today_bogota()),
         case when l.paid_until is null then null else l.paid_until - grasa.today_bogota() end,
         l.protein_goal_g, grasa.link_pauses_json(l.id)
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  where l.client_id = auth.uid() and l.status = 'active'
  limit 1;
$$;

-- ============ H3: retos del coach ============
create table if not exists grasa.challenges (
  id          uuid primary key,
  coach_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 3 and 60),
  habit       text not null check (habit in ('water', 'steps', 'sleep', 'trained', 'foods')),
  target_days int  not null check (target_days between 1 and 31),
  start_day   date not null,
  end_day     date not null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz null,
  check (start_day <= end_day and end_day - start_day <= 30 and target_days <= end_day - start_day + 1)
);
create index if not exists challenges_coach on grasa.challenges (coach_id, end_day);
create table if not exists grasa.challenge_members (
  challenge_id uuid not null references grasa.challenges(id) on delete cascade,
  client_id    uuid not null references auth.users(id) on delete cascade,
  primary key (challenge_id, client_id)
);
create index if not exists challenge_members_client on grasa.challenge_members (client_id);
create table if not exists grasa.challenge_marks (
  challenge_id  uuid not null,
  client_id     uuid not null,
  day           date not null,
  pause_private boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (challenge_id, client_id, day),
  foreign key (challenge_id, client_id) references grasa.challenge_members(challenge_id, client_id) on delete cascade
);
alter table grasa.challenges enable row level security;
alter table grasa.challenge_members enable row level security;
alter table grasa.challenge_marks enable row level security;
revoke all on grasa.challenges, grasa.challenge_members, grasa.challenge_marks from public, anon, authenticated, service_role;

-- Salida de un reto. p_client: solo las marcas de esa persona (vista del asesorado, incluidas las de su pausa); null: todos los miembros sin
-- las marcas privadas de la pausa (vista del coach), con su nombre y cuántos días lleva. INTERNA.
create or replace function grasa.challenge_out(ch grasa.challenges, p_client uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', ch.id, 'coach_id', ch.coach_id, 'business_name', (select c.business_name from grasa.coaches c where c.user_id = ch.coach_id),
    'title', ch.title, 'habit', ch.habit, 'target_days', ch.target_days, 'start_day', ch.start_day, 'end_day', ch.end_day, 'created_at', ch.created_at,
    'marks', case when p_client is null then null else coalesce((select jsonb_agg(m.day order by m.day) from grasa.challenge_marks m
                   where m.challenge_id = ch.id and m.client_id = p_client), '[]'::jsonb) end,
    'members', case when p_client is not null then null else coalesce((select jsonb_agg(jsonb_build_object('client_id', mb.client_id,
                   'display_name', coalesce(pr.display_name, ''),
                   'done', (select count(*) from grasa.challenge_marks m where m.challenge_id = ch.id and m.client_id = mb.client_id and not m.pause_private))
                   order by pr.display_name, mb.client_id)
                 from grasa.challenge_members mb
                 join grasa.coach_links l on l.client_id = mb.client_id and l.coach_id = ch.coach_id and l.status = 'active'
                 left join core.profiles pr on pr.id = mb.client_id
                 where mb.challenge_id = ch.id), '[]'::jsonb) end);
$$;

-- El coach lanza un reto para 1 a 100 asesorados suyos (todos con vínculo activo). Todo o nada.
create or replace function grasa.create_challenge(p_id uuid, p_title text, p_habit text, p_target int, p_start date, p_end date, p_clients uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); c uuid; ch grasa.challenges; today date := grasa.today_bogota();
begin
  if p_id is null or p_title is null or char_length(trim(p_title)) not between 3 and 60 or p_habit not in ('water', 'steps', 'sleep', 'trained', 'foods')
     or p_target is null or p_start is null or p_end is null or p_start > p_end or p_end - p_start > 30 or p_target not between 1 and p_end - p_start + 1
     or p_start < today - 7 or p_start > today + 60 then
    raise exception 'invalid' using errcode = '22023', detail = 'reto no válido';
  end if;
  if p_clients is null or cardinality(p_clients) not between 1 and 100 or array_position(p_clients, null) is not null then
    raise exception 'invalid' using errcode = '22023', detail = 'elige entre 1 y 100 asesorados';
  end if;
  if (select count(*) from grasa.challenges x where x.coach_id = uid and x.deleted_at is null and x.end_day >= today) >= 20 then
    raise exception 'invalid' using errcode = '22023', detail = 'challenge_limit';
  end if;
  foreach c in array (select array_agg(distinct u.v) from unnest(p_clients) as u(v)) loop
    if not exists (select 1 from grasa.coach_links l where l.coach_id = uid and l.client_id = c and l.status = 'active') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end loop;
  insert into grasa.challenges (id, coach_id, title, habit, target_days, start_day, end_day)
  values (p_id, uid, trim(p_title), p_habit, p_target, p_start, p_end) returning * into ch;
  insert into grasa.challenge_members (challenge_id, client_id) select ch.id, u.v from (select distinct v from unnest(p_clients) as v) u;
  return grasa.challenge_out(ch, null);
end $$;

-- Retos del coach (no borrados, que terminaron hace 30 días o menos), del más reciente al más antiguo.
create or replace function grasa.list_challenges() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach();
begin
  return coalesce((select jsonb_agg(grasa.challenge_out(x, null) order by x.start_day desc, x.created_at desc)
                   from grasa.challenges x where x.coach_id = uid and x.deleted_at is null and x.end_day >= grasa.today_bogota() - 30), '[]'::jsonb);
end $$;

-- Quitar un reto (reduce acceso: no exige acuerdo vigente).
create or replace function grasa.delete_challenge(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  update grasa.challenges set deleted_at = coalesce(deleted_at, now()) where id = p_id and coach_id = uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- Mis retos (asesorado): de mi coach ACTIVO, no borrados, que terminaron hace 14 días o menos. Se ven aunque esté en pausa.
create or replace function grasa.my_challenges() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  return coalesce((select jsonb_agg(grasa.challenge_out(x, uid) order by x.start_day desc, x.created_at desc)
                   from grasa.challenges x
                   join grasa.challenge_members mb on mb.challenge_id = x.id and mb.client_id = uid
                   join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = uid and l.status = 'active'
                   join grasa.coaches c on c.user_id = x.coach_id and c.active
                   where x.deleted_at is null and x.end_day >= grasa.today_bogota() - 14), '[]'::jsonb);
end $$;

-- El asesorado marca (o desmarca) un día del reto. El día debe estar dentro del reto y no después de mañana (Bogotá: el teléfono puede ir
-- un día adelante). Exige A3 + A4. En pausa SÍ se puede (modo autónomo), y la marca queda privada (el coach no la cuenta, ni después).
create or replace function grasa.mark_challenge(p_id uuid, p_day date, p_done boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); ch grasa.challenges;
begin
  perform core.require_cloud_consent('grasa');
  select x.* into ch from grasa.challenges x
    join grasa.challenge_members mb on mb.challenge_id = x.id and mb.client_id = uid
    join grasa.coach_links l on l.coach_id = x.coach_id and l.client_id = uid and l.status = 'active'
    where x.id = p_id and x.deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_day is null or p_day < ch.start_day or p_day > ch.end_day or p_day > grasa.today_bogota() + 1 then
    raise exception 'invalid' using errcode = '22023', detail = 'día fuera del reto';
  end if;
  if coalesce(p_done, false) then
    insert into grasa.challenge_marks (challenge_id, client_id, day, pause_private)
    values (ch.id, uid, p_day, grasa.client_payment_blocked(uid) or grasa.day_in_pause(uid, p_day))
    on conflict (challenge_id, client_id, day) do update set pause_private = grasa.challenge_marks.pause_private or excluded.pause_private;
  else
    delete from grasa.challenge_marks m where m.challenge_id = ch.id and m.client_id = uid and m.day = p_day;
  end if;
  return grasa.challenge_out(ch, uid);
end $$;

-- ============ Permisos ============
-- Las funciones nuevas nacen sin permisos: se cierran todas y se conceden solo las que llama la persona en sesión (cada una comprueba quién es).
revoke execute on function grasa.set_health_answer(text, text, text, text), grasa.my_health(), grasa.health_flag(uuid, text),
  grasa.set_protein_goal(uuid, int), grasa.mark_pause_private(), grasa.day_in_pause(uuid, date), grasa.link_pauses_json(uuid), grasa.challenge_out(grasa.challenges, uuid),
  grasa.create_challenge(uuid, text, text, int, date, date, uuid[]), grasa.list_challenges(), grasa.delete_challenge(uuid),
  grasa.my_challenges(), grasa.mark_challenge(uuid, date, boolean), grasa.coach_clients(), grasa.my_link(),
  grasa.set_client_payment(uuid, date), grasa.sync_push(jsonb, jsonb), grasa.coach_pull(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function grasa.set_health_answer(text, text, text, text), grasa.my_health(), grasa.set_protein_goal(uuid, int),
  grasa.create_challenge(uuid, text, text, int, date, date, uuid[]), grasa.list_challenges(), grasa.delete_challenge(uuid),
  grasa.my_challenges(), grasa.mark_challenge(uuid, date, boolean), grasa.coach_clients(), grasa.my_link(),
  grasa.set_client_payment(uuid, date), grasa.sync_push(jsonb, jsonb), grasa.coach_pull(uuid, timestamptz)
  to authenticated;
