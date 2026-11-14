import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createDomiLinkIdempotencyKey,
  detectDomiLink,
  DomiLinkError,
  loadDomiLinkProfile,
  pairDomiLink,
  queueDomiLinkTestPrint,
  readDomiLinkBarcode,
  readDomiLinkScale,
  revokeDomiLink,
  waitForDomiLinkPrintJob,
} from '@/lib/domilink/client';
import { readDomiLinkEnabled, readDomiLinkSession, writeDomiLinkEnabled, writeDomiLinkSession } from '@/lib/domilink/storage';
import type { DomiLinkDevice, DomiLinkProfile, DomiLinkScaleReading } from '@/lib/domilink/types';

export type DomiLinkStatus = 'disabled' | 'checking' | 'offline' | 'pairing' | 'connected' | 'error';

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a ação no DomiLink.';
}

export function useDomiLink() {
  const [enabled, setEnabledState] = useState(readDomiLinkEnabled);
  const [status, setStatus] = useState<DomiLinkStatus>(enabled ? 'checking' : 'disabled');
  const [profile, setProfile] = useState<DomiLinkProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastScaleReading, setLastScaleReading] = useState<DomiLinkScaleReading | null>(null);
  const [lastBarcode, setLastBarcode] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setStatus('checking');
    setError(null);
    try {
      const health = await detectDomiLink();
      const token = readDomiLinkSession();
      if (!token) {
        setProfile(null);
        setStatus('pairing');
        return;
      }
      try {
        const nextProfile = await loadDomiLinkProfile(token, health);
        setProfile(nextProfile);
        setStatus('connected');
      } catch (profileError) {
        if (profileError instanceof DomiLinkError && profileError.status === 401) {
          writeDomiLinkSession(null);
          setProfile(null);
          setStatus('pairing');
          return;
        }
        throw profileError;
      }
    } catch (nextError) {
      setProfile(null);
      setError(messageOf(nextError));
      setStatus(nextError instanceof DomiLinkError && nextError.code === 'offline' ? 'offline' : 'error');
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      setProfile(null);
      setError(null);
      return;
    }
    void connect();
  }, [connect, enabled]);

  const setEnabled = useCallback((next: boolean) => {
    writeDomiLinkEnabled(next);
    setEnabledState(next);
    if (!next) {
      const token = readDomiLinkSession();
      if (token) void revokeDomiLink(token).catch(() => undefined);
      writeDomiLinkSession(null);
      setProfile(null);
      setLastScaleReading(null);
      setLastBarcode(null);
    }
  }, []);

  const pair = useCallback(async (code: string) => {
    setBusyAction('pair');
    setError(null);
    try {
      const result = await pairDomiLink(code);
      writeDomiLinkSession(result.token);
      await connect();
    } catch (nextError) {
      setError(messageOf(nextError));
      setStatus('pairing');
      throw nextError;
    } finally {
      setBusyAction(null);
    }
  }, [connect]);

  const disconnect = useCallback(async () => {
    const token = readDomiLinkSession();
    setBusyAction('disconnect');
    try {
      if (token) await revokeDomiLink(token);
    } catch {
      // A sessão local será descartada mesmo se o utilitário já estiver offline.
    } finally {
      writeDomiLinkSession(null);
      setProfile(null);
      setStatus(enabled ? 'pairing' : 'disabled');
      setBusyAction(null);
    }
  }, [enabled]);

  const testPrint = useCallback(async (device: DomiLinkDevice) => {
    const token = readDomiLinkSession();
    if (!token) throw new Error('Faça o pareamento antes de testar a impressora.');
    setBusyAction(`print:${device.id}`);
    try {
      const queued = await queueDomiLinkTestPrint(token, device, createDomiLinkIdempotencyKey());
      return await waitForDomiLinkPrintJob(token, queued.job);
    } finally { setBusyAction(null); }
  }, []);

  const readScale = useCallback(async (deviceId: string) => {
    const token = readDomiLinkSession();
    if (!token) throw new Error('Faça o pareamento antes de ler a balança.');
    setBusyAction(`scale:${deviceId}`);
    try {
      const reading = await readDomiLinkScale(token, deviceId);
      setLastScaleReading(reading);
      return reading;
    } finally { setBusyAction(null); }
  }, []);

  const readBarcode = useCallback(async (deviceId: string) => {
    const token = readDomiLinkSession();
    if (!token) throw new Error('Faça o pareamento antes de ler o código.');
    setBusyAction(`barcode:${deviceId}`);
    try {
      const code = await readDomiLinkBarcode(token, deviceId);
      setLastBarcode(code);
      return code;
    } finally { setBusyAction(null); }
  }, []);

  const devices = useMemo(() => ({
    printers: profile?.devices.filter((device) => device.kind === 'printer') ?? [],
    scales: profile?.devices.filter((device) => device.kind === 'scale') ?? [],
    barcodes: profile?.devices.filter((device) => device.kind === 'barcode') ?? [],
  }), [profile]);

  return {
    enabled, setEnabled, status, profile, devices, error, busyAction,
    lastScaleReading, lastBarcode, retry: connect, pair, disconnect, testPrint, readScale, readBarcode,
  };
}
