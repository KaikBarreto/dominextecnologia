import { ArrowRight, ClipboardList, PackageCheck, ShoppingBag, ShoppingCart, Store, WalletCards, type LucideIcon } from 'lucide-react';
import './PdvWorkflowIllustration.css';

type Mode = 'direct' | 'cashier' | 'dispatch';

function Stage({ label, place, icon: Icon, delivery = false }: { label: string; place: string; icon: LucideIcon; delivery?: boolean }) {
  return <div className="pdv-workflow-step">
    <span className="pdv-workflow-stage-art"><Icon />{delivery && <ShoppingBag className="pdv-workflow-delivery-icon" />}</span>
    <span className="pdv-workflow-place">{place}</span>
    <span className="pdv-workflow-step-label">{label}</span>
  </div>;
}

/** Ilustração decorativa: a seleção e a regra gravada continuam no radio da configuração. */
export function PdvWorkflowIllustration({ mode }: { mode: Mode }) {
  if (mode === 'direct') return <div className="pdv-workflow-illustration pdv-workflow-direct" aria-hidden="true">
    <Store className="pdv-workflow-store" />
    <div className="pdv-workflow-direct-actions">
      {[{ label: 'Venda', icon: ShoppingCart }, { label: 'Pagamento', icon: WalletCards }, { label: 'Entrega', icon: PackageCheck }].map(({ label, icon: Icon }) => <span key={label}><Icon /><span>{label}</span></span>)}
    </div>
    <span className="pdv-workflow-place">Um só atendimento</span>
  </div>;

  return <div className={`pdv-workflow-illustration pdv-workflow-stages pdv-workflow-${mode}`} aria-hidden="true">
    <Stage label="Orçamento" place="Balcão" icon={ClipboardList} />
    <ArrowRight className="pdv-workflow-arrow" />
    <Stage label={mode === 'cashier' ? 'Pagamento + entrega' : 'Pagamento'} place="Caixa" icon={WalletCards} delivery={mode === 'cashier'} />
    {mode === 'dispatch' && <><ArrowRight className="pdv-workflow-arrow" /><Stage label="Retirada" place="Entrega" icon={PackageCheck} /></>}
  </div>;
}
