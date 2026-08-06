// The 8 self-identification options shown at signup. Only 5 (farm_owner + the 4
// team-member roles) map onto something the permissions system already understands —
// dairy_cooperative and research_institution deliberately reuse the *owner* flow with
// different copy rather than claiming a multi-farm-org or read-only-observer capability
// that doesn't exist yet; student_demo gets an auto-provisioned sandbox instead of an
// empty farm, since "give me something to explore" is what picking it actually means.
export type AccountType =
  | 'farm_owner' | 'dairy_cooperative' | 'research_institution'
  | 'farm_manager' | 'veterinarian' | 'farm_worker' | 'accountant'
  | 'student_demo';

export const ACCOUNT_TYPES: AccountType[] = [
  'farm_owner', 'dairy_cooperative', 'research_institution',
  'farm_manager', 'veterinarian', 'farm_worker', 'accountant',
  'student_demo',
];

export type AccountFlow = 'owner' | 'team_member' | 'demo';

export interface AccountTypeConfig {
  flow: AccountFlow;
  label: string;
  /** What to call the thing they're creating — "farm" for a literal farm owner, but a
   *  cooperative or research institution isn't really "a farm" even though it uses the
   *  identical create-farm mechanics underneath. */
  framing: string;
  /** The real role name (from the roles table) this hints toward once a farm actually
   *  invites them — informational only; it grants nothing by itself. */
  hintRole?: 'administrator' | 'farm_manager' | 'veterinarian' | 'worker' | 'accountant';
}

export const ACCOUNT_TYPE_CONFIG: Record<AccountType, AccountTypeConfig> = {
  farm_owner: { flow: 'owner', label: 'Farm Owner', framing: 'farm' },
  dairy_cooperative: { flow: 'owner', label: 'Dairy Cooperative', framing: 'cooperative' },
  research_institution: { flow: 'owner', label: 'Research Institution', framing: 'research site' },
  farm_manager: { flow: 'team_member', label: 'Farm Manager', framing: 'farm', hintRole: 'farm_manager' },
  veterinarian: { flow: 'team_member', label: 'Veterinarian', framing: 'farm', hintRole: 'veterinarian' },
  farm_worker: { flow: 'team_member', label: 'Farm Worker', framing: 'farm', hintRole: 'worker' },
  accountant: { flow: 'team_member', label: 'Accountant', framing: 'farm', hintRole: 'accountant' },
  student_demo: { flow: 'demo', label: 'Student / Demo User', framing: 'demo farm' },
};
