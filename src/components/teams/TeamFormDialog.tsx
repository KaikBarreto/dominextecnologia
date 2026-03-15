import { useState, useEffect, useRef } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Upload, X, UsersRound, Wrench, Zap, Shield, Truck, Hammer, HardHat, Settings, HeartPulse, Flame, Droplets, Wind, Thermometer, Cable, Plug, Lightbulb, Gauge } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { buildStorageFilePath } from '@/utils/storagePath';
import type { TeamWithMembers, TeamInput } from '@/hooks/useTeams';

const ICON_OPTIONS = [
  { name: 'UsersRound', icon: UsersRound },
  { name: 'Wrench', icon: Wrench },
  { name: 'Zap', icon: Zap },
  { name: 'Shield', icon: Shield },
  { name: 'Truck', icon: Truck },
  { name: 'Hammer', icon: Hammer },
  { name: 'HardHat', icon: HardHat },
  { name: 'Settings', icon: Settings },
  { name: 'HeartPulse', icon: HeartPulse },
  { name: 'Flame', icon: Flame },
  { name: 'Droplets', icon: Droplets },
  { name: 'Wind', icon: Wind },
  { name: 'Thermometer', icon: Thermometer },
  { name: 'Cable', icon: Cable },
  { name: 'Plug', icon: Plug },
  { name: 'Lightbulb', icon: Lightbulb },
  { name: 'Gauge', icon: Gauge },
];

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
  const [iconName, setIconName] = useState<string>('UsersRound');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(team?.name ?? '');
      setDescription(team?.description ?? '');
      setColor(team?.color ?? '#3b82f6');
      setSelectedMembers(team?.members.map(m => m.user_id) ?? []);
      setIconName((team as any)?.icon_name ?? 'UsersRound');
      setPhotoUrl((team as any)?.photo_url ?? null);
      setPhotoFile(null);
      setPhotoPreview(null);
    }
  }, [open, team]);

  const toggleMember = (uid: string) => {
    setSelectedMembers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoUrl(null);
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return photoUrl;
    setUploading(true);
    try {
      const path = buildStorageFilePath({ folder: 'teams', fileName: photoFile.name });
      const { error } = await supabase.storage.from('team-photos').upload(path, photoFile);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('team-photos').getPublicUrl(path);
      return urlData.publicUrl;
    } catch {
      return photoUrl;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const uploadedUrl = await uploadPhoto();
    await onSubmit({
      ...(team ? { id: team.id } : {}),
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      icon_name: iconName,
      photo_url: uploadedUrl ?? undefined,
      member_ids: selectedMembers,
    });
    onOpenChange(false);
  };

  const getInitials = (n: string) => n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const currentPhotoSrc = photoPreview || photoUrl;
  const SelectedIcon = ICON_OPTIONS.find(i => i.name === iconName)?.icon || UsersRound;

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

        {/* Visual: Photo or Color + Icon */}
        <div className="space-y-2">
          <Label>Visual da Equipe</Label>
          <div className="flex items-center gap-4">
            {/* Preview */}
            <div
              className="h-16 w-16 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{ backgroundColor: currentPhotoSrc ? undefined : color }}
            >
              {currentPhotoSrc ? (
                <img src={currentPhotoSrc} alt="Equipe" className="h-full w-full object-cover" />
              ) : (
                <SelectedIcon className="h-8 w-8 text-white" />
              )}
            </div>

            <div className="flex-1 space-y-2">
              {/* Photo upload */}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Foto
                </Button>
                {currentPhotoSrc && (
                  <Button type="button" variant="ghost" size="sm" onClick={removePhoto}>
                    <X className="h-3 w-3 mr-1" />
                    Remover
                  </Button>
                )}
              </div>
              {/* Color picker */}
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
                <span className="text-xs text-muted-foreground">{color}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Icon selector */}
        {!currentPhotoSrc && (
          <div className="space-y-2">
            <Label>Ícone</Label>
            <div className="grid grid-cols-9 gap-1.5">
              {ICON_OPTIONS.map(({ name: iName, icon: Icon }) => (
                <button
                  key={iName}
                  type="button"
                  onClick={() => setIconName(iName)}
                  className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all ${
                    iconName === iName
                      ? 'ring-2 ring-primary text-white'
                      : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                  }`}
                  style={iconName === iName ? { backgroundColor: color } : undefined}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        )}

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
          <Button onClick={handleSubmit} disabled={isLoading || uploading || !name.trim()}>
            {(isLoading || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {team ? 'Salvar' : 'Criar Equipe'}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
