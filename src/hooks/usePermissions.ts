import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Wrench,
  FileQuestion,
  Shield,
  Cpu,
  Handshake,
  TrendingUp,
  Package,
  DollarSign,
  Users,
  Settings,
  type LucideIcon,
} from 'lucide-react';

// ============ CATEGORIAS DE TELA ============
export const SCREEN_CATEGORIES: Record<string, { label: string; icon: LucideIcon }> = {
  geral: { label: 'Geral', icon: LayoutDashboard },
  servicos: { label: 'Serviços', icon: Wrench },
  comercial: { label: 'Comercial', icon: Handshake },
  operacional: { label: 'Operacional', icon: Package },
  financeiro: { label: 'Financeiro', icon: DollarSign },
  administracao: { label: 'Administração', icon: Settings },
};

// ============ PERMISSÕES DE TELA ============
export const SCREEN_PERMISSIONS = [
  { key: 'screen:dashboard', label: 'Dashboard', group: 'Geral', category: 'geral' },
  { key: 'screen:schedule', label: 'Agenda', group: 'Geral', category: 'geral' },
  { key: 'screen:service_orders', label: 'Ordens de Serviço', group: 'Serviços', category: 'servicos' },
  { key: 'screen:services', label: 'Serviços', group: 'Serviços', category: 'servicos' },
  { key: 'screen:questionnaires', label: 'Questionários', group: 'Serviços', category: 'servicos' },
  { key: 'screen:contracts', label: 'Contratos', group: 'Serviços', category: 'servicos' },
  { key: 'screen:equipment', label: 'Equipamentos', group: 'Serviços', category: 'servicos' },
  { key: 'screen:customers', label: 'Clientes', group: 'Comercial', category: 'comercial' },
  { key: 'screen:crm', label: 'CRM', group: 'Comercial', category: 'comercial' },
  { key: 'screen:inventory', label: 'Estoque', group: 'Operacional', category: 'operacional' },
  { key: 'screen:finance', label: 'Financeiro', group: 'Financeiro', category: 'financeiro' },
  { key: 'screen:users', label: 'Usuários', group: 'Administração', category: 'administracao' },
  { key: 'screen:settings', label: 'Configurações', group: 'Administração', category: 'administracao' },
] as const;

// ============ PERMISSÕES DE FUNÇÃO ============
export const FUNCTION_PERMISSIONS = [
  { key: 'fn:create_os', label: 'Criar OS', description: 'Criar novas ordens de serviço', group: 'Serviços', category: 'servicos' },
  { key: 'fn:edit_os', label: 'Editar OS', description: 'Editar ordens de serviço existentes', group: 'Serviços', category: 'servicos' },
  { key: 'fn:delete_os', label: 'Excluir OS', description: 'Excluir ordens de serviço', group: 'Serviços', category: 'servicos' },
  { key: 'fn:create_customer', label: 'Criar Cliente', description: 'Cadastrar novos clientes no sistema', group: 'Comercial', category: 'comercial' },
  { key: 'fn:edit_customer', label: 'Editar Cliente', description: 'Editar dados de clientes existentes', group: 'Comercial', category: 'comercial' },
  { key: 'fn:delete_customer', label: 'Excluir Cliente', description: 'Excluir clientes do sistema', group: 'Comercial', category: 'comercial' },
  { key: 'fn:manage_equipment', label: 'Gerenciar Equipamentos', description: 'Criar, editar e excluir equipamentos', group: 'Serviços', category: 'servicos' },
  { key: 'fn:manage_inventory', label: 'Gerenciar Estoque', description: 'Gerenciar materiais e movimentações de estoque', group: 'Operacional', category: 'operacional' },
  { key: 'fn:manage_finance', label: 'Gerenciar Financeiro', description: 'Criar e editar transações financeiras', group: 'Financeiro', category: 'financeiro' },
  { key: 'fn:view_finance_totals', label: 'Ver Totais Financeiros', description: 'Visualizar saldos, totais e projeções', group: 'Financeiro', category: 'financeiro' },
  { key: 'fn:manage_users', label: 'Gerenciar Usuários', description: 'Criar, editar e gerenciar usuários do sistema', group: 'Administração', category: 'administracao' },
  { key: 'fn:manage_settings', label: 'Gerenciar Configurações', description: 'Alterar configurações do sistema', group: 'Administração', category: 'administracao' },
  { key: 'fn:manage_crm', label: 'Gerenciar CRM', description: 'Gerenciar leads e pipeline comercial', group: 'Comercial', category: 'comercial' },
  { key: 'fn:manage_contracts', label: 'Gerenciar Contratos', description: 'Gerenciar contratos recorrentes e manutenções', group: 'Serviços', category: 'servicos' },
] as const;

export const ALL_PERMISSIONS = [...SCREEN_PERMISSIONS, ...FUNCTION_PERMISSIONS];

export type PermissionKey = string;

export const PERMISSION_GROUPS = Array.from(new Set(ALL_PERMISSIONS.map(p => p.group)));

export function getPermissionsByGroup(group: string): { key: string; label: string; group: string }[] {
  return ALL_PERMISSIONS.filter(p => p.group === group);
}

export function getScreensByCategory(category: string) {
  return SCREEN_PERMISSIONS.filter(p => p.category === category);
}

export function getFunctionsByCategory(category: string) {
  return FUNCTION_PERMISSIONS.filter(p => p.category === category);
}

export function getAllPermissionKeys(): string[] {
  return ALL_PERMISSIONS.map(p => p.key);
}

export interface PermissionPreset {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface UserPermission {
  id: string;
  user_id: string;
  permissions: string[];
  preset_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function usePermissionPresets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: presets = [], isLoading } = useQuery({
    queryKey: ['permission-presets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permission_presets')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []).map(p => ({
        ...p,
        permissions: (p.permissions as any) || [],
      })) as PermissionPreset[];
    },
  });

  const createPreset = useMutation({
    mutationFn: async (preset: { name: string; description?: string; permissions: string[] }) => {
      const { error } = await supabase
        .from('permission_presets')
        .insert({ name: preset.name, description: preset.description || null, permissions: preset.permissions as any });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission-presets'] });
      toast({ title: 'Cargo criado com sucesso!' });
    },
    onError: (e) => toast({ title: 'Erro ao criar cargo', description: e.message, variant: 'destructive' }),
  });

  const updatePreset = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string; permissions?: string[] }) => {
      const { error } = await supabase
        .from('permission_presets')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission-presets'] });
      toast({ title: 'Cargo atualizado com sucesso!' });
    },
    onError: (e) => toast({ title: 'Erro ao atualizar cargo', description: e.message, variant: 'destructive' }),
  });

  const deletePreset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('permission_presets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission-presets'] });
      toast({ title: 'Cargo excluído com sucesso!' });
    },
    onError: (e) => toast({ title: 'Erro ao excluir cargo', description: e.message, variant: 'destructive' }),
  });

  return { presets, isLoading, createPreset, updatePreset, deletePreset };
}

export function useUserPermissions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: userPermissions = [], isLoading } = useQuery({
    queryKey: ['user-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_permissions')
        .select('*');
      if (error) throw error;
      return (data || []).map(p => ({
        ...p,
        permissions: (p.permissions as any) || [],
      })) as UserPermission[];
    },
  });

  const upsertPermissions = useMutation({
    mutationFn: async ({ user_id, permissions, preset_id, is_active }: {
      user_id: string;
      permissions: string[];
      preset_id?: string | null;
      is_active?: boolean;
    }) => {
      const { error } = await supabase
        .from('user_permissions')
        .upsert({
          user_id,
          permissions: permissions as any,
          preset_id: preset_id || null,
          is_active: is_active ?? true,
        }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Permissões atualizadas!' });
    },
    onError: (e) => toast({ title: 'Erro ao atualizar permissões', description: e.message, variant: 'destructive' }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ user_id, is_active }: { user_id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('user_permissions')
        .update({ is_active })
        .eq('user_id', user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Status atualizado!' });
    },
    onError: (e) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  return { userPermissions, isLoading, upsertPermissions, toggleActive };
}
