import type { PdvReceiptFormat } from './model';

const KEY = 'pdv.receipt.device-format.v1';

export function readDeviceReceiptFormat(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): PdvReceiptFormat | null {
  try {
    const value = storage?.getItem(KEY);
    return value === 'a4' || value === '58mm' || value === '80mm' ? value : null;
  } catch {
    return null;
  }
}

export function writeDeviceReceiptFormat(
  value: PdvReceiptFormat | null,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): boolean {
  if (!storage) return false;
  try {
    if (value == null) storage.removeItem(KEY);
    else storage.setItem(KEY, value);
    return true;
  } catch {
    return false;
  }
}
