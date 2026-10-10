import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  message: string;
  duration?: number;
}

let toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, duration = 1500) => {
    const id = `toast-${++toastCounter}`;
    setToasts(prev => [...prev, { id, message, duration }]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration + 200); // extra time for exit animation
    
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}
