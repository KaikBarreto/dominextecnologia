import {
  Archive,
  ArrowLeft,
  Banknote,
  Clock,
  CreditCard,
  FileText,
  Gift,
  Link2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  UserRound,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmployeePhotoAvatar } from '@/components/employees/EmployeePhotoAvatar';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDate, formatMoney } from '@/lib/format';
import type { Employee } from '@/hooks/useEmployees';
import type { BalanceSummary } from '@/utils/employeeCalculations';
import { cn } from '@/lib/utils';

interface EmployeeListDetailProps {
  employee: Employee;
  balance: BalanceSummary;
  onBack?: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onMovement: (type: 'vale' | 'bonus' | 'falta') => void;
  onPayment: () => void;
  onExtract: () => void;
  onCopyTimeclockLink: () => void;
}

function DetailRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-start justify-end gap-1.5 text-right text-sm font-medium">
        {icon && <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>}
        <span className="min-w-0 break-words">{value || '—'}</span>
      </dd>
    </div>
  );
}

/**
 * Ficha plana usada pelo master-detail de Funcionários.
 *
 * Não consulta nem recalcula dados: recebe o funcionário e o mesmo saldo já
 * calculado pela página. Assim, a troca visual não cria uma segunda fonte para
 * valores de folha/movimentações nem contorna as permissões existentes.
 */
export function EmployeeListDetail({
  employee,
  balance,
  onBack,
  onEdit,
  onArchive,
  onMovement,
  onPayment,
  onExtract,
  onCopyTimeclockLink,
}: EmployeeListDetailProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees;
  const common = MESSAGES[locale].app.common;
  const fmt = (value: number) => formatMoney(value, currency, locale);
  const regimeLabel = t.form.clt.regimeOptions[employee.employment_regime];

  return (
    <div className="min-w-0">
      {onBack && (
        <Button type="button" variant="ghost" className="mb-3 -ml-3 gap-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {common.back}
        </Button>
      )}

      <header className="flex flex-col gap-4 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-start sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <EmployeePhotoAvatar
            name={employee.name}
            src={employee.photo_url}
            className="h-16 w-16 shrink-0"
            fallbackClassName="bg-primary text-lg font-semibold text-primary-foreground"
          />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight">{employee.name}</h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {employee.position || '—'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{regimeLabel}</Badge>
              {employee.ponto_enabled && (
                <Badge variant="default" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {t.tabs.timeclock}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            {t.actions.edit}
          </Button>
          <Button type="button" size="sm" className="gap-2" onClick={onExtract}>
            <FileText className="h-4 w-4" />
            {t.actions.extract}
          </Button>
          <Button type="button" variant="destructive-ghost" size="sm" className="gap-2" onClick={onArchive}>
            <Archive className="h-4 w-4" />
            {t.actions.delete}
          </Button>
        </div>
      </header>

      <section className="border-b border-border/60 px-4 py-3 sm:px-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.listDetail.movements}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => onMovement('vale')}>
            <Banknote className="h-4 w-4" /> {t.actions.advance}
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => onMovement('bonus')}>
            <Gift className="h-4 w-4" /> {t.actions.bonus}
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => onMovement('falta')}>
            <XCircle className="h-4 w-4" /> {t.actions.absence}
          </Button>
          <Button type="button" size="sm" className="gap-2" onClick={onPayment}>
            <CreditCard className="h-4 w-4" /> {t.actions.payment}
          </Button>
          {employee.ponto_enabled && employee.ponto_slug && (
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onCopyTimeclockLink}>
              <Link2 className="h-4 w-4" /> {t.actions.timeclockLink}
            </Button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 border-b border-border/60 lg:grid-cols-3">
        {[
            { label: t.paymentModal.summary.salary, value: fmt(employee.salary || 0) },
            {
              label: t.card.currentBalance,
              value: fmt(balance.currentBalance),
              tone: balance.currentBalance < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400',
            },
            { label: t.card.advances, value: fmt(balance.totalVales), tone: 'text-red-600 dark:text-red-400' },
            { label: t.card.bonus, value: fmt(balance.totalBonus), tone: 'text-amber-600 dark:text-amber-400' },
            { label: t.card.absences, value: fmt(balance.totalFaltas), tone: 'text-orange-600 dark:text-orange-400' },
            { label: t.actions.payment, value: fmt(balance.totalPagamentos) },
        ].map((item, index) => (
          <div
            key={item.label}
            className={cn(
              'min-w-0 px-4 py-4 sm:px-6',
              index < 4 && 'border-b border-border/60',
              index < 3 ? 'lg:border-b lg:border-border/60' : 'lg:border-b-0',
              index % 2 === 1 && 'border-l border-border/60',
              index % 3 === 0 ? 'lg:border-l-0' : 'lg:border-l lg:border-border/60',
            )}
          >
            <dt className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</dt>
            <dd className={cn('mt-1 truncate font-semibold tabular-nums', item.tone)}>{item.value}</dd>
          </div>
        ))}
      </section>

      <div className="grid border-b border-border/60 lg:grid-cols-2 lg:divide-x lg:divide-border/60">
        <section className="px-4 py-5 sm:px-6">
          <h3 className="text-sm font-semibold">{t.form.clt.sectionTitle}</h3>
          <dl className="mt-3 divide-y divide-border/60">
            <DetailRow label={t.form.fields.hireDate} value={employee.hire_date ? formatDate(employee.hire_date, locale, timezone) : null} />
            <DetailRow label={t.form.clt.regimeLabel} value={regimeLabel} />
            <DetailRow label={t.form.clt.matriculaLabel} value={employee.matricula} />
            <DetailRow label={t.form.clt.cboLabel} value={employee.cbo} />
            <DetailRow label={t.form.fields.cpf} value={employee.cpf} icon={<UserRound className="h-4 w-4" />} />
            <DetailRow label={t.form.fields.pixKey} value={employee.pix_key} />
          </dl>
        </section>

        <section className="border-t border-border/60 px-4 py-5 sm:px-6 lg:border-t-0">
          <h3 className="text-sm font-semibold">{t.form.tabData}</h3>
          <dl className="mt-3 divide-y divide-border/60">
            <DetailRow label={t.form.fields.phone} value={employee.phone} icon={<Phone className="h-4 w-4" />} />
            <DetailRow label={t.form.fields.email} value={employee.email} icon={<Mail className="h-4 w-4" />} />
            <DetailRow label={t.form.fields.address} value={employee.address} icon={<MapPin className="h-4 w-4" />} />
          </dl>
        </section>
      </div>

    </div>
  );
}
