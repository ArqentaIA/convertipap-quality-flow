import { describe, expect, it } from "vitest";
import { guardarVariablesSchema } from "../spec-limites";

const data = {
  spec_id: "e342b0c2-aaad-4e3f-abc3-58d81162076d", motivo: "Actualización de Especificación a Rev.03",
  variables: [{ clave: "tensionRH", min: 270, objetivo: 300, max: 330, esperado: { min: 135, objetivo: 150, max: 165 } }],
};
describe("Guardado de límites de especificación", () => {
  it("acepta de una vez Tensión RH 270/300/330 aunque el máximo anterior sea 165", () => {
    expect(guardarVariablesSchema.parse(data).variables[0]).toMatchObject({ min: 270, objetivo: 300, max: 330 });
  });
  it("rechaza un mínimo mayor al máximo", () => {
    expect(guardarVariablesSchema.safeParse({ ...data, variables: [{ ...data.variables[0], min: 331 }] }).success).toBe(false);
  });
});