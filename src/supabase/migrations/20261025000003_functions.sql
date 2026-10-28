-- CloudX Global — transactional business operations (all SECURITY DEFINER with explicit permission checks)

-- ---------------------------------------------------------------- internal helpers
create or replace function public.log_activity(
  p_company uuid, p_entity text, p_entity_id uuid, p_action text, p_summary text, p_meta jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.document_activity (company_id, entity_type, entity_id, action, summary, actor_id, metadata)
  values (p_company, p_entity, p_entity_id, p_action, p_summary, auth.uid(), coalesce(p_meta, '{}'::jsonb));
$$;

-- Atomic, gap-tolerant document numbering: CX-2026-0001 / CXQ-2026-0001
create or replace function public.next_document_number(p_company uuid, p_type text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prefix text; v_pad int; v_year_on boolean; v_year int; v_next int; v_candidate text; v_attempts int := 0;
begin
  select case when p_type = 'invoice' then invoice_prefix else quotation_prefix end,
         number_padding, number_include_year
    into v_prefix, v_pad, v_year_on
  from public.company_settings where company_id = p_company;
  if v_prefix is null then raise exception 'Company settings are missing'; end if;
  v_year := case when v_year_on then extract(year from current_date)::int else 0 end;

  loop
    insert into public.document_sequences (company_id, doc_type, seq_year, last_value)
    values (p_company, p_type, v_year, 1)
    on conflict (company_id, doc_type, seq_year)
      do update set last_value = public.document_sequences.last_value + 1
    returning last_value into v_next;

    v_candidate := v_prefix || '-' || case when v_year_on then v_year::text || '-' else '' end
                   || lpad(v_next::text, v_pad, '0');

    exit when not exists (
      select 1 from public.invoices where p_type = 'invoice' and company_id = p_company and invoice_number = v_candidate
      union all
      select 1 from public.quotations where p_type = 'quotation' and company_id = p_company and quotation_number = v_candidate
    );
    v_attempts := v_attempts + 1;
    if v_attempts > 100 then raise exception 'Could not allocate a document number'; end if;
  end loop;
  return v_candidate;
end $$;

create or replace function public._validate_items(
  p_items jsonb, out v_subtotal numeric, out v_discount numeric, out v_tax numeric
) language plpgsql immutable as $$
declare v_item jsonb; v_qty numeric; v_price numeric; v_disc numeric; v_rate numeric; v_gross numeric;
begin
  v_subtotal := 0; v_discount := 0; v_tax := 0;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one line item' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'description'), '') = '' then
      raise exception 'Every line item needs a description' using errcode = '22023';
    end if;
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_disc := round(coalesce((v_item->>'discount')::numeric, 0), 2);
    v_rate := coalesce((v_item->>'tax_rate')::numeric, 0);
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero' using errcode = '22023'; end if;
    if v_price < 0 or v_disc < 0 or v_rate < 0 or v_rate > 100 then
      raise exception 'Invalid price, discount or tax rate' using errcode = '22023';
    end if;
    v_gross := round(v_qty * v_price, 2);
    if v_disc > v_gross then raise exception 'A line discount cannot exceed the line amount' using errcode = '22023'; end if;
    v_subtotal := v_subtotal + v_gross;
    v_discount := v_discount + v_disc;
    v_tax := v_tax + round((v_gross - v_disc) * v_rate / 100, 2);
  end loop;
end $$;

create or replace function public.refresh_invoice_balance(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_paid numeric;
begin
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = p_id;
  update public.invoices set
    amount_paid = v_paid,
    status = case
      when status = 'cancelled' then status
      when status = 'draft' and v_paid = 0 then status
      when v_paid >= total and total > 0 then 'paid'::public.invoice_status
      when v_paid > 0 then 'partially_paid'::public.invoice_status
      else 'issued'::public.invoice_status end
  where id = p_id;

  update public.maintenance_billing_periods bp set status = case
      when i.status = 'paid' then 'paid'::public.billing_period_status
      when i.status = 'cancelled' then 'void'::public.billing_period_status
      else 'invoiced'::public.billing_period_status end
  from public.invoices i
  where i.id = p_id and bp.invoice_id = i.id;
end $$;

revoke all on function public.log_activity(uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.next_document_number(uuid, text) from public, anon, authenticated;
revoke all on function public.refresh_invoice_balance(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- invoices
create or replace function public.save_invoice(p_id uuid, p_payload jsonb, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_client uuid := nullif(p_payload->>'client_id', '')::uuid;
  v_charges numeric := round(coalesce((p_payload->>'additional_charges')::numeric, 0), 2);
  v_status text := coalesce(p_payload->>'status', 'draft');
  v_issue date := (p_payload->>'issue_date')::date;
  v_due date := (p_payload->>'due_date')::date;
  v_sub numeric; v_disc numeric; v_tax numeric; v_total numeric;
  v_id uuid; v_number text; v_existing public.invoices%rowtype;
begin
  if v_company is null or not public.has_permission(v_company, 'documents.write') then
    raise exception 'You do not have permission to save invoices' using errcode = '42501';
  end if;
  if v_status not in ('draft', 'issued') then raise exception 'Invalid invoice status'; end if;
  if v_charges < 0 then raise exception 'Additional charges cannot be negative'; end if;
  if v_issue is null or v_due is null then raise exception 'Invoice and due dates are required'; end if;
  if v_due < v_issue then raise exception 'The due date cannot be before the invoice date'; end if;
  if not exists (select 1 from public.clients where id = v_client and company_id = v_company) then
    raise exception 'Select a valid client';
  end if;

  select s.v_subtotal, s.v_discount, s.v_tax into v_sub, v_disc, v_tax from public._validate_items(p_items) s;
  v_total := v_sub - v_disc + v_tax + v_charges;

  if p_id is null then
    v_number := public.next_document_number(v_company, 'invoice');
    insert into public.invoices (company_id, invoice_number, client_id, issue_date, due_date, currency,
      project_reference, payment_terms, subtotal, discount, tax, additional_charges, total, status,
      notes, terms, created_by, updated_by)
    values (v_company, v_number, v_client, v_issue, v_due, coalesce(nullif(p_payload->>'currency', ''), 'LKR'),
      p_payload->>'project_reference', p_payload->>'payment_terms', v_sub, v_disc, v_tax, v_charges, v_total,
      v_status::public.invoice_status, p_payload->>'notes', p_payload->>'terms', auth.uid(), auth.uid())
    returning id into v_id;
    perform public.log_activity(v_company, 'invoice', v_id, 'created', 'Created invoice ' || v_number);
    if v_status = 'issued' then
      perform public.log_activity(v_company, 'invoice', v_id, 'issued', 'Issued invoice ' || v_number);
    end if;
  else
    select * into v_existing from public.invoices where id = p_id and company_id = v_company for update;
    if not found then raise exception 'Invoice not found'; end if;
    if v_existing.status in ('paid', 'cancelled') then
      raise exception 'Paid or cancelled invoices cannot be edited';
    end if;
    if v_total < v_existing.amount_paid then
      raise exception 'The total cannot be lower than payments already recorded (%)', v_existing.amount_paid;
    end if;
    v_id := p_id; v_number := v_existing.invoice_number;
    update public.invoices set
      client_id = v_client, issue_date = v_issue, due_date = v_due,
      currency = coalesce(nullif(p_payload->>'currency', ''), currency),
      project_reference = p_payload->>'project_reference', payment_terms = p_payload->>'payment_terms',
      subtotal = v_sub, discount = v_disc, tax = v_tax, additional_charges = v_charges, total = v_total,
      notes = p_payload->>'notes', terms = p_payload->>'terms',
      status = case when v_existing.status = 'draft' then v_status::public.invoice_status else v_existing.status end,
      updated_by = auth.uid()
    where id = p_id;
    delete from public.invoice_items where invoice_id = p_id;
    perform public.log_activity(v_company, 'invoice', v_id, 'updated', 'Updated invoice ' || v_number);
    if v_existing.status = 'draft' and v_status = 'issued' then
      perform public.log_activity(v_company, 'invoice', v_id, 'issued', 'Issued invoice ' || v_number);
    end if;
  end if;

  insert into public.invoice_items (invoice_id, description, details, quantity, unit_price, discount, tax_rate, line_total, position)
  select v_id, trim(e.value->>'description'), coalesce(e.value->>'details', ''),
         (e.value->>'quantity')::numeric, (e.value->>'unit_price')::numeric,
         coalesce((e.value->>'discount')::numeric, 0), coalesce((e.value->>'tax_rate')::numeric, 0),
         round((e.value->>'quantity')::numeric * (e.value->>'unit_price')::numeric, 2), (e.ordinality - 1)::int
  from jsonb_array_elements(p_items) with ordinality as e(value, ordinality);

  perform public.refresh_invoice_balance(v_id);
  return v_id;
end $$;

create or replace function public.set_invoice_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_inv public.invoices%rowtype;
begin
  if v_company is null or not public.has_permission(v_company, 'documents.write') then
    raise exception 'You do not have permission to change invoices' using errcode = '42501';
  end if;
  select * into v_inv from public.invoices where id = p_id and company_id = v_company for update;
  if not found then raise exception 'Invoice not found'; end if;

  if p_status = 'issued' then
    if v_inv.status <> 'draft' then raise exception 'Only draft invoices can be issued'; end if;
    update public.invoices set status = 'issued', updated_by = auth.uid() where id = p_id;
    perform public.refresh_invoice_balance(p_id);
    perform public.log_activity(v_company, 'invoice', p_id, 'issued', 'Issued invoice ' || v_inv.invoice_number);
  elsif p_status = 'cancelled' then
    if v_inv.amount_paid > 0 then raise exception 'Invoices with recorded payments cannot be cancelled'; end if;
    update public.invoices set status = 'cancelled', updated_by = auth.uid() where id = p_id;
    perform public.refresh_invoice_balance(p_id);
    perform public.log_activity(v_company, 'invoice', p_id, 'cancelled', 'Cancelled invoice ' || v_inv.invoice_number);
  else
    raise exception 'Unsupported status change';
  end if;
end $$;

-- ---------------------------------------------------------------- quotations
create or replace function public.save_quotation(p_id uuid, p_payload jsonb, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_client uuid := nullif(p_payload->>'client_id', '')::uuid;
  v_charges numeric := round(coalesce((p_payload->>'additional_charges')::numeric, 0), 2);
  v_status text := coalesce(p_payload->>'status', 'draft');
  v_issue date := (p_payload->>'issue_date')::date;
  v_valid date := (p_payload->>'valid_until')::date;
  v_sub numeric; v_disc numeric; v_tax numeric; v_total numeric;
  v_id uuid; v_number text; v_existing public.quotations%rowtype;
begin
  if v_company is null or not public.has_permission(v_company, 'documents.write') then
    raise exception 'You do not have permission to save quotations' using errcode = '42501';
  end if;
  if v_status not in ('draft', 'sent') then raise exception 'Invalid quotation status'; end if;
  if v_issue is null or v_valid is null then raise exception 'Quotation and valid-until dates are required'; end if;
  if v_valid < v_issue then raise exception 'Valid-until cannot be before the quotation date'; end if;
  if v_charges < 0 then raise exception 'Additional charges cannot be negative'; end if;
  if not exists (select 1 from public.clients where id = v_client and company_id = v_company) then
    raise exception 'Select a valid client';
  end if;

  select s.v_subtotal, s.v_discount, s.v_tax into v_sub, v_disc, v_tax from public._validate_items(p_items) s;
  v_total := v_sub - v_disc + v_tax + v_charges;

  if p_id is null then
    v_number := public.next_document_number(v_company, 'quotation');
    insert into public.quotations (company_id, quotation_number, client_id, issue_date, valid_until, project_title,
      project_description, scope_of_work, deliverables, payment_schedule, currency, subtotal, discount, tax,
      additional_charges, total, status, notes, terms, created_by, updated_by)
    values (v_company, v_number, v_client, v_issue, v_valid, p_payload->>'project_title',
      p_payload->>'project_description', p_payload->>'scope_of_work', p_payload->>'deliverables',
      p_payload->>'payment_schedule', coalesce(nullif(p_payload->>'currency', ''), 'LKR'), v_sub, v_disc, v_tax,
      v_charges, v_total, v_status::public.quotation_status, p_payload->>'notes', p_payload->>'terms', auth.uid(), auth.uid())
    returning id into v_id;
    perform public.log_activity(v_company, 'quotation', v_id, 'created', 'Created quotation ' || v_number);
  else
    select * into v_existing from public.quotations where id = p_id and company_id = v_company for update;
    if not found then raise exception 'Quotation not found'; end if;
    if v_existing.status = 'converted' then raise exception 'Converted quotations cannot be edited'; end if;
    v_id := p_id; v_number := v_existing.quotation_number;
    update public.quotations set
      client_id = v_client, issue_date = v_issue, valid_until = v_valid,
      project_title = p_payload->>'project_title', project_description = p_payload->>'project_description',
      scope_of_work = p_payload->>'scope_of_work', deliverables = p_payload->>'deliverables',
      payment_schedule = p_payload->>'payment_schedule',
      currency = coalesce(nullif(p_payload->>'currency', ''), currency),
      subtotal = v_sub, discount = v_disc, tax = v_tax, additional_charges = v_charges, total = v_total,
      notes = p_payload->>'notes', terms = p_payload->>'terms',
      status = case when v_existing.status = 'draft' then v_status::public.quotation_status else v_existing.status end,
      updated_by = auth.uid()
    where id = p_id;
    delete from public.quotation_items where quotation_id = p_id;
    perform public.log_activity(v_company, 'quotation', v_id, 'updated', 'Updated quotation ' || v_number);
  end if;

  insert into public.quotation_items (quotation_id, description, details, quantity, unit_price, discount, tax_rate, line_total, position)
  select v_id, trim(e.value->>'description'), coalesce(e.value->>'details', ''),
         (e.value->>'quantity')::numeric, (e.value->>'unit_price')::numeric,
         coalesce((e.value->>'discount')::numeric, 0), coalesce((e.value->>'tax_rate')::numeric, 0),
         round((e.value->>'quantity')::numeric * (e.value->>'unit_price')::numeric, 2), (e.ordinality - 1)::int
  from jsonb_array_elements(p_items) with ordinality as e(value, ordinality);

  return v_id;
end $$;

create or replace function public.set_quotation_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_q public.quotations%rowtype;
begin
  if v_company is null or not public.has_permission(v_company, 'documents.write') then
    raise exception 'You do not have permission to change quotations' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'sent', 'accepted', 'rejected', 'expired') then
    raise exception 'Unsupported status';
  end if;
  select * into v_q from public.quotations where id = p_id and company_id = v_company for update;
  if not found then raise exception 'Quotation not found'; end if;
  if v_q.status = 'converted' then raise exception 'Converted quotations are locked'; end if;
  update public.quotations set status = p_status::public.quotation_status, updated_by = auth.uid() where id = p_id;
  perform public.log_activity(v_company, 'quotation', p_id, 'status_changed',
    'Marked quotation ' || v_q.quotation_number || ' as ' || p_status, jsonb_build_object('from', v_q.status, 'to', p_status));
end $$;

create or replace function public.convert_quotation_to_invoice(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_q public.quotations%rowtype; v_s public.company_settings%rowtype; v_inv uuid; v_number text;
begin
  if v_company is null or not public.has_permission(v_company, 'documents.write') then
    raise exception 'You do not have permission to convert quotations' using errcode = '42501';
  end if;
  select * into v_q from public.quotations where id = p_id and company_id = v_company for update;
  if not found then raise exception 'Quotation not found'; end if;
  if v_q.converted_invoice_id is not null then
    raise exception 'This quotation has already been converted to an invoice' using errcode = '23505';
  end if;
  if v_q.status <> 'accepted' then raise exception 'Only accepted quotations can be converted'; end if;
  select * into v_s from public.company_settings where company_id = v_company;

  v_number := public.next_document_number(v_company, 'invoice');
  insert into public.invoices (company_id, invoice_number, client_id, issue_date, due_date, currency, project_reference,
    payment_terms, subtotal, discount, tax, additional_charges, total, status, notes, terms, quotation_id, created_by, updated_by)
  values (v_company, v_number, v_q.client_id, current_date, current_date + 30, v_q.currency, v_q.project_title,
    v_s.default_payment_terms, v_q.subtotal, v_q.discount, v_q.tax, v_q.additional_charges, v_q.total, 'draft',
    coalesce(nullif(v_s.default_invoice_notes, ''), v_q.notes), coalesce(nullif(v_s.default_invoice_terms, ''), v_q.terms),
    p_id, auth.uid(), auth.uid())
  returning id into v_inv;

  insert into public.invoice_items (invoice_id, description, details, quantity, unit_price, discount, tax_rate, line_total, position)
  select v_inv, description, details, quantity, unit_price, discount, tax_rate, line_total, position
  from public.quotation_items where quotation_id = p_id;

  update public.quotations set converted_invoice_id = v_inv, status = 'converted', updated_by = auth.uid() where id = p_id;
  perform public.log_activity(v_company, 'quotation', p_id, 'converted',
    'Converted quotation ' || v_q.quotation_number || ' to invoice ' || v_number, jsonb_build_object('invoice_id', v_inv));
  perform public.log_activity(v_company, 'invoice', v_inv, 'created',
    'Created invoice ' || v_number || ' from quotation ' || v_q.quotation_number);
  return v_inv;
end $$;

create or replace function public.set_document_archived(p_kind text, p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_number text;
begin
  if v_company is null or not public.has_permission(v_company, 'documents.write') then
    raise exception 'You do not have permission to archive documents' using errcode = '42501';
  end if;
  if p_kind = 'invoice' then
    update public.invoices set archived_at = case when p_archived then now() else null end, updated_by = auth.uid()
    where id = p_id and company_id = v_company returning invoice_number into v_number;
  elsif p_kind = 'quotation' then
    update public.quotations set archived_at = case when p_archived then now() else null end, updated_by = auth.uid()
    where id = p_id and company_id = v_company returning quotation_number into v_number;
  else
    raise exception 'Unknown document type';
  end if;
  if v_number is null then raise exception 'Document not found'; end if;
  perform public.log_activity(v_company, p_kind, p_id, case when p_archived then 'archived' else 'restored' end,
    case when p_archived then 'Archived ' else 'Restored ' end || v_number);
end $$;

-- ---------------------------------------------------------------- payments
create or replace function public.record_payment(
  p_invoice_id uuid, p_amount numeric, p_payment_date date, p_method text,
  p_reference text, p_notes text, p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_inv public.invoices%rowtype; v_existing uuid; v_id uuid;
begin
  if v_company is null or not public.has_permission(v_company, 'payments.write') then
    raise exception 'You do not have permission to record payments' using errcode = '42501';
  end if;
  -- Duplicate submission (double click / retry) returns the original payment
  select id into v_existing from public.payments where idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_inv.status = 'cancelled' then raise exception 'Payments cannot be recorded against a cancelled invoice'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if round(p_amount, 2) > v_inv.total - v_inv.amount_paid then
    raise exception 'Payment exceeds the outstanding balance of %', (v_inv.total - v_inv.amount_paid);
  end if;

  insert into public.payments (company_id, invoice_id, payment_date, amount, method, reference, notes, recorded_by, idempotency_key)
  values (v_company, p_invoice_id, coalesce(p_payment_date, current_date), round(p_amount, 2),
    p_method::public.payment_method, p_reference, p_notes, auth.uid(), p_idempotency_key)
  returning id into v_id;

  perform public.refresh_invoice_balance(p_invoice_id);
  perform public.log_activity(v_company, 'payment', v_id, 'payment_recorded',
    'Recorded payment of ' || v_inv.currency || ' ' || to_char(p_amount, 'FM999,999,999,990.00') || ' for ' || v_inv.invoice_number,
    jsonb_build_object('invoice_id', p_invoice_id));
  return v_id;
end $$;

-- ---------------------------------------------------------------- maintenance
create or replace function public.record_maintenance_activity(
  p_plan_id uuid, p_completed_on date, p_work text, p_assigned_to uuid, p_notes text, p_next_date date
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_plan public.maintenance_plans%rowtype; v_id uuid;
begin
  if v_company is null or not public.has_permission(v_company, 'maintenance.write') then
    raise exception 'You do not have permission to record maintenance' using errcode = '42501';
  end if;
  select * into v_plan from public.maintenance_plans where id = p_plan_id and company_id = v_company for update;
  if not found then raise exception 'Maintenance plan not found'; end if;
  if coalesce(trim(p_work), '') = '' then raise exception 'Describe the work performed'; end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.company_members where company_id = v_company and user_id = p_assigned_to
  ) then raise exception 'Assigned person must be a workspace member'; end if;
  if p_next_date is not null and p_next_date < p_completed_on then
    raise exception 'The next date cannot be before the completion date';
  end if;

  insert into public.maintenance_activities (plan_id, completed_on, work_performed, assigned_to, notes, next_scheduled_date, created_by)
  values (p_plan_id, p_completed_on, p_work, p_assigned_to, p_notes, p_next_date, auth.uid())
  returning id into v_id;

  update public.maintenance_plans set
    last_maintenance_date = greatest(coalesce(last_maintenance_date, p_completed_on), p_completed_on),
    next_maintenance_date = coalesce(p_next_date, next_maintenance_date)
  where id = p_plan_id;

  perform public.log_activity(v_company, 'maintenance_plan', p_plan_id, 'maintenance_completed',
    'Completed maintenance for ' || v_plan.project_name, jsonb_build_object('activity_id', v_id));
  return v_id;
end $$;

create or replace function public.create_maintenance_invoice(
  p_plan_id uuid, p_period_start date, p_period_end date, p_due_date date
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_plan public.maintenance_plans%rowtype; v_s public.company_settings%rowtype;
  v_period uuid; v_inv uuid; v_number text;
begin
  if v_company is null or not public.has_permission(v_company, 'documents.write') then
    raise exception 'You do not have permission to create invoices' using errcode = '42501';
  end if;
  select * into v_plan from public.maintenance_plans where id = p_plan_id and company_id = v_company for update;
  if not found then raise exception 'Maintenance plan not found'; end if;
  if v_plan.status = 'cancelled' then raise exception 'Cancelled plans cannot be invoiced'; end if;
  if p_period_end < p_period_start then raise exception 'The billing period end must be after its start'; end if;
  if p_due_date < current_date then raise exception 'The due date cannot be in the past'; end if;

  begin
    insert into public.maintenance_billing_periods (plan_id, period_start, period_end, status)
    values (p_plan_id, p_period_start, p_period_end, 'invoiced')
    returning id into v_period;
  exception when unique_violation then
    raise exception 'An invoice already exists for this plan and billing period' using errcode = '23505';
  end;

  select * into v_s from public.company_settings where company_id = v_company;
  v_number := public.next_document_number(v_company, 'invoice');

  insert into public.invoices (company_id, invoice_number, client_id, issue_date, due_date, currency, project_reference,
    payment_terms, subtotal, discount, tax, additional_charges, total, status, notes, terms,
    maintenance_plan_id, billing_period_id, created_by, updated_by)
  values (v_company, v_number, v_plan.client_id, current_date, p_due_date, v_plan.currency, v_plan.project_name,
    coalesce(nullif(v_plan.payment_terms, ''), v_s.maintenance_default_terms), v_plan.charge, 0, 0, 0, v_plan.charge, 'draft',
    v_s.default_invoice_notes, v_s.default_invoice_terms, p_plan_id, v_period, auth.uid(), auth.uid())
  returning id into v_inv;

  insert into public.invoice_items (invoice_id, description, details, quantity, unit_price, discount, tax_rate, line_total, position)
  values (v_inv, v_plan.project_name || ' — ' || v_plan.service_type,
    trim(coalesce(v_plan.description, '') || E'\nService period: ' || to_char(p_period_start, 'DD/MM/YYYY')
      || ' – ' || to_char(p_period_end, 'DD/MM/YYYY')),
    1, v_plan.charge, 0, 0, v_plan.charge, 0);

  update public.maintenance_billing_periods set invoice_id = v_inv where id = v_period;
  perform public.log_activity(v_company, 'maintenance_plan', p_plan_id, 'invoiced',
    'Invoiced ' || v_plan.project_name || ' (' || to_char(p_period_start, 'DD Mon YYYY') || ' – ' || to_char(p_period_end, 'DD Mon YYYY') || ')',
    jsonb_build_object('invoice_id', v_inv, 'billing_period_id', v_period));
  perform public.log_activity(v_company, 'invoice', v_inv, 'created', 'Created maintenance invoice ' || v_number);
  return v_inv;
end $$;

-- ---------------------------------------------------------------- audit triggers for direct-write tables
create or replace function public.audit_clients()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(new.company_id, 'client', new.id,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    case when tg_op = 'INSERT' then 'Added client ' else 'Updated client ' end || new.name);
  return new;
end $$;
create trigger clients_audit after insert or update on public.clients
  for each row execute function public.audit_clients();

create or replace function public.audit_plans()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.company_id, 'maintenance_plan', new.id, 'created', 'Added maintenance plan ' || new.project_name);
  elsif new.status is distinct from old.status then
    perform public.log_activity(new.company_id, 'maintenance_plan', new.id, 'status_changed',
      'Changed ' || new.project_name || ' to ' || replace(new.status::text, '_', ' '));
  elsif row(new.charge, new.billing_frequency, new.next_maintenance_date, new.project_name, new.assigned_to, new.description)
        is distinct from row(old.charge, old.billing_frequency, old.next_maintenance_date, old.project_name, old.assigned_to, old.description)
        and (new.last_maintenance_date is not distinct from old.last_maintenance_date) then
    perform public.log_activity(new.company_id, 'maintenance_plan', new.id, 'updated', 'Updated maintenance plan ' || new.project_name);
  end if;
  return new;
end $$;
create trigger maintenance_plans_audit after insert or update on public.maintenance_plans
  for each row execute function public.audit_plans();

create or replace function public.audit_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(new.company_id, 'settings', null, 'updated', 'Updated company settings');
  return new;
end $$;
create trigger company_settings_audit after update on public.company_settings
  for each row execute function public.audit_settings();

-- ---------------------------------------------------------------- membership
create or replace function public.accept_membership()
returns void language sql security definer set search_path = public as $$
  update public.company_members set status = 'active'
  where user_id = auth.uid() and status = 'invited';
$$;

create or replace function public.update_member(p_user_id uuid, p_role text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_my_role public.member_role; v_target public.company_members%rowtype;
begin
  if v_company is null or not public.has_permission(v_company, 'members.manage') then
    raise exception 'You do not have permission to manage members' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own role or status'; end if;
  select role into v_my_role from public.company_members where company_id = v_company and user_id = auth.uid();
  select * into v_target from public.company_members where company_id = v_company and user_id = p_user_id for update;
  if not found then raise exception 'Member not found'; end if;
  if (p_role = 'owner' or v_target.role = 'owner') and v_my_role <> 'owner' then
    raise exception 'Only an owner can grant or change the owner role';
  end if;
  if p_status not in ('active', 'suspended', 'invited') then raise exception 'Invalid status'; end if;
  update public.company_members set role = p_role::public.member_role, status = p_status::public.member_status
  where company_id = v_company and user_id = p_user_id;
  if not exists (
    select 1 from public.company_members where company_id = v_company and status = 'active' and role in ('owner', 'admin')
  ) then raise exception 'At least one active owner or administrator is required'; end if;
  perform public.log_activity(v_company, 'member', p_user_id, 'updated',
    'Changed access for a member to ' || p_role || ' (' || p_status || ')');
end $$;

-- ---------------------------------------------------------------- health
create or replace function public.health_check()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'server_time', now(),
    'member', coalesce(public.is_active_member(public.current_company_id()), false)
  );
$$;

-- ---------------------------------------------------------------- bootstrap (SQL editor / service role only)
create or replace function public.bootstrap_workspace(p_owner_email text, p_company_name text default 'CloudX Global (Pvt) Ltd')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_company uuid;
begin
  if exists (select 1 from public.companies) then raise exception 'The workspace already exists'; end if;
  select id into v_user from auth.users where lower(email) = lower(p_owner_email);
  if v_user is null then raise exception 'Create the auth user for % first', p_owner_email; end if;
  insert into public.companies (name) values (p_company_name) returning id into v_company;
  insert into public.company_settings (company_id, company_name) values (v_company, p_company_name);
  insert into public.profiles (id, display_name, email) values (v_user, split_part(p_owner_email, '@', 1), p_owner_email)
    on conflict (id) do nothing;
  insert into public.company_members (company_id, user_id, role, status) values (v_company, v_user, 'owner', 'active');
  return v_company;
end $$;

-- ---------------------------------------------------------------- execute grants
revoke all on function public.bootstrap_workspace(text, text) from public, anon, authenticated;
revoke all on function public._validate_items(jsonb) from public, anon;

do $$
declare f text;
begin
  foreach f in array array[
    'public.current_company_id()', 'public.is_active_member(uuid)', 'public.has_permission(uuid, text)',
    'public.save_invoice(uuid, jsonb, jsonb)', 'public.set_invoice_status(uuid, text)',
    'public.save_quotation(uuid, jsonb, jsonb)', 'public.set_quotation_status(uuid, text)',
    'public.convert_quotation_to_invoice(uuid)', 'public.set_document_archived(text, uuid, boolean)',
    'public.record_payment(uuid, numeric, date, text, text, text, uuid)',
    'public.record_maintenance_activity(uuid, date, text, uuid, text, date)',
    'public.create_maintenance_invoice(uuid, date, date, date)',
    'public.accept_membership()', 'public.update_member(uuid, text, text)', 'public.health_check()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
