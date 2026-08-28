import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Scale, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  validarEnlacePesaje,
  listarPesajesEnlace,
  registrarPesajePublico,
} from "@/lib/pesaje-publico.functions";
import { fechaCortoMX, horaMX } from "@/lib/format";

export const Route = createFileRoute("/pesaje-publico/$token")({
  head: () => ({
    meta: [
      { title: "Captura de Peso · Enlace temporal · Convertipap" },
      { name: "description", content: "Registro temporal de peso de bobina madre para MP-01, Planta Ixtapaluca." },
      { property: "og:title", content: "Captura de Peso · Enlace temporal · Convertipap" },
      { property: "og:description", content: "Registro temporal de peso de bobina madre para MP-01, Planta Ixtapaluca." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PesajePublicoPage,
});

async function fileABase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// iOS Safari puede no soportar createImageBitmap con HEIC/JPEG grandes:
// se usa un <img> como respaldo para garantizar la compresión en móvil.
async function cargarImagen(file: File): Promise<{ w: number; h: number; src: CanvasImageSource } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    return { w: bitmap.width, h: bitmap.height, src: bitmap };
  } catch {
    /* respaldo abajo */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error("no-image"));
      el.src = url;
    });
    return { w: img.naturalWidth, h: img.naturalHeight, src: img };
  } catch {
    return null;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

async function comprimir(file: File): Promise<File | null> {
  const img = await cargarImagen(file);
  if (!img || !img.w || !img.h) return file.size <= 2_000_000 ? file : null;
  const scale = Math.min(1, 1280 / Math.max(img.w, img.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.w * scale);
  canvas.height = Math.round(img.h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file.size <= 2_000_000 ? file : null;
  ctx.drawImage(img.src, 0, 0, canvas.width, canvas.height);
  for (const q of [0.7, 0.5, 0.35]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/jpeg", q));
    if (blob && blob.size <= 2_000_000) return new File([blob], "evidencia.jpg", { type: "image/jpeg" });
  }
  return null;
}

function PesajePublicoPage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const validar = useServerFn(validarEnlacePesaje);
  const listar = useServerFn(listarPesajesEnlace);
  const registrar = useServerFn(registrarPesajePublico);

  const [peso, setPeso] = useState("");
  const [orden, setOrden] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const infoQ = useQuery({
    queryKey: ["pesaje-publico", "info", token],
    queryFn: () => validar({ data: { token } }),
    refetchInterval: 60_000,
  });
  const listaQ = useQuery({
    queryKey: ["pesaje-publico", "lista", token],
    queryFn: () => listar({ data: { token } }),
    enabled: infoQ.data?.ok === true,
  });

  const info = infoQ.data;
  const pesoNum = peso.trim() === "" ? null : Number(peso.replace(",", "."));
  const pesoValido = pesoNum !== null && Number.isFinite(pesoNum) && pesoNum > 0 && pesoNum <= 3000;
  const puedeGuardar = !!info?.ok && !!info.numero_rollo && pesoValido && !guardando;

  async function onFoto(f: File | null) {
    if (!f) return;
    const c = await comprimir(f);
    setFoto(c);
    setPreview(URL.createObjectURL(c));
  }

  async function onGuardar() {
    if (!puedeGuardar || !info?.numero_rollo) return;
    setGuardando(true);
    try {
      const evidencia = foto ? await fileABase64(foto) : null;
      const res = await registrar({
        data: {
          token,
          numero_rollo: info.numero_rollo,
          peso_bruto_kg: Math.trunc(pesoNum as number),
          numero_orden: orden.trim() || null,
          evidencia_base64: evidencia,
        },
      });
      toast.success(`Rollo ${res.numero_rollo} registrado con ${res.peso_neto_kg} kg.`);
      setPeso("");
      setOrden("");
      setFoto(null);
      setPreview(null);
      await qc.invalidateQueries({ queryKey: ["pesaje-publico"] });
    } catch (e) {
      toast.error((e as Error).message || "No fue posible registrar el peso.");
    } finally {
      setGuardando(false);
    }
  }

  if (infoQ.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!info?.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Acceso no disponible</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {info?.motivo ?? "Enlace no válido."}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl space-y-4 bg-background p-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Scale className="h-5 w-5" /> Captura de Peso · {info.maquina_codigo}
        </h1>
        <p className="text-xs text-muted-foreground">
          {info.planta} · Enlace temporal vigente hasta{" "}
          {info.expira_at ? `${fechaCortoMX(info.expira_at)} ${horaMX(info.expira_at)}` : "—"}
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nuevo registro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Número de rollo (automático)</Label>
            <div className="mt-1 rounded-md border bg-muted px-3 py-2 font-mono text-lg font-semibold">
              {info.numero_rollo ?? "Numeración no disponible"}
            </div>
          </div>

          <div>
            <Label htmlFor="peso">Peso en báscula (kg)</Label>
            <Input
              id="peso"
              inputMode="numeric"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              placeholder="Ej. 1250"
              className="mt-1 text-lg"
            />
            {peso.trim() !== "" && !pesoValido && (
              <p className="mt-1 text-xs text-destructive">Captura un peso entre 1 y 3000 kg.</p>
            )}
          </div>

          <div>
            <Label htmlFor="orden">Orden de producción (opcional)</Label>
            <Input id="orden" value={orden} onChange={(e) => setOrden(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label>Evidencia fotográfica (opcional)</Label>
            {preview ? (
              <div className="mt-1 space-y-2">
                <img src={preview} alt="Evidencia del display de la báscula" className="w-full rounded-md border" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFoto(null);
                    setPreview(null);
                  }}
                >
                  <X className="mr-1 h-4 w-4" /> Quitar foto
                </Button>
              </div>
            ) : (
              <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-6 text-sm text-muted-foreground">
                <Camera className="h-4 w-4" /> Tomar o adjuntar fotografía
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void onFoto(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          <Button className="w-full" disabled={!puedeGuardar} onClick={() => void onGuardar()}>
            {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Registrar peso
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Registros de este enlace</CardTitle>
        </CardHeader>
        <CardContent>
          {(listaQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay registros.</p>
          ) : (
            <div className="divide-y text-sm">
              {(listaQ.data ?? []).map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-mono font-medium">{r.numero_rollo}</div>
                    <div className="text-xs text-muted-foreground">
                      {fechaCortoMX(r.fecha_hora_pesaje)} {horaMX(r.fecha_hora_pesaje)}
                    </div>
                  </div>
                  <div className="tabular-nums font-semibold">{r.peso_neto_kg} kg</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
