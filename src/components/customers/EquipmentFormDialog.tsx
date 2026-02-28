import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { Equipment, Customer } from '@/types/database';

const equipmentSchema = z.object({
  customer_id: z.string().min(1, 'Selecione um cliente'),
  name: z.string().min(1, 'Nome é obrigatório'),
  brand: z.string().optional(),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  capacity: z.string().optional(),
  location: z.string().optional(),
  install_date: z.string().optional(),
  notes: z.string().optional(),
});

type EquipmentFormData = z.infer<typeof equipmentSchema>;

interface EquipmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment?: (Equipment & { customer?: any }) | null;
  onSubmit: (data: EquipmentFormData) => Promise<void>;
  customers: Customer[];
  isLoading?: boolean;
}

export function EquipmentFormDialog({
  open, onOpenChange, equipment, onSubmit, customers, isLoading,
}: EquipmentFormDialogProps) {
  const form = useForm<EquipmentFormData>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: {
      customer_id: equipment?.customer_id ?? '',
      name: equipment?.name ?? '',
      brand: equipment?.brand ?? '',
      model: equipment?.model ?? '',
      serial_number: equipment?.serial_number ?? '',
      capacity: equipment?.capacity ?? '',
      location: equipment?.location ?? '',
      install_date: equipment?.install_date ?? '',
      notes: equipment?.notes ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        customer_id: equipment?.customer_id ?? '',
        name: equipment?.name ?? '',
        brand: equipment?.brand ?? '',
        model: equipment?.model ?? '',
        serial_number: equipment?.serial_number ?? '',
        capacity: equipment?.capacity ?? '',
        location: equipment?.location ?? '',
        install_date: equipment?.install_date ?? '',
        notes: equipment?.notes ?? '',
      });
    }
  }, [open, equipment]);

  const handleSubmit = async (data: EquipmentFormData) => {
    await onSubmit(data);
    form.reset();
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={equipment ? 'Editar Equipamento' : 'Novo Equipamento'}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Cliente *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o cliente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl><Input placeholder="Ex: Split 12.000 BTUs" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca</FormLabel>
                  <FormControl><Input placeholder="Ex: Samsung" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modelo</FormLabel>
                  <FormControl><Input placeholder="Modelo" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="serial_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nº de Série</FormLabel>
                  <FormControl><Input placeholder="Número de série" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capacidade</FormLabel>
                  <FormControl><Input placeholder="Ex: 12.000 BTUs" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Local</FormLabel>
                  <FormControl><Input placeholder="Ex: Sala 202" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="install_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Instalação</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Observações</FormLabel>
                  <FormControl><Textarea placeholder="Observações" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {equipment ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </Form>
    </ResponsiveModal>
  );
}
