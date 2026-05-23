import { useMemo, useState } from 'react';
import {
  Download,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  ChevronDown,
  Info,
  CalendarRange,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
} from '@/hooks/useGeneratePmocDocument';
import {
  buildDefaultTermoRtHtml,
  buildDefaultCertificadoHtml,
  htmlPreview,
  type PmocTemplateContext,
} from '@/utils/pmocDocumentTemplates';

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
}

/** Badge visual do status da assinatura embarcada num PDF PMOC (Onda E). */
function SignatureStatusBadge({ status }: { status: PmocDocumentSignatureStatus }) {
  if (status === 'signed') {
    return (
      <Badge variant="success" className="gap-1">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Assinado
      </Badge>
    );
  }
  if (status === 'pending') {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Sem assinatura
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Não gerado
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
}: {
  title: string;
  preview: string;
  helperTooltip: string;
  onEdit: () => void;
  edited: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-2">
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
      <p className="min-h-[48px] flex-1 break-words text-xs text-muted-foreground">
        {preview || 'Texto padrão do sistema. Clique em "Editar" pra personalizar.'}
      </p>
      <div className="flex items-center justify-between gap-2">
        {edited ? (
          <Badge variant="outline" className="text-[10px]">
            Personalizado
          </Badge>
        ) : (
          <span className="text-[10px] text-muted-foreground">Texto padrão</span>
        )}
        <Button
          variant="edit-ghost"
          size="sm"
          className="min-h-[36px]"
          onClick={onEdit}
        >
          <Pencil className="mr-1 h-3.5 w-3.5" />
          Editar
        </Button>
      </div>
    </div>
  );
}

export function PmocContractDocsTab({
  contractId,
  templateContext,
  responsibleTechnicianId,
}: PmocContractDocsTabProps) {
  const {
    customDocs,
    saveTermoRT,
    saveCertificado,
    resetTermoRTToDefault,
    resetCertificadoToDefault,
    isSaving,
  } = usePmocContractCustomDocs(contractId);

  const { documents, latestByType, isLoading: isLoadingDocs, refetch } = usePmocDocuments(contractId);

  const generateDossie = useGenerateDossiePdf();
  const generateCronograma = useGenerateCronogramaPdf();
  const generateTrt = useGenerateTrtPdf();

  const [editorOpen, setEditorOpen] = useState<'termo_rt' | 'certificado' | null>(null);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);

  // Templates default pré-preenchidos com contexto
  const defaultTermoRt = useMemo(
    () => buildDefaultTermoRtHtml(templateContext ?? {}),
    [templateContext],
  );
  const defaultCertificado = useMemo(
    () => buildDefaultCertificadoHtml(templateContext ?? {}),
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
  const latestCronograma = latestByType.cronograma_anual;
  const latestTrt = latestByType.termo_rt;

  // Status visual do TRT: signed | pending | null (não gerado).
  const trtStatus: PmocDocumentSignatureStatus = latestTrt
    ? latestTrt.signature_status ?? 'pending'
    : null;
  // Mesma lógica pro Dossiê (também leva assinatura — Onda E).
  const dossieStatus: PmocDocumentSignatureStatus = latestDossie
    ? latestDossie.signature_status ?? 'pending'
    : null;

  const handleGenerateDossie = async () => {
    await generateDossie.mutateAsync({ contract_id: contractId });
    refetch();
  };
  const handleGenerateCronograma = async () => {
    await generateCronograma.mutateAsync({ contract_id: contractId });
    refetch();
  };
  const handleGenerateTrt = async () => {
    await generateTrt.mutateAsync({ contract_id: contractId });
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Card 0 — TRT (Onda E) — gerável independente do Dossiê */}
      <Card className="w-full min-w-0 max-w-full overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2 break-words">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <span className="min-w-0 break-words">
                Termo de Responsabilidade Técnica (TRT)
              </span>
              {latestTrt && (
                <Badge variant="secondary" className="ml-2">
                  v{latestTrt.version}
                </Badge>
              )}
            </CardTitle>
            <SignatureStatusBadge status={trtStatus} />
          </div>
          <p className="text-xs text-muted-foreground">
            Documento curto (1 página) com declaração de responsabilidade técnica do RT,
            conforme Lei Federal 13.589/2018. Pode ser gerado independente do Dossiê completo.
          </p>
          {latestTrt && (
            <p className="text-xs text-muted-foreground">
              Última geração: {formatGeneratedAt(latestTrt.generated_at)}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3 min-w-0">
          {trtStatus === 'pending' && (
            <Alert className="border-warning/40 bg-warning/5">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertTitle>Assinatura pendente</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  O RT atual desse contrato não tem assinatura cadastrada. O TRT foi gerado
                  com linha em branco pra assinar à mão. Você pode adicionar a assinatura
                  agora pro PDF ser regerado automaticamente em todos os documentos (TRT, Dossiê).
                </p>
                <Button
                  size="sm"
                  variant="edit-ghost"
                  className="mt-1 min-h-[36px]"
                  onClick={() => setSignatureDialogOpen(true)}
                  disabled={!responsibleTechnicianId}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Adicionar assinatura agora
                </Button>
                {!responsibleTechnicianId && (
                  <p className="text-[11px] text-muted-foreground">
                    Vincule um Responsável Técnico ao contrato pra habilitar o cadastro de assinatura.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {latestTrt?.pdf_storage_path && (
              <DownloadLatestButton doc={latestTrt} label="Baixar última versão" />
            )}
            <Button
              size="sm"
              onClick={handleGenerateTrt}
              disabled={generateTrt.isPending}
              className="min-h-[40px]"
            >
              {generateTrt.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              {latestTrt ? 'Atualizar TRT' : 'Gerar TRT'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card 1 — Dossiê PMOC */}
      <Card className="w-full min-w-0 max-w-full overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2 break-words">
              <FileText className="h-5 w-5 shrink-0" />
              <span className="min-w-0 break-words">Dossiê PMOC</span>
              {latestDossie && (
                <Badge variant="secondary" className="ml-2">
                  v{latestDossie.version}
                </Badge>
              )}
            </CardTitle>
            <SignatureStatusBadge status={dossieStatus} />
          </div>
          <p className="text-xs text-muted-foreground">
            Última geração: {formatGeneratedAt(latestDossie?.generated_at)}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SubDocCard
              title="Termo de Responsabilidade Técnica"
              preview={termoRtPreview}
              edited={!!termoRtHtml}
              helperTooltip="Esse texto vai pra página 2 do PDF do Dossiê PMOC. Você pode editar e salvar — ou usar o texto padrão do sistema."
              onEdit={() => setEditorOpen('termo_rt')}
            />
            <SubDocCard
              title="Certificado de Conformidade"
              preview={certificadoPreview}
              edited={!!certificadoHtml}
              helperTooltip="Esse texto vai pra página 3 do PDF do Dossiê PMOC, com o selo da Lei Federal 13.589/2018."
              onEdit={() => setEditorOpen('certificado')}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              A capa do Dossiê tem visual padrão Dominex (não editável).
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {latestDossie?.pdf_storage_path && (
                <DownloadLatestButton doc={latestDossie} label="Baixar última versão" />
              )}
              <Button
                size="sm"
                onClick={handleGenerateDossie}
                disabled={generateDossie.isPending}
                className="min-h-[40px]"
              >
                {generateDossie.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                {latestDossie ? 'Gerar nova versão' : 'Gerar PDF completo'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2 — Cronograma Anual */}
      <Card className="w-full min-w-0 max-w-full overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 break-words">
            <CalendarRange className="h-5 w-5 shrink-0" />
            <span className="min-w-0 break-words">Cronograma Anual</span>
            {latestCronograma && (
              <Badge variant="secondary" className="ml-2">
                v{latestCronograma.version}
              </Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            PDF com 12 meses (1 mês por página). Última geração:{' '}
            {formatGeneratedAt(latestCronograma?.generated_at)}
          </p>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {latestCronograma?.pdf_storage_path && (
              <DownloadLatestButton doc={latestCronograma} label="Baixar última versão" />
            )}
            <Button
              size="sm"
              onClick={handleGenerateCronograma}
              disabled={generateCronograma.isPending}
              className="min-h-[40px]"
            >
              {generateCronograma.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              {latestCronograma ? 'Gerar/Atualizar PDF' : 'Gerar PDF anual'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de versões */}
      <VersionHistory documents={documents} isLoading={isLoadingDocs} />

      {/* Editores */}
      <PmocDocEditorDialog
        open={editorOpen === 'termo_rt'}
        onOpenChange={(o) => !o && setEditorOpen(null)}
        title="Editar Termo de Responsabilidade Técnica"
        initialHtml={termoRtHtml}
        defaultHtml={defaultTermoRt}
        onSave={saveTermoRT}
        onResetToDefault={resetTermoRTToDefault}
        isSaving={isSaving}
        helperText="Esse texto será embutido na página 2 do PDF do Dossiê PMOC."
      />
      <PmocDocEditorDialog
        open={editorOpen === 'certificado'}
        onOpenChange={(o) => !o && setEditorOpen(null)}
        title="Editar Certificado de Conformidade"
        initialHtml={certificadoHtml}
        defaultHtml={defaultCertificado}
        onSave={saveCertificado}
        onResetToDefault={resetCertificadoToDefault}
        isSaving={isSaving}
        helperText="Esse texto será embutido na página 3 do PDF do Dossiê PMOC."
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
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      let result;
      if (doc.doc_type === 'dossie_pmoc') {
        result = await generateDossie.mutateAsync({ contract_id: doc.contract_id });
      } else if (doc.doc_type === 'cronograma_anual') {
        result = await generateCronograma.mutateAsync({ contract_id: doc.contract_id });
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
      className="min-h-[40px]"
    >
      {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
      {label}
    </Button>
  );
}

function VersionHistory({
  documents,
  isLoading,
}: {
  documents: PmocDocument[];
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="py-4 text-center text-xs text-muted-foreground">
          Carregando histórico…
        </CardContent>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="py-4 text-center text-xs text-muted-foreground">
          Nenhuma versão gerada ainda.
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
    { dossie_pmoc: [], cronograma_anual: [], termo_rt: [] },
  );

  return (
    <Card className="w-full">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-between gap-2 px-4 py-3 text-left',
              'text-sm font-semibold',
            )}
          >
            <span>Histórico de versões ({documents.length})</span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 border-t pt-4">
            <TypeBlock title="Termo de Responsabilidade Técnica" docs={byType.termo_rt} />
            <TypeBlock title="Dossiê PMOC" docs={byType.dossie_pmoc} />
            <TypeBlock title="Cronograma Anual" docs={byType.cronograma_anual} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function TypeBlock({ title, docs }: { title: string; docs: PmocDocument[] }) {
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
            className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                v{d.version}{' '}
                <span className="font-mono text-xs text-muted-foreground">
                  • {formatGeneratedAt(d.generated_at)}
                </span>
              </p>
            </div>
            <DownloadLatestButton doc={d} label="Baixar" />
          </li>
        ))}
      </ul>
    </div>
  );
}
