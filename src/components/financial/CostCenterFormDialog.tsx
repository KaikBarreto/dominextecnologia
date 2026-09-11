import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { ColorPicker } from '@/components/ui/ColorPicker';
import type { CostCenter } from '@/hooks/useCostCenters';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const baseSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
});

type FormData = z.infer<typeof baseSchema>;

interface CostCenterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  costCenter?: CostCenter | null;
  onSubmit: (data: FormData) => Promise<void>;
  isLoading?: boolean;
  /** Nome pré-preenchido ao criar (ex.: texto digitado no CostCenterSelect). Só vale na criação. */
  initialName?: string;
}

export function CostCenterFormDialog({ open, onOpenChange, costCenter, onSubmit, isLoading, initialName }: CostCenterFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.costCenterForm;

  const schema = baseSchema.extend({
    name: z.string().min(1, t.validations.nameRequired),
    color: z.string().min(1, t.validations.colorRequired),
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: costCenter?.name ?? initialName ?? '',
      color: costCenter?.color ?? '#6B7280',
      description: costCenter?.description ?? '',
      is_active: costCenter?.is_active ?? true,
    },
  });

  // Resync form ao abrir ou trocar o centro de custo em edição.
  useEffect(() => {
    if (open) {
      form.reset({
        name: costCenter?.name ?? initialName ?? '',
        color: costCenter?.color ?? '#6B7280',
        description: costCenter?.description ?? '',
        is_active: costCenter?.is_active ?? true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, costCenter?.id, initialName]);

  const handleSubmit = async (data: FormData) => {
    await onSubmit(data);
    form.reset();
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={costCenter ? t.titleEdit : t.titleNew}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.cancelLabel}</Button>
          <Button onClick={form.handleSubmit(handleSubmit)} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {costCenter ? t.saveLabel : t.createLabel}
          </Button>
        </div>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.nameLabel}</FormLabel>
              <FormControl><Input placeholder={t.namePlaceholder} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="color" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.colorLabel}</FormLabel>
              <ColorPicker value={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.descriptionLabel}</FormLabel>
              <FormControl>
                <Textarea placeholder={t.descriptionPlaceholder} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="is_active" render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <FormLabel className="mb-0">{t.activeLabel}</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )} />
        </form>
      </Form>
    </ResponsiveModal>
  );
}
