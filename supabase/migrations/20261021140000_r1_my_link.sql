-- R1 · S3-3b: grasa.my_link() — vínculo activo del cliente CON el nombre comercial del coach. Idempotente.
-- Motivo: remote.client.myLink() / joinCoach() devuelven { businessName } (contrato §3.4), pero el cliente no puede
-- leer grasa.coaches (RLS coaches_own: solo su propia fila, y esa tabla lleva el código de invitación). Esta función
-- expone SOLO el nombre comercial del coach con el que el usuario tiene un vínculo activo, nada más.
create or replace function grasa.my_link()
returns table (id uuid, coach_id uuid, business_name text, share_body boolean, share_notes boolean,
               share_nutrition boolean, share_habits boolean, share_photos boolean, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, l.coach_id, c.business_name, l.share_body, l.share_notes, l.share_nutrition, l.share_habits,
         l.share_photos, l.created_at
  from grasa.coach_links l
  join grasa.coaches c on c.user_id = l.coach_id
  where l.client_id = auth.uid() and l.status = 'active'
  limit 1;
$$;

revoke execute on function grasa.my_link() from public, anon;
grant execute on function grasa.my_link() to authenticated;
