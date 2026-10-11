import React, { useState, useRef, useEffect } from 'react';
import { buildChallengeUrl, encodeToCode } from '../utils/wordCodec';
import { copyToClipboard } from '../utils/shareResult';

interface ShareLinkScreenProps {
  word: string;
  onToast: (msg: string) => void;
  onBackToMenu: () => void;
  onCreateAnother?: () => void;
}

export const ShareLinkScreen: React.FC<ShareLinkScreenProps> = ({
  word,
  onToast,
  onBackToMenu,
  onCreateAnother,
}) => {
  const url = buildChallengeUrl(word);
  const code = encodeToCode(word);
  const [urlCopied, setUrlCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const mountedRef = useRef(true);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    };
  }, []);
  const later = (callback: () => void) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, 2000);
    timersRef.current.add(timer);
  };

  const handleCopyUrl = async () => {
    const ok = await copyToClipboard(url);
    if (!mountedRef.current) return;
    if (ok) {
      onToast('Link copied!');
      setUrlCopied(true);
      later(() => setUrlCopied(false));
    } else onToast('Unable to copy link');
  };

  const handleCopyCode = async () => {
    const ok = await copyToClipboard(code);
    if (!mountedRef.current) return;
    if (ok) {
      onToast('Code copied!');
      setCodeCopied(true);
      later(() => setCodeCopied(false));
    } else onToast('Unable to copy code');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Custom Wordle · Secret Word',
          text: `I picked a five-letter word for you. Can you solve it in six guesses? Challenge code: ${code}`,
          url,
        });
        return;
      } catch (error) {
        if (
          error !== null &&
          typeof error === 'object' &&
          'name' in error &&
          error.name === 'AbortError'
        )
          return;
        // fall through to copy
      }
    }
    await handleCopyUrl();
  };

  return (
    <main className="share-screen" role="main">
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: 'var(--present)',
            marginBottom: 8,
          }}
        >
          Secret Word
        </div>
        <h2 className="share-screen__title">Your puzzle is ready</h2>
        <p className="share-screen__subtitle">
          Send it to a friend. They can solve it whenever they like, even after you leave.
        </p>
      </div>

      {/* Challenge Link block */}
      <div className="share-block">
        <div className="share-block__label">Challenge Link</div>
        <div className="share-block__url" aria-label="Challenge URL" style={{ userSelect: 'text' }}>
          {url}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn--secondary btn--sm"
            onClick={handleCopyUrl}
            id="copy-link-btn"
            aria-label="Copy challenge link"
            style={{ flex: 1 }}
          >
            {urlCopied ? '✓ Copied!' : 'Copy link'}
          </button>
          <button
            className="btn btn--primary btn--sm"
            onClick={handleShare}
            id="share-link-btn"
            aria-label="Share challenge"
            style={{ flex: 1 }}
          >
            Share puzzle
          </button>
        </div>
      </div>

      {/* Challenge Code block */}
      <div className="share-block">
        <div className="share-block__label">Challenge Code</div>
        <div
          className="share-block__code"
          aria-label={`Challenge code: ${code}`}
          style={{ marginBottom: 12, userSelect: 'text' }}
        >
          {code}
        </div>
        <button
          className="btn btn--secondary btn--sm btn--full"
          onClick={handleCopyCode}
          id="copy-code-btn"
          aria-label="Copy challenge code"
        >
          {codeCopied ? '✓ Copied!' : 'Copy code'}
        </button>
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            marginTop: 8,
            lineHeight: 1.4,
          }}
        >
          This four-character code is for Secret Word. Live Duel uses a separate room code.
        </p>
      </div>

      {/* Instructions */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--tile-border-empty)',
          borderRadius: 8,
          padding: '16px 20px',
          width: '100%',
          maxWidth: 360,
          fontSize: '0.8125rem',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: 'var(--text)' }}>How your friend plays</strong>
        <br />
        Open your link, or choose <strong>Secret Word → Enter challenge code</strong> and enter the
        code above. Five letters, six guesses, no timer.
      </div>

      {/* Actions */}
      <div
        style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {onCreateAnother && (
          <button className="btn btn--secondary btn--full" onClick={onCreateAnother}>
            Create another word
          </button>
        )}
        <button
          className="btn btn--outline btn--full"
          onClick={onBackToMenu}
          id="back-to-menu-share-btn"
        >
          ← Back to Menu
        </button>
      </div>
    </main>
  );
};
