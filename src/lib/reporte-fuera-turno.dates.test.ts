import { describe, it, expect } from "vitest";
import { fueraTurnoWindow } from "./reporte-fuera-turno.dates";
describe("Fuera de turno por fecha de captura mexicana", () => {
  it("incluye medianoche y excluye el día siguiente", () => {
    expect(fueraTurnoWindow("dia", "2026-10-06")).toEqual({ start: "2026-10-06T06:00:00.000Z", end: "2026-10-07T06:00:00.000Z" });
  });
  it("lee el mes completo sin regla de cierres productivos", () => {
    expect(fueraTurnoWindow("mes", "2026-09-15")).toEqual({ start: "2026-09-01T06:00:00.000Z", end: "2026-10-01T06:00:00.000Z" });
  });
  it("resuelve cambio de año y febrero bisiesto", () => {
    expect(fueraTurnoWindow("mes", "2026-12-01").end).toBe("2027-01-01T06:00:00.000Z");
    expect(fueraTurnoWindow("mes", "2024-02-01").end).toBe("2024-03-01T06:00:00.000Z");
  });
});