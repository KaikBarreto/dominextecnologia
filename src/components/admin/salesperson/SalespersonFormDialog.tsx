import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import { useSaveSalesperson, type Salesperson } from '@/hooks/useSalespersonData';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSalesperson?: Salesperson | null;
}

const AVATAR_BUCKET = 'salesperson-avatars';
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (limite do bucket no Storage)
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

/** Extrai o path interno do bucket a partir da publicUrl (pra remover arquivo antigo). */
function extractStoragePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}

export function SalespersonFormDialog({ open, onOpenChange, editingSalesperson }: Props) {
  const saveMutation = useSaveSalesperson();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    salary: 0,
    monthly_goal: 30,
    is_active: true,
    no_commission: false,
    notes: '',
    user_id: 'none' as string,
  });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Arquivo pendente em modo criação — só sobe depois que o vendedor tem id. */
  const pendingFileRef = useRef<File | null>(null);

  // Buscar usuários admin disponíveis (super_admin ou com admin_permissions) que não estão vinculados a outro vendedor
  const { data: availableUsers = [] } = useQuery({
    queryKey: ['admin-users-for-link', editingSalesperson?.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-admin-users', { body: { action: 'list' } });
      if (error) return [];
      const users = (data?.users ?? []) as { id: string; email: string; full_name: string | null; salesperson: { id: string } | null }[];
      return users.filter((u) => !u.salesperson || u.salesperson.id === editingSalesperson?.id);
    },
  });

  useEffect(() => {
    if (!open) return;
    pendingFileRef.current = null;
    if (editingSalesperson) {
      setFormData({
        name: editingSalesperson.name,
        email: editingSalesperson.email || '',
        phone: editingSalesperson.phone || '',
        salary: Number(editingSalesperson.salary) || 0,
        monthly_goal: editingSalesperson.monthly_goal || 30,
        is_active: editingSalesperson.is_active ?? true,
        no_commission: editingSalesperson.no_commission ?? false,
        notes: editingSalesperson.notes || '',
        user_id: (editingSalesperson as any).user_id || 'none',
      });
      setPhotoUrl(editingSalesperson.photo_url || null);
    } else {
      setFormData({ name: '', email: '', phone: '', salary: 0, monthly_goal: 30, is_active: true, no_commission: false, notes: '', user_id: 'none' });
      setPhotoUrl(null);
    }
  }, [editingSalesperson, open]);

  /**
   * Sobe a foto pro bucket `salesperson-avatars` e atualiza `salespeople.photo_url`.
   * Path: <salespersonId>/<uuid>.<ext>
   * RLS: apenas super_admin pode INSERT/UPDATE/DELETE — vendedor admin é bloqueado.
   */
  const uploadAndSavePhoto = async (file: File, salespersonId: string, previousPhotoUrl: string | null) => {
    let processed = file;
    try {
      processed = await processImageFile(file);
    } catch {
      processed = file;
    }
    if (processed.size > MAX_BYTES) {
      throw new Error('Arquivo muito grande. Máximo 2 MB.');
    }

    const extMatch = processed.name.match(/\.([a-zA-Z0-9]+)$/);
    const ext = (extMatch?.[1] || 'jpg').toLowerCase();
    const path = `${salespersonId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, processed, {
        contentType: processed.type || `image/${ext}`,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

    const { error: updateError } = await supabase
      .from('salespeople')
      .update({ photo_url: publicUrl })
      .eq('id', salespersonId);
    if (updateError) {
      // Rollback do storage pra não deixar arquivo órfão
      await supabase.storage.from(AVATAR_BUCKET).remove([path]).catch(() => {});
      throw updateError;
    }

    // Remove foto anterior (best-effort, não bloqueia em caso de falha)
    const oldPath = extractStoragePath(previousPhotoUrl);
    if (oldPath && oldPath !== path) {
      await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]).catch(() => {});
    }

    return publicUrl;
  };

  /** Handler do <input type="file"> — só sobe direto se já há `salespersonId` (modo edição). */
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
    if (!file) return;

    // Modo criação: ainda não temos id; guarda o arquivo numa estrutura simples e mostra preview local.
    if (!editingSalesperson?.id) {
      if (file.size > MAX_BYTES) {
        toast.error('Arquivo muito grande. Máximo 2 MB.');
        return;
      }
      pendingFileRef.current = file;
      setPhotoUrl(URL.createObjectURL(file));
      return;
    }

    // Modo edição: sobe na hora.
    setUploading(true);
    try {
      const newUrl = await uploadAndSavePhoto(file, editingSalesperson.id, photoUrl);
      setPhotoUrl(newUrl);
      queryClient.invalidateQueries({ queryKey: ['salespeople'] });
      queryClient.invalidateQueries({ queryKey: ['salesperson', editingSalesperson.id] });
      toast.success('Foto atualizada');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar foto');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!editingSalesperson?.id) {
      // Modo criação: só limpa preview local.
      pendingFileRef.current = null;
      setPhotoUrl(null);
      return;
    }
    setUploading(true);
    try {
      const oldPath = extractStoragePath(photoUrl);
      const { error } = await supabase
        .from('salespeople')
        .update({ photo_url: null })
        .eq('id', editingSalesperson.id);
      if (error) throw error;
      if (oldPath) {
        await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]).catch(() => {});
      }
      setPhotoUrl(null);
      queryClient.invalidateQueries({ queryKey: ['salespeople'] });
      queryClient.invalidateQueries({ queryKey: ['salesperson', editingSalesperson.id] });
      toast.success('Foto removida');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao remover foto');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSubmitting(true);
    try {
      const saved = await saveMutation.mutateAsync({
        id: editingSalesperson?.id,
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        salary: formData.salary,
        monthly_goal: formData.monthly_goal,
        is_active: formData.is_active,
        no_commission: formData.no_commission,
        notes: formData.notes.trim() || null,
        user_id: formData.user_id === 'none' ? null : formData.user_id,
      } as any);

      // Modo criação com foto pendente: sobe a foto agora que temos o id.
      if (!editingSalesperson && pendingFileRef.current && (saved as any)?.id) {
        try {
          await uploadAndSavePhoto(pendingFileRef.current, (saved as any).id, null);
        } catch (uploadErr: any) {
          // Vendedor já foi criado — avisa do erro de foto sem reverter o registro.
          toast.error(uploadErr?.message || 'Vendedor criado, mas houve erro ao enviar a foto');
        }
        pendingFileRef.current = null;
      }

      queryClient.invalidateQueries({ queryKey: ['salespeople'] });
      onOpenChange(false);
    } catch (err: any) {
      if (err?.code === '23505') toast.error('Já existe um vendedor com este email ou usuário vinculado');
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = submitting || saveMutation.isPending || uploading;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={editingSalesperson ? 'Editar Vendedor' : 'Novo Vendedor'}
      description="Preencha as informações do vendedor"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Foto do vendedor */}
        <div className="flex flex-col items-center gap-2">
          <label className="relative cursor-pointer group">
            <SalespersonAvatar name={formData.name || 'Novo Vendedor'} photoUrl={photoUrl} size="xl" />
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploading ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </div>
            <input
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handlePhotoChange}
              disabled={uploading}
            />
          </label>
          {photoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={handleRemovePhoto}
              disabled={uploading}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Remover foto
            </Button>
          )}
          <p className="text-[10px] text-muted-foreground">JPG, PNG, WEBP ou GIF — até 2 MB</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="sp-name">Nome*</Label>
            <Input id="sp-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-email">Email</Label>
            <Input id="sp-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-phone">Telefone</Label>
            <Input id="sp-phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-salary">Salário Fixo (R$)</Label>
            <Input id="sp-salary" type="number" step="0.01" min="0" value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-goal">Meta Mensal (vendas)</Label>
            <Input id="sp-goal" type="number" min="0" value={formData.monthly_goal} onChange={(e) => setFormData({ ...formData, monthly_goal: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Vincular a usuário admin (opcional)</Label>
            <Select value={formData.user_id} onValueChange={(v) => setFormData({ ...formData, user_id: v })}>
              <SelectTrigger><SelectValue placeholder="— Nenhum —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nenhum —</SelectItem>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Vendedor vinculado vê apenas os próprios dados (a menos que tenha "ver todos os vendedores").</p>
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="sp-notes">Observações</Label>
            <Textarea id="sp-notes" rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="sp-active" className="cursor-pointer">Vendedor Ativo</Label>
            <Switch id="sp-active" checked={formData.is_active} onCheckedChange={(c) => setFormData({ ...formData, is_active: c })} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="sp-noc" className="cursor-pointer">Sem Comissão</Label>
              <p className="text-xs text-muted-foreground">Vendas atribuídas a este vendedor não geram comissão</p>
            </div>
            <Switch id="sp-noc" checked={formData.no_commission} onCheckedChange={(c) => setFormData({ ...formData, no_commission: c })} />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
          <Button type="submit" disabled={isPending} className="flex-1">
            {isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
