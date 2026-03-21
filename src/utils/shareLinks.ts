export function buildServiceOrderShareLink(osId: string, _targetUrl?: string) {
  // Use the published domain for a friendly, clean URL
  const appDomain = 'https://dominextecnologia.lovable.app';
  return `${appDomain}/os-tecnico/${osId}?modo=cliente`;
}
