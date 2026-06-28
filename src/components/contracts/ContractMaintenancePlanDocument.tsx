import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Printer, X, CalendarClock, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChecklistQuestionsByTemplates } from '@/hooks/useContractChecklistQuestions';
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

/**
 * Documento "Plano de Manutenção" de um contrato COMUM (não-PMOC). Fase C.
 *
 * Tela-documento pronta pra IMPRIMIR / salvar como PDF pelo navegador (não é
 * edge function). Régua da casa: tema CLARO hardcoded (nada de tokens que
 * escurecem no dark mode) + CSS de impressão (.print-report no index.css esconde
 * o resto da página, fixa A4 e força as cores). É um documento NOVO e próprio —
 * NÃO é a Planilha PMOC.
 *
 * Conteúdo (POR EQUIPAMENTO — o contrato comum guarda o checklist em
 * `contract_items.form_template_id`, não mais em `contracts.form_template_id`):
 *  1. Cabeçalho com identidade da empresa (white-label se houver) + dados do
 *     contrato (cliente, vigência, frequência das visitas).
 *  2. Ambientes do contrato com seus equipamentos (+ grupo "Sem ambiente").
 *  3. Para CADA equipamento com checklist: a lista dos seus serviços + frequência
 *     e a grade visitas × serviços.
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

/** Parse 'YYYY-MM-DD' como data local (evita shift de fuso). */
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

/** Conjunto de ids excluídos da 1ª OS de um equipamento (flag por equipamento). */
function excludedSet(item: ContractItem): Set<string> {
  const raw = item.first_os_excluded_questions;
  return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
}

export function ContractMaintenancePlanDocument({
  contract,
  onClose,
}: ContractMaintenancePlanDocumentProps) {
  const { settings } = useCompanySettings();

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

  // Equipamentos COM checklist (o contrato comum guarda o template por
  // equipamento em `contract_items.form_template_id`). Itens sem template não
  // entram. Ordenados por sort_order (mesma ordem dos ambientes).
  const checklistItems = useMemo<ContractItem[]>(
    () =>
      [...items]
        .filter((it) => !!it.form_template_id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [items],
  );

  // Carrega as perguntas de TODOS os templates dos equipamentos de uma vez,
  // agrupadas por template_id (hook é a fronteira do Supabase).
  const templateIds = useMemo(
    () => checklistItems.map((it) => it.form_template_id!).filter(Boolean),
    [checklistItems],
  );
  const { data: questionsByTemplate, isLoading: isLoadingQuestions } =
    useChecklistQuestionsByTemplates(templateIds);

  // Para cada equipamento: suas perguntas + a grade visitas × perguntas, usando
  // a MESMA âncora do técnico (`toActivitySpec` com o Set de excluídos da 1ª OS
  // daquele equipamento — fonte única com `visitQuestionVisibility`).
  interface EquipmentChecklist {
    item: ContractItem;
    title: string;
    meta: string | null;
    questions: FormQuestion[];
    /** questionId → Set de índices de visita (colunas) em que a pergunta cai. */
    dueByQuestion: Map<string, Set<number>>;
  }

  const equipmentChecklists = useMemo<EquipmentChecklist[]>(() => {
    if (!questionsByTemplate || checklistItems.length === 0) return [];
    const visits: VisitInput[] = visitDates.map((d) => ({ date: d }));

    const out: EquipmentChecklist[] = [];
    for (const item of checklistItems) {
      const qs = questionsByTemplate.get(item.form_template_id!) ?? [];
      if (qs.length === 0) continue;

      const excluded = excludedSet(item);
      const dueByQuestion = new Map<string, Set<number>>();

      if (visits.length > 0) {
        // Mesma derivação de ActivitySpec do técnico: a âncora vem do flag por
        // equipamento (excluída → 'contract_start'; incluída → 'due_now').
        // Pergunta SEM frequência cai em 'visits'/1 = toda visita (todas as
        // colunas), espelhando o "sempre" do helper.
        const specs = qs.map((q) =>
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
      out.push({ item, title, meta, questions: qs, dueByQuestion });
    }
    return out;
  }, [questionsByTemplate, checklistItems, visitDates]);

  const hasChecklist = equipmentChecklists.length > 0;
  const frequencyText = getFrequencyLabel(contract.frequency_type, contract.frequency_value);
  const startText = format(parseLocalDate(contract.start_date), 'dd/MM/yyyy');
  const horizonText = `${contract.horizon_months} meses`;
  const generatedAt = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    // Overlay claro fixo cobrindo a tela. NÃO usa tokens (relatório é sempre
    // claro, inclusive no dark mode — régua da casa). O `.print-report` interno
    // é o que sai na impressão; a barra de ações leva `print:hidden`.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#525659]">
      {/* Barra de ações (some na impressão). */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-black/10 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">Plano de Manutenção</p>
          <p className="truncate text-xs text-gray-500">{contract.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="active:scale-95 transition-transform"
          >
            <Printer className="mr-1.5 h-4 w-4" /> Imprimir / PDF
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fechar"
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
                Documento
              </p>
              <p className="text-base font-black leading-tight text-gray-900">
                Plano de Manutenção
              </p>
            </div>
          </div>

          {/* Dados do contrato */}
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Contrato" value={contract.name} />
            <Field label="Cliente" value={contract.customers?.name || '-'} />
            <Field label="Frequência das visitas" value={frequencyText} />
            <Field label="Início" value={startText} />
            <Field label="Horizonte" value={horizonText} />
            <Field label="Emitido em" value={generatedAt} />
          </div>
        </header>

        {/* ── Ambientes e equipamentos ── */}
        <section className="mb-7">
          <SectionTitle>Ambientes e Equipamentos</SectionTitle>
          {environments.length === 0 && itemsByEnvironment.noEnv.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum ambiente ou equipamento cadastrado.</p>
          ) : (
            <div className="space-y-4">
              {environments.map((env) => (
                <EnvironmentBlock
                  key={env.id}
                  identificacao={env.identificacao || 'Ambiente sem nome'}
                  tipo={env.tipo_atividade}
                  photoUrl={(env as { photo_url?: string | null }).photo_url}
                  items={itemsByEnvironment.map.get(env.id) || []}
                />
              ))}
              {itemsByEnvironment.noEnv.length > 0 && (
                <EnvironmentBlock
                  identificacao="Sem ambiente"
                  tipo={null}
                  photoUrl={null}
                  items={itemsByEnvironment.noEnv}
                />
              )}
            </div>
          )}
        </section>

        {/* ── Checklist e planejamento POR EQUIPAMENTO ── */}
        <section className="mb-2">
          <SectionTitle>Checklist por Equipamento</SectionTitle>
          {isLoadingQuestions ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando serviços…
            </p>
          ) : !hasChecklist ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-500">
              Nenhum checklist vinculado a este contrato.
            </p>
          ) : (
            <div className="space-y-6">
              {equipmentChecklists.map((ec) => (
                <EquipmentChecklistBlock
                  key={ec.item.id}
                  title={ec.title}
                  meta={ec.meta}
                  questions={ec.questions}
                  dueByQuestion={ec.dueByQuestion}
                  visitDates={visitDates}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Bloco de UM equipamento: lista de serviços + frequência e a grade de visitas. */
function EquipmentChecklistBlock({
  title,
  meta,
  questions,
  dueByQuestion,
  visitDates,
}: {
  title: string;
  meta: string | null;
  questions: FormQuestion[];
  dueByQuestion: Map<string, Set<number>>;
  visitDates: Date[];
}) {
  return (
    <div className="break-inside-avoid rounded-lg border border-gray-200 p-3">
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-gray-100 pb-2">
        <p className="min-w-0 break-words text-sm font-bold text-gray-900">{title}</p>
        {meta && <p className="shrink-0 text-xs text-gray-500">{meta}</p>}
      </div>

      {/* Serviços + frequência */}
      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
        {questions.map((q) => (
          <li key={q.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="min-w-0 break-words text-sm text-gray-800">{q.question}</span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-medium text-white">
              <CalendarClock className="h-3 w-3" />
              {frequencyLabel(q)}
            </span>
          </li>
        ))}
      </ul>

      {/* Grade visitas × serviços */}
      {visitDates.length > 0 && (
        <div className="mt-3">
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border border-gray-300 bg-gray-100 px-2 py-1.5 text-left font-semibold text-gray-700">
                    Serviço
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
                {questions.map((q) => {
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
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            ✓ indica em qual visita cada serviço é executado, conforme a frequência configurada.
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
}: {
  identificacao: string;
  tipo: string | null;
  photoUrl: string | null | undefined;
  items: ContractItem[];
}) {
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
          {tipo && <p className="text-xs text-gray-500">{tipo}</p>}
        </div>
      </div>
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
        <p className="mt-2 text-xs text-gray-400">Sem equipamentos neste ambiente.</p>
      )}
    </div>
  );
}
