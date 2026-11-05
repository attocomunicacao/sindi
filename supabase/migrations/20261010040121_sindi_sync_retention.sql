create function public.record_sindi_sync(summary jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.sindi_sync_runs(summary) values(summary);
  delete from public.sindi_sync_runs where id not in (select id from public.sindi_sync_runs order by id desc limit 100);
end $$;
revoke all on function public.record_sindi_sync(jsonb) from public,anon,authenticated;
grant execute on function public.record_sindi_sync(jsonb) to service_role;
