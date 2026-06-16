import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Settings,
  Search,
  Shield,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useCustomers } from '@/hooks/useCustomers';
import { useNfse, type NfseEmission } from '@/hooks/useNfse';
import { NfseQuotaBadge } from '@/components/fiscal/NfseQuotaBadge';
import { formatBRL } from '@/utils/currency';
import { FISCAL_SCREEN_PERMISSION } from '@/pages/FiscalSettings';
import {
  NfseStatusBadge,
  NFSE_STATUS_FILTER_OPTIONS,
} from '@/components/fiscal/nfseStatus';
import { NovaNotaModal } from '@/components/fiscal/NovaNotaModal';
import { NfseDetailModal } from '@/components/fiscal/NfseDetailModal';

/** Normaliza string pra busca (ignora acento/caixa). */
const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function NotasFiscais() {
  const navigate = useNavigate();
  const { hasScreenAccess } = useAuth();
  const { hasModule, isLoading: modulesLoading } = useCompanyModules();
  const { companyId } = useUserCompany();
  const { emissions, isLoading } = useNfse();
  const { customers } = useCustomers();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [novaOpen, setNovaOpen] = useState(false);
  const [selected, setSelected] = useState<NfseEmission | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const customerName = useMemo(() => {
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return (id: string | null) => (id ? map.get(id) ?? 'Cliente' : 'Cliente');
  }, [customers]);

  // Busca UNIVERSAL: quando há texto, procura no dataset completo e ignora o
  // filtro de status. Filtro de status só vale com a busca vazia.
  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return emissions.filter((e) => {
      if (q) {
        const haystack = normalize(
          [
            e.numero_nfse ?? '',
            e.descricao_servico ?? '',
            e.chave_acesso ?? '',
            e.protocolo ?? '',
            customerName(e.customer_id),
          ].join(' '),
        );
        return haystack.includes(q);
      }
      // Sem busca: aplica filtro de status (vazio = tudo).
      return statusFilter.length === 0 || statusFilter.includes(e.status);
    });
  }, [emissions, search, statusFilter, customerName]);

  // ---- Gate duplo (módulo `nfe` + permissão de tela) ----
  if (!modulesLoading && (!hasModule('nfe') || !hasScreenAccess(FISCAL_SCREEN_PERMISSION))) {
    return (
      <div className="container max-w-3xl py-4">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Você não tem acesso ao módulo de Notas Fiscais. Fale com o administrador da sua empresa.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const openDetail = (e: NfseEmission) => {
    setSelected(e);
    setDetailOpen(true);
  };

  const filterButton = (
    <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 shrink-0">
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {statusFilter.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
              {statusFilter.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FilterCheckboxGroup
            label="Status"
            options={NFSE_STATUS_FILTER_OPTIONS}
            selected={statusFilter}
            onChange={setStatusFilter}
            emptyLabel="Todos"
          />
        </div>
        <div className="sticky bottom-0 border-t bg-background px-5 py-3 flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setStatusFilter([])}
            disabled={statusFilter.length === 0}
          >
            Limpar
          </Button>
          <Button className="flex-1" onClick={() => setFilterOpen(false)}>
            Aplicar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="container max-w-4xl py-4 space-y-5">
      <PageHeader
        title="Notas Fiscais"
        subtitle="Emita e acompanhe suas NFS-e."
        icon={FileText}
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Configurações fiscais"
              onClick={() => navigate('/notas-fiscais/configuracoes')}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button onClick={() => setNovaOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Nota
            </Button>
          </>
        }
      />

      {/* Medidor de consumo mensal de NFS-e */}
      <NfseQuotaBadge companyId={companyId} />

      {/* Busca universal + filtro */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, cliente, descrição, chave..."
            className="pl-9"
          />
        </div>
        {filterButton}
      </div>

      {search.trim() && statusFilter.length > 0 && (
        <p className="text-[11px] text-muted-foreground italic">
          Buscando em todas as notas — o filtro de status fica suspenso enquanto há busca.
        </p>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>
            {emissions.length === 0
              ? 'Nenhuma nota fiscal emitida ainda. Clique em "Nova Nota" para começar.'
              : 'Nenhuma nota encontrada com esses filtros.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border/60">
          {filtered.map((e) => (
            <MobileListItem
              key={e.id}
              onClick={() => openDetail(e)}
              leading={<FileText className="h-5 w-5 text-muted-foreground" />}
              title={
                <span className="flex items-center gap-2">
                  {e.numero_nfse ? `Nota nº ${e.numero_nfse}` : customerName(e.customer_id)}
                </span>
              }
              subtitle={
                <span>
                  {customerName(e.customer_id)} · {formatDate(e.created_at)}
                  {e.valor_servico != null ? ` · ${formatBRL(e.valor_servico)}` : ''}
                </span>
              }
              trailing={<NfseStatusBadge status={e.status} />}
            />
          ))}
        </div>
      )}

      <NovaNotaModal open={novaOpen} onOpenChange={setNovaOpen} />
      <NfseDetailModal emission={selected} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
