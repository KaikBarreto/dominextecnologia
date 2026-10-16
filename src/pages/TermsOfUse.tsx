import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import logo from '@/assets/logo-black-horizontal.png';
import { Button } from '@/components/ui/button';
import {
  DOMINEX_LEGAL,
  getTermsIntro,
  getTermsMetaLine,
  getTermsSections,
} from '@/data/termsOfUse';
import { useLocale } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';

/** Renderiza os marcadores **negrito** da fonte canônica dos Termos. */
function renderTextWithBold(text: string) {
  return text.split(/(\*\*.*?\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

export default function TermsOfUse() {
  const { locale, messages } = useLocale();
  const t = messages.termos;
  const termsSections = getTermsSections(locale);

  return (
    <div className="min-h-screen bg-background">
      <main id="conteudo-principal" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <Button variant="ghost" asChild className="mb-6 -ml-3">
          <Link to={localizeInternal('/', locale)}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            {t.back.replace(/^←\s*/, '')}
          </Link>
        </Button>

        <header className="mb-8 flex flex-col items-center gap-4 text-center">
          <img src={logo} alt="Dominex" className="h-12 w-auto dark:invert sm:h-14" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold uppercase tracking-tight sm:text-3xl">
              {t.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {getTermsMetaLine(locale)}
            </p>
          </div>
        </header>

        <article className="prose prose-sm max-w-none space-y-6 dark:prose-invert">
          <section aria-label={t.title}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {getTermsIntro(locale)}
            </p>
          </section>

          {termsSections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-bold uppercase">{section.title}</h2>
              {section.items.map((item, itemIndex) => (
                <div key={`${section.title}-${item.subtitle ?? itemIndex}`}>
                  {(item.subtitle || item.text) && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.subtitle && <strong>{item.subtitle} </strong>}
                      {item.text && renderTextWithBold(item.text)}
                    </p>
                  )}
                  {item.list && (
                    <ul className="ml-4 space-y-1 text-sm text-muted-foreground">
                      {item.list.map((listItem, listIndex) => (
                        <li key={`${item.subtitle ?? itemIndex}-${listIndex}`}>
                          {renderTextWithBold(listItem)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          ))}

          <footer className="mt-8 border-t border-border pt-6">
            <p className="text-center text-xs text-muted-foreground">
              {DOMINEX_LEGAL.site} | {DOMINEX_LEGAL.razaoSocial} | CNPJ: {DOMINEX_LEGAL.cnpj}
            </p>
          </footer>
        </article>
      </main>
    </div>
  );
}
