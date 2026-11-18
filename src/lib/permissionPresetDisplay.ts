export interface PermissionPresetDisplay {
  name: string;
  description: string | null;
}

const SEGMENT_SPECIFIC_TERMS = /refrigera|climatiza/i;

/**
 * Os cargos continuam com o nome cadastrado na gestão, mas os atalhos de
 * "Perfis rápidos" precisam ser sugestões neutras para qualquer segmento.
 */
export function getAgnosticPermissionPresetDisplay(
  name: string,
  description: string | null,
): PermissionPresetDisplay {
  const segmentSpecific = SEGMENT_SPECIFIC_TERMS.test(name)
    || (description ? SEGMENT_SPECIFIC_TERMS.test(description) : false);

  if (!segmentSpecific) return { name, description };

  const normalizedName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const genericName = normalizedName.includes('auxiliar')
    ? 'Auxiliar operacional'
    : normalizedName.includes('meio oficial')
      ? 'Profissional de campo'
      : normalizedName.includes('tecnico')
        ? 'Técnico em campo'
        : 'Equipe operacional';

  return {
    name: genericName,
    description: 'Perfil de permissões para atividades operacionais e de campo.',
  };
}
