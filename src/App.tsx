import { useState, useCallback, useEffect, useRef } from 'react';
import './styles/global.css';

import { Header } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
import { GameScreen } from './components/GameScreen';
import { SetWordScreen } from './components/SetWordScreen';
import { ShareLinkScreen } from './components/ShareLinkScreen';
import { CodeInputScreen } from './components/CodeInputScreen';
import { ToastContainer } from './components/Toast';
import { HelpModal } from './components/HelpModal';
import { useToast } from './hooks/useToast';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ANSWER_LIST } from './data/answers';
import { getWordFromUrl } from './utils/wordCodec';

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | 'home'
  | 'unlimited'
  | 'set-word'
  | 'share-link'
  | 'enter-code'
  | 'two-player-game'
  | 'error';

interface Settings {
  hardMode: boolean;
  highContrast: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pickRandomAnswer(exclude?: string): string {
  const pool = exclude
    ? ANSWER_LIST.filter(w => w !== exclude)
    : ANSWER_LIST;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Track if we've shown the first-launch help
const HELP_SHOWN_KEY = 'custom-wordle-help-shown';

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { toasts, showToast } = useToast();
  const [settings, setSettings] = useLocalStorage<Settings>('custom-wordle-settings', {
    hardMode: false,
    highContrast: false,
  });

  const [screen, setScreen] = useState<Screen>('home');
  const [currentAnswer, setCurrentAnswer] = useState<string>('');
  const [twoPlayerWord, setTwoPlayerWord] = useState<string>('');
  const [errorMessage] = useState('');
  const [showGlobalHelp, setShowGlobalHelp] = useState(false);
  const [gameKey, setGameKey] = useState(0); // force remount on new game
  const prevAnswerRef = useRef<string>('');

  // ─── Check URL for 2-player challenge on mount ──────────────────────────

  useEffect(() => {
    const word = getWordFromUrl();
    if (word) {
      setTwoPlayerWord(word);
      setCurrentAnswer(word);
      setScreen('two-player-game');
      setGameKey(k => k + 1);
      // Clear the hash so refreshing gives a fresh board
      history.replaceState(null, '', window.location.pathname);
    } else {
      // Show help on very first visit
      const shown = localStorage.getItem(HELP_SHOWN_KEY);
      if (!shown) {
        setShowGlobalHelp(true);
        localStorage.setItem(HELP_SHOWN_KEY, '1');
      }
    }
  }, []);

  // Apply high-contrast class to root
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) {
      root.classList.toggle('high-contrast', settings.highContrast);
    }
  }, [settings.highContrast]);

  // ─── Settings toggle ────────────────────────────────────────────────────

  const handleSettingsToggle = useCallback((key: keyof Settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  }, [setSettings]);

  // ─── Header actions (broadcast via custom event) ─────────────────────────

  const dispatchHeaderAction = useCallback((action: string) => {
    window.dispatchEvent(new CustomEvent('header-action', { detail: { action } }));
  }, []);

  // ─── Navigation ─────────────────────────────────────────────────────────

  const goHome = useCallback(() => {
    setScreen('home');
    setCurrentAnswer('');
  }, []);

  const startUnlimited = useCallback(() => {
    const word = pickRandomAnswer(prevAnswerRef.current);
    prevAnswerRef.current = word;
    setCurrentAnswer(word);
    setGameKey(k => k + 1);
    setScreen('unlimited');
  }, []);

  const playAgainUnlimited = useCallback(() => {
    const word = pickRandomAnswer(prevAnswerRef.current);
    prevAnswerRef.current = word;
    setCurrentAnswer(word);
    setGameKey(k => k + 1);
  }, []);

  const startSetWord = useCallback(() => {
    setScreen('set-word');
  }, []);

  const handleWordSet = useCallback((word: string) => {
    setTwoPlayerWord(word);
    setScreen('share-link');
  }, []);

  const handleCodeEntered = useCallback((word: string) => {
    setTwoPlayerWord(word);
    setCurrentAnswer(word);
    setGameKey(k => k + 1);
    setScreen('two-player-game');
  }, []);

  const handleSetNewWord = useCallback(() => {
    setScreen('set-word');
  }, []);

  const handleShareBack = useCallback(() => {
    goHome();
  }, [goHome]);

  // ─── Header subtitle ─────────────────────────────────────────────────────

  const subtitle =
    screen === 'unlimited' ? 'Unlimited' :
    screen === 'two-player-game' ? '2-Player' :
    screen === 'set-word' ? '2-Player' :
    screen === 'share-link' ? '2-Player' :
    undefined;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <Header
        onMenu={goHome}
        onHelp={() => {
          if (screen === 'unlimited' || screen === 'two-player-game') {
            dispatchHeaderAction('help');
          } else {
            setShowGlobalHelp(true);
          }
        }}
        onStats={() => dispatchHeaderAction('stats')}
        onSettings={() => dispatchHeaderAction('settings')}
        subtitle={subtitle}
      />

      <ToastContainer toasts={toasts} />

      {/* ── Home Screen ── */}
      {screen === 'home' && (
        <HomeScreen
          onUnlimited={startUnlimited}
          onTwoPlayer={startSetWord}
          onEnterCode={() => setScreen('enter-code')}
        />
      )}

      {/* ── Unlimited Game ── */}
      {screen === 'unlimited' && currentAnswer && (
        <GameScreen
          key={`unlimited-${gameKey}`}
          answer={currentAnswer}
          mode="unlimited"
          settings={settings}
          onSettingsChange={handleSettingsToggle}
          onToast={showToast}
          onPlayAgain={playAgainUnlimited}
          onBackToMenu={goHome}
          showHelpOnMount={false}
        />
      )}

      {/* ── 2P: Set Word ── */}
      {screen === 'set-word' && (
        <SetWordScreen
          onWordSet={handleWordSet}
          onToast={showToast}
        />
      )}

      {/* ── 2P: Share Link ── */}
      {screen === 'share-link' && twoPlayerWord && (
        <ShareLinkScreen
          word={twoPlayerWord}
          onToast={showToast}
          onBackToMenu={handleShareBack}
        />
      )}

      {/* ── 2P: Enter Code ── */}
      {screen === 'enter-code' && (
        <CodeInputScreen
          onCodeEntered={handleCodeEntered}
          onToast={showToast}
          onCancel={goHome}
        />
      )}

      {/* ── 2P: Game ── */}
      {screen === 'two-player-game' && currentAnswer && (
        <GameScreen
          key={`2p-${gameKey}`}
          answer={currentAnswer}
          mode="2player"
          settings={settings}
          onSettingsChange={handleSettingsToggle}
          onToast={showToast}
          onSetNewWord={handleSetNewWord}
          onBackToMenu={goHome}
          showHelpOnMount={false}
        />
      )}

      {/* ── Error Screen ── */}
      {screen === 'error' && (
        <main className="error-screen" role="main">
          <div className="error-screen__icon" aria-hidden="true">❌</div>
          <h2 className="error-screen__title">Invalid Challenge</h2>
          <p className="error-screen__desc">
            {errorMessage || 'This challenge link is invalid or has expired. Please ask your friend to generate a new one.'}
          </p>
          <button className="btn btn--primary" onClick={goHome} id="error-back-btn">
            Back to Menu
          </button>
        </main>
      )}

      {/* Global help modal (for home screen) */}
      <HelpModal
        isOpen={showGlobalHelp}
        onClose={() => setShowGlobalHelp(false)}
      />
    </div>
  );
}
