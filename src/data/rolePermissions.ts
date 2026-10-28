import type { Permission, Role } from '../types/database';

/**
 * Mirror of the role_permissions table — used only to hide controls in the UI.
 * The database enforces the real rules through RLS and SECURITY DEFINER functions.
 */
export const rolePermissions: Record<Role, Permission[]> = {
  owner: ['workspace.read', 'clients.write', 'documents.write', 'payments.write', 'maintenance.write', 'settings.write', 'members.manage'],
  admin: ['workspace.read', 'clients.write', 'documents.write', 'payments.write', 'maintenance.write', 'settings.write', 'members.manage'],
  director: ['workspace.read', 'clients.write', 'documents.write', 'payments.write', 'maintenance.write', 'settings.write'],
  accountant: ['workspace.read', 'clients.write', 'documents.write', 'payments.write'],
  staff: ['workspace.read', 'clients.write', 'maintenance.write'],
  viewer: ['workspace.read']
};

export const roleLabels: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  director: 'Director',
  accountant: 'Accountant',
  staff: 'Staff',
  viewer: 'Read-only'
};