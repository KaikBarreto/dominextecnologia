import { Link } from 'react-router-dom';
import { useLocale } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';

export default function PrivacyPolicy() {
  const { locale, messages } = useLocale();
  const t = messages.privacidade;
  // s1P1 tem o marcador {strong}; renderiza o nome em negrito no meio.
  const [s1Before, s1After] = t.s1P1.split('{strong}');

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
              {s1Before}
              <strong>{t.s1P1Strong}</strong>
              {s1After}
            </p>
            <p className="mt-2">
              <strong>{t.s1DpoStrong}</strong> {t.s1Dpo}<br />
              {t.s1Contact} <a href="mailto:privacidade@dominex.com.br" className="text-primary underline">privacidade@dominex.com.br</a>
            </p>
          </section>

          <section id="dados-coletados">
            <h2 className="text-xl font-semibold mb-3">{t.s2Title}</h2>
            <p>{t.s2Intro}</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              {t.s2Items.map((item) => (
                <li key={item.strong}><strong>{item.strong}</strong> {item.rest}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s3Title}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="border border-border p-2 text-left">{t.s3ColPurpose}</th>
                    <th className="border border-border p-2 text-left">{t.s3ColBasis}</th>
                  </tr>
                </thead>
                <tbody>
                  {t.s3Rows.map(([fin, base]) => (
                    <tr key={fin}>
                      <td className="border border-border p-2">{fin}</td>
                      <td className="border border-border p-2">{base}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s4Title}</h2>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              {t.s4Items.map((item) => (
                <li key={item.strong}><strong>{item.strong}</strong> {item.rest}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">{t.s4Note}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t.s5Title}</h2>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              {t.s5Items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section id="lgpd">
            <h2 className="text-xl font-semibold mb-3">{t.s6Title}</h2>
            <p>{t.s6Intro}</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              {t.s6Items.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="mt-3">
              {t.s6OutroPre}
              <Link to="/meus-dados" className="text-primary underline">{t.s6OutroLink}</Link>
              {t.s6OutroMid}
              <a href="mailto:privacidade@dominex.com.br" className="text-primary underline">
                privacidade@dominex.com.br
              </a>{t.s6OutroPost}
            </p>
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
            <p>
              {t.s10P}<br />
              <a href="mailto:privacidade@dominex.com.br" className="text-primary underline">privacidade@dominex.com.br</a>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.s10NotePre}
              {t.s10NoteUrl && (
                <a href={t.s10NoteUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{t.s10NoteUrlLabel}</a>
              )}
              {t.s10NotePost}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
