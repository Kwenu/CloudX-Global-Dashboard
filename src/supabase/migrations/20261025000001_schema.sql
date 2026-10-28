-- CloudX Global — core schema
-- Run with: supabase db push   (or paste into the SQL editor in order)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type public.member_role as enum ('owner','admin','director','accountant','staff','viewer');
create type public.member_status as enum ('active','invited','suspended');
create type public.invoice_status as enum ('draft','issued','partially_paid','paid','overdue','cancelled');
create type public.quotation_status as enum ('draft','sent','accepted','rejected','expired','converted');
create type public.billing_frequency as enum ('monthly','quarterly','half_yearly','annually','custom');
create type public.maintenance_status as enum ('active','completed','on_hold','cancelled');
create type public.payment_method as enum ('bank_transfer','cash','cheque','card','online','other');
create type public.billing_period_status as enum ('invoiced','paid','void');

-- ---------------------------------------------------------------- shared helpers
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- companies & settings
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  company_name text not null,
  logo_path text,
  address text,
  email text,
  phone text,
  website text,
  registration_number text,
  default_currency text not null default 'LKR',
  default_payment_terms text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_branch text,
  payment_instructions text,
  default_invoice_notes text,
  default_invoice_terms text,
  default_quotation_notes text,
  default_quotation_terms text,
  quotation_validity_days integer not null default 30 check (quotation_validity_days between 1 and 365),
  quotation_slogan text,
  invoice_prefix text not null default 'CX' check (invoice_prefix ~ '^[A-Za-z0-9]{1,10}$'),
  quotation_prefix text not null default 'CXQ' check (quotation_prefix ~ '^[A-Za-z0-9]{1,10}$'),
  number_padding integer not null default 4 check (number_padding between 3 and 8),
  number_include_year boolean not null default true,
  maintenance_default_frequency public.billing_frequency not null default 'monthly',
  maintenance_default_currency text not null default 'LKR',
  maintenance_due_soon_days integer not null default 7 check (maintenance_due_soon_days between 0 and 90),
  maintenance_default_terms text,
  maintenance_default_description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  check (invoice_prefix <> quotation_prefix)
);
create trigger company_settings_touch before update on public.company_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- people
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  job_title text,
  email text,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'director',
  status public.member_status not null default 'invited',
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_idx on public.company_members(user_id);

create table public.role_permissions (
  role public.member_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into public.role_permissions (role, permission)
select r.role::public.member_role, p.permission
from (values ('owner'),('admin'),('director')) r(role)
cross join (values ('workspace.read'),('clients.write'),('documents.write'),('payments.write'),
                   ('maintenance.write'),('settings.write')) p(permission);
insert into public.role_permissions (role, permission) values
  ('owner','members.manage'), ('admin','members.manage'),
  ('accountant','workspace.read'), ('accountant','clients.write'), ('accountant','documents.write'), ('accountant','payments.write'),
  ('staff','workspace.read'), ('staff','clients.write'), ('staff','maintenance.write'),
  ('viewer','workspace.read');

-- Create a profile automatically for every new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- clients
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  business_name text,
  email text,
  phone text,
  billing_address text,
  tax_id text,
  notes text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_company_idx on public.clients(company_id);
create index clients_name_idx on public.clients(company_id, lower(name));
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- quotations
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quotation_number text not null,
  client_id uuid not null references public.clients(id) on delete restrict,
  issue_date date not null default current_date,
  valid_until date not null,
  project_title text,
  project_description text,
  scope_of_work text,
  deliverables text,
  payment_schedule text,
  currency text not null default 'LKR',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  additional_charges numeric(14,2) not null default 0 check (additional_charges >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  status public.quotation_status not null default 'draft',
  notes text,
  terms text,
  converted_invoice_id uuid unique,
  archived_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, quotation_number),
  check (valid_until >= issue_date)
);
create index quotations_company_idx on public.quotations(company_id, issue_date desc);
create index quotations_client_idx on public.quotations(client_id);
create index quotations_status_idx on public.quotations(company_id, status);
create trigger quotations_touch before update on public.quotations
  for each row execute function public.touch_updated_at();

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  description text not null,
  details text not null default '',
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  line_total numeric(14,2) not null,
  position integer not null default 0
);
create index quotation_items_doc_idx on public.quotation_items(quotation_id, position);

-- ---------------------------------------------------------------- invoices
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_number text not null,
  client_id uuid not null references public.clients(id) on delete restrict,
  issue_date date not null default current_date,
  due_date date not null,
  currency text not null default 'LKR',
  project_reference text,
  payment_terms text,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  additional_charges numeric(14,2) not null default 0 check (additional_charges >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  balance_due numeric(14,2) generated always as (total - amount_paid) stored,
  status public.invoice_status not null default 'draft',
  notes text,
  terms text,
  quotation_id uuid unique references public.quotations(id) on delete set null,
  maintenance_plan_id uuid,
  billing_period_id uuid unique,
  archived_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, invoice_number),
  check (due_date >= issue_date),
  check (amount_paid <= total)
);
create index invoices_company_idx on public.invoices(company_id, issue_date desc);
create index invoices_client_idx on public.invoices(client_id);
create index invoices_status_idx on public.invoices(company_id, status, due_date);
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

alter table public.quotations
  add constraint quotations_converted_invoice_fk
  foreign key (converted_invoice_id) references public.invoices(id) on delete set null;

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  details text not null default '',
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  line_total numeric(14,2) not null,
  position integer not null default 0
);
create index invoice_items_doc_idx on public.invoice_items(invoice_id, position);

-- ---------------------------------------------------------------- payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method not null default 'bank_transfer',
  reference text,
  notes text,
  recorded_by uuid references public.profiles(id),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);
create index payments_company_idx on public.payments(company_id, payment_date desc);
create index payments_invoice_idx on public.payments(invoice_id);

-- ---------------------------------------------------------------- maintenance
create table public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  project_name text not null check (length(trim(project_name)) > 0),
  project_url text,
  service_type text not null,
  description text,
  start_date date not null,
  last_maintenance_date date,
  next_maintenance_date date,
  charge numeric(14,2) not null default 0 check (charge >= 0),
  currency text not null default 'LKR',
  billing_frequency public.billing_frequency not null default 'monthly',
  custom_interval_days integer check (custom_interval_days is null or custom_interval_days between 1 and 1095),
  payment_terms text,
  assigned_to uuid references public.profiles(id),
  status public.maintenance_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id) default auth.uid(),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (billing_frequency <> 'custom' or custom_interval_days is not null)
);
create index maintenance_plans_company_idx on public.maintenance_plans(company_id, next_maintenance_date);
create index maintenance_plans_client_idx on public.maintenance_plans(client_id);
create trigger maintenance_plans_touch before update on public.maintenance_plans
  for each row execute function public.touch_updated_at();

create table public.maintenance_activities (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.maintenance_plans(id) on delete cascade,
  completed_on date not null,
  work_performed text not null,
  assigned_to uuid references public.profiles(id),
  notes text,
  next_scheduled_date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index maintenance_activities_plan_idx on public.maintenance_activities(plan_id, completed_on desc);

create table public.maintenance_billing_periods (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.maintenance_plans(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  invoice_id uuid unique references public.invoices(id) on delete set null,
  status public.billing_period_status not null default 'invoiced',
  created_at timestamptz not null default now(),
  -- one invoice per plan per billing period
  unique (plan_id, period_start),
  check (period_end >= period_start)
);
create index billing_periods_plan_idx on public.maintenance_billing_periods(plan_id, period_start desc);

alter table public.invoices
  add constraint invoices_maintenance_plan_fk foreign key (maintenance_plan_id)
    references public.maintenance_plans(id) on delete set null,
  add constraint invoices_billing_period_fk foreign key (billing_period_id)
    references public.maintenance_billing_periods(id) on delete set null;

-- ---------------------------------------------------------------- audit trail
create table public.document_activity (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null check (entity_type in ('invoice','quotation','client','payment','maintenance_plan','settings','member')),
  entity_id uuid,
  action text not null,
  summary text not null,
  actor_id uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index document_activity_company_idx on public.document_activity(company_id, created_at desc);
create index document_activity_entity_idx on public.document_activity(entity_id, created_at desc);

-- ---------------------------------------------------------------- numbering
create table public.document_sequences (
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_type text not null check (doc_type in ('invoice','quotation')),
  seq_year integer not null,
  last_value integer not null default 0,
  primary key (company_id, doc_type, seq_year)
);
