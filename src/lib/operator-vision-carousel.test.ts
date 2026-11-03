import { describe, expect, it } from "vitest";
import { CAROUSEL_INTERVAL_MS, VISION_CAROUSELS, carouselMachine, nextCarouselMachine, parseVisionCarousel } from "./operator-vision-carousel";

describe("Carruseles operativos", () => {
  it("alterna MP-04 y MP-05 y vuelve al inicio", () => {
    expect(VISION_CAROUSELS["1"]).toEqual(["MP-04", "MP-05"]);
    expect(nextCarouselMachine("1", "MP-04")).toBe("MP-05");
    expect(nextCarouselMachine("1", "MP-05")).toBe("MP-04");
  });
  it("alterna MP-06 y MP-07 y vuelve al inicio", () => {
    expect(VISION_CAROUSELS["2"]).toEqual(["MP-06", "MP-07"]);
    expect(nextCarouselMachine("2", "MP-06")).toBe("MP-07");
    expect(nextCarouselMachine("2", "MP-07")).toBe("MP-06");
  });
  it("recorre las cinco máquinas en orden sin incluir pruebas ni importadas", () => {
    expect(VISION_CAROUSELS["3"]).toEqual(["MP-01", "MP-04", "MP-05", "MP-06", "MP-07"]);
    let machine = "MP-01";
    const visited = [machine];
    for (let index = 0; index < 5; index++) {
      machine = nextCarouselMachine("3", machine);
      visited.push(machine);
    }
    expect(visited).toEqual(["MP-01", "MP-04", "MP-05", "MP-06", "MP-07", "MP-01"]);
  });
  it("cambia cada minuto", () => {
    expect(CAROUSEL_INTERVAL_MS).toBe(60_000);
  });
  it("corrige máquinas fuera del grupo y rechaza grupos desconocidos", () => {
    expect(carouselMachine("1", "MP-01")).toBe("MP-04");
    expect(carouselMachine("2", "MP-07")).toBe("MP-07");
    expect(parseVisionCarousel("4")).toBeUndefined();
    expect(parseVisionCarousel("1")).toBe("1");
    expect(parseVisionCarousel(undefined)).toBeUndefined();
  });
});