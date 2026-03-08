import { LayoutDashboard, ClipboardList, Calendar, Users, Settings, Search, Bell, Filter, MapPin } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

export default function ProductMockup() {
  const ref = useScrollReveal();

  return (
    <section className="py-24 bg-[hsl(0,0%,3%)]">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">
          O painel que seu time vai amar usar
        </h2>
        <p className="text-white/40 text-center mb-12 max-w-lg mx-auto">
          Interface intuitiva e poderosa, projetada para gestores de equipes de campo
        </p>

        <div className="rounded-2xl border border-white/10 bg-[hsl(0,0%,6%)] overflow-hidden shadow-2xl">
          <div className="flex">
            <div className="hidden md:flex w-52 flex-col border-r border-white/5 bg-[hsl(0,0%,5%)] p-4 gap-1">
              {[
                { icon: LayoutDashboard, label: 'Dashboard', active: false },
                { icon: ClipboardList, label: 'Ordens de Serviço', active: true },
                { icon: Calendar, label: 'Agenda', active: false },
                { icon: Users, label: 'Clientes', active: false },
                { icon: Settings, label: 'Configurações', active: false },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                    item.active ? 'bg-primary/10 text-primary' : 'text-white/30'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
              ))}
            </div>

            <div className="flex-1 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5">
                    <Search className="h-3 w-3 text-white/30" />
                    <span className="text-xs text-white/20">Buscar OS...</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1.5">
                    <Filter className="h-3 w-3 text-white/30" />
                    <span className="text-xs text-white/20">Filtros</span>
                  </div>
                </div>
                <Bell className="h-4 w-4 text-white/20" />
              </div>

              <div className="grid lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3 space-y-2">
                  {[
                    { n: '#1042', client: 'TechFrio LTDA', status: 'Aberta', color: 'bg-info' },
                    { n: '#1041', client: 'SolarPrime', status: 'Em andamento', color: 'bg-warning' },
                    { n: '#1040', client: 'ElétricaMax', status: 'Concluída', color: 'bg-primary' },
                    { n: '#1039', client: 'ConectTelecom', status: 'Impedida', color: 'bg-destructive' },
                    { n: '#1038', client: 'SafeGuard', status: 'Concluída', color: 'bg-primary' },
                  ].map((os) => (
                    <div key={os.n} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 hover:bg-white/[0.05] transition-colors">
                      <div className={`h-2 w-2 rounded-full ${os.color}`} />
                      <span className="text-xs text-white/50 font-mono w-14">{os.n}</span>
                      <span className="text-xs text-white/70 flex-1">{os.client}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/50">
                        {os.status}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="lg:col-span-2 rounded-lg bg-white/[0.03] h-52 lg:h-auto flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_40%_50%,hsl(160,100%,39%,0.06)_0%,transparent_70%)]" />
                  <MapPin className="h-4 w-4 text-primary absolute top-8 left-8 animate-bounce" style={{ animationDelay: '0s' }} />
                  <MapPin className="h-4 w-4 text-warning absolute top-16 right-12 animate-bounce" style={{ animationDelay: '0.3s' }} />
                  <MapPin className="h-4 w-4 text-info absolute bottom-12 left-1/3 animate-bounce" style={{ animationDelay: '0.6s' }} />
                  <span className="text-[10px] text-white/10 uppercase tracking-widest">Mapa ao vivo</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
