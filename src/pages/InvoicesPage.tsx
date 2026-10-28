import React from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon } from 'lucide-react';
import { DocumentLibrary } from '../components/documents/DocumentLibrary';
import { buttonStyles } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../contexts/AuthContext';

export function InvoicesPage() {
  const { can } = useAuth();
  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Issue invoices, track balances and record payments."
        actions={
        can('documents.write') &&
        <Link to="/invoices/new" className={buttonStyles('primary')}>
              <PlusIcon className="h-4 w-4" /> New invoice
            </Link>

        } />
      
      <DocumentLibrary scope="invoice" />
    </div>);

}