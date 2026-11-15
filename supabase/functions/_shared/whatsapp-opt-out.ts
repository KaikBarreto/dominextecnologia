const WHATSAPP_OPT_OUT_COMMANDS = new Set([
  "parar",
  "pare",
  "sair",
  "stop",
  "descadastrar",
  "nao quero receber mensagens",
  "nao quero mais receber mensagens",
  "cancelar mensagens",
  "cancelar notificacoes",
]);

/** Detecta somente comandos inequívocos de saída, sem confundir cancelamentos operacionais. */
export function isWhatsAppOptOutText(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[.!?,;:]+$/g, "")
    .trim();

  return WHATSAPP_OPT_OUT_COMMANDS.has(normalized);
}
