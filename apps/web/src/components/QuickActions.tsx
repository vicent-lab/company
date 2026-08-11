import { useState } from 'react';
import { Plus } from 'lucide-react';

export interface QuickAction {
  key: string;
  label: string;
  icon: any;
  route: string;
  description: string;
}

export function QuickActions({ actions, onSelect, triggerLabel = 'Quick Actions', isMobile = false, onClose }: { 
  actions: QuickAction[]; 
  onSelect: (route: string) => void; 
  triggerLabel?: string;
  isMobile?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const handleSelect = (route: string) => {
    onSelect(route);
    setOpen(false);
    onClose?.();
  };

  if (isMobile) {
    return (
      <div style={{ position: 'fixed', bottom: 76, left: 16, zIndex: 81 }}>
        <button
          className="fab fab-quick"
          onClick={() => setOpen((v) => !v)}
          aria-label={triggerLabel}
          aria-expanded={open}
        >
          <Plus size={22} />
        </button>
        {open && (
          <div className="more-drawer-backdrop" onClick={() => { setOpen(false); onClose?.(); }}>
            <div className="more-drawer" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '50vh' }}>
              <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <b>Quick Actions</b>
                <button className="btn ghost sm" onClick={() => { setOpen(false); onClose?.(); }}>✕</button>
              </div>
              <div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.key}
                      className="btn sm"
                      onClick={() => handleSelect(action.route)}
                      style={{ justifyContent: 'flex-start', gap: 8 }}
                    >
                      {Icon && <Icon size={16} />}
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="btn sm"
        onClick={() => setOpen((v) => !v)}
        aria-label={triggerLabel}
        aria-expanded={open}
      >
        {open ? '✕' : <><Plus size={16} /> {triggerLabel}</>}
      </button>
      {open && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'transparent',
              zIndex: 90,
            }}
            onClick={() => { setOpen(false); onClose?.(); }}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 8,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: 'var(--shadow)',
              padding: 8,
              minWidth: 220,
              zIndex: 91,
              maxHeight: '60vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={() => setOpen(false)}
          >
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  className="nav-item"
                  style={{ justifyContent: 'flex-start', padding: '10px 12px', fontSize: 14, borderRadius: 8, marginBottom: 2 }}
                  onClick={() => handleSelect(action.route)}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  {Icon && <Icon size={16} style={{ marginRight: 8, flexShrink: 0 }} />}
                  <span style={{ flex: 1, textAlign: 'left' }}>{action.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
