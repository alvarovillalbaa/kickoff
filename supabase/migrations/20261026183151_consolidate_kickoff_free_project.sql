-- CLI-created scaffold aligned to confirmed remote migration version 20261026183151.
-- Kickoff canonical initial schema, installed additively in the shared free project.
-- Apply once, as the database owner. Future changes require reviewed migrations.
-- All instants are timestamptz (UTC); centers retain the IANA display timezone.
-- Public tables expose venue information and availability. Bookings, rosters,
-- invitation capabilities and guest-token hashes stay in an unexposed schema.
begin;

-- Approved 2026-10-26: additive Kickoff installation in the shared free project.
-- Source supabase/schema.sql SHA256: 83c6a716f3c6f69173d41c3e8673b7552b6d118ec24c191b5b3946e986345da1.
do $capacity_preflight$
begin
  if exists(select 1 from auth.users) or exists(select 1 from public.documents) or exists(select 1 from public.mcp_tokens) then
    raise exception 'Shared installation stopped: the reviewed empty target snapshot changed.';
  end if;
  if to_regclass('public.centers') is not null
    or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private')
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private') then
    raise exception 'Shared installation stopped: conflicting Kickoff objects exist.';
  end if;
end;
$capacity_preflight$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;

create table public.centers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (length(btrim(name)) between 2 and 100),
  city text not null check (length(btrim(city)) between 2 and 100),
  address text not null check (length(btrim(address)) between 5 and 240),
  timezone text not null default 'Europe/Madrid' check (length(timezone) <= 100)
);

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 100),
  format text not null check (format in ('5', '7', '11')),
  surface text not null check (length(btrim(surface)) between 2 and 80),
  max_players integer not null,
  price_cents integer not null check (price_cents between 0 and 1000000),
  amenities text[] not null default '{}',
  constraint fields_capacity check (max_players = 2 * format::integer),
  constraint fields_amenities_count check (cardinality(amenities) <= 12),
  constraint fields_amenities_length check (length(array_to_string(amenities, ', ')) <= 600)
);

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_cents integer not null check (price_cents between 0 and 1000000),
  constraint slots_duration check (ends_at > starts_at and ends_at <= starts_at + interval '8 hours')
);

create index centers_owner_idx on public.centers(owner_id);
create index fields_center_idx on public.fields(center_id);
create index slots_field_start_idx on public.slots(field_id, starts_at);

-- Snapshot references deliberately do not cascade from editable venue records.
-- Cancelled/ended matches remain readable after released slots/fields are removed.
create table private.matches (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null,
  slot_id uuid not null,
  organizer_id uuid not null references auth.users(id),
  center_owner_id uuid not null references auth.users(id),
  title text not null check (length(btrim(title)) between 3 and 100),
  level text not null check (length(btrim(level)) between 2 and 60),
  visibility text not null check (visibility in ('public', 'invite')),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_players integer not null check (max_players in (10, 14, 22)),
  price_cents integer not null check (price_cents between 0 and 1000000),
  center_name text not null,
  city text not null,
  timezone text not null,
  field_name text not null,
  format text not null check (format in ('5', '7', '11')),
  created_at timestamptz not null default now(),
  constraint matches_capacity check (max_players = 2 * format::integer)
);

-- The unique index is the final safety net behind the booking row lock.
create unique index matches_one_booking_per_slot on private.matches(slot_id) where status = 'scheduled';
create index matches_discovery_idx on private.matches(starts_at) where status = 'scheduled' and visibility = 'public';
create index matches_organizer_idx on private.matches(organizer_id);
create index matches_center_owner_idx on private.matches(center_owner_id);
create index matches_field_idx on private.matches(field_id);

create table private.participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references private.matches(id) on delete cascade,
  user_id uuid references auth.users(id),
  display_name text not null check (length(btrim(display_name)) between 2 and 60),
  guest_token_hash text,
  created_at timestamptz not null default now(),
  constraint participants_identity check (
    (user_id is not null and guest_token_hash is null)
    or (user_id is null and guest_token_hash is not null and length(guest_token_hash) = 64)
  )
);
create unique index participants_one_user_per_match on private.participants(match_id, user_id) where user_id is not null;
create unique index participants_one_guest_token_per_match on private.participants(match_id, guest_token_hash) where guest_token_hash is not null;
create index participants_match_idx on private.participants(match_id);
create index participants_user_idx on private.participants(user_id);

create table private.invitations (
  match_id uuid primary key references private.matches(id) on delete cascade,
  code uuid not null unique default gen_random_uuid()
);

alter table public.centers enable row level security;
alter table public.fields enable row level security;
alter table public.slots enable row level security;
alter table private.matches enable row level security;
alter table private.participants enable row level security;
alter table private.invitations enable row level security;

-- Private tables have no client policies or table grants. Only narrowly granted,
-- explicitly authorized functions owned by the installer can access them.
revoke all on public.centers, public.fields, public.slots from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
grant select on public.centers, public.fields, public.slots to anon, authenticated;
grant insert, delete on public.centers, public.fields, public.slots to authenticated;
grant update (name, city, address, timezone) on public.centers to authenticated;
grant update (name, format, surface, max_players, price_cents, amenities) on public.fields to authenticated;
grant update (price_cents) on public.slots to authenticated;

create function private.is_registered_user()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users u where u.id = auth.uid()
      and not coalesce(u.is_anonymous, false)
      and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  );
$$;

create function private.require_user()
returns uuid language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_registered_user() then
    raise exception 'Inicia sesión con tu correo o teléfono verificado para continuar.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create function private.slot_is_free(p_slot_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from private.matches m where m.slot_id = p_slot_id and m.status = 'scheduled');
$$;

create policy centers_public_read on public.centers for select to anon, authenticated using (true);
create policy centers_owner_insert on public.centers for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.is_registered_user()));
create policy centers_owner_update on public.centers for update to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_registered_user()))
  with check (owner_id = (select auth.uid()) and (select private.is_registered_user()));
create policy centers_owner_delete on public.centers for delete to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_registered_user()));

create policy fields_public_read on public.fields for select to anon, authenticated using (true);
create policy fields_owner_insert on public.fields for insert to authenticated
  with check ((select private.is_registered_user()) and exists (
    select 1 from public.centers c where c.id = center_id and c.owner_id = (select auth.uid())
  ));
create policy fields_owner_update on public.fields for update to authenticated
  using ((select private.is_registered_user()) and exists (
    select 1 from public.centers c where c.id = center_id and c.owner_id = (select auth.uid())
  ))
  with check ((select private.is_registered_user()) and exists (
    select 1 from public.centers c where c.id = center_id and c.owner_id = (select auth.uid())
  ));
create policy fields_owner_delete on public.fields for delete to authenticated
  using ((select private.is_registered_user()) and exists (
    select 1 from public.centers c where c.id = center_id and c.owner_id = (select auth.uid())
  ));

create policy slots_public_or_owner_read on public.slots for select to anon, authenticated
  using ((starts_at > now() and private.slot_is_free(id)) or exists (
    select 1 from public.fields f join public.centers c on c.id = f.center_id
    where f.id = field_id and c.owner_id = (select auth.uid())
  ));
create policy slots_owner_insert on public.slots for insert to authenticated
  with check ((select private.is_registered_user()) and exists (
    select 1 from public.fields f join public.centers c on c.id = f.center_id
    where f.id = field_id and c.owner_id = (select auth.uid())
  ));
create policy slots_owner_update on public.slots for update to authenticated
  using ((select private.is_registered_user()) and exists (
    select 1 from public.fields f join public.centers c on c.id = f.center_id
    where f.id = field_id and c.owner_id = (select auth.uid())
  ))
  with check ((select private.is_registered_user()) and exists (
    select 1 from public.fields f join public.centers c on c.id = f.center_id
    where f.id = field_id and c.owner_id = (select auth.uid())
  ));
create policy slots_owner_delete on public.slots for delete to authenticated
  using ((select private.is_registered_user()) and exists (
    select 1 from public.fields f join public.centers c on c.id = f.center_id
    where f.id = field_id and c.owner_id = (select auth.uid())
  ));

create function private.validate_center()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = new.timezone) then
    raise exception 'Selecciona una zona horaria IANA válida.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger centers_validate before insert or update on public.centers
  for each row execute function private.validate_center();

create function private.guard_slot()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from private.matches m
      where m.slot_id = old.id and m.status = 'scheduled' and m.ends_at > now()) then
      raise exception 'Este horario tiene una reserva activa. Cancela el partido antes de eliminarlo.' using errcode = '23514';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.field_id <> old.field_id or new.starts_at <> old.starts_at or new.ends_at <> old.ends_at then
      raise exception 'Los horarios publicados no se pueden mover. Elimina el horario libre y crea uno nuevo.' using errcode = '23514';
    end if;
    if not private.slot_is_free(old.id) then
      raise exception 'No se puede cambiar el precio de una reserva activa.' using errcode = '23514';
    end if;
  end if;
  if new.starts_at <= now() then
    raise exception 'La disponibilidad debe comenzar en el futuro.' using errcode = '22023';
  end if;
  -- Every insertion for one field takes the same parent row lock. This prevents
  -- concurrent overlap without requiring a database extension or client check.
  if tg_op = 'INSERT' then
    perform 1 from public.fields f where f.id = new.field_id for update;
  end if;
  if exists (
    select 1 from public.slots s where s.field_id = new.field_id and s.id <> new.id
      and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'Este horario se solapa con otro de la misma pista.' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create trigger slots_guard before insert or update or delete on public.slots
  for each row execute function private.guard_slot();

create function private.guard_field_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from private.matches m
    where m.field_id = old.id and m.status = 'scheduled' and m.ends_at > now()) then
    raise exception 'Esta pista tiene reservas activas. Cancélalas antes de eliminarla.' using errcode = '23514';
  end if;
  return old;
end;
$$;
create trigger fields_guard_delete before delete on public.fields
  for each row execute function private.guard_field_delete();

create function private.match_json(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'field_id', m.field_id, 'slot_id', m.slot_id, 'organizer_id', m.organizer_id,
    'center_owner_id', m.center_owner_id,
    'title', m.title, 'level', m.level, 'visibility', m.visibility, 'status', m.status,
    'starts_at', m.starts_at, 'ends_at', m.ends_at, 'max_players', m.max_players,
    'price_cents', m.price_cents, 'center_name', m.center_name, 'city', m.city, 'timezone', m.timezone,
    'field_name', m.field_name, 'format', m.format,
    'players_count', (select count(*) from private.participants p where p.match_id = m.id)
  ) from private.matches m where m.id = p_match_id;
$$;

create function private.browse()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'centers', coalesce((select jsonb_agg(to_jsonb(c) order by c.name, c.id) from public.centers c), '[]'::jsonb),
    'fields', coalesce((select jsonb_agg(to_jsonb(f) order by f.name, f.id) from public.fields f), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(to_jsonb(s) order by s.starts_at, s.id) from public.slots s
      where s.starts_at > now() and private.slot_is_free(s.id)), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(private.match_json(m.id) order by m.starts_at, m.id)
      from private.matches m where m.status = 'scheduled' and m.visibility = 'public'
      and m.starts_at > now()), '[]'::jsonb)
  );
$$;

create function private.get_match(p_match_id uuid, p_invite_code uuid default null,
  p_participant_id uuid default null, p_guest_token uuid default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_match private.matches;
  v_roster jsonb;
  v_guest_id uuid;
begin
  select * into v_match from private.matches where id = p_match_id;
  if not found then
    raise exception 'No encontramos este partido o no tienes acceso.' using errcode = '42501';
  end if;
  select p.id into v_guest_id from private.participants p where p.id = p_participant_id
    and p.match_id = p_match_id and p.user_id is null
    and p.guest_token_hash = encode(sha256(convert_to(p_guest_token::text, 'UTF8')), 'hex');
  if v_match.visibility <> 'public'
    and v_match.organizer_id is distinct from auth.uid()
    and v_guest_id is null
    and not exists (select 1 from private.participants p where p.match_id = p_match_id and p.user_id = auth.uid())
    and not exists (select 1 from private.invitations i where i.match_id = p_match_id and i.code = p_invite_code)
  then
    raise exception 'No encontramos este partido o no tienes acceso.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'display_name', p.display_name,
    'is_organizer', coalesce(p.user_id = v_match.organizer_id, false),
    'is_guest', p.user_id is null,
    'is_me', coalesce(p.user_id = auth.uid(), false) or coalesce(p.id = v_guest_id, false)
  ) order by (p.user_id = v_match.organizer_id) desc nulls last, p.created_at, p.id), '[]'::jsonb)
  into v_roster from private.participants p where p.match_id = p_match_id;
  return private.match_json(p_match_id) || jsonb_build_object('participants', v_roster);
end;
$$;

create function private.book_match(p_slot_id uuid, p_title text, p_level text, p_visibility text, p_display_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_slot public.slots;
  v_field public.fields;
  v_center public.centers;
  v_id uuid;
begin
  if p_title is null or length(btrim(p_title)) not between 3 and 100
    or p_level is null or length(btrim(p_level)) not between 2 and 60
    or p_display_name is null or length(btrim(p_display_name)) not between 2 and 60
    or p_visibility is null or p_visibility not in ('public', 'invite') then
    raise exception 'Revisa el título, el nivel, tu nombre y la visibilidad del partido.' using errcode = '22023';
  end if;
  -- Lock the parent before the slot so deletion cannot race with a new booking.
  -- After that, lock order is slot -> match for booking and cancellation.
  select f.* into v_field from public.fields f join public.slots s on s.field_id = f.id
    where s.id = p_slot_id for update of f;
  if not found then
    raise exception 'Este horario ya no está disponible.' using errcode = '22023';
  end if;
  select * into v_slot from public.slots where id = p_slot_id for update;
  if not found or v_slot.starts_at <= now() then
    raise exception 'Este horario ya no está disponible.' using errcode = '22023';
  end if;
  if not private.slot_is_free(p_slot_id) then
    raise exception 'Otra persona acaba de reservar este horario. Elige otro.' using errcode = '23505';
  end if;
  select * into strict v_center from public.centers where id = v_field.center_id;
  insert into private.matches (field_id, slot_id, organizer_id, center_owner_id, title, level, visibility,
    starts_at, ends_at, max_players, price_cents, center_name, city, timezone, field_name, format)
  values (v_field.id, v_slot.id, v_user, v_center.owner_id, btrim(p_title), btrim(p_level), p_visibility,
    v_slot.starts_at, v_slot.ends_at, v_field.max_players, v_slot.price_cents,
    v_center.name, v_center.city, v_center.timezone, v_field.name, v_field.format)
  returning id into v_id;
  insert into private.participants (match_id, user_id, display_name) values (v_id, v_user, btrim(p_display_name));
  insert into private.invitations (match_id) values (v_id);
  return v_id;
end;
$$;

create function private.join_match(p_match_id uuid, p_display_name text, p_invite_code uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_match private.matches;
  v_id uuid;
begin
  if p_display_name is null or length(btrim(p_display_name)) not between 2 and 60 then
    raise exception 'Escribe un nombre de entre 2 y 60 caracteres.' using errcode = '22023';
  end if;
  select * into v_match from private.matches where id = p_match_id for update;
  if not found or (v_match.visibility <> 'public' and not exists (
    select 1 from private.invitations i where i.match_id = p_match_id and i.code = p_invite_code
  )) then
    raise exception 'No encontramos este partido o la invitación no es válida.' using errcode = '42501';
  end if;
  if v_match.status <> 'scheduled' or v_match.starts_at <= now() then
    raise exception 'Este partido ya no acepta jugadores.' using errcode = '22023';
  end if;
  select p.id into v_id from private.participants p where p.match_id = p_match_id and p.user_id = v_user;
  if found then return v_id; end if;
  if (select count(*) from private.participants p where p.match_id = p_match_id) >= v_match.max_players then
    raise exception 'El partido está completo. Busca otro con plazas libres.' using errcode = '23514';
  end if;
  insert into private.participants (match_id, user_id, display_name)
    values (p_match_id, v_user, btrim(p_display_name)) returning id into v_id;
  return v_id;
end;
$$;

create function private.join_guest(p_match_id uuid, p_display_name text, p_invite_code uuid,
  p_participant_id uuid, p_guest_token uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_match private.matches;
  v_id uuid;
  v_token_hash text;
begin
  if p_display_name is null or length(btrim(p_display_name)) not between 2 and 60 then
    raise exception 'Escribe un nombre de entre 2 y 60 caracteres.' using errcode = '22023';
  end if;
  if p_participant_id is null or p_guest_token is null then
    raise exception 'No se pudo crear tu pase de invitado. Vuelve a intentarlo o accede con tu cuenta.' using errcode = '22023';
  end if;
  v_token_hash := encode(sha256(convert_to(p_guest_token::text, 'UTF8')), 'hex');
  select * into v_match from private.matches where id = p_match_id for update;
  if not found or p_invite_code is null or not exists (
    select 1 from private.invitations i where i.match_id = p_match_id and i.code = p_invite_code
  ) then
    raise exception 'Necesitas una invitación válida para apuntarte sin cuenta.' using errcode = '42501';
  end if;
  -- The client persists random participant/token UUIDs before submitting. Retrying the same
  -- authorized operation after a lost response must not consume another seat.
  select p.id into v_id from private.participants p
    where p.id = p_participant_id and p.match_id = p_match_id and p.guest_token_hash = v_token_hash;
  if found then
    return jsonb_build_object('participant_id', v_id, 'guest_token', p_guest_token);
  end if;
  if v_match.status <> 'scheduled' or v_match.starts_at <= now() then
    raise exception 'Este partido ya no acepta jugadores.' using errcode = '22023';
  end if;
  if (select count(*) from private.participants p where p.match_id = p_match_id) >= v_match.max_players then
    raise exception 'El partido está completo. Busca otro con plazas libres.' using errcode = '23514';
  end if;
  insert into private.participants (id, match_id, display_name, guest_token_hash)
    values (p_participant_id, p_match_id, btrim(p_display_name), v_token_hash)
    returning id into v_id;
  -- The original capability is never stored in a table.
  return jsonb_build_object('participant_id', v_id, 'guest_token', p_guest_token);
end;
$$;

create function private.leave_match(p_match_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_match private.matches;
begin
  select * into v_match from private.matches where id = p_match_id for update;
  if not found then raise exception 'No encontramos este partido.' using errcode = '22023'; end if;
  if v_match.organizer_id = v_user then
    raise exception 'Como organizador, debes cancelar el partido para liberar la pista.' using errcode = '23514';
  end if;
  if v_match.starts_at <= now() then
    raise exception 'No se puede dejar un partido que ya ha comenzado.' using errcode = '22023';
  end if;
  delete from private.participants where match_id = p_match_id and user_id = v_user;
  if not found then raise exception 'No estás apuntado a este partido.' using errcode = '42501'; end if;
end;
$$;

create function private.leave_guest(p_participant_id uuid, p_guest_token uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_match_id uuid;
  v_match private.matches;
begin
  select p.match_id into v_match_id from private.participants p where p.id = p_participant_id
    and p.user_id is null and p.guest_token_hash = encode(sha256(convert_to(p_guest_token::text, 'UTF8')), 'hex');
  if not found then raise exception 'El pase de invitado no es válido.' using errcode = '42501'; end if;
  select * into v_match from private.matches where id = v_match_id for update;
  if v_match.starts_at <= now() then
    raise exception 'No se puede dejar un partido que ya ha comenzado.' using errcode = '22023';
  end if;
  delete from private.participants where id = p_participant_id and user_id is null
    and guest_token_hash = encode(sha256(convert_to(p_guest_token::text, 'UTF8')), 'hex');
  if not found then raise exception 'El pase de invitado ya no es válido.' using errcode = '42501'; end if;
end;
$$;

create function private.claim_guest(p_participant_id uuid, p_guest_token uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_match_id uuid;
begin
  select p.match_id into v_match_id from private.participants p where p.id = p_participant_id
    and p.user_id is null and p.guest_token_hash = encode(sha256(convert_to(p_guest_token::text, 'UTF8')), 'hex');
  if not found then raise exception 'El pase de invitado no es válido.' using errcode = '42501'; end if;
  perform 1 from private.matches where id = v_match_id for update;
  if exists (select 1 from private.participants p where p.match_id = v_match_id and p.user_id = v_user) then
    raise exception 'Tu cuenta ya está apuntada a este partido. Puedes retirar tu plaza de invitado.' using errcode = '23505';
  end if;
  update private.participants set user_id = v_user, guest_token_hash = null
    where id = p_participant_id and user_id is null
    and guest_token_hash = encode(sha256(convert_to(p_guest_token::text, 'UTF8')), 'hex');
  if not found then raise exception 'El pase de invitado ya no es válido.' using errcode = '42501'; end if;
end;
$$;

create function private.cancel_match(p_match_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_match private.matches;
begin
  select * into v_match from private.matches where id = p_match_id;
  if not found or (v_match.organizer_id <> v_user and v_match.center_owner_id <> v_user) then
    raise exception 'Solo el organizador o el centro pueden cancelar esta reserva.' using errcode = '42501';
  end if;
  perform 1 from public.slots where id = v_match.slot_id for update;
  select * into v_match from private.matches where id = p_match_id for update;
  if v_match.status = 'cancelled' then return; end if;
  if v_match.starts_at <= now() then
    raise exception 'No se puede cancelar una reserva que ya ha comenzado.' using errcode = '22023';
  end if;
  update private.matches set status = 'cancelled' where id = p_match_id;
end;
$$;

create function private.get_invite_code(p_match_id uuid)
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_code uuid;
begin
  select i.code into v_code from private.invitations i join private.matches m on m.id = i.match_id
    where m.id = p_match_id and m.organizer_id = v_user;
  if not found then raise exception 'Solo el organizador puede compartir la invitación.' using errcode = '42501'; end if;
  return v_code;
end;
$$;

create function private.my_matches()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
begin
  -- Venue owners need booking summaries for their own fields. This does not
  -- grant access to private rosters or invitation codes through get_match.
  return coalesce((select jsonb_agg(private.match_json(m.id) order by m.starts_at desc, m.id)
    from private.matches m where m.organizer_id = v_user or m.center_owner_id = v_user
    or exists (select 1 from private.participants p where p.match_id = m.id and p.user_id = v_user)), '[]'::jsonb);
end;
$$;

-- Only these public, SECURITY INVOKER wrappers are Data API endpoints.
-- Private implementations repeat authorization because they run as the owner.
create function public.browse() returns jsonb language sql stable security invoker set search_path = ''
  as $$ select private.browse(); $$;
create function public.get_match(p_match_id uuid, p_invite_code uuid default null,
  p_participant_id uuid default null, p_guest_token uuid default null) returns jsonb
  language sql stable security invoker set search_path = ''
  as $$ select private.get_match(p_match_id, p_invite_code, p_participant_id, p_guest_token); $$;
create function public.book_match(p_slot_id uuid, p_title text, p_level text, p_visibility text, p_display_name text) returns uuid
  language sql security invoker set search_path = '' as $$ select private.book_match(p_slot_id, p_title, p_level, p_visibility, p_display_name); $$;
create function public.join_match(p_match_id uuid, p_display_name text, p_invite_code uuid default null) returns uuid
  language sql security invoker set search_path = '' as $$ select private.join_match(p_match_id, p_display_name, p_invite_code); $$;
create function public.join_guest(p_match_id uuid, p_display_name text, p_invite_code uuid,
  p_participant_id uuid, p_guest_token uuid) returns jsonb
  language sql security invoker set search_path = ''
  as $$ select private.join_guest(p_match_id, p_display_name, p_invite_code, p_participant_id, p_guest_token); $$;
create function public.leave_match(p_match_id uuid) returns void language sql security invoker set search_path = ''
  as $$ select private.leave_match(p_match_id); $$;
create function public.leave_guest(p_participant_id uuid, p_guest_token uuid) returns void language sql security invoker set search_path = ''
  as $$ select private.leave_guest(p_participant_id, p_guest_token); $$;
create function public.claim_guest(p_participant_id uuid, p_guest_token uuid) returns void language sql security invoker set search_path = ''
  as $$ select private.claim_guest(p_participant_id, p_guest_token); $$;
create function public.cancel_match(p_match_id uuid) returns void language sql security invoker set search_path = ''
  as $$ select private.cancel_match(p_match_id); $$;
create function public.get_invite_code(p_match_id uuid) returns uuid language sql stable security invoker set search_path = ''
  as $$ select private.get_invite_code(p_match_id); $$;
create function public.my_matches() returns jsonb language sql stable security invoker set search_path = ''
  as $$ select private.my_matches(); $$;

-- Revoke the implicit PUBLIC EXECUTE on every function this installation adds.
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.browse(), public.get_match(uuid, uuid, uuid, uuid),
  public.book_match(uuid, text, text, text, text), public.join_match(uuid, text, uuid),
  public.join_guest(uuid, text, uuid, uuid, uuid), public.leave_match(uuid), public.leave_guest(uuid, uuid),
  public.claim_guest(uuid, uuid), public.cancel_match(uuid), public.get_invite_code(uuid), public.my_matches()
  from public, anon, authenticated;

grant execute on function private.slot_is_free(uuid) to anon, authenticated;
grant execute on function private.is_registered_user() to authenticated;
grant execute on function private.browse(), private.get_match(uuid, uuid, uuid, uuid), private.join_guest(uuid, text, uuid, uuid, uuid),
  private.leave_guest(uuid, uuid) to anon, authenticated;
grant execute on function private.book_match(uuid, text, text, text, text), private.join_match(uuid, text, uuid),
  private.leave_match(uuid), private.claim_guest(uuid, uuid), private.cancel_match(uuid),
  private.get_invite_code(uuid), private.my_matches() to authenticated;

grant execute on function public.browse(), public.get_match(uuid, uuid, uuid, uuid), public.join_guest(uuid, text, uuid, uuid, uuid),
  public.leave_guest(uuid, uuid) to anon, authenticated;
grant execute on function public.book_match(uuid, text, text, text, text), public.join_match(uuid, text, uuid),
  public.leave_match(uuid), public.claim_guest(uuid, uuid), public.cancel_match(uuid),
  public.get_invite_code(uuid), public.my_matches() to authenticated;

commit;
