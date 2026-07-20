import { usePlan, PLAN_FEATURES } from './plans';

export { usePlan } from './plans';

export function PlanGuard({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { canAccess, upgradeModal, setUpgradeModal, plan, setPlan } = usePlan();

  if (!canAccess(feature)) {
    return (
      <>
        <div className="card" style={{ padding: 40, textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>Upgrade to {Object.keys(PLAN_FEATURES).find((p) => PLAN_FEATURES[p as keyof typeof PLAN_FEATURES].includes(feature))} plan</h2>
          <p className="muted" style={{ fontSize: 15, maxWidth: 480, margin: '0 auto 24px' }}>
            This feature is available on the {Object.keys(PLAN_FEATURES).find((p) => PLAN_FEATURES[p as keyof typeof PLAN_FEATURES].includes(feature))} plan. Upgrade now to unlock it.
          </p>
          <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
            <button className="btn gold" onClick={() => { setPlan('Pro'); window.location.hash = '#/pricing'; }}>View plans & upgrade</button>
            <button className="btn ghost" onClick={() => window.history.back()}>Go back</button>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
}
