import { Building2 } from 'lucide-react';

export interface ReportHeaderConfig {
  bgColor: string;
  textColor: string;
  logoSize: number;
  showLogoBg: boolean;
  statusBarColor: string;
  logoType: 'full' | 'icon';
}

export const DEFAULT_HEADER_CONFIG: ReportHeaderConfig = {
  bgColor: '#1e293b',
  textColor: '#ffffff',
  logoSize: 80,
  showLogoBg: true,
  statusBarColor: '#16a34a',
  logoType: 'full',
};

interface ReportHeaderProps {
  company: {
    name?: string;
    document?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    logo_url?: string;
    icon_url?: string;
  } | null;
  orderNumber?: string;
  osType?: string;
  checkOutTime?: string | null;
  config?: Partial<ReportHeaderConfig>;
  isPreview?: boolean;
}

export function ReportHeader({
  company,
  orderNumber = '000001',
  osType = 'Manutenção Preventiva',
  checkOutTime,
  config: configOverride,
  isPreview = false,
}: ReportHeaderProps) {
  const cfg: ReportHeaderConfig = { ...DEFAULT_HEADER_CONFIG, ...configOverride };
  const logoPx = cfg.logoSize;
  const resolvedLogo = cfg.logoType === 'icon' ? (company?.icon_url || company?.logo_url) : company?.logo_url;

  return (
    <>
      {/* Company header */}
      <div
        data-pdf-section
        className="p-4 sm:p-6"
        style={{ background: cfg.bgColor, color: cfg.textColor }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            {company?.logo_url ? (
              <img
                src={company.logo_url}
                alt="Logo"
                className="object-contain rounded-lg shrink-0"
                style={{
                  height: `${logoPx}px`,
                  width: `${logoPx}px`,
                  ...(cfg.showLogoBg
                    ? { backgroundColor: 'rgba(255,255,255,0.95)', padding: '6px' }
                    : {}),
                }}
              />
            ) : (
              <div
                className="rounded-lg flex items-center justify-center shrink-0"
                style={{
                  height: `${logoPx}px`,
                  width: `${logoPx}px`,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                }}
              >
                <Building2
                  className="text-white/70"
                  style={{ width: logoPx * 0.4, height: logoPx * 0.4 }}
                />
              </div>
            )}
            <div className="min-w-0">
              <h1
                className="text-base sm:text-xl font-bold leading-tight"
                style={{ color: cfg.textColor }}
              >
                {company?.name || 'Empresa'}
              </h1>
              {company?.document && (
                <p className="text-xs sm:text-sm" style={{ color: cfg.textColor, opacity: 0.9 }}>
                  CNPJ: {company.document}
                </p>
              )}
              <div
                className="flex flex-col sm:flex-row sm:flex-wrap gap-x-4 gap-y-0 text-xs mt-0.5"
                style={{ color: cfg.textColor, opacity: 0.8 }}
              >
                {company?.phone && <span>{company.phone}</span>}
                {company?.email && <span className="break-all">{company.email}</span>}
              </div>
            </div>
          </div>

          {company?.address && (
            <p
              className="text-xs sm:hidden"
              style={{ color: cfg.textColor, opacity: 0.75 }}
            >
              {company.address}
              {company.city && `, ${company.city}`}
              {company.state && ` - ${company.state}`}
              {company.zip_code && ` | CEP: ${company.zip_code}`}
            </p>
          )}

          <div className="flex items-center justify-between sm:flex-col sm:items-end sm:ml-auto shrink-0">
            <div
              className="text-lg sm:text-2xl font-black tracking-tight"
              style={{ color: cfg.textColor }}
            >
              OS #{orderNumber}
            </div>
            <p className="text-xs sm:text-sm" style={{ color: cfg.textColor, opacity: 0.9 }}>
              {osType}
            </p>
          </div>
        </div>

        {company?.address && (
          <p
            className="text-xs mt-2 hidden sm:block"
            style={{ color: cfg.textColor, opacity: 0.75 }}
          >
            {company.address}
            {company.city && `, ${company.city}`}
            {company.state && ` - ${company.state}`}
            {company.zip_code && ` | CEP: ${company.zip_code}`}
          </p>
        )}
      </div>

      {/* Status bar */}
      <div
        data-pdf-section
        className="text-center py-2 text-xs sm:text-sm font-semibold tracking-wide uppercase"
        style={{ backgroundColor: cfg.statusBarColor, color: '#ffffff' }}
      >
        {isPreview ? (
          '✓ Serviço Concluído — 21/03/2026 às 14:30'
        ) : (
          <>
            ✓ Serviço Concluído
            {checkOutTime && (
              <span className="font-normal ml-2">— {checkOutTime}</span>
            )}
          </>
        )}
      </div>
    </>
  );
}