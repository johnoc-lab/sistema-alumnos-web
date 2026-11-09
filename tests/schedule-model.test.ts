import { describe, expect, it } from "vitest";
import {
  limaDay,
  occurrences,
  scheduleRange,
  shiftSchedule,
} from "@/features/schedule/model";

describe("fechas académicas de Horario", () => {
  it("ubica un instante UTC en su fecha local de Lima", () => {
    expect(limaDay(new Date("2026-11-09T02:15:00Z"))).toBe("2026-11-08");
  });
  it("navega por semanas de lunes a domingo aunque cambie el año", () => {
    const query = { view: "week", date: "2026-12-31", course: "" } as const;
    const range = scheduleRange(query);
    expect(range.days).toHaveLength(7);
    expect(range.from).toBe("2026-12-28");
    expect(range.to).toBe("2027-01-04");
    expect(shiftSchedule(query, 1)).toBe("2027-01-07");
  });
  it("incluye las seis semanas necesarias del mes y mantiene fecha válida al avanzar", () => {
    const query = { view: "month", date: "2026-11-30", course: "" } as const;
    expect(scheduleRange(query).days).toHaveLength(42);
    expect(shiftSchedule(query, 1)).toBe("2026-12-01");
  });
  it("genera lunes y miércoles y considera el día final", () => {
    expect(occurrences("2026-11-09", "2026-11-18", [1, 3]).dates).toEqual([
      "2026-11-09",
      "2026-11-11",
      "2026-11-16",
      "2026-11-18",
    ]);
  });
  it("rechaza más de 60 ocurrencias sin devolver una serie parcial", () => {
    const result = occurrences("2026-11-09", "2036-11-09", [1]);
    expect(result.dates).toEqual([]);
    expect(result.error).toContain("60");
  });
  it("rechaza fechas imposibles y rangos sin coincidencias", () => {
    expect(occurrences("2026-02-30", "2026-03-04", [1]).error).not.toBe("");
    expect(occurrences("2026-11-09", "2026-11-09", [3]).error).not.toBe("");
  });
});
