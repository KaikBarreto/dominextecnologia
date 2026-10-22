import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeePhotoAvatar } from './EmployeePhotoAvatar';

vi.mock('@/components/ui/SignedAvatarImage', () => ({
  SignedAvatarImage: ({ alt }: { alt?: string }) => <img alt={alt} />,
}));

vi.mock('@/components/ui/ImagePreviewModal', () => ({
  ImagePreviewModal: ({ open, alt }: { open: boolean; alt?: string }) =>
    open ? <div role="dialog" aria-label={`Foto ampliada de ${alt}`} /> : null,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('EmployeePhotoAvatar', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('abre a foto em tela cheia sem disparar o clique da linha', () => {
    const onRowClick = vi.fn();
    act(() => {
      root.render(
        <div onClick={onRowClick}>
          <EmployeePhotoAvatar name="Ana Souza" src="employee-photos/ana.jpg" />
        </div>,
      );
    });

    const button = container.querySelector('button[aria-label="Ampliar foto de Ana Souza"]');
    expect(button).toBeTruthy();
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onRowClick).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      'Foto ampliada de Ana Souza',
    );
  });

  it('mantém apenas o avatar quando não existe foto', () => {
    act(() => root.render(<EmployeePhotoAvatar name="Bruno Lima" />));

    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toContain('BL');
  });
});
