-- R1 v1.16 · Liga semanal de constancia (función 5 del piloto; concepto jurídico 7, puntos 3, 4, 11 y 12). Aditiva e idempotente, encima de v1.15.
--   L1  Opt-in reforzado, APAGADO por defecto: coach_links.liga_opt_in + liga_alias. Entrar exige, en el servidor: vínculo activo, coach activo con
--       la versión del acuerdo que trae la cláusula de ligas (0.6-A7-coach), A3 + A4 + «mayor de edad» vigentes, el consentimiento `liga`
--       (casilla literal del concepto 7, registrado por la app con la huella del texto), hábitos y comidas compartidos (los puntos salen de ellos)
--       y pago al día. Sin eso, la persona sigue con el 100 % de su asesoría.
--   L2  Alias de CATÁLOGO CERRADO (24 nombres neutrales), único dentro del team de un coach. Nunca nombres libres. Se asigna al unirse y se libera
--       al salir. El coach NO tiene función alguna que muestre quién es cada alias (cláusula de ligas, punto 8 del concepto).
--   L3  Mínimo 5 participantes: con 4 o menos NO se publica tabla ni puntajes (ni siquiera a los participantes), solo el aviso literal.
--   L4  Tabla semanal: lunes a domingo (Bogotá), SOLO alias y puntos de constancia (los que calcula el servidor; nunca peso, medidas, kcal ni fotos),
--       tope 80 a la semana. Sin histórico: no existe ninguna tabla ni función de semanas pasadas; cada lunes arranca de cero.
--   L5  Menores de 18: la app solo admite mayores de edad (consentimiento `adult` obligatorio); además la unión lo vuelve a exigir.
--   L6  Salir: apaga el interruptor y borra el alias; desaparece de la tabla activa al instante. Quien deja de estar vinculado, en pausa o sin
--       consentimiento vigente deja de contar y de verse sin que nadie tenga que hacer nada.
-- Pruebas: supabase/tests/200_liga.test.sql. Contrato: equipo/r1-contrato.md §25.

-- ============ L0: tipo de consentimiento `liga` ============
alter table core.consent_events drop constraint if exists consent_events_kind_check;
alter table core.consent_events add constraint consent_events_kind_check check (kind in (
  'terms', 'privacy', 'adult', 'sensitive_health', 'cloud_transfer', 'photos_cloud', 'photo_view_coach', 'coach_agreement',
  'share_body', 'share_notes', 'share_nutrition', 'share_habits', 'share_photos', 'liga'));

alter table grasa.coach_links add column if not exists liga_opt_in boolean not null default false;
alter table grasa.coach_links add column if not exists liga_alias text null;

-- Versiones del acuerdo del coach que traen la cláusula de ligas (las mismas que CT.A7_LIGA_VERSIONS en consent-texts-solo.js). INTERNA.
create or replace function grasa.liga_agreement_versions() returns text[]
language sql immutable set search_path = '' as $$ select array['0.6-A7-coach']::text[] $$;

create or replace function grasa.liga_agreement_of(p_coach uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when x.granted and x.version = any (grasa.liga_agreement_versions()) then x.version end
  from (select e.granted, e.version from core.consent_events e
        where e.user_id = p_coach and e.app_id = 'grasa' and e.kind = 'coach_agreement'
        order by e.created_at desc, e.client_at desc, e.id desc limit 1) x;
$$;

-- Catálogo cerrado de alias (concepto 7, punto 3). Mismo orden que LIGA_ALIASES en puntos.js / remote-fake.js. INTERNA.
create or replace function grasa.liga_aliases() returns text[]
language sql immutable set search_path = '' as $$
  select array['Halcón', 'Titán', 'Roble', 'Fénix', 'Cóndor', 'Jaguar', 'Delfín', 'Lince', 'Pino', 'Cedro', 'Águila', 'Lobo',
               'Puma', 'Ceiba', 'Colibrí', 'Roca', 'Río', 'Volcán', 'Nevado', 'Ámbar', 'Trueno', 'Coral', 'Bosque', 'Montaña']::text[]
$$;

-- ¿Cuenta HOY esta persona en la liga de su coach? (opt-in + todo lo que el opt-in exige, vigente). INTERNA.
create or replace function grasa.liga_active(p_link grasa.coach_links) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_link.status = 'active' and p_link.liga_opt_in and p_link.liga_alias is not null
    and exists (select 1 from grasa.coaches c where c.user_id = p_link.coach_id and c.active)
    and grasa.liga_agreement_of(p_link.coach_id) is not null
    and p_link.share_habits and p_link.share_nutrition
    and core.consent_is_granted(p_link.client_id, 'grasa', 'sensitive_health') and core.consent_is_granted(p_link.client_id, 'grasa', 'cloud_transfer')
    and core.consent_is_granted(p_link.client_id, 'grasa', 'adult') and core.consent_is_granted(p_link.client_id, 'grasa', 'liga')
    and not grasa.client_payment_blocked(p_link.client_id)
$$;

-- ============ L1: unirse ============
create or replace function grasa.liga_join() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; used text[]; pick text; cat text[] := grasa.liga_aliases(); start int; i int;
begin
  select x.* into l from grasa.coach_links x where x.client_id = uid and x.status = 'active' limit 1 for update;
  if not found then raise exception 'not_found' using errcode = 'P0002', detail = 'sin coach'; end if;
  if not exists (select 1 from grasa.coaches c where c.user_id = l.coach_id and c.active) or grasa.liga_agreement_of(l.coach_id) is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'liga_not_enabled';
  end if;
  if not (core.consent_is_granted(uid, 'grasa', 'sensitive_health') and core.consent_is_granted(uid, 'grasa', 'cloud_transfer')
          and core.consent_is_granted(uid, 'grasa', 'adult')) then
    raise exception 'forbidden' using errcode = '42501', detail = 'consent_required';
  end if;
  if not core.consent_is_granted(uid, 'grasa', 'liga') then raise exception 'forbidden' using errcode = '42501', detail = 'liga_consent_required'; end if;
  if not (l.share_habits and l.share_nutrition) then raise exception 'forbidden' using errcode = '42501', detail = 'liga_requires_habits'; end if;
  if grasa.client_payment_blocked(uid) then raise exception 'forbidden' using errcode = '42501', detail = 'paused'; end if;
  if l.liga_alias is null then
    select coalesce(array_agg(k.liga_alias), '{}') into used from grasa.coach_links k
      where k.coach_id = l.coach_id and k.status = 'active' and k.liga_alias is not null;
    start := abs(hashtext(uid::text)) % cardinality(cat);
    for i in 0 .. cardinality(cat) - 1 loop
      pick := cat[1 + (start + i) % cardinality(cat)];
      exit when not pick = any (used);
      pick := null;
    end loop;
    if pick is null then raise exception 'invalid' using errcode = '22023', detail = 'liga_full'; end if;
  else pick := l.liga_alias; end if;
  update grasa.coach_links set liga_opt_in = true, liga_alias = pick, updated_at = now() where id = l.id;
  return grasa.my_liga();
end $$;

-- ============ L6: salir (reduce: solo exige ser la persona en sesión) ============
create or replace function grasa.liga_leave() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  update grasa.coach_links set liga_opt_in = false, liga_alias = null, updated_at = now() where client_id = uid and status = 'active';
  return grasa.my_liga();
end $$;

-- ============ L3 + L4: mi liga ============
-- Siempre devuelve el estado (enabled, opted_in, alias). La TABLA solo existe para quien participa Y hay 5 o más participantes; si no, null.
create or replace function grasa.my_liga() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid(); l grasa.coach_links; wk date := grasa.week_monday(grasa.today_bogota()); n int; tbl jsonb; mine boolean; coach_ok boolean;
begin
  select x.* into l from grasa.coach_links x where x.client_id = uid and x.status = 'active' limit 1;
  if not found then return jsonb_build_object('enabled', false, 'opted_in', false, 'alias', null, 'min', 5, 'published', false, 'table', null); end if;
  coach_ok := exists (select 1 from grasa.coaches c where c.user_id = l.coach_id and c.active) and grasa.liga_agreement_of(l.coach_id) is not null;
  mine := coach_ok and grasa.liga_active(l);
  select count(*) into n from grasa.coach_links k where k.coach_id = l.coach_id and coach_ok and grasa.liga_active(k);
  if mine and n >= 5 then
    select jsonb_agg(jsonb_build_object('alias', t.alias, 'points', t.pts, 'me', t.me) order by t.pts desc, t.alias) into tbl
    from (select k.liga_alias as alias, least(80, grasa.points_sum(k.client_id, wk, wk + 6)) as pts, (k.client_id = uid) as me
          from grasa.coach_links k where k.coach_id = l.coach_id and grasa.liga_active(k)) t;
  end if;
  return jsonb_build_object('enabled', coach_ok, 'opted_in', mine, 'alias', case when mine then l.liga_alias end,
    'week_start', wk, 'week_end', wk + 6, 'min', 5,
    'participants', case when mine then n end, 'published', mine and n >= 5, 'table', tbl);
end $$;

-- El coach: SOLO si la liga está habilitada para su team y cuántos participan (con menos de 5, ni el número). Nunca alias ni personas.
create or replace function grasa.coach_liga() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_active_coach(); n int; ok boolean := grasa.liga_agreement_of(uid) is not null;
begin
  select count(*) into n from grasa.coach_links k where k.coach_id = uid and ok and grasa.liga_active(k);
  return jsonb_build_object('enabled', ok, 'min', 5, 'published', n >= 5, 'participants', case when n >= 5 then n end);
end $$;

revoke execute on function grasa.liga_agreement_versions(), grasa.liga_agreement_of(uuid), grasa.liga_aliases(), grasa.liga_active(grasa.coach_links),
  grasa.liga_join(), grasa.liga_leave(), grasa.my_liga(), grasa.coach_liga() from public, anon, authenticated, service_role;
grant execute on function grasa.liga_join(), grasa.liga_leave(), grasa.my_liga(), grasa.coach_liga() to authenticated;
