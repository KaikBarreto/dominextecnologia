import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { recurringDurationLabel, type AffiliateWithMetrics } from '@/hooks/useAffiliateData';

interface AffiliatePerformanceTableProps {
  affiliates: AffiliateWithMetrics[];
  onEdit: (affiliate: AffiliateWithMetrics) => void;
  onDelete: (id: string) => void;
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtPct = (v: number | null | undefined) =>
  `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export function AffiliatePerformanceTable({ affiliates, onEdit, onDelete }: AffiliatePerformanceTableProps) {
  const navigate = useNavigate();
  const goToDetail = (a: AffiliateWithMetrics) => navigate(`/admin/afiliados/${a.slug || a.id}`);

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead>Afiliado</TableHead>
            <TableHead className="text-center">Clientes</TableHead>
            <TableHead className="text-center">% 1ª venda</TableHead>
            <TableHead className="text-center">% Recorrente</TableHead>
            <TableHead>Duração</TableHead>
            <TableHead className="text-right">Saldo Pendente</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {affiliates.map((a) => (
            <TableRow
              key={a.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => goToDetail(a)}
            >
              <TableCell className="font-medium">
                <div className="min-w-0 max-w-[220px]">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate">{a.name}</p>
                    {/* Quem já foi convidado: `affiliates.user_id` preenchido =
                        tem login próprio. Selo saturado com ícone branco (sem
                        círculo dessaturado atrás), pro CEO ver de relance quem
                        ainda falta convidar. */}
                    {a.user_id && (
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success"
                        title="Tem acesso ao sistema"
                        aria-label="Tem acesso ao sistema"
                      >
                        <KeyRound className="h-3 w-3 text-white" />
                      </span>
                    )}
                  </div>
                  {a.email && <p className="text-xs font-normal text-muted-foreground truncate">{a.email}</p>}
                </div>
              </TableCell>
              <TableCell className="text-center">{a.client_count}</TableCell>
              <TableCell className="text-center">{fmtPct(a.first_payment_pct)}</TableCell>
              <TableCell className="text-center">{fmtPct(a.recurring_pct)}</TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {recurringDurationLabel(a.recurring_months)}
              </TableCell>
              <TableCell
                className={`text-right font-medium whitespace-nowrap ${
                  a.pending_balance > 0 ? 'text-emerald-600' : ''
                }`}
              >
                {brl(a.pending_balance)}
              </TableCell>
              <TableCell>
                <Badge variant={a.is_active ? 'success' : 'muted'}>
                  {a.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => goToDetail(a)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="edit-ghost" size="sm" onClick={() => onEdit(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="destructive-ghost" size="sm" onClick={() => onDelete(a.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
