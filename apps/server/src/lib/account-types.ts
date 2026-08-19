// The four supported self-identification options shown at signup.
export type AccountType =
  | 'farm_owner' | 'farm_manager' | 'veterinarian' | 'farm_worker';

export const ACCOUNT_TYPES: AccountType[] = [
  'farm_owner', 'farm_manager', 'veterinarian', 'farm_worker',
];

export type AccountFlow = 'owner' | 'team_member';

export interface AccountTypeConfig {
  flow: AccountFlow;
  label: string;
  /** What to call the thing they're creating. */
  framing: string;
  /** The real role name (from the roles table) this hints toward once a farm actually
   *  invites them — informational only; it grants nothing by itself. */
  hintRole?: 'administrator' | 'farm_manager' | 'veterinarian' | 'worker';
}

export const ACCOUNT_TYPE_CONFIG: Record<AccountType, AccountTypeConfig> = {
  farm_owner: { flow: 'owner', label: 'Farm Owner', framing: 'farm' },
  farm_manager: { flow: 'team_member', label: 'Farm Manager', framing: 'farm', hintRole: 'farm_manager' },
  veterinarian: { flow: 'team_member', label: 'Veterinarian', framing: 'farm', hintRole: 'veterinarian' },
  farm_worker: { flow: 'team_member', label: 'Farm Worker', framing: 'farm', hintRole: 'worker' },
};
