import { Building2, CalendarDays, ChevronRight, CircleDollarSign, ClipboardCheck, MapPin, UsersRound, Wrench } from 'lucide-react';

const features = [
  { label: 'Ordens de serviço', icon: ClipboardCheck },
  { label: 'Agenda', icon: CalendarDays },
  { label: 'Financeiro', icon: CircleDollarSign },
  { label: 'Equipe', icon: UsersRound },
];

export function LoginShowcase() {
  return (
    <aside className="relative hidden min-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[28px] bg-[#101314] text-white md:m-3 md:ml-0 md:flex xl:min-h-[calc(100dvh-2rem)] xl:m-4 xl:ml-0 xl:rounded-[32px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(0,197,151,0.2),transparent_34%),radial-gradient(circle_at_42%_88%,rgba(0,197,151,0.1),transparent_38%),linear-gradient(145deg,#0c0f10_0%,#23282a_58%,#101314_100%)]" />
      <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.55)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.55)_1px,transparent_1px)] [background-size:34px_34px]" />
      <img src="/images/Logo 3D.png" alt="" aria-hidden="true" className="pointer-events-none absolute -right-[22%] top-[2%] w-[68%] mix-blend-screen opacity-20" />

      <div className="relative z-10 flex min-h-full w-full flex-col px-7 py-8 lg:px-9 lg:py-9 xl:px-12 xl:py-11">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#00C597] lg:text-xs xl:text-sm">Gestão feita para empresas de serviço</p>
          <h2 className="mt-4 font-montserrat text-[2rem] font-semibold leading-[1.04] tracking-[-0.045em] lg:text-[2.55rem] xl:mt-5 xl:text-[clamp(2.75rem,3vw,3.35rem)]">
            Sua operação sob controle.
            <span className="mt-1 block text-[#00C597]">Do chamado ao financeiro.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70 lg:text-base xl:mt-5 xl:text-lg xl:leading-7">Clientes, agenda, equipes e resultados trabalhando juntos, do jeito que sua empresa precisa.</p>
        </div>

        <div className="mt-6 hidden grid-cols-2 gap-2 md:grid xl:grid-cols-4 xl:gap-3">
          {features.map(({ label, icon: Icon }) => (
            <div key={label} className="flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 text-xs font-medium text-white/90 backdrop-blur-sm xl:min-h-12 xl:justify-center xl:px-4 xl:text-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#00C597] text-[#07110f]"><Icon className="h-4 w-4" strokeWidth={2.2} /></span>
              {label}
            </div>
          ))}
        </div>

        <div className="relative mt-auto flex min-h-0 flex-1 items-end pt-7 xl:pt-8">
          <div className="relative ml-auto w-full overflow-hidden rounded-[14px] border-[5px] border-[#090b0c] bg-[#090b0c] shadow-[0_28px_65px_-26px_rgba(0,0,0,.9)] xl:w-[86%] xl:rounded-[18px] xl:border-[7px]">
            <div className="flex h-5 items-center gap-1.5 bg-[#090b0c] px-2.5 xl:h-7 xl:px-3"><span className="h-2 w-2 rounded-full bg-[#ff5f57]" /><span className="h-2 w-2 rounded-full bg-[#febc2e]" /><span className="h-2 w-2 rounded-full bg-[#28c840]" /></div>
            <div className="aspect-[16/9] overflow-hidden bg-white"><img src="/guia-tecnico/img/t0-dashboard-completo.jpg" alt="Dashboard do Dominex" className="h-full w-full object-cover object-top" /></div>
          </div>
          <div className="absolute bottom-[-3%] left-0 hidden w-[27%] min-w-[158px] overflow-hidden rounded-[30px] border-[6px] border-[#090b0c] bg-[#090b0c] shadow-[0_30px_55px_-22px_rgba(0,0,0,.95)] xl:block 2xl:min-w-[180px]">
            <div className="absolute left-1/2 top-1.5 z-10 h-4 w-[42%] -translate-x-1/2 rounded-full bg-[#090b0c]" />
            <div className="aspect-[9/18.5] overflow-hidden rounded-[23px] bg-[#f5f7f8] text-[#171a1b]" role="img" aria-label="Preenchimento de uma ordem de serviço no Dominex">
              <div className="flex h-full flex-col px-3 pb-3 pt-7">
                <div className="flex items-center justify-between border-b border-[#dfe4e6] pb-2">
                  <span className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#596367]">Nova ordem de serviço</span>
                  <span className="rounded-full bg-[#00C597] px-2 py-0.5 text-[7px] font-bold text-[#07110f]">1 de 3</span>
                </div>
                <div className="pb-2 pt-2.5">
                  <strong className="block font-montserrat text-[12px] leading-tight tracking-[-0.025em]">Cliente e serviço</strong>
                  <span className="mt-0.5 block text-[7px] leading-tight text-[#6f7a7e]">Preencha os dados do atendimento.</span>
                </div>
                <div className="grid gap-1.5">
                  <div className="rounded-[8px] border border-[#d9dfe1] bg-white px-2 py-1.5 shadow-sm">
                    <span className="flex items-center gap-1 text-[6px] font-semibold uppercase tracking-[0.08em] text-[#788286]"><Building2 className="h-2.5 w-2.5 text-[#00a980]" />Cliente</span>
                    <strong className="mt-0.5 block truncate text-[8px] font-semibold">Mercado Boa Vista</strong>
                  </div>
                  <div className="rounded-[8px] border border-[#d9dfe1] bg-white px-2 py-1.5 shadow-sm">
                    <span className="flex items-center gap-1 text-[6px] font-semibold uppercase tracking-[0.08em] text-[#788286]"><Wrench className="h-2.5 w-2.5 text-[#00a980]" />Tipo de serviço</span>
                    <strong className="mt-0.5 block truncate text-[8px] font-semibold">Manutenção preventiva</strong>
                  </div>
                  <div className="rounded-[8px] border border-[#d9dfe1] bg-white px-2 py-1.5 shadow-sm">
                    <span className="flex items-center gap-1 text-[6px] font-semibold uppercase tracking-[0.08em] text-[#788286]"><MapPin className="h-2.5 w-2.5 text-[#00a980]" />Local do atendimento</span>
                    <strong className="mt-0.5 block truncate text-[8px] font-semibold">Unidade Centro</strong>
                  </div>
                  <div className="rounded-[8px] border border-[#d9dfe1] bg-white px-2 py-1.5 shadow-sm">
                    <span className="flex items-center gap-1 text-[6px] font-semibold uppercase tracking-[0.08em] text-[#788286]"><ClipboardCheck className="h-2.5 w-2.5 text-[#00a980]" />Equipamento</span>
                    <strong className="mt-0.5 block truncate text-[8px] font-semibold">Split 12.000 BTU</strong>
                  </div>
                </div>
                <button type="button" tabIndex={-1} className="mt-auto flex h-8 w-full items-center justify-center gap-1 rounded-[8px] bg-[#00C597] text-[8px] font-bold text-[#07110f] shadow-[0_8px_18px_-10px_rgba(0,197,151,.8)]">Continuar <ChevronRight className="h-3 w-3" /></button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 text-sm text-white/72 xl:mt-6"><span className="h-2.5 w-2.5 rounded-full bg-[#00C597] shadow-[0_0_0_5px_rgba(0,197,151,.13)]" /><strong className="text-white">Uma operação.</strong><span>Todos os módulos conectados.</span></div>
      </div>
    </aside>
  );
}
