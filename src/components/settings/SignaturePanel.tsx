import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EraserIcon, ImageUpIcon, PenLineIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { errorMessage } from '../../utils/format';
import { signatureFromCanvas, signatureFromFile } from '../../utils/signature';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Panel } from '../ui/Panel';

type Mode = 'draw' | 'upload';

const INK = '#1B1F3B';

/**
 * Lets the signed-in director draw (mouse, finger or pen) or upload their own signature.
 * It is stored privately in Supabase and printed above their name on every invoice and
 * quotation they create. Only the owner of the signature can change it.
 */
export function SignaturePanel() {
  const { api, user, refreshMember } = useAuth();
  const { signatureFor, reload } = useWorkspace();
  const current = signatureFor(user?.id);

  const [mode, setMode] = useState<Mode>('draw');
  const [hasInk, setHasInk] = useState(false);
  const [uploaded, setUploaded] = useState<{blob: Blob;url: string;} | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{x: number;y: number;} | null>(null);
  const lastMid = useRef<{x: number;y: number;} | null>(null);

  const prepareCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 2.4;
    setHasInk(false);
  }, []);

  useEffect(() => {
    if (mode === 'draw') prepareCanvas();
  }, [mode, prepareCanvas]);

  useEffect(() => () => {
    if (uploaded) URL.revokeObjectURL(uploaded.url);
  }, [uploaded]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    lastPoint.current = p;
    lastMid.current = p;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
    setHasInk(true);
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !lastPoint.current || !lastMid.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    const mid = { x: (lastPoint.current.x + p.x) / 2, y: (lastPoint.current.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(lastMid.current.x, lastMid.current.y);
    ctx.quadraticCurveTo(lastPoint.current.x, lastPoint.current.y, mid.x, mid.y);
    ctx.stroke();
    lastPoint.current = p;
    lastMid.current = mid;
  }

  function onUp() {
    drawing.current = false;
    lastPoint.current = null;
    lastMid.current = null;
  }

  async function chooseFile(file: File) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return void toast.error('Upload a PNG, JPG or WEBP image of your signature.');
    if (file.size > 8 * 1024 * 1024) return void toast.error('That image is too large. Please use one under 8 MB.');
    setProcessing(true);
    try {
      const blob = await signatureFromFile(file);
      setUploaded({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setUploaded(null);
      toast.error(errorMessage(e));
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    setSaving(true);
    try {
      let blob: Blob;
      if (mode === 'draw') {
        if (!canvasRef.current || !hasInk) throw new Error('Sign in the box first.');
        blob = await signatureFromCanvas(canvasRef.current);
      } else {
        if (!uploaded) throw new Error('Choose an image of your signature first.');
        blob = uploaded.blob;
      }
      await api.saveMySignature(blob);
      await Promise.all([refreshMember(), reload()]);
      toast.success('Signature saved — it will appear on the documents you create.');
      if (mode === 'draw') prepareCanvas();else setUploaded(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await api.removeMySignature();
      await Promise.all([refreshMember(), reload()]);
      toast.success('Signature removed');
      setConfirmRemove(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRemoving(false);
    }
  }

  const canSave = mode === 'draw' ? hasInk : Boolean(uploaded);

  return (
    <Panel
      title="Your signature"
      description="Printed above your name on every invoice and quotation you create. Only you can change it."
      bodyClassName="p-5">

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <div className="mb-3 inline-flex rounded-lg border border-line bg-canvas p-1">
            {([['draw', 'Draw', PenLineIcon], ['upload', 'Upload image', ImageUpIcon]] as const).map(([id, label, Icon]) =>
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${mode === id ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'}`}>

                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            )}
          </div>

          {mode === 'draw' ?
          <div>
              <div className="relative overflow-hidden rounded-lg border border-line bg-white">
                <canvas
                ref={canvasRef}
                className="block h-44 w-full cursor-crosshair"
                style={{ touchAction: 'none' }}
                aria-label="Signature pad — sign here with your mouse, finger or pen"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp} />

                {!hasInk &&
              <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-black/25">
                    Sign here
                  </span>
              }
                <span className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-dashed border-black/20" />
              </div>
              <p className="mt-2 text-xs text-muted">Use your mouse, finger or a pen. Sign across the dotted line.</p>
            </div> :

          <div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void chooseFile(e.target.files[0])} />
              <div className="flex h-44 items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-white p-4">
                {uploaded ?
              <img src={uploaded.url} alt="Prepared signature" className="max-h-full max-w-full object-contain" /> :

              <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 text-sm text-black/45 hover:text-black/70">
                    <ImageUpIcon className="h-6 w-6" />
                    {processing ? 'Preparing…' : 'Choose a photo or scan of your signature'}
                  </button>
              }
              </div>
              <p className="mt-2 text-xs text-muted">Sign on plain white paper with a dark pen and photograph it in good light. The paper background is removed automatically.</p>
            </div>
          }

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {mode === 'draw' ?
            <Button variant="ghost" icon={<EraserIcon className="h-4 w-4" />} onClick={prepareCanvas} disabled={!hasInk || saving}>Clear</Button> :
            uploaded &&
            <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={saving}>Choose another</Button>
            }
            <Button onClick={save} loading={saving} disabled={!canSave}>
              {current ? 'Replace signature' : 'Save signature'}
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink/80">Saved signature</p>
          <div className="flex h-28 items-center justify-center rounded-lg border border-line bg-white p-3">
            {current ?
            <img src={current.src} alt="Your saved signature" className="max-h-full max-w-full object-contain" /> :
            <span className="text-center text-xs text-black/40">No signature saved yet.<br />Documents will show a blank signature line.</span>
            }
          </div>
          {current &&
          <Button variant="ghost" size="sm" className="mt-2 text-danger hover:bg-danger/10 hover:text-danger" icon={<Trash2Icon className="h-3.5 w-3.5" />} onClick={() => setConfirmRemove(true)}>
              Remove
            </Button>
          }
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove your signature?"
        message="New and existing documents you created will show a blank signature line until you add a signature again."
        confirmLabel="Remove signature"
        tone="danger"
        loading={removing}
        onConfirm={() => void remove()}
        onClose={() => setConfirmRemove(false)} />

    </Panel>);

}
