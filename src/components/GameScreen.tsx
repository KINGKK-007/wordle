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
  const [showResult, setShowResult] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showHelp, setShowHelp] = useState(showHelpOnMount);
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState<GameStats>(() => loadStats(mode));

  const handleWin = useCallback((_guessCount: number) => {
    setStats(loadStats(mode));
    setTimeout(() => setShowResult(true), 1800);
  }, [mode]);

  const handleLose = useCallback(() => {
    setStats(loadStats(mode));
    setTimeout(() => setShowResult(true), 1800);
  }, [mode]);

  const { state, handleKey, isInputDisabled } = useGame({
    answer,
    mode,
    hardMode: settings.hardMode,
    onToast,
    onWin: handleWin,
    onLose: handleLose,
    persistKey: mode === 'unlimited' ? `custom-wordle-game-${answer}` : undefined,
  });

  useKeyboardInput(handleKey, isInputDisabled);

  // Refresh stats when modal opens
  const handleOpenStats = () => {
    setStats(loadStats(mode));
    setShowStats(true);
  };

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
        disabled={isInputDisabled}
      />

      {/* Result Modal */}
      <ResultModal
        isOpen={showResult}
        onClose={() => setShowResult(false)}
        status={state.status === 'won' ? 'won' : state.status === 'lost' ? 'lost' : null}
        answer={answer}
        guessCount={state.guesses.length}
        evaluatedRows={state.evaluatedRows}
        mode={mode}
        highContrast={settings.highContrast}
        onPlayAgain={onPlayAgain ? () => {
          setShowResult(false);
          onPlayAgain();
        } : undefined}
        onSetNewWord={onSetNewWord ? () => {
          setShowResult(false);
          onSetNewWord();
        } : undefined}
        onBackToMenu={onBackToMenu}
        onShowToast={onToast}
      />

      {/* Stats Modal */}
      <StatsModal
        isOpen={showStats}
        onClose={() => setShowStats(false)}
        stats={stats}
        mode={mode}
        currentGuessCount={state.status === 'won' ? state.guesses.length : undefined}
        gameStatus={state.status}
        onPlayAgain={onPlayAgain}
        onSetNewWord={onSetNewWord}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onToggle={onSettingsChange}
        hasStarted={state.guesses.length > 0}
      />

      {/* Header modal triggers are passed via context - we re-expose them via window events */}
      {/* The Header lives in App.tsx - we use a custom event bridge */}
      <GameScreenBridge
        onHelp={() => setShowHelp(true)}
        onStats={handleOpenStats}
        onSettings={() => setShowSettings(true)}
      />
    </>
  );
};

// Bridge component: listens to custom events from Header
const GameScreenBridge: React.FC<{
  onHelp: () => void;
  onStats: () => void;
  onSettings: () => void;
}> = ({ onHelp, onStats, onSettings }) => {
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent).detail?.action;
      if (action === 'help') onHelp();
      if (action === 'stats') onStats();
      if (action === 'settings') onSettings();
    };
    window.addEventListener('header-action', handler);
    return () => window.removeEventListener('header-action', handler);
  }, [onHelp, onStats, onSettings]);
  return null;
};
