import type { CSSProperties } from 'react';

export interface DfcDailyRow {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  closingBalance: number;
}

interface DfcDailyTableProps {
  rows: DfcDailyRow[];
  formatMoney: (value: number) => string;
  formatDate: (value: string) => string;
}

const gridStyle: CSSProperties = {
  gridTemplateColumns: 'minmax(150px, 1fr) repeat(4, minmax(132px, 160px))',
};

function Value({ value, formatMoney, absolute = false }: {
  value: number;
  formatMoney: (value: number) => string;
  absolute?: boolean;
}) {
  return (
    <span className="whitespace-nowrap text-right tabular-nums">
      {Math.abs(value) < 0.005 ? '—' : formatMoney(absolute ? Math.abs(value) : value)}
    </span>
  );
}

export function DfcDailyTable({ rows, formatMoney, formatDate }: DfcDailyTableProps) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-label="DFC realizado dia a dia">
      <div className="border-b bg-foreground px-4 py-3 text-background">
        <h3 className="text-sm font-semibold">Realizado dia a dia</h3>
        <p className="mt-0.5 text-xs text-background/65">Evolução do caixa pelas datas em que o dinheiro entrou ou saiu.</p>
      </div>
      <div className="max-h-[440px] overflow-auto">
        <div className="min-w-[760px]">
          <div className="sticky top-0 z-20 grid gap-3 border-b bg-[#f8fafc] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-[#64748b]" style={gridStyle}>
            <span>Data</span>
            <span className="text-right">Entradas</span>
            <span className="text-right">Saídas</span>
            <span className="text-right">Variação</span>
            <span className="text-right">Saldo realizado</span>
          </div>
          {rows.map((row) => (
            <div key={row.date} className="grid items-center gap-3 border-b px-4 py-3 text-sm text-[#334155] last:border-b-0" style={gridStyle}>
              <span className="font-medium text-[#0f172a]">{formatDate(row.date)}</span>
              <Value value={row.inflow} formatMoney={formatMoney} />
              <Value value={row.outflow} formatMoney={formatMoney} absolute />
              <Value value={row.net} formatMoney={formatMoney} />
              <span className="whitespace-nowrap text-right font-semibold tabular-nums text-[#0f172a]">{formatMoney(row.closingBalance)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
