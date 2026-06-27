import SegmentLandingPage from './SegmentLandingPage';
import { SEGMENTS } from './segmentsData';

/**
 * Landing de SEO do segmento Energia Solar.
 * Rota: /sistema-para-energia-solar. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaEnergiaSolar() {
  return <SegmentLandingPage data={SEGMENTS['sistema-para-energia-solar']} />;
}
