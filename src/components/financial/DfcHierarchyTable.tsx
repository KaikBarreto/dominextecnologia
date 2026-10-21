import { useState, type ComponentType, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DfcHierarchyValue {
  inflow: number;
  outflow: number;
  net: number;
}

export interface DfcHierarchyRow extends DfcHierarchyValue {
  id: string;
  code: string;
  label: string;
  color?: string | null;
  icon?: ComponentType<{ className?: string }>;
  children?: DfcHierarchyRow[];
}

export interface DfcHierarchySection extends DfcHierarchyValue {
  id: string;
  code: string;
  label: string;
  rows: DfcHierarchyRow[];
}

interface DfcHierarchyTableProps {
  sections: DfcHierarchySection[];
  formatMoney: (value: number) => string;
  finalValue: DfcHierarchyValue;
}

const gridStyle: CSSProperties = {
  gridTemplateColumns: 'minmax(280px, 1fr) repeat(3, minmax(132px, 160px))',
};

function MoneyCell({ value, formatMoney, absolute = false }: {
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

function Values({ value, formatMoney, showNet = true }: {
  value: DfcHierarchyValue;
  formatMoney: (value: number) => string;
  showNet?: boolean;
}) {
  return (
    <>
      <MoneyCell value={value.inflow} formatMoney={formatMoney} />
      <MoneyCell value={value.outflow} formatMoney={formatMoney} absolute />
      {showNet
        ? <MoneyCell value={value.net} formatMoney={formatMoney} />
        : <span className="text-right text-muted-foreground">—</span>}
    </>
  );
}

export function DfcHierarchyTable({ sections, formatMoney, finalValue }: DfcHierarchyTableProps) {
  const [expandedSections, setExpandedSections] = useState(() => new Set(sections.map((section) => section.id)));
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggle = (setter: Dispatch<SetStateAction<Set<string>>>, id: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="overflow-x-auto rounded-b-lg bg-white">
      <div className="min-w-[760px]">
        <div className="sticky top-0 z-30 grid items-center gap-3 border-b border-[#cbd5e1] bg-[#f8fafc] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-[#64748b] shadow-[0_1px_0_rgba(15,23,42,0.08)]" style={gridStyle}>
          <span>Estrutura do DFC</span>
          <span className="text-right">Entradas</span>
          <span className="text-right">Saídas</span>
          <span className="text-right">Líquido</span>
        </div>

        {sections.map((section) => {
          const open = expandedSections.has(section.id);
          return (
            <div key={section.id}>
              <button
                type="button"
                data-dfc-group-icon={section.id}
                className="grid w-full items-center gap-3 bg-[#172033] px-4 py-3.5 text-left text-[15px] font-bold text-white transition-colors hover:bg-[#202c43]"
                style={gridStyle}
                onClick={() => toggle(setExpandedSections, section.id)}
                aria-expanded={open}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="text-xs font-semibold tracking-wide text-white/60">{section.code}</span>
                  <span className="truncate">{section.label}</span>
                </span>
                <Values value={section} formatMoney={formatMoney} />
              </button>

              {open && section.rows.map((row) => {
                const rowOpen = expandedRows.has(row.id);
                const hasChildren = Boolean(row.children?.length);
                const Icon = row.icon;
                return (
                  <div key={row.id}>
                    <button
                      type="button"
                      className="grid w-full items-center gap-3 border-b border-[#e2e8f0] bg-[#f1f5f9] px-4 py-3.5 text-left text-[14px] font-semibold text-[#0f172a] transition-colors hover:bg-[#e2e8f0]"
                      style={gridStyle}
                      onClick={() => hasChildren && toggle(setExpandedRows, row.id)}
                      aria-expanded={hasChildren ? rowOpen : undefined}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                          {hasChildren && (rowOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                        </span>
                        <span className="text-xs font-normal text-[#64748b]">{row.code}</span>
                        {Icon && (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: row.color || '#64748b' }}>
                            <Icon className="h-3.5 w-3.5 text-white" />
                          </span>
                        )}
                        <span className="truncate">{row.label}</span>
                      </span>
                      <Values value={row} formatMoney={formatMoney} showNet={row.inflow !== 0 && row.outflow !== 0} />
                    </button>

                    {rowOpen && row.children?.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <div key={child.id} className="grid items-center gap-3 border-b border-[#e2e8f0] bg-white px-4 py-3 text-[13px] font-normal text-[#334155]" style={gridStyle}>
                          <span className="flex min-w-0 items-center gap-2 pl-8">
                            <span className="text-xs text-[#94a3b8]">{child.code}</span>
                            {ChildIcon && (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: child.color || '#94a3b8' }}>
                                <ChildIcon className="h-3 w-3 text-white" />
                              </span>
                            )}
                            <span className="truncate">{child.label}</span>
                          </span>
                          <Values value={child} formatMoney={formatMoney} showNet={child.inflow !== 0 && child.outflow !== 0} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className={cn(
          'grid items-center gap-3 px-4 py-4 text-sm font-bold text-white',
          finalValue.net > 0 ? 'bg-[#15803d]' : finalValue.net < 0 ? 'bg-[#dc2626]' : 'bg-[#475569]',
        )} style={gridStyle}>
          <span className="flex items-center gap-2"><span className="text-xs text-white/70">04</span>Variação líquida de caixa</span>
          <Values value={finalValue} formatMoney={formatMoney} />
        </div>
      </div>
    </div>
  );
}
