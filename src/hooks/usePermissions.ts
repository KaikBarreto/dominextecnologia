import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Wrench,
  FileQuestion,
  ScrollText,
  Boxes,
  Users,
  UserCog,
  TrendingUp,
  FileText,
  Package,
  HardHat,
  Map,
  DollarSign,
  Receipt,
  Briefcase,
  Handshake,
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
// `description` aparece abaixo do rótulo no editor de permissões (o admin precisa
// saber a CONSEQUÊNCIA de desligar a tela, não só o nome dela).
// `icon` espelha o ícone do menu lateral pra tela ser reconhecida de bate-pronto.
export const SCREEN_PERMISSIONS = [
  { key: 'screen:dashboard', label: 'Dashboard', description: 'Painel inicial com os indicadores e atalhos do dia a dia.', icon: LayoutDashboard, group: 'Geral', category: 'geral' },
  { key: 'screen:schedule', label: 'Agenda', description: 'Calendário de tarefas e visitas agendadas (sem esta tela o usuário não enxerga nem a própria agenda).', icon: Calendar, group: 'Geral', category: 'geral' },
  { key: 'screen:service_orders', label: 'Ordens de Serviço', description: 'Lista completa de OS, com abertura, acompanhamento e histórico.', icon: ClipboardList, group: 'Serviços', category: 'servicos' },
  { key: 'screen:services', label: 'Serviços', description: 'Catálogo de serviços prestados e seus valores.', icon: Wrench, group: 'Serviços', category: 'servicos' },
  { key: 'screen:questionnaires', label: 'Checklists', description: 'Modelos de checklist usados dentro das ordens de serviço.', icon: FileQuestion, group: 'Serviços', category: 'servicos' },
  { key: 'screen:contracts', label: 'Contratos', description: 'Contratos recorrentes, PMOC e as visitas programadas de cada um.', icon: ScrollText, group: 'Serviços', category: 'servicos' },
  { key: 'screen:equipment', label: 'Equipamentos', description: 'Cadastro dos equipamentos dos clientes e o histórico de cada um.', icon: Boxes, group: 'Serviços', category: 'servicos' },
  { key: 'screen:customers', label: 'Clientes', description: 'Cadastro de clientes, com contatos, endereços e histórico de atendimento.', icon: Users, group: 'Comercial', category: 'comercial' },
  { key: 'screen:crm', label: 'CRM', description: 'Funil comercial com leads, oportunidades e follow-ups (também exige o módulo contratado).', icon: TrendingUp, group: 'Comercial', category: 'comercial' },
  { key: 'screen:quotes', label: 'Orçamentos', description: 'Orçamentos e propostas enviadas aos clientes.', icon: FileText, group: 'Comercial', category: 'comercial' },
  { key: 'screen:inventory', label: 'Estoque', description: 'Materiais, saldos e movimentações de estoque.', icon: Package, group: 'Operacional', category: 'operacional' },
  { key: 'screen:technician_tools', label: 'Área do Técnico™', description: 'Ferramentas de apoio do técnico em campo, como cálculos e tabelas.', icon: HardHat, group: 'Operacional', category: 'operacional' },
  { key: 'screen:tracking', label: 'Mapa e Rastreamento', description: 'Mapa ao vivo com a posição das equipes em campo.', icon: Map, group: 'Operacional', category: 'operacional' },
  { key: 'screen:finance', label: 'Financeiro', description: 'Visão geral, movimentações e contas a pagar e receber.', icon: DollarSign, group: 'Financeiro', category: 'financeiro' },
  { key: 'screen:fiscal_notes', label: 'Notas Fiscais', description: 'Emissão e consulta de notas fiscais de serviço (também exige o módulo contratado).', icon: Receipt, group: 'Financeiro', category: 'financeiro' },
  { key: 'screen:employees', label: 'Funcionários', description: 'Cadastro de funcionários, folha de pagamento e controle de ponto.', icon: Briefcase, group: 'Administração', category: 'administracao' },
  { key: 'screen:users', label: 'Usuários', description: 'Lista de usuários do sistema e os perfis de acesso de cada um.', icon: UserCog, group: 'Administração', category: 'administracao' },
  { key: 'screen:settings', label: 'Configurações', description: 'Dados da empresa, aparência e preferências do sistema.', icon: Settings, group: 'Administração', category: 'administracao' },
] as const;

// ============ PERMISSÕES DE FUNÇÃO ============
// `relatedScreen` diz a qual TELA a ação pertence — é o que permite o editor de
// permissões mostrar cada ação recolhida dentro da sua tela (acordeão). Ação sem
// `relatedScreen` cai no bloco "Geral" do editor.
// ATENÇÃO: ação continua valendo por conta própria mesmo com a tela desligada
// (ex.: quem edita OS só pelo link de campo não precisa de `screen:service_orders`).
export const FUNCTION_PERMISSIONS = [
  { key: 'fn:create_os', label: 'Criar OS', description: 'Criar novas ordens de serviço', group: 'Serviços', category: 'servicos', relatedScreen: 'screen:service_orders' },
  { key: 'fn:edit_os', label: 'Editar OS', description: 'Editar ordens de serviço existentes', group: 'Serviços', category: 'servicos', relatedScreen: 'screen:service_orders' },
  { key: 'fn:delete_os', label: 'Excluir OS', description: 'Excluir ordens de serviço', group: 'Serviços', category: 'servicos', relatedScreen: 'screen:service_orders' },
  { key: 'fn:create_customer', label: 'Criar Cliente', description: 'Cadastrar novos clientes no sistema', group: 'Comercial', category: 'comercial', relatedScreen: 'screen:customers' },
  { key: 'fn:edit_customer', label: 'Editar Cliente', description: 'Editar dados de clientes existentes', group: 'Comercial', category: 'comercial', relatedScreen: 'screen:customers' },
  { key: 'fn:delete_customer', label: 'Excluir Cliente', description: 'Excluir clientes do sistema', group: 'Comercial', category: 'comercial', relatedScreen: 'screen:customers' },
  { key: 'fn:manage_equipment', label: 'Gerenciar Equipamentos', description: 'Criar, editar e excluir equipamentos', group: 'Serviços', category: 'servicos', relatedScreen: 'screen:equipment' },
  { key: 'fn:manage_inventory', label: 'Gerenciar Estoque', description: 'Gerenciar materiais e movimentações de estoque', group: 'Operacional', category: 'operacional', relatedScreen: 'screen:inventory' },
  { key: 'fn:manage_finance', label: 'Gerenciar Financeiro', description: 'Criar e editar transações financeiras', group: 'Financeiro', category: 'financeiro', relatedScreen: 'screen:finance' },
  { key: 'fn:delete_finance', label: 'Excluir Lançamento Financeiro', description: 'Excluir transações financeiras (contas a pagar, contas a receber e movimentações)', group: 'Financeiro', category: 'financeiro', relatedScreen: 'screen:finance' },
  { key: 'fn:view_finance_totals', label: 'Ver Totais Financeiros', description: 'Visualizar saldos, totais e projeções', group: 'Financeiro', category: 'financeiro', relatedScreen: 'screen:finance' },
  { key: 'fn:manage_users', label: 'Gerenciar Usuários', description: 'Criar, editar e gerenciar usuários do sistema', group: 'Administração', category: 'administracao', relatedScreen: 'screen:users' },
  { key: 'fn:manage_settings', label: 'Gerenciar Configurações', description: 'Alterar configurações do sistema', group: 'Administração', category: 'administracao', relatedScreen: 'screen:settings' },
  { key: 'fn:manage_crm', label: 'Gerenciar CRM', description: 'Gerenciar leads e pipeline comercial', group: 'Comercial', category: 'comercial', relatedScreen: 'screen:crm' },
  { key: 'fn:manage_contracts', label: 'Gerenciar Contratos', description: 'Gerenciar contratos recorrentes e manutenções', group: 'Serviços', category: 'servicos', relatedScreen: 'screen:contracts' },
  { key: 'fn:view_financial_schedule', label: 'Ver Contas na Agenda', description: 'Visualizar contas a pagar e receber na agenda como avisos', group: 'Financeiro', category: 'financeiro', relatedScreen: 'screen:schedule' },
  { key: 'fn:manage_employees', label: 'Gerenciar Funcionários', description: 'Criar, editar e gerenciar funcionários e movimentações', group: 'Administração', category: 'administracao', relatedScreen: 'screen:employees' },
  { key: 'fn:manage_timeclock', label: 'Gerenciar Ponto', description: 'Visualizar e gerenciar controle de ponto de todos os funcionários', group: 'Administração', category: 'administracao', relatedScreen: 'screen:employees' },
  { key: 'fn:view_customer_financial', label: 'Ver Financeiro do Cliente', description: 'Visualizar aba financeira na ficha do cliente', group: 'Comercial', category: 'comercial', relatedScreen: 'screen:customers' },
  { key: 'fn:reopen_os', label: 'Reabrir OS', description: 'Reabrir ordens de serviço concluídas para edição', group: 'Serviços', category: 'servicos', relatedScreen: 'screen:service_orders' },
  { key: 'fn:view_all_schedule', label: 'Ver Toda a Agenda', description: 'Ver todas as tarefas da agenda, não apenas as próprias', group: 'Geral', category: 'geral', relatedScreen: 'screen:schedule' },
  { key: 'fn:editar_os_campo', label: 'Editar OS em campo', description: 'Editar equipamentos e checklists dentro de uma OS em andamento', group: 'Serviços', category: 'servicos', relatedScreen: 'screen:service_orders' },
] as const;

export const ALL_PERMISSIONS = [...SCREEN_PERMISSIONS, ...FUNCTION_PERMISSIONS];

export type PermissionKey = string;

/** Item de tela do catálogo, já com descrição e ícone (shape usado pelo editor). */
export type ScreenPermission = (typeof SCREEN_PERMISSIONS)[number];
/** Item de ação do catálogo (shape usado pelo editor). */
export type FunctionPermission = (typeof FUNCTION_PERMISSIONS)[number];

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

/** Ações que pertencem a uma tela (acordeão do editor de permissões). */
export function getFunctionsByScreen(screenKey: string): FunctionPermission[] {
  return FUNCTION_PERMISSIONS.filter(p => p.relatedScreen === screenKey);
}

/**
 * Ações SEM tela-pai (ou apontando pra uma tela que não existe mais no catálogo).
 * Hoje devolve lista vazia, mas o editor renderiza o bloco "Geral" quando houver —
 * assim uma ação nova nunca some da tela por esquecimento de `relatedScreen`.
 */
export function getOrphanFunctions(): FunctionPermission[] {
  const screenKeys = new Set<string>(SCREEN_PERMISSIONS.map(s => s.key));
  return FUNCTION_PERMISSIONS.filter(p => !p.relatedScreen || !screenKeys.has(p.relatedScreen));
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
    onError: (e) => toast({ title: 'Erro ao criar cargo', description: getErrorMessage(e), variant: 'destructive' }),
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
    onError: (e) => toast({ title: 'Erro ao atualizar cargo', description: getErrorMessage(e), variant: 'destructive' }),
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
    onError: (e) => toast({ title: 'Erro ao excluir cargo', description: getErrorMessage(e), variant: 'destructive' }),
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
    onError: (e) => toast({ title: 'Erro ao atualizar permissões', description: getErrorMessage(e), variant: 'destructive' }),
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
    onError: (e) => toast({ title: 'Erro', description: getErrorMessage(e), variant: 'destructive' }),
  });

  return { userPermissions, isLoading, upsertPermissions, toggleActive };
}
