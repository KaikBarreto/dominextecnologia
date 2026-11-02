import { useCallback, useEffect, useState } from 'react';
import {
  getFiscalBridgeStatus,
  type FiscalBridgeStatus,
} from '@/services/fiscalPrintBridge';

export type FiscalPrintMode = 'system' | 'bridge';

export interface FiscalPrinterSettings {
  mode: FiscalPrintMode;
  printerName: string;
  autoPrintAuthorizedNfce: boolean;
  paperWidthMm: 80;
}

const STORAGE_KEY = 'dominex:fiscal-printer:v1';
const DEFAULT_SETTINGS: FiscalPrinterSettings = {
  mode: 'system',
  printerName: '',
  autoPrintAuthorizedNfce: false,
  paperWidthMm: 80,
};

function loadSettings(): FiscalPrinterSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as Partial<FiscalPrinterSettings>;
    return {
      mode: raw.mode === 'bridge' ? 'bridge' : 'system',
      printerName: typeof raw.printerName === 'string' ? raw.printerName : '',
      autoPrintAuthorizedNfce: raw.autoPrintAuthorizedNfce === true,
      paperWidthMm: 80,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useFiscalPrinterSettings() {
  const [settings, setSettings] = useState<FiscalPrinterSettings>(loadSettings);
  const [bridge, setBridge] = useState<FiscalBridgeStatus>({
    connected: false,
    version: null,
    printers: [],
    error: null,
  });
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Dispositivo sem armazenamento local: a configuração vale só na sessão.
    }
  }, [settings]);

  const update = useCallback((patch: Partial<FiscalPrinterSettings>) => {
    setSettings((current) => ({ ...current, ...patch, paperWidthMm: 80 }));
  }, []);

  const checkBridge = useCallback(async () => {
    setChecking(true);
    const status = await getFiscalBridgeStatus();
    setBridge(status);
    setSettings((current) => {
      if (!current.printerName || status.printers.some((printer) => printer.name === current.printerName)) {
        return current;
      }
      return { ...current, printerName: '' };
    });
    setChecking(false);
    return status;
  }, []);

  return { settings, update, bridge, checking, checkBridge };
}
