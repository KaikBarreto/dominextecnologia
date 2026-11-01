import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  OVERLAY_PRIORITY,
  OverlayCoordinatorProvider,
  useOverlaySlot,
} from './OverlayCoordinatorContext';

function OverlayProbe({
  id,
  open,
  priority,
}: {
  id: string;
  open: boolean;
  priority: number;
}) {
  const active = useOverlaySlot(open, { id, priority });

  return (
    <output data-testid={id} data-open={open} data-active={active} />
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
});
