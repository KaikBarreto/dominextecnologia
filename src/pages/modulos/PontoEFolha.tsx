import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo Ponto & Folha (RH). Rota: /ponto-e-folha. */
export default function PontoEFolha() {
  const { locale } = useLocale();
  const data = getModuleData('ponto-e-folha', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
