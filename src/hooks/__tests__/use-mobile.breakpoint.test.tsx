import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useIsMobile } from '@/hooks/use-mobile';

describe('useIsMobile shell breakpoint', () => {
  it.each([
    [1000, true],
    [1024, false],
    [1093, false],
    [1280, false],
    [1366, false],
  ])('classifica %ipx como mobile=%s', async (width, expected) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

    const { result, unmount } = renderHook(() => useIsMobile());
    await waitFor(() => expect(result.current).toBe(expected));
    unmount();
  });
});
