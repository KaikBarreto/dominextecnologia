import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { phoneMask, cpfCnpjMask } from '@/utils/masks';
import { Loader2, Building2, CreditCard, KeyRound, RefreshCw, Copy, Check } from 'lucide-react';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrengthIndicator, isPasswordStrong } from '@/components/PasswordStrengthIndicator';
import { addDays, format } from 'date-fns';
import { CepLookup } from '@/components/CepLookup';
import { StateCitySelector } from '@/components/StateCitySelector';

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
  // Try to parse "Rua X, 123, Comp, Bairro, Cidade - UF, 00000-000"
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
  const parts = [addr.logradouro, addr.numero, addr.complemento, addr.bairro, addr.cidade && addr.estado ? `${addr.cidade} - ${addr.estado}` : addr.cidade || addr.estado, addr.cep].filter(Boolean);
  return parts.join(', ');
}

export default function CompanyFormModal({ open, onOpenChange, company, onSuccess }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!company;
  const [activeTab, setActiveTab] = useState('basic');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const [formData, setFormData] = useState({
    name: '', cnpj: '', email: '', phone: '', contact_name: '',
    subscription_status: 'testing', subscription_plan: 'start', subscription_value: '0',
    subscription_expires_at: '', billing_cycle: 'monthly', max_users: '5', notes: '', origin: '',
    admin_email: '', admin_password: '',
  });

  const [addr, setAddr] = useState({ logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '' });

  const updateField = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateAddr = useCallback((field: string, value: string) => {
    setAddr(prev => ({ ...prev, [field]: value }));
  }, []);

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name || '', cnpj: company.cnpj || '', email: company.email || '',
        phone: company.phone || '', contact_name: company.contact_name || '',
        subscription_status: company.subscription_status || 'testing',
        subscription_plan: company.subscription_plan || 'start',
        subscription_value: String(company.subscription_value || 0),
        subscription_expires_at: company.subscription_expires_at ? company.subscription_expires_at.split('T')[0] : '',
        billing_cycle: company.billing_cycle || 'monthly',
        max_users: String(company.max_users || 5), notes: company.notes || '',
        origin: company.origin || '', admin_email: '', admin_password: '',
      });
      setAddr(parseAddress(company.address));
      setActiveTab('basic');
    } else {
      const defaultExpires = format(addDays(new Date(), 14), 'yyyy-MM-dd');
      setFormData({
        name: '', cnpj: '', email: '', phone: '', contact_name: '',
        subscription_status: 'testing', subscription_plan: 'start', subscription_value: '0',
        subscription_expires_at: defaultExpires, billing_cycle: 'monthly', max_users: '5',
        notes: '', origin: '', admin_email: '', admin_password: generatePassword(),
      });
      setAddr({ logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '' });
      setActiveTab('basic');
      setShowPassword(true);
    }
  }, [company, open]);

  useEffect(() => {
    if (!isEditing && !formData.admin_email && formData.email) updateField('admin_email', formData.email);
  }, [formData.email, formData.admin_email, isEditing, updateField]);

  const mutation = useMutation({
    mutationFn: async () => {
      const address = buildAddress(addr);
      if (isEditing) {
        const { error } = await supabase.from('companies').update({
          name: formData.name, cnpj: formData.cnpj || null, email: formData.email || null,
          phone: formData.phone || null, address: address || null,
          contact_name: formData.contact_name || null,
          subscription_status: formData.subscription_status,
          subscription_plan: formData.subscription_plan,
          subscription_value: parseFloat(formData.subscription_value) || 0,
          subscription_expires_at: formData.subscription_expires_at || null,
          billing_cycle: formData.billing_cycle,
          max_users: parseInt(formData.max_users) || 5,
          notes: formData.notes || null, origin: formData.origin || null,
        }).eq('id', company.id);
        if (error) throw error;
      } else {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) throw new Error('Não autenticado');
        const { data, error } = await supabase.functions.invoke('create-company', {
          body: {
            company_name: formData.name, company_cnpj: formData.cnpj || null,
            company_email: formData.email || null, company_phone: formData.phone || null,
            company_address: address || null, contact_name: formData.contact_name || null,
            notes: formData.notes || null, admin_email: formData.admin_email,
            admin_password: formData.admin_password,
            subscription_status: formData.subscription_status,
            subscription_plan: formData.subscription_plan,
            subscription_value: parseFloat(formData.subscription_value) || 0,
            subscription_expires_at: formData.subscription_expires_at ? new Date(formData.subscription_expires_at).toISOString() : null,
            billing_cycle: formData.billing_cycle, max_users: parseInt(formData.max_users) || 5,
            origin: formData.origin || null,
          },
          headers: { Authorization: `Bearer ${session.session.access_token}` },
        });
        if (error) {
          let msg = 'Erro ao criar empresa';
          try { if (error.context?.body) { const p = JSON.parse(error.context.body); if (p.error) msg = p.error; } } catch {}
          throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? 'Empresa atualizada!' : 'Empresa criada com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      onSuccess();
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro', description: e.message }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) { setActiveTab('basic'); toast({ variant: 'destructive', title: 'Nome da empresa é obrigatório' }); return; }
    if (!isEditing) {
      if (!formData.admin_email) { setActiveTab('access'); toast({ variant: 'destructive', title: 'Email do administrador é obrigatório' }); return; }
      if (!isPasswordStrong(formData.admin_password)) { setActiveTab('access'); toast({ variant: 'destructive', title: 'Senha fraca', description: 'Use ao menos 8 caracteres com letras maiúsculas, minúsculas, números e/ou caracteres especiais.' }); return; }
    }
    mutation.mutate();
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`Email: ${formData.admin_email}\nSenha: ${formData.admin_password}`);
    setCopied(true);
    toast({ title: 'Credenciais copiadas!' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className={`grid mb-4 shrink-0 ${isEditing ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <TabsTrigger value="basic" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" /><span className="hidden sm:inline">Dados</span>
              </TabsTrigger>
              <TabsTrigger value="commercial" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" /><span className="hidden sm:inline">Comercial</span>
              </TabsTrigger>
              {!isEditing && (
                <TabsTrigger value="access" className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" /><span className="hidden sm:inline">Acesso</span>
                </TabsTrigger>
              )}
            </TabsList>

            <div className="flex-1 overflow-y-auto min-h-0 pb-4">
              <TabsContent value="basic" className="m-0 space-y-4">
                <div>
                  <Label>Nome da Empresa *</Label>
                  <Input value={formData.name} onChange={e => updateField('name', e.target.value)} placeholder="Nome da empresa" />
                </div>
                <div>
                  <Label>Responsável</Label>
                  <Input value={formData.contact_name} onChange={e => updateField('contact_name', e.target.value)} placeholder="Nome do responsável" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={formData.email} onChange={e => updateField('email', e.target.value)} />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input value={formData.phone} onChange={e => updateField('phone', phoneMask(e.target.value))} maxLength={15} />
                  </div>
                </div>
                <div>
                  <Label>CNPJ/CPF</Label>
                  <Input value={formData.cnpj} onChange={e => updateField('cnpj', cpfCnpjMask(e.target.value))} maxLength={18} />
                </div>

                {/* Structured Address */}
                <div className="space-y-3 rounded-md border p-3">
                  <Label className="text-sm font-semibold">Endereço</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
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
                    <div className="col-span-2">
                      <Label className="text-xs">Logradouro</Label>
                      <Input value={addr.logradouro} onChange={e => updateAddr('logradouro', e.target.value)} placeholder="Rua, Av..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Número</Label>
                      <Input value={addr.numero} onChange={e => updateAddr('numero', e.target.value)} placeholder="Nº" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Complemento</Label>
                      <Input value={addr.complemento} onChange={e => updateAddr('complemento', e.target.value)} placeholder="Sala, Bloco..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Bairro</Label>
                      <Input value={addr.bairro} onChange={e => updateAddr('bairro', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Cidade</Label>
                      <Input value={addr.cidade} onChange={e => updateAddr('cidade', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Estado</Label>
                      <Input value={addr.estado} onChange={e => updateAddr('estado', e.target.value)} maxLength={2} placeholder="UF" />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Observações</Label>
                  <Textarea value={formData.notes} onChange={e => updateField('notes', e.target.value)} rows={3} className="resize-none" />
                </div>
              </TabsContent>

              <TabsContent value="commercial" className="m-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Status</Label>
                    <Select value={formData.subscription_status} onValueChange={v => updateField('subscription_status', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="testing">Em Teste</SelectItem>
                        <SelectItem value="active">Ativa</SelectItem>
                        <SelectItem value="inactive">Inativa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Plano</Label>
                    <Select
                      value={formData.subscription_plan}
                      onValueChange={v => {
                        updateField('subscription_plan', v);
                        const p = plans.find((pl: any) => pl.code === v);
                        if (p) {
                          if (p.price != null) updateField('subscription_value', String(p.price));
                          if (p.max_users != null) updateField('max_users', String(p.max_users));
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione o plano" /></SelectTrigger>
                      <SelectContent>
                        {plans.length === 0 ? (
                          <SelectItem value="start" disabled>Carregando...</SelectItem>
                        ) : (
                          plans.map((p: any) => (
                            <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Valor (R$)</Label>
                    <Input type="number" step="0.01" value={formData.subscription_value} onChange={e => updateField('subscription_value', e.target.value)} />
                  </div>
                  <div>
                    <Label>Máx Usuários</Label>
                    <Input type="number" value={formData.max_users} onChange={e => updateField('max_users', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Vencimento</Label>
                    <Input type="date" value={formData.subscription_expires_at} onChange={e => updateField('subscription_expires_at', e.target.value)} />
                  </div>
                  <div>
                    <Label>Ciclo</Label>
                    <Select value={formData.billing_cycle} onValueChange={v => updateField('billing_cycle', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="yearly">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Origem</Label>
                  <Input value={formData.origin} onChange={e => updateField('origin', e.target.value)} placeholder="Ex: Google, Instagram..." />
                </div>
              </TabsContent>

              {!isEditing && (
                <TabsContent value="access" className="m-0 space-y-4">
                  <p className="text-sm text-muted-foreground">Defina as credenciais de acesso do administrador da empresa.</p>
                  <div>
                    <Label>Email do Administrador *</Label>
                    <Input type="email" value={formData.admin_email} onChange={e => updateField('admin_email', e.target.value)} placeholder="admin@empresa.com" />
                  </div>
                  <div>
                    <Label>Senha *</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <PasswordInput value={formData.admin_password} onChange={e => updateField('admin_password', e.target.value)} placeholder="Crie uma senha segura" />
                      </div>
                      <Button type="button" variant="outline" size="icon" onClick={() => { updateField('admin_password', generatePassword()); }} title="Gerar senha">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    <PasswordStrengthIndicator password={formData.admin_password} />
                  </div>
                  {formData.admin_email && formData.admin_password && (
                    <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="w-full">
                      {copied ? <><Check className="h-4 w-4 mr-2" /> Copiado!</> : <><Copy className="h-4 w-4 mr-2" /> Copiar credenciais</>}
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">As credenciais serão usadas para o primeiro acesso. O administrador poderá alterar a senha posteriormente.</p>
                </TabsContent>
              )}
            </div>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isEditing ? 'Salvar' : 'Criar Empresa'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
