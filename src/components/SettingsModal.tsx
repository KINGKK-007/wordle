import React from 'react';
import { Modal } from './Modal';

interface Settings {
  hardMode: boolean;
  highContrast: boolean;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onToggle: (key: keyof Settings) => void;
  hasStarted: boolean; // if a game has started, hard mode can't be changed
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onToggle,
  hasStarted,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings" aria-label="Settings">
      <div className="setting-row">
        <div className="setting-row__info">
          <div className="setting-row__label">Hard Mode</div>
          <div className="setting-row__desc">
            {hasStarted
              ? 'Cannot change during a game'
              : 'Any revealed hints must be used in subsequent guesses'}
          </div>
        </div>
        <label className="toggle" aria-label="Toggle hard mode">
          <input
            type="checkbox"
            checked={settings.hardMode}
            onChange={() => !hasStarted && onToggle('hardMode')}
            disabled={hasStarted}
          />
          <div className="toggle__track">
            <div className="toggle__thumb" />
          </div>
        </label>
      </div>

      <div className="setting-row">
        <div className="setting-row__info">
          <div className="setting-row__label">High Contrast Mode</div>
          <div className="setting-row__desc">For improved color vision: orange = correct, blue = present</div>
        </div>
        <label className="toggle" aria-label="Toggle high contrast mode">
          <input
            type="checkbox"
            checked={settings.highContrast}
            onChange={() => onToggle('highContrast')}
          />
          <div className="toggle__track">
            <div className="toggle__thumb" />
          </div>
        </label>
      </div>

      <div className="setting-row">
        <div className="setting-row__info">
          <div className="setting-row__label">Dark Theme</div>
          <div className="setting-row__desc">Dark theme is always active</div>
        </div>
        <label className="toggle" aria-label="Dark theme (always on)">
          <input type="checkbox" checked={true} readOnly />
          <div className="toggle__track">
            <div className="toggle__thumb" />
          </div>
        </label>
      </div>

      <div style={{ paddingTop: 20, borderTop: '1px solid var(--header-border)', marginTop: 8 }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Custom Wordle — A fan-made Wordle clone
        </p>
      </div>
    </Modal>
  );
};
