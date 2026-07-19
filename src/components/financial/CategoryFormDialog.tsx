import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { CATEGORY_ICONS, type CategoryIconKey } from './categoryIcons';
import { ColorPicker } from '@/components/ui/ColorPicker';
import type { FinancialCategory } from '@/hooks/useFinancialCategories';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const baseSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  color: z.string().min(1),
  icon: z.string().default('Tag'),
  dre_group: z.string().default('opex'),
});

type FormData = z.infer<typeof baseSchema>;

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: FinancialCategory | null;
  onSubmit: (data: FormData) => Promise<void>;
  isLoading?: boolean;
}

export function CategoryFormDialog({ open, onOpenChange, category, onSubmit, isLoading }: CategoryFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.categoryForm;

  const schema = baseSchema.extend({
    name: z.string().min(1, t.validations.nameRequired),
    type: z.string().min(1, t.validations.typeRequired),
    color: z.string().min(1, t.validations.colorRequired),
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? '',
      type: category?.type ?? 'ambos',
      color: category?.color ?? '#00C597',
      icon: category?.icon ?? 'Tag',
      dre_group: (category as any)?.dre_group ?? 'opex',
    },
  });

  // Resync form when opening or switching category
  useEffect(() => {
    if (open) {
      form.reset({
        name: category?.name ?? '',
        type: category?.type ?? 'ambos',
        color: category?.color ?? '#00C597',
        icon: category?.icon ?? 'Tag',
        dre_group: (category as any)?.dre_group ?? 'opex',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id]);

  const selectedColor = form.watch('color');

  const handleSubmit = async (data: FormData) => {
    await onSubmit(data);
    form.reset();
  };

  const iconKeys = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={category ? t.titleEdit : t.titleNew}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.cancelLabel}</Button>
          <Button onClick={form.handleSubmit(handleSubmit)} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {category ? t.saveLabel : t.createLabel}
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

          <FormField control={form.control} name="type" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.typeLabel}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="entrada">{t.types.entrada}</SelectItem>
                  <SelectItem value="saida">{t.types.saida}</SelectItem>
                  <SelectItem value="ambos">{t.types.ambos}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="dre_group" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.dreGroupLabel}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="impostos">{t.dreGroups.impostos}</SelectItem>
                  <SelectItem value="cmv">{t.dreGroups.cmv}</SelectItem>
                  <SelectItem value="opex">{t.dreGroups.opex}</SelectItem>
                </SelectContent>
              </Select>
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

          <FormField control={form.control} name="icon" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.iconLabel}</FormLabel>
              <div className="grid grid-cols-8 gap-2 max-h-[160px] overflow-y-auto p-1">
                {iconKeys.map((key) => {
                  const Icon = CATEGORY_ICONS[key];
                  const isSelected = field.value === key;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => field.onChange(key)}
                      title={key}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-all ${
                        isSelected ? 'border-foreground text-white' : 'border-transparent text-muted-foreground hover:bg-muted'
                      }`}
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
        </form>
      </Form>
    </ResponsiveModal>
  );
}
