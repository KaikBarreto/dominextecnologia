import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Search, Settings2, UserPlus, ShieldCheck, Plus, Users as UsersIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useUsers, type UserWithRole } from '@/hooks/useUsers';
import { useUserPermissions, usePermissionPresets, getAllPermissionKeys, type PermissionPreset } from '@/hooks/usePermissions';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { UserFormDialog } from '@/components/users/UserFormDialog';
import { UserLimitModal } from '@/components/UserLimitModal';
import { useEmployees } from '@/hooks/useEmployees';
import { PermissionPresetDialog } from '@/components/users/PermissionPresetDialog';
import { PresetListMobile } from '@/components/users/PresetListMobile';
import { UsersMasterDetail } from '@/components/users/UsersMasterDetail';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { FABButton } from '@/components/mobile/FABButton';
import { getErrorMessage, getInvokeErrorMessage } from '@/utils/errorMessages';
import { tenantFileOptions } from '@/utils/tenantStorage';

export default function Users() {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.users;
  const { users, isLoading, error: usersError, updateUserRole, canManageRoles, currentUserRole } = useUsers();
  const { userPermissions, upsertPermissions } = useUserPermissions();
  const { presets, createPreset, updatePreset, deletePreset } = usePermissionPresets();
  const { maxUsers, currentUserCount, canAddUser } = useCompanyModules();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { employees } = useEmployees();
  const [searchQuery, setSearchQuery] = useState('');
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'presets'>('users');
  const [deletingUser, setDeletingUser] = useState<UserWithRole | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deletingPreset, setDeletingPreset] = useState<PermissionPreset | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ src: string; alt: string } | null>(null);
  const [userLimitOpen, setUserLimitOpen] = useState(false);

  // Inicia criação de usuário respeitando o limite do plano. No limite → modal de
  // "Contratar mais usuários" (que leva ao Gerenciar Meu Plano focado em extras).
  const startCreateUser = () => {
    if (!canAddUser) {
      setUserLimitOpen(true);
      return;
    }
    setEditingUser(null);
    setUserFormOpen(true);
  };

  const filteredPresets = presets.filter(p =>
    fuzzyIncludes(p.name, searchQuery) ||
    fuzzyIncludes(p.description, searchQuery)
  );

  const getUserPermission = (userId: string) =>
    userPermissions.find(p => p.user_id === userId);

  const uploadPhoto = async (userId: string, file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `user-${userId}-${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('customer-photos')
      .upload(fileName, file, await tenantFileOptions({ upsert: true }));
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage
      .from('customer-photos')
      .getPublicUrl(fileName);
    return publicUrl;
  };

  const handleCreateUser = async (data: any) => {
    try {
      // Use chosen_email if there was a conflict resolution
      const finalEmail = data.chosen_email || data.email;

      const { data: result, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: finalEmail,
          password: data.password,
          full_name: data.full_name,
          phone: data.phone || null,
          permissions: data.permissions,
          preset_id: data.preset_id,
          role: data.role || null,
        },
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      // Upload photo if provided
      if (data.photo && result?.user?.id) {
        const avatarUrl = await uploadPhoto(result.user.id, data.photo);
        if (avatarUrl) {
          await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('user_id', result.user.id);
        }
      }

      // Link to employee if selected and sync photo
      if (data.employee_id && result?.user?.id) {
        const updateData: any = { user_id: result.user.id };
        if (data.chosen_email) {
          updateData.email = data.chosen_email;
        }
        // Sync user photo to employee
        if (data.photo && result.user.id) {
          const { data: profile } = await supabase.from('profiles').select('avatar_url').eq('user_id', result.user.id).maybeSingle();
          if (profile?.avatar_url) {
            updateData.photo_url = profile.avatar_url;
          }
        }
        await supabase.from('employees').update(updateData).eq('id', data.employee_id);
      }

      toast({ title: t.toastCreated });
      window.location.reload();
    } catch (e: any) {
      // Lê o corpo real da Response quando a edge respondeu com erro (não-2xx),
      // senão cai na mensagem/erro comum.
      const realMsg = (await getInvokeErrorMessage(e)) || e.message || '';
      const lower = realMsg.toLowerCase();
      const friendlyMsg = lower.includes('já cadastrado') || lower.includes('already') || lower.includes('duplicate') || lower.includes('already been registered')
        ? t.toastCreateErrorDuplicate
        : getErrorMessage(realMsg || e);
      toast({ title: t.toastCreateError, description: friendlyMsg, variant: 'destructive' });
      throw e;
    }
  };

  const handleEditUser = async (data: any) => {
    if (!editingUser) return;
    // Guarda: rebaixar o último admin ativo (admin -> gestor/tecnico) é bloqueado.
    if (data.role !== 'admin' && isLastActiveAdmin(editingUser)) {
      blockLastAdmin();
      return;
    }
    try {
      // Handle photo
      let avatarUrl: string | null | undefined = undefined;
      if (data.removePhoto) {
        avatarUrl = null;
      } else if (data.photo) {
        avatarUrl = await uploadPhoto(editingUser.user_id, data.photo);
      }

      const profileUpdate: any = { full_name: data.full_name, phone: data.phone || null };
      if (avatarUrl !== undefined) profileUpdate.avatar_url = avatarUrl;

      await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('user_id', editingUser.user_id);

      // Handle role: set 'tecnico' or remove role
      if (data.role === 'tecnico') {
        await updateUserRole.mutateAsync({ userId: editingUser.user_id, role: 'tecnico' });
      } else if (editingUser.role === 'tecnico' && !data.role) {
        // Remove tecnico role
        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', editingUser.user_id)
          .eq('role', 'tecnico');
      }

      await upsertPermissions.mutateAsync({
        user_id: editingUser.user_id,
        permissions: data.permissions,
        preset_id: data.preset_id,
      });

      // Update employee link
      // First unlink any employee that was previously linked to this user
      await supabase.from('employees').update({ user_id: null }).eq('user_id', editingUser.user_id);
      // Then link the selected employee and sync photo
      if (data.employee_id) {
        const finalAvatarUrl = avatarUrl !== undefined ? avatarUrl : editingUser.avatar_url;
        const empUpdate: any = { user_id: editingUser.user_id };
        // Sync photo: if user has a photo, set it on employee too
        if (finalAvatarUrl) {
          empUpdate.photo_url = finalAvatarUrl;
        }
        await supabase.from('employees').update(empUpdate).eq('id', data.employee_id);
      }

      // Update email if changed
      if (data.email && data.email !== editingUser.email) {
        const { data: emailResult, error: emailError } = await supabase.functions.invoke('manage-user', {
          body: { action: 'update_email', user_id: editingUser.user_id, email: data.email },
        });
        if (emailError) throw emailError;
        if (emailResult?.error) throw new Error(emailResult.error);
      }

      toast({ title: t.toastUpdated });
      window.location.reload();
    } catch (e: any) {
      toast({ title: t.toastUpdateError, description: getErrorMessage(e), variant: 'destructive' });
      throw e;
    }
  };

  // Desativar conta (reversível): libera slot e derruba a sessão do usuário.
  const handleDeactivateUser = async (userProfile: UserWithRole) => {
    if (userProfile.user_id === user?.id) return; // não pode se desativar
    // Guarda: desativar o último admin ativo deixaria a empresa órfã.
    if (isLastActiveAdmin(userProfile)) {
      blockLastAdmin();
      return;
    }
    try {
      const { data: result, error } = await supabase.functions.invoke('manage-user', {
        body: { action: 'deactivate_user', user_id: userProfile.user_id },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast({ title: t.toastDeactivated, description: t.toastDeactivatedDesc });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['company-user-count'] });
    } catch (e: any) {
      toast({ title: t.toastDeactivateError, description: getErrorMessage(e), variant: 'destructive' });
    }
  };

  // Reativar conta: só funciona se houver slot livre (a edge valida server-side).
  const handleReactivateUser = async (userProfile: UserWithRole) => {
    try {
      const { data: result, error } = await supabase.functions.invoke('manage-user', {
        body: { action: 'reactivate_user', user_id: userProfile.user_id },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast({ title: t.toastReactivated });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['company-user-count'] });
    } catch (e: any) {
      toast({ title: t.toastReactivateError, description: getErrorMessage(e), variant: 'destructive' });
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    // Guarda: excluir o último admin ativo deixaria a empresa órfã.
    if (isLastActiveAdmin(deletingUser)) {
      blockLastAdmin();
      setDeletingUser(null);
      return;
    }
    setDeleteLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('manage-user', {
        body: { action: 'delete_user', user_id: deletingUser.user_id },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast({ title: t.toastDeleted });
      setDeletingUser(null);
      window.location.reload();
    } catch (e: any) {
      toast({ title: t.toastDeleteError, description: getErrorMessage(e), variant: 'destructive' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const openEditUser = async (userProfile: UserWithRole) => {
    const perm = getUserPermission(userProfile.user_id);
    const linkedEmployee = employees.find(e => e.user_id === userProfile.user_id);

    // Fetch current email from auth (fallback para email do funcionário vinculado)
    let currentEmail = linkedEmployee?.email || '';
    try {
      const { data: emailData } = await supabase.functions.invoke('manage-user', {
        body: { action: 'get_email', user_id: userProfile.user_id },
      });
      if (emailData?.email) currentEmail = emailData.email;
    } catch {}

    setEditingUser({
      user_id: userProfile.user_id,
      full_name: userProfile.full_name,
      phone: userProfile.phone,
      role: userProfile.role,
      permissions: perm?.permissions || [],
      preset_id: perm?.preset_id || null,
      avatar_url: userProfile.avatar_url,
      employee_id: linkedEmployee?.id || null,
      email: currentEmail,
    });
    setUserFormOpen(true);
  };

  // Conta ativos pelo status da CONTA (profiles.is_active). undefined = ativo.
  const activeCount = users.filter(u => u.is_active !== false).length;

  // Guarda amigável: a empresa precisa de >= 1 admin ativo (espelha a trava do
  // servidor). Admin ativo = role 'admin' e is_active !== false. Bloqueia no
  // client (rebaixar/excluir/desativar) quando o alvo é o ÚLTIMO admin ativo.
  const activeAdmins = users.filter(u => u.role === 'admin' && u.is_active !== false);
  const isLastActiveAdmin = (target: UserWithRole) =>
    target.role === 'admin' && target.is_active !== false && activeAdmins.length <= 1;
  const blockLastAdmin = () => {
    toast({
      title: t.blockLastAdminTitle,
      description: t.blockLastAdminDesc,
      variant: 'destructive',
    });
  };

  // ---------------------------------------------------------------------------
  // Preset handlers (lista nas tabs mobile abre dialog em modo edit/create)
  // ---------------------------------------------------------------------------
  const handleCreatePreset = () => {
    // Abre o dialog. O fluxo interno do dialog cuida de "Novo Cargo".
    setPresetDialogOpen(true);
  };

  const handleEditPreset = (preset: PermissionPreset) => {
    // Reaproveita o mesmo dialog — a lista interna do dialog mostra todos
    // e o usuário toca em "Editar". Aceitável: scope mantém dialog intacto.
    setPresetDialogOpen(true);
  };

  const handleDuplicatePreset = async (preset: PermissionPreset) => {
    try {
      await createPreset.mutateAsync({
        name: `${preset.name} (cópia)`,
        description: preset.description || undefined,
        permissions: [...preset.permissions],
      });
      toast({ title: t.toastPresetDuplicated });
    } catch (e) {
      toast({ title: t.toastPresetDuplicateError, description: getErrorMessage(e, 'Erro inesperado'), variant: 'destructive' });
    }
  };

  const handleDeletePresetConfirm = async () => {
    if (!deletingPreset) return;
    try {
      await deletePreset.mutateAsync(deletingPreset.id);
      toast({ title: t.toastPresetDeleted });
      setDeletingPreset(null);
    } catch (e) {
      toast({ title: t.toastPresetDeleteError, description: getErrorMessage(e, 'Erro inesperado'), variant: 'destructive' });
    }
  };

  const usersMasterDetail = (
    <UsersMasterDetail
      users={users}
      isLoading={isLoading}
      error={usersError}
      currentUserId={user?.id}
      canManageRoles={canManageRoles}
      canAddUser={canAddUser}
      userPermissions={userPermissions}
      presets={presets}
      onRetry={() => void queryClient.refetchQueries({ queryKey: ['users'] })}
      onCreate={startCreateUser}
      onEdit={(profile) => void openEditUser(profile)}
      onDeactivate={(profile) => void handleDeactivateUser(profile)}
      onReactivate={(profile) => void handleReactivateUser(profile)}
      onDelete={setDeletingUser}
      onPreviewPhoto={(src, alt) => setPreviewPhoto({ src, alt })}
    />
  );

  // ---------------------------------------------------------------------------
  // MOBILE — 2 tabs (Usuários / Presets), padrão app nativo.
  // ---------------------------------------------------------------------------
  if (isMobile) {
    return (
      <div className={cn('space-y-4 min-w-0 w-full max-w-full overflow-x-hidden pb-24')}>
        <MobilePageHeader
          title={t.pageTitle}
          subtitle={t.pageSubtitle.replace('{count}', String(currentUserCount)).replace('{max}', String(maxUsers)).replace('{active}', String(activeCount))}
          icon={ShieldCheck}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'users' | 'presets')} className="w-full">
          <MobilePillTabs
            variant="underline"
            level="screen"
            tabs={[
              { value: 'users', label: t.tabs.users },
              { value: 'presets', label: t.tabs.presets },
            ]}
            activeTab={activeTab}
            onTabChange={(v) => setActiveTab(v as 'users' | 'presets')}
          />

          {activeTab === 'presets' ? (
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t.searchPlaceholderPresets}
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          ) : null}

          <TabsContent value="users" className="mt-3">
            {usersMasterDetail}
          </TabsContent>

          <TabsContent value="presets" className="mt-3">
            <PresetListMobile
              presets={filteredPresets}
              canManage={canManageRoles}
              onEdit={handleEditPreset}
              onDuplicate={handleDuplicatePreset}
              onDelete={(p) => setDeletingPreset(p)}
            />
          </TabsContent>
        </Tabs>

        {/* FAB contextual: Usuários → criar usuário | Presets → abrir dialog */}
        {canManageRoles && activeTab === 'users' && (
          <FABButton
            icon={<Plus className="h-5 w-5" />}
            label={t.fabUser}
            onClick={startCreateUser}
          />
        )}
        {canManageRoles && activeTab === 'presets' && (
          <FABButton
            icon={<Plus className="h-5 w-5" />}
            label={t.fabPreset}
            onClick={handleCreatePreset}
          />
        )}

        {/* Dialogs compartilhados */}
        <UserFormDialog
          open={userFormOpen}
          onOpenChange={(open) => { setUserFormOpen(open); if (!open) setEditingUser(null); }}
          onSubmit={editingUser ? handleEditUser : handleCreateUser}
          presets={presets}
          editingUser={editingUser}
        />

        <PermissionPresetDialog
          open={presetDialogOpen}
          onOpenChange={setPresetDialogOpen}
          presets={presets}
          onCreate={async (d) => { await createPreset.mutateAsync(d); }}
          onUpdate={async (d) => { await updatePreset.mutateAsync(d); }}
          onDelete={async (id) => { await deletePreset.mutateAsync(id); }}
        />

        <AlertDialog open={!!deletingUser} onOpenChange={(open) => { if (!open) setDeletingUser(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.deleteUserTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {t.deleteUserDesc.replace('{name}', deletingUser?.full_name ?? '')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteLoading}>{t.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteLoading ? t.deleteLoading : t.deletePermanently}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deletingPreset} onOpenChange={(open) => { if (!open) setDeletingPreset(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.deletePresetTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {t.deletePresetDesc.replace('{name}', deletingPreset?.name ?? '')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePresetConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ImagePreviewModal
          src={previewPhoto?.src || ''}
          alt={previewPhoto?.alt}
          open={!!previewPhoto}
          onClose={() => setPreviewPhoto(null)}
        />

        <UserLimitModal
          open={userLimitOpen}
          onOpenChange={setUserLimitOpen}
          currentUserCount={currentUserCount}
          maxUsers={maxUsers}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // DESKTOP — 100% inalterado (UI atual preservada).
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            {t.pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t.pageSubtitle.replace('{count}', String(currentUserCount)).replace('{max}', String(maxUsers)).replace('{active}', String(activeCount))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPresetDialogOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            {t.btnSettings}
          </Button>
          {canManageRoles && (
            <Button size="sm" onClick={startCreateUser}>
              <UserPlus className="h-4 w-4 mr-2" />
              {t.btnCreateUser}
            </Button>
          )}
        </div>
      </div>

      {!canAddUser && canManageRoles ? (
        <NoticeBanner
          variant="warning"
          icon={UsersIcon}
          title={t.limitTitle.replace('{count}', String(currentUserCount)).replace('{max}', String(maxUsers))}
          action={<Button size="sm" onClick={() => setUserLimitOpen(true)}><UserPlus className="mr-2 h-4 w-4" />{t.btnHireMore}</Button>}
        >
          {t.limitDesc}
        </NoticeBanner>
      ) : null}

      {usersMasterDetail}

      <UserFormDialog
        open={userFormOpen}
        onOpenChange={(open) => { setUserFormOpen(open); if (!open) setEditingUser(null); }}
        onSubmit={editingUser ? handleEditUser : handleCreateUser}
        presets={presets}
        editingUser={editingUser}
      />

      <PermissionPresetDialog
        open={presetDialogOpen}
        onOpenChange={setPresetDialogOpen}
        presets={presets}
        onCreate={async (d) => { await createPreset.mutateAsync(d); }}
        onUpdate={async (d) => { await updatePreset.mutateAsync(d); }}
        onDelete={async (id) => { await deletePreset.mutateAsync(id); }}
      />

      <AlertDialog open={!!deletingUser} onOpenChange={(open) => { if (!open) setDeletingUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteUserTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteUserDesc.replace('{name}', deletingUser?.full_name ?? '')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={deleteLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteLoading ? t.deleteLoading : t.deletePermanently}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImagePreviewModal src={previewPhoto?.src || ''} alt={previewPhoto?.alt} open={!!previewPhoto} onClose={() => setPreviewPhoto(null)} />
      <UserLimitModal open={userLimitOpen} onOpenChange={setUserLimitOpen} currentUserCount={currentUserCount} maxUsers={maxUsers} />
    </div>
  );
}
