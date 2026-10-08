import { describe, it, expect } from "vitest";

// Local replica of the function to test it without importing the whole TanStack Start environment if not needed,
// but let's try importing it first.
import { shiftOpDateUTC } from "../reporte-mensual.functions";

describe("shiftOpDateUTC (Operational Date Logic)", () => {
  it("should return the same day for Turn 1 at noon MX", () => {
    // 2024-05-15 12:00 MX = 2024-05-15 18:00 UTC
    const date = "2024-05-15T18:00:00.000Z";
    const op = shiftOpDateUTC(date, "1");
    expect(op.getUTCDate()).toBe(15);
    expect(op.getUTCMonth()).toBe(4); // May
  });

  it("should return the same day for Turn 3 at 23:30 MX", () => {
    // 2024-05-15 23:30 MX = 2024-05-16 05:30 UTC
    const date = "2024-05-16T05:30:00.000Z";
    const op = shiftOpDateUTC(date, "3");
    expect(op.getUTCDate()).toBe(15); // Operatively it's still the 15th
  });

  it("should shift back for Turn 3 at 05:00 MX", () => {
    // 2024-05-16 05:00 MX = 2024-05-16 11:00 UTC (wait, 05:00 MX is 11:00 UTC)
    // Actually, Turn 3 usually starts at 23:00 and ends at 07:00 next day.
    // If it's 2024-05-16 05:00 MX, the op_date is 2024-05-15.
    const date = "2024-05-16T11:00:00.000Z"; 
    const op = shiftOpDateUTC(date, "3");
    expect(op.getUTCDate()).toBe(15);
  });
  
  it("should not shift back for Turn 1 at 05:00 MX (if captured then)", () => {
     // If someone captures Turn 1 at 05:00 MX (unlikely, but test logic), it stays same day
     const date = "2024-05-16T11:00:00.000Z";
     const op = shiftOpDateUTC(date, "1");
     expect(op.getUTCDate()).toBe(16);
  });
});
