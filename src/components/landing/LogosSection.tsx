const logos = [
  'TechFrio', 'SolarPrime', 'ElétricaMax', 'ConectTelecom', 'SafeGuard CFTV',
  'ClimaTec', 'VoltPower', 'NetLink', 'FrioPro', 'SunTech',
];

export default function LogosSection() {
  return (
    <section className="relative py-16 bg-[hsl(0,0%,4%)] border-y border-white/5">
      <p className="text-center text-sm text-white/30 uppercase tracking-widest mb-8">
        Empresas que já dominam suas operações com o Dominex
      </p>
      <div className="overflow-hidden">
        <div className="flex animate-[marquee_30s_linear_infinite] gap-12 w-max">
          {[...logos, ...logos].map((name, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-white/20 hover:text-white/50 transition-opacity whitespace-nowrap"
            >
              <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold">
                {name[0]}
              </div>
              <span className="text-sm font-medium">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
