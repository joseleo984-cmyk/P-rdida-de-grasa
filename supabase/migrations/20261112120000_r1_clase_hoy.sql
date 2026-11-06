-- R1 v1.25 · Aviso «Tienes clase hoy». Sin interruptor nuevo: lo recibe quien YA activó el recordatorio diario, a la hora que eligió. Si ese día tiene una clase
-- programada por su coach (calendario v1.24) con vínculo activo, el aviso de esa hora es `class_today` en lugar de `reminder` (uno solo, nunca dos).
-- Como siempre, el aviso no lleva contenido: la frase fija vive en sw.js.

alter table grasa.push_outbox drop constraint if exists push_outbox_kind_check;
alter table grasa.push_outbox add constraint push_outbox_kind_check check (kind in ('coach_msg', 'routine', 'client_alert', 'reminder', 'class_today'));

create or replace function grasa.push_enqueue(p_user uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if not exists (select 1 from grasa.push_devices d where d.user_id = p_user) then return; end if;
  if not core.consent_is_granted(p_user, 'grasa', 'push') then return; end if;
  select case p_kind when 'coach_msg' then coalesce(p.coach_msgs, true) when 'routine' then coalesce(p.routines, true) when 'client_alert' then coalesce(p.alerts, true)
                     when 'reminder' then coalesce(p.reminder, false) when 'class_today' then coalesce(p.reminder, false) else false end
    into allowed from (select 1) s left join grasa.push_prefs p on p.user_id = p_user;
  if not coalesce(allowed, false) then return; end if;
  if exists (select 1 from grasa.push_outbox o where o.user_id = p_user and o.kind = p_kind and o.sent_at is null) then return; end if;
  insert into grasa.push_outbox (user_id, kind) values (p_user, p_kind);
end $$;

create or replace function grasa.push_daily_tick() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; today date := grasa.today_bogota(); has_class boolean;
        now_min integer := extract(hour from (now() at time zone 'America/Bogota'))::int * 60 + extract(minute from (now() at time zone 'America/Bogota'))::int;
begin
  for r in select p.user_id, p.reminder_at from grasa.push_prefs p
           where p.reminder and (p.reminder_last is null or p.reminder_last < today) loop
    if now_min - (extract(hour from r.reminder_at)::int * 60 + extract(minute from r.reminder_at)::int) between 0 and 120 then
      update grasa.push_prefs x set reminder_last = today where x.user_id = r.user_id;
      select exists (select 1 from grasa.class_schedule s
                     join grasa.coach_links l on l.coach_id = s.coach_id and l.client_id = s.client_id and l.status = 'active'
                     join grasa.coaches c on c.user_id = s.coach_id and c.active
                     where s.client_id = r.user_id and s.day = today) into has_class;
      perform grasa.push_enqueue(r.user_id, case when has_class then 'class_today' else 'reminder' end);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function grasa.push_enqueue(uuid, text), grasa.push_daily_tick() from public, anon, authenticated, service_role;

select 'OK clase hoy v1.25';
