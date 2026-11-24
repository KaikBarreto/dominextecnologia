/** Retorna true nos dispositivos Apple móveis que devem usar a câmera nativa. */
export function shouldUseNativeVideoCapture(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  platform = typeof navigator !== 'undefined' ? navigator.platform : '',
  maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
): boolean {
  const classicIOS = /iPad|iPhone|iPod/i.test(userAgent);
  const ipadDesktopMode = platform === 'MacIntel' && maxTouchPoints > 1;
  return classicIOS || ipadDesktopMode;
}
