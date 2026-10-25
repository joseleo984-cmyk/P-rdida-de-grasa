-- Estructura y aislamiento básico (contrato §2.5.1 y "anónimo no ve nada").
begin;

-- 1. Ninguna tabla de core ni grasa sin RLS.
select tests.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'grasa') and c.relkind in ('r', 'p') and not c.relrowsecurity),
  'todas las tablas de core y grasa tienen RLS activada');
select tests.ok((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname in ('core', 'grasa') and c.relkind = 'r') = 23, 'hay 23 tablas (6 core + 17 grasa; v1.11: health_answers, link_pauses, challenges, challenge_members, challenge_marks; v1.12: pain_reports)');

-- 2. Las funciones SECURITY DEFINER fijan search_path (sin secuestro por esquemas del usuario).
select tests.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('core', 'grasa') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  'todas las funciones SECURITY DEFINER tienen search_path fijo');

-- 3. anon no puede ejecutar ninguna función de core/grasa ni leer tablas.
select tests.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('core', 'grasa') and has_function_privilege('anon', p.oid, 'execute')),
  'anon no puede ejecutar funciones de core ni grasa');
select tests.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'grasa') and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'select')),
  'anon no tiene SELECT sobre ninguna tabla de core ni grasa');
select tests.ok(not has_table_privilege('authenticated', 'grasa.invite_attempts', 'select'),
  'nadie lee invite_attempts por la API');
select tests.ok(not has_table_privilege('authenticated', 'core.consent_events', 'update')
                and not has_table_privilege('authenticated', 'core.consent_events', 'delete'),
  'authenticated no tiene UPDATE ni DELETE sobre consent_events');
select tests.ok(not has_table_privilege('authenticated', 'grasa.records', 'delete'),
  'sin DELETE en records (se borra con lápida o con la baja)');

select tests.login('anon');
select tests.throws($$select count(*) from grasa.records$$, 'permission denied', 'anon: SELECT en grasa.records → permiso denegado');
select tests.throws($$select count(*) from core.profiles$$, 'permission denied', 'anon: SELECT en core.profiles → permiso denegado');
select tests.throws($$select grasa.preview_invite_code('ABCDEF')$$, 'permission denied', 'anon: no puede probar códigos');
select tests.throws($$select core.join_app('grasa')$$, 'permission denied', 'anon: no puede darse de alta en la app');
reset role;

-- 4. Perfil creado por el trigger al registrarse, con el nombre de los metadatos.
select tests.ok((select display_name from core.profiles where id = tests.uid('ana')) = 'Ana',
  'el registro en auth.users crea core.profiles con display_name');
select tests.ok(exists (select 1 from storage.buckets where id = 'grasa-photos' and not public),
  'bucket grasa-photos existe y es privado');
select tests.ok(exists (select 1 from storage.buckets where id = 'ejercicios' and not public and file_size_limit = 10485760
                        and allowed_mime_types = array['image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']),
  'bucket ejercicios existe, es privado, de 10 MB y gif/webp/mp4/mov/webm (v1.9)');

rollback;
