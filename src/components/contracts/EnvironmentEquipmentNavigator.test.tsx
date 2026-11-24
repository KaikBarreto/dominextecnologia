import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EnvironmentEquipmentNavigator } from './EnvironmentEquipmentNavigator';

const labels = {
  ariaLabel: 'Navegar por ambientes e equipamentos',
  title: 'Ambientes e equipamentos',
  overview: 'Visão geral',
};

describe('EnvironmentEquipmentNavigator', () => {
  it('navega do ambiente ao equipamento também na faixa compacta', () => {
    const onSelectEquipment = vi.fn();

    function Harness() {
      const [selectedEnvironmentKey, setSelectedEnvironmentKey] = useState<string | null>(null);
      return (
        <EnvironmentEquipmentNavigator
          environments={[
            { key: 'sala', label: 'Sala técnica', equipmentIds: ['eq-1', 'eq-2'] },
          ]}
          selectedEnvironmentKey={selectedEnvironmentKey}
          getEquipmentLabel={(id) => id === 'eq-1' ? 'Split recepção' : 'Split diretoria'}
          onSelectOverview={() => setSelectedEnvironmentKey(null)}
          onSelectEnvironment={setSelectedEnvironmentKey}
          onSelectEquipment={(environmentKey, equipmentId) => {
            setSelectedEnvironmentKey(environmentKey);
            onSelectEquipment(environmentKey, equipmentId);
          }}
          labels={labels}
        />
      );
    }

    render(<Harness />);

    expect(screen.getAllByRole('button', { name: 'Visão geral' })[0]).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getAllByRole('button', { name: /Sala técnica/ })[0]);

    const equipmentButtons = screen.getAllByRole('button', { name: 'Split diretoria' });
    expect(equipmentButtons).toHaveLength(2);
    fireEvent.click(equipmentButtons[0]);

    expect(onSelectEquipment).toHaveBeenCalledWith('sala', 'eq-2');
    expect(screen.getAllByRole('button', { name: 'Split diretoria' })[0]).toHaveAttribute('aria-current', 'page');
  });

  it('inclui o grupo sem ambiente na mesma navegação contextual', () => {
    const onSelectEnvironment = vi.fn();
    render(
      <EnvironmentEquipmentNavigator
        environments={[]}
        looseGroup={{ key: 'loose', label: 'Sem ambiente', equipmentIds: ['eq-1'] }}
        selectedEnvironmentKey={null}
        getEquipmentLabel={() => 'Condensadora'}
        onSelectOverview={vi.fn()}
        onSelectEnvironment={onSelectEnvironment}
        onSelectEquipment={vi.fn()}
        labels={labels}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Sem ambiente/ })[0]);
    expect(onSelectEnvironment).toHaveBeenCalledWith('loose');
  });
});
