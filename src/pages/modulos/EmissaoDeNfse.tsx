import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo NFS-e. Rota: /emissao-de-nfse. */
export default function EmissaoDeNfse() {
  const { locale } = useLocale();
  const data = getModuleData('emissao-de-nfse', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
