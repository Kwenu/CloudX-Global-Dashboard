import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreHorizontalIcon, BoxIcon } from "lucide-react";
export interface RowMenuItem {
  label: string;
  icon: BoxIcon;
  onSelect: () => void;
  tone?: 'danger';
  hidden?: boolean;
}
export function RowMenu({
  items,
  label = 'More actions'



}: {items: RowMenuItem[];label?: string;}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const visible = items.filter((i) => !i.hidden);
  return <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded-lg p-1.5 text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink">
        <MoreHorizontalIcon className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open && <motion.div role="menu" initial={{
        opacity: 0,
        scale: 0.96,
        y: -4
      }} animate={{
        opacity: 1,
        scale: 1,
        y: 0
      }} exit={{
        opacity: 0,
        scale: 0.97
      }} transition={{
        duration: 0.15,
        ease: [0.23, 1, 0.32, 1]
      }} className="absolute right-0 z-30 mt-1 w-48 origin-top-right rounded-xl border border-line bg-surface p-1 shadow-pop">
            {visible.map((item) => <button key={item.label} role="menuitem" type="button" onClick={() => {
          setOpen(false);
          item.onSelect();
        }} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 hover:bg-ink/5 ${item.tone === 'danger' ? 'text-danger' : 'text-ink/80'}`}>
                <item.icon className="h-4 w-4 opacity-70" aria-hidden />
                {item.label}
              </button>)}
          </motion.div>}
      </AnimatePresence>
    </div>;
}