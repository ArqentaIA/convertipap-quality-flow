import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Datos en tiempo real para la pantalla kiosko "Operator Vision".
 *
 * Pública (sin auth) porque la URL se pega en una TV / kiosko.
 * Devuelve un payload minimalista y sin PII sensible — solo lo que el
 * operador debe ver para reaccionar a desviaciones.
 */
export const getOperatorVisionData = createServerFn({ method: "GET" })
  .inputValidator((input: { maquina: string }) =>
    z
      .object({
        maquina: z
          .string()
          .min(1)
          .max(20)
          .regex(/^[A-Za-z0-9_-]+$/),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchOperatorVisionData } = await import("./operator-vision.server");
    return await fetchOperatorVisionData(data.maquina);
  });

export type OperatorVisionData = Awaited<ReturnType<typeof getOperatorVisionData>>;
