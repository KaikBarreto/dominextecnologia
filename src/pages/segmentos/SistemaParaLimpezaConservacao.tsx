import SegmentLandingPage from './SegmentLandingPage';
import { SEGMENTS } from './segmentsData';

/**
 * Landing de SEO do segmento Limpeza e Conservação.
 * Rota: /sistema-para-limpeza-conservacao. Conteúdo vem de segmentsData (data-driven).
 */
export default function SistemaParaLimpezaConservacao() {
  return <SegmentLandingPage data={SEGMENTS['sistema-para-limpeza-conservacao']} />;
}
