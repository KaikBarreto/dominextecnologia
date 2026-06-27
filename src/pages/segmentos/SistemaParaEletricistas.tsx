import SegmentLandingPage from './SegmentLandingPage';
import { SEGMENTS } from './segmentsData';

/**
 * Landing de SEO do segmento Instalações Elétricas.
 * Rota: /sistema-para-eletricistas. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaEletricistas() {
  return <SegmentLandingPage data={SEGMENTS['sistema-para-eletricistas']} />;
}
