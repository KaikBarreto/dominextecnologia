import type { CompanySettings } from '@/hooks/useCompanySettings';
import logoBlack from '@/assets/logo-black-horizontal.png';
import logoGreen from '@/assets/logo-horizontal-verde.png';
import { colorAdjust } from './shared';

/** Assinatura da plataforma, separada da identidade da empresa emitente. */
export function ProposalPlatformFooter({
  company,
  dark = false,
}: {
  company: CompanySettings | null | undefined;
  dark?: boolean;
}) {
  // Sem contexto da empresa, não presumir autorização para exibir a marca.
  if (!company || company.white_label_enabled) return null;

  return (
    <div
      data-proposal-platform-brand
      data-pdf-keep
      style={{
        width: '100%',
        marginTop: 28,
        paddingTop: 22,
        paddingBottom: 16,
        borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.16)' : '#e2e8f0'}`,
        breakInside: 'avoid',
        ...colorAdjust,
      }}
    >
      <a
        href="https://dominex.app"
        data-pdf-link="https://dominex.app"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Dominex — dominex.app"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          columnGap: 32,
          rowGap: 12,
          minHeight: 44,
          color: dark ? '#ffffff' : '#0f172a',
          textDecoration: 'none',
        }}
      >
        <img
          data-pdf-logo
          src={dark ? logoGreen : logoBlack}
          alt="Dominex"
          width={180}
          height={37}
          style={{ display: 'block', width: 180, maxWidth: '100%', height: 'auto', objectFit: 'contain' }}
        />
        <span style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600, letterSpacing: '0.01em' }}>
          dominex.app
        </span>
      </a>
    </div>
  );
}
