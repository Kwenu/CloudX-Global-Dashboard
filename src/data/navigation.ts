import {
  FileSignatureIcon,
  FileTextIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  UsersIcon,
  WalletIcon,
  WrenchIcon,
  type LucideIcon } from
'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const navigation: NavItem[] = [
{ label: 'Dashboard', to: '/', icon: LayoutDashboardIcon },
{ label: 'Invoices', to: '/invoices', icon: FileTextIcon },
{ label: 'Quotations', to: '/quotations', icon: FileSignatureIcon },
{ label: 'Clients', to: '/clients', icon: UsersIcon },
{ label: 'Maintenance', to: '/maintenance', icon: WrenchIcon },
{ label: 'Payments', to: '/payments', icon: WalletIcon },
{ label: 'Document History', to: '/documents', icon: HistoryIcon },
{ label: 'Settings', to: '/settings', icon: SettingsIcon }];


export const paymentMethodLabels = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  card: 'Card',
  online: 'Online payment',
  other: 'Other'
} as const;