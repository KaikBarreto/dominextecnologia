import { useEffect, useState } from 'react';

/**
 * Drop-in do useState que persiste o valor em sessionStorage.
 *
 * Por quê: a tela "Área do Técnico™" navega por ABAS (não rotas) e
 * renderiza cada ferramenta condicionalmente. Trocar de aba DESMONTA o
 * componente, então o useState local morre e o técnico perde o que digitou /
 * selecionou. Guardando em sessionStorage, o input sobrevive à troca de aba
 * dentro da mesma sessão e some quando o app/aba do navegador fecha (que é
 * exatamente "cache na sessão" — não polui o dispositivo como o localStorage).
 *
 * Defensivo: todo acesso ao sessionStorage é protegido (modo privado, quota,
 * SSR). Se falhar, degrada para um useState normal sem nunca lançar.
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  // Lê o storage só na 1ª montagem (lazy initializer).
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // Storage indisponível/JSON inválido — cai no valor inicial.
    }
    return initialValue;
  });

  // Persiste a cada mudança de valor. Como observa o valor JÁ resolvido do
  // estado, lida naturalmente com setX(prev => ...) (forma funcional do setter).
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Falha silenciosa: a UI segue funcionando como useState comum.
    }
  }, [key, value]);

  return [value, setValue];
}
