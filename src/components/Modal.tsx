import React, { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  'aria-label'?: string;
}

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  'aria-label': ariaLabel,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = overlayRef.current;
    const isTopDialog = () => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      return dialogs[dialogs.length - 1] === overlay;
    };
    const focusable = () =>
      Array.from(overlay?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
      );
    closeButtonRef.current?.focus();
    const keyHandler = (event: KeyboardEvent) => {
      if (!isTopDialog()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          overlay?.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first || !overlay?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !overlay?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const focusHandler = (event: FocusEvent) => {
      if (isTopDialog() && event.target instanceof Node && !overlay?.contains(event.target))
        closeButtonRef.current?.focus();
    };
    document.addEventListener('keydown', keyHandler);
    document.addEventListener('focusin', focusHandler);
    return () => {
      document.removeEventListener('keydown', keyHandler);
      document.removeEventListener('focusin', focusHandler);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || title || 'Dialog'}
      tabIndex={-1}
    >
      <div className="modal">
        <button ref={closeButtonRef} className="modal__close" onClick={onClose} aria-label="Close">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {title && <h2 className="modal__title">{title}</h2>}
        {children}
      </div>
    </div>
  );
};
