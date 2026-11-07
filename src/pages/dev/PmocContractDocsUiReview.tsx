import { useState } from 'react';
import {
  Building2,
  CalendarClock,
  Download,
  Eye,
  FileText,
  Files,
  Globe,
  Palette,
  Pencil,
  RefreshCw,
  Table2,
} from 'lucide-react';

import { DocumentRow } from '@/components/pmoc/PmocContractDocsTab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ActionIcon = ({ icon: Icon }: { icon: typeof Download }) => <Icon className="mr-1.5 h-4 w-4" />;

export default function PmocContractDocsUiReview() {
  const [validity, setValidity] = useState('12');

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Contrato PMOC · dados ilustrativos</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Documentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Hospital Modelo · Unidade Centro</p>
        </header>

        <Card className="border-0 bg-muted/25 shadow-none">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">Documentos no portal do cliente</p>
                  <Badge variant="success" className="gap-1"><Eye className="h-3 w-3" /> Liberado</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">O cliente pode consultar os documentos oficiais no portal da unidade.</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="min-h-11 rounded-xl">Ocultar do portal</Button>
          </CardContent>
        </Card>

        <NoticeBanner variant="neutral" title="Documentação pronta para emissão">
          Dados da empresa, estabelecimento e responsável técnico estão configurados.
        </NoticeBanner>

        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Documentos oficiais do contrato</h2>
            <p className="mt-1 text-sm text-muted-foreground">Gere, configure e consulte os documentos PMOC deste estabelecimento em um só lugar.</p>
          </div>

          <Card className="overflow-hidden border-border/80 shadow-none">
            <div className="divide-y divide-border/80">
              <DocumentRow
                icon={Building2}
                title="Certificado do contrato e estabelecimento"
                description="Certifica a cobertura PMOC dos ambientes climatizados deste estabelecimento durante a vigência definida. Não representa uma única Ordem de Serviço."
                emphasized
                badges={<><Badge variant="secondary">v4</Badge><Badge variant="success">Assinado</Badge><Badge variant="success">Vigente</Badge></>}
                metadata={<><span>Última geração: 07/11/2026 às 14:32</span><span>Válido até 07/11/2027</span><span className="inline-flex items-center gap-1"><Palette className="h-3.5 w-3.5" /> Modelo: Essencial claro</span></>}
                actions={<><Button variant="outline" size="sm" className="min-h-11 rounded-xl"><ActionIcon icon={Download} />Baixar Certificado</Button><Button size="sm" className="min-h-11 rounded-xl"><ActionIcon icon={RefreshCw} />Gerar nova versão</Button></>}
                settings={
                  <div className="grid gap-4 rounded-xl bg-background/80 p-4 sm:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)] sm:items-end">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />Validade do Certificado (meses)</Label>
                      <Select value={validity} onValueChange={setValidity}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="inherit">Padrão da empresa (12 meses)</SelectItem>{[3, 6, 12, 18, 24, 36].map((n) => <SelectItem key={n} value={String(n)}>{n} meses</SelectItem>)}</SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">O próximo certificado será válido por {validity === 'inherit' ? 12 : validity} meses a partir da emissão.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button variant="outline" size="sm" className="min-h-11 rounded-xl"><ActionIcon icon={Palette} />Modelo visual</Button>
                      <Button variant="edit-ghost" size="sm" className="min-h-11 rounded-xl"><ActionIcon icon={Pencil} />Editar texto</Button>
                    </div>
                  </div>
                }
              />
              <DocumentRow icon={FileText} title="Termo de Responsabilidade Técnica" description="Texto usado no TRT individual e no Dossiê PMOC." badges={<><Badge variant="secondary">v3</Badge><Badge variant="success">Assinado</Badge><Badge variant="success">Vigente</Badge></>} metadata={<><span>Última geração: 07/11/2026 às 14:28</span><span>Válido até 07/11/2027</span></>} actions={<><Button variant="edit-ghost" size="sm" className="min-h-11 rounded-xl"><ActionIcon icon={Pencil} />Editar texto</Button><Button variant="outline" size="sm" className="min-h-11 rounded-xl"><ActionIcon icon={Download} />Baixar TRT</Button><Button variant="outline" size="sm" className="min-h-11 rounded-xl"><ActionIcon icon={RefreshCw} />Gerar TRT</Button></>} />
              <DocumentRow icon={Files} title="Dossiê PMOC" description="Documento completo com capa, termo, certificado e cronograma anual." badges={<><Badge variant="secondary">v2</Badge><Badge variant="success">Assinado</Badge></>} metadata={<span>Última geração: 07/11/2026 às 14:35</span>} actions={<><Button variant="outline" size="sm" className="min-h-11 rounded-xl"><ActionIcon icon={Download} />Baixar última versão</Button><Button variant="outline" size="sm" className="min-h-11 rounded-xl"><ActionIcon icon={RefreshCw} />Gerar nova versão</Button></>} />
              <DocumentRow icon={Table2} title="Planilha PMOC" description="Equipamentos, periodicidades e mapa de manutenção dos 12 meses." badges={<Badge variant="secondary">v2</Badge>} metadata={<span>Última geração: 07/11/2026 às 14:31</span>} actions={<><Button variant="outline" size="sm" className="min-h-11 rounded-xl"><ActionIcon icon={Download} />Baixar Planilha</Button><Button variant="outline" size="sm" className="min-h-11 rounded-xl"><ActionIcon icon={RefreshCw} />Gerar nova versão</Button></>} />
            </div>
          </Card>
        </section>

        <Card className="border-0 bg-muted/25 shadow-none"><CardContent className="p-4 text-sm font-semibold">Histórico de versões (11)</CardContent></Card>
      </div>
    </main>
  );
}
