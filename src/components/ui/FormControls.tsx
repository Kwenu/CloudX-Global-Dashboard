import React from 'react';
import { twMerge } from 'tailwind-merge';

const controlBase =
'w-full rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-muted/60 outline-none ' +
'transition-[border-color,box-shadow] duration-150 focus:border-brand focus:ring-2 focus:ring-brand/15 ' +
'disabled:bg-canvas disabled:text-muted';

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, hint, error, required, className = '', children }: FieldProps) {
  return (
    <div className={twMerge('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink/80">
        {label}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </label>
      {children}
      {error ?
      <p className="text-xs text-danger">{error}</p> :
      hint ?
      <p className="text-xs text-muted">{hint}</p> :
      null}
    </div>);

}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={twMerge(controlBase, 'h-10 px-3', className)} {...props} />;
  }
);

export function Select({ className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={twMerge(controlBase, 'h-10 px-3 pr-8', className)} {...props}>
      {children}
    </select>);

}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={twMerge(controlBase, 'min-h-[84px] px-3 py-2 leading-relaxed', className)} {...props} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  id





}: {checked: boolean;onChange: (value: boolean) => void;label: string;id?: string;}) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink/80">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors duration-150 ${checked ? 'bg-brand' : 'bg-ink/15'}`}>
        
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ease-out ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
        
      </button>
      {label}
    </label>);

}