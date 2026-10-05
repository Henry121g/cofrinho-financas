import { describe, expect, it } from "vitest";
import { filtersToQuery, parseFilters } from "./filters";
import { matchCategory, type Rule } from "./rules";

const rule = (pattern: string, match: Rule["match"], category_id: string, priority = 100, created_at = "2026-01-01"): Rule => ({
  id: pattern,
  pattern,
  match,
  category_id,
  priority,
  created_at,
});

describe("matchCategory", () => {
  const rules = [
    rule("mercado", "contem", "mercado"),
    rule("supermercado bom", "comeca_com", "especial", 5),
    rule("posto", "contem", "transporte", 100, "2026-01-01"),
    rule("posto", "contem", "outro", 100, "2026-06-01"),
    rule("cinema", "igual", "lazer"),
  ];

  it("ignora maiúsculas e acentos", () => {
    expect(matchCategory(rules, "MERCADO DA PRAÇA")).toBe("mercado");
  });
  it("menor prioridade vence", () => {
    expect(matchCategory(rules, "Supermercado Bom Preço")).toBe("especial");
  });
  it("empate de prioridade: regra mais antiga vence", () => {
    expect(matchCategory(rules, "Posto central")).toBe("transporte");
  });
  it("'igual' exige texto inteiro", () => {
    expect(matchCategory(rules, "Cinema")).toBe("lazer");
    expect(matchCategory(rules, "Cinema shopping")).toBeNull();
  });
});

describe("filtros", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  it("padrão: do 1º dia de dois meses atrás até hoje", () => {
    expect(parseFilters({}, "America/Sao_Paulo", now)).toMatchObject({ from: "2026-08-01", to: "2026-10-15" });
  });
  it("inverte período invertido e ignora valores inválidos", () => {
    const f = parseFilters({ de: "2026-10-10", ate: "2026-09-01", conta: "x", categoria: "' or 1=1" }, "America/Sao_Paulo", now);
    expect(f).toMatchObject({ from: "2026-09-01", to: "2026-10-10", account: "", category: "" });
  });
  it("serializa só o que foi preenchido", () => {
    expect(filtersToQuery({ from: "2026-09-01", to: "2026-09-30", category: "sem" })).toBe("de=2026-09-01&ate=2026-09-30&categoria=sem");
  });
});
