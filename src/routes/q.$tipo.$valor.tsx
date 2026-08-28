// Página pública minimalista para los QR de la etiqueta de liberación.
// Muestra únicamente 2 datos: el logotipo y el valor codificado.
import { createFileRoute } from "@tanstack/react-router";
import logoAsset from "@/assets/logo-convertipap-sombra.png.asset.json";

const TITULOS: Record<string, string> = {
  rollo: "N.º de rollo",
  peso: "Peso",
  lote: "Código logístico",
};

export const Route = createFileRoute("/q/$tipo/$valor")({
  head: () => ({
    meta: [
      { title: "Consulta de etiqueta · Convertipap" },
      {
        name: "description",
        content:
          "Consulta pública del dato codificado en la etiqueta de liberación de Convertipap.",
      },
      { property: "og:title", content: "Consulta de etiqueta · Convertipap" },
      {
        property: "og:description",
        content: "Dato codificado en la etiqueta de liberación de Convertipap.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QPage,
});

function QPage() {
  const { tipo, valor } = Route.useParams();
  const titulo = TITULOS[tipo] ?? "Dato";
  const texto = decodeURIComponent(valor ?? "").trim() || "Sin dato";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-10 bg-background px-6 py-12">
      <img
        src={logoAsset.url}
        alt="Convertipap · Fábrica de papel tissue"
        className="w-full max-w-xs object-contain"
      />
      <section className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
          {titulo}
        </p>
        <h1 className="mt-3 text-5xl font-black tracking-tight text-foreground break-all">
          {texto}
        </h1>
      </section>
    </main>
  );
}
