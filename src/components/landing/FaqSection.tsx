import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const faqs = [
  {
    q: 'O Dominex serve para qual tipo de empresa?',
    a: 'Para empresas que prestam serviços técnicos em campo: refrigeração e climatização, PMOC, manutenção predial, elétrica, dedetização, telecom, segurança eletrônica, instalações, assistência técnica e qualquer operação que envolva equipes externas e ordens de serviço.',
  },
  {
    q: 'Funciona em celular? Tem app para o técnico?',
    a: 'Sim. A plataforma é 100% web e responsiva (funciona em qualquer navegador) e o técnico acessa por um app PWA instalável no Android e iOS, com check-in/out, fotos, assinatura digital e questionários.',
  },
  {
    q: 'Como funciona o teste grátis?',
    a: 'São 7 dias com acesso completo ao plano escolhido, sem precisar de cartão de crédito. Você pode cancelar a qualquer momento e seus dados ficam preservados caso decida assinar depois.',
  },
  {
    q: 'Os dados das ordens de serviço ficam guardados para sempre?',
    a: 'Sim. Mantemos o histórico completo de OS, equipamentos, clientes e relatórios sem limite de retenção enquanto sua assinatura estiver ativa, garantindo rastreabilidade para garantias, auditorias e PMOC.',
  },
  {
    q: 'Consigo controlar PMOC e contratos recorrentes?',
    a: 'Sim. O Dominex gera automaticamente as ordens de serviço dos contratos de manutenção (mensal, bimestral, trimestral etc.) e mantém o calendário PMOC organizado por equipamento e cliente.',
  },
  {
    q: 'Posso personalizar formulários, checklists e relatórios?',
    a: 'Sim. Você cria templates de questionários por tipo de serviço, define campos obrigatórios, fotos e assinatura. Os relatórios de OS são gerados em PDF com a sua marca, cores e logotipo.',
  },
  {
    q: 'Tem CRM e funil de vendas integrado?',
    a: 'Sim. O plano Master inclui um CRM completo com funil Kanban, etapas customizáveis, webhooks para captação de leads e conversão direta em orçamentos e ordens de serviço.',
  },
  {
    q: 'Consigo controlar o financeiro, contas a pagar e DRE?',
    a: 'Sim. A partir do plano Avançado você tem contas a pagar/receber, múltiplas contas bancárias, fluxo de caixa, recorrências, conciliação por categoria e DRE para análise de resultado.',
  },
  {
    q: 'Como funciona o controle de ponto e folha dos funcionários?',
    a: 'O módulo de RH permite registro de ponto pelo próprio funcionário, controle de horas, faltas, vales, bônus e geração de extratos individuais com cálculo proporcional à jornada.',
  },
  {
    q: 'Posso ter mais usuários do que o plano permite?',
    a: 'Sim. Você pode adicionar usuários extras a qualquer plano por uma taxa mensal adicional, ou migrar para um plano superior quando precisar de mais recursos.',
  },
  {
    q: 'Como é o suporte? Falo com gente de verdade?',
    a: 'Sim. Atendimento humano via WhatsApp e e-mail em horário comercial. Os planos Master e Personalizado contam com suporte prioritário e gestor de conta dedicado.',
  },
  {
    q: 'Meus dados estão seguros? E a LGPD?',
    a: 'Sim. Utilizamos infraestrutura em nuvem com criptografia, backups automáticos e isolamento total entre empresas (multi-tenant). Cumprimos integralmente a LGPD e você é o titular dos seus dados.',
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
