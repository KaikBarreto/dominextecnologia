import type { Customer } from '@/types/database';

const contactFields = ['document', 'phone', 'celular', 'email', 'address', 'address_number', 'neighborhood', 'city', 'state', 'company_name', 'nome_fantasia'] as const;
export type PdvCatalogCustomer = Pick<Customer, 'id' | 'name' | typeof contactFields[number]> & { customer_type?: Customer['customer_type'] };

/** Identificação necessária à escolha do cliente; nunca carrega crédito ou cadastro completo. */
export function projectPdvCatalogCustomer(value: unknown): PdvCatalogCustomer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id || typeof row.name !== 'string' || !row.name) return null;
  const customer: PdvCatalogCustomer = { id: row.id, name: row.name };
  for (const field of contactFields) {
    if (typeof row[field] === 'string') customer[field] = row[field];
  }
  if (row.customer_type === 'pf' || row.customer_type === 'pj') customer.customer_type = row.customer_type;
  return customer;
}

/** Adapta a identificação ao contrato visual existente sem adicionar dados de cadastro. */
export function toPdvCustomerRecord(customer: PdvCatalogCustomer): Customer {
  return { ...customer, customer_type: customer.customer_type ?? 'pf', created_at: '', updated_at: '' };
}
