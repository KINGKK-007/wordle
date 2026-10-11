import { useState, useCallback, useEffect, useRef } from 'react';

export interface Toast {
  id: string;
  message: string;
  duration?: number;
}
let toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);
  const showToast = useCallback(
    (message: string, duration = 1500) => {
      const id = `toast-${++toastCounter}`;
      setToasts((previous) => [...previous, { id, message, duration }]);
      const timer = setTimeout(() => removeToast(id), duration + 200);
      timersRef.current.set(id, timer);
      return id;
    },
    [removeToast],
  );
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);
  return { toasts, showToast, removeToast };
}
