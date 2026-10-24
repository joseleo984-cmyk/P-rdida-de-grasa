-- R1 v1.10 · «App para coaches», textos legales del 24/10/2026: BITÁCORA «Quién vio mis fotos». Aditiva e idempotente. UNA sola migración en vuelo.
--   B1  grasa.my_photo_views(p_limit): el CLIENTE lee las últimas veces (máx. 100) que su coach abrió una de sus fotos: cuándo, qué foto (fecha y pose) y el
--       nombre comercial del coach. El texto aprobado de A6b promete «una bitácora de visualización disponible en mi perfil»; esta función la hace posible.
--   Por qué una función y no un SELECT directo: la política photo_views_client ya deja leer SUS filas, pero el nombre del coach (grasa.coaches) y los datos de
--   la foto no se leen por RLS si el vínculo terminó. La función solo devuelve filas con client_id = quien llama (auth.uid()), nunca de otra persona.
-- Las peticiones de medidas (peso, abdomen y cadera obligatorios en el formulario nuevo) NO necesitan SQL: viajan dentro de `data` (jsonb) del registro `entry`.
-- Tablas, RLS, coach_photo_opened y todo lo demás quedan igual.

create or replace function grasa.my_photo_views(p_limit int default 100)
returns table (id uuid, viewed_at timestamptz, photo_id uuid, photo_date date, pose text, coach_name text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := grasa.require_uid();
begin
  return query
    select v.id, v.viewed_at, v.photo_id, p.date, p.pose, c.business_name
      from grasa.photo_views v
      left join grasa.photos p on p.id = v.photo_id
      left join grasa.coaches c on c.user_id = v.coach_id
     where v.client_id = uid
     order by v.viewed_at desc, v.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 100);
end $$;

-- Mismos permisos que el resto de funciones del cliente: ni público ni anónimo; sí authenticated.
revoke execute on function grasa.my_photo_views(int) from public, anon, authenticated, service_role;
grant execute on function grasa.my_photo_views(int) to authenticated;
