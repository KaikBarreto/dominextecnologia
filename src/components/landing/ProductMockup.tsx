import { LayoutDashboard, ClipboardList, Calendar, Users, Settings, Search, Bell, Filter, MapPin } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useLocale } from '@/lib/i18n';

export default function ProductMockup() {
  const ref = useScrollReveal();
  const t = useLocale().messages.home.productMockup;

  return (
    <section className="bg-[#f4f6f2] py-24 dark:bg-[#050706]">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="mb-4 text-center text-3xl font-bold tracking-[-0.025em] text-[#101512] dark:text-white sm:text-4xl">
          {t.heading}
        </h2>
        <p className="mx-auto mb-12 max-w-lg text-center leading-relaxed text-[#657068] dark:text-white/55">
          {t.subheading}
        </p>

        <div className="overflow-hidden rounded-3xl border border-[#d8dfd9] bg-white shadow-[0_28px_80px_-46px_rgba(16,21,18,0.38)] dark:border-white/10 dark:bg-[#0b0e0c] dark:shadow-2xl">
          <div className="flex">
            <div className="hidden w-52 flex-col gap-1 border-r border-[#e2e7e3] bg-[#f7f8f5] p-4 dark:border-white/5 dark:bg-[#080a09] md:flex">
              {[
                { icon: LayoutDashboard, label: t.sidebar.dashboard, active: false },
                { icon: ClipboardList, label: t.sidebar.serviceOrders, active: true },
                { icon: Calendar, label: t.sidebar.schedule, active: false },
                { icon: Users, label: t.sidebar.clients, active: false },
                { icon: Settings, label: t.sidebar.settings, active: false },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                    item.active ? 'bg-primary text-white' : 'text-[#768078] dark:text-white/35'
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
                  <div className="flex items-center gap-2 rounded-lg border border-[#e0e5e1] bg-[#f7f8f5] px-3 py-1.5 dark:border-white/10 dark:bg-white/5">
                    <Search className="h-3 w-3 text-[#7b857d] dark:text-white/30" />
                    <span className="text-xs text-[#7b857d] dark:text-white/30">{t.searchPlaceholder}</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-[#e0e5e1] bg-white px-2 py-1.5 dark:border-white/10 dark:bg-white/5">
                    <Filter className="h-3 w-3 text-[#59645c] dark:text-white/30" />
                    <span className="text-xs text-[#59645c] dark:text-white/30">{t.filters}</span>
                  </div>
                </div>
                <Bell className="h-4 w-4 text-[#7b857d] dark:text-white/25" />
              </div>

              <div className="grid lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3 space-y-2">
                  {[
                    { n: '#1042', client: 'TechFrio LTDA', status: t.status.open, color: 'bg-info' },
                    { n: '#1041', client: 'SolarPrime', status: t.status.inProgress, color: 'bg-warning' },
                    { n: '#1040', client: 'ElétricaMax', status: t.status.done, color: 'bg-primary' },
                    { n: '#1039', client: 'ConectTelecom', status: t.status.blocked, color: 'bg-destructive' },
                    { n: '#1038', client: 'SafeGuard', status: t.status.done, color: 'bg-primary' },
                  ].map((os) => (
                    <div key={os.n} className="flex items-center gap-3 rounded-xl border border-[#e7ebe8] bg-white p-3 transition-colors hover:bg-[#f7f8f5] dark:border-white/5 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
                      <div className={`h-2 w-2 rounded-full ${os.color}`} />
                      <span className="w-14 font-mono text-xs text-[#657068] dark:text-white/50">{os.n}</span>
                      <span className="flex-1 text-xs font-medium text-[#263029] dark:text-white/70">{os.client}</span>
                      <span className="rounded-full bg-[#eef1ed] px-2 py-0.5 text-[10px] text-[#59645c] dark:bg-white/5 dark:text-white/50">
                        {os.status}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="relative flex h-52 items-center justify-center overflow-hidden rounded-xl border border-[#e2e7e3] bg-[#f7f8f5] dark:border-white/5 dark:bg-white/[0.03] lg:col-span-2 lg:h-auto">
                  <div className="absolute inset-0 bg-[linear-gradient(#e8ece9_1px,transparent_1px),linear-gradient(90deg,#e8ece9_1px,transparent_1px)] bg-[size:32px_32px] opacity-70 dark:bg-none" />
                  <MapPin className="h-4 w-4 text-primary absolute top-8 left-8 animate-bounce" style={{ animationDelay: '0s' }} />
                  <MapPin className="h-4 w-4 text-warning absolute top-16 right-12 animate-bounce" style={{ animationDelay: '0.3s' }} />
                  <MapPin className="h-4 w-4 text-info absolute bottom-12 left-1/3 animate-bounce" style={{ animationDelay: '0.6s' }} />
                  <span className="relative rounded-full border border-[#d8dfd9] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#667169] shadow-sm dark:border-white/10 dark:bg-[#0b0e0c] dark:text-white/25 dark:shadow-none">{t.liveMap}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
