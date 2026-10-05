"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

export interface MonthPoint {
  month: string; // AAAA-MM-DD (primeiro dia)
  income: number; // centavos
  expense: number; // centavos
}

const monthLabel = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** Escala "bonita" para o eixo: 0 até um múltiplo arredondado do máximo. */
function niceMax(v: number) {
  if (v <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Barras agrupadas receitas × despesas por mês. Um eixo, legenda, tooltip por barra e foco por teclado. */
export function MonthlyChart({ data }: { data: MonthPoint[] }) {
  const [active, setActive] = useState<{ i: number; key: "income" | "expense" } | null>(null);
  const W = 640, H = 240, left = 64, bottom = 28, top = 12;
  const max = niceMax(Math.max(...data.flatMap((d) => [d.income, d.expense])));
  const plotH = H - top - bottom;
  const band = (W - left) / Math.max(data.length, 1);
  const barW = Math.min(28, (band - 12) / 2);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  const tip = active ? data[active.i] : null;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">Receitas e despesas por mês</span>
        <span className="flex gap-4 text-sm text-muted" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-series-1" /> Receitas</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-series-2" /> Despesas</span>
        </span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gráfico de barras: receitas e despesas por mês. A tabela abaixo traz os mesmos valores.">
          {ticks.map((tv) => (
            <g key={tv}>
              <line x1={left} x2={W} y1={y(tv)} y2={y(tv)} stroke="var(--border)" strokeWidth={1} />
              <text x={left - 8} y={y(tv) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL" }).format(tv / 100)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = left + band * i + band / 2;
            return (
              <g key={d.month}>
                {(["income", "expense"] as const).map((key, k) => {
                  const v = d[key];
                  const x = cx - barW - 1 + k * (barW + 2); // 2px de espaço entre as barras
                  const h = Math.max(0, top + plotH - y(v));
                  const label = `${monthLabel(d.month)}, ${key === "income" ? "receitas" : "despesas"}: ${formatMoney(v)}`;
                  return (
                    <g key={key}>
                      {/* Área de toque maior que a barra */}
                      <rect
                        x={x - 2} y={top} width={barW + 4} height={plotH} fill="transparent"
                        tabIndex={0} role="graphics-symbol" aria-label={label}
                        onMouseEnter={() => setActive({ i, key })} onMouseLeave={() => setActive(null)}
                        onFocus={() => setActive({ i, key })} onBlur={() => setActive(null)}
                        className="cursor-default focus:outline-none"
                      />
                      <path
                        d={h > 0 ? `M${x},${top + plotH} v${-(h - Math.min(4, h))} q0,-${Math.min(4, h)} ${Math.min(4, barW / 2)},-${Math.min(4, h)} h${barW - 2 * Math.min(4, barW / 2)} q${Math.min(4, barW / 2)},0 ${Math.min(4, barW / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z` : ""}
                        fill={key === "income" ? "var(--series-1)" : "var(--series-2)"}
                        opacity={active && (active.i !== i || active.key !== key) ? 0.45 : 1}
                        pointerEvents="none"
                      />
                    </g>
                  );
                })}
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">{monthLabel(d.month)}</text>
              </g>
            );
          })}
          <line x1={left} x2={W} y1={top + plotH} y2={top + plotH} stroke="var(--muted)" strokeWidth={1} />
        </svg>
        {tip && active && (
          <div role="status" className="pointer-events-none absolute right-2 top-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow">
            <p className="font-semibold capitalize">{monthLabel(tip.month)}</p>
            <p>Receitas: {formatMoney(tip.income)}</p>
            <p>Despesas: {formatMoney(tip.expense)}</p>
            <p className="text-muted">Saldo: {formatMoney(tip.income - tip.expense)}</p>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Ver como tabela</summary>
        <table className="mt-2 w-full">
          <thead className="text-left text-muted">
            <tr><th scope="col" className="p-1">Mês</th><th scope="col" className="p-1 text-right">Receitas</th><th scope="col" className="p-1 text-right">Despesas</th><th scope="col" className="p-1 text-right">Saldo</th></tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td className="p-1 capitalize">{monthLabel(d.month)}</td>
                <td className="p-1 text-right">{formatMoney(d.income)}</td>
                <td className="p-1 text-right">{formatMoney(d.expense)}</td>
                <td className="p-1 text-right">{formatMoney(d.income - d.expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export interface CategoryPoint {
  id: string | null;
  name: string;
  total: number;
  count: number;
}

/** Barras horizontais de uma série (despesas por categoria), ordenadas; até 8 + "Demais". */
export function CategoryBars({ data, title }: { data: CategoryPoint[]; title: string }) {
  const top = data.slice(0, 8);
  const rest = data.slice(8);
  const rows = rest.length
    ? [...top, { id: "demais", name: `Demais (${rest.length})`, total: rest.reduce((a, r) => a + r.total, 0), count: rest.reduce((a, r) => a + r.count, 0) }]
    : top;
  const max = Math.max(1, ...rows.map((r) => r.total));
  const sum = rows.reduce((a, r) => a + r.total, 0);
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="font-semibold">{title}</figcaption>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id ?? "sem"} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-sm" title={`${r.count} transações`}>
            <span className="truncate">{r.name}</span>
            <span className="h-3 rounded-r bg-background">
              <span className="block h-3 rounded-r bg-series-2" style={{ width: `${Math.max(1, (r.total / max) * 100)}%` }} />
            </span>
            <span className="whitespace-nowrap text-right">
              {formatMoney(r.total)} <span className="text-muted">({Math.round((r.total / sum) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
