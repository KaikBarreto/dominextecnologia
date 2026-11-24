/** Só a identidade informada pela recuperação pode levar os anexos à cópia. */
export function transferRecoveredDraftAttachments<T>(current: Record<string, T[]>, resolution: { id: string; localCopyId: string | null }): Record<string, T[]> {
  const { id, localCopyId } = resolution;
  if (!localCopyId || localCopyId === id || !current[id]?.length) return current;
  const next = { ...current, [localCopyId]: [...(current[localCopyId] ?? []), ...current[id]] };
  delete next[id];
  return next;
}
