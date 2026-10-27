import { z } from "zod";

const limites = z.object({ min: z.number().finite(), objetivo: z.number().finite(), max: z.number().finite() });
export const guardarVariablesSchema = z.object({
  spec_id: z.string().uuid(),
  motivo: z.string().trim().min(5, "Motivo obligatorio (mínimo 5 caracteres)."),
  variables: z.array(limites.extend({ clave: z.string().min(1), esperado: limites })).min(1).max(60),
}).superRefine((data, ctx) => {
  data.variables.forEach((v, i) => {
    if (v.min > v.max) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables", i], message: `Rango inválido en ${v.clave}: mínimo debe ser menor o igual al máximo.` });
  });
});