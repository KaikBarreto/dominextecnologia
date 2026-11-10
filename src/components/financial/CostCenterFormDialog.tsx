import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Ban } from 'lucide-react';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { CATEGORY_ICONS, type CategoryIconKey } from './categoryIcons';
import type { CostCenter } from '@/hooks/useCostCenters';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

const baseSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  /** `null` = sem ícone (o consumidor decide qual fallback visual usar). */
  icon: z.string().nullable().default(null),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
});

export type CostCenterFormData = z.infer<typeof baseSchema>;

interface CostCenterFormProps {
  costCenter?: CostCenter | null;
  onSubmit: (data: CostCenterFormData) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  initialName?: string;
  formId?: string;
  showActions?: boolean;
  readOnly?: boolean;
  className?: string;
}

/**
 * Formulário reutilizável de centro de custo.
 *
 * Na tela de configurações ele é renderizado diretamente no detalhe. O modal
 * continua existindo somente no seletor rápido usado por lançamentos, sem
 * manter duas implementações dos mesmos campos e validações.
 */
export function CostCenterForm({
  costCenter,
  onSubmit,
  onCancel,
  isLoading = false,
  initialName,
  formId,
  showActions = true,
  readOnly = false,
  className,
}: CostCenterFormProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.costCenterForm;

  const schema = baseSchema.extend({
    name: z.string().min(1, t.validations.nameRequired),
    color: z.string().min(1, t.validations.colorRequired),
  });

  const form = useForm<CostCenterFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: costCenter?.name ?? initialName ?? '',
      color: costCenter?.color ?? '#6B7280',
      icon: costCenter?.icon ?? null,
      description: costCenter?.description ?? '',
      is_active: costCenter?.is_active ?? true,
    },
  });

  useEffect(() => {
    form.reset({
      name: costCenter?.name ?? initialName ?? '',
      color: costCenter?.color ?? '#6B7280',
      icon: costCenter?.icon ?? null,
      description: costCenter?.description ?? '',
      is_active: costCenter?.is_active ?? true,
    });
  }, [costCenter, form, initialName]);

  const selectedColor = form.watch('color');
  const iconKeys = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];

  const handleSubmit = async (data: CostCenterFormData) => {
    await onSubmit(data);
  };

  return (
    <Form {...form}>
      <form
        id={formId}
        onSubmit={form.handleSubmit(handleSubmit)}
        className={cn('space-y-5', className)}
      >
        <div className="grid gap-5 xl:grid-cols-2">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem className="xl:col-span-2">
              <FormLabel>{t.nameLabel}</FormLabel>
              <FormControl>
                <Input placeholder={t.namePlaceholder} disabled={readOnly || isLoading} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="color" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.colorLabel}</FormLabel>
              {readOnly ? (
                <div className="flex h-10 items-center gap-2.5 text-sm">
                  <span className="h-6 w-6 rounded-md border border-border" style={{ backgroundColor: field.value }} />
                  <span className="font-mono uppercase">{field.value}</span>
                </div>
              ) : (
                <ColorPicker value={field.value} onChange={field.onChange} />
              )}
              <FormMessage />
            </FormItem>
          )} />

          {!costCenter ? (
            <FormField control={form.control} name="is_active" render={({ field }) => (
              <FormItem className="flex min-h-16 items-center justify-between gap-4 border-b border-border/60 py-2 xl:self-end">
                <div>
                  <FormLabel className="mb-0">{t.activeLabel}</FormLabel>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {field.value ? 'Disponível para novos lançamentos.' : 'Mantido somente no histórico.'}
                  </p>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} disabled={readOnly || isLoading} />
                </FormControl>
              </FormItem>
            )} />
          ) : null}
        </div>

        <FormField control={form.control} name="icon" render={({ field }) => (
          <FormItem>
            <FormLabel>{t.iconLabel}</FormLabel>
            <div className="grid max-h-[168px] grid-cols-7 gap-2 overflow-y-auto p-1 sm:grid-cols-10 xl:grid-cols-12">
              <button
                type="button"
                onClick={() => field.onChange(null)}
                title={t.iconNoneLabel}
                aria-label={t.iconNoneLabel}
                aria-pressed={!field.value}
                disabled={readOnly || isLoading}
                className={cn(
                  'flex h-10 w-full items-center justify-center rounded-lg border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  !field.value
                    ? 'border-foreground bg-muted text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted',
                )}
              >
                <Ban className="h-4 w-4" />
              </button>
              {iconKeys.map((key) => {
                const Icon = CATEGORY_ICONS[key];
                const isSelected = field.value === key;
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => field.onChange(key)}
                    title={key}
                    aria-label={key}
                    aria-pressed={isSelected}
                    disabled={readOnly || isLoading}
                    className={cn(
                      'flex h-10 w-full items-center justify-center rounded-lg border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                      isSelected
                        ? 'border-foreground text-white'
                        : 'border-transparent text-muted-foreground hover:bg-muted',
                    )}
                    style={isSelected ? { backgroundColor: selectedColor } : undefined}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>{t.descriptionLabel}</FormLabel>
            <FormControl>
              <Textarea
                placeholder={t.descriptionPlaceholder}
                disabled={readOnly || isLoading}
                className="min-h-24 resize-y"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        {showActions && !readOnly ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                {t.cancelLabel}
              </Button>
            ) : null}
            <Button type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {costCenter ? t.saveLabel : t.createLabel}
            </Button>
          </div>
        ) : null}
      </form>
    </Form>
  );
}

interface CostCenterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  costCenter?: CostCenter | null;
  onSubmit: (data: CostCenterFormData) => Promise<void>;
  isLoading?: boolean;
  /** Nome pré-preenchido ao criar (ex.: texto digitado no CostCenterSelect). */
  initialName?: string;
}

export function CostCenterFormDialog({
  open,
  onOpenChange,
  costCenter,
  onSubmit,
  isLoading = false,
  initialName,
}: CostCenterFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.costCenterForm;
  const generatedId = useId();
  const formId = `cost-center-form-${generatedId.replace(/:/g, '')}`;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={costCenter ? t.titleEdit : t.titleNew}
      className="sm:max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {t.cancelLabel}
          </Button>
          <Button type="submit" form={formId} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {costCenter ? t.saveLabel : t.createLabel}
          </Button>
        </div>
      }
    >
      {open ? (
        <CostCenterForm
          formId={formId}
          costCenter={costCenter}
          initialName={initialName}
          onSubmit={onSubmit}
          isLoading={isLoading}
          showActions={false}
        />
      ) : null}
    </ResponsiveModal>
  );
}
