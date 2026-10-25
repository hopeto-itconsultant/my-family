create or replace function public.custom_access_token_hook(event jsonb) returns jsonb language plpgsql stable as $$
declare claims jsonb; user_role public.family_role;
begin
  select role into user_role from public.profiles where id = (event->>'user_id')::uuid;
  claims := event->'claims';
  if jsonb_typeof(claims->'app_metadata') is null then claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb); end if;
  claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(coalesce(user_role,'member'::public.family_role)::text));
  return jsonb_set(event, '{claims}', claims);
end; $$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on table public.profiles to supabase_auth_admin;
create policy "auth admin reads roles for token hook" on public.profiles as permissive for select to supabase_auth_admin using (true);
