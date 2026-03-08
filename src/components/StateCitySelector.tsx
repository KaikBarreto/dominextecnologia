import { useState, useEffect, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

interface StateCitySelectorProps {
  selectedState: string;
  selectedCity: string;
  onStateChange: (state: string) => void;
  onCityChange: (city: string) => void;
  disabled?: boolean;
  showLabels?: boolean;
  /** When true, UF takes ~25% width */
  compact?: boolean;
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

// Cache cities per state to avoid repeated API calls
const citiesCache: Record<string, { name: string; id: string }[]> = {};

export const StateCitySelector = ({
  selectedState,
  selectedCity,
  onStateChange,
  onCityChange,
  disabled,
  showLabels = false,
  compact = true,
}: StateCitySelectorProps) => {
  const [cities, setCities] = useState<{ name: string; id: string }[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  useEffect(() => {
    const fetchCities = async () => {
      if (!selectedState) {
        setCities([]);
        return;
      }
      if (citiesCache[selectedState]) {
        setCities(citiesCache[selectedState]);
        return;
      }
      setLoadingCities(true);
      try {
        const response = await fetch(
          `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${selectedState}/municipios?orderBy=nome`
        );
        if (!response.ok) throw new Error('Failed to fetch cities');
        const data: IBGECity[] = await response.json();
        const mapped = data.map((c) => ({ name: c.nome, id: c.id.toString() }));
        citiesCache[selectedState] = mapped;
        setCities(mapped);
      } catch {
        setCities([]);
      } finally {
        setLoadingCities(false);
      }
    };
    fetchCities();
  }, [selectedState]);

  const filteredCities = useMemo(() => {
    if (!citySearch) return cities;
    const q = citySearch.toLowerCase();
    return cities.filter((c) => c.name.toLowerCase().includes(q));
  }, [cities, citySearch]);

  const handleStateChange = (value: string) => {
    onStateChange(value);
    onCityChange('');
    setCitySearch('');
  };

  return (
    <div className={compact ? 'flex gap-2' : 'grid grid-cols-2 gap-3'}>
      <div className={compact ? 'w-[90px] shrink-0 space-y-2' : 'space-y-2'}>
        {showLabels && <Label>UF</Label>}
        <Select
          value={selectedState || undefined}
          onValueChange={handleStateChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {BRAZILIAN_STATES.map((s) => (
              <SelectItem key={s.code} value={s.code}>
                {s.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={compact ? 'flex-1 space-y-2' : 'space-y-2'}>
        {showLabels && <Label>Cidade</Label>}
        <Select
          value={selectedCity || undefined}
          onValueChange={(v) => onCityChange(v)}
          disabled={disabled || !selectedState || loadingCities}
        >
          <SelectTrigger>
            {loadingCities ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-muted-foreground text-xs">Carregando...</span>
              </div>
            ) : (
              <SelectValue
                placeholder={!selectedState ? 'Selecione o UF' : 'Selecione a cidade'}
              />
            )}
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <div className="p-2 sticky top-0 bg-popover">
              <Input
                placeholder="Buscar cidade..."
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                className="h-8"
                autoFocus
              />
            </div>
            {filteredCities.map((c) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
            {filteredCities.length === 0 && !loadingCities && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Nenhuma cidade encontrada
              </div>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
