import React, { useState } from 'react';
import { apiSend } from '../../api';

interface FeedbackData {
  insight_id: string;
  helpful: boolean | null;
  accurate: boolean | null;
  urgent: boolean | null;
  note: string;
}

interface AIFeedbackProps {
  messageId: string;
  onFeedbackSubmitted?: () => void;
}

export function AIFeedback({ messageId, onFeedbackSubmitted }: AIFeedbackProps) {
  const [feedback, setFeedback] = useState<FeedbackData>({
    insight_id: messageId,
    helpful: null,
    accurate: null,
    urgent: null,
    note: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submitFeedback = async () => {
    if (feedback.helpful === null || feedback.accurate === null) return;
    setLoading(true);
    try {
      await apiSend('/intelligence/feedback', 'POST', feedback);
      setSubmitted(true);
      onFeedbackSubmitted?.();
    } catch (e) {
      console.error('Failed to submit feedback', e);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 12, color: '#166534' }}>
        ✅ Thank you for your feedback! This helps the AI learn and improve.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>RATE THIS RESPONSE</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>Helpful?</span>
          <button
            onClick={() => setFeedback((f) => ({ ...f, helpful: true }))}
            style={{
              padding: '3px 10px',
              border: `1px solid ${feedback.helpful === true ? '#10b981' : '#d1d5db'}`,
              borderRadius: 4,
              background: feedback.helpful === true ? '#f0fdf4' : '#fff',
              color: feedback.helpful === true ? '#166534' : '#374151',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            👍 Yes
          </button>
          <button
            onClick={() => setFeedback((f) => ({ ...f, helpful: false }))}
            style={{
              padding: '3px 10px',
              border: `1px solid ${feedback.helpful === false ? '#ef4444' : '#d1d5db'}`,
              borderRadius: 4,
              background: feedback.helpful === false ? '#fef2f2' : '#fff',
              color: feedback.helpful === false ? '#991b1b' : '#374151',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            👎 No
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>Accurate?</span>
          <button
            onClick={() => setFeedback((f) => ({ ...f, accurate: true }))}
            style={{
              padding: '3px 10px',
              border: `1px solid ${feedback.accurate === true ? '#10b981' : '#d1d5db'}`,
              borderRadius: 4,
              background: feedback.accurate === true ? '#f0fdf4' : '#fff',
              color: feedback.accurate === true ? '#166534' : '#374151',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            ✅ Yes
          </button>
          <button
            onClick={() => setFeedback((f) => ({ ...f, accurate: false }))}
            style={{
              padding: '3px 10px',
              border: `1px solid ${feedback.accurate === false ? '#ef4444' : '#d1d5db'}`,
              borderRadius: 4,
              background: feedback.accurate === false ? '#fef2f2' : '#fff',
              color: feedback.accurate === false ? '#991b1b' : '#374151',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            ❌ No
          </button>
        </div>
      </div>
      <button
        onClick={submitFeedback}
        disabled={feedback.helpful === null || feedback.accurate === null || loading}
        style={{
          padding: '5px 14px',
          border: 'none',
          borderRadius: 6,
          background: feedback.helpful === null || feedback.accurate === null ? '#9ca3af' : '#3b82f6',
          color: '#fff',
          fontSize: 12,
          cursor: feedback.helpful === null || feedback.accurate === null ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </div>
  );
}
