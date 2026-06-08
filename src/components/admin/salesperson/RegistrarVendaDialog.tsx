/**
 * RegistrarVendaDialog — diálogo reutilizável para registrar uma venda da equipe
 * comercial Auctus (closer + SDR opcional), com preview ao vivo da comissão.
 *
 * Reuso: este componente é chamado tanto pela tela de vendedores quanto pelo
 * botão "Ganhar" do CRM master (AdminLeadDetailModal). Ele é totalmente
 * controlado por props — não tem trigger próprio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * API DAS PROPS (contrato para quem liga o "Ganhar" do CRM):
 *
 *   open          (boolean, obrigatório)  — controla a visibilidade.
 *   onOpenChange  ((open: boolean) => void, obrigatório) — fecha/abre.
 *
 *   prefill       (opcional) — pré-preenche os campos ao abrir:
 *     {
 *       companyName?:   string;              // nome da empresa/cliente (customer_company)
 *       value?:         number;              // valor da venda (amount)
 *       billingCycle?:  'monthly' | 'annual';// ciclo (default 'monthly')
 *       leadId?:        string;              // só repassado ao onSuccess (não persiste na venda)
 *       closerId?:      string;              // pré-seleciona o closer
 *       sdrId?:         string;              // pré-seleciona o SDR
 *     }
 *
 *   onSuccess     (opcional) — callback após a venda ser gravada com sucesso.
 *                 Recebe { saleId, leadId? } para o CRM mover o lead pro estágio
 *                 "ganho" / fazer o que precisar. O dialog NÃO fecha sozinho a
 *                 partir do onSuccess — ele já se fecha internamente ao salvar.
 *
 * Regra de comissão (travada): ver calculateCommission em useSalespersonData.
 * O closer é gravado em salesperson_sales.salesperson_id; o SDR em sdr_id.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import {
  useSalespeopleBasic,
  useCreateSale,
  calculateCommission,
} from '@/hooks/useSalespersonData';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { toast } from 'sonner';

export interface RegistrarVendaPrefill {
  companyName?: string;
  value?: number;
  billingCycle?: 'monthly' | 'annual';
  leadId?: string;
  closerId?: string;
  sdrId?: string;
}

export interface RegistrarVendaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: RegistrarVendaPrefill;
  onSuccess?: (result: { saleId: string; leadId?: string }) => void;
}

const NONE = 'none';

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function RegistrarVendaDialog({ open, onOpenChange, prefill, onSuccess }: RegistrarVendaDialogProps) {
  const { data: salespeople = [], isLoading: loadingPeople } = useSalespeopleBasic(true);
  const { linkedSalespersonId } = useAdminPermissions();
  const createSale = useCreateSale();

  const [closerId, setCloserId] = useState<string>('');
  const [sdrId, setSdrId] = useState<string>(NONE);
  const [amount, setAmount] = useState<number>(0);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [companyName, setCompanyName] = useState<string>('');

  // (Re)inicializa o formulário sempre que abre, aplicando os prefills.
  useEffect(() => {
    if (!open) return;
    setCloserId(prefill?.closerId || linkedSalespersonId || '');
    setSdrId(prefill?.sdrId || NONE);
    setAmount(prefill?.value ?? 0);
    setBillingCycle(prefill?.billingCycle || 'monthly');
    setCompanyName(prefill?.companyName || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Opções: closers (role='closer' ou null/legado) + o próprio usuário logado.
  // SDRs: role='sdr'. Mantemos quem já está pré-selecionado mesmo que filtre.
  const closerOptions = useMemo(
    () =>
      salespeople.filter(
        (s) => s.role !== 'sdr' || s.id === closerId,
      ),
    [salespeople, closerId],
  );
  const sdrOptions = useMemo(
    () => salespeople.filter((s) => s.role === 'sdr'),
    [salespeople],
  );

  const hasSdr = sdrId !== NONE && !!sdrId;
  const breakdown = useMemo(
    () => calculateCommission(amount, billingCycle, hasSdr),
    [amount, billingCycle, hasSdr],
  );

  const closerName = salespeople.find((s) => s.id === closerId)?.name || 'Closer';
  const sdrName = salespeople.find((s) => s.id === sdrId)?.name || 'SDR';

  const canSubmit = !!closerId && amount > 0 && !createSale.isPending;

  const handleSubmit = async () => {
    if (!closerId) {
      toast.error('Selecione o Closer');
      return;
    }
    if (amount <= 0) {
      toast.error('Informe o valor da venda');
      return;
    }
    try {
      const saved = await createSale.mutateAsync({
        salesperson_id: closerId,
        sdr_id: hasSdr ? sdrId : null,
        amount,
        billing_cycle: billingCycle,
        customer_company: companyName.trim() || null,
        // comissões calculadas dentro do hook pela regra travada
      } as any);
      onOpenChange(false);
      onSuccess?.({ saleId: (saved as any)?.id, leadId: prefill?.leadId });
    } catch {
      // toast de erro já é disparado pelo hook
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar Venda"
      description="Comissão dividida automaticamente entre Closer e SDR"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Closer*</Label>
          <Select value={closerId} onValueChange={setCloserId} disabled={loadingPeople}>
            <SelectTrigger>
              <SelectValue placeholder={loadingPeople ? 'Carregando...' : 'Selecione o closer'} />
            </SelectTrigger>
            <SelectContent>
              {closerOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <SalespersonAvatar name={s.name || '?'} photoUrl={s.photo_url} size="sm" />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>SDR (opcional)</Label>
          <Select value={sdrId} onValueChange={setSdrId} disabled={loadingPeople}>
            <SelectTrigger>
              <SelectValue placeholder="— Sem SDR —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Sem SDR —</SelectItem>
              {sdrOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <SalespersonAvatar name={s.name || '?'} photoUrl={s.photo_url} size="sm" />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sdrOptions.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Nenhum vendedor cadastrado como SDR. A comissão fica 100% com o closer.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="rv-amount">Valor (R$)*</Label>
            <Input
              id="rv-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount || ''}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-2">
            <Label>Ciclo</Label>
            <Select value={billingCycle} onValueChange={(v) => setBillingCycle(v as 'monthly' | 'annual')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rv-company">Empresa / Cliente (opcional)</Label>
          <Input
            id="rv-company"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Nome da empresa ou cliente"
          />
        </div>

        {/* Preview ao vivo da comissão */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Comissão total ({billingCycle === 'annual' ? '20%' : '50%'})
            </span>
            <span className="font-bold">{fmt(breakdown.total)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="truncate">Closer · {closerName}</span>
            <span className="font-semibold text-emerald-600">{fmt(breakdown.closerCommission)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="truncate">SDR · {hasSdr ? sdrName : '—'}</span>
            <span className={hasSdr ? 'font-semibold text-emerald-600' : 'text-muted-foreground'}>
              {fmt(breakdown.sdrCommission)}
            </span>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
            {createSale.isPending ? 'Registrando...' : 'Registrar Venda'}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
