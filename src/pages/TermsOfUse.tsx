import { Link } from 'react-router-dom';
import { useLocale } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';

export default function TermsOfUse() {
  const { locale, messages } = useLocale();
  const t = messages.termos;
  const privacyHref = localizeInternal('/privacidade', locale);

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to={localizeInternal('/', locale)} className="text-sm text-muted-foreground hover:text-foreground">{t.back}</Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">{t.title}</h1>
        <p className="text-sm text-muted-foreground mb-8">{t.version}</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s1Title}</h2>
            <p>
              {t.s1Pre}
              <Link to={privacyHref} className="text-primary underline">{t.s1Link}</Link>
              {t.s1Post}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s2Title}</h2>
            <p>{t.s2P}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s3Title}</h2>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              {t.s3Items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s4Title}</h2>
            <p>{t.s4P}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s5Title}</h2>
            <p>
              {t.s5Pre}
              <Link to={privacyHref} className="text-primary underline">{t.s5Link}</Link>
              {t.s5Post}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s6Title}</h2>
            <p>{t.s6Intro}</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              {t.s6Items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s7Title}</h2>
            <p>{t.s7P}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s8Title}</h2>
            <p>{t.s8P}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s9Title}</h2>
            <p>{t.s9P}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s10Title}</h2>
            <p>{t.s10P}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s11Title}</h2>
            <p>{t.s11P}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s12Title}</h2>
            <p>
              {t.s12Pre}
              <a href="mailto:contato@dominex.com.br" className="text-primary underline">contato@dominex.com.br</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
