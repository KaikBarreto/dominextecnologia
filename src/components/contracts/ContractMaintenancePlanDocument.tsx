import { Fragment, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR, enUS, es, fr } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { Printer, X, CalendarClock, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChecklistQuestionsByTemplates } from '@/hooks/useContractChecklistQuestions';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import {
  generateOccurrences,
  getFrequencyLabel,
  type Contract,
  type ContractItem,
  type ContractEnvironment,
} from '@/hooks/useContracts';
import {
  scheduleActivitiesOntoVisits,
  type VisitInput,
} from './visitScheduleEngine';
import { toActivitySpec } from './visitQuestionVisibility';
import { frequencyLabel } from './questionFrequency';
import type { FormQuestion } from '@/types/database';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';

/** Mapa LocaleCode → date-fns Locale (para formatação de datas por idioma). */
const DATE_FNS_LOCALE: Record<LocaleCode, Locale> = {
  'pt-br': ptBR,
  en: enUS,
  es,
  fr,
};

/**
 * Documento "Plano de Manutenção" de um contrato COMUM (não-PMOC). Fase C.
 *
 * Tela-documento pronta pra IMPRIMIR / salvar como PDF pelo navegador (não é
 * edge function). Régua da casa: tema CLARO hardcoded (nada de tokens que
 * escurecem no dark mode) + CSS de impressão (.print-report no index.css esconde
 * o resto da página, fixa A4 e força as cores). É um documento NOVO e próprio —
 * NÃO é a Planilha PMOC.
 *
 * Conteúdo (POR EQUIPAMENTO — o contrato comum guarda os checklists em
 * `contract_items.form_template_ids`, com fallback pro single
 * `form_template_id`. Um equipamento pode ter VÁRIOS checklists):
 *  1. Cabeçalho com identidade da empresa (white-label se houver) + dados do
 *     contrato (cliente, vigência, frequência das visitas).
 *  2. Ambientes do contrato com seus equipamentos (+ grupo "Sem ambiente").
 *  3. Para CADA equipamento: a UNIÃO dos serviços de todos os seus checklists +
 *     frequência e a grade visitas × serviços (sub-cabeçalho por checklist
 *     quando há mais de um).
 *
 * Âncora da grade = a MESMA do técnico (`visitQuestionVisibility.toActivitySpec`,
 * fonte única): pergunta EXCLUÍDA da 1ª OS do equipamento
 * (`contract_items.first_os_excluded_questions`) → 'contract_start' (não marca a
 * 1ª coluna); pergunta INCLUÍDA → 'due_now' (marca a 1ª coluna). Assim o documento
 * bate coluna-a-coluna com o que o técnico enxerga.
 */

const MAX_VISIT_COLUMNS = 12;

interface ContractMaintenancePlanDocumentProps {
  contract: Contract;
  /** Fecha o overlay do documento (volta pro detalhe). */
  onClose: () => void;
}

/** Formata um número opcional (área, ocupantes etc.), com sufixo opcional. '-' quando vazio. */
function formatOptionalNumber(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const text = Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  return suffix ? `${text} ${suffix}` : text;
}

/** Parse 'YYYY-MM-DD' como data local (evita shift de fuso). */
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

/** Conjunto de ids excluídos da 1ª OS de um equipamento (flag por equipamento). */
function excludedSet(item: ContractItem): Set<string> {
  const raw = item.first_os_excluded_questions;
  return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
}

/**
 * Templates EFETIVOS de um equipamento (contrato de dados do épico "múltiplos
 * checklists por equipamento"): `form_template_ids` quando não-vazio; senão
 * `[form_template_id]` quando setado; senão `[]`. Dedup mantendo a ordem.
 */
function effectiveTemplateIds(item: ContractItem): string[] {
  const many = Array.isArray(item.form_template_ids)
    ? item.form_template_ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const base = many.length > 0 ? many : item.form_template_id ? [item.form_template_id] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of base) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function ContractMaintenancePlanDocument({
  contract,
  onClose,
}: ContractMaintenancePlanDocumentProps) {
  const { settings } = useCompanySettings();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.contracts.contractDocs;
  const dateFnsLocale = DATE_FNS_LOCALE[locale];

  // PMOC ganha a cara da norma: título/eyebrow próprios e os campos de
  // identificação de cada ambiente (área climatizada, carga térmica, ocupantes,
  // tipo/uso). No contrato comum nada disso aparece — segue exatamente como antes.
  const isPmoc = (contract as { is_pmoc?: boolean }).is_pmoc === true;
  const docTitle = isPmoc ? t.pmocTitle : t.docTitle;
  const docEyebrow = isPmoc ? t.pmocEyebrow : t.docEyebrow;

  // Nomes dos checklists (templates) pra rotular os sub-cabeçalhos quando um
  // equipamento tem mais de um checklist. Query já cacheada do app.
  const { templates: formTemplates } = useFormTemplates();
  const templateNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of formTemplates || []) map.set(t.id, t.name);
    return map;
  }, [formTemplates]);

  // Identidade da empresa: respeita white-label quando ligado (mesma regra dos
  // demais documentos). Logo e nome caem pro padrão quando o WL está off.
  const companyName = settings?.name || 'Empresa';
  const companyLogo = settings?.white_label_enabled
    ? settings?.white_label_logo_url || settings?.logo_url
    : settings?.logo_url;
  const companyDocument = settings?.document;
  const companyAddress = [settings?.address, settings?.city, settings?.state]
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .join(', ');

  // Ambientes ordenados + agrupamento de equipamentos por ambiente.
  const items: ContractItem[] = contract.contract_items || [];
  const environments: ContractEnvironment[] = useMemo(
    () =>
      [...(contract.contract_environments || [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      ),
    [contract.contract_environments],
  );

  const itemsByEnvironment = useMemo(() => {
    const map = new Map<string, ContractItem[]>();
    const noEnv: ContractItem[] = [];
    const sorted = [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const it of sorted) {
      if (it.environment_id) {
        const arr = map.get(it.environment_id);
        if (arr) arr.push(it);
        else map.set(it.environment_id, [it]);
      } else {
        noEnv.push(it);
      }
    }
    return { map, noEnv };
  }, [items]);

  // Datas das próximas ~12 visitas: datas REAIS das OSs do contrato quando
  // existirem; se faltar futuro, projeta com generateOccurrences. Limite de 12
  // colunas pra caber na folha A4.
  const visitDates = useMemo<Date[]>(() => {
    const realDates = (contract.service_orders || [])
      .map((os) => os.scheduled_date)
      .filter((d): d is string => !!d)
      .map((d) => parseLocalDate(d))
      .sort((a, b) => a.getTime() - b.getTime());

    if (realDates.length >= MAX_VISIT_COLUMNS) {
      return realDates.slice(0, MAX_VISIT_COLUMNS);
    }

    // Projeta o resto com a cadência do contrato (mesma lógica de geração).
    const start = parseLocalDate(contract.start_date);
    const freqType = (contract.frequency_type === 'days' ? 'days' : 'months') as 'days' | 'months';
    const projected = generateOccurrences(
      start,
      freqType,
      contract.frequency_value,
      contract.horizon_months,
    );

    // Funde reais + projetadas, deduplicando por dia, ordena e corta em 12.
    const seen = new Set<string>();
    const merged: Date[] = [];
    for (const d of [...realDates, ...projected].sort((a, b) => a.getTime() - b.getTime())) {
      const key = format(d, 'yyyy-MM-dd');
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(d);
      if (merged.length >= MAX_VISIT_COLUMNS) break;
    }
    return merged;
  }, [contract]);

  // Equipamentos COM checklist. Um equipamento pode ter VÁRIOS checklists
  // (`contract_items.form_template_ids`), com fallback pro single
  // (`form_template_id`) — ver `effectiveTemplateIds`. Itens sem nenhum template
  // não entram. Ordenados por sort_order (mesma ordem dos ambientes).
  const checklistItems = useMemo<ContractItem[]>(
    () =>
      [...items]
        .filter((it) => effectiveTemplateIds(it).length > 0)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [items],
  );

  // Carrega as perguntas de TODOS os templates de TODOS os equipamentos numa
  // tacada (união deduplicada), agrupadas por template_id (hook é a fronteira do
  // Supabase). Reusa `useChecklistQuestionsByTemplates`.
  const templateIds = useMemo(
    () => checklistItems.flatMap((it) => effectiveTemplateIds(it)),
    [checklistItems],
  );
  const { data: questionsByTemplate, isLoading: isLoadingQuestions } =
    useChecklistQuestionsByTemplates(templateIds);

  // Para cada equipamento: a UNIÃO das perguntas de TODOS os seus checklists + a
  // grade visitas × perguntas, usando a MESMA âncora do técnico (`toActivitySpec`
  // com o Set de excluídos da 1ª OS daquele equipamento — fonte única com
  // `visitQuestionVisibility`). O Set de excluídos é POR EQUIPAMENTO e vale pras
  // perguntas de todos os templates do item.
  //
  // Quando o equipamento tem >1 checklist, agrupamos a lista de serviços por
  // checklist (sub-cabeçalho) pra ficar legível no documento impresso; a grade e
  // o motor rodam sobre a união achatada (os ids de pergunta são únicos entre
  // templates). Com 1 só checklist, não há sub-cabeçalho — fica igual ao atual.
  interface ChecklistGroup {
    templateId: string;
    questions: FormQuestion[];
  }
  interface EquipmentChecklist {
    item: ContractItem;
    title: string;
    meta: string | null;
    /** Grupos por checklist (na ordem dos templates do equipamento). */
    groups: ChecklistGroup[];
    /** União achatada das perguntas (ordem dos templates, depois position). */
    questions: FormQuestion[];
    /** Mais de um checklist no equipamento → mostra sub-cabeçalhos. */
    multipleChecklists: boolean;
    /** questionId → Set de índices de visita (colunas) em que a pergunta cai. */
    dueByQuestion: Map<string, Set<number>>;
  }

  const equipmentChecklists = useMemo<EquipmentChecklist[]>(() => {
    if (!questionsByTemplate || checklistItems.length === 0) return [];
    const visits: VisitInput[] = visitDates.map((d) => ({ date: d }));

    const out: EquipmentChecklist[] = [];
    for (const item of checklistItems) {
      // União das perguntas de todos os checklists do equipamento. Mantém a
      // ordem dos templates; deduplica perguntas (se o mesmo template repetir).
      const tplIds = effectiveTemplateIds(item);
      const groups: ChecklistGroup[] = [];
      const flat: FormQuestion[] = [];
      const seenQ = new Set<string>();
      for (const tid of tplIds) {
        const qs = questionsByTemplate.get(tid) ?? [];
        if (qs.length === 0) continue;
        const groupQs: FormQuestion[] = [];
        for (const q of qs) {
          if (seenQ.has(q.id)) continue;
          seenQ.add(q.id);
          groupQs.push(q);
          flat.push(q);
        }
        if (groupQs.length > 0) groups.push({ templateId: tid, questions: groupQs });
      }
      if (flat.length === 0) continue;

      const excluded = excludedSet(item);
      const dueByQuestion = new Map<string, Set<number>>();

      if (visits.length > 0) {
        // Mesma derivação de ActivitySpec do técnico: a âncora vem do flag por
        // equipamento (excluída → 'contract_start'; incluída → 'due_now').
        // Pergunta SEM frequência cai em 'visits'/1 = toda visita (todas as
        // colunas), espelhando o "sempre" do helper.
        const specs = flat.map((q) =>
          q.freq_kind === 'time' || q.freq_kind === 'visits'
            ? toActivitySpec(q, excluded)
            : { id: q.id, freqKind: 'visits' as const, freqVisits: 1, startKind: 'due_now' as const },
        );
        const schedule = scheduleActivitiesOntoVisits(visits, specs);
        for (const [visitIndex, ids] of schedule.entries()) {
          for (const id of ids) {
            const set = dueByQuestion.get(id);
            if (set) set.add(visitIndex);
            else dueByQuestion.set(id, new Set([visitIndex]));
          }
        }
      }

      const title = item.equipment?.name || item.item_name;
      const meta = [item.equipment?.brand, item.equipment?.model].filter(Boolean).join(' · ') || null;
      out.push({
        item,
        title,
        meta,
        groups,
        questions: flat,
        multipleChecklists: groups.length > 1,
        dueByQuestion,
      });
    }
    return out;
  }, [questionsByTemplate, checklistItems, visitDates]);

  const hasChecklist = equipmentChecklists.length > 0;
  const frequencyText = getFrequencyLabel(contract.frequency_type, contract.frequency_value);
  const startText = format(parseLocalDate(contract.start_date), 'P', { locale: dateFnsLocale });
  const horizonText = `${contract.horizon_months} ${t.horizonMonths}`;
  const generatedAt = format(new Date(), 'PPP', { locale: dateFnsLocale });

  return (
    // Overlay claro fixo cobrindo a tela. NÃO usa tokens (relatório é sempre
    // claro, inclusive no dark mode — régua da casa). O `.print-report` interno
    // é o que sai na impressão; a barra de ações leva `print:hidden`.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#525659]">
      {/* Barra de ações (some na impressão). */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-black/10 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{docTitle}</p>
          <p className="truncate text-xs text-gray-500">{contract.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="active:scale-95 transition-transform"
          >
            <Printer className="mr-1.5 h-4 w-4" /> {t.printButton}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t.closeAriaLabel}
            className="text-gray-700 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Folha A4 branca centralizada. Texto SEMPRE escuro hardcoded. */}
      <div className="mx-auto my-6 max-w-[820px] bg-white px-6 py-8 text-gray-900 shadow-xl sm:px-10 sm:py-10 print:my-0 print:max-w-none print:px-10 print:py-8 print:shadow-none print-report">
        {/* ── Cabeçalho ── */}
        <header className="mb-6 border-b border-gray-200 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {companyLogo && (
                <img
                  src={companyLogo}
                  alt={companyName}
                  className="h-14 w-14 shrink-0 rounded-lg object-contain"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight text-gray-900">{companyName}</h1>
                {companyDocument && (
                  <p className="text-xs text-gray-500">CNPJ: {companyDocument}</p>
                )}
                {companyAddress && <p className="text-xs text-gray-500">{companyAddress}</p>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {docEyebrow}
              </p>
              <p className="max-w-[260px] text-base font-black leading-tight text-gray-900">
                {docTitle}
              </p>
            </div>
          </div>

          {/* Dados do contrato */}
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Field label={t.fieldContract} value={contract.name} />
            <Field label={t.fieldCustomer} value={contract.customers?.name || '-'} />
            <Field label={t.fieldVisitFrequency} value={frequencyText} />
            <Field label={t.fieldStart} value={startText} />
            <Field label={t.fieldHorizon} value={horizonText} />
            <Field label={t.fieldIssuedAt} value={generatedAt} />
          </div>
        </header>

        {/* ── Ambientes e equipamentos ── */}
        <section className="mb-7">
          <SectionTitle>{t.sectionEnvironments}</SectionTitle>
          {environments.length === 0 && itemsByEnvironment.noEnv.length === 0 ? (
            <p className="text-sm text-gray-500">{t.noEnvironmentOrEquip}</p>
          ) : (
            <div className="space-y-4">
              {environments.map((env) => (
                <EnvironmentBlock
                  key={env.id}
                  identificacao={env.identificacao || 'Ambiente sem nome'}
                  tipo={env.tipo_atividade}
                  photoUrl={(env as { photo_url?: string | null }).photo_url}
                  items={itemsByEnvironment.map.get(env.id) || []}
                  norma={isPmoc ? env : null}
                  t={t}
                />
              ))}
              {itemsByEnvironment.noEnv.length > 0 && (
                <EnvironmentBlock
                  identificacao={t.noEnvironmentLabel}
                  tipo={null}
                  photoUrl={null}
                  items={itemsByEnvironment.noEnv}
                  norma={null}
                  t={t}
                />
              )}
            </div>
          )}
        </section>

        {/* ── Checklist e planejamento POR EQUIPAMENTO ── */}
        <section className="mb-2">
          <SectionTitle>{t.sectionChecklist}</SectionTitle>
          {isLoadingQuestions ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> {t.loadingServices}
            </p>
          ) : !hasChecklist ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-500">
              {t.noChecklist}
            </p>
          ) : (
            <div className="space-y-6">
              {equipmentChecklists.map((ec) => (
                <EquipmentChecklistBlock
                  key={ec.item.id}
                  title={ec.title}
                  meta={ec.meta}
                  groups={ec.groups}
                  questions={ec.questions}
                  multipleChecklists={ec.multipleChecklists}
                  dueByQuestion={ec.dueByQuestion}
                  visitDates={visitDates}
                  templateNameById={templateNameById}
                  t={t}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Bloco de UM equipamento: a UNIÃO dos serviços de todos os seus checklists +
 * frequência e a grade de visitas. Quando há mais de um checklist
 * (`multipleChecklists`), a lista de serviços e a grade ganham um sub-cabeçalho
 * por checklist (nome do template). Com 1 só checklist, fica igual ao layout
 * antigo (sem sub-cabeçalho).
 */
function EquipmentChecklistBlock({
  title,
  meta,
  groups,
  questions,
  multipleChecklists,
  dueByQuestion,
  visitDates,
  templateNameById,
  t,
}: {
  title: string;
  meta: string | null;
  groups: { templateId: string; questions: FormQuestion[] }[];
  questions: FormQuestion[];
  multipleChecklists: boolean;
  dueByQuestion: Map<string, Set<number>>;
  visitDates: Date[];
  templateNameById: Map<string, string>;
  t: { tableServiceHeader: string; tableFootnote: string };
}) {
  const checklistLabel = (templateId: string, idx: number) =>
    templateNameById.get(templateId) || `Checklist ${idx + 1}`;
  const colCount = visitDates.length + 1;

  return (
    <div className="break-inside-avoid rounded-lg border border-gray-200 p-3">
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-gray-100 pb-2">
        <p className="min-w-0 break-words text-sm font-bold text-gray-900">{title}</p>
        {meta && <p className="shrink-0 text-xs text-gray-500">{meta}</p>}
      </div>

      {/* Serviços + frequência (agrupados por checklist quando há vários) */}
      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
        {groups.map((g, gi) => (
          <li key={g.templateId}>
            {multipleChecklists && (
              <p className="bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {checklistLabel(g.templateId, gi)}
              </p>
            )}
            <ul className="divide-y divide-gray-200">
              {g.questions.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0 break-words text-sm text-gray-800">{q.question}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-medium text-white">
                    <CalendarClock className="h-3 w-3" />
                    {frequencyLabel(q)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {/* Grade visitas × serviços */}
      {visitDates.length > 0 && questions.length > 0 && (
        <div className="mt-3">
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border border-gray-300 bg-gray-100 px-2 py-1.5 text-left font-semibold text-gray-700">
                    {t.tableServiceHeader}
                  </th>
                  {visitDates.map((d, i) => (
                    <th
                      key={i}
                      className="border border-gray-300 bg-gray-100 px-1.5 py-1.5 text-center font-semibold text-gray-700"
                    >
                      <div className="leading-tight">#{i + 1}</div>
                      <div className="whitespace-nowrap font-normal text-gray-500">
                        {format(d, 'dd/MM')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g, gi) => (
                  <Fragment key={g.templateId}>
                    {multipleChecklists && (
                      <tr>
                        <td
                          colSpan={colCount}
                          className="sticky left-0 z-10 border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                        >
                          {checklistLabel(g.templateId, gi)}
                        </td>
                      </tr>
                    )}
                    {g.questions.map((q) => {
                      const due = dueByQuestion.get(q.id);
                      return (
                        <tr key={q.id}>
                          <td className="sticky left-0 z-10 border border-gray-300 bg-white px-2 py-1.5 text-gray-800">
                            {q.question}
                          </td>
                          {visitDates.map((_, i) => (
                            <td key={i} className="border border-gray-300 px-1.5 py-1.5 text-center">
                              {due?.has(i) ? (
                                <Check className="mx-auto h-3.5 w-3.5 text-gray-900" strokeWidth={3} />
                              ) : (
                                <span className="text-gray-200">–</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            {t.tableFootnote}
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-0.5 break-words font-medium text-gray-900">{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">{children}</h2>
  );
}

function EnvironmentBlock({
  identificacao,
  tipo,
  photoUrl,
  items,
  norma,
  t,
}: {
  identificacao: string;
  tipo: string | null;
  photoUrl: string | null | undefined;
  items: ContractItem[];
  /** Identificações da norma PMOC do ambiente. `null` no contrato comum. */
  norma: ContractEnvironment | null;
  t: {
    normaTypeUso: string;
    normaAreaClimatizada: string;
    normaCargaTermica: string;
    normaOcupantesFixos: string;
    normaOcupantesFlut: string;
    noEquipInEnvironment: string;
  };
}) {
  // Identificações da norma (só PMOC). Renderiza apenas os campos preenchidos.
  const normaFields = norma
    ? ([
        { label: t.normaTypeUso, value: norma.tipo_atividade?.trim() || null },
        { label: t.normaAreaClimatizada, value: norma.area_climatizada_m2 != null ? formatOptionalNumber(norma.area_climatizada_m2, 'm²') : null },
        { label: t.normaCargaTermica, value: norma.carga_termica_tr != null ? formatOptionalNumber(norma.carga_termica_tr, 'TR') : null },
        { label: t.normaOcupantesFixos, value: norma.ocupantes_fixos != null ? formatOptionalNumber(norma.ocupantes_fixos) : null },
        { label: t.normaOcupantesFlut, value: norma.ocupantes_flutuantes != null ? formatOptionalNumber(norma.ocupantes_flutuantes) : null },
      ].filter((f) => f.value !== null) as { label: string; value: string }[])
    : [];

  return (
    <div className="break-inside-avoid rounded-lg border border-gray-200 p-3">
      <div className="flex items-start gap-3">
        {photoUrl && (
          <img
            src={photoUrl}
            alt={identificacao}
            className="h-12 w-12 shrink-0 rounded-md object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold text-gray-900">{identificacao}</p>
          {tipo && !norma && <p className="text-xs text-gray-500">{tipo}</p>}
        </div>
      </div>
      {/* Identificações da norma PMOC — grade compacta (só quando PMOC e há dado). */}
      {normaFields.length > 0 && (
        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-gray-100 pt-2.5 sm:grid-cols-3">
          {normaFields.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wider text-gray-400">{f.label}</dt>
              <dd className="break-words text-sm font-medium text-gray-800">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {items.length > 0 ? (
        <ul className="mt-2.5 space-y-1.5 border-t border-gray-100 pt-2.5">
          {items.map((it) => {
            const name = it.equipment?.name || it.item_name;
            const meta = [it.equipment?.brand, it.equipment?.model].filter(Boolean).join(' · ');
            return (
              <li key={it.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words text-gray-800">{name}</span>
                {meta && <span className="shrink-0 text-xs text-gray-500">{meta}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-gray-400">{t.noEquipInEnvironment}</p>
      )}
    </div>
  );
}
