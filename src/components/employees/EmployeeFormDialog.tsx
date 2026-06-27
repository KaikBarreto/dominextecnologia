import { useState, useEffect } from 'react';
import { sanitizeStorageFileName } from '@/utils/storagePath';
import { Loader2, Camera, Link2, Calculator, Clock, Copy } from 'lucide-react';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { getErrorMessage } from '@/utils/errorMessages';
import { useToast } from '@/hooks/use-toast';
import { Employee, PaymentFrequency, PaymentDayType } from '@/hooks/useEmployees';
import { useUsers } from '@/hooks/useUsers';
import { cpfCnpjMask, phoneMask, pixKeyMask } from '@/utils/masks';
import { currencyMask, parseCurrency } from '@/utils/employeeCalculations';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { MonthlyCostCalculatorModal, MonthlyCostBreakdown } from '@/components/service-orders/MonthlyCostCalculatorModal';
import { formatBRL } from '@/utils/currency';
import { useEmployeeWorkHours } from '@/hooks/useEmployeeWorkHours';

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee | null;
  onSubmit: (data: Partial<Employee>) => void;
  isPending?: boolean;
}

export function EmployeeFormDialog({ open, onOpenChange, employee, onSubmit, isPending }: EmployeeFormDialogProps) {
  const { toast } = useToast();
  const { users } = useUsers();
  const isEditing = !!employee;
  const { monthlyHours: resolvedMonthlyHours } = useEmployeeWorkHours(employee?.id || null);
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [salary, setSalary] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [address, setAddress] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [createAccess, setCreateAccess] = useState(false);
  const [useTemporaryPassword, setUseTemporaryPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [pontoEnabled, setPontoEnabled] = useState(false);
  const [monthlyCost, setMonthlyCost] = useState('');
  const [monthlyCostBreakdown, setMonthlyCostBreakdown] = useState<MonthlyCostBreakdown | null>(null);
  const [showCostCalc, setShowCostCalc] = useState(false);
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>('monthly');
  const [paymentDayType, setPaymentDayType] = useState<PaymentDayType>('business');
  const [paymentDay, setPaymentDay] = useState<number>(5);
  const [paymentDay2, setPaymentDay2] = useState<number>(20);
  const [paymentWeekday, setPaymentWeekday] = useState<number>(5);
  const TAB_DADOS = 'dados';
  const TAB_REMUNERACAO = 'remuneracao';
  type TabKey = typeof TAB_DADOS | typeof TAB_REMUNERACAO;
  const [activeTab, setActiveTab] = useState<TabKey>(TAB_DADOS);

  type EmployeeDraft = { name: string; cpf: string; phone: string; email: string; position: string; salary: string; hireDate: string; address: string; pixKey: string };
  const draft = useFormDraft<EmployeeDraft>({ key: 'employee-form', isOpen: open, isEditing });

  const getFormSnapshot = (): EmployeeDraft => ({ name, cpf, phone, email, position, salary, hireDate, address, pixKey });

  // Save draft on field changes
  useEffect(() => {
    if (open && !isEditing && !draft.showResumePrompt) {
      draft.saveDraft(getFormSnapshot());
    }
  }, [name, cpf, phone, email, position, salary, hireDate, address, pixKey, open, isEditing, draft.showResumePrompt]);

  const applyDraft = (d: EmployeeDraft) => {
    setName(d.name || ''); setCpf(d.cpf || ''); setPhone(d.phone || '');
    setEmail(d.email || ''); setPosition(d.position || ''); setSalary(d.salary || '');
    setHireDate(d.hireDate || ''); setAddress(d.address || ''); setPixKey(d.pixKey || '');
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  useEffect(() => {
    if (open) {
      if (!isEditing && draft.hasDraft && draft.draftData) {
        // Draft will be applied via DraftResumeDialog
      } else {
        setName(employee?.name || '');
        setCpf(employee?.cpf || '');
        setPhone(employee?.phone || '');
        setEmail(employee?.email || '');
        setPosition(employee?.position || '');
        setSalary(employee?.salary ? currencyMask(String(Math.round(employee.salary * 100))) : '');
        setMonthlyCost(employee?.monthly_cost ? currencyMask(String(Math.round(employee.monthly_cost * 100))) : '');
        setMonthlyCostBreakdown(employee?.monthly_cost_breakdown ?? null);
        setHireDate(employee?.hire_date || '');
        setAddress(employee?.address || '');
        setPixKey(employee?.pix_key || '');
        setPaymentFrequency((employee?.payment_frequency as PaymentFrequency) || 'monthly');
        setPaymentDayType((employee?.payment_day_type as PaymentDayType) || 'business');
        setPaymentDay(employee?.payment_day ?? 5);
        setPaymentDay2(employee?.payment_day_2 ?? 20);
        setPaymentWeekday(employee?.payment_weekday ?? 5);
      }
      setPhotoUrl(employee?.photo_url || '');
      setPontoEnabled(employee?.ponto_enabled ?? false);
      setCreateAccess(false);
      setUseTemporaryPassword(false);
      setPassword('');
      setLinkedUserId(employee?.user_id || null);
      setActiveTab(TAB_DADOS);
    }
  }, [open, employee?.id]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    file = await processImageFile(file);
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Arquivo muito grande (máx 5MB)' });
      return;
    }
    setUploading(true);
    try {
      const safeName = sanitizeStorageFileName(file.name);
      const path = `photos/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage.from('employee-photos').upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('employee-photos').getPublicUrl(path);
      setPhotoUrl(publicUrl);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao enviar foto', description: getErrorMessage(err) });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setActiveTab(TAB_DADOS); toast({ variant: 'destructive', title: 'Nome é obrigatório' }); return; }
    if (parseCurrency(salary) <= 0) { setActiveTab(TAB_REMUNERACAO); toast({ variant: 'destructive', title: 'Salário é obrigatório' }); return; }
    if (createAccess && !email.trim()) { setActiveTab(TAB_DADOS); toast({ variant: 'destructive', title: 'Email é obrigatório para criar acesso' }); return; }
    const finalPassword = useTemporaryPassword ? (password || generatePassword()) : password;
    if (createAccess && finalPassword.length < 6) { setActiveTab(TAB_REMUNERACAO); toast({ variant: 'destructive', title: 'Senha deve ter pelo menos 6 caracteres' }); return; }
    draft.clearDraft();
    onSubmit({
      name: name.trim(),
      cpf: cpf || null,
      phone: phone || null,
      email: email || null,
      position: position || null,
      salary: parseCurrency(salary),
      monthly_cost: parseCurrency(monthlyCost) || null,
      monthly_cost_breakdown: monthlyCostBreakdown,
      hire_date: hireDate || null,
      address: address || null,
      pix_key: pixKey || null,
      photo_url: photoUrl || null,
      user_id: linkedUserId,
      ponto_enabled: pontoEnabled,
      payment_frequency: paymentFrequency,
      payment_day_type: paymentFrequency === 'weekly' ? 'calendar' : paymentDayType,
      payment_day: paymentFrequency === 'weekly' ? null : paymentDay,
      payment_day_2: paymentFrequency === 'biweekly' ? paymentDay2 : null,
      payment_weekday: paymentFrequency === 'weekly' ? paymentWeekday : null,
      _createAccess: createAccess,
      _password: finalPassword,
    } as any);
  };

  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={employee ? 'Editar Funcionário' : 'Novo Funcionário'}>
      <DraftResumeDialog
        open={draft.showResumePrompt}
        onResume={() => {
          if (draft.draftData) applyDraft(draft.draftData);
          draft.acceptDraft();
        }}
        onDiscard={() => {
          draft.discardDraft();
          setName(''); setCpf(''); setPhone(''); setEmail(''); setPosition('');
          setSalary(''); setMonthlyCost(''); setMonthlyCostBreakdown(null); setHireDate(''); setAddress(''); setPixKey('');
        }}
      />
      <form onSubmit={handleSubmit} className="space-y-4 p-1">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="space-y-4">
          <TabsList className="mx-auto flex w-full max-w-md">
            <TabsTrigger
              value={TAB_DADOS}
              className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Dados
            </TabsTrigger>
            <TabsTrigger
              value={TAB_REMUNERACAO}
              className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Remuneração & Acesso
            </TabsTrigger>
          </TabsList>

          <TabsContent value={TAB_DADOS} className="space-y-4">
        {/* Photo */}
        <div className="flex flex-col items-center gap-1.5">
          <label className="cursor-pointer relative group">
            {photoUrl ? (
              <>
                <Avatar className="h-20 w-20">
                  <AvatarImage src={photoUrl} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">{initials}</AvatarFallback>
                </Avatar>
                {/* Overlay de troca aparece no hover/toque */}
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploading ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Camera className="h-5 w-5 text-white" />}
                </div>
              </>
            ) : (
              // Vazio: dica visual clara de upload — borda tracejada + câmera sempre visível
              <div className="h-20 w-20 rounded-full border-2 border-dashed border-primary/50 bg-primary/5 flex items-center justify-center transition-colors group-hover:bg-primary/10 group-hover:border-primary">
                {uploading ? (
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                ) : (
                  <Camera className="h-6 w-6 text-primary" />
                )}
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
          </label>
          <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
            {photoUrl ? 'Trocar foto' : 'Adicionar foto do funcionário'}
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nome Completo *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do funcionário" required />
          </div>
          <div className="space-y-1.5">
            <Label>CPF</Label>
            <Input value={cpf} onChange={e => setCpf(cpfCnpjMask(e.target.value))} placeholder="000.000.000-00" />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <Input value={phone} onChange={e => setPhone(phoneMask(e.target.value))} placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Cargo</Label>
            <Input value={position} onChange={e => setPosition(e.target.value)} placeholder="Ex: Técnico" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Endereço</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Endereço completo" />
          </div>
          <div className="space-y-1.5">
            <Label>Data de Admissão</Label>
            <Input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Chave PIX</Label>
            <Input value={pixKey} onChange={e => setPixKey(pixKeyMask(e.target.value))} placeholder="CPF, email, telefone ou chave aleatória" />
          </div>
        </div>

          </TabsContent>

          <TabsContent value={TAB_REMUNERACAO} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Salário *</Label>
            <Input value={salary} onChange={e => setSalary(currencyMask(e.target.value))} placeholder="R$ 0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Custo mensal total</Label>
            <div className="flex gap-1">
              <Input value={monthlyCost} onChange={e => setMonthlyCost(currencyMask(e.target.value))} placeholder="R$ 0,00" />
              <Button type="button" variant="outline" size="sm" className="h-10 px-2 shrink-0" onClick={() => setShowCostCalc(true)} title="Calcular custo mensal detalhado">
                <Calculator className="h-4 w-4 mr-1" />
                Calcular
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Salário + encargos + benefícios</p>
          </div>
        </div>

        {/* Configuração de pagamento */}
        <div className="rounded-lg border p-3 space-y-3">
          <Label className="text-sm font-medium">Configuração de Pagamento</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Frequência</Label>
              <Select value={paymentFrequency} onValueChange={(v) => setPaymentFrequency(v as PaymentFrequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="biweekly">Quinzenal</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paymentFrequency !== 'weekly' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tipo de dia</Label>
                <Select value={paymentDayType} onValueChange={(v) => setPaymentDayType(v as PaymentDayType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="business">Dia útil</SelectItem>
                    <SelectItem value="calendar">Dia corrido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {paymentFrequency === 'monthly' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">{paymentDayType === 'business' ? 'N° dia útil do mês' : 'Dia do mês'}</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={paymentDay}
                  onChange={e => setPaymentDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                />
              </div>
            )}
            {paymentFrequency === 'biweekly' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">1° pagamento</Label>
                  <Input
                    type="number" min={1} max={31}
                    value={paymentDay}
                    onChange={e => setPaymentDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">2° pagamento</Label>
                  <Input
                    type="number" min={1} max={31}
                    value={paymentDay2}
                    onChange={e => setPaymentDay2(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                  />
                </div>
              </>
            )}
            {paymentFrequency === 'weekly' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Dia da semana</Label>
                <Select value={String(paymentWeekday)} onValueChange={(v) => setPaymentWeekday(parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Domingo</SelectItem>
                    <SelectItem value="1">Segunda-feira</SelectItem>
                    <SelectItem value="2">Terça-feira</SelectItem>
                    <SelectItem value="3">Quarta-feira</SelectItem>
                    <SelectItem value="4">Quinta-feira</SelectItem>
                    <SelectItem value="5">Sexta-feira</SelectItem>
                    <SelectItem value="6">Sábado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Valor da folha aparece automaticamente em Contas a Pagar conforme essa configuração.
          </p>
        </div>

        {/* Ponto eletrônico por link público */}
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <Label className="text-sm font-medium">Ponto eletrônico</Label>
                <p className="text-xs text-muted-foreground">Gera um link público pro funcionário bater o ponto pelo celular</p>
              </div>
            </div>
            <LabeledSwitch
              value={pontoEnabled ? 'on' : 'off'}
              onChange={(v) => setPontoEnabled(v === 'on')}
              off={{ value: 'off', label: 'Desativado' }}
              on={{ value: 'on', label: 'Ativado' }}
              aria-label="Ponto eletrônico ativado"
            />
          </div>
          {pontoEnabled && (
            employee?.ponto_slug ? (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/ponto/${employee.ponto_slug}`}
                  className="text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 shrink-0 gap-1"
                  onClick={async () => {
                    const link = `${window.location.origin}/ponto/${employee.ponto_slug}`;
                    try {
                      await navigator.clipboard.writeText(link);
                      toast({ title: 'Link gerado e copiado!', description: link });
                    } catch {
                      toast({ variant: 'destructive', title: 'Não foi possível copiar', description: link });
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Salve o funcionário para gerar o link de ponto — ele será copiado automaticamente.
              </p>
            )
          )}
        </div>

        {/* Link to existing user */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Vincular a um usuário do sistema</Label>
          </div>
          <Select value={linkedUserId || '_none'} onValueChange={(v) => setLinkedUserId(v === '_none' ? null : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Nenhum usuário vinculado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Nenhum</SelectItem>
              {users.map(u => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.full_name} {u.phone ? `(${u.phone})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Vincula este funcionário a um usuário existente no sistema</p>
        </div>

        {/* Create system access toggle - on creation OR on edit when no linked user */}
        {(!employee || (employee && !employee.user_id && !linkedUserId)) && (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Switch checked={createAccess} onCheckedChange={(v) => { setCreateAccess(v); if (v && !password) setPassword(''); }} />
              <div>
                <Label className="text-sm cursor-pointer">Criar acesso ao sistema</Label>
                <p className="text-xs text-muted-foreground">Cria automaticamente um usuário com perfil Técnico{employee ? ' usando os dados deste funcionário' : ''}</p>
              </div>
            </div>
            {createAccess && (
              <div className="space-y-3 pt-1">
                {!email && <p className="text-xs text-destructive">Preencha o email acima para criar o acesso</p>}
                {email && (
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Login de acesso</p>
                    <p className="text-sm font-medium">{email}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch checked={useTemporaryPassword} onCheckedChange={(v) => { setUseTemporaryPassword(v); setPassword(''); }} />
                  <Label className="text-xs cursor-pointer">Senha temporária (gerada automaticamente)</Label>
                </div>
                <div className="space-y-1.5">
                  <Label>{useTemporaryPassword ? 'Senha temporária' : 'Senha *'}</Label>
                  {useTemporaryPassword ? (
                    <div className="flex gap-2">
                      <Input value={password} onChange={e => setPassword(e.target.value)} placeholder="Senha" />
                      <Button type="button" variant="outline" size="sm" onClick={() => setPassword(generatePassword())}>Gerar</Button>
                    </div>
                  ) : (
                    <>
                      <PasswordInput value={password} onChange={e => setPassword(e.target.value)} placeholder="Crie uma senha segura" />
                      <PasswordStrengthIndicator password={password} />
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {useTemporaryPassword ? 'Anote a senha — ela será exibida apenas uma vez' : 'Defina a senha que o funcionário usará para acessar o sistema'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

          </TabsContent>
        </Tabs>

        {/* Rodapé de ações fixo — sempre visível independente da aba ativa */}
        <div className="flex justify-end gap-2 pt-2 border-t mt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {employee ? 'Salvar' : 'Criar Funcionário'}
          </Button>
        </div>
      </form>
      <MonthlyCostCalculatorModal
        open={showCostCalc}
        onOpenChange={setShowCostCalc}
        initialSalary={parseCurrency(salary)}
        initialBreakdown={monthlyCostBreakdown}
        defaultMonthlyHours={resolvedMonthlyHours}
        onApply={(totalCost, breakdown) => {
          setMonthlyCost(currencyMask(String(Math.round(totalCost * 100))));
          setMonthlyCostBreakdown(breakdown);
          // Also update salary from breakdown base salary if it was set
          if (breakdown.baseSalary > 0 && parseCurrency(salary) === 0) {
            setSalary(currencyMask(String(Math.round(breakdown.baseSalary * 100))));
          }
        }}
      />
    </ResponsiveModal>
  );
}
