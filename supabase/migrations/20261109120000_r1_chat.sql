-- R1 v1.22 · Chat entre asesorado y coach (concepto jurídico 14, 2/11/2026).
-- Solo texto (1 a 1000 caracteres), solo con vínculo ACTIVO. Si el vínculo termina, el coach pierde el acceso de inmediato (el historial queda atado al
-- coach con quien se escribió: un coach nuevo no ve lo anterior). Se borra con la cuenta (en cascada). Máximo 30 mensajes por hora y por persona.
-- El coach necesita el Acuerdo del Coach 1.0 (cláusula 18) para leer o responder; el asesorado no vuelve a aceptar nada (el chat es parte del vínculo).
-- Avisos push neutros: al coach `client_alert` («Tienes un aviso de un asesorado»), al asesorado `coach_msg` («Tienes un mensaje nuevo de tu coach»). Sin contenido.

create or replace function grasa.liga_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.7-A7-coach', '0.8-A7-coach', '0.9-A7-coach', '1.0-A7-coach']::text[] $$;
create or replace function grasa.export_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.5-A7-coach', '0.6-A7-coach', '0.7-A7-coach', '0.8-A7-coach', '0.9-A7-coach', '1.0-A7-coach']::text[] $$;
create or replace function grasa.restrictions_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.9-A7-coach', '1.0-A7-coach']::text[] $$;
create or replace function grasa.chat_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['1.0-A7-coach']::text[] $$;

create or replace function grasa.chat_agreement_ok(p_coach uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select x.granted and x.version = any (grasa.chat_agreement_versions())
                   from (select e.granted, e.version from core.consent_events e
                         where e.user_id = p_coach and e.app_id = 'grasa' and e.kind = 'coach_agreement'
                         order by e.created_at desc, e.client_at desc, e.id desc limit 1) x), false)
$$;

create table if not exists grasa.chat_messages (
  id         uuid primary key,
  client_id  uuid not null references auth.users(id) on delete cascade,
  coach_id   uuid not null references auth.users(id) on delete cascade,
  sender     text not null check (sender in ('client', 'coach')),
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at    timestamptz null
);
create index if not exists chat_messages_pair on grasa.chat_messages (client_id, coach_id, created_at);
alter table grasa.chat_messages enable row level security;
revoke all on grasa.chat_messages from public, anon, authenticated, service_role;

create or replace function grasa.chat_out(m grasa.chat_messages, p_me uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'mine', (case m.sender when 'client' then m.client_id else m.coach_id end) = p_me,
    'body', m.body, 'createdAt', m.created_at, 'readAt', m.read_at)
$$;

-- Quién es la otra parte y quién soy yo: p_client null = soy el asesorado (mi coach es el del vínculo activo); con p_client = soy su coach.
create or replace function grasa.chat_parties(p_client uuid, out me uuid, out client uuid, out coach uuid, out sender text)
language plpgsql stable security definer set search_path = '' as $$
begin
  me := grasa.require_uid();
  if p_client is null then
    perform core.require_cloud_consent('grasa');
    select l.coach_id into coach from grasa.coach_links l where l.client_id = me and l.status = 'active';
    if coach is null then raise exception 'not_found' using errcode = 'P0002', detail = 'no_coach'; end if;
    client := me; sender := 'client';
  else
    me := grasa.require_coach_of(p_client);
    if not grasa.chat_agreement_ok(me) then raise exception 'forbidden' using errcode = '42501', detail = 'chat_agreement_required'; end if;
    client := p_client; coach := me; sender := 'coach';
  end if;
end $$;

create or replace function grasa.chat_send(p_id uuid, p_client uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p record; m grasa.chat_messages; t text := btrim(coalesce(p_body, ''));
begin
  select * into p from grasa.chat_parties(p_client);
  if p_id is null or char_length(t) not between 1 and 1000 then raise exception 'invalid' using errcode = '22023'; end if;
  select x.* into m from grasa.chat_messages x where x.id = p_id;
  if found then
    if (m.client_id, m.coach_id, m.sender) is distinct from (p.client, p.coach, p.sender) then raise exception 'forbidden' using errcode = '42501'; end if;
    return grasa.chat_out(m, p.me);
  end if;
  if (select count(*) from grasa.chat_messages x where x.client_id = p.client and x.coach_id = p.coach and x.sender = p.sender and x.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into grasa.chat_messages (id, client_id, coach_id, sender, body) values (p_id, p.client, p.coach, p.sender, t) returning * into m;
  if p.sender = 'client' then perform grasa.push_enqueue(p.coach, 'client_alert'); else perform grasa.push_enqueue(p.client, 'coach_msg'); end if;
  return grasa.chat_out(m, p.me);
end $$;

create or replace function grasa.chat_list(p_client uuid, p_since timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p record;
begin
  select * into p from grasa.chat_parties(p_client);
  return coalesce((select jsonb_agg(grasa.chat_out(x, p.me) order by x.created_at, x.id)
                   from (select y.* from grasa.chat_messages y
                         where y.client_id = p.client and y.coach_id = p.coach and (p_since is null or y.created_at > p_since)
                         order by y.created_at desc, y.id desc limit 200) x), '[]'::jsonb);
end $$;

create or replace function grasa.chat_mark_read(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select * into p from grasa.chat_parties(p_client);
  update grasa.chat_messages x set read_at = now()
    where x.client_id = p.client and x.coach_id = p.coach and x.sender <> p.sender and x.read_at is null;
end $$;

-- Mensajes sin leer: asesorado → [{ clientId: yo, n }]; coach → un renglón por asesorado con vínculo activo. Solo cuentas, nunca contenido.
create or replace function grasa.chat_unread() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('clientId', r.client_id, 'n', r.n))
    from (select l.client_id, (select count(*) from grasa.chat_messages x
                               where x.client_id = l.client_id and x.coach_id = l.coach_id and x.read_at is null
                                 and x.sender = case when l.client_id = uid then 'coach' else 'client' end) as n
          from grasa.coach_links l where l.status = 'active' and (l.client_id = uid or l.coach_id = uid)) r
    where r.n > 0), '[]'::jsonb);
end $$;

revoke execute on function grasa.liga_agreement_versions(), grasa.export_agreement_versions(), grasa.restrictions_agreement_versions(), grasa.chat_agreement_versions(),
  grasa.chat_agreement_ok(uuid), grasa.chat_out(grasa.chat_messages, uuid), grasa.chat_parties(uuid), grasa.chat_send(uuid, uuid, text),
  grasa.chat_list(uuid, timestamptz), grasa.chat_mark_read(uuid), grasa.chat_unread() from public, anon, authenticated, service_role;
grant execute on function grasa.chat_send(uuid, uuid, text), grasa.chat_list(uuid, timestamptz), grasa.chat_mark_read(uuid), grasa.chat_unread() to authenticated;
