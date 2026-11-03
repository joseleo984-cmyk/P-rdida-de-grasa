-- R1 v1.23 · Avisos push etapa 2: recordatorio diario a la hora que elige la persona (hora de Colombia).
-- Un programador (pg_cron, se activa aparte, ver equipo/handoffs/push-etapa2.md) llama cada 5 minutos a `grasa.push_daily_tick()`, que mete un aviso
-- `reminder` en la cola a quien lo activó cuando llega su hora (una vez al día, ventana de 2 horas). El resto del camino es el de siempre: el webhook
-- de grasa.push_outbox llama a `push-enviar`. El aviso NO lleva contenido: la frase fija vive en sw.js.

alter table grasa.push_prefs add column if not exists reminder boolean not null default false;
alter table grasa.push_prefs add column if not exists reminder_at time not null default '20:00';
alter table grasa.push_prefs add column if not exists reminder_last date null;
alter table grasa.push_outbox drop constraint if exists push_outbox_kind_check;
alter table grasa.push_outbox add constraint push_outbox_kind_check check (kind in ('coach_msg', 'routine', 'client_alert', 'reminder'));

create or replace function grasa.push_enqueue(p_user uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if not exists (select 1 from grasa.push_devices d where d.user_id = p_user) then return; end if;
  if not core.consent_is_granted(p_user, 'grasa', 'push') then return; end if;
  select case p_kind when 'coach_msg' then coalesce(p.coach_msgs, true) when 'routine' then coalesce(p.routines, true) when 'client_alert' then coalesce(p.alerts, true)
                     when 'reminder' then coalesce(p.reminder, false) else false end
    into allowed from (select 1) s left join grasa.push_prefs p on p.user_id = p_user;
  if not coalesce(allowed, false) then return; end if;
  if exists (select 1 from grasa.push_outbox o where o.user_id = p_user and o.kind = p_kind and o.sent_at is null) then return; end if;
  insert into grasa.push_outbox (user_id, kind) values (p_user, p_kind);
end $$;

drop function if exists grasa.push_set_prefs(boolean, boolean, boolean);
create or replace function grasa.push_set_prefs(p_coach_msgs boolean, p_routines boolean, p_alerts boolean default true, p_reminder boolean default false, p_reminder_at time default '20:00') returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  if p_coach_msgs is null or p_routines is null or p_alerts is null or p_reminder is null or p_reminder_at is null then raise exception 'invalid' using errcode = '22023'; end if;
  insert into grasa.push_prefs (user_id, coach_msgs, routines, alerts, reminder, reminder_at, updated_at) values (uid, p_coach_msgs, p_routines, p_alerts, p_reminder, p_reminder_at, now())
    on conflict (user_id) do update set coach_msgs = excluded.coach_msgs, routines = excluded.routines, alerts = excluded.alerts,
      reminder = excluded.reminder, reminder_at = excluded.reminder_at,
      -- si cambia la hora o se activa de nuevo, hoy puede volver a sonar
      reminder_last = case when excluded.reminder is distinct from grasa.push_prefs.reminder or excluded.reminder_at is distinct from grasa.push_prefs.reminder_at then null else grasa.push_prefs.reminder_last end,
      updated_at = now();
end $$;

create or replace function grasa.push_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); p grasa.push_prefs;
begin
  select x.* into p from grasa.push_prefs x where x.user_id = uid;
  return jsonb_build_object(
    'consent', core.consent_is_granted(uid, 'grasa', 'push'),
    'devices', (select count(*) from grasa.push_devices d where d.user_id = uid),
    'coach_msgs', coalesce(p.coach_msgs, true), 'routines', coalesce(p.routines, true), 'alerts', coalesce(p.alerts, true),
    'reminder', coalesce(p.reminder, false), 'reminder_at', to_char(coalesce(p.reminder_at, time '20:00'), 'HH24:MI'));
end $$;

-- Lo llama el programador cada 5 minutos. Devuelve cuántos recordatorios puso en la cola.
create or replace function grasa.push_daily_tick() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; today date := grasa.today_bogota();
        now_min integer := extract(hour from (now() at time zone 'America/Bogota'))::int * 60 + extract(minute from (now() at time zone 'America/Bogota'))::int;
begin
  for r in select p.user_id, p.reminder_at from grasa.push_prefs p
           where p.reminder and (p.reminder_last is null or p.reminder_last < today) loop
    if now_min - (extract(hour from r.reminder_at)::int * 60 + extract(minute from r.reminder_at)::int) between 0 and 120 then
      update grasa.push_prefs x set reminder_last = today where x.user_id = r.user_id;
      perform grasa.push_enqueue(r.user_id, 'reminder');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function grasa.push_enqueue(uuid, text), grasa.push_set_prefs(boolean, boolean, boolean, boolean, time), grasa.push_state(), grasa.push_daily_tick()
  from public, anon, authenticated, service_role;
grant execute on function grasa.push_set_prefs(boolean, boolean, boolean, boolean, time), grasa.push_state() to authenticated;
