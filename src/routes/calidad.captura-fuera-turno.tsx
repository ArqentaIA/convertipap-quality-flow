import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CapturaCalidadPage } from "./calidad.captura";

export const Route = createFileRoute("/calidad/captura-fuera-turno")({
  component: () => <CapturaCalidadPage modoFueraTurno={true} />,
  errorComponent: ({ error }) => (
    <AppLayout title="Captura fuera de turno">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error al cargar</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    </AppLayout>
  ),
});
