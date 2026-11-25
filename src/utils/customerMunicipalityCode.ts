export interface CepMunicipalityResult {
  cidade?: string;
  estado?: string;
  ibge?: string;
  error?: string;
}

interface CustomerMunicipalityInput {
  zipCode?: string;
  city?: string;
  state?: string;
  municipalityCode?: string;
}

type CepMunicipalityLookup = (cep: string) => Promise<CepMunicipalityResult>;

const IBGE_MUNICIPALITY_CODE = /^\d{7}$/;

function normalizeCity(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

export function isValidIbgeMunicipalityCode(value: string | undefined): boolean {
  return IBGE_MUNICIPALITY_CODE.test((value ?? '').replace(/\D/g, ''));
}

/**
 * Garante o código do município para cadastros com CEP válido.
 *
 * Códigos já válidos são preservados para não tornar todo salvamento dependente
 * do ViaCEP. Quando o código está ausente, a consulta também valida cidade/UF
 * para impedir que um CEP incompatível grave o município errado.
 */
export async function resolveCustomerMunicipalityCode(
  input: CustomerMunicipalityInput,
  lookup: CepMunicipalityLookup,
): Promise<string> {
  const currentCode = (input.municipalityCode ?? '').replace(/\D/g, '');
  if (IBGE_MUNICIPALITY_CODE.test(currentCode)) return currentCode;

  const cep = (input.zipCode ?? '').replace(/\D/g, '');
  if (cep.length !== 8) return '';

  let result: CepMunicipalityResult;
  try {
    result = await lookup(cep);
  } catch {
    throw new Error('Não foi possível identificar o município pelo CEP. Tente novamente ou use a lupa ao lado do CEP.');
  }

  const resolvedCode = (result.ibge ?? '').replace(/\D/g, '');
  if (result.error || !IBGE_MUNICIPALITY_CODE.test(resolvedCode)) {
    throw new Error('Não foi possível identificar o município pelo CEP. Confira o CEP informado e tente novamente.');
  }

  const cityMismatch = input.city
    && result.cidade
    && normalizeCity(input.city) !== normalizeCity(result.cidade);
  const stateMismatch = input.state
    && result.estado
    && input.state.trim().toUpperCase() !== result.estado.trim().toUpperCase();

  if (cityMismatch || stateMismatch) {
    const resolvedLocation = [result.cidade, result.estado].filter(Boolean).join('/');
    throw new Error(`O CEP informado corresponde a ${resolvedLocation}, mas o município/UF do cadastro é diferente. Corrija o endereço fiscal antes de salvar.`);
  }

  return resolvedCode;
}
