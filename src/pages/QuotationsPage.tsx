import React from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon } from 'lucide-react';
import { DocumentLibrary } from '../components/documents/DocumentLibrary';
import { buttonStyles } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../contexts/AuthContext';

export function QuotationsPage() {
  const { can } = useAuth();
  return (
    <div>
      <PageHeader
        title="Quotations"
        description="Prepare quotations, track decisions and convert accepted work into invoices."
        actions={
        can('documents.write') &&
        <Link to="/quotations/new" className={buttonStyles('primary')}>
              <PlusIcon className="h-4 w-4" /> New quotation
            </Link>

        } />
      
      <DocumentLibrary scope="quotation" />
    </div>);

}