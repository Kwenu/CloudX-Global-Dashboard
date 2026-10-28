// Supabase Edge Function (Deno) — invites a director using the service-role key, which never leaves the server.
// Deploy:  supabase functions deploy invite-director
// Secrets: supabase secrets set SITE_URL=https://your-app.vercel.app
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const allowedRoles = ['owner', 'admin', 'director', 'accountant', 'staff', 'viewer'];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const siteUrl = Deno.env.get('SITE_URL') ?? '';
    if (!url || !serviceKey) return json({ error: 'Server is not configured' }, 500);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: 'Not authenticated' }, 401);
    const caller = userData.user;

    const { data: membership } = await admin.
    from('company_members').
    select('company_id, role, status').
    eq('user_id', caller.id).
    eq('status', 'active').
    maybeSingle();
    if (!membership) return json({ error: 'You are not an active workspace member' }, 403);

    const { data: permission } = await admin.
    from('role_permissions').
    select('permission').
    eq('role', membership.role).
    eq('permission', 'members.manage').
    maybeSingle();
    if (!permission) return json({ error: 'You do not have permission to invite members' }, 403);

    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const displayName = String(body.display_name ?? '').trim();
    const jobTitle = String(body.job_title ?? '').trim();
    const role = String(body.role ?? 'director');

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid email address' }, 400);
    if (!displayName) return json({ error: 'Enter the director’s name' }, 400);
    if (!allowedRoles.includes(role)) return json({ error: 'Invalid role' }, 400);
    if (role === 'owner' && membership.role !== 'owner') {
      return json({ error: 'Only an owner can invite another owner' }, 403);
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName },
      redirectTo: siteUrl ? `${siteUrl}/reset-password` : undefined
    });
    if (inviteError || !invited.user) {
      return json({ error: inviteError?.message ?? 'Could not send the invitation' }, 400);
    }

    const userId = invited.user.id;
    await admin.from('profiles').upsert({ id: userId, display_name: displayName, job_title: jobTitle, email });

    const { error: memberError } = await admin.from('company_members').insert({
      company_id: membership.company_id,
      user_id: userId,
      role,
      status: 'invited',
      invited_by: caller.id
    });
    if (memberError) {
      return json({ error: memberError.code === '23505' ? 'This person is already a member' : memberError.message }, 409);
    }

    await admin.from('document_activity').insert({
      company_id: membership.company_id,
      entity_type: 'member',
      entity_id: userId,
      action: 'invited',
      summary: `Invited ${displayName} as ${role}`,
      actor_id: caller.id
    });

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});