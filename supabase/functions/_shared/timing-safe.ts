// Comparação de strings em tempo constante (evita timing attack ao validar tokens
// de webhook). Extraído de asaas-webhook/index.ts pra reuso pelo tenant-asaas-webhook
// (regra-lei #6: validação fail-closed de token do webhook).

/** Comparação timing-safe de tokens (constante no tempo, evita timing attack). */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Tamanhos diferentes => compara contra o próprio pra não vazar timing, retorna false.
  if (ab.length !== bb.length) {
    let diff = 1;
    const max = Math.max(ab.length, bb.length);
    for (let i = 0; i < max; i++) {
      diff |= (ab[i % ab.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
    }
    return diff === 0 && false;
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
