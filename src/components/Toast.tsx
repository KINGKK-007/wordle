import React, { useEffect, useState } from 'react';
import type { Toast } from '../hooks/useToast';

interface ToastContainerProps {
  toasts: Toast[];
}

interface ToastItemState {
  id: string;
  message: string;
  exiting: boolean;
  duration: number;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => {
  const [items, setItems] = useState<ToastItemState[]>([]);

  useEffect(() => {
    toasts.forEach(toast => {
      setItems(prev => {
        if (prev.find(i => i.id === toast.id)) return prev;
        const newItem: ToastItemState = {
          id: toast.id,
          message: toast.message,
          exiting: false,
          duration: toast.duration ?? 1500,
        };
        return [...prev, newItem];
      });

      // Mark as exiting shortly before removal
      setTimeout(() => {
        setItems(prev => prev.map(i => i.id === toast.id ? { ...i, exiting: true } : i));
      }, (toast.duration ?? 1500) - 200);

      // Remove
      setTimeout(() => {
        setItems(prev => prev.filter(i => i.id !== toast.id));
      }, (toast.duration ?? 1500) + 200);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toasts.length]);

  return (
    <div className="toast-container" aria-live="assertive" aria-atomic="true">
      {items.map(item => (
        <div
          key={item.id}
          className={`toast${item.exiting ? ' toast--exiting' : ''}`}
          role="alert"
        >
          {item.message}
        </div>
      ))}
    </div>
  );
};
