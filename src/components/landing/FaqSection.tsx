import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const faqs = [
  {
    q: 'O Dominex funciona sem internet no campo?',
    a: 'Sim. O app do técnico tem modo offline. As informações são sincronizadas automaticamente quando a conexão é restabelecida.',
  },
  {
    q: 'Em quanto tempo consigo configurar tudo?',
    a: 'A maioria dos clientes está operando em menos de 1 dia. Nosso onboarding é guiado e simples.',
  },
  {
    q: 'Tenho integração com ERP/financeiro?',
    a: 'Sim. Temos integração com Omie, Conta Azul e API aberta para conectar com qualquer sistema.',
  },
  {
    q: 'Preciso instalar algum software?',
    a: 'Não. O painel do gestor é 100% web. O técnico usa o app mobile disponível para Android e iOS.',
  },
  {
    q: 'Posso personalizar os formulários de OS?',
    a: 'Sim. Crie checklists, campos customizados e formulários específicos para cada tipo de serviço.',
  },
  {
    q: 'Como funciona o período grátis?',
    a: '14 dias com acesso completo ao plano Pro, sem cartão de crédito. Cancele a qualquer momento.',
  },
];

export default function FaqSection() {
  const ref = useScrollReveal();

  return (
    <section className="py-24 bg-[hsl(0,0%,4%)]">
      <div ref={ref} className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12">
          Perguntas frequentes
        </h2>

        <Accordion type="single" collapsible className="space-y-2">
          {faqs.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-6 data-[state=open]:border-primary/20"
            >
              <AccordionTrigger className="text-sm text-white/80 hover:text-white hover:no-underline py-5">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-white/40 leading-relaxed pb-5">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
