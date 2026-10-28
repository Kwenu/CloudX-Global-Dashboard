import { jsPDF } from 'jspdf';
import type { PdfPage } from './documentLayout';

function imageFormat(src: string): string {
  if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) return 'JPEG';
  return 'PNG';
}

/** Renders layout primitives into a real, vector A4 PDF (selectable text, not a screenshot). */
export function renderPdf(pages: PdfPage[], title: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title, creator: 'CloudX Global', subject: title });

  pages.forEach((page, index) => {
    if (index > 0) doc.addPage('a4', 'portrait');
    for (const prim of page.prims) {
      switch (prim.t) {
        case 'rect':
          doc.setFillColor(prim.fill);
          doc.rect(prim.x, prim.y, prim.w, prim.h, 'F');
          break;
        case 'line':
          doc.setDrawColor(prim.color);
          doc.setLineWidth(prim.width);
          doc.line(prim.x1, prim.y1, prim.x2, prim.y2);
          break;
        case 'text':
          doc.setFont('helvetica', prim.bold ? 'bold' : 'normal');
          doc.setFontSize(prim.size);
          doc.setTextColor(prim.color);
          doc.text(prim.text, prim.x, prim.y, {
            align: prim.align ?? 'left',
            ...(prim.charSpace ? { charSpace: prim.charSpace } : {})
          });
          break;
        case 'image':
          try {
            doc.addImage(prim.src, imageFormat(prim.src), prim.x, prim.y, prim.w, prim.h);
          } catch {

            // An unreadable logo should never block document generation.
          }break;
      }
    }
  });
  return doc;
}

export function downloadPdf(pages: PdfPage[], fileName: string): void {
  renderPdf(pages, fileName).save(`${fileName}.pdf`);
}

/** Opens the PDF in a new tab with the print dialog. Returns false if the browser blocked the tab. */
export function printPdf(pages: PdfPage[], fileName: string): boolean {
  const doc = renderPdf(pages, fileName);
  doc.autoPrint();
  const url = doc.output('bloburl');
  const win = window.open(String(url), '_blank');
  return Boolean(win);
}