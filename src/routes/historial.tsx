import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
export const Route = createFileRoute("/historial")({
  component: () => <PlaceholderPage title="Historial de Registros" desc="Consulta registros pasados de calidad por planta, máquina, turno y fecha." />,
});
