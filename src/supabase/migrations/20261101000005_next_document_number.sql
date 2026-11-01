-- CloudX Global — let directors choose where invoice / quotation numbering continues
-- (Settings → Invoices / Quotations → "Next number").
-- Run this once in the Supabase SQL Editor. Safe to run again.

-- Returns the number that the NEXT new invoice / quotation will get (for the current year when the year is part of the number).
create or replace function public.get_next_document_numbers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_year int; v_inv int; v_quo int;
begin
  if v_company is null then
    raise exception 'Your account is not an active member of the CloudX workspace.' using errcode = '42501';
  end if;
  select case when number_include_year then extract(year from current_date)::int else 0 end
    into v_year from public.company_settings where company_id = v_company;
  select coalesce(max(last_value), 0) + 1 into v_inv from public.document_sequences
    where company_id = v_company and doc_type = 'invoice' and seq_year = v_year;
  select coalesce(max(last_value), 0) + 1 into v_quo from public.document_sequences
    where company_id = v_company and doc_type = 'quotation' and seq_year = v_year;
  return jsonb_build_object('invoice', v_inv, 'quotation', v_quo);
end $$;

-- Makes the next new document use number p_next (e.g. 25 -> CX-2026-0025). Numbers already issued are never changed
-- or reused: if the chosen number already exists, it is refused.
create or replace function public.set_next_document_number(p_type text, p_next integer)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_prefix text; v_pad int; v_year_on boolean; v_year int; v_candidate text;
begin
  if v_company is null or not public.has_permission(v_company, 'settings.write') then
    raise exception 'You do not have permission to change document numbering' using errcode = '42501';
  end if;
  if p_type not in ('invoice', 'quotation') then raise exception 'Invalid document type'; end if;

  select case when p_type = 'invoice' then invoice_prefix else quotation_prefix end, number_padding, number_include_year
    into v_prefix, v_pad, v_year_on
  from public.company_settings where company_id = v_company;
  if v_prefix is null then raise exception 'Company settings are missing'; end if;

  if p_next is null or p_next < 1 or p_next >= power(10, v_pad) then
    raise exception 'Enter a whole number between 1 and %.', (power(10, v_pad)::bigint - 1);
  end if;

  v_year := case when v_year_on then extract(year from current_date)::int else 0 end;
  v_candidate := v_prefix || '-' || case when v_year_on then v_year::text || '-' else '' end || lpad(p_next::text, v_pad, '0');

  if exists (
    select 1 from public.invoices where p_type = 'invoice' and company_id = v_company and invoice_number = v_candidate
    union all
    select 1 from public.quotations where p_type = 'quotation' and company_id = v_company and quotation_number = v_candidate
  ) then
    raise exception '% is already in use. Choose a higher number.', v_candidate;
  end if;

  insert into public.document_sequences (company_id, doc_type, seq_year, last_value)
  values (v_company, p_type, v_year, p_next - 1)
  on conflict (company_id, doc_type, seq_year) do update set last_value = excluded.last_value;

  perform public.log_activity(v_company, 'settings', null, 'updated',
    format('Set the next %s number to %s', p_type, v_candidate));
  return v_candidate;
end $$;

revoke all on function public.get_next_document_numbers() from public, anon;
revoke all on function public.set_next_document_number(text, integer) from public, anon;
grant execute on function public.get_next_document_numbers() to authenticated;
grant execute on function public.set_next_document_number(text, integer) to authenticated;
