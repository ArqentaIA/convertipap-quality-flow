import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, X, Package } from "lucide-react";
import { buscarRolloPorFolio } from "@/lib/produccion.functions";
import { DetalleCalidadModal } from "@/components/qc/DetalleCalidadModal";

/**
 * Buscador global por folio de rollo.
 * Al seleccionar un resultado abre directamente el modal Detalle de Calidad (Nivel 3).
 */
export function BuscadorRollo({ className = "" }: { className?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{ ordenId: string; folio: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fn = useServerFn(buscarRolloPorFolio);

  const enabled = q.trim().length >= 1;
  const { data = [], isFetching } = useQuery({
    queryKey: ["buscar-rollo", q.trim()],
    queryFn: () => fn({ data: { q: q.trim() } }),
    enabled,
    staleTime: 10_000,
  });

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const abrirDetalle = (r: { ordenId: string | null; rollo: string; folioOrden: string }) => {
    if (!r.ordenId) return;
    setSelected({ ordenId: r.ordenId, folio: `${r.rollo} · OF ${r.folioOrden}` });
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <div ref={containerRef} className={`relative ${className}`}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => enabled && setOpen(true)}
            placeholder="Buscar por folio de rollo…"
            maxLength={64}
            className="w-72 rounded-lg border border-border bg-background py-2 pl-8 pr-8 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-label="Buscar rollo por folio"
          />
          {q && (
            <button
              onClick={() => {
                setQ("");
                setOpen(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Limpiar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {open && enabled && (
          <div className="absolute right-0 z-50 mt-2 w-[28rem] max-w-[90vw] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
            {isFetching ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
              </div>
            ) : data.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Sin coincidencias para <strong>"{q}"</strong>
              </div>
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {data.map((r) => (
                  <li key={r.muestraId}>
                    <button
                      onClick={() => abrirDetalle(r)}
                      disabled={!r.ordenId}
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-muted disabled:opacity-50"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">{r.rollo}</span>
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {r.maquinaCodigo}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>OF {r.folioOrden}</span>
                          <span>·</span>
                          <span>{new Date(r.capturadoAt).toLocaleString("es-MX")}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <DetalleCalidadModal
        ordenId={selected?.ordenId ?? null}
        folio={selected?.folio ?? null}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </>
  );
}
