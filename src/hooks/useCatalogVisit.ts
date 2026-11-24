import { useEffect } from 'react';
import { useCatalogActivity } from './useCatalogActivity';

/** Registra a ficha exibida, inclusive previews e consultas diretas por URL. */
export function useCatalogVisit(modelId: string) {
  const { recordView } = useCatalogActivity();
  useEffect(() => { recordView(modelId); }, [modelId, recordView]);
}
