import { useEffect, useRef } from 'react';

/** Shared by the setter, solo board and Duel: never steal keys from a dialog or form. */
export function shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.repeat)
    return true;
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return true;
  const target = event.target instanceof Element ? event.target : document.activeElement;
  if (
    target?.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    )
  )
    return true;
  // Focus returns to the dialog's opener. Letters must still reach the board;
  // Enter and Space retain the focused button/link's native activation behavior.
  return (event.key === 'Enter' || event.key === ' ') && !!target?.closest('button, a');
}

export function useKeyboardInput(onKey: (key: string) => void, disabled = false) {
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  useEffect(() => {
    if (disabled) return;
    const handler = (event: KeyboardEvent) => {
      if (shouldIgnoreKeyboardEvent(event)) return;
      const key = event.key;
      if (key === 'Enter' || key === 'Backspace' || key === 'Delete') {
        event.preventDefault();
        keyRef.current(key === 'Enter' ? 'Enter' : 'Backspace');
      } else if (/^[a-zA-Z]$/.test(key)) keyRef.current(key.toUpperCase());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled]);
}
