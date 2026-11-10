import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ChevronRight,
  Download,
  FileText,
  Files,
  Globe,
  History,
  Palette,
  Pencil,
  RefreshCw,
  Settings2,
  Table2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type PreviewDocumentType = 'certificado' | 'termo' | 'dossie' | 'planilha';

const documents = [
  {
    type: 'certificado' as const,
    icon: Building2,
    title: 'Certificado de Conformidade',
    description: 'Certifica a cobertura PMOC dos ambientes climatizados deste estabelecimento durante a vigência definida. Não representa uma única Ordem de Serviço.',
    version: 4,
    generatedAt: '07/11/2026 às 14:32',
  },
  {
    type: 'termo' as const,
    icon: FileText,
    title: 'Termo de Responsabilidade Técnica',
    description: 'Texto usado no TRT individual e no Dossiê PMOC. Alterações passam a valer somente nas próximas versões.',
    version: 3,
    generatedAt: '07/11/2026 às 14:28',
  },
  {
    type: 'dossie' as const,
    icon: Files,
    title: 'Dossiê PMOC',
    description: 'Documento completo com capa, termo, certificado e cronograma anual.',
    version: 2,
    generatedAt: '07/11/2026 às 14:35',
  },
  {
    type: 'planilha' as const,
    icon: Table2,
    title: 'Planilha PMOC',
    description: 'Equipamentos, periodicidades e mapa de manutenção dos 12 meses.',
    version: 2,
    generatedAt: '07/11/2026 às 14:31',
  },
];

export default function PmocContractDocsUiReview() {
  const [selectedType, setSelectedType] = useState<PreviewDocumentType | null>('certificado');
  const [validity, setValidity] = useState('12');
  const [portalReleased, setPortalReleased] = useState(true);
  const selected = documents.find((document) => document.type === selectedType) ?? null;
  const SelectedIcon = selected?.icon ?? FileText;

  useEffect(() => {
    document.documentElement.setAttribute('data-app', '');
    return () => document.documentElement.removeAttribute('data-app');
  }, []);

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Contrato PMOC · dados ilustrativos</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Documentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Hospital Modelo · Unidade Centro</p>
        </header>

        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Documentos oficiais do contrato</h2>
            <p className="mt-1 text-sm text-muted-foreground">Gere, configure e consulte os documentos PMOC deste estabelecimento em um só lugar.</p>
          </div>

          <div>
            <div className="flex min-h-14 items-center justify-between gap-4 rounded-t-lg bg-primary px-4 py-3 text-primary-foreground sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                <Globe className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-bold">Documentos no portal</p>
                  <p className="text-xs text-primary-foreground/70">Permite ao cliente consultar os documentos oficiais deste contrato.</p>
                </div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 self-start text-xs font-bold sm:self-center">
                <span className="hidden sm:inline">{portalReleased ? 'Liberado' : 'Oculto'}</span>
                <Switch
                  checked={portalReleased}
                  onCheckedChange={setPortalReleased}
                  aria-label="Exibir documentos no portal do cliente"
                  className="data-[state=checked]:bg-primary-foreground data-[state=unchecked]:bg-primary-foreground/30 [&[data-state=checked]>span]:bg-primary [&[data-state=unchecked]>span]:bg-primary-foreground"
                />
              </label>
            </div>
          <Card className="overflow-hidden rounded-t-none border-t-0 border-border/80 shadow-none">
            <div className="grid md:min-h-[560px] md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
              <aside className={cn('border-border/80 md:border-r', selectedType ? 'hidden md:block' : 'block')}>
                <div className="border-b border-border/80 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Tipos de documento</p>
                </div>
                <nav className="divide-y divide-border/70">
                  {documents.map((document) => {
                    const Icon = document.icon;
                    const active = selectedType === document.type;
                    return (
                      <button
                        key={document.type}
                        type="button"
                        aria-current={active ? 'true' : undefined}
                        onClick={() => setSelectedType(document.type)}
                        className={cn(
                          'group flex min-h-[104px] w-full items-start gap-3 border-l-[3px] px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                          active ? 'border-l-primary bg-muted/60' : 'border-l-transparent hover:bg-muted/35',
                        )}
                      >
                        <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold leading-snug">{document.title}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">v{document.version} · {document.generatedAt}</span>
                        </span>
                        <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </button>
                    );
                  })}
                </nav>
              </aside>

              <div className={cn('min-w-0 bg-background', selected ? 'block' : 'hidden md:flex md:items-center md:justify-center')}>
                {selected ? (
                  <div className="w-full min-w-0">
                    <div className="border-b border-border/80 p-4 sm:p-5 lg:p-6">
                      <Button variant="ghost" size="sm" className="mb-3 -ml-2 min-h-10 md:hidden" onClick={() => setSelectedType(null)}>
                        <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" /> Voltar aos documentos
                      </Button>
                      <div>
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="flex min-w-0 items-start gap-3.5">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                            <SelectedIcon className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-lg font-extrabold tracking-tight">{selected.title}</h3>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">v{selected.version}</Badge>
                              {selected.type !== 'planilha' && <Badge variant="success">Assinado</Badge>}
                              {(selected.type === 'certificado' || selected.type === 'termo') && <Badge variant="success">Vigente</Badge>}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
                          <Button variant="outline" size="sm" className="min-h-11"><Download className="mr-1.5 h-4 w-4" />Baixar v{selected.version}</Button>
                          <Button size="sm" className="min-h-11"><RefreshCw className="mr-1.5 h-4 w-4" />Atualizar {selected.type === 'certificado' ? 'certificado' : selected.type === 'termo' ? 'TRT' : selected.type === 'dossie' ? 'dossiê' : 'planilha'}</Button>
                        </div>
                        </div>
                        <p className="mt-4 w-full text-sm leading-relaxed text-muted-foreground">{selected.description}</p>
                        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          <span>Última geração: {selected.generatedAt}</span>
                          {(selected.type === 'certificado' || selected.type === 'termo') && <span>Válido até 07/11/2027</span>}
                          {selected.type === 'certificado' && <span>Modelo: Essencial claro</span>}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 p-4 sm:p-5 lg:p-6">
                      {selected.type === 'certificado' && (
                        <section className="space-y-3">
                          <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-muted-foreground" /><h4 className="text-sm font-bold">Configuração das próximas versões</h4></div>
                          <div className="grid gap-4 rounded-lg bg-muted/30 p-4 sm:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)] sm:items-end">
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />Validade do certificado</Label>
                              <Select value={validity} onValueChange={setValidity}>
                                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="inherit">Padrão da empresa (12 meses)</SelectItem>{[3, 6, 12, 18, 24, 36].map((n) => <SelectItem key={n} value={String(n)}>{n} meses</SelectItem>)}</SelectContent>
                              </Select>
                              <p className="text-xs leading-relaxed text-muted-foreground">O próximo certificado será válido por {validity === 'inherit' ? 12 : validity} meses a partir da emissão.</p>
                            </div>
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              <Button variant="outline" size="sm" className="min-h-11"><Palette className="mr-1.5 h-4 w-4" />Modelo visual</Button>
                              <Button variant="edit-ghost" size="sm" className="min-h-11"><Pencil className="mr-1.5 h-4 w-4" />Editar próximas versões</Button>
                            </div>
                          </div>
                        </section>
                      )}

                      {selected.type === 'termo' && (
                        <section className="flex flex-col gap-3 rounded-lg bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div><h4 className="text-sm font-bold">Configuração das próximas versões</h4><p className="mt-1 text-xs text-muted-foreground">A alteração será aplicada somente aos documentos gerados depois de salvar.</p></div>
                          <Button variant="edit-ghost" size="sm" className="min-h-11"><Pencil className="mr-1.5 h-4 w-4" />Editar próximas versões</Button>
                        </section>
                      )}

                      <section className="space-y-3">
                        <div className="flex items-center gap-2"><History className="h-4 w-4 text-muted-foreground" /><h4 className="text-sm font-bold">Histórico de versões ({selected.version})</h4></div>
                        <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/80">
                          {Array.from({ length: Math.min(selected.version, 3) }, (_, index) => selected.version - index).map((version, index) => (
                            <li key={version} className="flex items-center justify-between gap-3 px-4 py-3">
                              <div><div className="flex items-center gap-2"><p className="text-sm font-bold">v{version}</p>{index === 0 && <Badge variant="secondary">Atual</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">0{7 - index}/11/2026 às 14:{32 - index * 4}</p></div>
                              <Button variant="outline" size="sm" className="min-h-10"><Download className="mr-1.5 h-4 w-4" />Baixar v{version}</Button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-sm px-8 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted"><FileText className="h-6 w-6" /></div><h3 className="mt-4 font-bold">Selecione um documento</h3><p className="mt-1.5 text-sm text-muted-foreground">Escolha um tipo na lista para consultar versões, ajustar configurações, gerar ou baixar o arquivo.</p></div>
                )}
              </div>
            </div>
          </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
