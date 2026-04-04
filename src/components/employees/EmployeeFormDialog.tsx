import { useState, useEffect } from 'react';
import { Loader2, Camera, Link2, Unlink, Eye, EyeOff, Calculator } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { useToast } from '@/hooks/use-toast';
import { Employee } from '@/hooks/useEmployees';
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
  const [monthlyCost, setMonthlyCost] = useState('');
  const [monthlyCostBreakdown, setMonthlyCostBreakdown] = useState<MonthlyCostBreakdown | null>(null);
  const [showCostCalc, setShowCostCalc] = useState(false);

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
      }
      setPhotoUrl(employee?.photo_url || '');
      setCreateAccess(false);
      setUseTemporaryPassword(false);
      setPassword('');
      setLinkedUserId(employee?.user_id || null);
    }
  }, [open, employee]);

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
      const path = `photos/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('employee-photos').upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('employee-photos').getPublicUrl(path);
      setPhotoUrl(publicUrl);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao enviar foto', description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast({ variant: 'destructive', title: 'Nome é obrigatório' }); return; }
    if (createAccess && !email.trim()) { toast({ variant: 'destructive', title: 'Email é obrigatório para criar acesso' }); return; }
    const finalPassword = useTemporaryPassword ? (password || generatePassword()) : password;
    if (createAccess && finalPassword.length < 6) { toast({ variant: 'destructive', title: 'Senha deve ter pelo menos 6 caracteres' }); return; }
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
        {/* Photo */}
        <div className="flex justify-center">
          <label className="cursor-pointer relative group">
            <Avatar className="h-20 w-20">
              <AvatarImage src={photoUrl || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploading ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Camera className="h-5 w-5 text-white" />}
            </div>
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
          <div className="space-y-1.5">
            <Label>Data de Admissão</Label>
            <Input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Endereço</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Endereço completo" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Chave PIX</Label>
            <Input value={pixKey} onChange={e => setPixKey(pixKeyMask(e.target.value))} placeholder="CPF, email, telefone ou chave aleatória" />
          </div>
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
                  <Switch checked={useTemporaryPassword} onCheckedChange={(v) => { setUseTemporaryPassword(v); if (v) setPassword(generatePassword()); else setPassword(''); }} />
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
                    <div className="relative">
                      <Input type={showPasswordField ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                      <button type="button" onClick={() => setShowPasswordField(!showPasswordField)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPasswordField ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {useTemporaryPassword ? 'Anote a senha — ela será exibida apenas uma vez' : 'Defina a senha que o funcionário usará para acessar o sistema'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
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
