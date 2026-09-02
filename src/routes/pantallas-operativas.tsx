import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionGate } from "@/components/SessionGate";
import { Monitor, Copy, ExternalLink, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useMaquinasVisibles } from "@/hooks/usePlantasPermitidas";

export const Route = createFileRoute("/pantallas-operativas")({
  component: PantallasGate,
  ssr: false,
});

const OPERATOR_VISION_BASE = "https://www.convertipap.site";
/** Máquinas que cuentan con visor Operator Vision. */
const MAQUINAS_OV = ["MP-01", "MP-04", "MP-05", "MP-06", "MP-07"] as const;

function PantallasGate() {
  return (
    <SessionGate>
      <PantallasPage />
    </SessionGate>
  );
}

function PantallasPage() {
  return (
    <AppLayout title="Pantallas Operativas">
      <OperatorVisionUrls />
    </AppLayout>
  );
}

type MaqRow = { codigo: string; access_code: string | null };

function OperatorVisionUrls() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("administrador");
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  // Solo las máquinas permitidas al usuario dentro de la planta activa.
  const { codigos } = useMaquinasVisibles();
  const maquinasVisibles = (MAQUINAS_OV as readonly string[]).filter((codigo) =>
    codigos.includes(codigo),
  );

  const { data: maquinas } = useQuery({
    queryKey: ["maquinas-access-codes-list"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: maqs, error: mErr }, { data: codes, error: cErr }] = await Promise.all([
        supabase.from("maquinas").select("id, codigo").in("codigo", MAQUINAS_OV as readonly string[] as string[]),
        supabase.from("maquina_access_codes").select("maquina_id, access_code"),
      ]);
      if (mErr) throw mErr;
      if (cErr) throw cErr;
      const byMaq = new Map((codes ?? []).map((c) => [c.maquina_id, c.access_code]));
      return (maqs ?? []).map((m) => ({ codigo: m.codigo, access_code: byMaq.get(m.id) ?? null })) as MaqRow[];
    },
  });

  const codeByMaq = new Map((maquinas ?? []).map((m) => [m.codigo, m.access_code]));

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Monitor className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Operator Vision · Pantalla operativa</h3>
            <p className="text-xs text-muted-foreground">
              URL dedicada por máquina para mostrar producción y calidad en tiempo real en TV/kiosko.
              {isAdmin && " El PIN se solicita solo al entrar por URL directa sin sesión."}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {maquinasVisibles.map((maq) => {
            const url = `${OPERATOR_VISION_BASE}/operator-vision?maquina=${maq}`;
            const internalUrl = `/operator-vision?maquina=${maq}`;
            const pin = codeByMaq.get(maq) ?? null;
            const visible = reveal[maq] ?? false;
            const openInternal = () => {
              try {
                sessionStorage.setItem("ov_internal_intent", maq);
              } catch {
                /* ignore */
              }
              window.location.assign(internalUrl);
            };
            return (
              <div
                key={maq}
                className="flex items-center gap-2 rounded-md border border-border bg-background p-2"
              >
                <span className="inline-flex h-7 min-w-[58px] items-center justify-center rounded-md bg-primary/10 px-2 text-[11px] font-bold text-primary">
                  {maq}
                </span>
                <code className="flex-1 truncate font-mono text-[11px] text-foreground" title={url}>
                  {url}
                </code>

                {isAdmin && (
                  <div
                    className="flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1"
                    title="PIN de acceso para esta máquina"
                  >
                    <Lock className="h-3 w-3 text-amber-700" />
                    <span className="font-mono text-[11px] font-bold tracking-widest text-amber-900">
                      {pin ? (visible ? pin : "••••") : "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReveal((r) => ({ ...r, [maq]: !visible }))}
                      className="text-amber-700 hover:text-amber-900"
                      title={visible ? "Ocultar" : "Mostrar"}
                    >
                      {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                    {pin && (
                      <button
                        type="button"
                        onClick={() => copy(pin, `PIN ${maq}`)}
                        className="text-amber-700 hover:text-amber-900"
                        title="Copiar PIN"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => copy(url, `URL ${maq}`)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Copiar URL"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={openInternal}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                  title="Abrir visor (acceso interno, sin PIN)"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Pega la URL en la TV o navegador del puesto de la máquina. Modo kiosko fullscreen, sin
          sesión administrativa.
        </p>
      </div>

      {/* URLs de rotación automática para 2 monitores */}
      <div className="mt-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Monitor className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Rotación automática · 2 monitores</h3>
            <p className="text-xs text-muted-foreground">
              Cada URL recorre las máquinas en distinto orden (nunca repiten la misma a la vez) y
              desplaza el contenido hacia arriba automáticamente. Cambio de máquina cada 20 s
              (ajustable con el parámetro t, en segundos).
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {([
            { id: "a", label: "Monitor A", inicio: "MP-01" },
            { id: "b", label: "Monitor B", inicio: "MP-06" },
          ] as const).map((m) => {
            const url = `${OPERATOR_VISION_BASE}/operator-vision?maquina=${m.inicio}&auto=1&v=${m.id}`;
            return (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background p-2"
              >
                <span className="inline-flex h-7 min-w-[72px] items-center justify-center rounded-md bg-primary/10 px-2 text-[11px] font-bold text-primary">
                  {m.label}
                </span>
                <code className="flex-1 truncate font-mono text-[11px] text-foreground" title={url}>
                  {url}
                </code>
                <button
                  type="button"
                  onClick={() => copy(url, `URL ${m.label}`)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Copiar URL"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
