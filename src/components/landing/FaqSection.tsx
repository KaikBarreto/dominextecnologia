import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useLocale } from '@/lib/i18n';

export default function FaqSection() {
  const ref = useScrollReveal();
  const t = useLocale().messages.home.faq;
  const faqs = t.items;

  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12">
          {t.heading}
        </h2>

        <Accordion type="single" collapsible className="grid md:grid-cols-2 gap-3">
          {faqs.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-6 data-[state=open]:border-primary/20 h-fit"
            >
              <AccordionTrigger className="text-sm text-white/80 hover:text-white hover:no-underline py-5 text-left">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-white/55 leading-relaxed pb-5">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
