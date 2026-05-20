// AES-GCM via Web Crypto API. Chave derivada de constante do app (NÃO é
// criptografia forte contra atacante físico, mas evita acesso casual via
// DevTools/JS console). Tradeoff documentado no plano
// docs/planos/2026-05-20-account-switcher-ui-ecosistema.md.
//
// Copia 1:1 do EcoSistema (src/lib/sessionCrypto.ts), só com seed/salt do
// Dominex pra evitar colisão se o user usar os dois apps no mesmo browser.

const ENCRYPTION_KEY_SEED = "dominex-account-switcher-v1"; // qualquer string fixa
const STORAGE_KEY = "__saved_sessions_v1";

async function deriveKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(ENCRYPTION_KEY_SEED),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("dominex-salt"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptJson<T>(data: T): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  // Concat iv + ciphertext, base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptJson<T>(b64: string): Promise<T | null> {
  try {
    const key = await deriveKey();
    const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    console.warn("[sessionCrypto] Failed to decrypt:", e);
    return null;
  }
}

export const SAVED_SESSIONS_STORAGE_KEY = STORAGE_KEY;
