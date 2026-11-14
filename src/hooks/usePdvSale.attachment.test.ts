import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({ upload: mocks.upload, remove: mocks.remove }),
    },
    from: () => ({ upsert: mocks.upsert }),
  },
}));
vi.mock('@/utils/tenantStorage', () => ({
  currentCompanyId: vi.fn(async () => 'company-1'),
  tenantFileOptions: vi.fn(async (options) => options),
}));

import { uploadPdvOrderAttachment } from '@/hooks/usePdvSale';

describe('uploadPdvOrderAttachment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
  });

  it('reutiliza path e conflito lógico após resposta ambígua', async () => {
    mocks.upsert
      .mockResolvedValueOnce({ error: { message: 'resposta perdida' } })
      .mockResolvedValueOnce({ error: null });
    const input = {
      orderId: 'order-1',
      file: new File(['foto'], 'Retirada 1.jpg', { type: 'image/jpeg' }),
      clientAttachmentId: 'attachment-1',
    };

    await expect(uploadPdvOrderAttachment(input)).rejects.toEqual({ message: 'resposta perdida' });
    await expect(uploadPdvOrderAttachment(input)).resolves.toEqual({
      storagePath: 'company-1/pdv-orders/order-1/attachment-1_Retirada_1.jpg',
    });

    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls[0][0]).toBe(mocks.upload.mock.calls[1][0]);
    expect(mocks.upload.mock.calls[0][2]).toMatchObject({ upsert: true });
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0][0]).toEqual(mocks.upsert.mock.calls[1][0]);
    expect(mocks.upsert.mock.calls[1][1]).toEqual({
      onConflict: 'order_id,storage_path',
      ignoreDuplicates: true,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
