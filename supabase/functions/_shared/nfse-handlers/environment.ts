// Ambiente fiscal canonico da NFS-e.
//
// Configuracao da empresa e mutavel; documento fiscal nao. Toda operacao sobre
// uma nota existente deve sobrescrever o contexto com o ambiente persistido na
// propria emissao. Legado sem evidencia falha fechado.

export type NfseFiscalEnvironment = "homologacao" | "producao";

export function normalizeFiscalEnvironment(
  value: unknown,
): NfseFiscalEnvironment | null {
  return value === "homologacao" || value === "producao" ? value : null;
}

export function scopeNfseIdempotencyKey(
  rawKey: string,
  environment: NfseFiscalEnvironment,
): string {
  const prefix = `${environment}:`;
  const baseKey = rawKey.startsWith(prefix)
    ? rawKey.slice(prefix.length)
    : rawKey;
  const scoped = `${prefix}${baseKey}`;
  if (scoped.length <= 512) return scoped;

  // FNV-1a de 32 bits: nao e segredo nem assinatura, apenas preserva entropia
  // quando uma chave externa excede o limite da coluna.
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(baseKey);
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  const suffix = (hash >>> 0).toString(16).padStart(8, "0");
  return `${prefix}${baseKey.slice(0, 490)}:${suffix}`.slice(0, 512);
}

export function fiscalContextForEmission(
  fiscal: Record<string, unknown>,
  emission: Record<string, unknown>,
): Record<string, unknown> | null {
  const environment = normalizeFiscalEnvironment(emission.fiscal_ambiente);
  return environment ? { ...fiscal, fiscal_ambiente: environment } : null;
}
