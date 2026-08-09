import React from 'react';

interface RiskIndicatorProps {
  label: string;
  value: string | number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  trend?: 'up' | 'down' | 'stable';
}

const severityConfig = {
  low: { color: '#10b981', bg: '#f0fdf4', label: 'Low' },
  medium: { color: '#f59e0b', bg: '#fffbeb', label: 'Medium' },
  high: { color: '#f97316', bg: '#fff7ed', label: 'High' },
  critical: { color: '#ef4444', bg: '#fef2f2', label: 'Critical' },
};

export function RiskIndicator({ label, value, severity, trend }: RiskIndicatorProps) {
  const config = severityConfig[severity];

  return (
    <div style={{
      background: config.bg,
      border: `1px solid ${config.color}33`,
      borderLeft: `4px solid ${config.color}`,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: config.color, background: `${config.color}22`, padding: '2px 8px', borderRadius: 12 }}>
          {config.label}
        </span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
        {value}
        {trend && (
          <span style={{ fontSize: 12, marginLeft: 8, color: trend === 'up' ? '#ef4444' : trend === 'down' ? '#10b981' : '#6b7280' }}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
    </div>
  );
}
