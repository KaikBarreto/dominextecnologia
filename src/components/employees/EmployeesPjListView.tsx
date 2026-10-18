import { FileText, CreditCard, Pencil, Archive } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { cn } from '@/lib/utils';
import { Employee } from '@/hooks/useEmployees';
import { EmployeeContract } from '@/hooks/useEmployeeContracts';
import { getContractVigencia } from '@/utils/contractVigencia';

interface EmployeesPjListViewProps {
  employees: Employee[];
  activeContractsMap: Map<string, EmployeeContract>;
  onEdit: (employee: Employee) => void;
  onArchive: (employee: Employee) => void;
  onPayment: (employee: Employee) => void;
  onExtract: (employee: Employee) => void;
}

const getInitials = (name: string) =>
  name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

/** Badge de vigência saturado + texto branco (régua de UI: nunca outline dessaturado). */
export function ContractVigenciaStatusBadge({ contract, timezone }: { contract: EmployeeContract; timezone: string | null | undefined }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.form.contract.statusBadge;
  const { status, daysUntilEnd } = getContractVigencia(contract.end_date, timezone);
  const label = status === 'active' ? t.active : status === 'expired' ? t.expired : t.expiringSoon.replace('{days}', String(daysUntilEnd ?? 0));
  const colorClass = status === 'active' ? 'bg-emerald-600' : status === 'expired' ? 'bg-red-600' : 'bg-amber-500';
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold text-white whitespace-nowrap', colorClass)}>
      {label}
    </span>
  );
}

/**
 * Visão LISTA (desktop) da aba PJ/MEI: CNPJ, contrato vigente (valor + forma
 * de cobrança) e vigência — em vez de salário/ponto, que não se aplicam.
 */
export function EmployeesPjListView({
  employees,
  activeContractsMap,
  onEdit,
  onArchive,
  onPayment,
  onExtract,
}: EmployeesPjListViewProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees;
  const fmt = (v: number) => formatMoney(v, currency, locale);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wider">{t.pjTab.table.columnProvider}</TableHead>
              <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider">{t.pjTab.table.columnCnpj}</TableHead>
              <TableHead className="hidden lg:table-cell text-xs uppercase tracking-wider text-right">{t.pjTab.table.columnValue}</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">{t.pjTab.table.columnVigencia}</TableHead>
              <TableHead className="w-[60px] text-xs uppercase tracking-wider text-right">{t.pjTab.table.columnActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((emp) => {
              const contract = activeContractsMap.get(emp.id);
              return (
                <TableRow key={emp.id} className="cursor-pointer" onClick={() => onExtract(emp)}>
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 shrink-0">
                        <SignedAvatarImage src={emp.photo_url} alt={emp.name} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {getInitials(emp.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[220px]">{emp.name}</p>
                        {emp.pj_cnpj && (
                          <p className="md:hidden text-xs text-muted-foreground truncate max-w-[220px]">{emp.pj_cnpj}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {emp.pj_cnpj || '—'}
                  </TableCell>

                  <TableCell className="hidden lg:table-cell text-right">
                    {contract ? (
                      <span className="font-medium">
                        {fmt(contract.amount)}
                        <span className="text-xs text-muted-foreground"> {t.pjTab.billingSuffix[contract.billing_type]}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t.pjTab.noContract}</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {contract ? (
                      <ContractVigenciaStatusBadge contract={contract} timezone={timezone} />
                    ) : (
                      <span className="text-muted-foreground text-sm">{t.pjTab.noContract}</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <div onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu
                        actions={[
                          { label: t.actions.extract, icon: FileText, onClick: () => onExtract(emp) },
                          { label: t.actions.payment, icon: CreditCard, onClick: () => onPayment(emp) },
                          { label: t.actions.edit, icon: Pencil, variant: 'edit' as const, onClick: () => onEdit(emp) },
                          { label: t.actions.delete, icon: Archive, variant: 'delete' as const, onClick: () => onArchive(emp) },
                        ]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
