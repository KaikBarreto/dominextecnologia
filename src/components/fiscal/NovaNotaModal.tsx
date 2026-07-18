import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, FileText, AlertTriangle } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { TaxCodeCombobox } from '@/components/fiscal/TaxCodeCombobox';
import { useCustomers } from '@/hooks/useCustomers';
import { useNfse, type NfseEmission } from '@/hooks/useNfse';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  NfseQuotaBlockModal,
  type NfseQuotaBlockInfo,
} from '@/components/fiscal/NfseQuotaBlockModal';

interface NovaNotaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Chamado após emissão bem-sucedida (a lista já é invalidada pelo hook).
   * Recebe a emissão recém-criada (quando a edge a devolve) pra o pai poder
   * abrir o detalhe e iniciar o polling automático de status.
   */
  onEmitted?: (emission?: NfseEmission | null) => void;
}

/** String crua → number (sem prender "0" à esquerda). null se vazio/ inválido. */
function num(s: string): number | null {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function NovaNotaModal({ open, onOpenChange, onEmitted }: NovaNotaModalProps) {
  const { customers } = useCustomers();
  const { emitNfse, isEmitting } = useNfse();
  const { companyId } = useUserCompany();
  const { serviceTypes, gapFillServiceTypeFiscal } = useServiceTypes();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;

  const [customerId, setCustomerId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState(''); // string crua
  const [codigoServico, setCodigoServico] = useState('');
  const [codigoNbs, setCodigoNbs] = useState('');
  const [issAliquota, setIssAliquota] = useState(''); // string crua (%)

  // Bloqueio de cota (HTTP 402 nfse_quota_exceeded): abre o modal de upgrade.
  const [blockInfo, setBlockInfo] = useState<NfseQuotaBlockInfo | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  // Reseta ao abrir. Os códigos fiscais começam vazios — a fonte é o tipo de
  // serviço selecionado (ou digitação manual). Sem default da empresa.
  useEffect(() => {
    if (open) {
      setCustomerId('');
      setServiceTypeId('');
      setDescricao('');
      setValor('');
      setCodigoServico('');
      setCodigoNbs('');
      setIssAliquota('');
    }
  }, [open]);

  const customerOptions = useMemo(
    () => (customers ?? []).map((c) => ({ value: c.id, label: c.name })),
    [customers],
  );

  // Só tipos ativos no seletor da nota.
  const serviceTypeOptions = useMemo(
    () =>
      (serviceTypes ?? [])
        .filter((s) => s.is_active)
        .map((s) => ({ value: s.id, label: s.name })),
    [serviceTypes],
  );

  /**
   * Ao escolher um tipo de serviço, pré-preenche os campos fiscais a partir das
   * colunas do catálogo do PRÓPRIO serviço (cada um segue editável depois).
   * Sem fallback pro default da empresa — a fonte é o serviço (ou digitação
   * manual). Se o serviço estiver incompleto, o usuário completa na nota e a
   * emissão grava de volta no serviço (gap-fill), pra próxima vez já puxar tudo.
   */
  const handleServiceTypeChange = (id: string) => {
    setServiceTypeId(id);
    const st = (serviceTypes ?? []).find((s) => s.id === id);
    if (!st) {
      // Limpou a seleção: zera os campos fiscais (sem serviço, sem fonte).
      setCodigoServico('');
      setCodigoNbs('');
      setIssAliquota('');
      return;
    }
    setCodigoServico(st.codigo_servico || '');
    setCodigoNbs(st.codigo_nbs || '');
    setIssAliquota(
      st.iss_aliquota != null
        ? String(st.iss_aliquota).replace('.', ',')
        : '',
    );
    // Pré-preenche a descrição com o nome do serviço só se ainda estiver vazia.
    setDescricao((prev) => (prev.trim() ? prev : st.name));
  };

  const selectedCustomer = useMemo(
    () => (customers ?? []).find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  // O tomador precisa de documento (CPF/CNPJ) pra Fisqal aceitar (senão 422).
  const customerMissingDoc = !!selectedCustomer && !selectedCustomer.document?.trim();

  const valorNum = num(valor);
  const canSubmit =
    !!customerId &&
    !customerMissingDoc &&
    descricao.trim().length > 0 &&
    valorNum != null &&
    !isEmitting;

  /**
   * Emite com os valores já validados. Trata o bloqueio de cota (402) abrindo o
   * modal de upgrade em vez do toast genérico. Reutilizada na reexecução
   * automática pós-upgrade.
   */
  const runEmit = async (v: number) => {
    // Valores fiscais resolvidos: o que estiver nos campos (serviço escolhido ou
    // digitação manual). Se vazios, NÃO enviamos esses campos.
    const issNum = num(issAliquota);
    const res = await emitNfse({
      customerId,
      descricao: descricao.trim(),
      valorServico: v,
      codigoServico: codigoServico.trim() || undefined,
      codigoNbs: codigoNbs.trim() || undefined,
      aliquotaIss: issNum ?? undefined,
    });

    if (!res.ok) {
      // Cota estourada: o servidor recusou (402). Abre o modal de upgrade com os
      // campos preservados pelo invokeFisqal (errorBody).
      if (res.errorCode === 'nfse_quota_exceeded') {
        const b = res.errorBody ?? {};
        const nt = b.next_tier as Record<string, unknown> | null | undefined;
        setBlockInfo({
          used: typeof b.used === 'number' ? b.used : 0,
          limit: typeof b.limit === 'number' ? b.limit : 0,
          tier: typeof b.tier === 'number' ? b.tier : 1,
          nextTier: nt
            ? {
                tier: Number(nt.tier),
                name: String(nt.name ?? `Nível ${nt.tier}`),
                limit: nt.limit == null ? null : Number(nt.limit),
                price: Number(nt.price ?? 0),
              }
            : null,
        });
        setBlockOpen(true);
        return;
      }
      // 503 (não ativada), 422 (dados faltando) e demais erros já vêm com
      // mensagem PT-BR pronta do helper invokeFisqal.
      toast.error(res.message ?? t.newNote.toasts.emitError);
      return;
    }

    toast.success(res.message ?? t.newNote.toasts.emitSuccess);

    // Gap-fill silencioso: se a nota foi emitida a partir de um tipo de serviço
    // e o usuário completou códigos fiscais que estavam VAZIOS naquele serviço,
    // grava de volta no serviço (só os campos vazios — não clobbera config
    // deliberada). Roda em segundo plano; falha não atrapalha a nota.
    if (serviceTypeId) {
      const st = (serviceTypes ?? []).find((s) => s.id === serviceTypeId);
      if (st) {
        const fill: Record<string, string | number> = {};
        const cs = codigoServico.trim();
        if (cs && !st.codigo_servico) fill.codigo_servico = cs;
        const cn = codigoNbs.trim();
        if (cn && !st.codigo_nbs) fill.codigo_nbs = cn;
        if (issNum != null && st.iss_aliquota == null) fill.iss_aliquota = issNum;
        if (Object.keys(fill).length > 0) {
          void gapFillServiceTypeFiscal(st.id, fill);
        }
      }
    }

    onOpenChange(false);
    // A edge devolve a emissão recém-criada em `data.emission`; repassa pro pai
    // abrir o detalhe e ligar o polling automático até virar terminal.
    const created = (res.data?.emission as NfseEmission | undefined) ?? null;
    onEmitted?.(created);
  };

  const handleSubmit = async () => {
    if (!customerId) {
      toast.error(t.newNote.toasts.noCustomer);
      return;
    }
    if (customerMissingDoc) {
      toast.error(t.newNote.toasts.missingDoc);
      return;
    }
    if (!descricao.trim()) {
      toast.error(t.newNote.toasts.noDescription);
      return;
    }
    const v = num(valor);
    if (v == null) {
      toast.error(t.newNote.toasts.invalidValue);
      return;
    }
    await runEmit(v);
  };

  // Pós-upgrade: reexecuta a emissão que o usuário já tinha preenchido.
  const handleUpgraded = async () => {
    const v = num(valor);
    if (v == null) return; // dados ainda válidos no form; nada a refazer.
    await runEmit(v);
  };

  return (
    <>
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.newNote.title}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isEmitting}>
            {t.newNote.cancelBtn}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            {t.newNote.submitBtn}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <div className="space-y-2">
          <Label>{t.newNote.customer.label}</Label>
          <SearchableSelect
            options={customerOptions}
            value={customerId}
            onValueChange={setCustomerId}
            placeholder={t.newNote.customer.placeholder}
            searchPlaceholder={t.newNote.customer.searchPlaceholder}
            emptyMessage={t.newNote.customer.emptyMessage}
          />
          {customerMissingDoc && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t.newNote.customer.missingDoc}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {serviceTypeOptions.length > 0 && (
          <div className="space-y-2">
            <Label>{t.newNote.serviceType.label}</Label>
            <SearchableSelect
              options={serviceTypeOptions}
              value={serviceTypeId}
              onValueChange={handleServiceTypeChange}
              placeholder={t.newNote.serviceType.placeholder}
              searchPlaceholder={t.newNote.serviceType.searchPlaceholder}
              emptyMessage={t.newNote.serviceType.emptyMessage}
            />
            <p className="text-[11px] text-muted-foreground">
              {t.newNote.serviceType.hint}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>{t.newNote.description.label}</Label>
          <Textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={t.newNote.description.placeholder}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t.newNote.value.label}</Label>
            <Input
              inputMode="decimal"
              placeholder={t.newNote.value.placeholder}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>
              {t.newNote.iss.label}
              <span className="ml-1 font-normal text-muted-foreground">{t.newNote.iss.optional}</span>
            </Label>
            <Input
              inputMode="decimal"
              placeholder={t.newNote.iss.placeholder}
              value={issAliquota}
              onChange={(e) => setIssAliquota(e.target.value)}
            />
          </div>
        </div>

        {/* Classificação fiscal: códigos do serviço. Pré-preenchidos pelo tipo de
            serviço selecionado — editáveis. */}
        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm font-medium">{t.newNote.fiscalClassification.sectionTitle}</p>
          <div className="space-y-2">
            <Label className="text-sm">
              {t.newNote.fiscalClassification.serviceCode.label}
              <span className="ml-1 font-normal text-muted-foreground">
                {t.newNote.fiscalClassification.serviceCode.optional}
              </span>
            </Label>
            <TaxCodeCombobox
              type="servico"
              value={codigoServico}
              onSelect={(codigo) => setCodigoServico(codigo)}
              placeholder={t.newNote.fiscalClassification.serviceCode.placeholder}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">
              {t.newNote.fiscalClassification.nbs.label}
              <span className="ml-1 font-normal text-muted-foreground">
                {t.newNote.fiscalClassification.nbs.optional}
              </span>
            </Label>
            <TaxCodeCombobox
              type="nbs"
              value={codigoNbs}
              onSelect={(codigo) => setCodigoNbs(codigo)}
              placeholder={t.newNote.fiscalClassification.nbs.placeholder}
            />
            <p className="text-[11px] text-muted-foreground">
              {t.newNote.fiscalClassification.nbs.hint}
            </p>
          </div>
        </div>
      </div>
    </ResponsiveModal>

    <NfseQuotaBlockModal
      open={blockOpen}
      onOpenChange={setBlockOpen}
      info={blockInfo}
      companyId={companyId}
      onUpgraded={handleUpgraded}
    />
    </>
  );
}
