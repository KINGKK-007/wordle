import { useEffect } from 'react';

export function useKeyboardInput(
  onKey: (key: string) => void,
  disabled = false
) {
  useEffect(() => {
    if (disabled) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if modifier keys are held (except shift which is fine for letters)
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      
      const key = e.key;
      
      if (key === 'Enter') {
        e.preventDefault();
        onKey('Enter');
      } else if (key === 'Backspace' || key === 'Delete') {
        e.preventDefault();
        onKey('Backspace');
      } else if (/^[a-zA-Z]$/.test(key)) {
        onKey(key.toUpperCase());
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onKey, disabled]);
}
