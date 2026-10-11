import React, { useCallback, useEffect, useState } from 'react';
import { Board } from './Board';
import { Keyboard } from './Keyboard';
import { ResultModal } from './ResultModal';
import { StatsModal } from './StatsModal';
import { HelpModal } from './HelpModal';
import { SettingsModal } from './SettingsModal';
import { useGame } from '../hooks/useGame';
import { useKeyboardInput } from '../hooks/useKeyboardInput';
import { loadStats, type GameStats } from '../utils/stats';
import { SOLO_GAME_STORAGE_KEY } from '../utils/gamePersistence';

interface Settings {
  hardMode: boolean;
  highContrast: boolean;
}
interface GameScreenProps {
  answer: string;
  mode: 'unlimited' | '2player';
  settings: Settings;
  onSettingsChange: (key: keyof Settings) => void;
  onToast: (msg: string, duration?: number) => void;
  onPlayAgain?: () => void;
  onSetNewWord?: () => void;
  onBackToMenu: () => void;
  showHelpOnMount?: boolean;
}

export const GameScreen: React.FC<GameScreenProps> = ({
  answer,
  mode,
  settings,
  onSettingsChange,
  onToast,
  onPlayAgain,
  onSetNewWord,
  onBackToMenu,
  showHelpOnMount = false,
}) => {
  const [openModal, setOpenModal] = useState<'result' | 'stats' | 'help' | 'settings' | null>(
    showHelpOnMount ? 'help' : null,
  );
  const [stats, setStats] = useState<GameStats>(() => loadStats(mode));
  const refreshStats = useCallback(() => setStats(loadStats(mode)), [mode]);
  const { state, handleKey, isInputDisabled } = useGame({
    answer,
    mode,
    hardMode: settings.hardMode,
    onToast,
    onWin: refreshStats,
    onLose: refreshStats,
    persistKey: mode === 'unlimited' ? SOLO_GAME_STORAGE_KEY : undefined,
  });
  const modalOpen = openModal !== null;
  useKeyboardInput(handleKey, isInputDisabled || modalOpen);
  useEffect(() => {
    if (state.status !== 'won' && state.status !== 'lost') return;
    const timer = setTimeout(() => {
      refreshStats();
      setOpenModal('result');
    }, 1800);
    return () => clearTimeout(timer);
  }, [state.status, refreshStats]);
  useEffect(() => {
    const handler = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const action: unknown = event.detail?.action;
      if (action === 'help' || action === 'settings') setOpenModal(action);
      if (action === 'stats') {
        refreshStats();
        setOpenModal('stats');
      }
    };
    window.addEventListener('header-action', handler);
    return () => window.removeEventListener('header-action', handler);
  }, [refreshStats]);
  const closeModal = () => setOpenModal(null);
  const modeLabel = mode === 'unlimited' ? 'Unlimited Mode' : 'Challenge from Player 1';
  return (
    <>
      <div className="game-mode-label" aria-label={modeLabel}>
        {modeLabel}
      </div>
      <Board
        guesses={state.guesses}
        currentGuess={state.currentGuess}
        evaluatedRows={state.evaluatedRows}
        shakingRow={state.shakingRow}
        flippingRow={state.flippingRow}
        bouncingRow={state.bouncingRow}
      />
      <Keyboard
        letterStates={state.activeLetterStates}
        onKey={handleKey}
        disabled={isInputDisabled || modalOpen}
      />
      <ResultModal
        isOpen={openModal === 'result'}
        onClose={closeModal}
        status={state.status === 'won' ? 'won' : state.status === 'lost' ? 'lost' : null}
        answer={state.answer}
        guessCount={state.guesses.length}
        evaluatedRows={state.evaluatedRows}
        mode={mode}
        highContrast={settings.highContrast}
        onPlayAgain={onPlayAgain}
        onSetNewWord={onSetNewWord}
        onBackToMenu={onBackToMenu}
        onShowToast={onToast}
      />
      <StatsModal
        isOpen={openModal === 'stats'}
        onClose={closeModal}
        stats={stats}
        mode={mode}
        currentGuessCount={state.status === 'won' ? state.guesses.length : undefined}
        gameStatus={state.status}
        onPlayAgain={onPlayAgain}
        onSetNewWord={onSetNewWord}
      />
      <HelpModal isOpen={openModal === 'help'} onClose={closeModal} />
      <SettingsModal
        isOpen={openModal === 'settings'}
        onClose={closeModal}
        settings={settings}
        onToggle={onSettingsChange}
        hasStarted={state.guesses.length > 0}
      />
    </>
  );
};
