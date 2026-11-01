import React, { useEffect, useState } from 'react';
import { UserPlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { roleLabels, rolePermissions } from '../../data/rolePermissions';
import type { MemberStatus, Permission, Role } from '../../types/database';
import { errorMessage, initials } from '../../utils/format';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/FormControls';
import { Modal } from '../ui/Modal';
import { Panel } from '../ui/Panel';
import { StatusBadge } from '../ui/StatusBadge';
import { SignaturePanel } from './SignaturePanel';

const permissionLabels: Record<Permission, string> = {
  'workspace.read': 'View records',
  'clients.write': 'Clients',
  'documents.write': 'Invoices & quotations',
  'payments.write': 'Payments',
  'maintenance.write': 'Maintenance',
  'settings.write': 'Settings',
  'members.manage': 'Manage members'
};

export function AccessPanel() {
  const { api, user, member, can, refreshMember } = useAuth();
  const { members, reload } = useWorkspace();
  const [profile, setProfile] = useState({ display_name: '', job_title: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: '', display_name: '', job_title: 'Director / Co-Founder', role: 'director' as Role });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const canManage = can('members.manage');

  useEffect(() => {
    setProfile({ display_name: member?.profile?.display_name ?? '', job_title: member?.profile?.job_title ?? '' });
  }, [member]);

  async function saveProfile() {
    if (!profile.display_name.trim()) return void toast.error('Enter your name.');
    setSavingProfile(true);
    try {
      await api.updateMyProfile({ display_name: profile.display_name.trim(), job_title: profile.job_title.trim() });
      await Promise.all([refreshMember(), reload()]);
      toast.success('Profile updated');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSavingProfile(false);
    }
  }

  async function sendInvite() {
    setInviteError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(invite.email.trim())) return setInviteError('Enter a valid email address.');
    if (!invite.display_name.trim()) return setInviteError('Enter the director’s name.');
    setInviting(true);
    try {
      await api.inviteMember({ ...invite, email: invite.email.trim() });
      toast.success(`Invitation sent to ${invite.email.trim()}`);
      setInviteOpen(false);
      setInvite({ email: '', display_name: '', job_title: 'Director / Co-Founder', role: 'director' });
      await reload();
    } catch (e) {
      setInviteError(errorMessage(e));
    } finally {
      setInviting(false);
    }
  }

  async function changeMember(userId: string, patch: {role: Role;status: MemberStatus;}) {
    try {
      await api.updateMember(userId, patch);
      toast.success('Member updated');
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const assignableRoles = (Object.keys(roleLabels) as Role[]).filter((r) => r !== 'owner' || member?.role === 'owner');

  return (
    <div className="space-y-5">
      <Panel title="Your profile" description="Your name is shown in the dashboard greeting. Your name and title are printed as the authorised signatory on documents you create." bodyClassName="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name" htmlFor="me-name" required>
            <Input id="me-name" value={profile.display_name} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
          </Field>
          <Field label="Designation" htmlFor="me-title">
            <Input id="me-title" value={profile.job_title} onChange={(e) => setProfile({ ...profile, job_title: e.target.value })} placeholder="Director / Co-Founder" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveProfile} loading={savingProfile}>Save profile</Button>
        </div>
      </Panel>

      <SignaturePanel />

      <Panel
        title="Workspace members"
        description={`${members.filter((m) => m.status === 'active').length} active · there is no public sign-up`}
        action={canManage && <Button size="sm" icon={<UserPlusIcon className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>Invite director</Button>}
        bodyClassName="py-1">
        
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const self = m.user_id === user?.id;
            const editable = canManage && !self && (m.role !== 'owner' || member?.role === 'owner');
            const name = m.profile?.display_name || m.profile?.email || 'Member';
            return (
              <li key={m.user_id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-on-ink">{initials(name)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{name}{self && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}</p>
                    <p className="truncate text-xs text-muted">{m.profile?.job_title || '—'} · {m.profile?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editable ?
                  <>
                      <Select aria-label={`Role for ${name}`} value={m.role} onChange={(e) => void changeMember(m.user_id, { role: e.target.value as Role, status: m.status })} className="h-8 w-40 text-[13px]">
                        {assignableRoles.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
                      </Select>
                      <Select aria-label={`Status for ${name}`} value={m.status} onChange={(e) => void changeMember(m.user_id, { role: m.role, status: e.target.value as MemberStatus })} className="h-8 w-32 text-[13px]">
                        <option value="active">Active</option>
                        <option value="invited">Invited</option>
                        <option value="suspended">Suspended</option>
                      </Select>
                    </> :

                  <>
                      <span className="text-[13px] text-ink/80">{roleLabels[m.role]}</span>
                      <StatusBadge status={m.status} />
                    </>
                  }
                </div>
              </li>);

          })}
        </ul>
      </Panel>

      <Panel title="Roles & permissions" description="Enforced by database policies — the interface only mirrors them." bodyClassName="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-5 py-2.5 font-medium">Role</th>
              {(Object.keys(permissionLabels) as Permission[]).map((p) => <th key={p} className="px-2 py-2.5 text-center font-medium">{permissionLabels[p]}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(Object.keys(roleLabels) as Role[]).map((r) =>
            <tr key={r}>
                <td className="px-5 py-2.5 font-medium">{roleLabels[r]}</td>
                {(Object.keys(permissionLabels) as Permission[]).map((p) =>
              <td key={p} className="px-2 py-2.5 text-center">
                    {rolePermissions[r].includes(p) ? <span className="text-brand" aria-label="Allowed">●</span> : <span className="text-ink/20" aria-label="Not allowed">–</span>}
                  </td>
              )}
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a director"
        description="They’ll receive an email to set their own password. Invitations are sent securely from the server."
        footer={
        <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</Button>
            <Button onClick={sendInvite} loading={inviting}>Send invitation</Button>
          </>
        }>
        
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="i-name" required>
            <Input id="i-name" value={invite.display_name} onChange={(e) => setInvite({ ...invite, display_name: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="i-email" required>
            <Input id="i-email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </Field>
          <Field label="Designation" htmlFor="i-title">
            <Input id="i-title" value={invite.job_title} onChange={(e) => setInvite({ ...invite, job_title: e.target.value })} />
          </Field>
          <Field label="Role" htmlFor="i-role">
            <Select id="i-role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
              {assignableRoles.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
            </Select>
          </Field>
        </div>
        {inviteError && <p className="mt-4 text-sm text-danger" role="alert">{inviteError}</p>}
      </Modal>
    </div>);

}