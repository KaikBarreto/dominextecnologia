import type { LocaleCode } from '@/lib/i18n/locales';

const messages = {
  'pt-br': {
    title: 'Nova compra', subtitle: 'Registre materiais, estoque e pagamento sem sair do caixa.', back: 'Voltar ao Caixa',
    newOrder: 'Novo pedido', code: 'Código', supplier: 'Fornecedor', value: 'Valor', unnamedSupplier: 'Fornecedor não informado',
    deleteLabel: 'Excluir pedido', deleteTitle: 'Excluir este pedido?',
    deleteDescription: '{code} de {supplier}, com {items} item(ns) e total {value}, será descartado.',
    keepOrder: 'Manter pedido', confirmDelete: 'Excluir pedido', financialTitle: 'Pagamento e financeiro',
    noAccessTitle: 'Acesso insuficiente', noAccessDescription: 'Para registrar uma compra, o usuário precisa administrar estoque e financeiro.',
    finalize: 'Finalizar compra', finalizing: 'Finalizando...', itemCount: '{count} item(ns)',
    syncConflict: 'Esta compra foi alterada em outra aba ou dispositivo. A cópia local foi preservada; revise antes de continuar.',
    syncUnavailable: 'As compras continuam salvas neste dispositivo, mas a sincronização online está indisponível.',
    limitReached: 'O limite de 20 compras simultâneas foi atingido.',
  },
  en: {
    title: 'New purchase', subtitle: 'Record materials, stock and payment without leaving the register.', back: 'Back to Register',
    newOrder: 'New order', code: 'Code', supplier: 'Supplier', value: 'Value', unnamedSupplier: 'Supplier not provided',
    deleteLabel: 'Delete order', deleteTitle: 'Delete this order?',
    deleteDescription: '{code} from {supplier}, with {items} item(s) and total {value}, will be discarded.',
    keepOrder: 'Keep order', confirmDelete: 'Delete order', financialTitle: 'Payment and finance',
    noAccessTitle: 'Insufficient access', noAccessDescription: 'To record a purchase, the user must manage inventory and finance.',
    finalize: 'Complete purchase', finalizing: 'Completing...', itemCount: '{count} item(s)',
    syncConflict: 'This purchase changed in another tab or device. The local copy was preserved; review it before continuing.',
    syncUnavailable: 'Purchases remain saved on this device, but online sync is unavailable.',
    limitReached: 'The limit of 20 simultaneous purchases has been reached.',
  },
  es: {
    title: 'Nueva compra', subtitle: 'Registra materiales, stock y pago sin salir de la caja.', back: 'Volver a Caja',
    newOrder: 'Nuevo pedido', code: 'Código', supplier: 'Proveedor', value: 'Valor', unnamedSupplier: 'Proveedor no informado',
    deleteLabel: 'Eliminar pedido', deleteTitle: '¿Eliminar este pedido?',
    deleteDescription: '{code} de {supplier}, con {items} artículo(s) y total {value}, será descartado.',
    keepOrder: 'Mantener pedido', confirmDelete: 'Eliminar pedido', financialTitle: 'Pago y finanzas',
    noAccessTitle: 'Acceso insuficiente', noAccessDescription: 'Para registrar una compra, el usuario debe administrar inventario y finanzas.',
    finalize: 'Finalizar compra', finalizing: 'Finalizando...', itemCount: '{count} artículo(s)',
    syncConflict: 'Esta compra cambió en otra pestaña o dispositivo. La copia local se conservó; revísela antes de continuar.',
    syncUnavailable: 'Las compras siguen guardadas en este dispositivo, pero la sincronización en línea no está disponible.',
    limitReached: 'Se alcanzó el límite de 20 compras simultáneas.',
  },
  fr: {
    title: 'Nouvel achat', subtitle: 'Enregistrez les matériaux, le stock et le paiement sans quitter la caisse.', back: 'Retour à la Caisse',
    newOrder: 'Nouvelle commande', code: 'Code', supplier: 'Fournisseur', value: 'Valeur', unnamedSupplier: 'Fournisseur non renseigné',
    deleteLabel: 'Supprimer la commande', deleteTitle: 'Supprimer cette commande ?',
    deleteDescription: '{code} de {supplier}, avec {items} article(s) et un total de {value}, sera supprimé.',
    keepOrder: 'Garder la commande', confirmDelete: 'Supprimer', financialTitle: 'Paiement et finances',
    noAccessTitle: 'Accès insuffisant', noAccessDescription: `Pour enregistrer un achat, l'utilisateur doit gérer le stock et les finances.`,
    finalize: `Finaliser l'achat`, finalizing: 'Finalisation...', itemCount: '{count} article(s)',
    syncConflict: `Cet achat a été modifié dans un autre onglet ou appareil. La copie locale a été conservée ; vérifiez-la avant de continuer.`,
    syncUnavailable: `Les achats restent enregistrés sur cet appareil, mais la synchronisation en ligne est indisponible.`,
    limitReached: 'La limite de 20 achats simultanés a été atteinte.',
  },
} as const;

export const getPdvPurchaseWorkspaceMessages = (locale: LocaleCode) => messages[locale];
