/**
 * Histórico (Recentes) e Favoritos das Ferramentas do Técnico.
 *
 * Persistência 100% local (localStorage) — é preferência por aparelho, offline-first,
 * sem banco. Funções puras read/write; o hook `useToolHistory` (mesmo arquivo) dá
 * reatividade simples via evento custom, pra a aba Início atualizar ao voltar.
 *
 * Chaves:
 *   tt:recentes:conversao  → pares de conversão recentes
 *   tt:recentes:modelos    → modelos de equipamento abertos recentemente
 *   tt:favoritos:modelos   → modelos favoritados (estrela)
 *   tt:favoritos:conversao → pares de conversão favoritados (opcional)
 */

import type { ConversaoCategoria } from '@/lib/conversoes';

const CAP = 6;

const KEYS = {
  recentesConversao: 'tt:recentes:conversao',
  recentesModelos: 'tt:recentes:modelos',
  favoritosModelos: 'tt:favoritos:modelos',
  favoritosConversao: 'tt:favoritos:conversao',
} as const;

/** Evento disparado a cada escrita, pro hook re-ler sem polling. */
const EVENT = 'tt-history-changed';

// ─────────────────────────────── Tipos ───────────────────────────────

export interface ConversaoRecente {
  categoria: ConversaoCategoria;
  /** code da unidade de origem. */
  de: string;
  /** code da unidade de destino. */
  para: string;
}

export interface ModeloRecente {
  modelId: string;
  modelName: string;
  brandName: string;
}

// ─────────────────────────── Helpers internos ───────────────────────────

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, list: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* localStorage cheio/indisponível — silencioso, é só conveniência. */
  }
}

/** Insere no topo, remove duplicata pelo predicado e capa em CAP. */
function pushTop<T>(list: T[], item: T, sameAs: (a: T, b: T) => boolean): T[] {
  const semDup = list.filter((x) => !sameAs(x, item));
  return [item, ...semDup].slice(0, CAP);
}

const mesmaConversao = (a: ConversaoRecente, b: ConversaoRecente) =>
  a.categoria === b.categoria && a.de === b.de && a.para === b.para;

const mesmoModelo = (a: ModeloRecente, b: ModeloRecente) => a.modelId === b.modelId;

// ──────────────────────────── Recentes: leitura ────────────────────────────

export function getRecentesConversao(): ConversaoRecente[] {
  return read<ConversaoRecente>(KEYS.recentesConversao);
}

export function getRecentesModelos(): ModeloRecente[] {
  return read<ModeloRecente>(KEYS.recentesModelos);
}

// ──────────────────────────── Recentes: escrita ────────────────────────────

export function registrarConversaoRecente(item: ConversaoRecente): void {
  if (!item.de || !item.para || item.de === item.para) return;
  const atual = getRecentesConversao();
  write(KEYS.recentesConversao, pushTop(atual, item, mesmaConversao));
}

export function registrarModeloRecente(item: ModeloRecente): void {
  if (!item.modelId) return;
  const atual = getRecentesModelos();
  write(KEYS.recentesModelos, pushTop(atual, item, mesmoModelo));
}

// ──────────────────────────── Favoritos: modelos ────────────────────────────

export function getFavoritosModelos(): ModeloRecente[] {
  return read<ModeloRecente>(KEYS.favoritosModelos);
}

export function isModeloFavorito(modelId: string): boolean {
  return getFavoritosModelos().some((m) => m.modelId === modelId);
}

/** Liga/desliga o favorito do modelo. Retorna o novo estado (true = favoritado). */
export function toggleModeloFavorito(item: ModeloRecente): boolean {
  const atual = getFavoritosModelos();
  const jaTem = atual.some((m) => m.modelId === item.modelId);
  if (jaTem) {
    write(KEYS.favoritosModelos, atual.filter((m) => m.modelId !== item.modelId));
    return false;
  }
  write(KEYS.favoritosModelos, [item, ...atual]);
  return true;
}

// ──────────────────────── Favoritos: conversão (opcional) ────────────────────────

export function getFavoritosConversao(): ConversaoRecente[] {
  return read<ConversaoRecente>(KEYS.favoritosConversao);
}

export function isConversaoFavorita(item: ConversaoRecente): boolean {
  return getFavoritosConversao().some((c) => mesmaConversao(c, item));
}

/** Liga/desliga o favorito do par de conversão. Retorna o novo estado. */
export function toggleConversaoFavorita(item: ConversaoRecente): boolean {
  if (!item.de || !item.para || item.de === item.para) return false;
  const atual = getFavoritosConversao();
  const jaTem = atual.some((c) => mesmaConversao(c, item));
  if (jaTem) {
    write(KEYS.favoritosConversao, atual.filter((c) => !mesmaConversao(c, item)));
    return false;
  }
  write(KEYS.favoritosConversao, [item, ...atual]);
  return true;
}

// ─────────────────────────────── Hook ───────────────────────────────

import { useSyncExternalStore } from 'react';

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb); // outra aba/aparelho via mesmo browser
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

/**
 * Snapshot reativo de Recentes/Favoritos. Re-renderiza ao gravar qualquer item
 * (via evento custom) ou ao mudar o storage em outra aba.
 */
export interface ToolHistorySnapshot {
  recentesConversao: ConversaoRecente[];
  recentesModelos: ModeloRecente[];
  favoritosModelos: ModeloRecente[];
  favoritosConversao: ConversaoRecente[];
}

let cache: ToolHistorySnapshot | null = null;
let cacheKey = '';

function getSnapshot(): ToolHistorySnapshot {
  // Memoiza por conteúdo serializado pra useSyncExternalStore não loopar
  // (precisa devolver a MESMA referência quando nada mudou).
  const rc = localStorage.getItem(KEYS.recentesConversao) ?? '';
  const rm = localStorage.getItem(KEYS.recentesModelos) ?? '';
  const fm = localStorage.getItem(KEYS.favoritosModelos) ?? '';
  const fc = localStorage.getItem(KEYS.favoritosConversao) ?? '';
  const key = `${rc}|${rm}|${fm}|${fc}`;
  if (cache && key === cacheKey) return cache;
  cacheKey = key;
  cache = {
    recentesConversao: getRecentesConversao(),
    recentesModelos: getRecentesModelos(),
    favoritosModelos: getFavoritosModelos(),
    favoritosConversao: getFavoritosConversao(),
  };
  return cache;
}

const EMPTY: ToolHistorySnapshot = {
  recentesConversao: [],
  recentesModelos: [],
  favoritosModelos: [],
  favoritosConversao: [],
};

export function useToolHistory(): ToolHistorySnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
