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
    <section className="bg-white py-24 dark:bg-[#070908]">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-[-0.025em] text-[#101512] dark:text-white sm:text-4xl">
          {t.heading}
        </h2>

        <Accordion type="single" collapsible className="grid md:grid-cols-2 gap-3">
          {faqs.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="h-fit rounded-xl border border-[#dfe5e0] bg-[#fbfcfa] px-6 data-[state=open]:border-primary/50 dark:border-white/10 dark:bg-white/[0.02] dark:data-[state=open]:border-primary/30"
            >
              <AccordionTrigger className="py-5 text-left text-sm font-medium text-[#252c28] hover:text-black hover:no-underline dark:text-white/80 dark:hover:text-white">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-sm leading-relaxed text-[#657068] dark:text-white/55">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
