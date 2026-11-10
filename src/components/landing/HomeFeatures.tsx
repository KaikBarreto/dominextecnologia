import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BadgeDollarSign,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  DollarSign,
  FileText,
  FileSignature,
  MessageCircleMore,
  Package,
  Receipt,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  UserCircle,
  Wrench,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/i18n';
import { localizeHash } from '@/lib/i18n/localizeHash';
import WhatsAppCtaLink from '@/components/landing/WhatsAppCtaLink';

const HOME_FEATURE_ICONS = [
  ClipboardList,
  Smartphone,
  ClipboardCheck,
  TrendingUp,
  DollarSign,
  Clock,
  Receipt,
  UserCircle,
  Package,
  FileText,
  FileSignature,
  Wrench,
  BarChart3,
  MessageCircleMore,
  BadgeDollarSign,
  ShoppingCart,
];

// Capturas reais da Dominex. A ordem acompanha messages.home.features.items.
const HOME_FEATURE_SCREENSHOTS = [
  '/guia-tecnico/img/t5-lista-os.jpg',
  '/guia-tecnico/img/t7-os-compartilhada.jpg',
  '/guia-tecnico/img/t3-equipamentos.jpg',
  '/guia-tecnico/img/t10-gerenciar-estagios.jpg',
  '/guia-tecnico/img/t13-financeiro-contas.jpg',
  '/guia-tecnico/img/t15-funcionarios.jpg',
  '/guia-tecnico/img/t13-financeiro-relatorio.jpg',
  '/guia-tecnico/img/t12-cliente-aba-chamados.jpg',
  '/guia-tecnico/img/t8-posicao-estoque.jpg',
  '/guia-tecnico/img/t9-orcamentos.jpg',
  '/guia-tecnico/img/t11-contratos.jpg',
  '/guia-tecnico/img/t4-servicos.jpg',
  '/guia-tecnico/img/t17-dashboard-kpis.jpg',
  '/guia-tecnico/img/t1-integracoes-whatsapp.jpg',
  '/guia-tecnico/img/t13-financeiro-movimentacoes.jpg',
  '/guia-tecnico/img/t8-estoque.jpg',
];

export default function HomeFeatures() {
  const { locale, messages } = useLocale();
  const t = messages.home.features;
  const [activeIndex, setActiveIndex] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);

  const features = t.items.map((item, index) => ({
    ...item,
    icon: HOME_FEATURE_ICONS[index],
    image: HOME_FEATURE_SCREENSHOTS[index],
  }));

  const showFeature = useCallback(
    (index: number) => {
      setActiveIndex(Math.max(0, Math.min(features.length - 1, index)));
    },
    [features.length],
  );

  useEffect(() => {
    const container = tabsRef.current;
    const activeTab = container?.querySelector<HTMLElement>(`[data-feature-tab="${activeIndex}"]`);
    if (!container || !activeTab) return;

    const left = activeTab.offsetLeft - container.clientWidth / 2 + activeTab.clientWidth / 2;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [activeIndex]);

  return (
    <section
      id={localizeHash('recursos', locale)}
      className="border-y border-[#e3e7e2] bg-white py-24 dark:border-white/10 dark:bg-[#050706] lg:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mx-auto mb-12 max-w-3xl text-center">
          <h2 className="text-4xl font-semibold tracking-[-0.04em] text-[#101512] dark:text-white sm:text-5xl">
            {t.heading}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#657068] dark:text-white/55">
            {t.subheading}
          </p>
        </header>

        <div className="relative mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => showFeature(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="Funcionalidade anterior"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d8dfd9] bg-white text-[#101512] transition hover:border-[#101512] hover:bg-[#101512] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/15 dark:bg-[#0b0e0c] dark:text-white/70"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div
            ref={tabsRef}
            role="tablist"
            aria-label="Funcionalidades da Dominex"
            className="flex flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {features.map((feature, index) => {
              const Icon = feature.icon;
              const isActive = index === activeIndex;
              return (
                <button
                  key={feature.title}
                  type="button"
                  role="tab"
                  data-feature-tab={index}
                  aria-selected={isActive}
                  aria-controls={`home-feature-panel-${index}`}
                  onClick={() => showFeature(index)}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    isActive
                      ? 'border-primary bg-primary text-white'
                      : 'border-[#dfe5e0] bg-white text-[#59645c] hover:border-[#b8c2bb] hover:text-[#101512] dark:border-white/10 dark:bg-[#0b0e0c] dark:text-white/60 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {feature.title}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => showFeature(activeIndex + 1)}
            disabled={activeIndex === features.length - 1}
            aria-label="Próxima funcionalidade"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d8dfd9] bg-white text-[#101512] transition hover:border-[#101512] hover:bg-[#101512] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/15 dark:bg-[#0b0e0c] dark:text-white/70"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-hidden rounded-3xl border border-[#d8dfd9] bg-[#f7f8f5] shadow-[0_28px_80px_-52px_rgba(16,21,18,0.4)] dark:border-white/10 dark:bg-[#0b0e0c] dark:shadow-none">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const isActive = index === activeIndex;
            return (
              <article
                key={feature.title}
                id={`home-feature-panel-${index}`}
                role="tabpanel"
                aria-hidden={!isActive}
                className={`${isActive ? 'grid' : 'hidden'} min-h-[500px] lg:grid-cols-[0.72fr_1.28fr]`}
              >
                <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white">
                    <Icon className="h-7 w-7" />
                  </div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">
                    {String(index + 1).padStart(2, '0')} / {String(features.length).padStart(2, '0')}
                  </p>
                  <h3 className="text-3xl font-semibold tracking-[-0.025em] text-[#101512] dark:text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-5 max-w-lg text-base leading-7 text-[#59645c] dark:text-white/60">
                    {feature.description}
                  </p>
                </div>

                <div className="flex items-center border-t border-[#dfe5e0] bg-white p-4 dark:border-white/10 dark:bg-black/20 sm:p-6 lg:border-l lg:border-t-0 lg:p-8">
                  <img
                    src={feature.image}
                    alt={`${feature.title} dentro do sistema Dominex`}
                    width={1280}
                    height={720}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    className="aspect-[16/10] w-full rounded-2xl border border-[#dfe5e0] bg-white object-cover object-top shadow-[0_20px_45px_-32px_rgba(16,21,18,0.5)] dark:border-white/10"
                  />
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-10 flex justify-center">
          <Button
            size="lg"
            className="h-auto whitespace-normal rounded-xl bg-primary px-8 py-6 text-center text-base font-semibold leading-tight text-white shadow-[0_14px_30px_-16px_rgba(0,197,151,0.75)] transition-transform hover:scale-[1.02] hover:bg-[#00ad85]"
            asChild
          >
            <WhatsAppCtaLink>
              {t.cta}
              <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
            </WhatsAppCtaLink>
          </Button>
        </div>
      </div>
    </section>
  );
}
