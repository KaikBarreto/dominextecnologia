export interface CustomerAddressParts {
  address?: string | null;
  address_number?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

function cleanAddressPart(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Monta o endereço do cliente com todos os campos persistidos no cadastro. */
export function formatCustomerAddress(parts: CustomerAddressParts | null | undefined): string {
  if (!parts) return '';

  const street = cleanAddressPart(parts.address);
  const number = cleanAddressPart(parts.address_number);
  const neighborhood = cleanAddressPart(parts.neighborhood);
  const complement = cleanAddressPart(parts.complement);
  const city = cleanAddressPart(parts.city);
  const state = cleanAddressPart(parts.state);
  const zipCode = cleanAddressPart(parts.zip_code);

  const streetLine = [street, number].filter(Boolean).join(', ');
  const cityState = city && state ? `${city}/${state}` : city || state;

  return [streetLine, neighborhood, complement, cityState, zipCode ? `CEP ${zipCode}` : '']
    .filter(Boolean)
    .join(', ');
}
