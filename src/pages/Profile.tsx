import { useState } from 'react';
import { phoneMask } from '@/utils/masks';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Camera, Loader2, ArrowLeft, UserCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrengthIndicator, isPasswordStrong } from '@/components/PasswordStrengthIndicator';
import { getFriendlyPasswordError } from '@/utils/passwordHelpers';
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
import { getErrorMessage } from '@/utils/errorMessages';

export default function Profile() {
  const { user, profile } = useAuth();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.profile;
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
      toast({ title: t.toastProfileUpdated });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastSaveError, description: getErrorMessage(err) });
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
      toast({ title: t.toastPhotoUpdated });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastPhotoError, description: getErrorMessage(err) });
    } finally {
      setUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!isPasswordStrong(newPassword)) {
      toast({ variant: 'destructive', title: t.toastPasswordWeak, description: t.toastPasswordWeakDesc });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: t.toastPasswordMismatch });
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: t.toastPasswordChanged });
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastPasswordError, description: getFriendlyPasswordError(err) });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title={t.pageTitle}
        subtitle={t.pageSubtitle}
        icon={UserCircle}
        actions={
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} title={t.btnBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        }
      />

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
                  <Label htmlFor="fullName">{t.labelFullName}</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t.placeholderFullName} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t.labelEmail}</Label>
                  <Input id="email" value={user?.email || ''} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t.labelPhone}</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(phoneMask(e.target.value))} placeholder={t.placeholderPhone} />
                </div>
                <div className="space-y-2">
                  <Label>{t.labelCreatedAt}</Label>
                  <Input value={user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : ''} disabled className="bg-muted" />
                </div>
              </div>
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? t.btnSaving : t.btnSave}
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
              <CardTitle className="text-base">{t.cardPasswordTitle}</CardTitle>
              <CardDescription>{t.cardPasswordDesc}</CardDescription>
            </div>
            {!showPasswordForm && (
              <Button variant="outline" size="sm" onClick={() => setShowPasswordForm(true)}>
                {t.btnChangePassword}
              </Button>
            )}
          </div>
        </CardHeader>
        {showPasswordForm && (
          <CardContent className="space-y-4">
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="new-password">{t.labelNewPassword}</Label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t.placeholderNewPassword}
              />
              <PasswordStrengthIndicator password={newPassword} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t.labelConfirmPassword}</Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t.placeholderConfirmPassword}
                matchAgainst={newPassword}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t.btnSavePassword}
              </Button>
              <Button variant="ghost" onClick={() => { setShowPasswordForm(false); setNewPassword(''); setConfirmPassword(''); }}>
                {t.btnCancel}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
