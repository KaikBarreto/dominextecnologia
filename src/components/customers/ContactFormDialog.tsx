import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: { id: string; name: string; phone: string | null; email: string | null; position: string | null } | null;
  onSubmit: (data: { name: string; phone?: string; email?: string; position?: string }) => Promise<void>;
  isLoading: boolean;
}

function ContactFormContent({ contact, onSubmit, onCancel, isLoading }: {
  contact?: ContactFormDialogProps['contact'];
  onSubmit: ContactFormDialogProps['onSubmit'];
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');

  useEffect(() => {
    if (contact) {
      setName(contact.name);
      setPhone(contact.phone || '');
      setEmail(contact.email || '');
      setPosition(contact.position || '');
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setPosition('');
    }
  }, [contact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onSubmit({
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      position: position.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contact-name">Nome *</Label>
        <Input id="contact-name" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do contato" required disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-position">Cargo</Label>
        <Input id="contact-position" value={position} onChange={e => setPosition(e.target.value)} placeholder="Ex: Gerente, Supervisor, Zelador" disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-phone">Telefone</Label>
        <Input id="contact-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-email">Email corporativo</Label>
        <Input id="contact-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contato@empresa.com" disabled={isLoading} />
      </div>
      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
        <Button type="button" variant="destructive-ghost" onClick={onCancel} disabled={isLoading}>Cancelar</Button>
        <Button type="submit" disabled={isLoading || !name.trim()}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {contact ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    </form>
  );
}

export function ContactFormDialog({ open, onOpenChange, contact, onSubmit, isLoading }: ContactFormDialogProps) {
  const isMobile = useIsMobile();
  const title = contact ? 'Editar Contato' : 'Novo Contato';

  const handleSubmit = async (data: { name: string; phone?: string; email?: string; position?: string }) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left"><DrawerTitle>{title}</DrawerTitle></DrawerHeader>
          <div className="px-4 pb-4">
            <ContactFormContent contact={contact} onSubmit={handleSubmit} onCancel={() => onOpenChange(false)} isLoading={isLoading} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <ContactFormContent contact={contact} onSubmit={handleSubmit} onCancel={() => onOpenChange(false)} isLoading={isLoading} />
      </DialogContent>
    </Dialog>
  );
}
