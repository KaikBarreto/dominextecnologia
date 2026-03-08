import { useState, useRef } from 'react';
import { Phone, Mail, MapPin, Calendar, Edit, Trash2, FileText, Banknote, Gift, AlertCircle, CreditCard, Camera } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Employee } from '@/hooks/useEmployees';
import { BalanceSummary } from '@/utils/employeeCalculations';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { processImageFile } from '@/utils/imageConvert';

interface EmployeeCardProps {
  employee: Employee;
  balance: BalanceSummary;
  onEdit: () => void;
  onDelete: () => void;
  onMovement: (type: 'vale' | 'bonus' | 'falta') => void;
  onPayment: () => void;
  onExtract: () => void;
  onUpdatePhoto?: (url: string) => void;
}

export function EmployeeCard({ employee, balance, onEdit, onDelete, onMovement, onPayment, onExtract, onUpdatePhoto }: EmployeeCardProps) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const initials = employee.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file || !onUpdatePhoto) return;
    file = await processImageFile(file);

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${employee.id}/photo.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('employee-photos')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('employee-photos')
        .getPublicUrl(path);

      onUpdatePhoto(publicUrl + '?t=' + Date.now());
      toast({ title: 'Foto atualizada!' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao enviar foto', description: err.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div 
            className="relative group cursor-pointer shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <Avatar className="h-12 w-12">
              <AvatarImage src={employee.photo_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-4 w-4 text-white" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
              disabled={uploading}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm truncate">{employee.name}</h3>
                {employee.position && <p className="text-xs text-muted-foreground">{employee.position}</p>}
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
                      <AlertDialogDescription>Todos os dados e movimentações serão perdidos.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-semibold">{fmt(employee.salary)}</span>
              <Badge variant={balance.currentBalance >= 0 ? 'default' : 'destructive'} className="text-[10px]">
                Saldo: {fmt(balance.currentBalance)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="space-y-1 text-xs text-muted-foreground">
          {employee.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{employee.phone}</p>}
          {employee.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{employee.email}</p>}
          {employee.address && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{employee.address}</p>}
          {employee.hire_date && <p className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />Admissão: {format(new Date(employee.hire_date + 'T12:00:00'), 'dd/MM/yyyy')}</p>}
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
      </CardContent>
    </Card>
  );
}
