import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
export const Route = createFileRoute("/configuracion")({
  component: () => <PlaceholderPage title="Configuración" desc="Parámetros del sistema, integraciones API REST y preferencias por planta." />,
});
