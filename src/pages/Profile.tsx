import { useState } from 'react';
import { phoneMask } from '@/utils/masks';
import { Camera, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

export default function Profile() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Password
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const initials = fullName
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, phone: phone || null })
        .eq('id', profile.id);
      if (error) throw error;
      toast({ title: 'Perfil atualizado com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file || !profile) return;
    file = await processImageFile(file);
    setUploading(true);
    try {
      const filePath = `avatars/${profile.user_id}_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('customer-photos').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('customer-photos').getPublicUrl(filePath);
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);
      if (error) throw error;
      toast({ title: 'Foto atualizada!' });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao enviar foto', description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Senha deve ter pelo menos 6 caracteres' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'As senhas não coincidem' });
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Senha alterada com sucesso!' });
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao alterar senha', description: err.message });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Meu Perfil</h1>
          <p className="text-muted-foreground">Gerencie suas informações pessoais</p>
        </div>
      </div>

      {/* Avatar + Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="relative group">
              <Avatar className="h-24 w-24">
                <AvatarImage src={profile?.avatar_url || undefined} alt={fullName} />
                <AvatarFallback className="bg-primary text-white text-2xl font-bold">{initials}</AvatarFallback>
              </Avatar>
              <label className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                {uploading ? (
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
              </label>
            </div>
            <div className="flex-1 w-full space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={user?.email || ''} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(phoneMask(e.target.value))} placeholder="(00) 00000-0000" />
                </div>
                <div className="space-y-2">
                  <Label>Conta criada em</Label>
                  <Input value={user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : ''} disabled className="bg-muted" />
                </div>
              </div>
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Senha</CardTitle>
              <CardDescription>Altere a senha da sua conta</CardDescription>
            </div>
            {!showPasswordForm && (
              <Button variant="outline" size="sm" onClick={() => setShowPasswordForm(true)}>
                Alterar Senha
              </Button>
            )}
          </div>
        </CardHeader>
        {showPasswordForm && (
          <CardContent className="space-y-4">
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewPass(!showNewPass)}
                >
                  {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                >
                  {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Nova Senha
              </Button>
              <Button variant="ghost" onClick={() => { setShowPasswordForm(false); setNewPassword(''); setConfirmPassword(''); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
