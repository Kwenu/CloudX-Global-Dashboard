-- CloudX Global — director signatures
-- Run AFTER the three earlier migrations (SQL editor, or `supabase db push`).
--
-- Each director stores ONE signature image. It is kept in a private Storage bucket and the
-- profile row only remembers the file path. Every member of the workspace can read the
-- signatures (so any director can open / print a document that another director created),
-- but a director can only write or delete their OWN signature file.

-- ---------------------------------------------------------------- profile column
alter table public.profiles add column if not exists signature_path text;

-- Directors may edit their own name, title and signature (nothing else on the profile).
grant update (display_name, job_title, signature_path) on public.profiles to authenticated;

-- A director may only point signature_path at a file inside their own name:
--   <company-uuid>/<own-user-uuid>-<timestamp>.png
create or replace function public.guard_signature_path()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.signature_path is not null
     and new.signature_path !~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                                || new.id::text || '-[0-9]+\.png$') then
    raise exception 'Invalid signature file' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists profiles_signature_guard on public.profiles;
create trigger profiles_signature_guard
  before insert or update of signature_path on public.profiles
  for each row execute function public.guard_signature_path();

-- ---------------------------------------------------------------- private bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 1048576, array['image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/png'];

drop policy if exists "signatures: members read" on storage.objects;
drop policy if exists "signatures: own upload" on storage.objects;
drop policy if exists "signatures: own update" on storage.objects;
drop policy if exists "signatures: own delete" on storage.objects;

create policy "signatures: members read" on storage.objects for select to authenticated
  using (bucket_id = 'signatures'
         and public.is_active_member(((storage.foldername(name))[1])::uuid));

create policy "signatures: own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures'
              and public.is_active_member(((storage.foldername(name))[1])::uuid)
              and storage.filename(name) like (auth.uid()::text || '-%'));

create policy "signatures: own update" on storage.objects for update to authenticated
  using (bucket_id = 'signatures'
         and public.is_active_member(((storage.foldername(name))[1])::uuid)
         and storage.filename(name) like (auth.uid()::text || '-%'));

create policy "signatures: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'signatures'
         and public.is_active_member(((storage.foldername(name))[1])::uuid)
         and storage.filename(name) like (auth.uid()::text || '-%'));
