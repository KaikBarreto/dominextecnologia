import { describe, expect, it } from 'vitest';

import { shouldUseNativeVideoCapture } from './videoCaptureSupport';

describe('shouldUseNativeVideoCapture', () => {
  it.each([
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)', 'iPhone', 5],
    ['iPad clássico', 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X)', 'iPad', 5],
    ['iPad em modo desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 5],
  ])('usa a câmera nativa no %s', (_name, userAgent, platform, touches) => {
    expect(shouldUseNativeVideoCapture(userAgent, platform, touches)).toBe(true);
  });

  it.each([
    ['Android', 'Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'Linux armv8l', 5],
    ['Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 0],
    ['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0],
  ])('mantém o MediaRecorder no %s', (_name, userAgent, platform, touches) => {
    expect(shouldUseNativeVideoCapture(userAgent, platform, touches)).toBe(false);
  });
});
