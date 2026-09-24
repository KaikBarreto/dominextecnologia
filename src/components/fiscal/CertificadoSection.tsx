import type { RefObject } from 'react';
import {
  Shield,
  Upload,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CertificateAuditList } from '@/components/fiscal/CertificateAuditList';
import { formatDate as formatDateLib } from '@/lib/format';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';

type NfseMessages = (typeof MESSAGES)['pt-br']['app']['nfse'];

interface CertificadoSectionProps {
  t: NfseMessages;
  locale: LocaleCode;
  timezone: string;
  isRegistered: boolean;
  registerError: { kind: 'data' | 'platform'; message: string } | null;
  hasCertificate: boolean;
  certificateExpiresAt: string | null;
  expired: boolean;
  expiringSoon: boolean;
  expiresDays: number | null;
  onGoToEmpresa: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  certFile: File | null;
  certName: string;
  onCertNameChange: (v: string) => void;
  certPassword: string;
  onCertPasswordChange: (v: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  onCertSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  consentChecked: boolean;
  onConsentChange: (v: boolean) => void;
  uploadingCert: boolean;
  isRecordingConsent: boolean;
  onUpload: () => void;
}

/** Seção "Certificado A1" da tela de Configurações fiscais: upload, autorização de custódia e registro de uso. */
export function CertificadoSection({
  t,
  locale,
  timezone,
  isRegistered,
  registerError,
  hasCertificate,
  certificateExpiresAt,
  expired,
  expiringSoon,
  expiresDays,
  onGoToEmpresa,
  fileInputRef,
  certFile,
  certName,
  onCertNameChange,
  certPassword,
  onCertPasswordChange,
  showPassword,
  onToggleShowPassword,
  onCertSelect,
  consentChecked,
  onConsentChange,
  uploadingCert,
  isRecordingConsent,
  onUpload,
}: CertificadoSectionProps) {
  return (
    <div className="space-y-4">
      {!isRegistered &&
        (registerError ? (
          /* Motivo real da falha de registro — substitui o aviso genérico */
          <Alert
            className={
              registerError.kind === 'data'
                ? 'border-warning/40 bg-warning/10'
                : 'border-destructive/40 bg-destructive/10'
            }
          >
            {registerError.kind === 'data' ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertDescription className="text-xs space-y-0.5">
              <p className="font-semibold">{t.settings.certificado.registerFailedTitle}</p>
              <p>
                {(registerError.kind === 'data'
                  ? t.settings.certificado.registerFailedData
                  : t.settings.certificado.registerFailedPlatform
                ).replace('{error}', registerError.message)}
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          /* Aviso genérico: ainda não tentou salvar ou erro foi limpo */
          <Alert className="border-warning/40 bg-warning/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {t.settings.certificado.notRegisteredWarning.split('{link}')[0]}
              <button
                type="button"
                onClick={onGoToEmpresa}
                className="font-semibold underline underline-offset-2"
              >
                {t.settings.certificado.notRegisteredLink}
              </button>
              {t.settings.certificado.notRegisteredWarning.split('{link}')[1]}
            </AlertDescription>
          </Alert>
        ))}

      {hasCertificate && (
        <Alert
          className={
            expired
              ? 'border-destructive/40 bg-destructive/10'
              : expiringSoon
                ? 'border-warning/40 bg-warning/10'
                : 'border-success/40 bg-success/10'
          }
        >
          {expired || expiringSoon ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertDescription className="text-xs">
            {expired
              ? t.settings.certificado.certExpired.replace(
                  '{date}',
                  certificateExpiresAt ? formatDateLib(certificateExpiresAt, locale, timezone) : '',
                )
              : certificateExpiresAt
                ? t.settings.certificado.certValidUntil.replace(
                    '{date}',
                    formatDateLib(certificateExpiresAt, locale, timezone),
                  ) +
                  (expiringSoon
                    ? t.settings.certificado.certExpiringSoon.replace('{days}', String(expiresDays))
                    : '.')
                : t.settings.certificado.certSent}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>{t.settings.certificado.fileLabel}</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pfx,.p12"
          onChange={onCertSelect}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={!isRegistered}
          className="w-full justify-start"
        >
          <Upload className="h-4 w-4 mr-2" />
          {certFile ? certFile.name : t.settings.certificado.fileBtn}
        </Button>
      </div>

      <div className="space-y-2">
        <Label>{t.settings.certificado.nameLabel}</Label>
        <Input
          placeholder={t.settings.certificado.namePlaceholder}
          value={certName}
          onChange={(e) => onCertNameChange(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>{t.settings.certificado.passwordLabel}</Label>
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            value={certPassword}
            onChange={(e) => onCertPasswordChange(e.target.value)}
            placeholder={t.settings.certificado.passwordPlaceholder}
            autoComplete="off"
            disabled={!isRegistered}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
            onClick={onToggleShowPassword}
            aria-label={showPassword ? t.settings.certificado.hidePassword : t.settings.certificado.showPassword}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t.settings.certificado.passwordHint}</p>
      </div>

      {/* Autorização específica de guarda do certificado.
          Por que existe: subir a versão dos Termos NÃO re-pede aceite,
          então o cliente antigo nunca veria a cláusula de custódia.
          Aqui a autorização é explícita, no ato do envio, e fica
          registrada antes de o arquivo sair do navegador. */}
      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{t.settings.certificado.consent.title}</p>
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="cert-custody-consent"
            checked={consentChecked}
            onCheckedChange={(checked) => onConsentChange(checked === true)}
            disabled={!isRegistered || uploadingCert}
            className="mt-0.5"
          />
          <Label htmlFor="cert-custody-consent" className="cursor-pointer text-xs font-normal leading-relaxed">
            {t.settings.certificado.consent.checkbox}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">{t.settings.certificado.consent.hint}</p>
        {/* Abre os Termos em modo leitura por evento global — sem sair
            da tela nem perder o que já foi preenchido. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('dominex:open-terms'))}
          className="text-xs font-semibold text-primary underline underline-offset-2"
        >
          {t.settings.certificado.consent.termsLink}
        </button>
      </div>

      {/* Item 12.5 dos Termos: o registro de uso do certificado "fica
          disponível para consulta da sua empresa". Fica ANTES da barra fixa
          de ação — se ficasse depois, a lista (pode crescer) esconderia
          atrás da barra sticky. */}
      <CertificateAuditList />

      {/* Barra de ação fixa no rodapé — mesmo tratamento das demais seções. */}
      <div className="sticky bottom-[calc(96px+env(safe-area-inset-bottom))] lg:bottom-3 z-20 mt-6 flex flex-wrap items-center gap-2 border-t bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button
          onClick={onUpload}
          disabled={
            !isRegistered || uploadingCert || isRecordingConsent || !certFile || !certPassword.trim() || !consentChecked
          }
          className="w-full sm:w-auto"
        >
          {uploadingCert || isRecordingConsent ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Shield className="h-4 w-4 mr-2" />
          )}
          {t.settings.certificado.uploadBtn}
        </Button>
      </div>
    </div>
  );
}
