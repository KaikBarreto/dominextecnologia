const EMPTY_FOREIGN_KEY_VALUES = new Set(['', '__none__', '_none', 'none']);

export function normalizeOptionalForeignKey(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return EMPTY_FOREIGN_KEY_VALUES.has(trimmed.toLowerCase()) ? null : trimmed;
}

export function normalizeOptionalForeignKeys<T extends Record<string, any>>(
  payload: T,
  keys: Array<keyof T>
): T {
  const normalized = { ...payload } as T;

  keys.forEach((key) => {
    (normalized as Record<string, any>)[key as string] = normalizeOptionalForeignKey(
      (normalized as Record<string, any>)[key as string]
    );
  });

  return normalized;
}
