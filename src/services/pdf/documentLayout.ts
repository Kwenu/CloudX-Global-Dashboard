import { jsPDF } from 'jspdf';
import { documentColors as C } from '../../data/brand';
import type { DocumentKind } from '../../types/database';
import { formatAmount, formatDocDate } from '../../utils/format';

/**
 * Builds the CloudX invoice / quotation as a list of positioned primitives (millimetres, A4 portrait).
 * The same primitives are rendered to a real PDF (jsPDF) and to the on-screen SVG preview, so the
 * preview matches the download exactly.
 *
 * Look (modelled on the Lingo invoice format): purple-to-black gradient bars at the top and bottom, the logo
 * on the left with a large INVOICE / QUOTATION title on the right, a three-column info row (billed to,
 * dates, total), a gradient item-table header, payment details beside the totals, a gradient "Total Due"
 * box, and notes / terms beside the signatory block that prints the creating director's signature.
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

export interface PdfImage {
  src: string;
  aspect: number;
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
  /** Contact person, when the client has a business name */
  clientContact: string;
  /** Address, email, phone, tax id — one entry per line */
  clientLines: string[];
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
  paymentTerms: string;
  paymentLines: string[];
  notes: string;
  terms: string;
  signatoryName: string;
  signatoryTitle: string;
  /** The signature of the director who created the document (transparent PNG), if they saved one */
  signature: PdfImage | null;
  companyName: string;
  slogan: string;
  /** Printed in the footer band */
  footerLines: string[];
  logo: PdfImage | null;
}

const PAGE_W = 210;
const PAGE_H = 297;
const ML = 18; // left margin
const MR = 192; // right edge of content
const CW = MR - ML;
const BAR_H = 10; // gradient bars (top and bottom)
const FOOTER_TOP = PAGE_H - BAR_H;
const LIMIT = 274; // lowest y that content may reach
const TABLE_HEAD_H = 10.5;

// Gradient used for the bars, the table header and the "Total Due" box: black -> deep purple -> bright purple.
const GRADIENT = ['#0B0B10', '#941CB8', '#B04AD8'];

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

function money(amount: number, currency: string): string {
  return `${currency === 'LKR' ? 'Rs.' : currency} ${formatAmount(amount)}`;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
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

function rect(prims: PdfPrim[], x: number, y: number, w: number, h: number, fill: string) {
  prims.push({ t: 'rect', x, y, w, h, fill });
}

function hline(prims: PdfPrim[], x1: number, x2: number, y: number, color: string, width = 0.2) {
  prims.push({ t: 'line', x1, y1: y, x2, y2: y, color, width });
}

// ---------------------------------------------------------------- gradient
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}

function gradientAt(t: number): string {
  const seg = (GRADIENT.length - 1) * Math.min(1, Math.max(0, t));
  const i = Math.min(GRADIENT.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = hexToRgb(GRADIENT[i]);
  const b = hexToRgb(GRADIENT[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** A left-to-right gradient drawn as thin overlapping vertical slices (works in both the PDF and the preview). */
function gradientRect(prims: PdfPrim[], x: number, y: number, w: number, h: number) {
  const steps = Math.max(24, Math.round(w / 2.5));
  const sw = w / steps;
  for (let i = 0; i < steps; i++) {
    const overlap = i < steps - 1 ? 0.3 : 0;
    rect(prims, x + i * sw, y, sw + overlap, h, gradientAt((i + 0.5) / steps));
  }
}

// ---------------------------------------------------------------- helpers
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion'];

function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

function numberWords(n: number): string {
  if (n === 0) return 'Zero';
  const groups: string[] = [];
  let scale = 0;
  while (n > 0 && scale < SCALES.length) {
    const g = n % 1000;
    if (g) groups.unshift(`${belowThousand(g)}${SCALES[scale] ? ` ${SCALES[scale]}` : ''}`);
    n = Math.floor(n / 1000);
    scale++;
  }
  return groups.join(' ');
}

/** "Rupees Ten Thousand Five Hundred and Fifty Cents Only" — printed under the amount due. */
function amountInWords(amount: number, currency: string): string {
  const v = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(v / 100);
  const cents = v % 100;
  if (!Number.isFinite(whole) || whole >= 1e12) return '';
  const unit = currency === 'LKR' ? 'Rupees' : currency === 'USD' ? 'US Dollars' : currency;
  const known = currency === 'LKR' || currency === 'USD';
  let out = `${unit} ${numberWords(whole)}`;
  if (cents) out += known ? ` and ${numberWords(cents)} Cents` : ` and ${String(cents).padStart(2, '0')}/100`;
  return `${out} Only`;
}

/** Splits "Bank : BOC" into a label / value pair so payment details line up in two columns. */
function splitPair(line: string): {label: string;value: string;} | null {
  const m = line.match(/^([^:]{1,26}?)\s*:\s*(.+)$/);
  return m ? { label: m[1].trim(), value: m[2].trim() } : null;
}

function sectionTitle(prims: PdfPrim[], title: string, x: number, y: number) {
  rect(prims, x, y + 0.5, 1.2, 4.6, C.brand);
  txt(prims, title, x + 3.4, y + 4.2, 10.5, C.ink, { bold: true });
}

// ---------------------------------------------------------------- brand mark
// Only used if the logo image could not be loaded: a text wordmark for the white page.
const CLOUD_SIZE = 38;
const X_SIZE = 62;

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

/** The logo sits straight on the white page (no background tile), left-aligned inside the box. */
function drawBrand(prims: PdfPrim[], input: PdfDocumentInput, box: {x: number;y: number;w: number;h: number;}, wordmarkScale: number) {
  if (input.logo) {
    let w = Math.min(box.w, box.h * input.logo.aspect);
    let h = w / input.logo.aspect;
    if (h > box.h) {
      h = box.h;
      w = h * input.logo.aspect;
    }
    prims.push({ t: 'image', src: input.logo.src, x: box.x, y: box.y + (box.h - h) / 2, w, h });
    return;
  }
  drawWordmark(prims, box.x + 2, box.y + box.h / 2 + 4 * wordmarkScale, wordmarkScale);
}

// ---------------------------------------------------------------- page chrome
function footer(prims: PdfPrim[], input: PdfDocumentInput, page: number, pageCount: number) {
  gradientRect(prims, 0, FOOTER_TOP, PAGE_W, BAR_H);
  hline(prims, ML, MR, 276.2, C.rule, 0.25);
  const lines = input.footerLines.filter((l) => l.trim());
  const maxW = pageCount > 1 ? 128 : CW - 4;
  const cx = (ML + MR) / 2;
  if (lines[0]) txt(prims, lines[0], cx, 280.4, fitSize(lines[0], 8, maxW, true, 6), C.ink, { bold: true, align: 'center' });
  if (lines[1]) txt(prims, lines[1], cx, 284.4, fitSize(lines[1], 7.6, maxW, false, 6), C.muted, { align: 'center' });
  if (pageCount > 1) txt(prims, `Page ${page} of ${pageCount}`, MR, 284.4, 7.6, C.muted, { align: 'right' });
}

function tableHeader(prims: PdfPrim[], y: number) {
  gradientRect(prims, ML, y, CW, TABLE_HEAD_H);
  const base = y + 6.9;
  txt(prims, 'Description', ML + 5, base, 10, C.white, { bold: true });
  txt(prims, 'Qty', 126, base, 10, C.white, { bold: true, align: 'center' });
  txt(prims, 'Price', 159, base, 10, C.white, { bold: true, align: 'right' });
  txt(prims, 'Total', MR - 5, base, 10, C.white, { bold: true, align: 'right' });
}

function firstPage(input: PdfDocumentInput): {prims: PdfPrim[];y: number;} {
  const prims: PdfPrim[] = [];
  const isInvoice = input.kind === 'invoice';

  // Gradient bar + header: logo left, big title right with a short purple accent rule
  gradientRect(prims, 0, 0, PAGE_W, BAR_H);
  drawBrand(prims, input, { x: ML, y: 16, w: 60, h: 38 }, 0.9);
  const title = isInvoice ? 'INVOICE' : 'QUOTATION';
  const titleSize = fitSize(title, isInvoice ? 50 : 42, 104, true, 20);
  txt(prims, title, MR, 38, titleSize, C.ink, { bold: true, align: 'right' });
  rect(prims, MR - 22, 43.5, 22, 1.4, C.brand);
  if (!isInvoice && input.slogan.trim()) {
    txt(prims, input.slogan.trim(), MR, 51, 8.5, C.muted, { align: 'right' });
  }

  // Info row: billed to | number + dates | total panel
  const ruleTop = 62;
  const top = ruleTop + 7;
  const info: PdfPrim[] = [];

  txt(info, isInvoice ? 'INVOICE TO :' : 'QUOTATION TO :', ML, top, 8, C.muted, { bold: true, charSpace: 0.4 });
  let ly = top + 6;
  wrap(input.clientName || 'Client', 11, 62, true).slice(0, 2).forEach((line) => {
    const up = line.toUpperCase();
    txt(info, up, ML, ly, fitSize(up, 11, 62, true, 8), C.brandDeep, { bold: true });
    ly += 5;
  });
  const details = [...(input.clientContact ? [`Attn: ${input.clientContact}`] : []), ...input.clientLines].
  flatMap((l) => wrap(l, 8.5, 62)).
  slice(0, 6);
  details.forEach((line) => {
    txt(info, line, ML, ly, 8.5, C.body);
    ly += 4.2;
  });

  const cx = 114;
  const meta: [string, string][] = [
  [`${isInvoice ? 'Invoice' : 'Quotation'} Date`, formatDocDate(input.issueDate)],
  [`${isInvoice ? 'Invoice' : 'Quotation'} No`, input.number]];
  if (input.secondaryDate) meta.push([isInvoice ? 'Due Date' : 'Valid Until', formatDocDate(input.secondaryDate)]);
  if (isInvoice && input.paymentTerms.trim()) meta.push(['Terms', input.paymentTerms.trim()]);
  let my = top;
  for (const [label, value] of meta) {
    txt(info, label, 94, my, 8, C.muted);
    txt(info, value, 134, my, fitSize(value, 8.8, 134 - 94 - textWidth(label, 8) - 3, true, 6.5), C.ink, { bold: true, align: 'right' });
    my += 6;
  }

  const bottom = Math.max(ly - 1, my - 1.5, top + 14) + 3;
  const px = 140;
  // total panel
  rect(prims, px, ruleTop, MR - px, bottom - ruleTop, C.tint);
  rect(prims, px, ruleTop, 1.4, bottom - ruleTop, C.brand);
  txt(info, 'TOTAL :', MR - 4, top, 8, C.muted, { bold: true, align: 'right', charSpace: 0.4 });
  const totalText = money(input.total, input.currency);
  txt(info, totalText, MR - 4, top + 9, fitSize(totalText, 16, MR - px - 10, true, 8), C.brandDeep, { bold: true, align: 'right' });

  hline(prims, ML, px, ruleTop, C.rule, 0.25);
  hline(prims, ML, MR, bottom, C.rule, 0.25);
  rect(prims, 91, ruleTop + 3, 0.2, bottom - ruleTop - 6, C.rule);
  prims.push(...info);
  void cx;

  return { prims, y: bottom + 8 };
}

function continuationPage(input: PdfDocumentInput): {prims: PdfPrim[];y: number;} {
  const prims: PdfPrim[] = [];
  gradientRect(prims, 0, 0, PAGE_W, 7);
  drawBrand(prims, input, { x: ML, y: 12, w: 24, h: 24 }, 0.4);
  txt(prims, input.kind === 'invoice' ? 'INVOICE' : 'QUOTATION', MR, 25, 22, C.ink, { bold: true, align: 'right' });
  txt(prims, `${input.number}  ·  continued`, MR, 31, 8.5, C.muted, { align: 'right' });
  hline(prims, ML, MR, 38.5, C.rule, 0.25);
  return { prims, y: 46 };
}

// ---------------------------------------------------------------- flowing rows
interface Row {
  h: number;
  draw: (prims: PdfPrim[], y: number) => void;
}

function projectRows(input: PdfDocumentInput): Row[] {
  const titleLines = wrap(input.projectTitle.trim(), 11, CW, true).slice(0, 2);
  const desc = wrap(input.projectDescription.trim(), 8.8, CW);
  if (!titleLines.length && !desc.length) return [];
  const chunks = chunk(desc, 30);
  if (!chunks.length) chunks.push([]);
  return chunks.map((lines, ci) => {
    const head = ci === 0;
    const last = ci === chunks.length - 1;
    const h = (head ? 5 + titleLines.length * 5.6 : 0) + lines.length * 4.3 + (last ? 4.5 : 0);
    return {
      h,
      draw: (p, y) => {
        let cy = y;
        if (head) {
          txt(p, input.kind === 'invoice' ? 'PROJECT / SERVICE' : 'PROJECT', ML, cy + 3, 7.5, C.brand, { bold: true, charSpace: 0.8 });
          cy += 5;
          titleLines.forEach((line) => {
            cy += 5.6;
            txt(p, line, ML, cy - 1.4, 11, C.ink, { bold: true });
          });
        }
        lines.forEach((line, i) => txt(p, line, ML, cy + 3 + i * 4.3, 8.8, C.body));
      }
    };
  });
}

function itemRows(input: PdfDocumentInput): Row[] {
  const rows: Row[] = [];
  const DESC_W = 86;
  input.items.forEach((item, idx) => {
    const isLastItem = idx === input.items.length - 1;
    const shade = idx % 2 === 1;
    const descLines = wrap(item.description || 'Item', 9.5, DESC_W, true);
    const chunks = chunk(wrap(item.details || '', 8.3, DESC_W), 22);
    const firstChunk = chunks.shift() ?? [];
    const qty = Number.isInteger(item.quantity) ? String(item.quantity) : item.quantity.toFixed(2);
    const price = money(item.unit_price, input.currency);
    const total = money(item.line_total, input.currency);
    const closesHere = chunks.length === 0;
    const lineColor = isLastItem ? C.ink : C.rule;

    const h = 4 + descLines.length * 4.4 + (firstChunk.length ? 0.6 + firstChunk.length * 3.7 : 0) + (closesHere ? 4 : 0);
    rows.push({
      h,
      draw: (p, y) => {
        if (shade) rect(p, ML, y, CW, h, C.tint);
        const base = y + 4 + 3.1;
        descLines.forEach((line, i) => txt(p, line, ML + 5, base + i * 4.4, 9.5, C.ink, { bold: true }));
        txt(p, qty, 126, base, 9, C.ink, { align: 'center' });
        txt(p, price, 159, base, fitSize(price, 8.8, 28, false), C.ink, { align: 'right' });
        txt(p, total, MR - 5, base, fitSize(total, 9, 28, true), C.ink, { bold: true, align: 'right' });
        const dy = y + 4 + descLines.length * 4.4 + 0.6;
        firstChunk.forEach((line, i) => txt(p, line, ML + 5, dy + 2.9 + i * 3.7, 8.3, C.muted));
        if (closesHere) hline(p, ML, MR, y + h, lineColor, isLastItem ? 0.35 : 0.15);
      }
    });

    chunks.forEach((lines, ci) => {
      const last = ci === chunks.length - 1;
      const ch = lines.length * 3.7 + (last ? 4 : 0);
      rows.push({
        h: ch,
        draw: (p, y) => {
          if (shade) rect(p, ML, y, CW, ch, C.tint);
          lines.forEach((line, i) => txt(p, line, ML + 5, y + 2.9 + i * 3.7, 8.3, C.muted));
          if (last) hline(p, ML, MR, y + ch, lineColor, isLastItem ? 0.35 : 0.15);
        }
      });
    });
  });
  return rows;
}

/** A heading followed by wrapped body text (scope of work, notes, terms …), split across pages if long. */
function titledRows(title: string, body: string): Row[] {
  const lines = wrap(body.trim(), 8.8, CW);
  if (!lines.length) return [];
  const chunks = chunk(lines, 28);
  return chunks.map((part, ci) => {
    const head = ci === 0;
    const last = ci === chunks.length - 1;
    const h = (head ? 7.5 : 0) + part.length * 4.3 + (last ? 5 : 0);
    return {
      h,
      draw: (p, y) => {
        let cy = y;
        if (head) {
          sectionTitle(p, title, ML, y);
          cy += 7.5;
        }
        part.forEach((line, i) => txt(p, line, ML, cy + 3 + i * 4.3, 8.8, C.body));
      }
    };
  });
}

// ---------------------------------------------------------------- payment details + totals
function totalsBlock(input: PdfDocumentInput): Row {
  const isInvoice = input.kind === 'invoice';
  const rows: [string, string, boolean][] = [['Sub-total', money(input.subtotal, input.currency), true]];
  if (input.discount > 0) rows.push(['Discount', `- ${money(input.discount, input.currency)}`, false]);
  if (input.tax > 0) rows.push(['Tax', money(input.tax, input.currency), false]);
  if (input.additionalCharges > 0) rows.push(['Additional charges', money(input.additionalCharges, input.currency), false]);
  if (isInvoice && input.advance > 0) rows.push(['Advance', `- ${money(input.advance, input.currency)}`, false]);

  const RX = 116;
  const ROW_H = 6.8;
  const due = isInvoice ? input.balance : input.total;
  const dueLabel = isInvoice ? 'Total Due' : 'Total';
  const words = amountInWords(due, input.currency);
  const wordLines = words ? wrap(`In words: ${words}`, 7.8, MR - RX - 2) : [];
  const rightH = rows.length * ROW_H + 4 + 13 + (wordLines.length ? 3 + wordLines.length * 3.8 : 0);

  // Payment details: "Label : value" lines are aligned in two columns, anything else is printed as a full line
  const entries: {label?: string;lines: string[];}[] = [];
  for (const raw of input.paymentLines) {
    const pair = splitPair(raw);
    if (pair) entries.push({ label: pair.label, lines: wrap(pair.value, 9, 50, true) });else
    entries.push({ lines: wrap(raw, 9, 84) });
  }
  const payLineCount = entries.reduce((n, e) => n + Math.max(1, e.lines.length), 0);
  const leftH = payLineCount ? 9 + payLineCount * 5.2 : 0;
  const h = Math.max(leftH, rightH) + 4;

  return {
    h,
    draw: (p, y) => {
      if (payLineCount) {
        sectionTitle(p, 'Payment Method', ML, y);
        let py = y + 12.5;
        for (const e of entries) {
          if (e.label) txt(p, e.label, ML + 3.4, py, 8.8, C.muted);
          e.lines.forEach((line, i) => {
            txt(p, line, e.label ? ML + 33 : ML + 3.4, py + i * 5.2, 8.8, e.label ? C.ink : C.body, { bold: Boolean(e.label) });
          });
          py += Math.max(1, e.lines.length) * 5.2;
        }
      }
      let cy = y + 1;
      rows.forEach(([label, value, strong], i) => {
        txt(p, label, RX + 3, cy + 4.2, 9, C.body);
        txt(p, value, MR - 3, cy + 4.2, fitSize(value, 9, 40, strong, 6.5), C.ink, { bold: strong, align: 'right' });
        if (i < rows.length - 1) hline(p, RX, MR, cy + ROW_H - 0.9, C.rule, 0.15);
        cy += ROW_H;
      });
      cy += 3;
      gradientRect(p, RX, cy, MR - RX, 13);
      const dueText = `${dueLabel} : ${money(due, input.currency)}`;
      txt(p, dueText, RX + (MR - RX) / 2, cy + 8.3, fitSize(dueText, 12, MR - RX - 8, true, 7), C.white, { bold: true, align: 'center' });
      wordLines.forEach((line, i) => txt(p, line, MR, cy + 17.2 + i * 3.8, 7.8, C.muted, { align: 'right' }));
    }
  };
}

// ---------------------------------------------------------------- notes, terms + signature
/**
 * The closing area: notes and terms on the left, the authorised signatory (with the creating director's own
 * signature) on the right. Long notes / terms flow as full-width sections above it instead.
 */
function closingRows(input: PdfDocumentInput): Row[] {
  const isInvoice = input.kind === 'invoice';
  const NOTE_W = 92;
  const noteLines = wrap(input.notes.trim(), 8.8, NOTE_W);
  const termLines = wrap(input.terms.trim(), 8.8, NOTE_W);
  const compact = noteLines.length + termLines.length <= 14;

  const rows: Row[] = [];
  if (!compact) {
    rows.push(...titledRows('Notes', input.notes), ...titledRows('Terms and Conditions', input.terms));
  }

  const sections: {title: string;lines: string[];}[] = [];
  if (compact && noteLines.length) sections.push({ title: 'Notes', lines: noteLines });
  if (compact && termLines.length) sections.push({ title: 'Terms and Conditions', lines: termLines });
  const sectionsH = sections.reduce((sum, sec) => sum + 7.5 + sec.lines.length * 4.3 + 4, 0);
  const thanks = sections.length === 0;
  const leftH = sectionsH + (thanks ? 16 : 0);
  const h = Math.max(leftH, 46) + 3;

  rows.push({
    h,
    draw: (p, y) => {
      // Left column
      let cy = y;
      for (const sec of sections) {
        sectionTitle(p, sec.title, ML, cy);
        sec.lines.forEach((line, i) => txt(p, line, ML, cy + 10.6 + i * 4.3, 8.8, C.body));
        cy += 7.5 + sec.lines.length * 4.3 + 4;
      }
      if (thanks) {
        txt(p, isInvoice ? 'Thank you for your business.' : 'We look forward to working with you.', ML, cy + 8, 11, C.ink, { bold: true });
        const note = isInvoice ? `Please quote ${input.number} as the payment reference.` : `This quotation, ${input.number}, is subject to the validity date shown above.`;
        wrap(note, 8.5, 84).forEach((line, i) => txt(p, line, ML, cy + 13.5 + i * 4.2, 8.5, C.muted));
      }

      // Right column: signatory name + title, signature, rule, role, company
      const cx = 152;
      let sy = y + 5;
      if (input.signatoryName) {
        txt(p, input.signatoryName, cx, sy, fitSize(input.signatoryName, 12, 64, true, 8), C.ink, { bold: true, align: 'center' });
        sy += 5.4;
      }
      if (input.signatoryTitle) {
        txt(p, input.signatoryTitle, cx, sy, 9.5, C.body, { align: 'center' });
        sy += 3.6;
      }
      const boxH = 17;
      if (input.signature) {
        const maxW = 50;
        let w = Math.min(maxW, boxH * input.signature.aspect);
        let sh = w / input.signature.aspect;
        if (sh > boxH) {
          sh = boxH;
          w = sh * input.signature.aspect;
        }
        p.push({ t: 'image', src: input.signature.src, x: cx - w / 2, y: sy + 1 + (boxH - sh) / 2, w, h: sh });
      }
      sy += boxH + 2;
      hline(p, cx - 28, cx + 28, sy, C.ink, 0.3);
      txt(p, 'Authorised Signatory', cx, sy + 4.4, 7.5, C.brand, { bold: true, align: 'center', charSpace: 0.3 });
      const company = `- ${input.companyName || 'CloudX Global (Pvt) Ltd'} -`;
      txt(p, company, cx, sy + 10.4, fitSize(company, 10.5, 66, false, 7), C.ink, { align: 'center' });
    }
  });
  return rows;
}

// ---------------------------------------------------------------- public entry
export function buildDocumentPages(input: PdfDocumentInput): PdfPage[] {
  const pages: PdfPage[] = [];
  const first = firstPage(input);
  pages.push({ prims: first.prims });
  let current = first.prims;
  let y = first.y;

  const newPage = (withTableHeader: boolean) => {
    const cont = continuationPage(input);
    pages.push({ prims: cont.prims });
    current = cont.prims;
    y = cont.y;
    if (withTableHeader) {
      tableHeader(current, y);
      y += TABLE_HEAD_H;
    }
  };

  const place = (row: Row, inTable: boolean) => {
    if (y + row.h > LIMIT) newPage(inTable);
    row.draw(current, y);
    y += row.h;
  };

  for (const row of projectRows(input)) place(row, false);

  const items = itemRows(input);
  if (items.length) {
    if (y + TABLE_HEAD_H + items[0].h > LIMIT) newPage(false);
    tableHeader(current, y);
    y += TABLE_HEAD_H;
    for (const row of items) place(row, true);
    y += 6;
  }

  for (const section of input.extraSections) {
    for (const row of titledRows(section.title, section.body)) place(row, false);
  }
  place(totalsBlock(input), false);
  for (const row of closingRows(input)) place(row, false);

  pages.forEach((page, i) => footer(page.prims, input, i + 1, pages.length));
  return pages;
}
