import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';

interface AddressResult {
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  display: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelected: (address: AddressResult) => void;
  placeholder?: string;
  disabled?: boolean;
}

interface NominatimResult {
  display_name: string;
  address: {
    road?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country_code?: string;
  };
}

// Map full state names to UF codes
const STATE_MAP: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM',
  'bahia': 'BA', 'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES',
  'goiás': 'GO', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', 'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR',
  'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondônia': 'RO',
  'roraima': 'RR', 'santa catarina': 'SC', 'são paulo': 'SP', 'sergipe': 'SE',
  'tocantins': 'TO',
};

function stateToUF(state: string): string {
  if (!state) return '';
  if (state.length === 2) return state.toUpperCase();
  return STATE_MAP[state.toLowerCase()] || state;
}

export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelected,
  placeholder = 'Digite o endereço...',
  disabled,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchAddress = async (query: string) => {
    if (query.length < 4) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=br&limit=5&q=${encodeURIComponent(query)}`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      );
      const data: NominatimResult[] = await res.json();
      const results: AddressResult[] = data
        .filter((r) => r.address?.country_code === 'br')
        .map((r) => ({
          logradouro: r.address.road || '',
          numero: r.address.house_number || '',
          bairro: r.address.suburb || r.address.neighbourhood || '',
          cidade: r.address.city || r.address.town || r.address.village || '',
          estado: stateToUF(r.address.state || ''),
          cep: (r.address.postcode || '').replace('-', '').slice(0, 8),
          display: r.display_name,
        }));
      setSuggestions(results);
      setShowDropdown(results.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddress(val), 500);
  };

  const handleSelect = (addr: AddressResult) => {
    onAddressSelected(addr);
    onChange(addr.logradouro || addr.display);
    setShowDropdown(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-8"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
        </div>
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-[200px] overflow-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-b-0"
              onClick={() => handleSelect(s)}
            >
              <span className="line-clamp-2">{s.display}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
