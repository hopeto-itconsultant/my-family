-- Phone login looks up auth.users.email on the server with the service-role
-- key (app/src/lib/phone-login.ts). Nothing callable by anon may return a
-- member's email.
--
-- shadow_email_for_phone was SECURITY INVOKER, granted to anon, and called
-- public.normalize_phone. Migration 0010 revoked anon's execute on
-- normalize_phone, so the RPC failed with "permission denied" and the app
-- showed "Sign-in service unavailable". The function also never read
-- auth.users: it always returned OFH-<phone>@phone.invalid, so an account
-- whose login email is a real address could not sign in by mobile.
--
-- Drop the RPC. Take back execute on normalize_phone from anon and public.
-- That revoke is idempotent: it removes a direct anon grant (including one
-- applied by hand in production) when the grant is present, and it is a no-op
-- when anon was never granted the function.
-- authenticated and service_role keep whatever execute they already have;
-- the generated phone_normalized column and handle_new_user need the
-- normalizer, and it does not read any row.
--
-- Safe to re-run.

drop function if exists public.shadow_email_for_phone(text);

revoke execute on function public.normalize_phone(text) from public;
revoke execute on function public.normalize_phone(text) from anon;
