import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'dairyos_settings';

export interface FarmSettings {
  farmName: string;
  alerts: {
    emailNotifications: boolean;
    smsNotifications: boolean;
    pushNotifications: boolean;
    criticalOnly: boolean;
    soundEnabled: boolean;
  };
  thresholds: {
    heatStressTHI: number;
    lowMilkDropPct: number;
    lowBodyConditionScore: number;
    highLamenessScore: number;
    feedStockDaysWarning: number;
    feedStockDaysCritical: number;
    medicineExpiryDays: number;
    vaccinationDueDays: number;
  };
  display: {
    theme: 'light' | 'dark' | 'system';
    language: 'en' | 'fr' | 'sw';
    dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    currency: 'UGX' | 'USD' | 'EUR';
  };
  automation: {
    autoReorderFeed: boolean;
    autoAcknowledgeLowRisk: boolean;
    autoScheduleCheckups: boolean;
    dailyAdviceEnabled: boolean;
    continuousLearning: boolean;
  };
}

export const DEFAULT_SETTINGS: FarmSettings = {
  farmName: 'Greenfield Farm',
  alerts: {
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    criticalOnly: false,
    soundEnabled: true,
  },
  thresholds: {
    heatStressTHI: 72,
    lowMilkDropPct: 15,
    lowBodyConditionScore: 2,
    highLamenessScore: 3,
    feedStockDaysWarning: 7,
    feedStockDaysCritical: 3,
    medicineExpiryDays: 14,
    vaccinationDueDays: 7,
  },
  display: {
    theme: 'system',
    language: 'en',
    dateFormat: 'DD/MM/YYYY',
    currency: 'UGX',
  },
  automation: {
    autoReorderFeed: true,
    autoAcknowledgeLowRisk: false,
    autoScheduleCheckups: true,
    dailyAdviceEnabled: true,
    continuousLearning: true,
  },
};

function loadSettings(): FarmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        alerts: { ...DEFAULT_SETTINGS.alerts, ...(parsed.alerts || {}) },
        thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(parsed.thresholds || {}) },
        display: { ...DEFAULT_SETTINGS.display, ...(parsed.display || {}) },
        automation: { ...DEFAULT_SETTINGS.automation, ...(parsed.automation || {}) },
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

let listeners: Set<() => void> = new Set();
let currentSettings: FarmSettings = loadSettings();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function useSettings() {
  const [settings, setSettings] = useState<FarmSettings>(currentSettings);

  useEffect(() => {
    const handler = () => setSettings(loadSettings());
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const update = useCallback((path: string[], value: any) => {
    setSettings((prev) => {
      const next = { ...prev };
      let cur: any = next;
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
      cur[path[path.length - 1]] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      currentSettings = next;
      notifyListeners();
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      currentSettings = settings;
      notifyListeners();
      return true;
    } catch {
      return false;
    }
  }, [settings]);

  const reset = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    currentSettings = DEFAULT_SETTINGS;
    setSettings(DEFAULT_SETTINGS);
    notifyListeners();
  }, []);

  return { settings, update, save, reset };
}
