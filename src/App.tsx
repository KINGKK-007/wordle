import { useState, useCallback, useEffect } from 'react';
import './styles/global.css';
import { Header } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
import { GameScreen } from './components/GameScreen';
import { SetWordScreen } from './components/SetWordScreen';
import { ShareLinkScreen } from './components/ShareLinkScreen';
import { CodeInputScreen } from './components/CodeInputScreen';
import { ToastContainer } from './components/Toast';
import { HelpModal } from './components/HelpModal';
import { SettingsModal } from './components/SettingsModal';
import { StatsModal } from './components/StatsModal';
import { useToast } from './hooks/useToast';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ANSWER_LIST } from './data/answers';
import { decodeWord } from './utils/wordCodec';
import { loadStats } from './utils/stats';
import { loadSavedGame, SOLO_GAME_STORAGE_KEY } from './utils/gamePersistence';
import { readStorage, writeStorage, removeStorage } from './utils/storage';

type Screen = 'home' | 'unlimited' | 'set-word' | 'share-link' | 'enter-code' | 'two-player-game' | 'error';
interface Route { screen: Screen; word?: string }
interface Settings { hardMode: boolean; highContrast: boolean }
const HELP_SHOWN_KEY = 'custom-wordle-help-shown';
const LAST_ANSWER_KEY = 'custom-wordle-last-answer';

function readRoute(): Route {
  const hash = window.location.hash;
  if (hash.startsWith('#/play')) {
    const payload = new URLSearchParams(hash.split('?')[1] ?? '').get('w');
    const word = payload ? decodeWord(payload) : null;
    return word ? { screen: 'two-player-game', word } : { screen: 'error' };
  }
  if (hash === '#/unlimited') return { screen: 'unlimited' };
  if (hash === '#/set') return { screen: 'set-word' };
  if (hash === '#/code') return { screen: 'enter-code' };
  return { screen: 'home' };
}

function pickAnswer(): string {
  const previous = readStorage(LAST_ANSWER_KEY);
  const pool = ANSWER_LIST.filter(word => word !== previous);
  const word = pool[Math.floor(Math.random() * pool.length)]!;
  writeStorage(LAST_ANSWER_KEY, word);
  return word;
}

function resumeOrPickAnswer(): string {
  const saved = loadSavedGame();
  if (saved && !saved.guesses.includes(saved.answer) && saved.guesses.length < 6) return saved.answer;
  removeStorage(SOLO_GAME_STORAGE_KEY);
  return pickAnswer();
}

export default function App() {
  const { toasts, showToast } = useToast();
  const [settings, setSettings] = useLocalStorage<Settings>('custom-wordle-settings', { hardMode: false, highContrast: false });
  const [route, setRoute] = useState<Route>(readRoute);
  const [currentAnswer, setCurrentAnswer] = useState(() => readRoute().screen === 'unlimited' ? (loadSavedGame()?.answer ?? pickAnswer()) : '');
  const [twoPlayerWord, setTwoPlayerWord] = useState('');
  const [showHelp, setShowHelp] = useState(() => readRoute().screen === 'home' && readStorage(HELP_SHOWN_KEY) !== '1');
  const [globalModal, setGlobalModal] = useState<'stats' | 'settings' | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const isGame = route.screen === 'unlimited' || route.screen === 'two-player-game';

  useEffect(() => {
    const onHashChange = () => {
      const next = readRoute();
      if (next.screen === 'unlimited') setCurrentAnswer(resumeOrPickAnswer());
      setRoute(next);
      setGameKey(key => key + 1);
      setShowHelp(false);
      setGlobalModal(null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => { if (showHelp) writeStorage(HELP_SHOWN_KEY, '1'); }, [showHelp]);
  useEffect(() => { document.getElementById('root')?.classList.toggle('high-contrast', settings.highContrast); }, [settings.highContrast]);

  const toggleSetting = useCallback((key: keyof Settings) => setSettings(previous => ({ ...previous, [key]: !previous[key] })), [setSettings]);
  const dispatch = (action: string) => window.dispatchEvent(new CustomEvent('header-action', { detail: { action } }));
  const goHome = () => { window.location.hash = ''; setRoute({ screen: 'home' }); };
  const navigate = (hash: string) => { window.location.hash = hash; };
  const playAgain = () => {
    removeStorage(SOLO_GAME_STORAGE_KEY);
    setCurrentAnswer(pickAnswer());
    setGameKey(key => key + 1);
  };
  const subtitle = route.screen === 'unlimited' ? 'Unlimited' : ['set-word', 'share-link', 'two-player-game'].includes(route.screen) ? '2-Player' : undefined;

  return <div className="app">
    <Header onMenu={goHome} subtitle={subtitle}
      onHelp={() => isGame ? dispatch('help') : setShowHelp(true)}
      onStats={() => isGame ? dispatch('stats') : setGlobalModal('stats')}
      onSettings={() => isGame ? dispatch('settings') : setGlobalModal('settings')} />
    <ToastContainer toasts={toasts} />
    {route.screen === 'home' && <HomeScreen onUnlimited={() => navigate('#/unlimited')} onTwoPlayer={() => navigate('#/set')} onEnterCode={() => navigate('#/code')} />}
    {route.screen === 'unlimited' && currentAnswer && <GameScreen key={`unlimited-${gameKey}`} answer={currentAnswer} mode="unlimited" settings={settings} onSettingsChange={toggleSetting} onToast={showToast} onPlayAgain={playAgain} onBackToMenu={goHome} />}
    {route.screen === 'set-word' && <SetWordScreen onWordSet={word => { setTwoPlayerWord(word); setRoute({ screen: 'share-link' }); }} onToast={showToast} />}
    {route.screen === 'share-link' && twoPlayerWord && <ShareLinkScreen word={twoPlayerWord} onToast={showToast} onBackToMenu={goHome} />}
    {route.screen === 'enter-code' && <CodeInputScreen onCodeEntered={word => { setRoute({ screen: 'two-player-game', word }); setGameKey(key => key + 1); }} onToast={showToast} onCancel={goHome} />}
    {route.screen === 'two-player-game' && route.word && <GameScreen key={`challenge-${gameKey}`} answer={route.word} mode="2player" settings={settings} onSettingsChange={toggleSetting} onToast={showToast} onSetNewWord={() => navigate('#/set')} onBackToMenu={goHome} />}
    {route.screen === 'error' && <main className="error-screen"><h2>Invalid Challenge</h2><p className="error-screen__desc">This challenge link is invalid. Ask your friend for a new link.</p><button className="btn btn--primary" onClick={goHome}>Back to Menu</button></main>}
    <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    <SettingsModal isOpen={globalModal === 'settings'} onClose={() => setGlobalModal(null)} settings={settings} onToggle={toggleSetting} hasStarted={false} />
    <StatsModal isOpen={globalModal === 'stats'} onClose={() => setGlobalModal(null)} stats={loadStats('unlimited')} mode="unlimited" gameStatus="playing" />
  </div>;
}
