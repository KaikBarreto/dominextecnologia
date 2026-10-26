import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo WhatsApp. Rota: /integracao-whatsapp. */
export default function IntegracaoWhatsapp() {
  const { locale } = useLocale();
  const data = getModuleData('whatsapp', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
