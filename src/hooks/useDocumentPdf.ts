import { useCallback } from 'react';
import { toast } from 'sonner';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { buildDocumentPages } from '../services/pdf/documentLayout';
import { downloadPdf, printPdf } from '../services/pdf/renderPdf';
import type { Client, Invoice, Quotation } from '../types/database';
import { pdfInputFromDocument } from '../utils/documents';

/** Download / print a saved document. Generating a PDF never changes the document's status. */
export function useDocumentPdf() {
  const { settings, members, logo, signatureFor } = useWorkspace();

  const pagesFor = useCallback(
    (doc: Invoice | Quotation, client: Client | null) => {
      const creator = members.find((m) => m.user_id === doc.created_by)?.profile;
      return buildDocumentPages(
        pdfInputFromDocument(
          doc,
          client,
          settings,
          { name: creator?.display_name ?? '', title: creator?.job_title ?? '', signature: signatureFor(doc.created_by) },
          logo
        )
      );
    },
    [settings, members, logo, signatureFor]
  );

  const download = useCallback(
    (doc: Invoice | Quotation, client: Client | null) => {
      try {
        downloadPdf(pagesFor(doc, client), doc.number);
      } catch {
        toast.error('The PDF could not be generated. Please try again.');
      }
    },
    [pagesFor]
  );

  const print = useCallback(
    (doc: Invoice | Quotation, client: Client | null) => {
      if (!printPdf(pagesFor(doc, client), doc.number)) {
        toast.error('Your browser blocked the print window. Allow pop-ups or use Download instead.');
      }
    },
    [pagesFor]
  );

  return { pagesFor, download, print };
}