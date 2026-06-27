import { useState, useEffect, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { phoneMask, cpfCnpjMask } from '@/utils/masks';
import { getErrorMessage } from '@/utils/errorMessages';
import {
  Loader2, Building2, CreditCard, KeyRound, RefreshCw, Copy, Check,
  Mail, Lock, User, Phone, FileText, MapPin, StickyNote, Calendar,
  Tag, Briefcase, Link2, Layers,
} from 'lucide-react';
import { getSelectableSegments } from '@/utils/companySegments';
import { Switch } from '@/components/ui/switch';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrengthIndicator, isPasswordStrong } from '@/components/PasswordStrengthIndicator';
import { addDays, format } from 'date-fns';
import { CepLookup } from '@/components/CepLookup';
import { GenerateLinkModal } from './GenerateLinkModal';
import { ModuleGrid, useSubscriptionModules, withBaseModules, sumModulesPrice, BASE_MODULE_CODES } from './ModuleGrid';
import { useNfseTiers } from '@/hooks/useNfseTiers';
import { buildCustomPriceNote, appendNote } from '@/utils/customPriceNote';
import { NumericInput } from '@/components/ui/numeric-input';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: any;
  onSuccess: () => void;
}

function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function parseAddress(address: string | null) {
  if (!address) return { logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '' };
  const parts = address.split(',').map(p => p.trim());
  return {
    logradouro: parts[0] || '',
    numero: parts[1] || '',
    complemento: parts[2] || '',
    bairro: parts[3] || '',
    cidade: parts[4]?.split('-')[0]?.trim() || '',
    estado: parts[4]?.split('-')[1]?.trim() || '',
    cep: parts[5] || '',
  };
}

function buildAddress(addr: { logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; estado: string; cep: string }) {
  const parts = [
    addr.logradouro,
    addr.numero,
    addr.complemento,
    addr.bairro,
    addr.cidade && addr.estado ? `${addr.cidade} - ${addr.estado}` : addr.cidade || addr.estado,
    addr.cep,
  ].filter(Boolean);
  return parts.join(', ');
}

export default function CompanyFormModal({ open, onOpenChange, company, onSuccess }: Props) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const isEditing = !!company;
  const [activeTab, setActiveTab] = useState('basic');
  const [copied, setCopied] = useState(false);

  // ========== Queries ==========
  const { data: plans = [] } = useQuery({
    queryKey: ['subscription-plans-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('code, name, price, max_users')
        .eq('is_active', true)
        .order('price', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: origins = [] } = useQuery({
    queryKey: ['company-origins-form'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_origins')
        .select('id, name, color')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: salespeople = [] } = useQuery({
    queryKey: ['salespeople-basic-form'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salespeople_basic')
        .select('id, name, email, role')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // SDRs = vendedores ativos com role 'sdr'. Closer mostra TODOS (inclusive sdr).
  const sdrs = salespeople.filter((s: any) => s.role === 'sdr');

  // Catálogo de módulos (plano Personalizado).
  const { data: allModules = [] } = useSubscriptionModules();

  // Níveis de NFS-e (preço/limite do módulo de Notas, code `nfe`).
  const { tiers: nfseTiers } = useNfseTiers();

  // Garante a opção "Personalizado" no select de planos, sempre por último
  // (existe linha no banco com price 0; se sumir, faz append client-side).
  const plansWithCustom = useMemo(() => {
    const standard = plans.filter((p: any) => p.code !== 'personalizado');
    const custom = plans.find((p: any) => p.code === 'personalizado')
      ?? { code: 'personalizado', name: 'Personalizado', price: 0, max_users: null };
    return [...standard, custom];
  }, [plans]);

  // Módulos já contratados (edição) — fonte da verdade pra diff no submit.
  const { data: existingModules } = useQuery({
    queryKey: ['company-modules', company?.id],
    enabled: open && !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_modules')
        .select('module_code')
        .eq('company_id', company.id);
      if (error) throw error;
      return (data || []).map(d => d.module_code);
    },
  });

  // ========== Form state ==========
  const [formData, setFormData] = useState({
    name: '', cnpj: '', email: '', phone: '', contact_name: '',
    subscription_status: 'testing', subscription_plan: 'start', subscription_value: '0',
    subscription_expires_at: '', billing_cycle: 'monthly', max_users: '5', notes: '',
    origin: '', salesperson_id: '', sdr_id: '', segment: '',
    admin_email: '', admin_password: '',
    use_custom_price: false,
    custom_price_permanent: true,
    custom_price_months: '3',
    nfse_tier: '1',
  });

  const [showGenerateLink, setShowGenerateLink] = useState(false);

  // Módulos do plano Personalizado (sempre inclui os base).
  const [selectedModules, setSelectedModules] = useState<string[]>([...BASE_MODULE_CODES]);

  const [addr, setAddr] = useState({
    logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '',
  });

  const updateField = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateAddr = useCallback((field: string, value: string) => {
    setAddr(prev => ({ ...prev, [field]: value }));
  }, []);

  // ========== Initialize on open ==========
  useEffect(() => {
    if (!open) return;
    if (company) {
      setFormData({
        name: company.name || '',
        cnpj: company.cnpj ? cpfCnpjMask(company.cnpj) : '',
        email: company.email || '',
        phone: company.phone ? phoneMask(company.phone) : '',
        contact_name: company.contact_name || '',
        subscription_status: company.subscription_status || 'testing',
        subscription_plan: company.subscription_plan || 'start',
        subscription_value: String(company.subscription_value || 0),
        subscription_expires_at: company.subscription_expires_at
          ? company.subscription_expires_at.split('T')[0]
          : '',
        billing_cycle: company.billing_cycle || 'monthly',
        max_users: String(company.max_users || 5),
        notes: company.notes || '',
        origin: company.origin || '',
        salesperson_id: company.salesperson_id || '',
        sdr_id: company.sdr_id || '',
        segment: company.segment || '',
        admin_email: '',
        admin_password: '',
        use_custom_price: !!company.custom_price && Number(company.custom_price) > 0,
        custom_price_permanent: company.custom_price_permanent ?? true,
        custom_price_months: company.custom_price_months ? String(company.custom_price_months) : '3',
        nfse_tier: String(company.nfse_tier ?? 1),
      });
      setAddr(parseAddress(company.address));
    } else {
      const defaultExpires = format(addDays(new Date(), 14), 'yyyy-MM-dd');
      setFormData({
        name: '', cnpj: '', email: '', phone: '', contact_name: '',
        subscription_status: 'testing', subscription_plan: 'start', subscription_value: '0',
        subscription_expires_at: defaultExpires, billing_cycle: 'monthly', max_users: '5',
        notes: '', origin: '', salesperson_id: '', sdr_id: '', segment: '',
        admin_email: '', admin_password: '',
        use_custom_price: false, custom_price_permanent: true, custom_price_months: '3',
        nfse_tier: '1',
      });
      setAddr({ logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '' });
    }
    setSelectedModules([...BASE_MODULE_CODES]);
    setActiveTab('basic');
  }, [company, open]);

  // Edição: carrega os módulos já contratados na grade.
  useEffect(() => {
    if (open && company && existingModules) {
      setSelectedModules(withBaseModules(existingModules));
    }
  }, [open, company, existingModules]);

  // Auto-fill admin email from company email
  useEffect(() => {
    if (!isEditing && !formData.admin_email && formData.email) {
      updateField('admin_email', formData.email);
    }
  }, [formData.email, formData.admin_email, isEditing, updateField]);

  // ========== Status -> auto expiration ==========
  const handleStatusChange = useCallback((v: string) => {
    updateField('subscription_status', v);
    const date = new Date();
    date.setDate(date.getDate() + (v === 'testing' ? 14 : 30));
    updateField('subscription_expires_at', format(date, 'yyyy-MM-dd'));
  }, [updateField]);

  // ========== Plan -> auto value & users ==========
  const handlePlanChange = useCallback((v: string) => {
    updateField('subscription_plan', v);
    if (v === 'personalizado') {
      // Preço sugerido = soma dos módulos marcados. max_users continua manual.
      if (!formData.use_custom_price) {
        updateField('subscription_value', String(sumModulesPrice(allModules, selectedModules, nfseTiers, Number(formData.nfse_tier))));
      }
      return;
    }
    const p = plans.find((pl: any) => pl.code === v);
    if (p) {
      // Só sobrescreve o valor se NÃO estiver usando preço customizado
      if (p.price != null && !formData.use_custom_price) updateField('subscription_value', String(p.price));
      if (p.max_users != null) updateField('max_users', String(p.max_users));
    }
  }, [plans, allModules, selectedModules, nfseTiers, formData.nfse_tier, updateField, formData.use_custom_price]);

  // ========== Nível de NFS-e -> recalcula preço sugerido ==========
  const updateNfseTier = useCallback((value: string) => {
    updateField('nfse_tier', value);
    if (!formData.use_custom_price) {
      updateField('subscription_value', String(sumModulesPrice(allModules, selectedModules, nfseTiers, Number(value))));
    }
  }, [allModules, selectedModules, nfseTiers, formData.use_custom_price, updateField]);

  // ========== Toggle de módulo (plano Personalizado) ==========
  const handleToggleModule = useCallback((code: string) => {
    setSelectedModules(prev => {
      const next = withBaseModules(
        prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code],
      );
      if (!formData.use_custom_price) {
        updateField('subscription_value', String(sumModulesPrice(allModules, next, nfseTiers, Number(formData.nfse_tier))));
      }
      return next;
    });
  }, [allModules, nfseTiers, formData.nfse_tier, formData.use_custom_price, updateField]);

  const isPersonalizado = formData.subscription_plan === 'personalizado';
  const suggestedModulesPrice = sumModulesPrice(allModules, selectedModules, nfseTiers, Number(formData.nfse_tier));
  // Preço de referência exibido nos hints: plano padrão usa o preço do plano;
  // personalizado usa a soma dos módulos marcados.
  const referencePlanPrice = (() => {
    if (isPersonalizado) return suggestedModulesPrice;
    const p = plans.find((pl: any) => pl.code === formData.subscription_plan);
    return p?.price != null ? Number(p.price) : null;
  })();
  const referencePriceLabel = isPersonalizado ? 'Valor sugerido dos módulos' : 'Valor original do plano';

  // ========== Mutation ==========
  const mutation = useMutation({
    mutationFn: async () => {
      const address = buildAddress(addr);
      const cleanPhone = formData.phone.replace(/\D/g, '');
      const cleanCnpj = formData.cnpj.replace(/\D/g, '');

      const customPriceVal = formData.use_custom_price ? parseFloat(formData.subscription_value) || 0 : null;
      const customPriceMonthsVal = formData.use_custom_price && !formData.custom_price_permanent
        ? parseInt(formData.custom_price_months) || null
        : null;
      const planObj = plans.find((p: any) => p.code === formData.subscription_plan);
      const originalPlanPrice = formData.subscription_plan === 'personalizado'
        ? sumModulesPrice(allModules, selectedModules, nfseTiers, Number(formData.nfse_tier))
        : (planObj?.price ?? null);
      const modulesPayload = formData.subscription_plan === 'personalizado'
        ? withBaseModules(selectedModules)
        : null;

      // Observação automática de valor personalizado: quem deu = closer
      // selecionado > admin logado > 'Admin'.
      let customPriceNote: string | null = null;
      if (formData.use_custom_price && customPriceVal != null) {
        const closer = salespeople.find((s: any) => s.id === formData.salesperson_id);
        customPriceNote = buildCustomPriceNote({
          price: customPriceVal,
          permanent: formData.custom_price_permanent,
          months: customPriceMonthsVal,
          grantedBy: closer?.name || profile?.full_name || 'Admin',
        });
      }

      if (isEditing) {
        // Edição: só anexa a nota quando o valor personalizado foi ATIVADO ou
        // mudou (valor/permanência/prazo). Sem mudança = sem nota duplicada.
        const customPriceChanged = formData.use_custom_price && (
          Number(company.custom_price || 0) !== (customPriceVal || 0)
          || (company.custom_price_permanent ?? true) !== formData.custom_price_permanent
          || (company.custom_price_months ?? null) !== customPriceMonthsVal
        );
        const notesToSave = customPriceChanged && customPriceNote
          ? appendNote(formData.notes, customPriceNote)
          : (formData.notes || null);

        const { error } = await supabase.from('companies').update({
          name: formData.name,
          cnpj: cleanCnpj || null,
          email: formData.email || null,
          phone: cleanPhone || null,
          address: address || null,
          contact_name: formData.contact_name || null,
          subscription_status: formData.subscription_status,
          subscription_plan: formData.subscription_plan,
          subscription_value: parseFloat(formData.subscription_value) || 0,
          subscription_expires_at: formData.subscription_expires_at || null,
          billing_cycle: formData.billing_cycle,
          max_users: parseInt(formData.max_users) || 5,
          notes: notesToSave,
          origin: formData.origin || null,
          salesperson_id: formData.salesperson_id || null,
          sdr_id: formData.sdr_id || null,
          segment: formData.segment || null,
          custom_price: customPriceVal,
          custom_price_permanent: formData.use_custom_price ? formData.custom_price_permanent : true,
          custom_price_months: customPriceMonthsVal,
          nfse_tier: parseInt(formData.nfse_tier) || 1,
        }).eq('id', company.id);
        if (error) throw error;

        // Sincroniza company_modules (RLS: super_admin tem ALL na tabela).
        if (formData.subscription_plan === 'personalizado') {
          const desired = withBaseModules(selectedModules);
          const current = existingModules || [];
          const toAdd = desired.filter(c => !current.includes(c));
          const toRemove = current.filter(c => !desired.includes(c));
          if (toRemove.length > 0) {
            const { error: delError } = await supabase
              .from('company_modules')
              .delete()
              .eq('company_id', company.id)
              .in('module_code', toRemove);
            if (delError) throw delError;
          }
          if (toAdd.length > 0) {
            const { error: insError } = await supabase
              .from('company_modules')
              .insert(toAdd.map(code => ({ company_id: company.id, module_code: code })));
            if (insError) throw insError;
          }
        } else if (company.subscription_plan === 'personalizado' && (existingModules?.length || 0) > 0) {
          // Saiu do Personalizado pra plano padrão: módulos passam a vir do
          // plano (included_modules) — limpa os avulsos pra não vazar módulo.
          const { error: delAllError } = await supabase
            .from('company_modules')
            .delete()
            .eq('company_id', company.id);
          if (delAllError) throw delAllError;
        }
      } else {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) throw new Error('Não autenticado');
        const { data, error } = await supabase.functions.invoke('create-company', {
          body: {
            company_name: formData.name,
            company_cnpj: cleanCnpj || null,
            company_email: formData.email || null,
            company_phone: cleanPhone || null,
            company_address: address || null,
            contact_name: formData.contact_name || null,
            notes: formData.notes || null,
            admin_email: formData.admin_email,
            admin_password: formData.admin_password,
            subscription_status: formData.subscription_status,
            subscription_plan: formData.subscription_plan,
            subscription_value: parseFloat(formData.subscription_value) || 0,
            subscription_expires_at: formData.subscription_expires_at
              ? new Date(formData.subscription_expires_at).toISOString()
              : null,
            billing_cycle: formData.billing_cycle,
            max_users: parseInt(formData.max_users) || 5,
            origin: formData.origin || null,
            salesperson_id: formData.salesperson_id || null,
            sdr_id: formData.sdr_id || null,
            segment: formData.segment || null,
            custom_price: customPriceVal,
            custom_price_permanent: formData.use_custom_price ? formData.custom_price_permanent : true,
            custom_price_months: customPriceMonthsVal,
            original_plan_price: originalPlanPrice,
            modules: modulesPayload,
            custom_price_note: customPriceNote,
            nfse_tier: parseInt(formData.nfse_tier) || 1,
          },
          headers: { Authorization: `Bearer ${session.session.access_token}` },
        });
        if (error) {
          let msg = 'Erro ao criar empresa';
          try {
            if (error.context?.body) {
              const p = JSON.parse(error.context.body);
              if (p.error) msg = p.error;
            }
          } catch {}
          throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Empresa atualizada!' : 'Empresa criada com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      if (company?.id) queryClient.invalidateQueries({ queryKey: ['company-modules', company.id] });
      onSuccess();
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  // ========== Validation by tab ==========
  const validateTab = (tab: string): { valid: boolean; error?: string } => {
    if (tab === 'basic') {
      if (!formData.name.trim()) return { valid: false, error: 'Nome da empresa é obrigatório' };
      if (!formData.email.trim()) return { valid: false, error: 'Email é obrigatório' };
    }
    if (tab === 'commercial') {
      if (!formData.subscription_plan) return { valid: false, error: 'Plano é obrigatório' };
      if (!formData.subscription_expires_at) return { valid: false, error: 'Data de expiração é obrigatória' };
    }
    if (tab === 'access' && !isEditing) {
      if (!formData.admin_email.trim()) return { valid: false, error: 'Email do administrador é obrigatório' };
      if (!isPasswordStrong(formData.admin_password)) {
        return { valid: false, error: 'Senha fraca: use ao menos 8 caracteres com letras maiúsculas, minúsculas, números e/ou caracteres especiais' };
      }
    }
    return { valid: true };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate all tabs and jump to first failing
    const tabs = isEditing ? ['basic', 'commercial'] : ['basic', 'commercial', 'access'];
    for (const t of tabs) {
      const v = validateTab(t);
      if (!v.valid) {
        setActiveTab(t);
        toast({ variant: 'destructive', title: v.error });
        return;
      }
    }
    mutation.mutate();
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`Email: ${formData.admin_email}\nSenha: ${formData.admin_password}`);
    setCopied(true);
    toast({ title: 'Credenciais copiadas!' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGeneratePassword = () => {
    updateField('admin_password', generatePassword(10));
  };

  const title = isEditing ? 'Editar Empresa' : 'Nova Empresa';

  // ========== Form content (shared) ==========
  const FormContent = (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className={`grid mb-4 shrink-0 ${isEditing ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <TabsTrigger value="basic" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Dados</span>
          </TabsTrigger>
          <TabsTrigger value="commercial" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Comercial</span>
          </TabsTrigger>
          {!isEditing && (
            <TabsTrigger value="access" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline">Acesso</span>
            </TabsTrigger>
          )}
        </TabsList>

        <div className="flex-1 overflow-y-auto min-h-0 pb-4 px-1">
          {/* ============ DADOS BÁSICOS ============ */}
          <TabsContent value="basic" className="m-0 space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Building2 className="h-4 w-4" />Nome da Empresa *</Label>
              <Input value={formData.name} onChange={e => updateField('name', e.target.value)} placeholder="Nome da empresa" />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><User className="h-4 w-4" />Nome do Responsável</Label>
              <Input value={formData.contact_name} onChange={e => updateField('contact_name', e.target.value)} placeholder="Nome do responsável" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Mail className="h-4 w-4" />Email *</Label>
                <Input type="email" value={formData.email} onChange={e => updateField('email', e.target.value)} placeholder="email@empresa.com" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Phone className="h-4 w-4" />Telefone</Label>
                <Input value={formData.phone} onChange={e => updateField('phone', phoneMask(e.target.value))} maxLength={15} placeholder="(00) 00000-0000" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><FileText className="h-4 w-4" />CNPJ/CPF</Label>
              <Input value={formData.cnpj} onChange={e => updateField('cnpj', cpfCnpjMask(e.target.value))} maxLength={18} placeholder="00.000.000/0000-00" />
            </div>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="address" className="border rounded-lg px-3">
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4" />Endereço
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1 space-y-1">
                      <Label className="text-xs">CEP</Label>
                      <CepLookup
                        value={addr.cep}
                        onChange={(v) => updateAddr('cep', v)}
                        onAddressFound={(data) => {
                          setAddr(prev => ({
                            ...prev,
                            logradouro: data.logradouro || prev.logradouro,
                            bairro: data.bairro || prev.bairro,
                            cidade: data.cidade || prev.cidade,
                            estado: data.estado || prev.estado,
                          }));
                        }}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Logradouro</Label>
                      <Input value={addr.logradouro} onChange={e => updateAddr('logradouro', e.target.value)} placeholder="Rua, Av..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Número</Label>
                      <Input value={addr.numero} onChange={e => updateAddr('numero', e.target.value)} placeholder="Nº" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Complemento</Label>
                      <Input value={addr.complemento} onChange={e => updateAddr('complemento', e.target.value)} placeholder="Sala, Bloco..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Bairro</Label>
                      <Input value={addr.bairro} onChange={e => updateAddr('bairro', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cidade</Label>
                      <Input value={addr.cidade} onChange={e => updateAddr('cidade', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Estado</Label>
                      <Input value={addr.estado} onChange={e => updateAddr('estado', e.target.value)} maxLength={2} placeholder="UF" />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><StickyNote className="h-4 w-4" />Observações</Label>
              <Textarea value={formData.notes} onChange={e => updateField('notes', e.target.value)} rows={3} className="resize-none" placeholder="Observações sobre a empresa..." />
            </div>
          </TabsContent>

          {/* ============ COMERCIAL ============ */}
          <TabsContent value="commercial" className="m-0 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Tag className="h-4 w-4" />Status</Label>
                <Select value={formData.subscription_status} onValueChange={handleStatusChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="testing">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />Em Teste
                      </span>
                    </SelectItem>
                    <SelectItem value="active">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />Ativa
                      </span>
                    </SelectItem>
                    <SelectItem value="inactive">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-500" />Inativa
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Plano *</Label>
                <Select value={formData.subscription_plan} onValueChange={handlePlanChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione o plano" /></SelectTrigger>
                  <SelectContent>
                    {plans.length === 0 ? (
                      <SelectItem value="start" disabled>Carregando...</SelectItem>
                    ) : (
                      plansWithCustom.map((p: any) => (
                        <SelectItem key={p.code} value={p.code}>
                          <span className="flex items-center gap-2">
                            {p.name}
                            {p.price > 0 && (
                              <span className="text-muted-foreground text-sm">
                                — R$ {Number(p.price).toFixed(2)}/mês
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Plano Personalizado: grade de módulos à la carte */}
            {isPersonalizado && (
              <div className="space-y-3 p-3 border border-primary/40 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Módulos do plano</Label>
                  <span className="text-xs text-muted-foreground">
                    Sugerido: R$ {suggestedModulesPrice.toFixed(2)}/mês
                  </span>
                </div>
                <ModuleGrid
                  modules={allModules}
                  selected={selectedModules}
                  onToggle={handleToggleModule}
                />
              </div>
            )}

            {/* Nível de Notas (NFS-e): só quando o módulo `nfe` está marcado */}
            {selectedModules.includes('nfe') && (
              <div className="space-y-2 p-3 border border-primary/40 rounded-lg">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />Nível de Notas Fiscais
                </Label>
                <Select value={formData.nfse_tier} onValueChange={updateNfseTier}>
                  <SelectTrigger><SelectValue placeholder="Selecione o nível" /></SelectTrigger>
                  <SelectContent>
                    {nfseTiers.map((t) => (
                      <SelectItem key={t.tier} value={String(t.tier)}>
                        Nível {t.tier} — {t.monthlyLimit === null ? 'ilimitado' : `${t.monthlyLimit.toLocaleString('pt-BR')} notas/mês`} — R$ {t.price}/mês
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Define o limite mensal de notas e o valor cobrado pelo módulo.
                </p>
              </div>
            )}

            {/* Switch + valor personalizado */}
            <div className="space-y-3 p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <Switch
                  id="use-custom-price"
                  checked={formData.use_custom_price}
                  onCheckedChange={(v) => {
                    setFormData(prev => ({ ...prev, use_custom_price: v }));
                    if (!v) {
                      // restaurar preço do plano (personalizado = soma dos módulos)
                      if (isPersonalizado) {
                        updateField('subscription_value', String(suggestedModulesPrice));
                      } else {
                        const p = plans.find((pl: any) => pl.code === formData.subscription_plan);
                        if (p?.price != null) updateField('subscription_value', String(p.price));
                      }
                    }
                  }}
                />
                <Label htmlFor="use-custom-price" className="text-sm cursor-pointer">
                  Usar valor personalizado
                </Label>
              </div>

              {formData.use_custom_price && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.subscription_value}
                        onChange={e => updateField('subscription_value', e.target.value)}
                      />
                      {referencePlanPrice != null && (
                        <p className="text-xs text-muted-foreground">
                          {referencePriceLabel}: R$ {referencePlanPrice.toFixed(2)}/mês
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Máx. Usuários</Label>
                      <NumericInput value={formData.max_users} onValueChange={v => updateField('max_users', v)} />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="is-permanent"
                        checked={formData.custom_price_permanent}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, custom_price_permanent: v }))}
                      />
                      <Label htmlFor="is-permanent" className="text-sm cursor-pointer">
                        Permanentemente
                      </Label>
                    </div>

                    {!formData.custom_price_permanent && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Por quantos meses?</Label>
                        <NumericInput
                          placeholder="3"
                          value={formData.custom_price_months}
                          onValueChange={(v) => setFormData(prev => ({ ...prev, custom_price_months: v }))}
                          className="w-24"
                        />
                        {referencePlanPrice != null && formData.subscription_value && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            Os primeiros {formData.custom_price_months || 'X'} pagamentos serão de R$ {Number(formData.subscription_value).toFixed(2)}, depois volta para R$ {referencePlanPrice.toFixed(2)}/mês
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!formData.use_custom_price && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Valor (R$)</Label>
                    {/* Personalizado: valor sugerido (soma dos módulos) fica editável */}
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.subscription_value}
                      disabled={!isPersonalizado}
                      onChange={e => updateField('subscription_value', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Máx. Usuários</Label>
                    <NumericInput value={formData.max_users} onValueChange={v => updateField('max_users', v)} />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" />Vencimento *</Label>
                <Input type="date" value={formData.subscription_expires_at} onChange={e => updateField('subscription_expires_at', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Ciclo de Cobrança</Label>
                <Select value={formData.billing_cycle} onValueChange={v => updateField('billing_cycle', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Origem</Label>
                <Select value={formData.origin || 'none'} onValueChange={v => updateField('origin', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {origins.map((o: any) => (
                      <SelectItem key={o.id} value={o.name}>
                        <span className="flex items-center gap-2">
                          {o.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: o.color }} />}
                          {o.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Layers className="h-4 w-4" />Segmento</Label>
                <Select value={formData.segment || 'none'} onValueChange={v => updateField('segment', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {getSelectableSegments().map((s) => {
                      const Icon = s.icon;
                      return (
                        <SelectItem key={s.value} value={s.value}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" style={{ color: s.color }} />
                            {s.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Briefcase className="h-4 w-4" />Closer (Quem fechou)</Label>
                <Select value={formData.salesperson_id || 'none'} onValueChange={v => updateField('salesperson_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {salespeople.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Briefcase className="h-4 w-4" />SDR (Quem agendou - Opcional)</Label>
                <Select value={formData.sdr_id || 'none'} onValueChange={v => updateField('sdr_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {sdrs.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* ============ ACESSO (apenas criação) ============ */}
          {!isEditing && (
            <TabsContent value="access" className="m-0 space-y-4">
              <p className="text-sm text-muted-foreground">
                Defina as credenciais de acesso do administrador da empresa.
              </p>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Mail className="h-4 w-4" />Email do Administrador *</Label>
                <Input type="email" value={formData.admin_email} onChange={e => updateField('admin_email', e.target.value)} placeholder="admin@empresa.com" required />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Lock className="h-4 w-4" />Senha *</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <PasswordInput
                      value={formData.admin_password}
                      onChange={e => updateField('admin_password', e.target.value)}
                      placeholder="Crie uma senha segura"
                    />
                  </div>
                  <Button type="button" variant="outline" size="icon" onClick={handleGeneratePassword} title="Gerar senha aleatória">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <PasswordStrengthIndicator password={formData.admin_password} />
              </div>

              {formData.admin_email && formData.admin_password && (
                <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="w-full">
                  {copied ? (
                    <><Check className="h-4 w-4 mr-2" />Copiado!</>
                  ) : (
                    <><Copy className="h-4 w-4 mr-2" />Copiar credenciais</>
                  )}
                </Button>
              )}

              <p className="text-xs text-muted-foreground">
                As credenciais serão usadas para o primeiro acesso. O administrador poderá
                alterar a senha posteriormente.
              </p>
            </TabsContent>
          )}
        </div>
      </Tabs>

      <div className="flex justify-end gap-3 pt-4 border-t shrink-0">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEditing ? 'Salvar' : 'Criar Empresa'}
        </Button>
      </div>
    </form>
  );

  const HeaderActions = !isEditing && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setShowGenerateLink(true)}
      className="gap-2"
    >
      <Link2 className="h-4 w-4" />
      Gerar Link
    </Button>
  );

  // ========== Mobile: Drawer ==========
  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange} dismissible={false}>
          <DrawerContent className="max-h-[90dvh]">
            <DrawerHeader className="border-b pb-4 flex flex-row items-center justify-between">
              <DrawerTitle>{title}</DrawerTitle>
              {HeaderActions}
            </DrawerHeader>
            <div className="p-4 overflow-y-auto flex-1 flex flex-col">
              {FormContent}
            </div>
          </DrawerContent>
        </Drawer>
        <GenerateLinkModal open={showGenerateLink} onOpenChange={setShowGenerateLink} />
      </>
    );
  }

  // ========== Desktop: Dialog ==========
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] flex flex-col"
          onPointerDownOutside={(e) => { if (!isEditing) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (!isEditing) e.preventDefault(); }}
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-4 pr-8">
            <DialogTitle>{title}</DialogTitle>
            {HeaderActions}
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col">
            {FormContent}
          </div>
        </DialogContent>
      </Dialog>
      <GenerateLinkModal open={showGenerateLink} onOpenChange={setShowGenerateLink} />
    </>
  );
}
