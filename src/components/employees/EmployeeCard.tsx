import { useState } from 'react';
import { Phone, Mail, MapPin, Calendar, Edit, Trash2, FileText, Banknote, Gift, AlertCircle, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const initials = employee.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div 
            className="shrink-0 cursor-pointer"
            onClick={() => employee.photo_url && setPhotoPreviewOpen(true)}
          >
            <Avatar className="h-12 w-12">
              <AvatarImage src={employee.photo_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground font-bold">{initials}</AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-sm truncate">{employee.name}</h3>
                {employee.position && <p className="text-xs text-muted-foreground truncate">{employee.position}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}><Edit className="h-3.5 w-3.5" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
              <span className="text-sm font-semibold">{fmt(employee.salary)}</span>
              <Badge variant={balance.currentBalance >= 0 ? 'default' : 'destructive'} className="text-[10px]">
                Saldo: {fmt(balance.currentBalance)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="space-y-1 text-xs text-muted-foreground overflow-hidden">
          {employee.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" /><span className="truncate">{employee.phone}</span></p>}
          {employee.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{employee.email}</span></p>}
          {employee.address && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{employee.address}</span></p>}
          {employee.hire_date && <p className="flex items-center gap-1.5"><Calendar className="h-3 w-3 shrink-0" />Admissão: {format(new Date(employee.hire_date + 'T12:00:00'), 'dd/MM/yyyy')}</p>}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onMovement('vale')}>
            <Banknote className="h-3 w-3" /> Vale
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onMovement('bonus')}>
            <Gift className="h-3 w-3" /> Bônus
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onMovement('falta')}>
            <AlertCircle className="h-3 w-3" /> Falta
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onPayment}>
            <CreditCard className="h-3 w-3" /> Pagamento
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1 ml-auto" onClick={onExtract}>
            <FileText className="h-3 w-3" /> Extrato
          </Button>
        </div>
        <ImagePreviewModal
          src={employee.photo_url || ''}
          alt={employee.name}
          open={photoPreviewOpen}
          onClose={() => setPhotoPreviewOpen(false)}
        />
      </CardContent>
    </Card>
  );
}
