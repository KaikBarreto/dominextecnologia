import { FileSignature, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Variante de PALETA do card de contrato. O LAYOUT é idêntico; só muda a cor:
 *  - 'document' (relatório/PDF): DOCUMENTO sempre claro. Cores `slate-*` hardcoded
 *    e `data-pdf-section` (entra no PDF). Usado no OSReport.
 *  - 'app' (execução/acompanhamento): segue o TEMA do usuário (claro E escuro) via
 *    tokens neutros (`border`/`bg-card`/`text-foreground`/`text-muted-foreground`).
 *    NUNCA fundo azul. Não entra em PDF (sem `data-pdf-section`).
 *
 * Espelha o padrão de `EquipmentChecklistHeader` (tone 'app' | 'document').
 */
export type ContractInfoCardTone = 'app' | 'document';

const TONE: Record<ContractInfoCardTone, {
  card: string;
  title: string;
  name: string;
  legal: string;
  legalIcon: string;
}> = {
  document: {
    card: 'border border-slate-200',
    title: 'text-slate-500',
    name: 'text-slate-900',
    legal: 'text-slate-500',
    legalIcon: 'text-slate-400',
  },
  app: {
    card: 'border border-border bg-card',
    title: 'text-muted-foreground',
    name: 'text-foreground',
    legal: 'text-muted-foreground',
    legalIcon: 'text-muted-foreground',
  },
};

/**
 * Card NEUTRO de "Contrato" — fonte ÚNICA entre o RELATÓRIO (OSReport, tone
 * 'document') e as telas de EXECUÇÃO/ACOMPANHAMENTO (TechnicianOS, tone 'app').
 * Mostra o nome do contrato e, quando PMOC, a nota de conformidade
 * "Lei Federal 13.589/2018" como linha secundária discreta (sem fundo azul).
 * Substituiu o selo azul `PmocComplianceBadge variant="ribbon"` no topo das telas
 * de campo — o CEO quer o mesmo card neutro do relatório em todos os contextos.
 */
export function ContractInfoCard({
  name,
  isPmoc = false,
  tone = 'document',
  bare = false,
  className,
}: {
  name: string;
  /** Mostra a linha "Conforme Lei Federal 13.589/2018" (só quando PMOC). */
  isPmoc?: boolean;
  /** Paleta: 'document' (relatório claro/PDF) ou 'app' (tema do usuário). */
  tone?: ContractInfoCardTone;
  /**
   * `bare`: renderiza SEM borda/fundo/padding próprios — pra viver como
   * SUBSEÇÃO dentro de outro card (ex.: o card "Cliente" na execução da OS).
   * Mantém o título "Contrato", o nome e a nota da lei, só sem a moldura.
   */
  bare?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      // `data-pdf-section` só no documento (entra no PDF); no app não é PDF.
      {...(tone === 'document' ? { 'data-pdf-section': true } : {})}
      className={cn(bare ? '' : cn('rounded-lg p-3 sm:p-4', t.card), className)}
    >
      <h3 className={cn('text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5', t.title)}>
        <FileSignature className="h-3.5 w-3.5" /> Contrato
      </h3>
      <p className={cn('font-semibold', t.name)}>{name}</p>
      {isPmoc && (
        <p className={cn('text-xs mt-1 flex items-center gap-1', t.legal)}>
          <ShieldCheck className={cn('h-3.5 w-3.5 shrink-0', t.legalIcon)} />
          Conforme Lei Federal 13.589/2018
        </p>
      )}
    </div>
  );
}
