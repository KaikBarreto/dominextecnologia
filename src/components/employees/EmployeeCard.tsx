import { useState } from 'react';
import { Phone, Calendar, Edit, Trash2, FileText, Banknote, Gift, CreditCard, Link2, Minus, Award, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Employee } from '@/hooks/useEmployees';
import { BalanceSummary } from '@/utils/employeeCalculations';
import { format } from 'date-fns';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';

interface EmployeeCardProps {
  employee: Employee;
  balance: BalanceSummary;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteWithUser?: () => void;
  onMovement: (type: 'vale' | 'bonus' | 'falta') => void;
  onPayment: () => void;
  onExtract: () => void;

}

export function EmployeeCard({ employee, balance, onEdit, onDelete, onDeleteWithUser, onMovement, onPayment, onExtract }: EmployeeCardProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const initials = employee.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const previewUrl = useSignedUrl(employee.photo_url);
  const hasPontoLink = employee.ponto_enabled && !!employee.ponto_slug;

  const copyPontoLink = async () => {
    if (!employee.ponto_slug) return;
    const link = `${window.location.origin}/ponto/${employee.ponto_slug}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Link gerado e copiado!', description: link });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível copiar', description: link });
    }
  };

  return (
    <Card className="overflow-hidden p-3 hover:shadow-md transition-shadow">
      <div className="flex flex-col gap-2.5">
        {/* Header: avatar + nome/cargo + ações */}
        <div className="flex items-start gap-2.5">
          <div
            className="shrink-0 cursor-pointer"
            onClick={() => employee.photo_url && setPhotoPreviewOpen(true)}
          >
            <Avatar className="h-11 w-11">
              <SignedAvatarImage src={employee.photo_url} />
              <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">{initials}</AvatarFallback>
            </Avatar>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm truncate leading-tight">{employee.name}</h3>
            {employee.position && <p className="text-xs text-muted-foreground truncate">{employee.position}</p>}
            <p className="text-xs font-semibold mt-0.5">{fmt(employee.salary)}</p>
          </div>
          <div className="flex gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-warning hover:text-warning-foreground group"
              onClick={onEdit}
              title="Editar"
            >
              <Edit className="h-3.5 w-3.5 text-warning group-hover:text-warning-foreground" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground group"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive group-hover:text-destructive-foreground" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir funcionário?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {employee.user_id
                      ? 'Este funcionário está vinculado a um usuário do sistema. Deseja excluir o usuário também? Isso liberará o email para reutilização.'
                      : 'Todos os dados e movimentações serão perdidos.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  {employee.user_id && onDeleteWithUser && (
                    <AlertDialogAction
                      onClick={onDeleteWithUser}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir ambos
                    </AlertDialogAction>
                  )}
                  <AlertDialogAction onClick={onDelete}>
                    {employee.user_id ? 'Só o funcionário' : 'Excluir'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Bloco financeiro: vales / bônus / faltas + saldo atual */}
        <div className="rounded-md border bg-muted/30 px-2.5 pt-3 pb-2.5">
          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <div className="flex flex-col">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Minus className="h-3 w-3 text-red-600 dark:text-red-400" /> Vales
              </span>
              <span className="font-semibold text-red-600 dark:text-red-400">{fmt(balance.totalVales)}</span>
            </div>
            <div className="flex flex-col">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Award className="h-3 w-3 text-amber-500 dark:text-amber-400" /> Bônus
              </span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{fmt(balance.totalBonus)}</span>
            </div>
            <div className="flex flex-col">
              <span className="flex items-center gap-1 text-muted-foreground">
                <XCircle className="h-3 w-3 text-orange-600 dark:text-orange-400" /> Faltas
              </span>
              <span className="font-semibold text-orange-600 dark:text-orange-400">{fmt(balance.totalFaltas)}</span>
            </div>
          </div>
          <div className="border-t mt-2 pt-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo atual</div>
            <div className={`text-base font-bold tracking-tight ${balance.currentBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {fmt(balance.currentBalance)}
            </div>
          </div>
        </div>

        {/* Contato compacto */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {employee.phone && (
            <span className="flex items-center gap-1 min-w-0">
              <Phone className="h-3 w-3 shrink-0" /><span className="truncate">{employee.phone}</span>
            </span>
          )}
          {hasPontoLink && (
            <button
              type="button"
              onClick={copyPontoLink}
              className="flex items-center gap-1 text-primary hover:underline font-medium"
              title="Copiar link do ponto do funcionário"
            >
              <Link2 className="h-3 w-3 shrink-0" />
              <span>Link do ponto</span>
              <span className="opacity-70">· Copiar</span>
            </button>
          )}
          {employee.hire_date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" />Admissão: {format(new Date(employee.hire_date + 'T12:00:00'), 'dd/MM/yyyy')}
            </span>
          )}
        </div>

        {/* Ações: grid 2-col */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5 border-t mt-0.5">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 hover:bg-red-600 hover:text-white hover:border-red-600" onClick={() => onMovement('vale')}>
            <Banknote className="h-3.5 w-3.5" /> Vale
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 hover:bg-amber-500 hover:text-white hover:border-amber-500" onClick={() => onMovement('bonus')}>
            <Gift className="h-3.5 w-3.5" /> Bônus
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 hover:bg-orange-500 hover:text-white hover:border-orange-500" onClick={() => onMovement('falta')}>
            <XCircle className="h-3.5 w-3.5" /> Falta
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 hover:bg-green-600 hover:text-white hover:border-green-600" onClick={onPayment}>
            <CreditCard className="h-3.5 w-3.5" /> Pagamento
          </Button>
        </div>

        <Button
          size="sm"
          className={`h-8 w-full gap-1.5 text-xs ${
            isMobile
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-gradient-to-r from-gray-900 to-gray-700 hover:from-gray-800 hover:to-gray-600 text-white dark:from-primary dark:to-primary dark:text-primary-foreground dark:hover:from-primary/90 dark:hover:to-primary/90'
          }`}
          onClick={onExtract}
        >
          <FileText className="h-3.5 w-3.5" /> Ver Extrato
        </Button>
      </div>

      <ImagePreviewModal
        src={previewUrl || ''}
        alt={employee.name}
        open={photoPreviewOpen}
        onClose={() => setPhotoPreviewOpen(false)}
      />
    </Card>
  );
}
