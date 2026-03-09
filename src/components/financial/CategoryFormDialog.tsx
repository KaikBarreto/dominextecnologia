import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { CATEGORY_ICONS, type CategoryIconKey } from './categoryIcons';
import { ColorPicker } from '@/components/ui/ColorPicker';
import type { FinancialCategory } from '@/hooks/useFinancialCategories';

const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  type: z.string().min(1, 'Tipo é obrigatório'),
  color: z.string().min(1, 'Cor é obrigatória'),
  icon: z.string().default('Tag'),
  dre_group: z.string().default('opex'),
});

type FormData = z.infer<typeof schema>;

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: FinancialCategory | null;
  onSubmit: (data: FormData) => Promise<void>;
  isLoading?: boolean;
}

export function CategoryFormDialog({ open, onOpenChange, category, onSubmit, isLoading }: CategoryFormDialogProps) {
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

  const selectedColor = form.watch('color');
  const selectedIcon = form.watch('icon');

  const handleSubmit = async (data: FormData) => {
    await onSubmit(data);
    form.reset();
  };

  const iconKeys = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{category ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome *</FormLabel>
                <FormControl><Input placeholder="Ex: Serviços" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="entrada">Receita</SelectItem>
                    <SelectItem value="saida">Despesa</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="dre_group" render={({ field }) => (
              <FormItem>
                <FormLabel>Grupo DRE</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="impostos">Impostos e Deduções</SelectItem>
                    <SelectItem value="cmv">CMV (Custo do Serviço)</SelectItem>
                    <SelectItem value="opex">Despesas Operacionais (OPEX)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="color" render={({ field }) => (
              <FormItem>
                <FormLabel>Cor</FormLabel>
                <ColorPicker value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="icon" render={({ field }) => (
              <FormItem>
                <FormLabel>Ícone</FormLabel>
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
                          isSelected
                            ? 'border-foreground text-white'
                            : 'border-transparent text-muted-foreground hover:bg-muted'
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

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {category ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
