export const APP_VERSION = "1.9.25";

export const VERSION_NOTES = "Bug crítico corrigido: usuário Master (admin da empresa) tomava 'Você não tem permissão' ao tentar cadastrar item de estoque, cliente, equipamento e outros — em ~30 telas do sistema. Causa era uma etiqueta interna de empresa que o sistema esquecia de mandar junto. Migration única (com trigger no banco) garante que essa etiqueta seja preenchida automaticamente em TODAS as operações de cadastro. Previne qualquer erro deste tipo no futuro.";
