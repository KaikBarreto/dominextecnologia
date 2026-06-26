import { Phone, FileText, Banknote, Gift, AlertCircle, CreditCard, Pencil, Trash2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { cn } from '@/lib/utils';
import { Employee } from '@/hooks/useEmployees';
import { BalanceSummary } from '@/utils/employeeCalculations';

interface EmployeesListViewProps {
  employees: Employee[];
  /** Saldo calculado por funcionário (id → BalanceSummary). */
  balanceMap: Map<string, BalanceSummary>;
  onEdit: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
  onMovement: (employee: Employee, type: 'vale' | 'bonus' | 'falta') => void;
  onPayment: (employee: Employee) => void;
  onExtract: (employee: Employee) => void;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const getInitials = (name: string) =>
  name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

/**
 * Visão LISTA (desktop) da tela de Funcionários.
 *
 * Tabela limpa: 1 borda externa + linhas por divisor (padrão Dominex de listas).
 * Saldo é um selo de STATUS saturado (emerald/red + texto branco). Ações pelo
 * RowActionsMenu (editar = warning, excluir = destructive — cores semânticas
 * fixas do Dominex). Vale ≠ Bônus: ações separadas, sem simetrizar.
 *
 * Inspirado na lista da Eco (avatar+nome, cargo, telefone, salário, saldo,
 * ações), mas adaptado ao schema/semântica/design-system do Dominex.
 */
export function EmployeesListView({
  employees,
  balanceMap,
  onEdit,
  onDelete,
  onMovement,
  onPayment,
  onExtract,
}: EmployeesListViewProps) {
  const { toast } = useToast();

  const copyPontoLink = async (slug: string) => {
    const link = `${window.location.origin}/ponto/${slug}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Link gerado e copiado!', description: link });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível copiar', description: link });
    }
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wider">Funcionário</TableHead>
              <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider">Cargo</TableHead>
              <TableHead className="hidden lg:table-cell text-xs uppercase tracking-wider">Contato</TableHead>
              <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider text-right">Salário</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-right">Saldo</TableHead>
              <TableHead className="w-[60px] text-xs uppercase tracking-wider text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((emp) => {
              const balance = balanceMap.get(emp.id);
              const saldo = balance?.currentBalance ?? 0;
              const saldoPositive = saldo >= 0;
              const hasPontoLink = emp.ponto_enabled && !!emp.ponto_slug;

              return (
                <TableRow
                  key={emp.id}
                  className="cursor-pointer"
                  onClick={() => onExtract(emp)}
                >
                  {/* Funcionário: avatar + nome */}
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
                        {/* Cargo aparece aqui no breakpoint que esconde a coluna própria */}
                        {emp.position && (
                          <p className="md:hidden text-xs text-muted-foreground truncate max-w-[220px]">
                            {emp.position}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Cargo */}
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {emp.position || '—'}
                  </TableCell>

                  {/* Contato */}
                  <TableCell className="hidden lg:table-cell">
                    {emp.phone ? (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        {emp.phone}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Salário */}
                  <TableCell className="hidden sm:table-cell text-right font-medium">
                    {fmt(emp.salary || 0)}
                  </TableCell>

                  {/* Saldo — selo de status saturado + texto branco */}
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold text-white whitespace-nowrap',
                        saldoPositive ? 'bg-emerald-600' : 'bg-red-600',
                      )}
                    >
                      {fmt(saldo)}
                    </span>
                  </TableCell>

                  {/* Ações */}
                  <TableCell className="text-right">
                    <div onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu
                        actions={[
                          {
                            label: 'Extrato',
                            icon: FileText,
                            onClick: () => onExtract(emp),
                          },
                          {
                            label: 'Vale',
                            icon: Banknote,
                            onClick: () => onMovement(emp, 'vale'),
                          },
                          {
                            label: 'Bônus',
                            icon: Gift,
                            onClick: () => onMovement(emp, 'bonus'),
                          },
                          {
                            label: 'Falta',
                            icon: AlertCircle,
                            onClick: () => onMovement(emp, 'falta'),
                          },
                          {
                            label: 'Pagamento',
                            icon: CreditCard,
                            onClick: () => onPayment(emp),
                          },
                          ...(hasPontoLink
                            ? [{
                                label: 'Link do ponto',
                                icon: Clock,
                                onClick: () => copyPontoLink(emp.ponto_slug!),
                              }]
                            : []),
                          {
                            label: 'Editar',
                            icon: Pencil,
                            variant: 'edit' as const,
                            onClick: () => onEdit(emp),
                          },
                          {
                            label: 'Excluir',
                            icon: Trash2,
                            variant: 'delete' as const,
                            onClick: () => onDelete(emp),
                          },
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
