begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

select has_table('public', 'inventions', 'existe la tabla inventions');
select has_pk('public', 'inventions', 'inventions tiene llave primaria');
select columns_are(
  'public', 'inventions',
  array['id', 'user_id', 'title', 'description', 'status', 'created_at', 'updated_at'],
  'la tabla expone solo las columnas esperadas');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.inventions'::regclass),
  'RLS está habilitado');
select ok(not has_table_privilege('anon', 'public.inventions', 'select'),
  'anon no puede leer inventions');
select ok(not has_table_privilege('anon', 'public.inventions', 'insert'),
  'anon no puede insertar inventions');
select ok(not has_table_privilege('anon', 'public.inventions', 'update'),
  'anon no puede actualizar inventions');
select ok(not has_table_privilege('anon', 'public.inventions', 'delete'),
  'anon no puede eliminar inventions');
select ok(has_table_privilege('authenticated', 'public.inventions', 'select,insert,update,delete'),
  'authenticated tiene únicamente la superficie CRUD requerida');
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
  $$ insert into public.inventions (title, description) values ('Riego automático', 'Prueba RLS') $$,
  'el usuario inserta una idea propia con user_id por defecto');
select is(
  (select user_id from public.inventions where title = 'Riego automático'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'el user_id por defecto es el usuario autenticado');
select throws_ok(
  $$ insert into public.inventions (user_id, title) values ('10000000-0000-0000-0000-000000000002', 'Idea ajena') $$,
  '42501', null, 'un usuario no inserta para otra persona');
select lives_ok(
  $$ update public.inventions set status = 'prototype' where title = 'Motor solar' $$,
  'un usuario actualiza su propio invento');
select is(
  (select status from public.inventions where title = 'Motor solar'),
  'prototype', 'la actualización propia persiste');
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
