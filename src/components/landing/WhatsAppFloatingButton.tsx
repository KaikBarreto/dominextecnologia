import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useLocale } from "@/lib/i18n";
import { COMPANY_WHATSAPP_NUMBER } from "@/components/landing/whatsappNumbers";
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';

export default function WhatsAppFloatingButton() {
  const { locale } = useLocale();

  // URL montada no clique para incluir a página e a UTM atuais na mensagem.
  const handleClick = () => {
    const url = buildWhatsAppUrl(COMPANY_WHATSAPP_NUMBER, undefined, locale);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <aside
      aria-label="Atendimento pelo WhatsApp"
      className="fixed bottom-24 right-5 z-50 flex items-center gap-2 md:bottom-6 md:right-6"
    >
      <div className="hidden items-center gap-2 rounded-full border border-[#dfe4df] bg-white px-4 py-2 shadow-lg sm:flex dark:border-white/10 dark:bg-[#151a17]">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#25D366]" />
        </span>
        <span className="whitespace-nowrap text-sm font-semibold text-[#202722] dark:text-white">
          Respondemos em até 5 min
        </span>
      </div>
      <div className="relative">
        <span className="absolute inset-1 rounded-full bg-[#25D366] opacity-40 animate-ping [animation-duration:2.5s]" />
        <button
          type="button"
          onClick={handleClick}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-110 hover:shadow-xl"
          aria-label="Fale conosco no WhatsApp"
        >
          <WhatsAppIcon className="h-7 w-7" />
        </button>
        <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          1
        </span>
      </div>
    </aside>
  );
}
