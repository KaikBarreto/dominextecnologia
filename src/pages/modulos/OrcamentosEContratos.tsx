import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo Orçamentos & Contratos. Rota: /orcamentos-e-contratos. */
export default function OrcamentosEContratos() {
  const { locale } = useLocale();
  const data = getModuleData('orcamentos-e-contratos', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
