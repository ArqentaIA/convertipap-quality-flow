export const CAROUSEL_INTERVAL_MS = 60_000;

export const VISION_CAROUSELS = {
  "1": ["MP-04", "MP-05"],
  "2": ["MP-06", "MP-07"],
  "3": ["MP-01", "MP-04", "MP-05", "MP-06", "MP-07"],
} as const;

export type VisionCarousel = keyof typeof VISION_CAROUSELS;

export function parseVisionCarousel(value: unknown): VisionCarousel | undefined {
  const id = String(value ?? "");
  return id === "1" || id === "2" || id === "3" ? id : undefined;
}

export function carouselMachine(id: VisionCarousel, machine: string) {
  const sequence: readonly string[] = VISION_CAROUSELS[id];
  return sequence.includes(machine) ? machine : VISION_CAROUSELS[id][0];
}

export function nextCarouselMachine(id: VisionCarousel, machine: string) {
  const sequence: readonly string[] = VISION_CAROUSELS[id];
  const index = sequence.indexOf(machine);
  return sequence[(index + 1) % sequence.length] ?? VISION_CAROUSELS[id][0];
}