create extension if not exists pgcrypto;

create type public.app_role as enum ('rider', 'driver', 'admin');

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'rider',
  full_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);

create table public.drivers (
  user_id uuid primary key references public.user_profiles (id) on delete cascade,
  full_name text not null,
  car text not null,
  plate text not null,
  phone text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'OFFLINE', 'ONLINE', 'REJECTED')),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  created_at timestamptz not null default now()
);

create table public.rides (
  id bigint generated always as identity primary key,
  rider_id uuid not null references public.user_profiles (id) on delete restrict,
  driver_id uuid references public.drivers (user_id) on delete set null,
  from_place text not null check (char_length(from_place) between 1 and 200),
  to_place text not null check (char_length(to_place) between 1 and 200),
  phone text not null default '',
  status text not null default 'NEW'
    check (status in ('NEW', 'ACCEPTED', 'STARTED', 'ARRIVED', 'COMPLETED', 'DECLINED', 'CANCELLED')),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  fare integer not null default 70 check (fare between 0 and 10000),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
);

create index rides_rider_created_idx on public.rides (rider_id, created_at desc);
create index rides_driver_created_idx on public.rides (driver_id, created_at desc);
create index rides_status_created_idx on public.rides (status, created_at desc);
create unique index drivers_phone_idx on public.drivers (phone);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.user_profiles where id = (select auth.uid())
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin'::public.app_role, false)
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_role public.app_role;
  full_name text;
  phone text;
  car text;
  plate text;
begin
  app_role := case
    when new.raw_user_meta_data ->> 'app_role' = 'driver' then 'driver'::public.app_role
    else 'rider'::public.app_role
  end;
  full_name := left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100);
  phone := left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 30);

  insert into public.user_profiles (id, role, full_name, phone)
  values (new.id, app_role, full_name, phone);

  if app_role = 'driver' then
    car := left(coalesce(new.raw_user_meta_data ->> 'car', ''), 100);
    plate := left(coalesce(new.raw_user_meta_data ->> 'plate', ''), 30);
    if car = '' or plate = '' or phone = '' then
      raise exception 'Driver signup requires vehicle, registration, and phone details';
    end if;
    insert into public.drivers (user_id, full_name, car, plate, phone)
    values (new.id, full_name, car, plate, phone);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
    and coalesce(auth.role(), '') not in ('service_role', 'supabase_admin')
    and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Profile roles can only be changed by an administrator';
  end if;
  return new;
end;
$$;

create trigger prevent_profile_role_change
  before update of role on public.user_profiles
  for each row execute function public.prevent_profile_role_change();

create or replace function public.set_ride_fare_and_driver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_zone text;
  to_zone text;
  local_time timestamp;
  base_fare integer;
  assigned_driver uuid;
begin
  from_zone := case
    when lower(new.from_place) ~ '(hospital|hosp\y)' then 'HOSPITAL'
    when lower(new.from_place) ~ '(intabazwe|phomolong|42nd|42 ?hill|forty.?second|current location)' then 'INTABAZWE'
    when lower(new.from_place) ~ '(tshiame|checkers|qwa ?qwa|phuthaditjhaba|mall|plaza|shopping|cent(er|re))' then 'CENTRES'
    when lower(new.from_place) ~ '(\ytown\y|cbd|taxi rank|\yrank\y|harrismith|warden)' then 'TOWN'
    else 'INTABAZWE'
  end;
  to_zone := case
    when lower(new.to_place) ~ '(hospital|hosp\y)' then 'HOSPITAL'
    when lower(new.to_place) ~ '(intabazwe|phomolong|42nd|42 ?hill|forty.?second|current location)' then 'INTABAZWE'
    when lower(new.to_place) ~ '(tshiame|checkers|qwa ?qwa|phuthaditjhaba|mall|plaza|shopping|cent(er|re))' then 'CENTRES'
    when lower(new.to_place) ~ '(\ytown\y|cbd|taxi rank|\yrank\y|harrismith|warden)' then 'TOWN'
    else 'INTABAZWE'
  end;

  base_fare := case
    when from_zone = 'INTABAZWE' and to_zone = 'TOWN' then 110
    when from_zone = 'TOWN' and to_zone = 'INTABAZWE' then 110
    when from_zone = 'INTABAZWE' and to_zone in ('CENTRES', 'HOSPITAL') then 130
    when to_zone = 'INTABAZWE' and from_zone in ('CENTRES', 'HOSPITAL') then 130
    else 70
  end;
  local_time := now() at time zone 'Africa/Johannesburg';
  new.fare := base_fare + case
    when extract(hour from local_time) >= 20 or extract(hour from local_time) < 5
      or (extract(hour from local_time) = 5 and extract(minute from local_time) = 0)
    then 50 else 0
  end;
  new.status := 'NEW';
  new.accepted_at := null;
  new.started_at := null;
  new.completed_at := null;

  select d.user_id into assigned_driver
  from public.drivers as d
  where d.status = 'ONLINE'
  order by case
    when new.lat is not null and new.lng is not null and d.lat is not null and d.lng is not null then
      6371 * 2 * asin(sqrt(
        power(sin(radians(d.lat - new.lat) / 2), 2)
        + cos(radians(new.lat)) * cos(radians(d.lat))
        * power(sin(radians(d.lng - new.lng) / 2), 2)
      ))
    else 0
  end, d.created_at
  limit 1;
  new.driver_id := assigned_driver;
  return new;
end;
$$;

create trigger set_ride_fare_and_driver
  before insert on public.rides
  for each row execute function public.set_ride_fare_and_driver();

create or replace function public.validate_ride_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' and public.current_app_role() = 'rider'::public.app_role
    and new.driver_id is distinct from old.driver_id then
    raise exception 'Riders cannot assign a ride to a driver';
  end if;
  if new.rider_id is distinct from old.rider_id then
    raise exception 'A ride cannot be transferred to another rider';
  end if;
  if new.driver_id is not null and new.driver_id is distinct from old.driver_id
    and not exists (
      select 1 from public.drivers
      where user_id = new.driver_id and status in ('ONLINE', 'OFFLINE')
    ) then
    raise exception 'Driver must be approved before assignment';
  end if;
  if old.status in ('COMPLETED', 'CANCELLED', 'DECLINED') and new.status is distinct from old.status then
    raise exception 'A closed ride cannot change status';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'NEW' and new.status in ('ACCEPTED', 'DECLINED', 'CANCELLED'))
    or (old.status = 'ACCEPTED' and new.status in ('STARTED', 'CANCELLED', 'COMPLETED'))
    or (old.status = 'STARTED' and new.status in ('ARRIVED', 'COMPLETED'))
    or (old.status = 'ARRIVED' and new.status = 'COMPLETED')
  ) then
    raise exception 'Invalid ride status transition';
  end if;
  if new.status = 'ACCEPTED' and old.status is distinct from 'ACCEPTED' then
    new.accepted_at := now();
  end if;
  if new.status = 'STARTED' and old.status is distinct from 'STARTED' then
    new.started_at := now();
  end if;
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

create trigger validate_ride_update
  before update on public.rides
  for each row execute function public.validate_ride_update();

create or replace function public.set_driver_status(new_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_status text;
  waiting_ride record;
  next_driver uuid;
begin
  if current_user_id is null or public.current_app_role() <> 'driver'::public.app_role then
    raise exception 'Driver authentication required';
  end if;
  if new_status not in ('ONLINE', 'OFFLINE') then
    raise exception 'Status must be ONLINE or OFFLINE';
  end if;

  select status into current_status from public.drivers where user_id = current_user_id;
  if current_status is null or current_status not in ('ONLINE', 'OFFLINE') then
    raise exception 'Driver approval is required before going online';
  end if;
  update public.drivers set status = new_status where user_id = current_user_id;

  if new_status = 'ONLINE' then
    update public.rides
      set driver_id = current_user_id
      where id in (
        select id from public.rides
        where status = 'NEW' and driver_id is null
        order by created_at
        limit 20
      );
  else
    for waiting_ride in
      select id, lat, lng from public.rides
      where driver_id = current_user_id and status = 'NEW'
    loop
      select d.user_id into next_driver
      from public.drivers as d
      where d.status = 'ONLINE' and d.user_id <> current_user_id
      order by case
        when waiting_ride.lat is not null and waiting_ride.lng is not null and d.lat is not null and d.lng is not null then
          6371 * 2 * asin(sqrt(
            power(sin(radians(d.lat - waiting_ride.lat) / 2), 2)
            + cos(radians(waiting_ride.lat)) * cos(radians(d.lat))
            * power(sin(radians(d.lng - waiting_ride.lng) / 2), 2)
          ))
        else 0
      end, d.created_at
      limit 1;
      update public.rides set driver_id = next_driver where id = waiting_ride.id;
    end loop;
  end if;
end;
$$;

create or replace function public.decline_ride(ride_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  ride_to_reassign public.rides%rowtype;
  next_driver uuid;
begin
  if current_user_id is null or public.current_app_role() <> 'driver'::public.app_role then
    raise exception 'Driver authentication required';
  end if;
  select * into ride_to_reassign from public.rides
  where id = ride_id and driver_id = current_user_id and status = 'NEW'
  for update;
  if not found then raise exception 'This ride is no longer assigned to you'; end if;

  select d.user_id into next_driver
  from public.drivers as d
  where d.status = 'ONLINE' and d.user_id <> current_user_id
  order by case
    when ride_to_reassign.lat is not null and ride_to_reassign.lng is not null and d.lat is not null and d.lng is not null then
      6371 * 2 * asin(sqrt(
        power(sin(radians(d.lat - ride_to_reassign.lat) / 2), 2)
        + cos(radians(ride_to_reassign.lat)) * cos(radians(d.lat))
        * power(sin(radians(d.lng - ride_to_reassign.lng) / 2), 2)
      ))
    else 0
  end, d.created_at
  limit 1;
  if next_driver is null then
    update public.rides set driver_id = null where id = ride_id;
  else
    update public.rides set driver_id = next_driver where id = ride_id;
  end if;
end;
$$;

revoke all on function public.set_driver_status(text) from public;
revoke all on function public.decline_ride(bigint) from public;
grant execute on function public.set_driver_status(text) to authenticated;
grant execute on function public.decline_ride(bigint) to authenticated;

alter table public.user_profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.rides enable row level security;

create policy "Profiles are visible to their owner and admins"
  on public.user_profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "Users can update their own profile"
  on public.user_profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Drivers are visible to their owner, assigned rider, and admins"
  on public.drivers for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1 from public.rides
      where rides.driver_id = drivers.user_id and rides.rider_id = (select auth.uid())
    )
  );
create policy "Drivers can update their own availability and location"
  on public.drivers for update to authenticated
  using (
    (user_id = (select auth.uid()) and status in ('ONLINE', 'OFFLINE'))
    or (select public.is_admin())
  )
  with check (
    (user_id = (select auth.uid()) and status in ('ONLINE', 'OFFLINE'))
    or (select public.is_admin())
  );

create policy "Riders, assigned drivers, and admins can view rides"
  on public.rides for select to authenticated
  using (rider_id = (select auth.uid()) or driver_id = (select auth.uid()) or (select public.is_admin()));
create policy "Riders can create their own rides"
  on public.rides for insert to authenticated
  with check (rider_id = (select auth.uid()) and status = 'NEW');
create policy "Riders can cancel their own open rides"
  on public.rides for update to authenticated
  using (rider_id = (select auth.uid()) and status in ('NEW', 'ACCEPTED'))
  with check (rider_id = (select auth.uid()) and status = 'CANCELLED');
create policy "Assigned drivers and admins can update rides"
  on public.rides for update to authenticated
  using (driver_id = (select auth.uid()) or (select public.is_admin()))
  with check (driver_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.user_profiles, public.drivers, public.rides from anon, authenticated;
grant select on public.user_profiles, public.drivers, public.rides to authenticated;
grant update (full_name, phone) on public.user_profiles to authenticated;
grant update (status, lat, lng) on public.drivers to authenticated;
grant insert (rider_id, from_place, to_place, phone, lat, lng) on public.rides to authenticated;
grant update (status, driver_id) on public.rides to authenticated;
grant usage, select on sequence public.rides_id_seq to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rides'
  ) then
    alter publication supabase_realtime add table public.rides;
  end if;
end;
$$;
