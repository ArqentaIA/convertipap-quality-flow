// Presentation-only rule; server authorization remains independent.
export function mostrarMenuFueraTurno(email?: string | null): boolean {
  return email?.trim().toLowerCase() === "adgral@convertipap.site";
}