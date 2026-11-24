/** Identificação consistente no cabeçalho dos fluxos de documentos numerados. */
export function DocumentNumberStatus({ number, pending = false, unavailable = false, reserved = false }: {
  number?: number | null;
  pending?: boolean;
  unavailable?: boolean;
  reserved?: boolean;
}) {
  return (
    <span className="text-xs font-semibold text-foreground sm:text-sm" aria-live="polite"
      title={number != null && reserved ? 'Número reservado para este documento; será mantido ao salvar.' : undefined}>
      {number != null ? `Nº ${number}` : unavailable ? 'Número indisponível' : pending ? 'Gerando número…' : 'Número ao salvar'}
    </span>
  );
}
