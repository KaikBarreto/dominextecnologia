import { ClipboardList, MapPin, Calendar, RefreshCw, BarChart3, Smartphone } from 'lucide-react';

const features = [
  {
    icon: ClipboardList,
    title: 'Ordens de Serviço Digitais',
    desc: 'Crie, atribua e acompanhe OS em segundos. Com fotos, checklist, assinatura digital e histórico completo.',
  },
  {
    icon: MapPin,
    title: 'Rastreamento em Tempo Real',
    desc: 'Veja no mapa onde cada técnico está agora. Check-in com validação por raio de 300m do endereço do cliente.',
  },
  {
    icon: Calendar,
    title: 'Agenda e Agendamento Inteligente',
    desc: 'Monte a agenda da equipe, distribua chamados pelo técnico mais próximo e evite conflitos de horário.',
  },
  {
    icon: RefreshCw,
    title: 'Manutenções Recorrentes',
    desc: 'Automatize preventivas com recorrência configurável. Nunca mais esqueça um contrato de SLA.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios e Métricas',
    desc: 'Dashboard com KPIs em tempo real: OS por status, tempo médio de atendimento, avaliações dos clientes.',
  },
  {
    icon: Smartphone,
    title: 'App para o Técnico',
    desc: 'Aplicativo mobile offline-first. O técnico recebe OS, faz check-in, tira fotos e coleta assinatura — sem papel.',
  },
];

export default function FeaturesGrid() {
  return (
    <section id="features" className="py-24 bg-[hsl(0,0%,5%)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Tudo que sua operação precisa, em um só lugar
          </h2>
          <p className="text-white/40 max-w-2xl mx-auto">
            Do chamado ao faturamento, o Dominex cobre cada etapa
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/5 bg-[hsl(0,0%,7%)] p-8 transition-all duration-300 hover:border-primary/30 hover:shadow-brand-glow hover:-translate-y-1"
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
