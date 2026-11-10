function asBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

export async function sha256Hex(input: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : asBytes(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'rowNumber')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

/**
 * Hash independente da ordem da planilha, mas sensível à quantidade de linhas
 * duplicadas. Isso evita que apenas reordenar o mesmo lote burle idempotência.
 */
export async function canonicalRowsHash(entity: string, rows: unknown[]): Promise<string> {
  const canonicalRows = rows
    .map((row) => JSON.stringify(stableValue(row)))
    .sort();
  return sha256Hex(JSON.stringify({ entity, rows: canonicalRows }));
}
