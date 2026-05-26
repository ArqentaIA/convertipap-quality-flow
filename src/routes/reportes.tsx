import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
export const Route = createFileRoute("/reportes")({
  component: () => <PlaceholderPage title="Reportes" desc="Indicadores de cumplimiento, tendencias y reportes ejecutivos exportables." />,
});
