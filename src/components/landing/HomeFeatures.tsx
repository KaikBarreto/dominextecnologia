import {
  ClipboardList,
  Smartphone,
  Map,
  ClipboardCheck,
  TrendingUp,
  DollarSign,
  Clock,
  Receipt,
  UserCircle,
  Package,
  FileText,
  Wrench,
  BarChart3,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ScrollSyncFeatures, {
  type ScrollSyncFeature,
} from '@/components/landing/ScrollSyncFeatures';
import { useLocale } from '@/lib/i18n';
import { localizeHash } from '@/lib/i18n/localizeHash';

/**
 * Lista de funcionalidades da HOME — mais completa e atualizada que a de
 * segmento, com os módulos reais do produto e destaque pra Área do Técnico™.
 * Ícones coerentes com o mega-menu "Soluções" do navbar.
 *
 * Sem --seg-accent na home → ScrollSyncFeatures cai no verde de marca Dominex.
 *
 * Regra do CEO: NÃO prometer "offline"/"sem internet" — o app não funciona
 * offline.
 */
const HOME_FEATURES: ScrollSyncFeature[] = [
  {
    icon: ClipboardList,
    title: 'Ordens de serviço digitais',
    description:
      'Crie, atribua e acompanhe OS com foto, checklist, assinatura digital e histórico completo. Acabou o papel e o retrabalho.',
  },
  {
    icon: Smartphone,
    title: 'App do técnico em campo',
    description:
      'Aplicativo instalável no celular: o técnico recebe a OS, faz check-in, tira fotos e coleta a assinatura do cliente, direto do campo.',
  },
  {
    icon: Map,
    title: 'Agenda e rastreamento de equipes',
    description:
      'Veja a equipe no mapa ao vivo, organize a rota do dia e distribua chamados pelo técnico mais próximo, sem conflito de horário.',
  },
  {
    icon: ClipboardCheck,
    title: 'PMOC automático',
    description:
      'Gere o PMOC pela Lei 13.589/2018 por equipamento, com visitas, checklist e a planilha pronta. Preventivas recorrentes no piloto automático.',
  },
  {
    icon: TrendingUp,
    title: 'CRM e vendas',
    description:
      'Funil de clientes, orçamentos e propostas até fechar o negócio. Acompanhe cada oportunidade sem perder o ponto do follow-up.',
  },
  {
    icon: DollarSign,
    title: 'Financeiro completo',
    description:
      'Contas a pagar e a receber, fluxo de caixa, cartões e categorias. Saiba quanto entra, quanto sai e o que sobra de verdade.',
  },
  {
    icon: Clock,
    title: 'Ponto e folha (RH)',
    description:
      'Controle de ponto da equipe, vales, bônus e folha de pagamento. Recibos prontos, sem planilha paralela.',
  },
  {
    icon: Receipt,
    title: 'NFS-e',
    description:
      'Emita a nota fiscal de serviço direto pela plataforma, por cliente, com o código fiscal do seu município.',
  },
  {
    icon: UserCircle,
    title: 'Portal do cliente',
    description:
      'Seu cliente acompanha OS, orçamentos e histórico por link, sem precisar ligar. Mais transparência, menos telefone tocando.',
  },
  {
    icon: Package,
    title: 'Controle de estoque',
    description:
      'Peças e materiais com baixa automática a cada OS. Saiba o que tem em mãos antes de prometer prazo ao cliente.',
  },
  {
    icon: FileText,
    title: 'Orçamentos e contratos',
    description:
      'Orçamento aprovado por link vira contrato e OS recorrente. Do "fechou" ao serviço agendado sem digitar tudo de novo.',
  },
  {
    icon: Wrench,
    title: 'Área do Técnico™',
    description:
      'Calculadoras, tabelas de gases e catálogo de equipamentos no bolso do técnico — a caixa de ferramentas que faltava no celular dele.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios e indicadores',
    description:
      'Painel com OS por status, tempo médio de atendimento e avaliação dos clientes. Decisões baseadas em dados, não no achismo.',
  },
];

export default function HomeFeatures() {
  const { locale } = useLocale();
  return (
    <ScrollSyncFeatures
      sectionId={localizeHash('recursos', locale)}
      features={HOME_FEATURES}
      heading="Tudo que sua operação precisa, em um só lugar"
      subheading="Do chamado ao faturamento, o Dominex cobre cada etapa do serviço"
      footer={
        <Button
          size="lg"
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 py-6 text-base rounded-xl transition-transform hover:scale-[1.02]"
          asChild
        >
          <Link to="/cadastro">
            Teste grátis 14 dias, sem cartão
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
      }
    />
  );
}
