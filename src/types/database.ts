// Tipos do sistema de gestão

export type AppRole = 'admin' | 'gestor' | 'tecnico' | 'comercial' | 'financeiro' | 'super_admin';

export type OsStatus = 'agendada' | 'pendente' | 'a_caminho' | 'em_andamento' | 'pausada' | 'concluida' | 'cancelada';

export type OsType = 'manutencao_preventiva' | 'manutencao_corretiva' | 'instalacao' | 'visita_tecnica';

export type CustomerType = 'pf' | 'pj';

export type TransactionType = 'entrada' | 'saida';

export type LeadStatus = 'lead' | 'proposta' | 'negociacao' | 'fechado_ganho' | 'fechado_perdido';

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  company_id?: string | null;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Customer {
  id: string;
  customer_type: CustomerType;
  name: string;
  company_name?: string;
  document?: string;
  email?: string;
  phone?: string;
  address?: string;
  address_number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  birth_date?: string;
  notes?: string;
  photo_url?: string;
  origin?: string;
  created_at: string;
  updated_at: string;
}

export interface Equipment {
  id: string;
  customer_id: string;
  name: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  capacity?: string;
  location?: string;
  install_date?: string;
  notes?: string;
  category_id?: string;
  identifier?: string;
  status: string;
  photo_url?: string;
  warranty_until?: string;
  custom_fields?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ServiceOrder {
  id: string;
  order_number: number;
  customer_id: string;
  equipment_id?: string;
  technician_id?: string;
  os_type: OsType;
  status: OsStatus;
  service_type_id?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  description?: string;
  diagnosis?: string;
  solution?: string;
  parts_used?: any[];
  labor_hours?: number;
  labor_value?: number;
  parts_value?: number;
  total_value?: number;
  check_in_time?: string;
  check_in_location?: { lat: number; lng: number } | null;
  check_out_time?: string;
  check_out_location?: { lat: number; lng: number } | null;
  client_signature?: string;
  notes?: string;
  contract_id?: string;
  created_by?: string;
  team_id?: string;
  form_template_id?: string;
  created_at: string;
  updated_at: string;
  // Relations
  customer?: Customer;
  equipment?: Equipment;
  technician?: Profile;
  form_template?: FormTemplate;
  service_type?: { id: string; name: string; color: string } | null;
}

export interface FormTemplate {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  service_type_id?: string;
  service_type_ids?: string[];
  applies_to_all_services?: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  questions?: FormQuestion[];
}

export interface FormQuestion {
  id: string;
  template_id: string;
  question: string;
  question_type: 'boolean' | 'text' | 'number' | 'photo' | 'select' | 'signature';
  options?: string[];
  is_required: boolean;
  position: number;
  description?: string;
  require_camera?: boolean;
  answer_types?: string[];
  answer_mode?: 'exclusive' | 'combined';
  created_at: string;
}

export interface FormResponse {
  id: string;
  service_order_id: string;
  question_id: string;
  response_value?: string;
  response_photo_url?: string;
  responded_at: string;
  responded_by?: string;
}

export interface InventoryItem {
  id: string;
  sku?: string;
  name: string;
  description?: string;
  category?: string;
  unit: string;
  quantity: number;
  min_quantity: number;
  cost_price?: number;
  sale_price?: number;
  supplier?: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialTransaction {
  id: string;
  transaction_type: TransactionType;
  category?: string;
  description: string;
  amount: number;
  transaction_date: string;
  due_date?: string;
  paid_date?: string;
  is_paid: boolean;
  customer_id?: string;
  service_order_id?: string;
  contract_id?: string;
  receipt_url?: string;
  notes?: string;
  payment_method?: string;
  installment_group_id?: string;
  installment_number?: number;
  installment_total?: number;
  account_id?: string | null;
  transfer_pair_id?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  customer_id?: string;
  title: string;
  status: LeadStatus;
  value?: number;
  probability: number;
  expected_close_date?: string;
  source?: string;
  assigned_to?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  customer?: Customer;
}

export interface PmocContract {
  id: string;
  customer_id: string;
  contract_number?: string;
  start_date: string;
  end_date: string;
  monthly_value?: number;
  maintenance_frequency?: string;
  notes?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  customer?: Customer;
}

// Status labels em português
export const osStatusLabels: Record<OsStatus, string> = {
  agendada: 'Agendada',
  pendente: 'Pendente',
  a_caminho: 'A Caminho',
  em_andamento: 'Em Andamento',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const osTypeLabels: Record<OsType, string> = {
  manutencao_preventiva: 'Manutenção Preventiva',
  manutencao_corretiva: 'Manutenção Corretiva',
  instalacao: 'Instalação',
  visita_tecnica: 'Visita Técnica',
};

export const leadStatusLabels: Record<LeadStatus, string> = {
  lead: 'Lead',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  fechado_ganho: 'Fechado (Ganho)',
  fechado_perdido: 'Fechado (Perdido)',
};

export const roleLabels: Record<AppRole, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  tecnico: 'Técnico',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  super_admin: 'Super Admin',
};
