import { useState } from 'react';
import { UserCircle, Search, Shield, Settings2, UserPlus, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsers, ROLE_LABELS, ROLE_COLORS, type AppRole, type UserWithRole } from '@/hooks/useUsers';
import { useUserPermissions, usePermissionPresets } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { UserFormDialog } from '@/components/users/UserFormDialog';
import { PermissionPresetDialog } from '@/components/users/PermissionPresetDialog';

export default function Users() {
  const { users, isLoading, updateUserRole, canManageRoles } = useUsers();
  const { userPermissions, upsertPermissions, toggleActive } = useUserPermissions();
  const { presets, createPreset, updatePreset, deletePreset } = usePermissionPresets();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.phone?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const getUserPermission = (userId: string) =>
    userPermissions.find(p => p.user_id === userId);

  const handleCreateUser = async (data: any) => {
    try {
      const { data: result, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: data.email,
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

      toast({ title: 'Usuário criado com sucesso!' });
      // Refetch
      window.location.reload();
    } catch (e: any) {
      toast({ title: 'Erro ao criar usuário', description: e.message, variant: 'destructive' });
      throw e;
    }
  };

  const handleEditUser = async (data: any) => {
    if (!editingUser) return;
    try {
      // Update profile name/phone
      await supabase
        .from('profiles')
        .update({ full_name: data.full_name, phone: data.phone || null })
        .eq('user_id', editingUser.user_id);

      // Update role
      if (data.role) {
        await updateUserRole.mutateAsync({ userId: editingUser.user_id, role: data.role });
      }

      // Update permissions
      await upsertPermissions.mutateAsync({
        user_id: editingUser.user_id,
        permissions: data.permissions,
        preset_id: data.preset_id,
      });

      toast({ title: 'Usuário atualizado!' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
      throw e;
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    const perm = getUserPermission(userId);
    if (perm) {
      await toggleActive.mutateAsync({ user_id: userId, is_active: !currentActive });
    } else {
      // Create a permissions record with is_active = false
      await upsertPermissions.mutateAsync({ user_id: userId, permissions: [], is_active: false });
    }
  };

  const openEditUser = (userProfile: UserWithRole) => {
    const perm = getUserPermission(userProfile.user_id);
    setEditingUser({
      user_id: userProfile.user_id,
      full_name: userProfile.full_name,
      phone: userProfile.phone,
      role: userProfile.role,
      permissions: perm?.permissions || [],
      preset_id: perm?.preset_id || null,
    });
    setUserFormOpen(true);
  };

  const isCurrentUser = (profile: UserWithRole) => profile.user_id === user?.id;

  const activeCount = users.filter(u => {
    const perm = getUserPermission(u.user_id);
    return !perm || perm.is_active;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">Usuários e Permissões</h1>
            <p className="text-muted-foreground">{users.length} usuários • {activeCount} ativos</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPresetDialogOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Cargos
          </Button>
          {canManageRoles && (
            <Button size="sm" onClick={() => { setEditingUser(null); setUserFormOpen(true); }}>
              <UserPlus className="h-4 w-4 mr-2" />
              Criar Usuário
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar usuário..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Equipe
          </CardTitle>
          <CardDescription>Gerencie usuários, permissões e acessos do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-9 w-32" />
                </div>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserCircle className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">
                {searchQuery ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
              </h3>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((userProfile) => {
                const perm = getUserPermission(userProfile.user_id);
                const isActive = !perm || perm.is_active;
                const permCount = perm?.permissions?.length || 0;
                const preset = perm?.preset_id ? presets.find(p => p.id === perm.preset_id) : null;

                return (
                  <div
                    key={userProfile.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-card-hover transition-shadow ${
                      isCurrentUser(userProfile) ? 'ring-2 ring-primary/20' : ''
                    } ${!isActive ? 'opacity-50' : ''}`}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={userProfile.avatar_url || undefined} alt={userProfile.full_name} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(userProfile.full_name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium truncate">{userProfile.full_name}</h4>
                        {isCurrentUser(userProfile) && (
                          <Badge variant="outline" className="text-xs">Você</Badge>
                        )}
                        <Badge variant={isActive ? 'default' : 'secondary'} className="text-xs">
                          {isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {userProfile.role && (
                          <Badge variant="secondary" className={`text-xs ${ROLE_COLORS[userProfile.role]}`}>
                            {ROLE_LABELS[userProfile.role]}
                          </Badge>
                        )}
                        {preset && (
                          <Badge variant="outline" className="text-xs">
                            {preset.name}
                          </Badge>
                        )}
                        {permCount > 0 && !preset && (
                          <Badge variant="outline" className="text-xs">
                            {permCount} permissões
                          </Badge>
                        )}
                      </div>
                    </div>

                    {canManageRoles && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditUser(userProfile)}
                        >
                          Editar
                        </Button>
                        {!isCurrentUser(userProfile) && (
                          <Button
                            variant={isActive ? 'ghost' : 'outline'}
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => handleToggleActive(userProfile.user_id, isActive)}
                            title={isActive ? 'Desativar' : 'Ativar'}
                          >
                            <Power className={`h-4 w-4 ${isActive ? 'text-muted-foreground' : 'text-primary'}`} />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
