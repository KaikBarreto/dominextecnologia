import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  OVERLAY_PRIORITY,
  OverlayCoordinatorProvider,
  OverlayNestingProvider,
  useOverlaySlot,
} from './OverlayCoordinatorContext';

function OverlayProbe({
  id,
  open,
  priority,
  children,
}: {
  id: string;
  open: boolean;
  priority: number;
  children?: React.ReactNode;
}) {
  const active = useOverlaySlot(open, { id, priority });

  return (
    <OverlayNestingProvider id={id}>
      <output data-testid={id} data-open={open} data-active={active} />
      {children}
    </OverlayNestingProvider>
  );
}

function TestTree({ criticalOpen }: { criticalOpen: boolean }) {
  return (
    <OverlayCoordinatorProvider>
      <OverlayProbe
        id="lembrete"
        open
        priority={OVERLAY_PRIORITY.reminder}
      />
      <OverlayProbe
        id="bloqueio-critico"
        open={criticalOpen}
        priority={OVERLAY_PRIORITY.critical}
      />
    </OverlayCoordinatorProvider>
  );
}

describe('OverlayCoordinatorProvider', () => {
  it('troca a prioridade e restaura o overlay suspenso sem desmontá-lo', () => {
    const { rerender } = render(<TestTree criticalOpen />);

    expect(screen.getByTestId('bloqueio-critico')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('lembrete')).toHaveAttribute('data-active', 'false');

    rerender(<TestTree criticalOpen={false} />);

    expect(screen.getByTestId('lembrete')).toHaveAttribute('data-active', 'true');
  });

  it('mantém pai e filho ativos como uma pilha e suspende overlays concorrentes', () => {
    const { rerender } = render(
      <OverlayCoordinatorProvider>
        <OverlayProbe id="lembrete" open priority={OVERLAY_PRIORITY.reminder} />
        <OverlayProbe id="orcamento" open priority={OVERLAY_PRIORITY.userAction}>
          <OverlayProbe id="adicionar-materiais" open priority={OVERLAY_PRIORITY.userAction} />
        </OverlayProbe>
      </OverlayCoordinatorProvider>,
    );

    expect(screen.getByTestId('orcamento')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('adicionar-materiais')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('lembrete')).toHaveAttribute('data-active', 'false');

    rerender(
      <OverlayCoordinatorProvider>
        <OverlayProbe id="lembrete" open priority={OVERLAY_PRIORITY.reminder} />
        <OverlayProbe id="orcamento" open priority={OVERLAY_PRIORITY.userAction}>
          <OverlayProbe id="adicionar-materiais" open={false} priority={OVERLAY_PRIORITY.userAction} />
        </OverlayProbe>
      </OverlayCoordinatorProvider>,
    );

    expect(screen.getByTestId('orcamento')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('lembrete')).toHaveAttribute('data-active', 'false');
  });
});
