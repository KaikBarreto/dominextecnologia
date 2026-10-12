import { describe, expect, it } from 'vitest';
import {
  extractDashboardRatings,
  getDashboardQueryBounds,
  mergeDashboardServiceOrders,
  type DashboardServiceOrder,
} from './useDashboardStats';

const serviceOrder = (
  id: string,
  createdAt: string,
  rating?: DashboardServiceOrder['rating'],
): DashboardServiceOrder => ({
  id,
  created_at: createdAt,
  rating,
} as unknown as DashboardServiceOrder);

describe('getDashboardQueryBounds', () => {
  it('inclui o período anterior de mesmo tamanho e o período atual', () => {
    const bounds = getDashboardQueryBounds({
      from: new Date('2026-10-01T00:00:00'),
      to: new Date('2026-10-31T23:59:59'),
    });

    expect(bounds).toEqual({
      mode: 'bounded',
      dataStart: '2026-08-31',
      dataEnd: '2026-10-31',
    });
  });

  it('usa fetch-all quando o preset não possui limites', () => {
    expect(getDashboardQueryBounds({ from: undefined, to: undefined })).toEqual({
      mode: 'all',
      dataStart: null,
      dataEnd: null,
    });
  });

  it('não envia janela invertida ao banco', () => {
    expect(getDashboardQueryBounds({
      from: new Date('2026-10-31T00:00:00'),
      to: new Date('2026-10-01T00:00:00'),
    }).mode).toBe('all');
  });
});

describe('mergeDashboardServiceOrders', () => {
  it('une janela e abertas, deduplica por ID e mantém criação mais recente primeiro', () => {
    const sharedInWindow = serviceOrder('shared', '2026-10-05T10:00:00Z');
    const sharedOpen = serviceOrder('shared', '2026-10-05T10:00:00Z', {
      service_order_id: 'shared',
      quality_rating: 5,
    });

    const merged = mergeDashboardServiceOrders(
      [sharedInWindow, serviceOrder('window', '2026-10-01T10:00:00Z')],
      [serviceOrder('critical', '2026-10-10T10:00:00Z'), sharedOpen],
    );

    expect(merged.map((row) => row.id)).toEqual(['critical', 'shared', 'window']);
    expect(merged).toHaveLength(3);
    expect(merged.find((row) => row.id === 'shared')?.rating).toEqual(sharedOpen.rating);
  });
});

describe('extractDashboardRatings', () => {
  it('extrai somente avaliações embutidas nas OS relevantes', () => {
    const ratings = extractDashboardRatings([
      serviceOrder('without-rating', '2026-10-01T10:00:00Z'),
      serviceOrder('rated', '2026-10-02T10:00:00Z', {
        service_order_id: 'rated',
        quality_rating: 4,
      }),
    ]);

    expect(ratings).toEqual([{ service_order_id: 'rated', quality_rating: 4 }]);
  });
});
