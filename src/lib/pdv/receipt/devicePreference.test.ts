import { describe, expect, it } from 'vitest';
import { readDeviceReceiptFormat, writeDeviceReceiptFormat } from './devicePreference';

describe('preferência de comprovante do dispositivo', () => {
  it('aceita somente formatos conhecidos e permite limpar', () => {
    const values = new Map<string,string>();
    const storage = { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => { values.set(key,value); }, removeItem: (key:string) => { values.delete(key); } };
    writeDeviceReceiptFormat('58mm', storage);
    expect(readDeviceReceiptFormat(storage)).toBe('58mm');
    writeDeviceReceiptFormat(null, storage);
    expect(readDeviceReceiptFormat(storage)).toBeNull();
    values.set('pdv.receipt.device-format.v1','fiscal');
    expect(readDeviceReceiptFormat(storage)).toBeNull();
  });

  it('não transforma indisponibilidade do localStorage em falha do salvamento remoto', () => {
    const unavailable = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    };

    expect(readDeviceReceiptFormat(unavailable)).toBeNull();
    expect(writeDeviceReceiptFormat('58mm', unavailable)).toBe(false);
    expect(writeDeviceReceiptFormat(null, unavailable)).toBe(false);
  });
});
