export function canLoadPdvPreorderWorkspace(input: {
  adminOrManager: boolean;
  hasPdvScreen: boolean;
  hasPdvOrdersScreen: boolean;
}): boolean {
  return input.adminOrManager || input.hasPdvScreen || input.hasPdvOrdersScreen;
}
