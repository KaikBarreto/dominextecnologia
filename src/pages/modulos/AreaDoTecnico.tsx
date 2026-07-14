import ModuleLandingPage from './ModuleLandingPage';
import { useLocale } from '@/lib/i18n/useLocale';
import { getModuleData } from './content/loader';

/** Landing do módulo Área do Técnico™. Rota: /area-do-tecnico. */
export default function AreaDoTecnico() {
  const { locale } = useLocale();
  const data = getModuleData('area-do-tecnico', locale);
  if (!data) return null;
  return <ModuleLandingPage data={data} />;
}
