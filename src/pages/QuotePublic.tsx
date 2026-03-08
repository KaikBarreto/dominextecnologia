import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, FileText, Loader2 } from 'lucide-react';
import { STATUS_LABELS, STATUS_COLORS } from '@/hooks/useQuotes';

export default function QuotePublic() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data } = await supabase
        .from('quotes')
        .select('*, customers(name, email, phone), quote_items(*)')
        .eq('token', token)
        .single();

      if (data) {
        setQuote(data);
        setItems((data as any).quote_items ?? []);
      }
      setLoading(false);
    })();
  }, [token]);

  const respond = async (status: 'aprovado' | 'rejeitado') => {
    if (!token) return;
    setResponding(true);
    await supabase.from('quotes').update({ status }).eq('token', token);
    setQuote((q: any) => ({ ...q, status }));
    setResponding(false);
    setDone(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Orçamento não encontrado.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const alreadyResponded = ['aprovado', 'rejeitado'].includes(quote.status);

  return (
    <div className="min-h-screen bg-background p-4 flex items-start justify-center pt-10">
      <Card className="max-w-2xl w-full">
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">Orçamento #{quote.quote_number}</h1>
              <p className="text-sm text-muted-foreground">Para: {quote.customers?.name}</p>
            </div>
            <Badge className={STATUS_COLORS[quote.status]}>
              {STATUS_LABELS[quote.status] ?? quote.status}
            </Badge>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Itens</h2>
            {items
              .sort((a: any, b: any) => a.position - b.position)
              .map((item: any) => (
                <div key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.description}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity}x R$ {item.unit_price?.toFixed(2)}</p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">R$ {item.total_price?.toFixed(2)}</span>
                </div>
              ))}
          </div>

          {/* Totals */}
          <div className="border-t pt-3 space-y-1 text-right">
            {(quote.discount_amount ?? 0) > 0 && (
              <>
                <p className="text-sm text-muted-foreground">Subtotal: R$ {(quote.subtotal ?? 0).toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">Desconto: -R$ {(quote.discount_amount ?? 0).toFixed(2)}</p>
              </>
            )}
            <p className="text-lg font-bold text-foreground">Total: R$ {(quote.total_value ?? 0).toFixed(2)}</p>
          </div>

          {quote.terms && (
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-1">Condições</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.terms}</p>
            </div>
          )}

          {/* Actions */}
          {!alreadyResponded && quote.status === 'enviado' ? (
            <div className="flex gap-3 pt-4">
              <Button
                className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                onClick={() => respond('aprovado')}
                disabled={responding}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Aprovar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => respond('rejeitado')}
                disabled={responding}
              >
                <XCircle className="h-4 w-4 mr-2" /> Rejeitar
              </Button>
            </div>
          ) : done ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">
                {quote.status === 'aprovado' ? '✅ Orçamento aprovado! Obrigado.' : '❌ Orçamento rejeitado.'}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
