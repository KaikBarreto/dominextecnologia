import { useState, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { CnpjDocumentInput, type CnpjData } from '@/components/customers/CnpjDocumentInput';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { mobileMask } from '@/utils/masks';

interface QuickCustomerDialogProps {
  open: boolean;
  /** Nome digitado pelo usuário no SearchableSelect (pré-preenche o campo). */
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  /** Chamado ao criar com sucesso; passa o id do novo cliente. */
  onCreated: (customerId: string) => void;
  /** Exige CPF/CNPJ (default true — cobrança Asaas). Passe false em contextos sem cobrança (ex: equipamento). */
  requireDocument?: boolean;
}

/**
 * Mini-dialog de criação rápida de cliente.
 * Coleta apenas nome + CPF/CNPJ (obrigatório Asaas) + email/telefone opcionais.
 * Usa `useCustomers().createCustomer` — nunca chama supabase direto.
 */
export function QuickCustomerDialog({
  open,
  initialName = '',
  onOpenChange,
  onCreated,
  requireDocument = true,
}: QuickCustomerDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.cobrar.quickCustomer;
  const { toast } = useToast();
  const { createCustomer } = useCustomers();

  const [name, setName] = useState(initialName);
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Sincroniza os campos sempre que o dialog ABRE (open=true).
  // Necessário porque o Radix não chama onOpenChange quando `open` muda
  // programaticamente de fora — o reset via handleOpenChange(true) nunca
  // seria disparado, deixando o campo nome vazio.
  useEffect(() => {
    if (open) {
      setName(initialName);
      setDocument('');
      setEmail('');
      setPhone('');
    }
  }, [open, initialName]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName('');
      setDocument('');
      setEmail('');
      setPhone('');
    }
    onOpenChange(next);
  };

  // Preenche campos automaticamente ao buscar CNPJ na BrasilAPI.
  const handleCnpjData = (data: CnpjData) => {
    if (data.razaoSocial && !name) setName(data.razaoSocial);
    if (data.email && !email) setEmail(data.email);
    if (data.phone && !phone) setPhone(mobileMask(data.phone));
  };

  const handleCreate = async () => {
    const trimmedDoc = document.replace(/\D/g, '');
    if (requireDocument && !trimmedDoc) {
      toast({ variant: 'destructive', title: t.customerRequired });
      return;
    }

    try {
      const created = await createCustomer.mutateAsync({
        name: name.trim(),
        customer_type: trimmedDoc.length === 14 ? 'pj' : 'pf',
        document: document.trim() || undefined,
        email: email.trim() || undefined,
        celular: phone.trim() || undefined,
      });
      onCreated(created.id);
      handleOpenChange(false);
    } catch {
      // O hook já faz o toast de erro, não precisa duplicar.
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title={t.title}
      description={t.description}
    >
      <div className="space-y-4 px-4 pb-4 sm:px-1">
        {/* Nome */}
        <div className="space-y-2">
          <Label htmlFor="qc-name" className="text-sm font-medium">
            {t.name}
          </Label>
          <Input
            id="qc-name"
            placeholder={t.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* CPF / CNPJ — obrigatório (Asaas exige) */}
        <div className="space-y-2">
          <Label htmlFor="qc-document" className="text-sm font-medium">
            {t.document}
          </Label>
          <CnpjDocumentInput
            value={document}
            onChange={setDocument}
            onDataFound={handleCnpjData}
            placeholder={t.documentPlaceholder}
          />
        </div>

        {/* Email — opcional */}
        <div className="space-y-2">
          <Label htmlFor="qc-email" className="text-sm font-medium">
            {t.email}
          </Label>
          <Input
            id="qc-email"
            type="email"
            placeholder={t.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Telefone — opcional */}
        <div className="space-y-2">
          <Label htmlFor="qc-phone" className="text-sm font-medium">
            {t.phone}
          </Label>
          <Input
            id="qc-phone"
            inputMode="tel"
            placeholder={t.phonePlaceholder}
            value={phone}
            onChange={(e) => setPhone(mobileMask(e.target.value))}
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={createCustomer.isPending}
          >
            {t.cancel}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createCustomer.isPending || !name.trim()}
          >
            {createCustomer.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.creating}
              </>
            ) : (
              t.create
            )}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
