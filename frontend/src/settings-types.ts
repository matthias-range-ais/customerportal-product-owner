// Shared between App.tsx (owns the settings snapshot + header summary) and
// SettingsDialog.tsx (the environment-configuration modal) so both stay in sync.
export type Environment = 'test' | 'prod'

export interface SettingsSnapshot {
  environments: Record<Environment, { configured: boolean }>
  active: Environment | null
  activeUsername: string | null
}

export const ENVIRONMENTS: Environment[] = ['test', 'prod']

export const ENVIRONMENT_LABELS: Record<Environment, string> = {
  test: 'Test',
  prod: 'Produktion',
}
