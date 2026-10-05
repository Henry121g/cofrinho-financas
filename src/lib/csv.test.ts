import { describe, expect, it } from "vitest";
import { centsToCsv, toCsv } from "./csv";

describe("CSV", () => {
  it("usa ponto e vírgula, BOM e escapa aspas", () => {
    const csv = toCsv(["Produto", "Total"], [['Café "Especial"; 500 g', "19,99"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Café ""Especial""; 500 g";19,99');
  });

  it("neutraliza fórmulas em texto", () => {
    expect(toCsv(["x"], [["=HYPERLINK(1)"]])).toContain("'=HYPERLINK(1)");
  });

  it("formata centavos sem ponto flutuante", () => {
    expect(centsToCsv(123456)).toBe("1234,56");
    expect(centsToCsv(5)).toBe("0,05");
    expect(centsToCsv(-250)).toBe("-2,50");
  });
});
