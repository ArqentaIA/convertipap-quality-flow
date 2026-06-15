import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionGate } from "@/components/SessionGate";
import { Monitor, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

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

function OperatorVisionUrls() {
  const copy = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`URL de ${label} copiada`);
    } catch {
      toast.error("No se pudo copiar la URL");
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
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {MAQUINAS_OV.map((maq) => {
            const url = `${OPERATOR_VISION_BASE}/operator-vision?maquina=${maq}`;
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
                <button
                  type="button"
                  onClick={() => copy(url, maq)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Copiar URL"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                  title="Abrir en nueva pestaña"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
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
