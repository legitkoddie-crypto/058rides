create or replace function public.update_driver_profile(p_full_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cleaned_name text := btrim(coalesce(p_full_name, ''));
  cleaned_phone text := btrim(coalesce(p_phone, ''));
begin
  if current_user_id is null or public.current_app_role() <> 'driver'::public.app_role then
    raise exception 'Driver authentication required';
  end if;
  if char_length(cleaned_name) not between 1 and 100 then
    raise exception 'Name must be between 1 and 100 characters';
  end if;
  if char_length(cleaned_phone) not between 1 and 30 then
    raise exception 'Driver phone must be between 1 and 30 characters';
  end if;

  update public.user_profiles
  set full_name = cleaned_name, phone = cleaned_phone
  where id = current_user_id;

  update public.drivers
  set full_name = cleaned_name, phone = cleaned_phone
  where user_id = current_user_id;
  if not found then
    raise exception 'Driver profile not found';
  end if;
end;
$$;

revoke all on function public.update_driver_profile(text, text) from public;
grant execute on function public.update_driver_profile(text, text) to authenticated;
