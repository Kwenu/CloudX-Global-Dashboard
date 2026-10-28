-- CloudX Global — authorization helpers, Row-Level Security and storage policies

-- ---------------------------------------------------------------- helpers
create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select m.company_id
  from public.company_members m
  join public.profiles p on p.id = m.user_id
  where m.user_id = auth.uid() and m.status = 'active' and p.status = 'active'
  order by m.created_at
  limit 1;
$$;

create or replace function public.is_active_member(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members m
    join public.profiles p on p.id = m.user_id
    where m.company_id = p_company and m.user_id = auth.uid()
      and m.status = 'active' and p.status = 'active'
  );
$$;

create or replace function public.has_permission(p_company uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members m
    join public.profiles p on p.id = m.user_id
    join public.role_permissions rp on rp.role = m.role
    where m.company_id = p_company and m.user_id = auth.uid()
      and m.status = 'active' and p.status = 'active'
      and rp.permission = p_permission
  );
$$;

-- Prevent clients from changing ownership columns
create or replace function public.protect_ownership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.company_id := old.company_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger clients_protect before update on public.clients
  for each row execute function public.protect_ownership();
create trigger maintenance_plans_protect before update on public.maintenance_plans
  for each row execute function public.protect_ownership();

create or replace function public.validate_plan_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and not exists (
    select 1 from public.company_members where company_id = new.company_id and user_id = new.assigned_to
  ) then
    raise exception 'The responsible director must be a member of the workspace' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients where id = new.client_id and company_id = new.company_id) then
    raise exception 'Select a valid client' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger maintenance_plans_validate before insert or update on public.maintenance_plans
  for each row execute function public.validate_plan_assignee();

create or replace function public.protect_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.company_id := old.company_id;
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger company_settings_protect before update on public.company_settings
  for each row execute function public.protect_settings();

-- ---------------------------------------------------------------- RLS
alter table public.companies enable row level security;
alter table public.company_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.company_members enable row level security;
alter table public.role_permissions enable row level security;
alter table public.clients enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.maintenance_plans enable row level security;
alter table public.maintenance_activities enable row level security;
alter table public.maintenance_billing_periods enable row level security;
alter table public.document_activity enable row level security;
alter table public.document_sequences enable row level security;

create policy companies_select on public.companies for select to authenticated
  using (public.is_active_member(id));

create policy settings_select on public.company_settings for select to authenticated
  using (public.is_active_member(company_id));
create policy settings_update on public.company_settings for update to authenticated
  using (public.has_permission(company_id, 'settings.write'))
  with check (public.has_permission(company_id, 'settings.write'));

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid() or exists (
      select 1 from public.company_members me
      join public.company_members them on them.company_id = me.company_id
      where me.user_id = auth.uid() and me.status = 'active' and them.user_id = profiles.id
    )
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Memberships are readable by members; writes only happen through SECURITY DEFINER functions
-- and the invite-director Edge Function, so nobody can add or promote themselves.
create policy members_select on public.company_members for select to authenticated
  using (user_id = auth.uid() or public.is_active_member(company_id));

create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

create policy clients_select on public.clients for select to authenticated
  using (public.is_active_member(company_id));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.has_permission(company_id, 'clients.write') and created_by = auth.uid());
create policy clients_update on public.clients for update to authenticated
  using (public.has_permission(company_id, 'clients.write'))
  with check (public.has_permission(company_id, 'clients.write'));

create policy quotations_select on public.quotations for select to authenticated
  using (public.is_active_member(company_id));
create policy quotation_items_select on public.quotation_items for select to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_id and public.is_active_member(q.company_id)));

create policy invoices_select on public.invoices for select to authenticated
  using (public.is_active_member(company_id));
create policy invoice_items_select on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_active_member(i.company_id)));

create policy payments_select on public.payments for select to authenticated
  using (public.is_active_member(company_id));

create policy plans_select on public.maintenance_plans for select to authenticated
  using (public.is_active_member(company_id));
create policy plans_insert on public.maintenance_plans for insert to authenticated
  with check (public.has_permission(company_id, 'maintenance.write') and created_by = auth.uid());
create policy plans_update on public.maintenance_plans for update to authenticated
  using (public.has_permission(company_id, 'maintenance.write'))
  with check (public.has_permission(company_id, 'maintenance.write'));

create policy activities_select on public.maintenance_activities for select to authenticated
  using (exists (select 1 from public.maintenance_plans p where p.id = plan_id and public.is_active_member(p.company_id)));
create policy periods_select on public.maintenance_billing_periods for select to authenticated
  using (exists (select 1 from public.maintenance_plans p where p.id = plan_id and public.is_active_member(p.company_id)));

create policy activity_select on public.document_activity for select to authenticated
  using (public.is_active_member(company_id));

-- document_sequences: no policies → no direct access.

-- ---------------------------------------------------------------- grants
revoke all on all tables in schema public from anon;
revoke insert, update, delete on
  public.companies, public.company_members, public.role_permissions,
  public.quotations, public.quotation_items, public.invoices, public.invoice_items,
  public.payments, public.maintenance_activities, public.maintenance_billing_periods,
  public.document_activity, public.document_sequences
from authenticated;
revoke delete on public.clients, public.maintenance_plans, public.company_settings, public.profiles from authenticated;
revoke insert on public.company_settings, public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, job_title) on public.profiles to authenticated;

-- ---------------------------------------------------------------- storage (private company assets)
insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', false)
on conflict (id) do nothing;

create policy "company assets: members read" on storage.objects for select to authenticated
  using (bucket_id = 'company-assets' and public.is_active_member(((storage.foldername(name))[1])::uuid));
create policy "company assets: settings writers upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-assets' and public.has_permission(((storage.foldername(name))[1])::uuid, 'settings.write'));
create policy "company assets: settings writers update" on storage.objects for update to authenticated
  using (bucket_id = 'company-assets' and public.has_permission(((storage.foldername(name))[1])::uuid, 'settings.write'));
create policy "company assets: settings writers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'company-assets' and public.has_permission(((storage.foldername(name))[1])::uuid, 'settings.write'));
