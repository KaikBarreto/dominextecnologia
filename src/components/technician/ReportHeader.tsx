export interface ReportHeaderConfig {
  bgColor: string;
  textColor: string;
  logoSize: number;
  showLogoBg: boolean;
  logoBgColor: string;
  statusBarColor: string;
  logoType: 'full' | 'icon';
}

/**
 * Degradê padrão do cabeçalho do relatório (card escuro com dados da empresa).
 * Preto → cinza escuro neutro (sem tom azulado). Quando a empresa salva uma cor
 * própria em `report_header_bg_color`, esse valor é substituído pela cor sólida
 * escolhida (mantém a personalização). `background` (não `background-color`)
 * aceita tanto hex quanto gradiente e dispara o `print-color-adjust: exact` da
 * regra `[style*="background"]` no index.css — sai no PDF/print.
 */
export const REPORT_HEADER_DARK_GRADIENT = 'linear-gradient(135deg, #0a0a0a 0%, #27272a 100%)';

export const DEFAULT_HEADER_CONFIG: ReportHeaderConfig = {
  bgColor: REPORT_HEADER_DARK_GRADIENT,
  textColor: '#ffffff',
  logoSize: 80,
  showLogoBg: true,
  logoBgColor: '#ffffff',
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
        data-print-preserve-colors="true"
        className="p-4 sm:p-6"
        style={{
          background: cfg.bgColor,
          color: cfg.textColor,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Sem logo da empresa: não renderiza placeholder — info fica à esquerda. */}
            {resolvedLogo && (
              <img
                src={resolvedLogo}
                alt="Logo"
                className="object-contain rounded-lg shrink-0"
                style={{
                  height: `${logoPx}px`,
                  width: `${logoPx}px`,
                  ...(cfg.showLogoBg
                    ? { backgroundColor: cfg.logoBgColor || 'rgba(255,255,255,0.95)', padding: '6px' }
                    : {}),
                }}
              />
            )}
            <div className="min-w-0">
              <h1
                data-print-preserve-colors="true"
                className="text-base sm:text-xl font-bold leading-tight"
                style={{ color: cfg.textColor }}
              >
                {company?.name || 'Empresa'}
              </h1>
              {company?.document && (
                <p data-print-preserve-colors="true" className="text-xs sm:text-sm" style={{ color: cfg.textColor, opacity: 0.9 }}>
                  CNPJ: {company.document}
                </p>
              )}
              <div
                data-print-preserve-colors="true"
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
              data-print-preserve-colors="true"
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
              data-print-preserve-colors="true"
              className="text-lg sm:text-2xl font-black tracking-tight"
              style={{ color: cfg.textColor }}
            >
              OS #{orderNumber}
            </div>
            <p data-print-preserve-colors="true" className="text-xs sm:text-sm" style={{ color: cfg.textColor, opacity: 0.9 }}>
              {osType}
            </p>
          </div>
        </div>

        {company?.address && (
          <p
            data-print-preserve-colors="true"
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
        data-print-preserve-colors="true"
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