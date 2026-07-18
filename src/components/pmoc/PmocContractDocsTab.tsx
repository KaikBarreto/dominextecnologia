import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  Download,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  ChevronDown,
  Info,
  ShieldCheck,
  AlertTriangle,
  Eye,
  EyeOff,
  Globe,
  Table2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  getDocumentValidityStatus,
  getValidityLabel,
  getValidityBadgeVariant,
  resolveValidUntil,
  type DocumentValidityStatus,
} from '@/lib/documentValidity';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { PmocDocEditorDialog } from './PmocDocEditorDialog';
import { RtSignatureQuickDialog } from './RtSignatureQuickDialog';
import {
  usePmocContractCustomDocs,
} from '@/hooks/usePmocContractCustomDocs';
import { useContracts } from '@/hooks/useContracts';
import { useCompanyPmocDocTemplates } from '@/hooks/useCompanyPmocDocTemplates';
import {
  usePmocDocuments,
  type PmocDocument,
  type PmocDocumentType,
  type PmocDocumentSignatureStatus,
} from '@/hooks/usePmocDocuments';
import {
  useGenerateDossiePdf,
  useGenerateCronogramaPdf,
  useGenerateTrtPdf,
  useGenerateCertificadoPdf,
  useGeneratePlanilhaPdf,
} from '@/hooks/useGeneratePmocDocument';
import {
  buildDefaultTermoRtHtml,
  buildDefaultCertificadoHtml,
  htmlPreview,
  type PmocTemplateContext,
} from '@/utils/pmocDocumentTemplates';
import type { PmocVariableContext } from '@/utils/pmocVariables';

/**
 * Mapeia o shape "antigo" `PmocTemplateContext` (snake_case) pro shape "novo"
 * `PmocVariableContext` (chaves com ponto, igual ao `data-pmoc-var`). Mantém
 * o legado funcionando em ContractDetail sem precisar refatorar a montagem do
 * contexto lá.
 *
 * O conjunto novo é SUPERSET — adiciona chaves que ContractDetail ainda não
 * monta (ex: `empresa.email`, `rt.registro`, `cliente.cidade`,
 * `contrato.nome`). Pra essas, fica `undefined` → badge vermelho até alguém
 * estender a montagem do contexto em ContractDetail.
 */
/** Meses PT-BR lowercase pra `contrato.criado_mes` — espelha edge function. */
const MESES_PT_BR = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/**
 * Deriva dia/mês/ano em PT-BR a partir do ISO de `contracts.created_at`.
 * Usa UTC pra casar EXATAMENTE com a edge function (dateToExtenso usa UTC),
 * evitando off-by-one quando timezone do navegador difere de UTC.
 */
function partsFromIso(iso: string | undefined): { dia: string; mes: string; ano: string } {
  if (!iso) return { dia: '', mes: '', ano: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { dia: '', mes: '', ano: '' };
  return {
    dia: String(d.getUTCDate()).padStart(2, '0'),
    mes: MESES_PT_BR[d.getUTCMonth()] ?? '',
    ano: String(d.getUTCFullYear()),
  };
}

function toVariableContext(ctx: Partial<PmocTemplateContext> | undefined): PmocVariableContext {
  if (!ctx) return {};
  const created = partsFromIso(ctx.contract_created_at_iso);
  return {
    'empresa.razao_social': ctx.empresa_razao_social,
    'empresa.cnpj': ctx.empresa_cnpj,
    'empresa.endereco': ctx.empresa_endereco,
    'empresa.cidade': ctx.cidade,
    'rt.nome': ctx.rt_nome,
    'rt.modalidade': ctx.rt_modalidade,
    'rt.cft_crea': ctx.rt_cft_crea,
    'cliente.nome': ctx.customer_name,
    'cliente.documento': ctx.customer_document,
    'cliente.endereco': ctx.customer_address,
    'contrato.frequencia': ctx.contract_frequency_label,
    'contrato.vigencia_inicio': ctx.contract_start_date_extenso,
    'contrato.criado_dia': created.dia,
    'contrato.criado_mes': created.mes,
    'contrato.criado_ano': created.ano,
    'data.hoje_extenso': ctx.generated_at_extenso,
  };
}

/**
 * Aba "Documentos" do contrato PMOC (Onda C — v1.9.x).
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.6 / §5.3 (passo 7)
 */

export interface PmocContractDocsTabProps {
  contractId: string;
  /**
   * Contexto pra pré-preencher placeholders dos templates. O componente é
   * tolerante a valores ausentes (cai em fallbacks `[empresa]`, `____`).
   */
  templateContext?: Partial<PmocTemplateContext>;
  /**
   * RT vinculado ao contrato. Quando informado e o TRT mais recente está com
   * `signature_status: 'pending'`, o card do TRT exibe o CTA "Adicionar
   * assinatura agora" abrindo um dialog que atualiza
   * `responsible_technicians.signature_image_url`.
   */
  responsibleTechnicianId?: string | null;
  /**
   * Estado atual do gate de documentos no portal público (2026-06). Vem do
   * contrato carregado em ContractDetail (`contracts.portal_documents_released`).
   * `true` → o cliente final vê os documentos no portal; `false` → ocultos.
   */
  portalDocumentsReleased?: boolean;
}

type DocsT = ReturnType<typeof useDocsT>;

function useDocsT() {
  const { locale } = useAppLocaleContext();
  return MESSAGES[locale].app.pmoc.docs;
}

/** Badge visual do status da assinatura embarcada num PDF PMOC (Onda E). */
function SignatureStatusBadge({ status, t }: { status: PmocDocumentSignatureStatus; t: DocsT }) {
  if (status === 'signed') {
    return (
      <Badge variant="success" className="gap-1">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        {t.signedBadge}
      </Badge>
    );
  }
  if (status === 'pending') {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {t.pendingSignatureBadge}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {t.notGeneratedBadge}
    </Badge>
  );
}

function formatGeneratedAt(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return '—';
  }
}

/** Formata um date-only "yyyy-MM-dd" como DD/MM/AAAA (sem off-by-one de fuso). */
function formatValidUntil(dateOnly?: string | null): string {
  if (!dateOnly) return '—';
  const m = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '—';
  const [, y, mm, d] = m;
  return `${d}/${mm}/${y}`;
}

/**
 * Selo de validade de um documento regulatório (TRT / Certificado). Cores via
 * tokens semânticos (verde/amarelo/vermelho). Retorna `null` quando não há
 * validade a exibir.
 */
function ValidityBadge({ status }: { status: DocumentValidityStatus }) {
  if (status === 'sem_validade') return null;
  return (
    <Badge variant={getValidityBadgeVariant(status)} className="text-[10px]">
      {getValidityLabel(status)}
    </Badge>
  );
}

function DocCardHeader({
  title,
  version,
  generatedAt,
}: {
  title: string;
  version?: number;
  generatedAt?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="break-words text-base font-semibold">
          {title}
          {version && (
            <Badge variant="secondary" className="ml-2 align-middle">
              v{version}
            </Badge>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Última geração: {formatGeneratedAt(generatedAt)}
        </p>
      </div>
    </div>
  );
}

function SubDocCard({
  title,
  preview,
  helperTooltip,
  onEdit,
  edited,
  extraActions,
  topRightSlot,
  validityNote,
  t,
}: {
  title: string;
  preview: string;
  helperTooltip: string;
  onEdit: () => void;
  edited: boolean;
  /** Ações extras (ex: baixar TRT individual, adicionar assinatura) — vão no rodapé do sub-card, antes do botão Editar. */
  extraActions?: ReactNode;
  /** Slot opcional no canto superior direito (ex: badge de status). */
  topRightSlot?: ReactNode;
  /** Linha opcional de validade ("Válido até DD/MM/AAAA" + selo de status). */
  validityNote?: ReactNode;
  t: DocsT;
}) {
  return (
    <div className="flex h-full flex-col gap-2 rounded-xl border bg-muted/20 p-3 transition-transform">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="break-words text-sm font-semibold">{title}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Info className="h-3 w-3" aria-hidden="true" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs text-xs">
              {helperTooltip}
            </TooltipContent>
          </Tooltip>
        </div>
        {topRightSlot}
      </div>
      <p className="min-h-[40px] flex-1 break-words text-xs text-muted-foreground">
        {preview || t.defaultTextPlaceholder}
      </p>
      {validityNote && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {validityNote}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {edited ? (
          <Badge variant="outline" className="self-start text-[10px]">
            {t.customized}
          </Badge>
        ) : (
          <span className="text-[10px] text-muted-foreground">{t.defaultText}</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {extraActions}
          <Button
            variant="edit-ghost"
            size="sm"
            className="min-h-11 sm:min-h-[40px] active:scale-[0.97] transition-transform rounded-xl"
            onClick={onEdit}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />
            {t.editTextBtn}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PmocContractDocsTab({
  contractId,
  templateContext,
  responsibleTechnicianId,
  portalDocumentsReleased = false,
}: PmocContractDocsTabProps) {
  const t = useDocsT();
  const {
    customDocs,
    saveTermoRT,
    saveCertificado,
    resetTermoRTToDefault,
    resetCertificadoToDefault,
    isSaving,
  } = usePmocContractCustomDocs(contractId);

  // Gate dos documentos no portal público — libera/oculta pro cliente final.
  const { setPortalDocumentsReleased } = useContracts();

  // Modelo padrão da empresa — fonte do botão "Puxar template padrão da empresa"
  // dentro de cada editor. NULL pra um doc = empresa nunca definiu modelo.
  const { templates: companyTemplates } = useCompanyPmocDocTemplates();

  const { documents, latestByType, isLoading: isLoadingDocs, refetch } = usePmocDocuments(contractId);

  const generateDossie = useGenerateDossiePdf();
  const generateTrt = useGenerateTrtPdf();
  const generateCertificado = useGenerateCertificadoPdf();
  const generatePlanilha = useGeneratePlanilhaPdf();

  const [editorOpen, setEditorOpen] = useState<'termo_rt' | 'certificado' | null>(null);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);

  // Onda H — templates default NÃO recebem mais ctx: emitem `<span
  // data-pmoc-var>` que vira badge visual no editor. Substituição pelo valor
  // real acontece (a) no NodeView do editor pra UX e (b) na edge function de
  // PDF pra rendering final.
  const defaultTermoRt = useMemo(() => buildDefaultTermoRtHtml(), []);
  const defaultCertificado = useMemo(() => buildDefaultCertificadoHtml(), []);

  // Contexto no shape novo (chaves com ponto). Passado ao editor via prop
  // `templateContext` pra pintar badges azul (cheio) / vermelho (vazio).
  const variableContext = useMemo(
    () => toVariableContext(templateContext),
    [templateContext],
  );

  const termoRtHtml = customDocs?.termo_rt_content ?? null;
  const certificadoHtml = customDocs?.certificado_content ?? null;

  const termoRtPreview = useMemo(
    () => htmlPreview(termoRtHtml ?? defaultTermoRt, 220),
    [termoRtHtml, defaultTermoRt],
  );
  const certificadoPreview = useMemo(
    () => htmlPreview(certificadoHtml ?? defaultCertificado, 220),
    [certificadoHtml, defaultCertificado],
  );

  const latestDossie = latestByType.dossie_pmoc;
  const latestTrt = latestByType.termo_rt;
  const latestCertificado = latestByType.certificado;
  const latestPlanilha = latestByType.planilha;

  // Onda G — diagnóstico de campos faltantes no `templateContext`. Quando
  // algum campo crítico estiver vazio, exibimos banner warning no topo da aba
  // pra o gestor cadastrar ANTES de salvar/gerar (em vez de o template sair
  // com placeholder literal tipo "[CNPJ]" no PDF).
  const missingFields = useMemo(() => {
    const list: Array<{ label: string; href?: string }> = [];
    if (!templateContext?.empresa_razao_social) list.push({ label: t.missingCompanyName, href: '/configuracoes?tab=empresa' });
    if (!templateContext?.empresa_cnpj) list.push({ label: t.missingCompanyCnpj, href: '/configuracoes?tab=empresa' });
    if (!templateContext?.rt_nome) list.push({ label: t.missingRtName, href: '/responsaveis-tecnicos' });
    if (!templateContext?.rt_modalidade) list.push({ label: t.missingRtModality, href: '/responsaveis-tecnicos' });
    if (!templateContext?.rt_cft_crea) list.push({ label: t.missingRtCft, href: '/responsaveis-tecnicos' });
    // Cliente vinculado ao contrato — a Planilha PMOC (Seção 2 "Proprietário")
    // exige um cliente; sem ele a geração falha. Quando ausente, o nome do
    // cliente chega vazio no contexto (ContractDetail manda `''`).
    if (!templateContext?.customer_name?.trim()) {
      list.push({
        label: t.missingCustomer,
      });
    } else {
      // Cliente existe mas sem CNPJ/CPF ou endereço → Seção 2 "Proprietário"
      // sai incompleta na Planilha PMOC. Avisa sem disparar query nova.
      if (!templateContext?.customer_document?.trim()) {
        list.push({
          label: t.missingCustomerDoc,
        });
      }
      if (!templateContext?.customer_address?.trim()) {
        list.push({
          label: t.missingCustomerAddress,
        });
      }
    }
    return list;
  }, [templateContext, t]);

  // Status visual do TRT: signed | pending | null (não gerado).
  const trtStatus: PmocDocumentSignatureStatus = latestTrt
    ? latestTrt.signature_status ?? 'pending'
    : null;
  // Mesma lógica pro Certificado individual (também leva assinatura do RT).
  const certStatus: PmocDocumentSignatureStatus = latestCertificado
    ? latestCertificado.signature_status ?? 'pending'
    : null;
  // Mesma lógica pro Dossiê (também leva assinatura — Onda E).
  const dossieStatus: PmocDocumentSignatureStatus = latestDossie
    ? latestDossie.signature_status ?? 'pending'
    : null;

  // Validade dos documentos regulatórios (TRT / Certificado). Usa o
  // `valid_until` persistido; cai no fallback de exibição (generated_at + 12
  // meses) só pra docs legados gerados antes desta feature.
  const trtValidUntil = latestTrt
    ? resolveValidUntil(latestTrt.valid_until, latestTrt.generated_at)
    : null;
  const certValidUntil = latestCertificado
    ? resolveValidUntil(latestCertificado.valid_until, latestCertificado.generated_at)
    : null;
  const trtValidityStatus = getDocumentValidityStatus(trtValidUntil);
  const certValidityStatus = getDocumentValidityStatus(certValidUntil);
  const hasExpiredDoc =
    trtValidityStatus === 'vencido' || certValidityStatus === 'vencido';

  const handleGenerateDossie = async () => {
    await generateDossie.mutateAsync({ contract_id: contractId });
    refetch();
  };
  const handleGenerateTrt = async () => {
    await generateTrt.mutateAsync({ contract_id: contractId });
    refetch();
  };
  const handleGenerateCertificado = async () => {
    await generateCertificado.mutateAsync({ contract_id: contractId });
    refetch();
  };
  const handleGeneratePlanilha = async () => {
    await generatePlanilha.mutateAsync({ contract_id: contractId });
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Documentos vencidos — alerta no topo (validade regulatória PMOC). */}
      {hasExpiredDoc && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t.expiredAlert}</AlertTitle>
          <AlertDescription className="text-sm">
            {trtValidityStatus === 'vencido' && certValidityStatus === 'vencido'
              ? t.expiredAlertDescBoth
              : trtValidityStatus === 'vencido'
                ? t.expiredAlertDescTrt
                : t.expiredAlertDescCert}
          </AlertDescription>
        </Alert>
      )}

      {/* Onda G — banner de campos obrigatórios faltando. Avisa o gestor antes
          dele gerar documento com placeholder literal no PDF. */}
      {missingFields.length > 0 && (
        <Alert className="border-warning/40 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertTitle>{t.missingFieldsAlert}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm">
              {t.missingFieldsDesc}
            </p>
            <ul className="ml-4 list-disc space-y-0.5 text-sm">
              {missingFields.map((f) => (
                <li key={f.label}>
                  {f.href ? (
                    <Link to={f.href} className="underline hover:text-foreground">
                      {f.label}
                    </Link>
                  ) : (
                    f.label
                  )}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Gate do portal público — libera/oculta os documentos pro cliente final.
          Quando liberado, o cliente vê Dossiê, Termo, Certificado e Cronograma
          no portal público da unidade (QR Code). Ação neutra/primária. */}
      <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                portalDocumentsReleased ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
              )}
            >
              <Globe className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{t.portalGateTitle}</p>
                <Badge variant={portalDocumentsReleased ? 'success' : 'outline'} className="gap-1 text-[10px]">
                  {portalDocumentsReleased ? (
                    <>
                      <Eye className="h-3 w-3" aria-hidden="true" /> {t.portalGateLiberado}
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-3 w-3" aria-hidden="true" /> {t.portalGateOculto}
                    </>
                  )}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.portalGateDesc}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={portalDocumentsReleased ? 'outline' : 'default'}
            onClick={() =>
              setPortalDocumentsReleased.mutate({
                contractId,
                released: !portalDocumentsReleased,
              })
            }
            disabled={setPortalDocumentsReleased.isPending}
            className="min-h-11 shrink-0 active:scale-[0.97] transition-transform rounded-xl"
          >
            {setPortalDocumentsReleased.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : portalDocumentsReleased ? (
              <EyeOff className="mr-1.5 h-4 w-4" />
            ) : (
              <Eye className="mr-1.5 h-4 w-4" />
            )}
            {portalDocumentsReleased ? t.portalGateHideBtn : t.portalGateReleaseBtn}
          </Button>
        </CardContent>
      </Card>

      {/* Card 1 — Dossiê PMOC (TRT + Certificado vivem aqui dentro)
          ===========================================================
          Onda I (v1.9.x): TRT NÃO é mais um card separado no topo. Vive como
          sub-card do Dossiê — assim o gestor edita o TRT num lugar SÓ. Mesmo
          conteúdo é usado pelo TRT standalone (botão "Baixar TRT individual"
          dentro do sub-card) e pelo Dossiê completo. */}
      <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2 break-words text-lg sm:text-xl">
              <FileText className="h-5 w-5 shrink-0" />
              <span className="min-w-0 break-words">{t.dossieTitle}</span>
              {latestDossie && (
                <Badge variant="secondary" className="ml-2">
                  v{latestDossie.version}
                </Badge>
              )}
            </CardTitle>
            <SignatureStatusBadge status={dossieStatus} t={t} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t.dossieDesc}
          </p>
          <p className="text-xs text-muted-foreground">
            {t.dossieLastGenerated}: {formatGeneratedAt(latestDossie?.generated_at)}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 min-w-0">
          {trtStatus === 'pending' && (
            <Alert className="border-warning/40 bg-warning/5">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertTitle>{t.rtSignaturePendingTitle}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  {t.rtSignaturePendingDesc}
                </p>
                <Button
                  size="sm"
                  variant="edit-ghost"
                  className="mt-1 min-h-[40px] active:scale-[0.97] transition-transform"
                  onClick={() => setSignatureDialogOpen(true)}
                  disabled={!responsibleTechnicianId}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  {t.rtSignatureAddBtn}
                </Button>
                {!responsibleTechnicianId && (
                  <p className="text-[11px] text-muted-foreground">
                    {t.rtSignatureNoRtHint}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Stack vertical sempre (mobile-first). No desktop também vertical
              porque os sub-cards carregam ação própria e ficam mais legíveis. */}
          <div className="flex flex-col gap-3">
            <SubDocCard
              t={t}
              title={t.trtTitle}
              preview={termoRtPreview}
              edited={!!termoRtHtml}
              helperTooltip={t.trtTooltip}
              onEdit={() => setEditorOpen('termo_rt')}
              validityNote={
                latestTrt && trtValidUntil ? (
                  <>
                    <span>{t.trtValidUntil} {formatValidUntil(trtValidUntil)}</span>
                    <ValidityBadge status={trtValidityStatus} />
                  </>
                ) : null
              }
              topRightSlot={
                <div className="flex items-center gap-1.5">
                  {latestTrt && (
                    <Badge variant="secondary" className="text-[10px]">
                      v{latestTrt.version}
                    </Badge>
                  )}
                  <SignatureStatusBadge status={trtStatus} t={t} />
                </div>
              }
              extraActions={
                <>
                  {latestTrt?.pdf_storage_path && (
                    <DownloadLatestButton doc={latestTrt} label={t.trtDownloadBtn} />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateTrt}
                    disabled={generateTrt.isPending}
                    className="min-h-11 sm:min-h-[40px] active:scale-[0.97] transition-transform rounded-xl"
                  >
                    {generateTrt.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-4 w-4" />
                    )}
                    {latestTrt ? t.trtRegenerateBtn : t.trtGenerateBtn}
                  </Button>
                </>
              }
            />
            <SubDocCard
              t={t}
              title={t.certTitle}
              preview={certificadoPreview}
              edited={!!certificadoHtml}
              helperTooltip={t.certTooltip}
              onEdit={() => setEditorOpen('certificado')}
              validityNote={
                latestCertificado && certValidUntil ? (
                  <>
                    <span>{t.certValidUntil} {formatValidUntil(certValidUntil)}</span>
                    <ValidityBadge status={certValidityStatus} />
                  </>
                ) : null
              }
              topRightSlot={
                <div className="flex items-center gap-1.5">
                  {latestCertificado && (
                    <Badge variant="secondary" className="text-[10px]">
                      v{latestCertificado.version}
                    </Badge>
                  )}
                  <SignatureStatusBadge status={certStatus} t={t} />
                </div>
              }
              extraActions={
                <>
                  {latestCertificado?.pdf_storage_path && (
                    <DownloadLatestButton doc={latestCertificado} label={t.certDownloadBtn} />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateCertificado}
                    disabled={generateCertificado.isPending}
                    className="min-h-11 sm:min-h-[40px] active:scale-[0.97] transition-transform rounded-xl"
                  >
                    {generateCertificado.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-4 w-4" />
                    )}
                    {latestCertificado ? t.certRegenerateBtn : t.certGenerateBtn}
                  </Button>
                </>
              }
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {t.dossieCoverNote}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {latestDossie?.pdf_storage_path && (
                <DownloadLatestButton doc={latestDossie} label={t.dossieDownloadBtn} />
              )}
              <Button
                size="sm"
                onClick={handleGenerateDossie}
                disabled={generateDossie.isPending}
                className="min-h-11 active:scale-[0.97] transition-transform rounded-xl"
              >
                {generateDossie.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                {latestDossie ? t.dossieRegenerateBtn : t.dossieGenerateBtn}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2 — Planilha PMOC (Fase 4)
          ================================
          Espelha o modelo do cliente: identificação + RT + relação de
          equipamentos + plano de manutenção M/T/S/A + matriz de 12 meses +
          registro de execução. Também vive embutida no Dossiê completo. */}
      <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2 break-words text-lg sm:text-xl">
              <Table2 className="h-5 w-5 shrink-0" />
              <span className="min-w-0 break-words">{t.planilhaTitle}</span>
              {latestPlanilha && (
                <Badge variant="secondary" className="ml-2">
                  v{latestPlanilha.version}
                </Badge>
              )}
            </CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.planilhaDesc}
          </p>
          <p className="text-xs text-muted-foreground">
            {t.planilhaLastGenerated}: {formatGeneratedAt(latestPlanilha?.generated_at)}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {t.planilhaEmptyNote}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {latestPlanilha?.pdf_storage_path && (
                <DownloadLatestButton doc={latestPlanilha} label={t.planilhaDownloadBtn} />
              )}
              <Button
                size="sm"
                onClick={handleGeneratePlanilha}
                disabled={generatePlanilha.isPending}
                className="min-h-11 active:scale-[0.97] transition-transform rounded-xl"
              >
                {generatePlanilha.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                {latestPlanilha ? t.planilhaRegenerateBtn : t.planilhaGenerateBtn}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de versões */}
      <VersionHistory documents={documents} isLoading={isLoadingDocs} t={t} />

      {/* Editores */}
      <PmocDocEditorDialog
        open={editorOpen === 'termo_rt'}
        onOpenChange={(o) => !o && setEditorOpen(null)}
        title={t.editorTrtTitle}
        initialHtml={termoRtHtml}
        defaultHtml={defaultTermoRt}
        onSave={saveTermoRT}
        onResetToDefault={resetTermoRTToDefault}
        onPullCompanyTemplate={() => companyTemplates?.termo_rt_content ?? defaultTermoRt}
        pullCompanyTemplateDisabled={!companyTemplates?.termo_rt_content}
        isSaving={isSaving}
        helperText={t.editorTrtHelper}
        templateContext={variableContext}
      />
      <PmocDocEditorDialog
        open={editorOpen === 'certificado'}
        onOpenChange={(o) => !o && setEditorOpen(null)}
        title={t.editorCertTitle}
        initialHtml={certificadoHtml}
        defaultHtml={defaultCertificado}
        onSave={saveCertificado}
        onResetToDefault={resetCertificadoToDefault}
        onPullCompanyTemplate={() => companyTemplates?.certificado_content ?? defaultCertificado}
        pullCompanyTemplateDisabled={!companyTemplates?.certificado_content}
        isSaving={isSaving}
        helperText={t.editorCertHelper}
        templateContext={variableContext}
      />

      {/* Onda E — atalho rápido pra cadastrar assinatura do RT do contrato. */}
      <RtSignatureQuickDialog
        open={signatureDialogOpen}
        onOpenChange={setSignatureDialogOpen}
        responsibleTechnicianId={responsibleTechnicianId ?? null}
      />
    </div>
  );
}

/**
 * Botão de download da última versão de um doc PMOC.
 *
 * Por enquanto, baixa via signed URL gerada pela edge function (a Database
 * vai expor um endpoint `pmoc-document-signed-url` ou retornar URL na edge
 * function de geração). Como ainda não temos esse endpoint na Onda C parcial,
 * o handler chama a mesma edge de geração — que faz cache hit quando hash
 * não mudou e retorna a URL existente.
 */
function DownloadLatestButton({
  doc,
  label,
}: {
  doc: PmocDocument;
  label: string;
}) {
  const generateDossie = useGenerateDossiePdf();
  const generateCronograma = useGenerateCronogramaPdf();
  const generateTrt = useGenerateTrtPdf();
  const generateCertificado = useGenerateCertificadoPdf();
  const generatePlanilha = useGeneratePlanilhaPdf();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      let result;
      if (doc.doc_type === 'dossie_pmoc') {
        result = await generateDossie.mutateAsync({ contract_id: doc.contract_id });
      } else if (doc.doc_type === 'cronograma_anual') {
        result = await generateCronograma.mutateAsync({ contract_id: doc.contract_id });
      } else if (doc.doc_type === 'certificado') {
        result = await generateCertificado.mutateAsync({ contract_id: doc.contract_id });
      } else if (doc.doc_type === 'planilha') {
        result = await generatePlanilha.mutateAsync({ contract_id: doc.contract_id });
      } else {
        // termo_rt (Onda E)
        result = await generateTrt.mutateAsync({ contract_id: doc.contract_id });
      }
      if (result.pdf_url) {
        window.open(result.pdf_url, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={busy}
      className="min-h-11 sm:min-h-[40px] active:scale-[0.97] transition-transform rounded-xl"
    >
      {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
      {label}
    </Button>
  );
}

function VersionHistory({
  documents,
  isLoading,
  t,
}: {
  documents: PmocDocument[];
  isLoading: boolean;
  t: DocsT;
}) {
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <Card className="w-full rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardContent className="py-4 text-center text-xs text-muted-foreground">
          {t.versionHistoryLoading}
        </CardContent>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card className="w-full rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardContent className="py-4 text-center text-xs text-muted-foreground">
          {t.versionHistoryEmpty}
        </CardContent>
      </Card>
    );
  }

  // Agrupar por doc_type
  const byType = documents.reduce<Record<PmocDocumentType, PmocDocument[]>>(
    (acc, d) => {
      (acc[d.doc_type] ||= []).push(d);
      return acc;
    },
    { dossie_pmoc: [], cronograma_anual: [], termo_rt: [], certificado: [], planilha: [] },
  );

  return (
    <Card className="w-full rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-between gap-2 px-4 py-3 text-left min-h-11',
              'text-sm font-semibold active:scale-[0.995] transition-transform',
            )}
          >
            <span>{t.versionHistoryTitle.replace('{n}', String(documents.length))}</span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 border-t pt-4">
            <TypeBlock title={t.trtTitle} docs={byType.termo_rt} downloadLabel={t.downloadBtn} />
            <TypeBlock title={t.certTitle} docs={byType.certificado} downloadLabel={t.downloadBtn} />
            <TypeBlock title={t.dossieTitle} docs={byType.dossie_pmoc} downloadLabel={t.downloadBtn} />
            <TypeBlock title={t.planilhaTitle} docs={byType.planilha} downloadLabel={t.downloadBtn} />
            <TypeBlock title={t.cronogramaAnualTitle} docs={byType.cronograma_anual} downloadLabel={t.downloadBtn} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function TypeBlock({ title, docs, downloadLabel }: { title: string; docs: PmocDocument[]; downloadLabel: string }) {
  if (docs.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1.5">
        {docs.map(d => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                v{d.version}{' '}
                <span className="font-mono text-xs text-muted-foreground">
                  • {formatGeneratedAt(d.generated_at)}
                </span>
              </p>
            </div>
            <DownloadLatestButton doc={d} label={downloadLabel} />
          </li>
        ))}
      </ul>
    </div>
  );
}
