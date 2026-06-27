import SegmentLandingPage from './SegmentLandingPage';
import { SEGMENTS } from './segmentsData';

/**
 * Landing de SEO do segmento Refrigeração e Climatização.
 * Rota: /sistema-para-refrigeracao. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaRefrigeracao() {
  return <SegmentLandingPage data={SEGMENTS['sistema-para-refrigeracao']} />;
}
