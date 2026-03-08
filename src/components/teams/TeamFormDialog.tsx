import { useState, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2 } from 'lucide-react';
import type { TeamWithMembers, TeamInput } from '@/hooks/useTeams';

interface Profile {
  user_id: string;
  full_name: string;
  avatar_url?: string | null;
}

interface TeamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team?: TeamWithMembers | null;
  onSubmit: (data: TeamInput & { id?: string }) => Promise<void>;
  isLoading?: boolean;
  profiles: Profile[];
}

export function TeamFormDialog({ open, onOpenChange, team, onSubmit, isLoading, profiles }: TeamFormDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setName(team?.name ?? '');
      setDescription(team?.description ?? '');
      setColor(team?.color ?? '#3b82f6');
      setSelectedMembers(team?.members.map(m => m.user_id) ?? []);
    }
  }, [open, team]);

  const toggleMember = (uid: string) => {
    setSelectedMembers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await onSubmit({
      ...(team ? { id: team.id } : {}),
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      member_ids: selectedMembers,
    });
    onOpenChange(false);
  };

  const getInitials = (n: string) => n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={team ? 'Editar Equipe' : 'Nova Equipe'}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Nome *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome da equipe" />
        </div>

        <div className="space-y-2">
          <Label>Descrição</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição" />
        </div>

        <div className="space-y-2">
          <Label>Cor</Label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-10 rounded border cursor-pointer" />
            <span className="text-sm text-muted-foreground">{color}</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Membros</Label>
          <div className="max-h-[200px] overflow-y-auto space-y-1 border rounded-lg p-2">
            {profiles.map(p => (
              <label
                key={p.user_id}
                className="flex items-center gap-3 rounded-lg p-2 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={selectedMembers.includes(p.user_id)}
                  onCheckedChange={() => toggleMember(p.user_id)}
                />
                <Avatar className="h-8 w-8">
                  <AvatarImage src={p.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">{getInitials(p.full_name)}</AvatarFallback>
                </Avatar>
                <span className="text-sm">{p.full_name}</span>
              </label>
            ))}
            {profiles.length === 0 && (
              <p className="text-sm text-muted-foreground p-2">Nenhum usuário disponível</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isLoading || !name.trim()}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {team ? 'Salvar' : 'Criar Equipe'}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
