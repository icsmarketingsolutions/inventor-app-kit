begin;

create extension if not exists pgtap with schema extensions;

select plan(43);

select has_table('public', 'inventions', 'existe la tabla inventions');
select has_pk('public', 'inventions', 'inventions tiene llave primaria');
select columns_are(
  'public', 'inventions',
  array['id', 'user_id', 'title', 'description', 'status', 'created_at', 'updated_at'],
  'la tabla expone solo las columnas esperadas');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.inventions'::regclass),
  'RLS está habilitado');
select ok(to_regprocedure('public.set_inventions_timestamps()') is not null,
  'existe la función de timestamps controlada por la base');
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.inventions'::regclass
      and tgname = 'set_inventions_timestamps'
      and not tgisinternal
  ),
  'existe el trigger de timestamps');
select ok(not has_table_privilege('anon', 'public.inventions', 'select'),
  'anon no puede leer inventions');
select ok(not has_table_privilege('anon', 'public.inventions', 'insert'),
  'anon no puede insertar inventions');
select ok(not has_table_privilege('anon', 'public.inventions', 'update'),
  'anon no puede actualizar inventions');
select ok(not has_table_privilege('anon', 'public.inventions', 'delete'),
  'anon no puede eliminar inventions');
select ok(has_table_privilege('authenticated', 'public.inventions', 'select'),
  'authenticated puede leer inventions');
select ok(has_table_privilege('authenticated', 'public.inventions', 'insert'),
  'authenticated puede insertar inventions');
select ok(has_table_privilege('authenticated', 'public.inventions', 'update'),
  'authenticated puede actualizar inventions');
select ok(has_table_privilege('authenticated', 'public.inventions', 'delete'),
  'authenticated puede eliminar inventions');
select ok(not has_table_privilege('authenticated', 'public.inventions', 'truncate'),
  'authenticated no puede truncar inventions');
select ok(not has_table_privilege('authenticated', 'public.inventions', 'references'),
  'authenticated no puede crear referencias sobre inventions');
select ok(not has_table_privilege('authenticated', 'public.inventions', 'trigger'),
  'authenticated no puede crear triggers en inventions');
select ok(not has_table_privilege('authenticated', 'public.inventions', 'maintain'),
  'authenticated no puede ejecutar mantenimiento en inventions');
select ok(not has_sequence_privilege('anon', 'public.inventions_id_seq', 'usage'),
  'anon no puede consumir la secuencia');
select ok(not has_sequence_privilege('anon', 'public.inventions_id_seq', 'select'),
  'anon no puede leer la secuencia');
select ok(not has_sequence_privilege('anon', 'public.inventions_id_seq', 'update'),
  'anon no puede alterar la secuencia');
select ok(not has_sequence_privilege('authenticated', 'public.inventions_id_seq', 'usage'),
  'authenticated no necesita consumir la secuencia identity');
select ok(not has_sequence_privilege('authenticated', 'public.inventions_id_seq', 'select'),
  'authenticated no puede observar el contador global');
select ok(not has_sequence_privilege('authenticated', 'public.inventions_id_seq', 'update'),
  'authenticated no puede alterar el contador global');
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'inventions'),
  4, 'hay una política separada por operación');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'inventor-one@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'inventor-two@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.inventions (user_id, title, description) values
  ('10000000-0000-0000-0000-000000000001', 'Motor solar', 'Primer diseño'),
  ('10000000-0000-0000-0000-000000000002', 'Recolector de lluvia', 'Idea privada');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is((select count(*)::integer from public.inventions), 1,
  'el usuario uno solo lee su invento');
select lives_ok(
  $$ insert into public.inventions (title, description, created_at, updated_at)
     values (
       'Riego automático', 'Prueba RLS',
       '2000-01-01 00:00:00+00', '2099-01-01 00:00:00+00'
     ) $$,
  'el usuario inserta una idea propia con user_id por defecto');
select is(
  (select user_id from public.inventions where title = 'Riego automático'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'el user_id por defecto es el usuario autenticado');
select ok(
  (select created_at > '2000-01-01 00:00:00+00'::timestamptz
   from public.inventions where title = 'Riego automático'),
  'created_at de inserción lo controla la base');
select ok(
  (select updated_at < '2099-01-01 00:00:00+00'::timestamptz
   from public.inventions where title = 'Riego automático'),
  'updated_at de inserción lo controla la base');
select throws_ok(
  $$ insert into public.inventions (user_id, title) values ('10000000-0000-0000-0000-000000000002', 'Idea ajena') $$,
  '42501', null, 'un usuario no inserta para otra persona');
select lives_ok(
  $$ update public.inventions
     set status = 'prototype', updated_at = '2000-01-01 00:00:00+00'
     where title = 'Motor solar' $$,
  'un usuario actualiza su propio invento');
select is(
  (select status from public.inventions where title = 'Motor solar'),
  'prototype', 'la actualización propia persiste');
select ok(
  (select updated_at > '2000-01-01 00:00:00+00'::timestamptz
   from public.inventions where title = 'Motor solar'),
  'updated_at lo controla la base y no el cliente');
select throws_ok(
  $$ update public.inventions
     set user_id = '10000000-0000-0000-0000-000000000002'
     where title = 'Motor solar' $$,
  '42501', null, 'un usuario no reasigna un invento propio a otra persona');
select results_eq(
  $$ update public.inventions set status = 'complete'
     where user_id = '10000000-0000-0000-0000-000000000002'
     returning 1 $$,
  $$ select 1 where false $$,
  'un usuario no actualiza inventos ajenos');
select results_eq(
  $$ delete from public.inventions
     where user_id = '10000000-0000-0000-0000-000000000002'
     returning 1 $$,
  $$ select 1 where false $$,
  'un usuario no elimina inventos ajenos');
select is((select count(*)::integer from public.inventions), 2,
  'el usuario uno ve las dos ideas que le pertenecen');
select lives_ok(
  $$ delete from public.inventions where title = 'Riego automático' $$,
  'un usuario elimina su propio invento');
select is((select count(*)::integer from public.inventions), 1,
  'la eliminación propia persiste');

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select results_eq(
  $$ select title from public.inventions order by title $$,
  $$ values ('Recolector de lluvia'::text) $$,
  'el usuario dos ve únicamente su propia idea');

reset role;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ insert into public.inventions (user_id, title, status)
     values ('10000000-0000-0000-0000-000000000001', 'Estado inválido', 'unknown') $$,
  '23514', null, 'la base rechaza estados fuera del contrato');
select throws_ok(
  $$ insert into public.inventions (user_id, title)
     values ('10000000-0000-0000-0000-000000000001', '   ') $$,
  '23514', null, 'la base rechaza títulos vacíos');

select * from finish();
rollback;
