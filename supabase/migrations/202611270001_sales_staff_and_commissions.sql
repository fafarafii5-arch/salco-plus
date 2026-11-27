create table if not exists public.sales_staff (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_manager boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_staff_branch_name_unique unique (branch_id, name)
);

create unique index if not exists sales_staff_one_manager_per_branch
  on public.sales_staff(branch_id) where is_manager and is_active;

alter table public.sales_staff enable row level security;
grant select, insert, update, delete on public.sales_staff to authenticated;

drop policy if exists "branch members can read sales staff" on public.sales_staff;
create policy "branch members can read sales staff"
  on public.sales_staff for select to authenticated
  using ((select private.is_branch_member(branch_id)));

drop policy if exists "branch managers can insert sales staff" on public.sales_staff;
create policy "branch managers can insert sales staff"
  on public.sales_staff for insert to authenticated
  with check (
    (select private.is_branch_member(branch_id))
    and exists (
      select 1 from public.branch_memberships bm
      where bm.branch_id = sales_staff.branch_id
        and bm.user_id = (select auth.uid())
        and bm.role in ('owner','manager')
    )
  );

drop policy if exists "branch managers can update sales staff" on public.sales_staff;
create policy "branch managers can update sales staff"
  on public.sales_staff for update to authenticated
  using (
    (select private.is_branch_member(branch_id))
    and exists (
      select 1 from public.branch_memberships bm
      where bm.branch_id = sales_staff.branch_id
        and bm.user_id = (select auth.uid())
        and bm.role in ('owner','manager')
    )
  )
  with check (
    (select private.is_branch_member(branch_id))
    and exists (
      select 1 from public.branch_memberships bm
      where bm.branch_id = sales_staff.branch_id
        and bm.user_id = (select auth.uid())
        and bm.role in ('owner','manager')
    )
  );

drop policy if exists "branch managers can delete sales staff" on public.sales_staff;
create policy "branch managers can delete sales staff"
  on public.sales_staff for delete to authenticated
  using (
    (select private.is_branch_member(branch_id))
    and exists (
      select 1 from public.branch_memberships bm
      where bm.branch_id = sales_staff.branch_id
        and bm.user_id = (select auth.uid())
        and bm.role in ('owner','manager')
    )
  );

insert into public.sales_staff(branch_id, name)
select distinct s.branch_id, trim(s.seller_name)
from public.sales s
where nullif(trim(coalesce(s.seller_name,'')), '') is not null
on conflict (branch_id, name) do nothing;
