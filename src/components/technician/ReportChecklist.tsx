import { ListChecks, Wrench, Check, X, MinusCircle, HelpCircle, Gauge } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SignedImg } from '@/components/ui/SignedImg';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/**
 * Item do checklist normalizado pro RELATÓRIO (read-only). Os dois modos da tela
 * de OS (técnico autenticado e cliente anônimo) convergem pra ESTE shape antes de
 * renderizar — o adaptador vive em TechnicianOS.tsx.
 *
 * - autenticado: vem de `service_order_activities` via `useOsActivityChecklist`.
 * - anônimo: vem de `payload.activities` da RPC `get_public_os` (RLS bloqueia
 *   a leitura direta da tabela pelo anon).
 */
export interface ReportChecklistItem {
  id: string;
  equipment_id: string | null;
  /** null = atividade geral (sem equipamento). Agrupada por último. */
  equipment_name: string | null;
  description: string;
  section: string | null;
  component: string | null;
  guidance: string | null;
  conformity_status: 'conforme' | 'nao_conforme' | 'na' | null;
  is_measurement: boolean;
  measured_value: number | null;
  unit: string | null;
  expected_min: number | null;
  expected_max: number | null;
  sort_order: number;
  /**
   * Frequência PMOC da atividade (M/T/S/A/E). Usada pra derivar o "Tipo de
   * Visita" no cabeçalho do grupo. Opcional: o modo cliente (anônimo) ainda não
   * recebe esse campo do payload público, então o cabeçalho some sem quebrar.
   */
  freq_code?: string | null;
  /** URLs públicas das fotos anexadas pelo técnico. */
  photos: string[];
  /**
   * Checklist personalizado por máquina (PMOC por equipamento): quando
   * preenchido, este item não é de conformidade e sim um bloco de perguntas —
   * é filtrado fora do relatório de conformidade.
   */
  form_template_id?: string | null;
}

interface ReportChecklistGroup {
  equipmentName: string | null;
  items: ReportChecklistItem[];
}

interface Props {
  items: ReportChecklistItem[];
  /** Abre a foto no viewer interno da tela (NUNCA em nova aba). */
  onPreviewPhoto?: (url: string, images?: string[], index?: number) => void;
  /**
   * Id de âncora (scroll target) por grupo de equipamento. Usado pela sidebar
   * desktop da tela de OS pra rolar até o equipamento. Recebe o equipmentName
   * (ou null pro grupo "Geral"). Só desktop — não afeta o mobile.
   */
  anchorIdForGroup?: (equipmentName: string | null) => string | undefined;
}

function ConformityBadge({ status }: { status: ReportChecklistItem['conformity_status'] }) {
  const { locale } = useAppLocaleContext();
  const tR = MESSAGES[locale].app.os.technicianReport;
  const CONFORMITY_META: Record<
    'conforme' | 'nao_conforme' | 'na',
    { label: string; icon: typeof Check; className: string }
  > = {
    conforme: { label: tR.conformityConforme, icon: Check, className: 'bg-success text-success-foreground border-success' },
    nao_conforme: { label: tR.conformityNaoConforme, icon: X, className: 'bg-destructive text-destructive-foreground border-destructive' },
    na: { label: tR.conformityNa, icon: MinusCircle, className: 'bg-muted text-muted-foreground border-border' },
  };
  if (!status) {
    return (
      <Badge variant="outline" className="gap-1 shrink-0 text-[11px] text-muted-foreground">
        <HelpCircle className="h-3 w-3 shrink-0" />
        {tR.conformityUnanswered}
      </Badge>
    );
  }
  const meta = CONFORMITY_META[status];
  const Icon = meta.icon;
  return (
    <Badge className={cn('gap-1 shrink-0 text-[11px] border', meta.className)}>
      <Icon className="h-3 w-3 shrink-0" />
      {meta.label}
    </Badge>
  );
}

function formatNumber(n: number): string {
  return String(n).replace('.', ',');
}

/** Agrupa por equipment_name preservando sort_order; null (geral) por último. */
function groupItems(items: ReportChecklistItem[]): ReportChecklistGroup[] {
  const sorted = [...items].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return (a.section || '').localeCompare(b.section || '');
  });
  const groups: ReportChecklistGroup[] = [];
  const index = new Map<string, number>();
  for (const item of sorted) {
    const key = item.equipment_name ?? '__geral__';
    let idx = index.get(key);
    if (idx === undefined) {
      idx = groups.length;
      index.set(key, idx);
      groups.push({ equipmentName: item.equipment_name, items: [] });
    }
    groups[idx].items.push(item);
  }
  // Atividade geral (sem equipamento) sempre por último.
  groups.sort((a, b) => {
    if (a.equipmentName === null && b.equipmentName !== null) return 1;
    if (a.equipmentName !== null && b.equipmentName === null) return -1;
    return 0;
  });
  return groups;
}

/**
 * Bloco read-only "Checklist da Visita" do relatório de OS concluída. Agrupa por
 * equipamento e mostra conformidade, medição e fotos de cada atividade. Não
 * renderiza nada quando não há atividades.
 */
export function ReportChecklist({ items, onPreviewPhoto, anchorIdForGroup }: Props) {
  const { locale } = useAppLocaleContext();
  const tR = MESSAGES[locale].app.os.technicianReport;

  if (!items || items.length === 0) return null;

  const groups = groupItems(items);
  const firstKey = groups[0]?.equipmentName ?? '__geral__';

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {tR.visitChecklistLabel}
          </span>
        </div>
        <Accordion type="multiple" defaultValue={[firstKey]} className="w-full">
          {groups.map((group) => {
            const groupKey = group.equipmentName ?? '__geral__';
            const total = group.items.length;
            const answered = group.items.filter((a) => !!a.conformity_status).length;
            const naoConforme = group.items.filter((a) => a.conformity_status === 'nao_conforme').length;
            const pending = total - answered;
            return (
              <AccordionItem
                key={groupKey}
                value={groupKey}
                id={anchorIdForGroup?.(group.equipmentName)}
                className="border-b last:border-0 scroll-mt-24"
              >
                <AccordionTrigger className="hover:no-underline py-3 gap-2 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {group.equipmentName ?? tR.generalGroup}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {total === 1 ? tR.itemCountSingular.replace('{n}', '1') : tR.itemCountPlural.replace('{n}', String(total))}
                      </p>
                    </div>
                    {naoConforme > 0 ? (
                      <Badge variant="destructive" className="gap-1 text-xs shrink-0">
                        <X className="h-3 w-3" />
                        {naoConforme === 1 ? tR.naoConformeBadge.replace('{n}', '1') : tR.naoConformeBadgePlural.replace('{n}', String(naoConforme))}
                      </Badge>
                    ) : pending === 0 ? (
                      <Badge variant="success" className="gap-1 shrink-0">
                        <Check className="h-3 w-3" /> {tR.conformeBadge}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                        {tR.pendingBadge.replace('{n}', String(pending))}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-1">
                    {group.items.map((item, idx) => (
                      <div key={item.id} className="space-y-2 p-3 rounded-lg bg-muted/30">
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-muted-foreground text-sm leading-5">{idx + 1}.</span>
                          <div className="flex-1 min-w-0">
                            {item.section && (
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                {item.section}
                                {item.component ? ` · ${item.component}` : ''}
                              </p>
                            )}
                            <p className="text-sm font-medium text-foreground break-words">{item.description}</p>
                            {item.guidance && (
                              <p className="text-xs text-muted-foreground break-words mt-0.5">{item.guidance}</p>
                            )}
                          </div>
                          <ConformityBadge status={item.conformity_status} />
                        </div>

                        {item.is_measurement && (
                          <div className="flex items-center gap-1.5 text-sm">
                            <Gauge className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {item.measured_value !== null ? (
                              <span className="font-medium text-foreground">
                                {formatNumber(item.measured_value)}
                                {item.unit ? ` ${item.unit}` : ''}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">{tR.noMeasurement}</span>
                            )}
                          </div>
                        )}

                        {item.photos.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {item.photos.map((url, i) => (
                              <SignedImg
                                key={i}
                                src={url}
                                alt="Foto da atividade"
                                className="rounded-md h-20 w-20 object-cover border cursor-pointer"
                                onClick={() => onPreviewPhoto?.(url, item.photos, i)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
