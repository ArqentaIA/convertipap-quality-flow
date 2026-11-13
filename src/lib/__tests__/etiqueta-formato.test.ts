import { describe, expect, it } from "vitest";
import { FOR_CAL_05_DESDE, resolveFormatoEtiqueta } from "../etiqueta-formato";

describe("vigencia de formato de etiqueta por registro original", () => {
  it("solo Control de Calidad nuevo usa FOR-CAL-05", () => {
    expect(resolveFormatoEtiqueta({ capturado_at: "2026-11-13T18:20:51Z", fuera_de_turno: false })).toBe("FOR-CAL-05");
  });
  it("la vigencia incluye el instante de aplicación", () => {
    expect(resolveFormatoEtiqueta({ capturado_at: FOR_CAL_05_DESDE, fuera_de_turno: false })).toBe("FOR-CAL-05");
  });
  it("los anteriores conservan FOR-CAL-04 incluso al reimprimir", () => {
    expect(resolveFormatoEtiqueta({ capturado_at: "2026-11-13T18:20:49Z", fuera_de_turno: false })).toBe("FOR-CAL-04");
  });
  it("fuera de turno conserva FOR-CAL-04 después del cambio", () => {
    expect(resolveFormatoEtiqueta({ capturado_at: "2026-11-14T13:00:00Z", fuera_de_turno: true })).toBe("FOR-CAL-04");
  });
  it("no reclasifica registros sin fecha u origen comprobables", () => {
    expect(resolveFormatoEtiqueta({ capturado_at: null, fuera_de_turno: false })).toBe("FOR-CAL-04");
    expect(resolveFormatoEtiqueta({ capturado_at: "inválida", fuera_de_turno: false })).toBe("FOR-CAL-04");
    expect(resolveFormatoEtiqueta({ capturado_at: FOR_CAL_05_DESDE, fuera_de_turno: null })).toBe("FOR-CAL-04");
  });
});