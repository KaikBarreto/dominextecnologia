import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { HelpCircle } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';

interface HelpCenterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpCenterDrawer({ open, onOpenChange }: HelpCenterDrawerProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.help;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            {t.title}
          </SheetTitle>
        </SheetHeader>

        <p className="text-sm text-muted-foreground mb-4">
          {t.intro}
        </p>

        <Accordion type="single" collapsible className="w-full">
          {t.faqs.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-sm text-left">{faq.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </SheetContent>
    </Sheet>
  );
}
