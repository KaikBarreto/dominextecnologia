import { describe, expect, it } from 'vitest';
import { isNfseTerminal } from './nfseStatus';

describe('status terminal de NFS-e', () => {
  it.each(['autorizada', 'rejeitada', 'cancelada', 'falhou', 'failed'])(
    'encerra o polling para %s',
    (status) => {
      expect(isNfseTerminal(status)).toBe(true);
    },
  );

  it.each(['pendente', 'processando', 'confirmacao_pendente', 'cancelamento_pendente'])(
    'mantém o polling para %s',
    (status) => {
      expect(isNfseTerminal(status)).toBe(false);
    },
  );
});
