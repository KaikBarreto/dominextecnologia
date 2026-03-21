export function buildServiceOrderShareLink(osId: string) {
  // Use the custom domain for a clean, friendly URL
  return `https://dominex.app/os-tecnico/${osId}?modo=cliente`;
}
