insert into storage.buckets (id, name, public)
values ('worker-cookies', 'worker-cookies', false)
on conflict (id) do nothing;

create policy "worker_cookies_admin_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'worker-cookies' and public.has_role(auth.uid(), 'admin'));

create policy "worker_cookies_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'worker-cookies' and public.has_role(auth.uid(), 'admin'));

create policy "worker_cookies_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'worker-cookies' and public.has_role(auth.uid(), 'admin'));

create policy "worker_cookies_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'worker-cookies' and public.has_role(auth.uid(), 'admin'));