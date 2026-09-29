-- Shared, multi-tenant Institute data for StudentOS.
-- Apply after supabase-schema.sql. Module settings control visibility only;
-- disabling a module never deletes its records.

create extension if not exists pgcrypto;

create table if not exists public.institutes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  program text not null default '',
  academic_year text not null default '',
  subscription_status text not null default 'active'
    check (subscription_status in ('active', 'trial', 'inactive')),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only a trusted billing webhook or service-role process writes entitlements.
-- The frontend can read its own status but cannot grant itself an admin role.
create table if not exists public.institute_subscription_entitlements (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  provider_subscription_id text not null unique,
  status text not null check (status in ('active', 'trial', 'canceled', 'expired')),
  valid_until timestamptz,
  institute_id uuid unique references public.institutes (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists institute_unclaimed_entitlement_idx
  on public.institute_subscription_entitlements (owner_user_id)
  where institute_id is null and status in ('active', 'trial');

create table if not exists public.institute_classes (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  name text not null,
  section text not null default '',
  academic_year text not null default '',
  created_at timestamptz not null default now(),
  unique (institute_id, name, section, academic_year),
  unique (institute_id, id)
);

create table if not exists public.institute_memberships (
  institute_id uuid not null references public.institutes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'teacher', 'student', 'parent')),
  class_id uuid,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (institute_id, user_id),
  foreign key (institute_id, class_id)
    references public.institute_classes (institute_id, id)
);

create index if not exists institute_memberships_user_idx
  on public.institute_memberships (user_id, institute_id);
create index if not exists institute_memberships_class_idx
  on public.institute_memberships (institute_id, class_id, role);

create table if not exists public.institute_parent_links (
  institute_id uuid not null,
  parent_user_id uuid not null,
  student_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (institute_id, parent_user_id, student_user_id),
  foreign key (institute_id, parent_user_id)
    references public.institute_memberships (institute_id, user_id) on delete cascade,
  foreign key (institute_id, student_user_id)
    references public.institute_memberships (institute_id, user_id) on delete cascade,
  check (parent_user_id <> student_user_id)
);

create table if not exists public.institute_module_settings (
  institute_id uuid not null references public.institutes (id) on delete cascade,
  module_key text not null check (module_key ~ '^[a-z0-9][a-z0-9-]*$'),
  enabled boolean not null default false,
  visible_to_roles text[] not null default array['admin', 'teacher', 'student', 'parent'],
  editable_by_roles text[] not null default array['admin'],
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (institute_id, module_key),
  check (visible_to_roles <@ array['admin', 'teacher', 'student', 'parent']::text[]),
  check (editable_by_roles <@ array['admin', 'teacher', 'student', 'parent']::text[])
);

create table if not exists public.institute_invitations (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  email text not null,
  role text not null check (role in ('teacher', 'student', 'parent')),
  class_id uuid,
  invited_by uuid not null references auth.users (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  foreign key (institute_id, class_id)
    references public.institute_classes (institute_id, id)
);

create unique index if not exists institute_pending_invitation_email_idx
  on public.institute_invitations (institute_id, lower(email)) where status = 'pending';

-- Existing StudentOS users remain the identity/profile source. Records reference
-- auth user IDs, allowing institute data to join existing user-owned study data.
create table if not exists public.institute_records (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  module_key text not null,
  class_id uuid,
  student_user_id uuid references auth.users (id) on delete set null,
  subject_id text,
  source_user_id uuid references auth.users (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (institute_id, module_key)
    references public.institute_module_settings (institute_id, module_key) on delete restrict,
  foreign key (institute_id, class_id)
    references public.institute_classes (institute_id, id)
);

create index if not exists institute_records_module_idx
  on public.institute_records (institute_id, module_key, created_at desc);
create index if not exists institute_records_student_idx
  on public.institute_records (institute_id, student_user_id, module_key);
create index if not exists institute_records_class_idx
  on public.institute_records (institute_id, class_id, module_key);

create or replace function public.is_institute_member(p_institute_id uuid)
returns boolean
language sql stable security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.institute_memberships m
    where m.institute_id = p_institute_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_institute_role(p_institute_id uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.institute_memberships m
    where m.institute_id = p_institute_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

create or replace function public.can_view_institute_record(
  p_institute_id uuid,
  p_module_key text,
  p_class_id uuid,
  p_student_user_id uuid
)
returns boolean
language sql stable security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.institute_memberships m
    join public.institute_module_settings s
      on s.institute_id = m.institute_id and s.module_key = p_module_key
    where m.institute_id = p_institute_id
      and m.user_id = auth.uid()
      and s.enabled
      and m.role = any (s.visible_to_roles)
      and case m.role
        when 'admin' then true
        when 'teacher' then p_class_id is null or m.class_id = p_class_id
        when 'student' then p_student_user_id = auth.uid()
          and (p_class_id is null or m.class_id = p_class_id)
        when 'parent' then p_student_user_id is not null and exists (
          select 1 from public.institute_parent_links l
          where l.institute_id = p_institute_id
            and l.parent_user_id = auth.uid()
            and l.student_user_id = p_student_user_id
        )
        else false
      end
  );
$$;

create or replace function public.can_edit_institute_record(
  p_institute_id uuid,
  p_module_key text,
  p_class_id uuid,
  p_student_user_id uuid
)
returns boolean
language sql stable security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.institute_memberships m
    join public.institute_module_settings s
      on s.institute_id = m.institute_id and s.module_key = p_module_key
    where m.institute_id = p_institute_id
      and m.user_id = auth.uid()
      and s.enabled
      and m.role = any (s.editable_by_roles)
      and case m.role
        when 'admin' then true
        when 'teacher' then p_class_id is not null and m.class_id = p_class_id
        when 'student' then p_module_key = 'doubts'
          and p_student_user_id = auth.uid()
          and (p_class_id is null or m.class_id = p_class_id)
        else false
      end
  );
$$;

-- Return only students the caller is allowed to see through the enabled
-- progress module: institute admins, assigned-class teachers, the student,
-- or a linked parent.
create or replace function public.get_institute_visible_students(p_institute_id uuid)
returns table (user_id uuid, display_name text, class_id uuid)
language sql stable security definer
set search_path = public, auth, pg_temp
as $$
  select student.user_id, student.display_name, student.class_id
  from public.institute_memberships student
  where student.institute_id = p_institute_id
    and student.role = 'student'
    and public.can_view_institute_record(
      p_institute_id,
      'progress-tracking',
      student.class_id,
      student.user_id
    )
    and (
      not public.has_institute_role(p_institute_id, array['teacher'])
      or student.class_id is not null
    );
$$;

-- Read live StudentOS progress in place instead of copying it into Institute
-- records. The explicit key allowlist keeps this RPC scoped to progress data.
create or replace function public.get_institute_studentos_progress(
  p_institute_id uuid,
  p_student_user_id uuid,
  p_data_keys text[] default array['studentos:sessions', 'studentos:topic-status:jee']
)
returns table (data_key text, value jsonb)
language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not coalesce(
    p_data_keys <@ array['studentos:sessions', 'studentos:topic-status:jee']::text[],
    false
  ) then
    raise exception 'Only StudentOS study progress keys are available';
  end if;

  if not exists (
    select 1 from public.get_institute_visible_students(p_institute_id) visible
    where visible.user_id = p_student_user_id
  ) then
    raise exception 'You do not have access to this student progress';
  end if;

  return query
    select stored.data_key, stored.value
    from public.studentos_user_data stored
    where stored.user_id = p_student_user_id
      and stored.data_key = any (p_data_keys);
end;
$$;

create or replace function public.add_institute_creator_as_admin()
returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  update public.institute_subscription_entitlements
    set institute_id = new.id, updated_at = now()
    where owner_user_id = new.created_by
      and institute_id is null
      and status in ('active', 'trial')
      and (valid_until is null or valid_until > now());
  if not found then
    raise exception 'An active Institute subscription is required';
  end if;

  insert into public.institute_memberships (institute_id, user_id, role, display_name)
  values (new.id, new.created_by, 'admin', coalesce(auth.jwt() ->> 'name', 'Institute Admin'))
  on conflict (institute_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists institute_creator_membership on public.institutes;
create trigger institute_creator_membership
after insert on public.institutes
for each row execute function public.add_institute_creator_as_admin();

create or replace function public.accept_institute_invitations()
returns setof public.institute_memberships
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  pending public.institute_invitations%rowtype;
  accepted public.institute_memberships%rowtype;
begin
  if auth.uid() is null or auth.jwt() ->> 'email' is null then
    raise exception 'Authentication is required';
  end if;

  for pending in
    select * from public.institute_invitations i
    where lower(i.email) = lower(auth.jwt() ->> 'email') and i.status = 'pending'
    for update
  loop
    insert into public.institute_memberships (institute_id, user_id, role, class_id, display_name)
    values (pending.institute_id, auth.uid(), pending.role, pending.class_id,
      coalesce(auth.jwt() ->> 'name', split_part(auth.jwt() ->> 'email', '@', 1)))
    on conflict (institute_id, user_id) do nothing;

    update public.institute_invitations
      set status = 'accepted', accepted_at = now()
      where id = pending.id;

    select * into accepted from public.institute_memberships
      where institute_id = pending.institute_id and user_id = auth.uid();
    return next accepted;
  end loop;
end;
$$;

alter table public.institutes enable row level security;
alter table public.institute_subscription_entitlements enable row level security;
alter table public.institute_classes enable row level security;
alter table public.institute_memberships enable row level security;
alter table public.institute_parent_links enable row level security;
alter table public.institute_module_settings enable row level security;
alter table public.institute_invitations enable row level security;
alter table public.institute_records enable row level security;

create policy "Institute members can read their institute"
  on public.institutes for select to authenticated
  using (public.is_institute_member(id));
create policy "Authenticated users can create an institute"
  on public.institutes for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.institute_subscription_entitlements e
      where e.owner_user_id = auth.uid()
        and e.institute_id is null
        and e.status in ('active', 'trial')
        and (e.valid_until is null or e.valid_until > now())
    )
  );
create policy "Institute admins can update their institute"
  on public.institutes for update to authenticated
  using (public.has_institute_role(id, array['admin']))
  with check (public.has_institute_role(id, array['admin']));

create policy "Users can read their own Institute subscription status"
  on public.institute_subscription_entitlements for select to authenticated
  using (owner_user_id = auth.uid());
revoke all on public.institute_subscription_entitlements from anon, authenticated;
grant select on public.institute_subscription_entitlements to authenticated;
grant select, insert, update, delete on public.institute_subscription_entitlements to service_role;

create policy "Institute members can read classes"
  on public.institute_classes for select to authenticated
  using (public.is_institute_member(institute_id));
create policy "Institute admins can manage classes"
  on public.institute_classes for all to authenticated
  using (public.has_institute_role(institute_id, array['admin']))
  with check (public.has_institute_role(institute_id, array['admin']));

create policy "Members can read their own membership and admins can read all"
  on public.institute_memberships for select to authenticated
  using (user_id = auth.uid() or public.has_institute_role(institute_id, array['admin']));
create policy "Institute admins can add memberships"
  on public.institute_memberships for insert to authenticated
  with check (public.has_institute_role(institute_id, array['admin']));
create policy "Institute admins can update memberships"
  on public.institute_memberships for update to authenticated
  using (public.has_institute_role(institute_id, array['admin']))
  with check (public.has_institute_role(institute_id, array['admin']));
create policy "Institute admins can remove memberships"
  on public.institute_memberships for delete to authenticated
  using (public.has_institute_role(institute_id, array['admin']));

create policy "Parents and admins can read parent links"
  on public.institute_parent_links for select to authenticated
  using (parent_user_id = auth.uid() or public.has_institute_role(institute_id, array['admin']));
create policy "Institute admins can manage parent links"
  on public.institute_parent_links for all to authenticated
  using (public.has_institute_role(institute_id, array['admin']))
  with check (public.has_institute_role(institute_id, array['admin']));

create policy "Institute members can read module settings"
  on public.institute_module_settings for select to authenticated
  using (public.is_institute_member(institute_id));
create policy "Institute admins can add module settings"
  on public.institute_module_settings for insert to authenticated
  with check (public.has_institute_role(institute_id, array['admin']));
create policy "Institute admins can update module settings"
  on public.institute_module_settings for update to authenticated
  using (public.has_institute_role(institute_id, array['admin']))
  with check (public.has_institute_role(institute_id, array['admin']));

create policy "Admins and invitees can read invitations"
  on public.institute_invitations for select to authenticated
  using (
    public.has_institute_role(institute_id, array['admin'])
    or lower(email) = lower(auth.jwt() ->> 'email')
  );
create policy "Institute admins can create invitations"
  on public.institute_invitations for insert to authenticated
  with check (
    public.has_institute_role(institute_id, array['admin'])
    and invited_by = auth.uid()
    and status = 'pending'
  );
create policy "Institute admins can update invitations"
  on public.institute_invitations for update to authenticated
  using (public.has_institute_role(institute_id, array['admin']))
  with check (public.has_institute_role(institute_id, array['admin']));

create policy "Members can read permitted enabled institute records"
  on public.institute_records for select to authenticated
  using (public.can_view_institute_record(institute_id, module_key, class_id, student_user_id));
create policy "Editors can insert enabled institute records"
  on public.institute_records for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_edit_institute_record(institute_id, module_key, class_id, student_user_id)
  );
create policy "Editors can update enabled institute records"
  on public.institute_records for update to authenticated
  using (public.can_edit_institute_record(institute_id, module_key, class_id, student_user_id))
  with check (public.can_edit_institute_record(institute_id, module_key, class_id, student_user_id));

revoke all on function public.is_institute_member(uuid) from public;
revoke all on function public.has_institute_role(uuid, text[]) from public;
revoke all on function public.can_view_institute_record(uuid, text, uuid, uuid) from public;
revoke all on function public.can_edit_institute_record(uuid, text, uuid, uuid) from public;
revoke all on function public.get_institute_visible_students(uuid) from public;
revoke all on function public.get_institute_studentos_progress(uuid, uuid, text[]) from public;
revoke all on function public.add_institute_creator_as_admin() from public;
revoke all on function public.accept_institute_invitations() from public;
grant execute on function public.is_institute_member(uuid) to authenticated;
grant execute on function public.has_institute_role(uuid, text[]) to authenticated;
grant execute on function public.can_view_institute_record(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.can_edit_institute_record(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.get_institute_visible_students(uuid) to authenticated;
grant execute on function public.get_institute_studentos_progress(uuid, uuid, text[]) to authenticated;
grant execute on function public.accept_institute_invitations() to authenticated;
