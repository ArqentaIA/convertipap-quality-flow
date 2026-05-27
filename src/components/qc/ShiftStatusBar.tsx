import { useState } from "react";
import {
  Lock, FileCheck2, History, ShieldAlert, X, Check, RefreshCcw,
} from "lucide-react";
import {
  useShiftStatus, closeShift, addCorrection, resetShift, STATUS_META,
  type ShiftStatus,
} from "@/lib/shift-status";
import { useSession } from "@/lib/session";

export function ShiftStatusBar() {
  const shift = useShiftStatus();
  const session = useSession();
  const meta = STATUS_META[shift.status];
  const [showClose, setShowClose] = useState(false);
  const [showCorr, setShowCorr] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const isDireccion = session.role === "direccion";

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${meta.tone}`}
          >
            <DotIcon status={shift.status} /> {meta.label}
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">
              Estado del turno · trazabilidad
            </div>
            <p className="text-xs text-muted-foreground">{meta.desc}</p>
            {shift.closedAt && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Cerrado el {new Date(shift.closedAt).toLocaleString()} por{" "}
                <span className="font-medium text-foreground">{shift.closedBy}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {shift.corrections.length > 0 && (
            <button
              onClick={() => setShowLog(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              <History className="h-3.5 w-3.5" />
              Bitácora ({shift.corrections.length})
            </button>
          )}
          {shift.status === "borrador" ? (
            <button
              onClick={() => setShowClose(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-success-foreground hover:opacity-90"
            >
              <Lock className="h-3.5 w-3.5" /> Cerrar turno
            </button>
          ) : (
            <button
              onClick={() => setShowCorr(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <FileCheck2 className="h-3.5 w-3.5" /> Solicitar corrección
            </button>
          )}
          {isDireccion && shift.status !== "borrador" && (
            <button
              onClick={() => { if (confirm("Reabrir turno (solo demo). En producción esto NO existirá.")) resetShift(); }}
              title="Solo demo / dirección"
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-warning/50 bg-warning/10 px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-warning/20"
            >
              <RefreshCcw className="h-3 w-3" /> Reiniciar (demo)
            </button>
          )}
        </div>
      </div>

      {showClose && (
        <CloseModal
          onCancel={() => setShowClose(false)}
          onConfirm={(user) => { closeShift(user); setShowClose(false); }}
          defaultUser={session.user ?? ""}
        />
      )}

      {showCorr && (
        <CorrectionModal
          onCancel={() => setShowCorr(false)}
          onConfirm={(motivo, campos, user) => {
            addCorrection({ motivo, campos, user });
            setShowCorr(false);
          }}
          defaultUser={session.user ?? ""}
        />
      )}

      {showLog && (
        <LogModal onClose={() => setShowLog(false)} />
      )}
    </div>
  );
}

function DotIcon({ status }: { status: ShiftStatus }) {
  if (status === "cerrado") return <Lock className="h-3 w-3" />;
  if (status === "correccion_auditada") return <FileCheck2 className="h-3 w-3" />;
  return <ShieldAlert className="h-3 w-3" />;
}

function CloseModal({
  onCancel, onConfirm, defaultUser,
}: { onCancel: () => void; onConfirm: (user: string) => void; defaultUser: string }) {
  const [user, setUser] = useState(defaultUser);
  const [ack, setAck] = useState(false);
  return (
    <Modal title="Cerrar turno" icon={<Lock className="h-4 w-4" />} onClose={onCancel}>
      <p className="text-xs text-muted-foreground">
        Al cerrar el turno, todos los campos quedarán en <strong>solo lectura</strong>.
        Cualquier modificación posterior deberá realizarse mediante el flujo de
        corrección auditada, sin sobrescribir los datos originales.
      </p>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Responsable de cierre</label>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="usuario.responsable"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <label className="flex items-start gap-2 text-xs text-foreground">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
        Confirmo que la información del turno es correcta y completa.
      </label>
      <ModalFooter
        onCancel={onCancel}
        confirmDisabled={!ack || !user.trim()}
        confirmLabel="Cerrar turno"
        confirmIcon={<Check className="h-3.5 w-3.5" />}
        onConfirm={() => onConfirm(user.trim())}
        tone="success"
      />
    </Modal>
  );
}

function CorrectionModal({
  onCancel, onConfirm, defaultUser,
}: {
  onCancel: () => void;
  onConfirm: (motivo: string, campos: string, user: string) => void;
  defaultUser: string;
}) {
  const [user, setUser] = useState(defaultUser);
  const [motivo, setMotivo] = useState("");
  const [campos, setCampos] = useState("");
  return (
    <Modal title="Solicitar corrección auditada" icon={<FileCheck2 className="h-4 w-4" />} onClose={onCancel}>
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] text-foreground">
        Las correcciones quedan registradas en la bitácora con folio, usuario y
        marca de tiempo. Los datos originales del turno cerrado <strong>no</strong> se
        sobrescriben.
      </div>
      <Field label="Usuario solicitante">
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="usuario.responsable" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </Field>
      <Field label="Campos / secciones a corregir">
        <input value={campos} onChange={(e) => setCampos(e.target.value)} placeholder="Ej. Rollo 4441-6 · Humedad" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </Field>
      <Field label="Motivo de la corrección">
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Justificación obligatoria…" className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </Field>
      <ModalFooter
        onCancel={onCancel}
        confirmDisabled={!motivo.trim() || !campos.trim() || !user.trim()}
        confirmLabel="Registrar corrección"
        confirmIcon={<Check className="h-3.5 w-3.5" />}
        onConfirm={() => onConfirm(motivo.trim(), campos.trim(), user.trim())}
        tone="primary"
      />
    </Modal>
  );
}

function LogModal({ onClose }: { onClose: () => void }) {
  const shift = useShiftStatus();
  return (
    <Modal title="Bitácora de correcciones" icon={<History className="h-4 w-4" />} onClose={onClose}>
      {shift.corrections.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin correcciones registradas.</p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-auto">
          {shift.corrections.map((c) => (
            <div key={c.id} className="rounded-md border border-border bg-muted/30 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{c.folio}</span>
                <span className="text-muted-foreground">{new Date(c.ts).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-foreground"><strong>Usuario:</strong> {c.user}</div>
              <div className="text-foreground"><strong>Campos:</strong> {c.campos}</div>
              <div className="mt-1 text-muted-foreground">{c.motivo}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={onClose} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">Cerrar</button>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Modal({
  title, icon, onClose, children,
}: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            {icon}
            <h4 className="text-sm font-semibold">{title}</h4>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  onCancel, onConfirm, confirmLabel, confirmIcon, confirmDisabled, tone,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmIcon: React.ReactNode;
  confirmDisabled: boolean;
  tone: "primary" | "success";
}) {
  const cls = tone === "success"
    ? "bg-success text-success-foreground"
    : "bg-primary text-primary-foreground";
  return (
    <div className="mt-2 flex justify-end gap-2">
      <button onClick={onCancel} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">Cancelar</button>
      <button
        disabled={confirmDisabled}
        onClick={onConfirm}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
      >
        {confirmIcon} {confirmLabel}
      </button>
    </div>
  );
}
