import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Settings2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ColorPicker } from '@/components/ui/ColorPicker';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useAdminFinancialCategories,
  useSaveAdminFinancialCategory,
  useDeleteAdminFinancialCategory,
  type AdminFinancialCategory,
} from '@/hooks/useAdminFinancialCategories';

export function FinancialSettingsSection() {
  const { data: categories = [] } = useAdminFinancialCategories();
  const save = useSaveAdminFinancialCategory();
  const del = useDeleteAdminFinancialCategory();
  const [editing, setEditing] = useState<AdminFinancialCategory | null>(null);
  const [creating, setCreating] = useState<'income' | 'expense' | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const incomeCategories = categories.filter((c) => c.type === 'income');
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  return (
    <Card className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10"><Settings2 className="h-5 w-5 text-primary" /></div>
        <div>
          <h2 className="text-lg font-semibold">Categorias Financeiras</h2>
          <p className="text-xs text-muted-foreground">Personalize as categorias usadas em receitas e despesas</p>
        </div>
      </div>

      {(['income', 'expense'] as const).map((type) => {
        const list = type === 'income' ? incomeCategories : expenseCategories;
        return (
          <div key={type} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{type === 'income' ? 'Receitas' : 'Despesas'}</h3>
              <Button size="sm" variant="outline" onClick={() => setCreating(type)} className="gap-1">
                <Plus className="h-3.5 w-3.5" />Nova
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {list.map((c) => (
                <div key={c.id} className="rounded-lg border p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <span className="text-sm truncate">{c.label}</span>
                    {c.is_system && <Badge variant="secondary" className="text-[9px] h-4">Sistema</Badge>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(c)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    {!c.is_system && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <CategoryFormModal
        category={editing}
        type={creating}
        onClose={() => { setEditing(null); setCreating(null); }}
        onSave={(payload) => save.mutate(payload, { onSuccess: () => { setEditing(null); setCreating(null); } })}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover categoria?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) del.mutate(deleteId); setDeleteId(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CategoryFormModal({ category, type, onClose, onSave }: {
  category: AdminFinancialCategory | null;
  type: 'income' | 'expense' | null;
  onClose: () => void;
  onSave: (payload: any) => void;
}) {
  const open = !!(category || type);
  const initial = category ?? { name: '', label: '', type: type ?? 'income', color: '#10b981', icon: '', is_active: true, is_system: false };
  const [form, setForm] = useState(initial);

  // reset when changing
  useState(() => { setForm(initial); });
  if (!open) return null;

  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && onClose()} title={category ? 'Editar categoria' : 'Nova categoria'}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Rótulo*</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Identificador (slug)*</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })} disabled={!!category?.is_system} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })} disabled={!!category}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="expense">Despesa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={() => onSave({ id: category?.id, ...form })} className="flex-1">Salvar</Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
