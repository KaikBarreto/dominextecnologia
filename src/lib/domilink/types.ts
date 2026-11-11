export type DomiLinkDeviceKind = 'printer' | 'scale' | 'barcode';

export interface DomiLinkHealth {
  name: 'DomiLink';
  status: 'ok';
  version: string;
  bind: 'loopback';
}

export interface DomiLinkCapabilities {
  fiscal: false;
  printing: string[];
  scales: string[];
  barcodes: string[];
  paper_widths_mm: number[];
}

export interface DomiLinkDevice {
  id: string;
  kind: DomiLinkDeviceKind;
  label: string;
  online: boolean;
  capabilities: {
    print_formats?: Array<'pdf' | 'text' | 'escpos'>;
    actions?: string[];
    unit?: 'kg';
  };
}

export interface DomiLinkProfile {
  health: DomiLinkHealth;
  capabilities: DomiLinkCapabilities;
  devices: DomiLinkDevice[];
}

export interface DomiLinkPairResult {
  token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface DomiLinkPrintJob {
  id: string;
  status: 'queued' | 'printing' | 'completed' | 'failed';
  device_id: string;
  error_code?: string | null;
}

export interface DomiLinkScaleReading {
  weight_kg: number;
  unit: 'kg';
  stable: boolean;
  captured_at?: string;
}

export interface DomiLinkErrorPayload {
  error?: { code?: string; message?: string };
}
