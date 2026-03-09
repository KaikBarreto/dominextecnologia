import { useState, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFinancial, type TransactionInput } from '@/hooks/useFinancial';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { addMonths, addWeeks, addYears, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import type { TransactionType } from '@/types/database';
import { useEmployees } from '@/hooks/useEmployees';
import { useContracts } from '@/hooks/useContracts';

interface ContaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: TransactionType;
}

type Recurrence = 'unica' | 'mensal' | 'semanal' | 'anual';

export function ContaFormDialog({ open, onOpenChange, defaultType = 'saida' }: ContaFormDialogProps) {
  const { createTransaction } = useFinancial();
  const { employees } = useEmployees();
  const { contracts } = useContracts();
  const [tipo, setTipo] = useState<TransactionType>(defaultType);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [dueDate, setDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [recurrence, setRecurrence] = useState<Recurrence>('mensal');
  const [occurrences, setOccurrences] = useState(12);
  const [notes, setNotes] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [contractId, setContractId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['financial-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTipo(defaultType);
      setDescription('');
      setAmount('');
      setCategory('');
      setDueDate(format(new Date(), 'yyyy-MM-dd'));
      setRecurrence('mensal');
      setOccurrences(12);
      setNotes('');
      setEmployeeId('');
      setContractId('');
    }
  }, [open, defaultType]);

  const filteredCategories = categories.filter(
    (c) => c.type === 'ambos' || (tipo === 'entrada' ? c.type === 'receita' : c.type === 'despesa')
  );

  const categoryOptions = filteredCategories.map((c) => ({ value: c.name, label: c.name }));

  // Show employee selector for salary-related categories
  const isSalaryCategory = category.toLowerCase().includes('salário') || category.toLowerCase().includes('salario');
  
  // Show contract selector for receivables or contract-related categories
  const isContractCategory = category.toLowerCase().includes('contrato');
  const showContractSelector = tipo === 'entrada' || isContractCategory;

  const activeEmployees = employees.filter(e => e.is_active);
  const employeeOptions = activeEmployees.map(e => ({ value: e.id, label: e.name }));
  
  const activeContracts = (contracts || []).filter((c: any) => c.status === 'active');
  const contractOptions = activeContracts.map((c: any) => ({
    value: c.id,
    label: `${c.name} - ${c.customer?.name || 'Sem cliente'}`,
  }));

  const handleSubmit = async () => {
    if (!description.trim() || !amount || Number(amount) <= 0) return;
    setIsSubmitting(true);

    try {
      const baseDate = new Date(dueDate + 'T12:00:00');
      const count = recurrence === 'unica' ? 1 : occurrences;

      for (let i = 0; i < count; i++) {
        let date: Date;
        switch (recurrence) {
          case 'semanal': date = addWeeks(baseDate, i); break;
          case 'mensal': date = addMonths(baseDate, i); break;
          case 'anual': date = addYears(baseDate, i); break;
          default: date = baseDate;
        }

        const input: TransactionInput = {
          transaction_type: tipo,
          description: count > 1 ? `${description} (${i + 1}/${count})` : description,
          amount: Number(amount),
          transaction_date: format(date, 'yyyy-MM-dd'),
          due_date: format(date, 'yyyy-MM-dd'),
          is_paid: false,
          category: category || undefined,
          notes: [
            notes,
            employeeId && isSalaryCategory ? `[funcionario:${employeeId}]` : '',
            contractId && showContractSelector ? `[contrato:${contractId}]` : '',
          ].filter(Boolean).join(' ') || undefined,
          contract_id: contractId && showContractSelector ? contractId : undefined,
        };

        await createTransaction.mutateAsync(input);
      }

      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Nova Conta"
      className="sm:max-w-lg"
    >
      <p className="text-sm text-muted-foreground -mt-2 mb-4">
        Crie uma conta a {tipo === 'saida' ? 'pagar' : 'receber'}, com opção de recorrência.
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={(v) => { setTipo(v as TransactionType); setCategory(''); setEmployeeId(''); setContractId(''); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="saida">A Pagar</SelectItem>
              <SelectItem value="entrada">A Receber</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Descrição *</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Aluguel do escritório" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Valor (R$) *</Label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Vencimento</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <SearchableSelect
            options={categoryOptions}
            value={category}
            onValueChange={(v) => { setCategory(v); setEmployeeId(''); setContractId(''); }}
            placeholder="Selecione uma categoria"
          />
        </div>

        {/* Employee selector for salary categories */}
        {isSalaryCategory && tipo === 'saida' && (
          <div className="space-y-1.5">
            <Label>Funcionário vinculado</Label>
            <SearchableSelect
              options={employeeOptions}
              value={employeeId}
              onValueChange={setEmployeeId}
              placeholder="Selecione um funcionário"
            />
          </div>
        )}

        {/* Contract selector for receivables */}
        {showContractSelector && (
          <div className="space-y-1.5">
            <Label>Contrato vinculado</Label>
            <SearchableSelect
              options={contractOptions}
              value={contractId}
              onValueChange={setContractId}
              placeholder="Selecione um contrato (opcional)"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Recorrência</Label>
            <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unica">Única</SelectItem>
                <SelectItem value="semanal">Semanal</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {recurrence !== 'unica' && (
            <div className="space-y-1.5">
              <Label>Parcelas</Label>
              <Input type="number" min={2} max={60} value={occurrences} onChange={(e) => setOccurrences(Number(e.target.value) || 2)} />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Observações</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notas internas" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !description.trim() || !amount}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</> : 'Criar Conta'}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
