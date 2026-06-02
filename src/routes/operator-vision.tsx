import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/operator-vision")({
  component: () => <Navigate to="/calidad/captura" replace />,
});
