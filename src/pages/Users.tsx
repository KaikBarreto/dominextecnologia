import { useState } from 'react';
import { UserCircle, Search, Phone, Shield, AlertCircle, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useUsers, type UserWithRole, ROLE_LABELS, ROLE_COLORS, type AppRole } from '@/hooks/useUsers';
import { useAuth } from '@/contexts/AuthContext';

const ROLES: AppRole[] = ['admin', 'gestor', 'tecnico', 'comercial', 'financeiro'];

export default function Users() {
  const { users, isLoading, stats, updateUserRole, canManageRoles, hasAdmin, currentUserRole } = useUsers();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = users.filter(user =>
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.phone?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleRoleChange = async (userId: string, role: AppRole) => {
    await updateUserRole.mutateAsync({ userId, role });
  };

  const isCurrentUser = (profile: UserWithRole) => profile.user_id === user?.id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">Gerencie os usuários do sistema</p>
        </div>
      </div>

      {/* Bootstrap Admin Alert */}
      {!hasAdmin && (
        <Alert className="border-warning bg-warning/10">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertTitle className="text-warning">Configuração Inicial</AlertTitle>
          <AlertDescription>
            Nenhum administrador foi definido ainda. Selecione uma role "Administrador" para seu usuário para poder gerenciar a equipe.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                {isLoading ? (
                  <Skeleton className="h-6 w-8 mt-1" />
                ) : (
                  <p className="text-xl font-bold">{stats.total}</p>
                )}
              </div>
              <UserCircle className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>

        {ROLES.slice(0, 4).map(role => (
          <Card key={role} className="bg-gradient-to-br from-card to-muted/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
                  {isLoading ? (
                    <Skeleton className="h-6 w-8 mt-1" />
                  ) : (
                    <p className="text-xl font-bold">{stats.byRole[role] || 0}</p>
                  )}
                </div>
                <Shield className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
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
            <UserCircle className="h-5 w-5" />
            Lista de Usuários
          </CardTitle>
          <CardDescription>
            {canManageRoles 
              ? 'Você pode gerenciar as roles dos usuários' 
              : 'Apenas administradores e gestores podem alterar roles'}
          </CardDescription>
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
              <p className="text-muted-foreground">
                {searchQuery ? 'Tente buscar por outro termo' : 'Os usuários aparecerão aqui após o cadastro'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((userProfile) => (
                <div
                  key={userProfile.id}
                  className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-card-hover transition-shadow ${
                    isCurrentUser(userProfile) ? 'ring-2 ring-primary/20' : ''
                  }`}
                >
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={userProfile.avatar_url || undefined} alt={userProfile.full_name} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(userProfile.full_name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium truncate">{userProfile.full_name}</h4>
                      {isCurrentUser(userProfile) && (
                        <Badge variant="outline" className="text-xs">Você</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {userProfile.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          {userProfile.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {userProfile.role && (
                      <Badge variant="secondary" className={ROLE_COLORS[userProfile.role]}>
                        {ROLE_LABELS[userProfile.role]}
                      </Badge>
                    )}
                    
                    {(canManageRoles || (!hasAdmin && isCurrentUser(userProfile))) && (
                      <Select
                        value={userProfile.role || 'none'}
                        onValueChange={(value) => {
                          if (value !== 'none') {
                            handleRoleChange(userProfile.user_id, value as AppRole);
                          }
                        }}
                        disabled={updateUserRole.isPending}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Selecionar role" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map(role => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
