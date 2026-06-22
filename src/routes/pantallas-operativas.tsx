import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionGate } from "@/components/SessionGate";
import { Monitor, Copy, ExternalLink, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/pantallas-operativas")({
  component: PantallasGate,
  ssr: false,
});

const OPERATOR_VISION_BASE = "https://www.convertipap.site";
const MAQUINAS_OV = ["MP-04", "MP-05", "MP-06", "MP-07"] as const;

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

  const { data: maquinas } = useQuery({
    queryKey: ["maquinas-access-codes-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maquinas")
        .select("codigo, access_code")
        .in("codigo", MAQUINAS_OV as readonly string[] as string[]);
      if (error) throw error;
      return data as MaqRow[];
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
          {MAQUINAS_OV.map((maq) => {
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
    </div>
  );
}
