import { jsPDF } from 'jspdf';
import { documentColors as C } from '../../data/brand';
import type { DocumentKind } from '../../types/database';
import { formatAmount, formatDocDate } from '../../utils/format';

/**
 * Builds the CloudX invoice / quotation as a list of positioned primitives (millimetres, A4 portrait).
 * Positions are measured from INV TEMPLATE.pdf and QUT TEMPLATE.pdf. The same primitives are rendered
 * to a real PDF (jsPDF) and to the on-screen SVG preview, so the preview matches the download exactly.
 */

export type PdfPrim =
{t: 'rect';x: number;y: number;w: number;h: number;fill: string;} |
{t: 'line';x1: number;y1: number;x2: number;y2: number;color: string;width: number;} |
{
  t: 'text';
  x: number;
  y: number;
  text: string;
  size: number;
  bold?: boolean;
  color: string;
  align?: 'left' | 'center' | 'right';
  charSpace?: number;
} |
{t: 'image';x: number;y: number;w: number;h: number;src: string;};

export interface PdfPage {
  prims: PdfPrim[];
}

export interface PdfLineItem {
  description: string;
  details: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface PdfDocumentInput {
  kind: DocumentKind;
  number: string;
  issueDate: string;
  secondaryDate: string | null;
  clientName: string;
  projectTitle: string;
  projectDescription: string;
  extraSections: {title: string;body: string;}[];
  items: PdfLineItem[];
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  additionalCharges: number;
  total: number;
  advance: number;
  balance: number;
  paymentLines: string[];
  notes: string;
  terms: string;
  signatoryName: string;
  signatoryTitle: string;
  companyName: string;
  slogan: string;
  logo: {src: string;aspect: number;} | null;
}

const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_LIMIT = 272;

let measurer: jsPDF | null = null;
function measure(): jsPDF {
  if (!measurer) measurer = new jsPDF({ unit: 'mm', format: 'a4' });
  return measurer;
}

function textWidth(text: string, size: number, bold = false, charSpace = 0): number {
  const doc = measure();
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  return doc.getTextWidth(text) + charSpace * Math.max(0, text.length - 1);
}

function wrap(text: string, size: number, maxWidth: number, bold = false): string[] {
  const doc = measure();
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  const out: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    if (!paragraph.trim()) {
      out.push('');
      continue;
    }
    out.push(...(doc.splitTextToSize(paragraph, maxWidth) as string[]));
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

function fitSize(text: string, size: number, maxWidth: number, bold: boolean, min = 6): number {
  let s = size;
  while (s > min && textWidth(text, s, bold) > maxWidth) s -= 0.5;
  return s;
}

function money(amount: number, currency: string, variant: 'Rs.' | 'RS:' | 'RS.'): string {
  const prefix = currency === 'LKR' ? variant : variant === 'RS:' ? `${currency}:` : currency;
  return `${prefix} ${formatAmount(amount)}`;
}

function txt(
prims: PdfPrim[],
text: string,
x: number,
y: number,
size: number,
color: string,
opts: {bold?: boolean;align?: 'left' | 'center' | 'right';charSpace?: number;} = {})
{
  if (!text) return;
  prims.push({ t: 'text', text, x, y, size, color, ...opts });
}

// ---------------------------------------------------------------- brand mark
const CLOUD_SIZE = 38;
const X_SIZE = 62;

function wordmarkWidth(scale: number): number {
  return textWidth('CLOUD', CLOUD_SIZE * scale, true) + textWidth('X', X_SIZE * scale, true);
}

function drawWordmark(prims: PdfPrim[], x: number, baseline: number, scale: number) {
  const cloudW = textWidth('CLOUD', CLOUD_SIZE * scale, true);
  txt(prims, 'CLOUD', x, baseline, CLOUD_SIZE * scale, C.ink, { bold: true });
  txt(prims, 'X', x + cloudW - 0.4 * scale, baseline + 3.8 * scale, X_SIZE * scale, C.brand, { bold: true });
  const sub = 'GLOBAL(PVT)LTD';
  const subSize = 5.6 * scale;
  const cs = 1.25 * scale;
  const subW = textWidth(sub, subSize, false, cs);
  txt(prims, sub, x + (cloudW - subW) / 2, baseline + 4.8 * scale, subSize, C.muted, { charSpace: cs });
}

function drawLogo(prims: PdfPrim[], input: PdfDocumentInput, box: {x: number;y: number;w: number;h: number;}, align: 'left' | 'center') {
  if (input.logo) {
    const w = Math.min(box.w, box.h * input.logo.aspect);
    const h = w / input.logo.aspect;
    const x = align === 'center' ? PAGE_W / 2 - w / 2 : box.x;
    prims.push({ t: 'image', src: input.logo.src, x, y: box.y + (box.h - h) / 2, w, h });
    return;
  }
  const scale = box.h / 20;
  const width = wordmarkWidth(scale);
  const x = align === 'center' ? PAGE_W / 2 - width / 2 : box.x;
  drawWordmark(prims, x, box.y + 15 * scale, scale);
}

// ---------------------------------------------------------------- page chrome
function chrome(prims: PdfPrim[]) {
  prims.push({ t: 'rect', x: 0, y: 0, w: PAGE_W, h: 10.5, fill: C.brand });
  prims.push({ t: 'rect', x: 0, y: 288.2, w: PAGE_W, h: PAGE_H - 288.2, fill: C.brand });
}

function tableHeader(prims: PdfPrim[], y: number) {
  prims.push({ t: 'rect', x: 23.2, y, w: 163.6, h: 11.4, fill: C.brand });
  const base = y + 7.4;
  txt(prims, 'Description', 27.7, base, 13, C.white, { bold: true });
  txt(prims, 'Qty', 117.7, base, 13, C.white, { bold: true, align: 'center' });
  txt(prims, 'Price', 144.5, base, 13, C.white, { bold: true, align: 'center' });
  txt(prims, 'Total', 173, base, 13, C.white, { bold: true, align: 'center' });
}

function firstPage(input: PdfDocumentInput): {prims: PdfPrim[];itemsStart: number;dividerY: number;} {
  const prims: PdfPrim[] = [];
  chrome(prims);
  const isInvoice = input.kind === 'invoice';
  let dy = 0;

  if (isInvoice) {
    drawLogo(prims, input, { x: 22.7, y: 26, w: 70, h: 20 }, 'left');
    txt(prims, 'INVOICE', 188, 43.2, 52, C.ink, { bold: true, align: 'right' });
  } else {
    dy = 12.3;
    drawLogo(prims, input, { x: 0, y: 22.5, w: 70, h: 16.5 }, 'center');
    txt(prims, 'QUOTATION', PAGE_W / 2, 63, 46, C.ink, { bold: true, align: 'center' });
    if (input.slogan.trim()) {
      txt(prims, input.slogan.trim(), PAGE_W / 2, 70.5, 9, C.muted, { align: 'center' });
    }
  }

  // Client block
  txt(prims, isInvoice ? 'INVOICE TO :' : 'QUOTATION TO :', 23.9, 71.8 + dy, 9.5, C.ink, { bold: true });
  const nameLines = wrap((input.clientName || 'Client').toUpperCase(), 11.5, 58, true).slice(0, 2);
  nameLines.forEach((line, i) => txt(prims, line, 23.4, 79.3 + dy + i * 5, 11.5, C.navy, { bold: true }));
  prims.push({ t: 'rect', x: 23.4, y: 79.3 + dy + (nameLines.length - 1) * 5 + 4.6, w: 11.6, h: 0.7, fill: C.ink });

  // Date / number block
  const label = isInvoice ? 'Invoice No' : 'Quotation No';
  txt(prims, `Date : ${formatDocDate(input.issueDate)}`, 112.7, 72.7 + dy, 9.5, C.ink, { align: 'center' });
  txt(prims, `${label} : ${input.number}`, 112.7, 81.8 + dy, 9.5, C.ink, { align: 'center' });
  if (input.secondaryDate) {
    txt(prims, `${isInvoice ? 'Due Date' : 'Valid Until'} : ${formatDocDate(input.secondaryDate)}`, 112.7, 89.6 + dy, 8.5, C.body, { align: 'center' });
  }

  // Total block
  txt(prims, 'TOTAL  :', 186.8, 72.7 + dy, 9.5, C.ink, { bold: true, align: 'right' });
  const totalText = money(input.total, input.currency, 'RS:');
  txt(prims, totalText, 186.8, 81.8 + dy, fitSize(totalText, 17, 52, true), C.navy, { bold: true, align: 'right' });

  tableHeader(prims, 97.7 + dy);
  return { prims, itemsStart: 124.8 + dy, dividerY: isInvoice ? 171.2 : 173.4 };
}

function continuationPage(input: PdfDocumentInput, withTable: boolean): {prims: PdfPrim[];itemsStart: number;} {
  const prims: PdfPrim[] = [];
  chrome(prims);
  drawWordmark(prims, 23.2, 25, 0.42);
  txt(prims, input.kind === 'invoice' ? 'INVOICE' : 'QUOTATION', 186.8, 23, 16, C.ink, { bold: true, align: 'right' });
  txt(prims, `${input.number}  ·  continued`, 186.8, 29, 8.5, C.body, { align: 'right' });
  if (withTable) tableHeader(prims, 36);
  return { prims, itemsStart: withTable ? 58 : 44 };
}

// ---------------------------------------------------------------- item rows
interface Row {
  h: number;
  draw: (prims: PdfPrim[], y: number) => void;
}

function buildRows(input: PdfDocumentInput): Row[] {
  const rows: Row[] = [];
  const DESC_W = 82;
  const FULL_W = 160;

  if (input.projectTitle.trim() || input.projectDescription.trim()) {
    const title = input.projectTitle.trim();
    const desc = wrap(input.projectDescription.trim(), 8.5, FULL_W);
    rows.push({
      h: (title ? 5 : 0) + desc.length * 3.8 + 5,
      draw: (p, y) => {
        let cy = y;
        if (title) {
          txt(p, title, 24.5, cy, 10, C.navy, { bold: true });
          cy += 5;
        }
        desc.forEach((line) => {
          txt(p, line, 24.5, cy, 8.5, C.body);
          cy += 3.8;
        });
      }
    });
  }

  for (const item of input.items) {
    const descLines = wrap(item.description || 'Item', 9.5, DESC_W, true);
    const detailLines = wrap(item.details || '', 8.3, DESC_W);
    const chunks: string[][] = [];
    for (let i = 0; i < detailLines.length; i += 24) chunks.push(detailLines.slice(i, i + 24));
    const firstChunk = chunks.shift() ?? [];
    const qty = Number.isInteger(item.quantity) ? String(item.quantity) : item.quantity.toFixed(2);
    const price = money(item.unit_price, input.currency, 'Rs.');
    const total = money(item.line_total, input.currency, 'Rs.');

    rows.push({
      h: descLines.length * 4.4 + (firstChunk.length ? 0.8 + firstChunk.length * 3.7 : 0) + (chunks.length ? 0 : 4.5),
      draw: (p, y) => {
        let cy = y;
        descLines.forEach((line) => {
          txt(p, line, 24.5, cy, 9.5, C.ink, { bold: true });
          cy += 4.4;
        });
        txt(p, qty, 117.7, y, 9, C.ink, { align: 'center' });
        txt(p, price, 144.5, y, fitSize(price, 8.5, 25, false), C.ink, { align: 'center' });
        txt(p, total, 173, y, fitSize(total, 8.5, 26, false), C.ink, { align: 'center' });
        if (firstChunk.length) cy += 0.8;
        firstChunk.forEach((line) => {
          txt(p, line, 24.5, cy, 8.3, C.body);
          cy += 3.7;
        });
      }
    });
    chunks.forEach((chunk, idx) => {
      rows.push({
        h: chunk.length * 3.7 + (idx === chunks.length - 1 ? 4.5 : 0),
        draw: (p, y) => chunk.forEach((line, i) => txt(p, line, 24.5, y + i * 3.7, 8.3, C.body))
      });
    });
  }

  for (const section of input.extraSections) {
    if (!section.body.trim()) continue;
    const lines = wrap(section.body.trim(), 8.5, FULL_W);
    rows.push({
      h: 4.8 + lines.length * 3.8 + 4,
      draw: (p, y) => {
        txt(p, section.title, 24.5, y, 9.5, C.ink, { bold: true });
        lines.forEach((line, i) => txt(p, line, 24.5, y + 4.8 + i * 3.8, 8.5, C.body));
      }
    });
  }
  return rows;
}

// ---------------------------------------------------------------- summary block (fixed template positions)
function drawSummary(prims: PdfPrim[], input: PdfDocumentInput, dividerY: number): {overflow: boolean;} {
  const isInvoice = input.kind === 'invoice';
  prims.push({ t: 'line', x1: 23.9, y1: dividerY, x2: 187, y2: dividerY, color: C.ink, width: 0.3 });

  // Payment method
  txt(prims, 'Payment Method', 24.5, 188.7, 12.5, C.ink);
  const payLines = input.paymentLines.flatMap((l) => wrap(l, 9.3, 92));
  const maxPay = 6;
  (payLines.length ? payLines : ['—']).slice(0, maxPay).forEach((line, i) => {
    txt(prims, line, 24.5, 196.4 + i * 4.5, 9.3, C.body);
  });

  // Totals
  const rows: [string, string][] = [['Sub-total :', money(input.subtotal, input.currency, 'Rs.')]];
  if (input.discount > 0) rows.push(['Discount :  -', money(input.discount, input.currency, 'Rs.')]);
  if (input.tax > 0) rows.push(['Tax :', money(input.tax, input.currency, 'Rs.')]);
  if (input.additionalCharges > 0) rows.push(['Charges :', money(input.additionalCharges, input.currency, 'Rs.')]);
  if (isInvoice) rows.push(['Advance :  -', money(input.advance, input.currency, 'RS.')]);

  const spacing = rows.length <= 2 ? 8.9 : 6.2;
  const start = rows.length <= 2 ? 187.7 : 186.2;
  rows.forEach(([label, value], i) => {
    const y = start + i * spacing;
    txt(prims, label, 153, y, 9.5, C.ink, { align: 'right' });
    txt(prims, value, 158.5, y, fitSize(value, 9.5, 29, false), C.ink);
  });
  const boxTop = rows.length <= 2 ? 202.8 : start + (rows.length - 1) * spacing + 5.2;
  prims.push({ t: 'rect', x: 128.2, y: boxTop, w: 60, h: 11.3, fill: C.brand });
  const dueText = `Total Due :  ${money(isInvoice ? input.balance : input.total, input.currency, 'RS.')}`;
  txt(prims, dueText, 158.2, boxTop + 7.3, fitSize(dueText, 13, 56, true), C.white, { bold: true, align: 'center' });

  // Notes & terms (left)
  let overflow = false;
  let y = 232;
  const NOTE_W = 88;
  const notes = wrap(input.notes.trim(), 9, NOTE_W);
  const terms = wrap(input.terms.trim(), 9, NOTE_W);
  if (notes.length) {
    txt(prims, 'Notes', 25, y, 12, C.ink);
    const max = terms.length ? 3 : 9;
    const shown = notes.slice(0, max);
    if (notes.length > max) {
      overflow = true;
      shown[max - 1] = `${shown[max - 1]} … (continued)`;
    }
    shown.forEach((line, i) => txt(prims, line, 25.3, y + 6.7 + i * 4.4, 9, C.body));
    y = y + 6.7 + shown.length * 4.4 + 5.5;
    y = Math.max(y, terms.length ? 253 - (3 - shown.length) * 4.4 : y);
  }
  if (terms.length) {
    txt(prims, 'Terms  and Conditions', 25, y, 12, C.ink);
    const available = Math.max(1, Math.floor((283 - (y + 6.6)) / 4.4) + 1);
    const shown = terms.slice(0, available);
    if (terms.length > available) {
      overflow = true;
      shown[available - 1] = `${shown[available - 1]} … (continued)`;
    }
    shown.forEach((line, i) => txt(prims, line, 25.3, y + 6.6 + i * 4.4, 9, C.body));
  }

  // Authorised representative (right)
  const cx = 162.8;
  if (input.signatoryName) txt(prims, input.signatoryName, cx, 231.4, 13, C.ink, { align: 'center' });
  if (input.signatoryTitle) txt(prims, input.signatoryTitle, cx, 237.8, 10.5, C.ink, { align: 'center' });
  prims.push({ t: 'line', x1: 140, y1: 262, x2: 185.6, y2: 262, color: '#BDBDBD', width: 0.25 });
  txt(prims, `- ${input.companyName || 'CloudX Global (Pvt) Ltd'} -`, cx, 272.3, 13, C.ink, { align: 'center' });

  return { overflow };
}

// ---------------------------------------------------------------- public entry
export function buildDocumentPages(input: PdfDocumentInput): PdfPage[] {
  const pages: PdfPage[] = [];
  const first = firstPage(input);
  let current = first.prims;
  pages.push({ prims: current });
  let y = first.itemsStart;
  let summaryLimit = first.dividerY - 5;
  let dividerY = first.dividerY;

  for (const row of buildRows(input)) {
    if (y + row.h - 4.5 > CONTENT_LIMIT) {
      const cont = continuationPage(input, true);
      current = cont.prims;
      pages.push({ prims: current });
      y = cont.itemsStart;
      summaryLimit = 171.2 - 5;
      dividerY = 171.2;
    }
    row.draw(current, y);
    y += row.h;
  }

  if (y - 4.5 > summaryLimit) {
    const cont = continuationPage(input, false);
    current = cont.prims;
    pages.push({ prims: current });
    dividerY = 171.2;
  }
  const { overflow } = drawSummary(current, input, dividerY);

  if (overflow) {
    const extra = continuationPage(input, false);
    pages.push({ prims: extra.prims });
    let ty = extra.itemsStart + 4;
    const sections: [string, string][] = [
    ['Notes', input.notes],
    ['Terms  and Conditions', input.terms]];

    for (const [title, body] of sections) {
      const lines = wrap(body.trim(), 9.5, 160);
      if (!lines.length) continue;
      txt(extra.prims, title, 24.5, ty, 12, C.ink);
      ty += 7;
      for (const line of lines) {
        if (ty > CONTENT_LIMIT + 8) break;
        txt(extra.prims, line, 24.8, ty, 9.5, C.body);
        ty += 4.6;
      }
      ty += 6;
    }
  }

  if (pages.length > 1) {
    pages.forEach((page, i) =>
    txt(page.prims, `Page ${i + 1} of ${pages.length}`, PAGE_W / 2, 284.5, 7.5, C.muted, { align: 'center' })
    );
  }
  return pages;
}