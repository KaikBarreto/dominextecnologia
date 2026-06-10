import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { Search, Shield, Settings2, UserPlus, Pencil, UserX, UserCheck, Trash2, ShieldCheck, Plus, LayoutList, LayoutGrid, Users as UsersIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
import { UserListMobile } from '@/components/users/UserListMobile';
import { PresetListMobile } from '@/components/users/PresetListMobile';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { FABButton } from '@/components/mobile/FABButton';
import { getErrorMessage } from '@/utils/errorMessages';

export default function Users() {
  const isMobile = useIsMobile();
  const { users, isLoading, updateUserRole, canManageRoles, currentUserRole } = useUsers();
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
  // View mode (lista é o default) — persistido em localStorage, igual EcoSistema.
  const [viewMode, setViewMode] = useState<'list' | 'cards'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('users-view-mode') : null;
    return saved === 'cards' || saved === 'list' ? saved : 'list';
  });
  const handleViewModeChange = (value: string) => {
    if (value === 'list' || value === 'cards') {
      setViewMode(value);
      localStorage.setItem('users-view-mode', value);
    }
  };

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

  const filteredUsers = users.filter(u =>
    fuzzyIncludes(u.full_name, searchQuery) ||
    fuzzyIncludes(u.phone, searchQuery)
  );

  const filteredPresets = presets.filter(p =>
    fuzzyIncludes(p.name, searchQuery) ||
    fuzzyIncludes(p.description, searchQuery)
  );

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const getUserPermission = (userId: string) =>
    userPermissions.find(p => p.user_id === userId);

  const uploadPhoto = async (userId: string, file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `user-${userId}-${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('customer-photos')
      .upload(fileName, file, { upsert: true });
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

      toast({ title: 'Usuário criado com sucesso!' });
      window.location.reload();
    } catch (e: any) {
      const msg = (e.message || '').toLowerCase();
      const friendlyMsg = msg.includes('already') || msg.includes('duplicate') || msg.includes('already been registered')
        ? 'Este e-mail já está cadastrado no sistema.'
        : getErrorMessage(e);
      toast({ title: 'Erro ao criar usuário', description: friendlyMsg, variant: 'destructive' });
      throw e;
    }
  };

  const handleEditUser = async (data: any) => {
    if (!editingUser) return;
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

      toast({ title: 'Usuário atualizado!' });
      window.location.reload();
    } catch (e: any) {
      toast({ title: 'Erro', description: getErrorMessage(e), variant: 'destructive' });
      throw e;
    }
  };

  // Desativar conta (reversível): libera slot e derruba a sessão do usuário.
  const handleDeactivateUser = async (userProfile: UserWithRole) => {
    if (userProfile.user_id === user?.id) return; // não pode se desativar
    try {
      const { data: result, error } = await supabase.functions.invoke('manage-user', {
        body: { action: 'deactivate_user', user_id: userProfile.user_id },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast({ title: 'Usuário desativado', description: 'O slot foi liberado. Você pode reativá-lo depois.' });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['company-user-count'] });
    } catch (e: any) {
      toast({ title: 'Erro ao desativar', description: getErrorMessage(e), variant: 'destructive' });
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
      toast({ title: 'Usuário reativado!' });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['company-user-count'] });
    } catch (e: any) {
      toast({ title: 'Erro ao reativar', description: getErrorMessage(e), variant: 'destructive' });
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setDeleteLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('manage-user', {
        body: { action: 'delete_user', user_id: deletingUser.user_id },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast({ title: 'Usuário excluído permanentemente!' });
      setDeletingUser(null);
      window.location.reload();
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: getErrorMessage(e), variant: 'destructive' });
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

  const isCurrentUser = (profile: UserWithRole) => profile.user_id === user?.id;

  // Conta ativos pelo status da CONTA (profiles.is_active). undefined = ativo.
  const activeCount = users.filter(u => u.is_active !== false).length;

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
      toast({ title: 'Cargo duplicado!' });
    } catch (e) {
      toast({ title: 'Erro ao duplicar', description: getErrorMessage(e, 'Erro inesperado'), variant: 'destructive' });
    }
  };

  const handleDeletePresetConfirm = async () => {
    if (!deletingPreset) return;
    try {
      await deletePreset.mutateAsync(deletingPreset.id);
      toast({ title: 'Cargo excluído!' });
      setDeletingPreset(null);
    } catch (e) {
      toast({ title: 'Erro ao excluir', description: getErrorMessage(e, 'Erro inesperado'), variant: 'destructive' });
    }
  };

  // ---------------------------------------------------------------------------
  // MOBILE — 2 tabs (Usuários / Presets), padrão app nativo.
  // ---------------------------------------------------------------------------
  if (isMobile) {
    return (
      <div className={cn('space-y-4 min-w-0 w-full max-w-full overflow-x-hidden pb-24')}>
        <MobilePageHeader
          title="Usuários"
          subtitle={`${currentUserCount}/${maxUsers} usuários • ${activeCount} ativos`}
          icon={ShieldCheck}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'users' | 'presets')} className="w-full">
          <MobilePillTabs
            tabs={[
              { value: 'users', label: 'Usuários' },
              { value: 'presets', label: 'Cargos' },
            ]}
            activeTab={activeTab}
            onTabChange={(v) => setActiveTab(v as 'users' | 'presets')}
          />

          {/* Busca compartilhada (placeholder muda conforme tab) */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={activeTab === 'users' ? 'Buscar usuários...' : 'Buscar cargos...'}
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <TabsContent value="users" className="mt-3">
            <UserListMobile
              users={filteredUsers}
              isLoading={isLoading}
              searchQuery={searchQuery}
              currentUserId={user?.id}
              canManageRoles={canManageRoles}
              canAddUser={canAddUser}
              userPermissions={userPermissions}
              presets={presets}
              onEdit={openEditUser}
              onDeactivate={handleDeactivateUser}
              onReactivate={handleReactivateUser}
              onDelete={(u) => setDeletingUser(u)}
              onPreviewPhoto={(src, alt) => setPreviewPhoto({ src, alt })}
            />
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
            label="Usuário"
            onClick={startCreateUser}
          />
        )}
        {canManageRoles && activeTab === 'presets' && (
          <FABButton
            icon={<Plus className="h-5 w-5" />}
            label="Cargo"
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
              <AlertDialogTitle>Excluir usuário permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação é irreversível. O usuário <strong>{deletingUser?.full_name}</strong> será removido permanentemente do sistema, incluindo login, permissões e vínculos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteLoading ? 'Excluindo...' : 'Excluir Permanentemente'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deletingPreset} onOpenChange={(open) => { if (!open) setDeletingPreset(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir cargo?</AlertDialogTitle>
              <AlertDialogDescription>
                O cargo <strong>{deletingPreset?.name}</strong> será removido. Usuários que estavam vinculados a ele mantêm as permissões individuais. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePresetConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
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
            Usuários e Permissões
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {currentUserCount}/{maxUsers} usuários • {activeCount} ativos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup type="single" value={viewMode} onValueChange={handleViewModeChange}>
            <ToggleGroupItem value="list" aria-label="Lista"><LayoutList className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="cards" aria-label="Cards"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" size="sm" onClick={() => setPresetDialogOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Configurações
          </Button>
          {canManageRoles && (
            <Button size="sm" onClick={startCreateUser}>
              <UserPlus className="h-4 w-4 mr-2" />
              Criar Usuário
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
          {/* Aviso de limite atingido: convida a contratar mais usuários */}
          {!canAddUser && canManageRoles && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <UsersIcon className="h-5 w-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Limite de usuários atingido ({currentUserCount}/{maxUsers})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Para cadastrar novos usuários, adicione usuários extras ao seu plano.
                  </p>
                </div>
              </div>
              <Button size="sm" className="shrink-0" onClick={() => setUserLimitOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Contratar mais usuários
              </Button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Users List */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-muted-foreground">
                  {searchQuery ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className={viewMode === 'cards' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-3'}>
              {filteredUsers.map((userProfile) => {
                const perm = getUserPermission(userProfile.user_id);
                const isActive = userProfile.is_active !== false;
                const permCount = perm?.permissions?.length || 0;
                const preset = perm?.preset_id ? presets.find(p => p.id === perm.preset_id) : null;
                // Curinga '*' (Acesso Total dinâmico) OU snapshot legado com todas as chaves.
                const isAllPerms = (perm?.permissions?.includes('*') ?? false) || permCount >= getAllPermissionKeys().length;

                return (
                  <Card key={userProfile.id} className={`hover:shadow-md transition-shadow ${!isActive ? 'opacity-60' : ''}`}>
                    <CardContent className="p-4">
                      <div className={cn(
                        'flex justify-between gap-3',
                        viewMode === 'cards'
                          ? 'flex-col'
                          : 'flex-col sm:flex-row sm:items-center',
                      )}>
                        {/* Avatar + Info */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className="shrink-0 cursor-pointer"
                            onClick={() => userProfile.avatar_url && setPreviewPhoto({ src: userProfile.avatar_url, alt: userProfile.full_name })}
                          >
                            <Avatar className="h-12 w-12 border-2 border-border">
                              <AvatarImage src={userProfile.avatar_url || undefined} alt={userProfile.full_name} />
                              <AvatarFallback className="bg-muted text-muted-foreground">
                                {getInitials(userProfile.full_name)}
                              </AvatarFallback>
                            </Avatar>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h3 className="font-semibold text-base truncate">{userProfile.full_name}</h3>
                              {isCurrentUser(userProfile) && (
                                <Badge variant="outline" className="text-xs">Você</Badge>
                              )}
                              {isActive ? (
                                <Badge className="bg-primary text-primary-foreground text-xs">Ativo</Badge>
                              ) : (
                                <Badge className="bg-destructive hover:bg-destructive text-white text-xs">Inativo</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{userProfile.phone || '—'}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <Badge className="bg-gradient-to-r from-gray-800 to-gray-900 text-white border-0 text-xs">
                                <Shield className="h-3 w-3 mr-1.5" />
                                {preset ? preset.name : isAllPerms ? 'Acesso Total' : `${permCount} permissões`}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        {canManageRoles && (
                          <div className={cn(
                            'flex gap-2 shrink-0',
                            viewMode === 'cards' ? 'justify-end pt-1 border-t mt-1' : 'self-end sm:self-center',
                          )}>
                            <Button
                              variant="edit-ghost"
                              size="sm"
                              onClick={() => openEditUser(userProfile)}
                              title="Editar usuário"
                            >
                              <Pencil className="h-4 w-4 sm:mr-2" />
                              <span className="hidden sm:inline">Editar</span>
                            </Button>
                            {!isCurrentUser(userProfile) && (
                              <>
                                {isActive ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeactivateUser(userProfile)}
                                    title="Desativar usuário (reversível)"
                                    className="hover:bg-orange-500 hover:text-white hover:border-orange-500"
                                  >
                                    <UserX className="h-4 w-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Desativar</span>
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleReactivateUser(userProfile)}
                                    disabled={!canAddUser}
                                    title={canAddUser
                                      ? 'Reativar usuário'
                                      : 'Sem slot livre — faça upgrade ou desative outro'}
                                    className="hover:bg-green-600 hover:text-white hover:border-green-600"
                                  >
                                    <UserCheck className="h-4 w-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Reativar</span>
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setDeletingUser(userProfile)}
                                  title="Excluir usuário permanentemente"
                                  className="hover:bg-destructive hover:text-white hover:border-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
      </div>

      {/* Dialogs */}
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => { if (!open) setDeletingUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O usuário <strong>{deletingUser?.full_name}</strong> será removido permanentemente do sistema, incluindo login, permissões e vínculos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? 'Excluindo...' : 'Excluir Permanentemente'}
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
