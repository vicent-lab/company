import React from 'react';

interface FollowUpSuggestionsProps {
  suggestions: string[];
  onSelect: (question: string) => void;
  disabled?: boolean;
}

export function FollowUpSuggestions({ suggestions, onSelect, disabled }: FollowUpSuggestionsProps) {
  if (!suggestions.length) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, fontWeight: 600 }}>SUGGESTED FOLLOW-UPS</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            onClick={() => onSelect(suggestion)}
            disabled={disabled}
            style={{
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 16,
              background: '#fff',
              color: '#374151',
              fontSize: 13,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.background = '#3b82f6';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.borderColor = '#3b82f6';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#fff';
              e.currentTarget.style.color = '#374151';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
