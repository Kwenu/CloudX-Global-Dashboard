import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import type { MaintenancePlan } from '../../types/database';
import { errorMessage, todayISO } from '../../utils/format';
import { addInterval } from '../../utils/maintenance';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/FormControls';
import { Modal } from '../ui/Modal';

export function RecordActivityModal({ open, onClose, onSaved, plan }: {open: boolean;onClose: () => void;onSaved: () => void;plan: MaintenancePlan;}) {
  const { api, user } = useAuth();
  const { members } = useWorkspace();
  const [completedOn, setCompletedOn] = useState(todayISO());
  const [work, setWork] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const today = todayISO();
    setCompletedOn(today);
    setWork('');
    setNotes('');
    setAssignedTo(plan.assigned_to ?? user?.id ?? '');
    setNext(addInterval(today, plan.billing_frequency, plan.custom_interval_days));
    setError(null);
  }, [open, plan, user]);

  async function save() {
    setError(null);
    if (!work.trim()) return setError('Describe the work performed.');
    if (next && next < completedOn) return setError('The next date cannot be before the completion date.');
    setSaving(true);
    try {
      await api.recordMaintenanceActivity({
        plan_id: plan.id,
        completed_on: completedOn,
        work_performed: work.trim(),
        assigned_to: assignedTo || null,
        notes: notes.trim(),
        next_scheduled_date: next || null
      });
      toast.success('Maintenance recorded');
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record completed maintenance"
      description={`${plan.project_name} · completing work doesn’t create an invoice or mark anything paid.`}
      footer={
      <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save record</Button>
        </>
      }>
      
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Completion date" htmlFor="a-date" required>
          <Input
            id="a-date"
            type="date"
            value={completedOn}
            max={todayISO()}
            onChange={(e) => {
              setCompletedOn(e.target.value);
              if (e.target.value) setNext(addInterval(e.target.value, plan.billing_frequency, plan.custom_interval_days));
            }} />
          
        </Field>
        <Field label="Completed by" htmlFor="a-by">
          <Select id="a-by" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">—</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name || m.profile?.email}</option>)}
          </Select>
        </Field>
        <Field label="Work performed" htmlFor="a-work" required className="sm:col-span-2">
          <Textarea id="a-work" value={work} onChange={(e) => setWork(e.target.value)} placeholder="e.g. Updated plugins, verified backups, renewed SSL" />
        </Field>
        <Field label="Notes" htmlFor="a-notes">
          <Input id="a-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Next scheduled date" htmlFor="a-next" hint="Pre-filled from the billing frequency.">
          <Input id="a-next" type="date" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
      </div>
      {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
    </Modal>);

}