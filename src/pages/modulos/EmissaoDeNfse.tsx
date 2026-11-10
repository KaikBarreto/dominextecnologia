import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo fiscal. Rota canônica: /emissao-de-nota-fiscal. */
export default function EmissaoDeNfse() {
  const { locale } = useLocale();
  const data = getModuleData('emissao-de-nota-fiscal', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
