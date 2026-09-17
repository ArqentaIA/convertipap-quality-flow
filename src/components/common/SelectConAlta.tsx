import { useState } from "react";
import { toast } from "sonner";

/**
 * Selector con alta en línea: muestra las opciones existentes y permite
 * agregar una nueva sin salir de la pantalla. El catálogo se alimenta
 * conforme se captura (cada planta mantiene su propia lista).
 */
export function SelectConAlta({
  label,
  value,
  opciones,
  onChange,
  onCrear,
  placeholder = "— seleccionar —",
  placeholderNuevo = "Nombre",
  maxLength = 60,
  disabled,
  requerido,
  compact,
  /** No lista el catálogo: solo muestra el valor actual y "➕ Agregar nuevo…". */
  soloAlta,
  /** Etiqueta a mostrar para el valor actual cuando este no está en `opciones`. */
  etiquetaActual,
}: {
  label: string;
  /** Valor seleccionado (id u opción textual). */
  value: string;
  opciones: { valor: string; etiqueta: string }[];
  onChange: (valor: string) => void;
  /** Alta de un valor nuevo; debe devolver el valor a seleccionar. */
  onCrear: (nombre: string) => Promise<string | null>;
  placeholder?: string;
  placeholderNuevo?: string;
  maxLength?: number;
  disabled?: boolean;
  requerido?: boolean;
  compact?: boolean;
  soloAlta?: boolean;
  etiquetaActual?: string;
}) {
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    const nombre = nuevo.trim();
    if (nombre.length < 2) {
      toast.error("Capture un nombre válido.");
      return;
    }
    setGuardando(true);
    try {
      const valor = await onCrear(nombre);
      if (valor) onChange(valor);
      setNuevo("");
      setAgregando(false);
    } catch (e) {
      toast.error((e as Error).message || "No fue posible agregarlo.");
    } finally {
      setGuardando(false);
    }
  }

  const labelCls = compact
    ? "mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground"
    : "mb-1 block text-xs text-muted-foreground";
  const ctrlCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <div>
      <label className={labelCls}>
        {label}
        {requerido ? " *" : ""}
      </label>
      {agregando ? (
        <div className="flex gap-2">
          <input
            type="text"
            autoFocus
            maxLength={maxLength}
            className={ctrlCls}
            placeholder={placeholderNuevo}
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void confirmar();
              }
              if (e.key === "Escape") {
                setAgregando(false);
                setNuevo("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={guardando}
            className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {guardando ? "…" : "Agregar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAgregando(false);
              setNuevo("");
            }}
            className="shrink-0 rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            ✕
          </button>
        </div>
      ) : (
        <select
          className={ctrlCls}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === "__nuevo__") {
              setAgregando(true);
              return;
            }
            onChange(e.target.value);
          }}
        >
          <option value="">{placeholder}</option>
          {(soloAlta
            ? value
              ? [{ valor: value, etiqueta: etiquetaActual ?? value }]
              : []
            : opciones
          ).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
          <option value="__nuevo__">➕ Agregar nuevo…</option>
        </select>
      )}
    </div>
  );
}
