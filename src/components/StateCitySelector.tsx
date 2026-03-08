import { useState, useEffect, useMemo, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StateCitySelectorProps {
  selectedState: string;
  selectedCity: string;
  onStateChange: (state: string) => void;
  onCityChange: (city: string) => void;
  disabled?: boolean;
  showLabels?: boolean;
}

interface IBGECity {
  id: number;
  nome: string;
}

export const BRAZILIAN_STATES = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PR', name: 'Paraná' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'TO', name: 'Tocantins' },
];

const citiesCache: Record<string, { name: string; id: string }[]> = {};

export const StateCitySelector = ({
  selectedState,
  selectedCity,
  onStateChange,
  onCityChange,
  disabled,
  showLabels = false,
}: StateCitySelectorProps) => {
  const [cities, setCities] = useState<{ name: string; id: string }[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [stateOpen, setStateOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const citySearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchCities = async () => {
      if (!selectedState) { setCities([]); return; }
      if (citiesCache[selectedState]) { setCities(citiesCache[selectedState]); return; }
      setLoadingCities(true);
      try {
        const response = await fetch(
          `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${selectedState}/municipios?orderBy=nome`
        );
        if (!response.ok) throw new Error('Failed');
        const data: IBGECity[] = await response.json();
        const mapped = data.map((c) => ({ name: c.nome, id: c.id.toString() }));
        citiesCache[selectedState] = mapped;
        setCities(mapped);
      } catch { setCities([]); }
      finally { setLoadingCities(false); }
    };
    fetchCities();
  }, [selectedState]);

  useEffect(() => {
    if (cityOpen && citySearchRef.current) {
      setTimeout(() => citySearchRef.current?.focus(), 50);
    }
  }, [cityOpen]);

  const filteredCities = useMemo(() => {
    if (!citySearch) return cities;
    const q = citySearch.toLowerCase();
    return cities.filter((c) => c.name.toLowerCase().includes(q));
  }, [cities, citySearch]);

  const handleStateChange = (value: string) => {
    onStateChange(value);
    onCityChange('');
    setCitySearch('');
    setStateOpen(false);
  };

  return (
    <div className="flex gap-2">
      {/* UF - compact popover */}
      <div className="w-[80px] shrink-0 space-y-2">
        {showLabels && <Label>UF</Label>}
        <Popover open={stateOpen} onOpenChange={setStateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              disabled={disabled}
              className="w-full justify-between font-normal h-10 px-3"
            >
              {selectedState || 'UF'}
              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[120px] p-0 max-h-[300px] overflow-auto" align="start">
            {BRAZILIAN_STATES.map((s) => (
              <button
                key={s.code}
                type="button"
                className={cn(
                  'flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent transition-colors',
                  selectedState === s.code && 'bg-accent font-medium'
                )}
                onClick={() => handleStateChange(s.code)}
              >
                {selectedState === s.code && <Check className="mr-1 h-3 w-3" />}
                {s.code}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* City - searchable popover */}
      <div className="flex-1 min-w-0 space-y-2">
        {showLabels && <Label>Cidade</Label>}
        <Popover open={cityOpen} onOpenChange={(o) => { setCityOpen(o); if (!o) setCitySearch(''); }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              disabled={disabled || !selectedState || loadingCities}
              className="w-full justify-between font-normal h-10 px-3 truncate"
            >
              <span className="truncate">
                {loadingCities ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
                  </span>
                ) : selectedCity || (!selectedState ? 'Selecione UF' : 'Selecione a cidade')}
              </span>
              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <div className="p-2 border-b">
              <Input
                ref={citySearchRef}
                placeholder="Buscar cidade..."
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="max-h-[200px] overflow-auto">
              {filteredCities.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={cn(
                    'flex items-center w-full px-3 py-1.5 text-sm hover:bg-accent transition-colors',
                    selectedCity === c.name && 'bg-accent font-medium'
                  )}
                  onClick={() => { onCityChange(c.name); setCityOpen(false); setCitySearch(''); }}
                >
                  {selectedCity === c.name && <Check className="mr-1 h-3 w-3" />}
                  {c.name}
                </button>
              ))}
              {filteredCities.length === 0 && !loadingCities && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Nenhuma cidade encontrada
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
