import React from 'react';

interface ActionCardProps {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
  assignedTo?: string;
  onAction?: () => void;
}

const priorityConfig = {
  high: { color: '#ef4444', bg: '#fef2f2' },
  medium: { color: '#f59e0b', bg: '#fffbeb' },
  low: { color: '#10b981', bg: '#f0fdf4' },
};

export function ActionCard({ title, description, priority, dueDate, assignedTo, onAction }: ActionCardProps) {
  const config = priorityConfig[priority];

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderLeft: `4px solid ${config.color}`,
      borderRadius: 8,
      padding: 14,
      marginBottom: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{title}</div>
        <span style={{ fontSize: 11, color: config.color, background: config.bg, padding: '2px 8px', borderRadius: 12, marginLeft: 8 }}>
          {priority}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 8, lineHeight: 1.5 }}>{description}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: '#6b7280' }}>
          {dueDate && <span style={{ marginRight: 12 }}>📅 {dueDate}</span>}
          {assignedTo && <span>👤 {assignedTo}</span>}
        </div>
        {onAction && (
          <button
            onClick={onAction}
            style={{
              padding: '4px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: '#fff',
              color: '#374151',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Take Action
          </button>
        )}
      </div>
    </div>
  );
}
