import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipment } from '@/hooks/useEquipment';
import { useTechnicians } from '@/hooks/useProfiles';
import type { ServiceOrder, OsType } from '@/types/database';
import { osTypeLabels } from '@/types/database';

const serviceOrderSchema = z.object({
  customer_id: z.string().min(1, 'Selecione um cliente'),
  equipment_id: z.string().optional(),
  technician_id: z.string().optional(),
  os_type: z.enum(['manutencao_preventiva', 'manutencao_corretiva', 'instalacao', 'visita_tecnica']),
  scheduled_date: z.string().optional(),
  scheduled_time: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

type ServiceOrderFormData = z.infer<typeof serviceOrderSchema>;

interface ServiceOrderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrder?: ServiceOrder | null;
  onSubmit: (data: ServiceOrderFormData) => Promise<void>;
  isLoading?: boolean;
}

export function ServiceOrderFormDialog({
  open,
  onOpenChange,
  serviceOrder,
  onSubmit,
  isLoading,
}: ServiceOrderFormDialogProps) {
  const { customers } = useCustomers();
  const { data: technicians } = useTechnicians();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(
    serviceOrder?.customer_id
  );
  const { equipment } = useEquipment(selectedCustomerId);

  const form = useForm<ServiceOrderFormData>({
    resolver: zodResolver(serviceOrderSchema),
    defaultValues: {
      customer_id: serviceOrder?.customer_id ?? '',
      equipment_id: serviceOrder?.equipment_id ?? '',
      technician_id: serviceOrder?.technician_id ?? '',
      os_type: (serviceOrder?.os_type as OsType) ?? 'manutencao_corretiva',
      scheduled_date: serviceOrder?.scheduled_date ?? '',
      scheduled_time: serviceOrder?.scheduled_time ?? '',
      description: serviceOrder?.description ?? '',
      notes: serviceOrder?.notes ?? '',
    },
  });

  const handleSubmit = async (data: ServiceOrderFormData) => {
    // Clean empty strings
    const cleanedData = {
      ...data,
      equipment_id: data.equipment_id || undefined,
      technician_id: data.technician_id || undefined,
      scheduled_date: data.scheduled_date || undefined,
      scheduled_time: data.scheduled_time || undefined,
    };
    await onSubmit(cleanedData);
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {serviceOrder ? 'Editar OS' : 'Nova Ordem de Serviço'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Cliente *</FormLabel>
                    <Select 
                      onValueChange={(value) => {
                        field.onChange(value);
                        setSelectedCustomerId(value);
                        form.setValue('equipment_id', '');
                      }} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o cliente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="equipment_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equipamento</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {equipment.map((eq) => (
                          <SelectItem key={eq.id} value={eq.id}>
                            {eq.name} {eq.model && `- ${eq.model}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="technician_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Técnico</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {technicians?.map((tech) => (
                          <SelectItem key={tech.user_id} value={tech.user_id}>
                            {tech.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="os_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de OS</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(osTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="scheduled_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Agendada</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="scheduled_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Horário</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Descrição do Serviço</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Descreva o serviço a ser realizado" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Textarea placeholder="Observações adicionais" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {serviceOrder ? 'Salvar' : 'Criar OS'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
