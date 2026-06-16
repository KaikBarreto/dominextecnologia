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
import { useCustomers } from '@/hooks/useCustomers';
import { useNfse } from '@/hooks/useNfse';
import { useFiscalSettings } from '@/hooks/useFiscalSettings';
import { useUserCompany } from '@/hooks/useUserCompany';
import {
  NfseQuotaBlockModal,
  type NfseQuotaBlockInfo,
} from '@/components/fiscal/NfseQuotaBlockModal';

interface NovaNotaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após emissão bem-sucedida (a lista já é invalidada pelo hook). */
  onEmitted?: () => void;
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
  const { settings } = useFiscalSettings();
  const { emitNfse, isEmitting } = useNfse();
  const { companyId } = useUserCompany();

  const [customerId, setCustomerId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState(''); // string crua
  const [codigoServico, setCodigoServico] = useState('');

  // Bloqueio de cota (HTTP 402 nfse_quota_exceeded): abre o modal de upgrade.
  const [blockInfo, setBlockInfo] = useState<NfseQuotaBlockInfo | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  // Reseta ao abrir; pré-preenche o código de serviço com o default da empresa.
  useEffect(() => {
    if (open) {
      setCustomerId('');
      setDescricao('');
      setValor('');
      setCodigoServico(settings.codigo_servico_default || '');
    }
  }, [open, settings.codigo_servico_default]);

  const customerOptions = useMemo(
    () => (customers ?? []).map((c) => ({ value: c.id, label: c.name })),
    [customers],
  );

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
    const res = await emitNfse({
      customerId,
      descricao: descricao.trim(),
      valorServico: v,
      codigoServico: codigoServico.trim() || undefined,
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
      toast.error(res.message ?? 'Não foi possível emitir a nota fiscal.');
      return;
    }

    toast.success(res.message ?? 'Nota fiscal enviada para emissão.');
    onOpenChange(false);
    onEmitted?.();
  };

  const handleSubmit = async () => {
    if (!customerId) {
      toast.error('Selecione o cliente.');
      return;
    }
    if (customerMissingDoc) {
      toast.error('O cliente está sem CPF/CNPJ. Complete os dados fiscais do cliente antes de emitir.');
      return;
    }
    if (!descricao.trim()) {
      toast.error('Descreva o serviço prestado.');
      return;
    }
    const v = num(valor);
    if (v == null) {
      toast.error('Informe um valor de serviço válido.');
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
      title="Nova Nota Fiscal"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isEmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Emitir nota
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <div className="space-y-2">
          <Label>Cliente (tomador)</Label>
          <SearchableSelect
            options={customerOptions}
            value={customerId}
            onValueChange={setCustomerId}
            placeholder="Selecione o cliente"
            searchPlaceholder="Buscar cliente..."
            emptyMessage="Nenhum cliente encontrado."
          />
          {customerMissingDoc && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Este cliente está sem CPF/CNPJ. Complete os dados fiscais do cliente
                (aba Fiscal) antes de emitir a nota.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="space-y-2">
          <Label>Descrição do serviço</Label>
          <Textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Manutenção preventiva de ar-condicionado split..."
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Valor do serviço (R$)</Label>
            <Input
              inputMode="decimal"
              placeholder="Ex: 350,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Código de serviço (opcional)</Label>
            <Input
              placeholder="Ex: 1401"
              value={codigoServico}
              onChange={(e) => setCodigoServico(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Padrão da empresa preenchido automaticamente. Em breve teremos busca por descrição.
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
