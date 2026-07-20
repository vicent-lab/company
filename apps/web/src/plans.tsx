import { createContext, useContext, useState } from 'react';

export type PlanName = 'Starter' | 'Pro' | 'Enterprise';

export interface Plan {
  name: PlanName;
  price: string;
  per: string;
  feats: string[];
  cta: string;
  feat?: boolean;
}

export const PLANS: Plan[] = [
  { name: 'Starter', price: '$29', per: '/mo', feats: ['Up to 50 cows', 'Dashboard & KPIs', 'QR profiles', 'Email support'], cta: 'Start free' },
  { name: 'Pro', price: '$79', per: '/mo', feats: ['Up to 500 cows', 'AI assistant & predictions', 'Multi-farm', 'Financial & analytics', 'Weather insights'], feat: true, cta: 'Start free trial' },
  { name: 'Enterprise', price: 'Custom', per: '', feats: ['Unlimited cows', 'RBAC & 2FA', 'API & integrations', 'Dedicated manager'], cta: 'Contact sales' },
];

export const PLAN_FEATURES: Record<PlanName, string[]> = {
  Starter: ['dashboard', 'cows', 'cow', 'map', 'gallery', 'schedule', 'management'],
  Pro: ['dashboard', 'cows', 'cow', 'map', 'ai', 'alerts', 'predict', 'analytics', 'finance', 'weather', 'sustainability', 'gallery', 'search', 'gamification', 'schedule', 'tasks', 'management'],
  Enterprise: ['dashboard', 'cows', 'cow', 'map', 'ai', 'alerts', 'predict', 'analytics', 'finance', 'weather', 'sustainability', 'gallery', 'customers', 'team', 'tasks', 'schedule', 'search', 'gamification', 'management', 'breeding'],
};

interface PlanContextValue {
  plan: PlanName;
  setPlan: (plan: PlanName) => void;
  canAccess: (feature: string) => boolean;
  upgradeModal: { open: boolean; feature?: string };
  setUpgradeModal: (state: { open: boolean; feature?: string }) => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<PlanName>(() => {
    const saved = localStorage.getItem('selectedPlan') as PlanName | null;
    if (saved && ['Starter', 'Pro', 'Enterprise'].includes(saved)) return saved;
    return 'Pro';
  });
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; feature?: string }>({ open: false });

  const canAccess = (feature: string) => PLAN_FEATURES[plan]?.includes(feature) ?? false;

  return (
    <PlanContext.Provider value={{ plan, setPlan, canAccess, upgradeModal, setUpgradeModal }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}
