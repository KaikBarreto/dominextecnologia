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
 * Ícones das funcionalidades da HOME, na ORDEM do array de textos em
 * `messages.home.features.items`. Ícones coerentes com o mega-menu "Soluções"
 * do navbar. Título/descrição vêm do i18n (pt-br idêntico ao texto anterior).
 *
 * Sem --seg-accent na home → ScrollSyncFeatures cai no verde de marca Dominex.
 *
 * Regra do CEO: NÃO prometer "offline"/"sem internet" — o app não funciona
 * offline.
 */
const HOME_FEATURE_ICONS = [
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
];

export default function HomeFeatures() {
  const { locale, messages } = useLocale();
  const t = messages.home.features;
  const features: ScrollSyncFeature[] = t.items.map((item, i) => ({
    icon: HOME_FEATURE_ICONS[i],
    title: item.title,
    description: item.description,
  }));
  return (
    <ScrollSyncFeatures
      sectionId={localizeHash('recursos', locale)}
      features={features}
      heading={t.heading}
      subheading={t.subheading}
      footer={
        <Button
          size="lg"
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 py-6 text-base rounded-xl transition-transform hover:scale-[1.02]"
          asChild
        >
          <Link to="/cadastro">
            {t.cta}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
      }
    />
  );
}
