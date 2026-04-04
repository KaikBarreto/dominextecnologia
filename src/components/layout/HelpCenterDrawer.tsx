import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { HelpCircle } from 'lucide-react';

const faqs = [
  {
    q: 'Como criar uma Ordem de Serviço?',
    a: 'Acesse "Ordens de Serviço" no menu lateral, clique em "+ Nova OS", preencha os dados do cliente, tipo de serviço e técnico responsável, depois salve.',
  },
  {
    q: 'Como cadastrar um novo cliente?',
    a: 'Vá em "Clientes" no menu, clique em "Novo Cliente" e preencha os dados. Você pode cadastrar pessoa física (CPF) ou jurídica (CNPJ).',
  },
  {
    q: 'Como funciona o controle financeiro?',
    a: 'No menu "Financeiro" você tem visão geral, movimentações, contas a pagar/receber e DRE. As OS podem gerar lançamentos financeiros automaticamente.',
  },
  {
    q: 'Como funcionam os pagamentos de funcionários?',
    a: 'Em "Funcionários", clique no ícone de pagamento no card do funcionário. O sistema calcula automaticamente salário + bônus - vales - faltas e permite selecionar a conta de débito.',
  },
  {
    q: 'Como configurar o controle de ponto?',
    a: 'Acesse Funcionários > Controle de Ponto. Defina horários padrão, tolerância de atraso e requisitos de selfie/geolocalização nas configurações.',
  },
  {
    q: 'Como criar contratos recorrentes?',
    a: 'Em "Contratos", crie um novo contrato definindo cliente, frequência (mensal, bimestral, etc.) e período. O sistema gera automaticamente as ocorrências programadas.',
  },
  {
    q: 'O que é o CRM e como usar?',
    a: 'O CRM é seu funil de vendas. Crie leads, mova entre etapas (Novo, Contato, Proposta, Ganho/Perdido) e acompanhe o valor do pipeline em tempo real.',
  },
  {
    q: 'Como funciona o módulo de Estoque?',
    a: 'Em "Estoque", cadastre itens com preço de custo/venda, quantidade mínima e unidade. O sistema alerta quando o estoque fica abaixo do mínimo.',
  },
  {
    q: 'Como exportar relatórios?',
    a: 'Diversos módulos possuem botões de exportação (PDF, HTML). No extrato de funcionários, orçamentos e DRE há opções de exportação e impressão.',
  },
  {
    q: 'Como alterar minha senha?',
    a: 'Acesse "Perfil" pelo menu do usuário (canto inferior da sidebar) e clique em "Alterar Senha". Você receberá um email para redefinição.',
  },
];

interface HelpCenterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpCenterDrawer({ open, onOpenChange }: HelpCenterDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Central de Ajuda
          </SheetTitle>
        </SheetHeader>

        <p className="text-sm text-muted-foreground mb-4">
          Dúvidas frequentes sobre o sistema. Caso não encontre sua resposta, entre em contato pelo Suporte via WhatsApp.
        </p>

        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, i) => (
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
