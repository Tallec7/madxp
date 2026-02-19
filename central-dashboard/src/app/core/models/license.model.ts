export type LicenseStatus = 'VALID' | 'WARNING' | 'GRACE_PERIOD' | 'CONNECTION_WARNING' | 'BLOCKED';

export interface LicenseState {
  status: LicenseStatus;
  reason?: string;
  subscriptionEnd?: string;
  subscriptionPlan?: string;
  daysLeft?: number;
  daysExpired?: number;
  daysSinceCheck?: number;
  canAutoUnblock?: boolean;
  messageRemote?: string;
  needsConnection?: boolean;
}
