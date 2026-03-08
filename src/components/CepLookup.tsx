import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AddressData {
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

interface CepLookupProps {
  value: string;
  onChange: (cep: string) => void;
  onAddressFound: (address: AddressData) => void;
}

function cepMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function CepLookup({ value, onChange, onAddressFound }: CepLookupProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const searchCep = async (cep: string) => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cep-lookup', {
        body: { cep: clean },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ variant: 'destructive', title: 'CEP não encontrado' });
        return;
      }
      onAddressFound(data);
      toast({ title: 'Endereço encontrado!' });
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao buscar CEP' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = cepMask(e.target.value);
    onChange(masked);
    const clean = masked.replace(/\D/g, '');
    if (clean.length === 8) searchCep(clean);
  };

  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={handleChange}
        placeholder="00000-000"
        maxLength={9}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => searchCep(value)}
        disabled={loading || value.replace(/\D/g, '').length !== 8}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      </Button>
    </div>
  );
}
