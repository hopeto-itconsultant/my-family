do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prokind='f' loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.proname = 'custom_access_token_hook' then
      execute format('revoke execute on function %s from authenticated', r.sig);
      execute format('grant execute on function %s to supabase_auth_admin', r.sig);
    elsif r.proname in ('jwt_role','is_treasurer_or_admin','is_treasurer',
      'approve_expense','declare_contribution','import_statement_batch','mark_contribution_sent',
      'match_statement_row','pay_expense','reconcile_as_of','reject_contribution','reject_expense',
      'reverse_contribution','reverse_expense','unmatch_statement_row','verify_contribution') then
      execute format('grant execute on function %s to authenticated', r.sig);
    else
      execute format('revoke execute on function %s from authenticated', r.sig);
    end if;
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter view public.tree_edges set (security_invoker = true);
alter view public.fund_summary set (security_invoker = true);
alter view public.branch_month_collection set (security_invoker = true);
alter function public.touch_event() set search_path = '';
alter function public.is_treasurer_or_admin() set search_path = '';
alter function public.custom_access_token_hook(jsonb) set search_path = '';
