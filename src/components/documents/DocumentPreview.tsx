import React from 'react';
import type { PdfPage, PdfPrim } from '../../services/pdf/documentLayout';

const PT_TO_MM = 0.352778;

function renderPrim(prim: PdfPrim, key: number) {
  switch (prim.t) {
    case 'rect':
      return <rect key={key} x={prim.x} y={prim.y} width={prim.w} height={prim.h} fill={prim.fill} />;
    case 'line':
      return <line key={key} x1={prim.x1} y1={prim.y1} x2={prim.x2} y2={prim.y2} stroke={prim.color} strokeWidth={prim.width} />;
    case 'image':
      return <image key={key} href={prim.src} x={prim.x} y={prim.y} width={prim.w} height={prim.h} preserveAspectRatio="xMidYMid meet" />;
    case 'text':
      return (
        <text
          key={key}
          x={prim.x}
          y={prim.y}
          fontSize={prim.size * PT_TO_MM}
          fontWeight={prim.bold ? 700 : 400}
          fill={prim.color}
          fontFamily="Helvetica, Arial, sans-serif"
          textAnchor={prim.align === 'center' ? 'middle' : prim.align === 'right' ? 'end' : 'start'}
          letterSpacing={prim.charSpace}
          xmlSpace="preserve">
          
          {prim.text}
        </text>);

  }
}

/** Live A4 preview rendered from the exact same layout primitives used to generate the PDF. */
export function DocumentPreview({ pages, label }: {pages: PdfPage[];label: string;}) {
  return (
    <div className="space-y-4" aria-label={label}>
      {pages.map((page, i) =>
      <div key={i} className="aspect-[210/297] w-full overflow-hidden bg-white shadow-card ring-1 ring-line">
          <svg viewBox="0 0 210 297" className="h-full w-full" role="img" aria-label={`${label} — page ${i + 1}`}>
            {page.prims.map(renderPrim)}
          </svg>
        </div>
      )}
    </div>);

}