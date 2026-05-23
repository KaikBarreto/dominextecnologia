import { Navigate } from 'react-router-dom';

/**
 * Tela antiga de PMOC.
 *
 * v1.9.0 (Onda A): unificamos PMOC dentro de Contratos. O contrato passa a ter
 * o flag `is_pmoc`, e o cadastro de Responsável Técnico vive em uma tela própria
 * (`/responsaveis-tecnicos`). Mantemos a rota `/pmoc` por compatibilidade — qualquer
 * link salvo continua funcionando e cai direto na aba PMOC dos contratos.
 *
 * Quando a rede tiver migrado 100% (release 1.9.3), esse arquivo morre.
 */
export default function PMOC() {
  return <Navigate to="/contratos?tipo=pmoc" replace />;
}
