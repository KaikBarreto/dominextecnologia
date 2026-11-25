import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { phoneMask } from '@/utils/masks';
import { NoticeBanner } from '@/components/ui/NoticeBanner';

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: { id: string; name: string; phone: string | null; email: string | null; position: string | null; birth_date?: string | null } | null;
  onSubmit: (data: { id: string; name: string; phone?: string; email?: string; position?: string; birth_date?: string | null }) => Promise<void>;
  isLoading: boolean;
}

function createContactId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function ContactFormContent({ contact, onSubmit, onCancel, isLoading }: {
  contact?: ContactFormDialogProps['contact'];
  onSubmit: ContactFormDialogProps['onSubmit'];
  onCancel: () => void;
  isLoading: boolean;
}) {
  const { locale } = useAppLocaleContext();
  const tc = MESSAGES[locale].app.customers.contact;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [submitFailed, setSubmitFailed] = useState(false);
  const [contactId] = useState(() => contact?.id ?? createContactId());

  useEffect(() => {
    if (contact) {
      setName(contact.name);
      setPhone(contact.phone ? phoneMask(contact.phone) : '');
      setEmail(contact.email || '');
      setPosition(contact.position || '');
      setBirthDate(contact.birth_date || '');
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setPosition('');
      setBirthDate('');
    }
    setSubmitFailed(false);
  }, [contact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitFailed(false);
    try {
      await onSubmit({
        id: contactId,
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        position: position.trim() || undefined,
        birth_date: birthDate || (contact ? null : undefined),
      });
    } catch {
      setSubmitFailed(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contact-name">{tc.fieldName}</Label>
        <Input id="contact-name" value={name} onChange={e => setName(e.target.value)} placeholder={tc.namePlaceholder} required disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-position">{tc.fieldPosition}</Label>
        <Input id="contact-position" value={position} onChange={e => setPosition(e.target.value)} placeholder={tc.positionPlaceholder} disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-phone">{tc.fieldPhone}</Label>
        <Input id="contact-phone" value={phone} onChange={e => setPhone(phoneMask(e.target.value))} placeholder={tc.phonePlaceholder} disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-birth-date">{tc.fieldBirthDate}</Label>
        <Input id="contact-birth-date" type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-email">{tc.fieldEmail}</Label>
        <Input id="contact-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={tc.emailPlaceholder} disabled={isLoading} />
      </div>
      {submitFailed && (
        <NoticeBanner variant="neutral" title={tc.saveProblemTitle}>
          {tc.saveProblemDescription}
        </NoticeBanner>
      )}
      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
        <Button type="button" variant="destructive-ghost" onClick={onCancel} disabled={isLoading}>{tc.cancel}</Button>
        <Button type="submit" disabled={isLoading || !name.trim()}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {contact ? tc.save : tc.add}
        </Button>
      </div>
    </form>
  );
}

export function ContactFormDialog({ open, onOpenChange, contact, onSubmit, isLoading }: ContactFormDialogProps) {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const tc = MESSAGES[locale].app.customers.contact;
  const title = contact ? tc.titleEdit : tc.titleNew;

  const handleSubmit = async (data: { id: string; name: string; phone?: string; email?: string; position?: string; birth_date?: string | null }) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="[--primary:0_0%_10%] [--primary-foreground:0_0%_100%] [--ring:0_0%_10%] dark:[--primary:0_0%_88%] dark:[--primary-foreground:0_0%_8%] dark:[--ring:0_0%_70%]">
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
      <DialogContent className="max-w-md [--primary:0_0%_10%] [--primary-foreground:0_0%_100%] [--ring:0_0%_10%] dark:[--primary:0_0%_88%] dark:[--primary-foreground:0_0%_8%] dark:[--ring:0_0%_70%]">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <ContactFormContent contact={contact} onSubmit={handleSubmit} onCancel={() => onOpenChange(false)} isLoading={isLoading} />
      </DialogContent>
    </Dialog>
  );
}
