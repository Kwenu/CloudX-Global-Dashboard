do $$
declare
  v_directors jsonb := '[
    {"email": "kisara.cloudxglobal@gmail.com", "name": "Kisara Wenuraka",   "title": "Director / Co-Founder", "role": "owner"},
    {"email": "chesh.cloudxglobal@gmail.com", "name": "Saveen Cheshitha",   "title": "Director / Co-Founder", "role": "owner"},
    {"email": "pasan.cloudxglobal@gmail.com", "name": "Pasan Nethmina", "title": "Director / Co-Founder", "role": "owner"}
  ]';
  d jsonb;
  v_user uuid;
  v_company uuid;
begin
  select id into v_company from public.companies order by created_at limit 1;
  if v_company is null then
    v_company := public.bootstrap_workspace(v_directors -> 0 ->> 'email');
  end if;

  for d in select * from jsonb_array_elements(v_directors) loop
    select id into v_user from auth.users where lower(email) = lower(d ->> 'email');
    if v_user is null then
      raise exception 'No Auth user found for %. Create it under Authentication → Users first.', d ->> 'email';
    end if;

    insert into public.profiles (id, display_name, job_title, email, status)
    values (v_user, d ->> 'name', d ->> 'title', lower(d ->> 'email'), 'active')
    on conflict (id) do update
      set display_name = excluded.display_name,
          job_title    = excluded.job_title,
          email        = excluded.email,
          status       = 'active';

    insert into public.company_members (company_id, user_id, role, status)
    values (v_company, v_user, (d ->> 'role')::public.member_role, 'active')
    on conflict (company_id, user_id) do update
      set role = excluded.role, status = 'active';
  end loop;
end $$;