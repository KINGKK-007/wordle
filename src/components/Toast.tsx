import React, { useEffect, useState } from 'react';
import type { Toast } from '../hooks/useToast';

const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), Math.max(0, (toast.duration ?? 1500) - 200));
    return () => clearTimeout(timer);
  }, [toast.duration]);
  return <div className={`toast${exiting ? ' toast--exiting' : ''}`} role="alert">{toast.message}</div>;
};

export const ToastContainer: React.FC<{ toasts: Toast[] }> = ({ toasts }) => (
  <div className="toast-container" aria-live="assertive" aria-atomic="false">
    {toasts.map(toast => <ToastItem key={toast.id} toast={toast} />)}
  </div>
);
