import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Landmark, Wallet, CreditCard } from 'lucide-react';
import { useFinancialAccounts, type FinancialAccount, type AccountInput } from '@/hooks/useFinancialAccounts';
import { BankInstitutionCombobox, BankLogo } from './BankInstitutionCombobox';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const ACCOUNT_COLORS = [
  '#0F172A', '#1E293B', '#334155', '#0EA5E9', '#0284C7', '#1D4ED8',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4',
];

const CLOSING_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const DUE_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const ACCOUNT_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  caixa: Wallet,
  banco: Landmark,
  cartao: CreditCard,
};

function getTypeIcon(type: string) {
  return ACCOUNT_TYPE_ICONS[type] || Landmark;
}

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Conta sendo editada — null/undefined = criação. */
  editing?: FinancialAccount | null;
  /** Tipo inicial na criação ('banco' | 'cartao' | 'caixa'). */
  defaultType?: string;
}

/**
 * Formulário de criação/edição de conta ou cartão. Extraído de FinanceBanks
 * pra ser reusado pela tela "Movimentações Financeiras" (sidebar de contas).
 * Fonte única da regra de saldo inicial + fechamento/vencimento do cartão.
 */
export function AccountFormDialog({ open, onOpenChange, editing, defaultType = 'banco' }: AccountFormDialogProps) {
  const { createAccount, updateAccount } = useFinancialAccounts();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.accountForm;
  const accountTypes = [
    { value: 'caixa', label: t.types.caixa, icon: Wallet },
    { value: 'banco', label: t.types.banco, icon: Landmark },
    { value: 'cartao', label: t.types.cartao, icon: CreditCard },
  ];

  const [name, setName] = useState('');
  const [type, setType] = useState('banco');
  const [institution, setInstitution] = useState<{ code: number | null; name: string; ispb?: string | null } | null>(null);
  const [initialBalance, setInitialBalance] = useState(0);
  const [color, setColor] = useState('#3b82f6');
  const [closingDay, setClosingDay] = useState<number>(10);
  const [dueDay, setDueDay] = useState<number>(20);
  const [creditLimit, setCreditLimit] = useState<number>(0);

  // Sincroniza os campos quando o dialog abre (criar zera, editar preenche).
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setInstitution(editing.institution_name
        ? { code: editing.institution_code ?? null, name: editing.institution_name, ispb: editing.institution_ispb }
        : (editing.bank_name ? { code: null, name: editing.bank_name } : null));
      setInitialBalance(editing.initial_balance);
      setColor(editing.color);
      setClosingDay(editing.closing_day ?? 10);
      setDueDay(editing.due_day ?? (editing.payment_due_days ? (editing.closing_day ?? 10) + editing.payment_due_days : 20));
      setCreditLimit(editing.credit_limit ?? 0);
    } else {
      setName(''); setType(defaultType); setInstitution(null); setInitialBalance(0); setColor('#3b82f6');
      setClosingDay(10); setDueDay(20); setCreditLimit(0);
    }
  }, [open, editing, defaultType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: AccountInput = {
      name,
      type,
      bank_name: institution?.name || undefined,
      institution_code: institution?.code ?? null,
      institution_name: institution?.name ?? null,
      institution_ispb: institution?.ispb ?? null,
      initial_balance: initialBalance,
      color,
      ...(type === 'cartao' ? {
        closing_day: closingDay,
        due_day: dueDay,
        payment_due_days: dueDay > closingDay ? dueDay - closingDay : (30 - closingDay + dueDay),
        credit_limit: creditLimit > 0 ? creditLimit : null,
      } : {
        closing_day: null,
        due_day: null,
        payment_due_days: null,
        credit_limit: null,
      }),
    };
    if (editing) {
      await updateAccount.mutateAsync({ ...input, id: editing.id });
    } else {
      await createAccount.mutateAsync(input);
    }
    onOpenChange(false);
  };

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setInitialBalance(parseInt(raw || '0', 10) / 100);
  };

  const handleCreditLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setCreditLimit(parseInt(raw || '0', 10) / 100);
  };

  const balanceDisplay = initialBalance
    ? initialBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const creditLimitDisplay = creditLimit
    ? creditLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const footer = (
    <div className="flex justify-end gap-3">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.cancelLabel}</Button>
      <Button type="submit" form="account-form" disabled={!name || createAccount.isPending || updateAccount.isPending}>
        {editing ? t.saveLabel : type === 'cartao' ? t.createCardLabel : t.createAccountLabel}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? (editing.type === 'cartao' ? t.titleEditCard : t.titleEditAccount) : (type === 'cartao' ? t.titleNewCard : t.titleNewAccount)}
      className="sm:max-w-[480px]"
      footer={footer}
    >
      <form id="account-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t.nameLabel}</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder={t.namePlaceholder} required />
        </div>

        <div className="space-y-1.5">
          <Label>{t.typeLabel}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {accountTypes.map(at => <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {(type === 'banco' || type === 'cartao') && (
          <div className="space-y-1.5">
            <Label>{t.institutionLabel}</Label>
            <BankInstitutionCombobox value={institution} onChange={setInstitution} />
          </div>
        )}

        {type === 'cartao' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.closingDayLabel}</Label>
                <Select value={String(closingDay)} onValueChange={v => setClosingDay(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLOSING_DAYS.map(d => <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t.dueDayLabel}</Label>
                <Select value={String(dueDay)} onValueChange={v => setDueDay(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DUE_DAYS.map(d => <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>)}
                  </SelectContent>
                </Select>
                {dueDay <= closingDay && (
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {t.dueDayNextMonth}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t.creditLimitLabel} <span className="text-muted-foreground font-normal">{t.creditLimitOptional}</span></Label>
              <Input
                placeholder="0,00"
                value={creditLimitDisplay}
                onChange={handleCreditLimitChange}
                inputMode="numeric"
              />
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label>{t.initialBalanceLabel}</Label>
            <Input placeholder="0,00" value={balanceDisplay} onChange={handleCurrencyChange} inputMode="numeric" />
            {editing && (
              <p className="text-xs text-muted-foreground">⚠️ {t.initialBalanceEditWarning}</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t.colorLabel}</Label>
          <div className="flex gap-1.5 flex-wrap items-center">
            {ACCOUNT_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={cn(
                  'h-7 w-7 rounded-full border-2 transition-all',
                  color === c ? 'border-foreground scale-110 ring-2 ring-foreground/20' : 'border-transparent'
                )}
                style={{ backgroundColor: c }} aria-label={`Cor ${c}`} />
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-7 w-7 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center text-muted-foreground hover:border-foreground hover:text-foreground transition-all"
                  aria-label={t.customColorLabel}
                >
                  +
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3">
                <div className="space-y-2">
                  <Label className="text-xs">{t.customColorLabel}</Label>
                  <input
                    type="color"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    className="h-10 w-full cursor-pointer rounded border"
                  />
                  <Input value={color} onChange={e => setColor(e.target.value)} className="h-8 text-xs" />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Pré-visualização */}
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t.previewLabel}</Label>
          <Card className="overflow-hidden">
            <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
            <CardContent className="p-3 flex items-center gap-3">
              {institution ? (
                <div className="rounded-lg p-1 shrink-0 bg-white border" style={{ borderColor: color }}>
                  <BankLogo code={institution.code} name={institution.name} size={32} />
                </div>
              ) : (
                <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: color }}>
                  {(() => { const I = getTypeIcon(type); return <I className="h-4 w-4 text-white" />; })()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{name || t.namePlaceholder}</p>
                {institution?.name && <p className="text-xs text-muted-foreground truncate">{institution.name}</p>}
                {type === 'cartao' && closingDay && (
                  <p className="text-xs text-muted-foreground">
                    {t.previewCardSuffix.replace('{closing}', String(closingDay)).replace('{due}', String(dueDay))}{dueDay <= closingDay ? t.previewCardNextMonth : ''}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      </form>
    </ResponsiveModal>
  );
}
