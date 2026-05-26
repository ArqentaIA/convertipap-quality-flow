import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
export const Route = createFileRoute("/produccion")({
  component: () => <PlaceholderPage title="Producción" desc="Programación de máquinas, órdenes de fabricación y seguimiento OEE por planta." />,
});
