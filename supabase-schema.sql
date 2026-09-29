+create table if not exists public.studentos_user_data (
+  user_id uuid not null references auth.users (id) on delete cascade,
+  data_key text not null,
+  value jsonb not null,
+  updated_at timestamptz not null default now(),
+  primary key (user_id, data_key)
+);
+
+alter table public.studentos_user_data enable row level security;
+
+drop policy if exists "Users can read their own StudentOS data" on public.studentos_user_data;
+create policy "Users can read their own StudentOS data"
+  on public.studentos_user_data for select to authenticated
+  using ((select auth.uid()) = user_id);
+
+drop policy if exists "Users can insert their own StudentOS data" on public.studentos_user_data;
+create policy "Users can insert their own StudentOS data"
+  on public.studentos_user_data for insert to authenticated
+  with check ((select auth.uid()) = user_id);
+
+drop policy if exists "Users can update their own StudentOS data" on public.studentos_user_data;
+create policy "Users can update their own StudentOS data"
+  on public.studentos_user_data for update to authenticated
+  using ((select auth.uid()) = user_id)
+  with check ((select auth.uid()) = user_id);
+
+drop policy if exists "Users can delete their own StudentOS data" on public.studentos_user_data;
+create policy "Users can delete their own StudentOS data"
+  on public.studentos_user_data for delete to authenticated
+  using ((select auth.uid()) = user_id);
+
+grant select, insert, update, delete on public.studentos_user_data to authenticated;