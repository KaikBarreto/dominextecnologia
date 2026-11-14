import { useCallback, useState, type FormEvent } from 'react';
import { Loader2, ScanBarcode, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import {
  InventoryIdentifierError,
  type ResolvedInventoryIdentifier,
  useInventoryIdentifiers,
} from '@/hooks/useInventoryIdentifiers';

interface InventoryIdentifierInputProps {
  onResolved: (result: ResolvedInventoryIdentifier) => void;
  enabled?: boolean;
  autoFocus?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
}

export function InventoryIdentifierInput({
  onResolved,
  enabled = true,
  autoFocus = false,
  label = 'Código do material',
  placeholder = 'Digite ou use o leitor',
  className,
}: InventoryIdentifierInputProps) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { resolve } = useInventoryIdentifiers();

  const find = useCallback(async (value: string) => {
    const normalized = value.trim();
    if (!normalized || !enabled || resolve.isPending) return;
    setMessage(null);
    try {
      const result = await resolve.mutateAsync({ code: normalized });
      if (!result) {
        setMessage('Nenhum material foi encontrado com esse código.');
        return;
      }
      setCode('');
      onResolved(result);
    } catch (error) {
      setMessage(error instanceof InventoryIdentifierError
        ? error.message
        : 'Não foi possível localizar o material. Tente novamente.');
    }
  }, [enabled, onResolved, resolve]);

  useBarcodeScanner({
    enabled,
    onScan: (scannedCode) => {
      setCode(scannedCode);
      void find(scannedCode);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    void find(code);
  }

  return (
    <div className={className}>
      <form onSubmit={submit} className="space-y-2">
        <Label htmlFor="inventory-identifier-code">{label}</Label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="inventory-identifier-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={placeholder}
              autoFocus={autoFocus}
              autoComplete="off"
              inputMode="text"
              disabled={!enabled || resolve.isPending}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="outline" disabled={!enabled || !code.trim() || resolve.isPending}>
            {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="sr-only">Localizar material</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Leitor USB funciona automaticamente. Você também pode digitar o código.</p>
      </form>
      {message && <NoticeBanner variant="warning" className="mt-3">{message}</NoticeBanner>}
    </div>
  );
}
