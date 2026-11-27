import { act, fireEvent, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setOpen = vi.fn();
const sidebarState = {
  open: false,
  pinnedOpen: false,
  setOpen,
  isMobile: false,
};

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => sidebarState,
  Sidebar: ({ children, ...props }: ComponentProps<'aside'>) => (
    <aside data-testid="sidebar" {...props}>{children}</aside>
  ),
  SidebarContent: ({ children, ...props }: ComponentProps<'div'>) => <div {...props}>{children}</div>,
  SidebarRail: () => null,
}));

vi.mock('../SidebarMenuContent', () => ({ SidebarMenuContent: () => <div>Menu</div> }));

import { Sidebar } from '../Sidebar';

describe('Sidebar hover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOpen.mockClear();
    sidebarState.open = false;
    sidebarState.pinnedOpen = false;
    sidebarState.isMobile = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('abre temporariamente e fecha depois de 500ms', () => {
    const { getByTestId } = render(<Sidebar />);
    const sidebar = getByTestId('sidebar');

    fireEvent.mouseEnter(sidebar);
    expect(setOpen).toHaveBeenCalledWith(true, { transient: true });

    fireEvent.mouseLeave(sidebar);
    act(() => vi.advanceTimersByTime(499));
    expect(setOpen).not.toHaveBeenCalledWith(false, { transient: true });
    act(() => vi.advanceTimersByTime(1));
    expect(setOpen).toHaveBeenLastCalledWith(false, { transient: true });
  });

  it('cancela o fechamento pendente ao reentrar', () => {
    const { getByTestId } = render(<Sidebar />);
    const sidebar = getByTestId('sidebar');

    fireEvent.mouseEnter(sidebar);
    fireEvent.mouseLeave(sidebar);
    act(() => vi.advanceTimersByTime(250));
    fireEvent.mouseEnter(sidebar);
    act(() => vi.advanceTimersByTime(500));

    expect(setOpen).not.toHaveBeenCalledWith(false, { transient: true });
  });

  it('não usa hover quando a preferência está fixada aberta', () => {
    sidebarState.open = true;
    sidebarState.pinnedOpen = true;
    const { getByTestId } = render(<Sidebar />);

    fireEvent.mouseEnter(getByTestId('sidebar'));
    fireEvent.mouseLeave(getByTestId('sidebar'));
    act(() => vi.advanceTimersByTime(500));

    expect(setOpen).not.toHaveBeenCalled();
  });
});
