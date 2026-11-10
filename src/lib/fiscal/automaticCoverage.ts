import type { FiscalAmbiente } from '@/hooks/useFiscalSettings';

interface AutomaticCoverageInput {
  certificateReady: boolean;
  certificateRef: string | null;
  certificateExpiresAt: string | null;
  municipalityAlreadyEnabled: boolean;
  currentIbge: string;
  persistedIbge: string;
  currentEnvironment: FiscalAmbiente;
  persistedEnvironment: FiscalAmbiente;
}

/**
 * Identifica uma checagem automática segura de cobertura municipal.
 *
 * A consulta só pode partir de dados já persistidos. Assim, editar município
 * ou ambiente no formulário nunca dispara uma chamada antes de o usuário
 * salvar. A chave também limita a tela a uma tentativa por combinação de A1,
 * município e ambiente; em caso de indisponibilidade, o botão continua sendo
 * o retry explícito.
 */
export function automaticCoverageCheckKey({
  certificateReady,
  certificateRef,
  certificateExpiresAt,
  municipalityAlreadyEnabled,
  currentIbge,
  persistedIbge,
  currentEnvironment,
  persistedEnvironment,
}: AutomaticCoverageInput): string | null {
  const currentMunicipality = currentIbge.trim();
  const persistedMunicipality = persistedIbge.trim();

  if (
    !certificateReady ||
    !certificateRef ||
    municipalityAlreadyEnabled ||
    !/^\d{7}$/.test(persistedMunicipality) ||
    currentMunicipality !== persistedMunicipality ||
    currentEnvironment !== persistedEnvironment
  ) {
    return null;
  }

  return [
    persistedEnvironment,
    persistedMunicipality,
    certificateRef,
    certificateExpiresAt ?? '',
  ].join(':');
}
