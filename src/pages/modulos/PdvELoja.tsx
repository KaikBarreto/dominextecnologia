import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo PDV & Loja. Rota: /pdv-e-loja. */
export default function PdvELoja() {
  const { locale } = useLocale();
  const data = getModuleData('pdv', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
