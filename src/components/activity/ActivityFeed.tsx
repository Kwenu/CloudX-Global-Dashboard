import React from "react";
import { Link } from "react-router-dom";
import { ArchiveIcon, ArrowRightLeftIcon, BanknoteIcon, CheckCircle2Icon, FilePlus2Icon, FilePenLineIcon, SendIcon, SettingsIcon, UserPlusIcon, WrenchIcon, XCircleIcon, BoxIcon } from "lucide-react";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { ActivityEntry } from "../../types/database";
import { formatDateTime, formatRelative } from "../../utils/format";
const icons: Record<string, BoxIcon> = {
  created: FilePlus2Icon,
  updated: FilePenLineIcon,
  issued: SendIcon,
  cancelled: XCircleIcon,
  archived: ArchiveIcon,
  restored: ArchiveIcon,
  status_changed: FilePenLineIcon,
  converted: ArrowRightLeftIcon,
  payment_recorded: BanknoteIcon,
  maintenance_completed: CheckCircle2Icon,
  invoiced: FilePlus2Icon,
  invited: UserPlusIcon
};
function linkFor(entry: ActivityEntry): string | null {
  if (!entry.entity_id) return entry.entity_type === 'settings' ? '/settings' : null;
  switch (entry.entity_type) {
    case 'invoice':
      return `/invoices/${entry.entity_id}`;
    case 'quotation':
      return `/quotations/${entry.entity_id}`;
    case 'client':
      return `/clients/${entry.entity_id}`;
    case 'maintenance_plan':
      return `/maintenance/${entry.entity_id}`;
    case 'payment':
      return '/payments';
    default:
      return null;
  }
}
export function ActivityFeed({
  entries,
  compact



}: {entries: ActivityEntry[];compact?: boolean;}) {
  const {
    memberName
  } = useWorkspace();
  return <ol className="relative">
      {entries.map((entry, i) => {
      const Icon = entry.entity_type === 'settings' ? SettingsIcon : entry.entity_type === 'maintenance_plan' && entry.action === 'created' ? WrenchIcon : icons[entry.action] ?? FilePenLineIcon;
      const to = linkFor(entry);
      const body = <>
            <span className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink/60">
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="min-w-0 pb-4">
              <span className="block text-[13px] leading-snug text-ink">{entry.summary}</span>
              <span className="mt-0.5 block text-xs text-muted" title={formatDateTime(entry.created_at)}>
                {memberName(entry.actor_id)} · {compact ? formatRelative(entry.created_at) : formatDateTime(entry.created_at)}
              </span>
            </span>
          </>;
      return <li key={entry.id} className="relative">
            {i < entries.length - 1 && <span className="absolute left-[13.5px] top-8 h-[calc(100%-24px)] w-px bg-line" aria-hidden />}
            {to ? <Link to={to} className="-mx-2 flex gap-3 rounded-lg px-2 pt-1 transition-colors duration-150 hover:bg-ink/[0.025]">
                {body}
              </Link> : <div className="flex gap-3 pt-1">{body}</div>}
          </li>;
    })}
    </ol>;
}