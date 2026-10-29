import { describe, expect, it } from "vitest";
import { mostrarMenuFueraTurno } from "./nav-visibility";

describe("visibilidad exclusiva del menú fuera de turno", () => {
  it("permite adgral independientemente de la planta", () => {
    for (const email of ["adgral@convertipap.site", "ADGRAL@convertipap.site"]) {
      expect(mostrarMenuFueraTurno(email)).toBe(true);
    }
  });

  it("oculta el menú a Calidad de ambas plantas y a cualquier otra cuenta", () => {
    for (const email of ["gcalidad@convertipap.site", "msramosixt@convertipap.site", "jrivera@convertipap.site", "jjrodixt@convertipap.site", "otro@convertipap.site", null, undefined]) {
      expect(mostrarMenuFueraTurno(email)).toBe(false);
    }
  });
});