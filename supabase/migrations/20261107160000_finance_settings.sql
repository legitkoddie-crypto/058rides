create table public.platform_settings (
  id text primary key check (id = 'default'),
  platform_fee_amount integer not null default 10 check (platform_fee_amount between 0 and 10000),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, platform_fee_amount)
values ('default', 10)
on conflict (id) do nothing;

create or replace function public.touch_platform_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_platform_settings
  before update on public.platform_settings
  for each row execute function public.touch_platform_settings();

alter table public.platform_settings enable row level security;

create policy "Admins can view platform settings"
  on public.platform_settings for select to authenticated
  using ((select public.is_admin()));
create policy "Admins can update platform settings"
  on public.platform_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to authenticated;
grant update (platform_fee_amount) on public.platform_settings to authenticated;

alter table public.rides
  add column platform_share integer not null default 0 check (platform_share between 0 and 10000),
  add column driver_earning integer not null default 0 check (driver_earning between 0 and 10000),
  add column split_recorded_at timestamptz,
  add column split_reversed_at timestamptz;

update public.rides
set platform_share = least(greatest(fare - 35, 0), 10),
    driver_earning = fare - least(greatest(fare - 35, 0), 10),
    split_recorded_at = created_at,
    split_reversed_at = case when status in ('CANCELLED', 'DECLINED') then created_at else null end;

create or replace function public.record_ride_split()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_fee integer;
begin
  select platform_fee_amount into configured_fee
  from public.platform_settings
  where id = 'default';

  new.platform_share := least(new.fare, coalesce(configured_fee, 10));
  new.driver_earning := new.fare - new.platform_share;
  new.split_recorded_at := now();
  new.split_reversed_at := null;
  return new;
end;
$$;

create trigger record_ride_split
  before insert on public.rides
  for each row execute function public.record_ride_split();

create or replace function public.freeze_ride_split()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.platform_share := old.platform_share;
  new.driver_earning := old.driver_earning;
  new.split_recorded_at := old.split_recorded_at;
  new.split_reversed_at := old.split_reversed_at;
  if new.status in ('CANCELLED', 'DECLINED') and old.status not in ('CANCELLED', 'DECLINED') then
    new.split_reversed_at := now();
  end if;
  return new;
end;
$$;

create trigger freeze_ride_split
  before update on public.rides
  for each row execute function public.freeze_ride_split();

revoke all on function public.record_ride_split() from public;
revoke all on function public.freeze_ride_split() from public;

create or replace function public.admin_financial_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select jsonb_build_object(
    'bookedCount', count(*) filter (where r.split_reversed_at is null),
    'completedCount', count(*) filter (where r.status = 'COMPLETED'),
    'bookedGross', coalesce(sum(r.fare) filter (where r.split_reversed_at is null), 0),
    'platformRevenue', coalesce(sum(r.platform_share) filter (where r.split_reversed_at is null), 0),
    'driverPayable', coalesce(sum(r.driver_earning) filter (where r.split_reversed_at is null), 0),
    'completedPlatformRevenue', coalesce(sum(r.platform_share) filter (where r.status = 'COMPLETED'), 0),
    'completedDriverEarnings', coalesce(sum(r.driver_earning) filter (where r.status = 'COMPLETED'), 0),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', days.day::date,
        'rides', coalesce(daily.ride_count, 0),
        'gross', coalesce(daily.gross, 0),
        'platform', coalesce(daily.platform, 0),
        'driver', coalesce(daily.driver, 0)
      ) order by days.day)
      from generate_series(current_date - 6, current_date, interval '1 day') as days(day)
      left join (
        select r.created_at::date as ride_day,
          count(*) filter (where r.split_reversed_at is null) as ride_count,
          sum(r.fare) filter (where r.split_reversed_at is null) as gross,
          sum(r.platform_share) filter (where r.split_reversed_at is null) as platform,
          sum(r.driver_earning) filter (where r.split_reversed_at is null) as driver
        from public.rides r
        where r.created_at >= current_date - 6
        group by r.created_at::date
      ) daily on daily.ride_day = days.day::date
    ), '[]'::jsonb),
    'rideSplits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'fare', recent.fare,
        'platformShare', recent.platform_share,
        'driverEarning', recent.driver_earning,
        'status', recent.status,
        'reversed', recent.split_reversed_at is not null,
        'createdAt', recent.created_at,
        'riderName', rider.full_name,
        'driverName', driver.full_name
      ) order by recent.created_at desc)
      from (
        select r.id, r.fare, r.platform_share, r.driver_earning, r.status, r.split_reversed_at, r.created_at, r.rider_id, r.driver_id
        from public.rides r
        order by r.created_at desc
        limit 50
      ) recent
      left join public.user_profiles rider on rider.id = recent.rider_id
      left join public.drivers driver on driver.user_id = recent.driver_id
    ), '[]'::jsonb)
  ) into result
  from public.rides r;

  return result;
end;
$$;

create or replace function public.driver_financial_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null or public.current_app_role() <> 'driver'::public.app_role then
    raise exception 'Driver authentication required';
  end if;

  select jsonb_build_object(
    'completedCount', count(*) filter (where r.status = 'COMPLETED'),
    'completedEarnings', coalesce(sum(r.driver_earning) filter (where r.status = 'COMPLETED'), 0),
    'activeCount', count(*) filter (where r.status in ('NEW', 'ACCEPTED', 'STARTED', 'ARRIVED')),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', days.day::date,
        'rides', coalesce(daily.ride_count, 0),
        'earnings', coalesce(daily.earnings, 0)
      ) order by days.day)
      from generate_series(current_date - 6, current_date, interval '1 day') as days(day)
      left join (
        select         r.completed_at::date as ride_day,
          count(*) as ride_count,
          sum(r.driver_earning) as earnings
        from public.rides r
        where r.driver_id = current_user_id
          and r.status = 'COMPLETED'
        and r.completed_at >= current_date - 6
        group by r.completed_at::date
      ) daily on daily.ride_day = days.day::date
    ), '[]'::jsonb)
  ) into result
  from public.rides r
  where r.driver_id = current_user_id
    and r.status not in ('CANCELLED', 'DECLINED');

  return result;
end;
$$;

revoke all on function public.admin_financial_summary() from public;
revoke all on function public.driver_financial_summary() from public;
grant execute on function public.admin_financial_summary() to authenticated;
grant execute on function public.driver_financial_summary() to authenticated;

revoke select on public.rides from authenticated;
grant select (
  id, rider_id, driver_id, from_place, to_place, phone, status, lat, lng, fare,
  created_at, accepted_at, started_at, completed_at
) on public.rides to authenticated;
