-- Esta migración es append-only: la fundación 20260827160330 ya fue publicada.
-- La secuencia identity no necesita privilegios del cliente y los timestamps
-- deben depender de la base, no del reloj o payload del navegador.

revoke all on sequence public.inventions_id_seq from public, anon, authenticated;

create function public.set_inventions_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_inventions_timestamps() from public, anon, authenticated;

create trigger set_inventions_timestamps
before insert or update on public.inventions
for each row execute function public.set_inventions_timestamps();
