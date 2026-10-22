import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CapturaCalidadPage } from "./calidad.captura";

export const Route = createFileRoute("/calidad/captura-fuera-turno")({
  head: () => ({ meta: [
    { title: "Captura fuera de turno | Convertipap" },
    { name: "description", content: "Registro autorizado de muestras fuera de turno en Convertipap." },
    { property: "og:title", content: "Captura fuera de turno | Convertipap" },
    { property: "og:description", content: "Mediciones fuera de turno con especificaciones vigentes por máquina." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <CapturaCalidadPage modoFueraTurno={true} />,
  errorComponent: ({ error }) => (
    <AppLayout title="Captura fuera de turno">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error al cargar</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    </AppLayout>
  ),
});
