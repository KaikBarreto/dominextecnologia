import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface DreHierarchyPeriodValue {
  value: number;
  impactPercent: number;
}

export interface DreHierarchyCostCenter {
  id: string;
  name: string;
  current: number;
  previous?: number;
  comparisonValues?: DreHierarchyPeriodValue[];
}

export interface DreHierarchyLine {
  id: string;
  code: string;
  label: string;
  current: number;
  previous: number;
  impactPercent: number;
  variationPercent: number | null;
  comparisonValues?: DreHierarchyPeriodValue[];
  color?: string;
  icon?: LucideIcon;
  children?: DreHierarchyLine[];
  costCenters?: DreHierarchyCostCenter[];
  isFinalResult?: boolean;
}

export interface DreHierarchyGroup extends Omit<DreHierarchyLine, 'costCenters' | 'isFinalResult'> {
  lines: DreHierarchyLine[];
}

export interface DreHierarchySection extends Omit<DreHierarchyLine, 'costCenters' | 'isFinalResult'> {
  operation: '+' | '-';
  groups: DreHierarchyGroup[];
  resultsAfter?: DreHierarchyLine[];
}

interface DreHierarchyTableProps {
  sections: DreHierarchySection[];
  currentPeriodLabel: string;
  currentPeriodStart?: Date;
  comparisonPeriodLabels?: string[];
  comparisonPeriodStarts?: Array<Date | undefined>;
  renderValue: (value: number) => ReactNode;
  hasComparison: boolean;
  onComparePeriods?: () => void;
  comparisonDisabled?: boolean;
}

const formatPercent = (value: number) => `${value.toLocaleString('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})}%`;

const cleanOperationPrefix = (label: string) => label.replace(/^\s*(?:\([+\-=]\)|[+\-=])\s*/, '');

export function DreHierarchyTable({
  sections,
  currentPeriodLabel,
  currentPeriodStart,
  comparisonPeriodLabels = [],
  comparisonPeriodStarts = [],
  renderValue,
  hasComparison,
  onComparePeriods,
  comparisonDisabled = false,
}: DreHierarchyTableProps) {
  const labels = hasComparison ? comparisonPeriodLabels.slice(0, 3) : [];
  const unsortedPeriodColumns = [
    { label: currentPeriodLabel, start: currentPeriodStart, comparisonIndex: undefined, originalIndex: 0 },
    ...labels.map((label, index) => ({
      label,
      start: comparisonPeriodStarts[index],
      comparisonIndex: index,
      originalIndex: index + 1,
    })),
  ];
  const canSortChronologically = hasComparison && unsortedPeriodColumns.every(
    (column) => column.start && !Number.isNaN(column.start.getTime()),
  );
  const periodColumns = canSortChronologically
    ? [...unsortedPeriodColumns].sort((a, b) => (
        a.start!.getTime() - b.start!.getTime() || a.originalIndex - b.originalIndex
      ))
    : unsortedPeriodColumns;
  const columnCount = periodColumns.length;
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `minmax(330px, 1fr) repeat(${columnCount}, minmax(142px, 164px))`,
  };
  const minWidth = 410 + columnCount * 154;
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const tableRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [floatingHeader, setFloatingHeader] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!hasComparison) {
      setFloatingHeader(null);
      return;
    }
    const table = tableRef.current;
    const header = headerRef.current;
    if (!table || !header) return;
    const scrollParent = (() => {
      let element = table.parentElement;
      while (element) {
        const style = getComputedStyle(element);
        if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) return element;
        element = element.parentElement;
      }
      return null;
    })();
    const update = () => {
      const tableRect = table.getBoundingClientRect();
      const top = scrollParent?.getBoundingClientRect().top ?? 0;
      const visible = tableRect.top < top && tableRect.bottom > top + header.offsetHeight;
      setFloatingHeader(visible ? { top, left: tableRect.left, width: tableRect.width } : null);
    };
    const target: HTMLElement | Window = scrollParent ?? window;
    target.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
    return () => {
      target.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [hasComparison]);

  const toggle = (current: Set<string>, id: string, update: (next: Set<string>) => void) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  const periodCell = (
    value: number,
    impactPercent: number,
    inverse = false,
    absolute = false,
  ) => (
    <span className={cn('flex items-baseline justify-end gap-1.5 whitespace-nowrap text-[13px] tabular-nums', inverse ? 'text-white' : 'text-[#0f172a]')}>
      <span>{renderValue(absolute ? Math.abs(value) : value)}</span>
      <span className={cn('min-w-[42px] text-right text-[11px]', inverse ? 'text-white/75' : 'text-[#64748b]')}>
        {formatPercent(impactPercent)}
      </span>
    </span>
  );

  const valueColumns = (line: DreHierarchyLine, inverse = false, absolute = false) => (
    <>
      {periodColumns.map((column) => {
        if (column.comparisonIndex === undefined) {
          return <span key="current">{periodCell(line.current, line.impactPercent, inverse, absolute)}</span>;
        }
        const comparison = line.comparisonValues?.[column.comparisonIndex];
        return comparison
          ? <span key={`comparison:${column.comparisonIndex}`}>{periodCell(comparison.value, comparison.impactPercent, inverse, absolute)}</span>
          : <span key={`comparison:${column.comparisonIndex}`} className={cn('text-right text-muted-foreground', inverse && 'text-white/60')}>—</span>;
      })}
    </>
  );

  const resultRow = (line: DreHierarchyLine) => {
    const finalClass = line.current > 0
      ? 'bg-emerald-700 text-white'
      : line.current < 0
        ? 'bg-red-700 text-white'
        : 'bg-slate-800 text-white';
    return (
      <div
        key={line.id}
        className={cn(
          'grid items-center gap-3 px-4 py-4 text-sm font-bold',
          line.isFinalResult ? finalClass : 'border-y border-slate-900 bg-slate-900 text-white',
        )}
        style={{ ...gridStyle, minWidth }}
      >
        <span className="flex items-center gap-3">
          <span className="invisible h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold tracking-wide text-white/70">{line.code}</span>
          <span>= {cleanOperationPrefix(line.label)}</span>
        </span>
        {valueColumns(line, true)}
      </div>
    );
  };

  const periodHeader = (floating = false) => (
    <div className={cn('border-b border-[#e2e8f0] bg-[#f1f5f9]', floating && 'shadow-md')} style={{ minWidth }}>
        <div className="grid items-stretch gap-3 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-[#64748b]" style={gridStyle}>
          <div className="flex items-center justify-between gap-3">
            <span>Estrutura do DRE</span>
            {onComparePeriods && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-2 bg-background text-xs font-medium normal-case tracking-normal text-foreground"
                onClick={onComparePeriods}
                disabled={comparisonDisabled}
                aria-pressed={hasComparison}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                Comparar períodos
              </Button>
            )}
          </div>
          {periodColumns.map((column) => (
            <div key={`${column.comparisonIndex ?? 'current'}:${column.label}`} className="flex flex-col items-center justify-center border-l border-border/60 px-2 text-center">
              <span className="block w-full truncate text-[12px] font-bold normal-case tracking-normal text-[#0f172a]">{column.label}</span>
              <span className="mt-1 block text-[9px] font-medium text-[#64748b]">Valor · % receita</span>
            </div>
          ))}
        </div>
      </div>
  );

  return (
    <div ref={tableRef} className="overflow-x-auto lg:overflow-visible">
      <div ref={headerRef} className={cn(hasComparison && 'sticky top-0 z-30', floatingHeader && 'invisible')}>
        {periodHeader()}
      </div>
      {floatingHeader && createPortal(
        <div
          className="pointer-events-none fixed z-50 overflow-hidden"
          style={{ top: floatingHeader.top, left: floatingHeader.left, width: floatingHeader.width }}
          aria-hidden="true"
        >
          {periodHeader(true)}
        </div>,
        document.body,
      )}

      {sections.map((section) => {
        const hasChildren = section.groups.length > 0;
        const expanded = !collapsedSections.has(section.id);
        const sectionLabel = `${section.code} ${cleanOperationPrefix(section.label)}`;
        const sectionContent = (
          <>
            <span className="flex min-w-0 items-center gap-3">
              {hasChildren
                ? (expanded
                  ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                  : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />)
                : <span className="invisible h-4 w-4 shrink-0" aria-hidden="true" />}
              <span className="shrink-0 text-xs font-semibold tracking-wide text-white/60">{section.code}</span>
              <span className="truncate">({section.operation}) {cleanOperationPrefix(section.label)}</span>
            </span>
            {valueColumns(section, true, true)}
          </>
        );

        return (
          <div key={section.id}>
            {hasChildren ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Recolher' : 'Expandir'} ${sectionLabel}`}
                onClick={() => toggle(collapsedSections, section.id, setCollapsedSections)}
                className="grid w-full items-center gap-3 bg-[#172033] px-4 py-3.5 text-left text-[15px] font-bold text-white transition-colors hover:bg-[#1f2b43]"
                style={{ ...gridStyle, minWidth }}
              >
                {sectionContent}
              </button>
            ) : (
              <div className="grid items-center gap-3 bg-[#172033] px-4 py-3.5 text-[15px] font-bold text-white" style={{ ...gridStyle, minWidth }}>
                {sectionContent}
              </div>
            )}

          {expanded && section.groups.map((group) => {
            const expanded = expandedGroups.has(group.id);
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggle(expandedGroups, group.id, setExpandedGroups)}
                  className="grid w-full items-center gap-3 border-b border-[#e2e8f0] bg-[#f1f5f9] px-4 py-3.5 text-left text-[14px] font-semibold text-[#0f172a] transition-colors hover:bg-[#e2e8f0]"
                  style={{ ...gridStyle, minWidth }}
                >
                  <span className="flex items-center gap-2.5">
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="text-xs font-medium tracking-wide text-muted-foreground">{group.code}</span>
                    {group.label}
                  </span>
                  {valueColumns(group, false, true)}
                </button>

                {expanded && group.lines.filter((line) => line.label.trim().toLocaleLowerCase('pt-BR') !== 'total').map((line) => {
                  const categoryExpanded = expandedCategories.has(line.id);
                  const hasChildren = (line.children?.length ?? 0) > 0;
                  const Icon = line.icon;
                  return (
                    <div key={line.id}>
                      <button
                        type="button"
                        disabled={!hasChildren}
                        onClick={() => hasChildren && toggle(expandedCategories, line.id, setExpandedCategories)}
                        className="grid w-full items-center gap-3 border-b border-[#e2e8f0] bg-white px-4 py-3 text-left text-[13px] font-normal text-[#0f172a] transition-colors hover:bg-[#f8fafc] disabled:cursor-default"
                        style={{ ...gridStyle, minWidth }}
                      >
                        <span className="flex min-w-0 items-center gap-2.5 pl-6">
                          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                            {hasChildren && (categoryExpanded
                              ? <ChevronDown className="h-3.5 w-3.5" />
                              : <ChevronRight className="h-3.5 w-3.5" />)}
                          </span>
                          <span className="shrink-0 text-[11px] tracking-wide text-muted-foreground">{line.code}</span>
                          {Icon ? (
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: line.color ?? '#64748b' }}>
                              <Icon className="h-3 w-3 text-white" />
                            </span>
                          ) : line.color ? (
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: line.color }} />
                          ) : null}
                          <span className="truncate">{line.label}</span>
                        </span>
                        {valueColumns(line, false, true)}
                      </button>

                      {categoryExpanded && line.children?.map((child) => {
                        const ChildIcon = child.icon;
                        return (
                        <div
                          key={child.id}
                          className="grid items-center gap-3 border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-2.5 text-xs font-normal text-[#64748b]"
                          style={{ ...gridStyle, minWidth }}
                        >
                          <span className="flex min-w-0 items-center gap-2 pl-16">
                            <span className="text-[11px] tracking-wide">{child.code}</span>
                            {ChildIcon ? (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: child.color ?? '#64748b' }}>
                                <ChildIcon className="h-3 w-3 text-white" />
                              </span>
                            ) : child.color ? (
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: child.color }} />
                            ) : null}
                            <span className="truncate">{child.label}</span>
                          </span>
                          {valueColumns(child, false, true)}
                        </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}

            {section.resultsAfter?.map(resultRow)}
          </div>
        );
      })}
    </div>
  );
}
