import React from 'react';

interface ConfidenceGaugeProps {
  value: number;
  size?: number;
}

export function ConfidenceGauge({ value, size = 120 }: ConfidenceGaugeProps) {
  const percentage = value * 100;
  const rotation = (percentage / 100) * 180 - 90;
  const color = percentage >= 80 ? '#10b981' : percentage >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size / 2} viewBox="0 0 200 100">
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${percentage * 2.51} 251`}
        />
        <circle cx="100" cy="100" r="6" fill="#374151" />
        <line
          x1="100"
          y1="100"
          x2={100 + 70 * Math.cos((rotation * Math.PI) / 180)}
          y2={100 + 70 * Math.sin((rotation * Math.PI) / 180)}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{percentage.toFixed(0)}%</div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>Confidence</div>
    </div>
  );
}
