/**
 * Central role label definitions for BAKAWATCH.
 * Update here to reflect changes across the entire UI.
 */
export const ROLE_LABELS: Record<string, string> = {
  admin:        'Super Admin',
  staff:        'MENRO Admin',
  menro:        'MENRO Admin',
  field_worker: 'Volunteer / Bantay Bakawan',
  volunteer:    'Participant',
  denr:         'DENR Evaluator',
  evaluator:    'Research Evaluator',
  user:         'Community Member',
  public:       'Community Member',
}

export const ROLE_SHORT: Record<string, string> = {
  admin:        'Super Admin',
  staff:        'MENRO Admin',
  menro:        'MENRO Admin',
  field_worker: 'Bantay Bakawan',
  volunteer:    'Participant',
  denr:         'DENR',
  evaluator:    'Evaluator',
  user:         'Community Member',
  public:       'Community Member',
}

export function getRoleLabel(role?: string, short = false): string {
  if (!role) return 'User'
  return (short ? ROLE_SHORT : ROLE_LABELS)[role] ?? role
}
