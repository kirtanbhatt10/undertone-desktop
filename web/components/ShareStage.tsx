'use client';

import { useEffect, useState } from 'react';
import { Markdown } from './Markdown';
import { streamText } from '@/lib/mock';

const QUESTION = 'They asked why activation went up. Short answer?';
const ANSWER =
  'Activation rose **four points** because new users reach their first invoice two screens sooner.\n\n- Lead with the number\n- Then name the billing trade-off';

function Slide() {
  return (
    <div className="slide" aria-hidden>
      <div className="slide-bar">
        <i />
        <i />
        <i />
        <span>Q3 onboarding review</span>
      </div>
      <div className="slide-body">
        <b>Activation by week</b>
        <div className="bars">
          {[38, 44, 41, 52, 61, 66].map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Floater({ text }: { text: string }) {
  return (
    <div className="floater">
      <div className="floater-head">
        <span className="dot" />
        Undertone
      </div>
      <p className="floater-q">{QUESTION}</p>
      <div className="floater-a">
        <Markdown text={text || ' '} />
      </div>
    </div>
  );
}

export function ShareStage() {
  const [privacy, setPrivacy] = useState(true);
  const [text, setText] = useState('');

  useEffect(() => {
    let cancel = () => {};
    const start = window.setTimeout(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) setText(ANSWER);
      else cancel = streamText(ANSWER, setText, undefined, 28);
    }, 700);
    return () => {
      window.clearTimeout(start);
      cancel();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyP') {
        e.preventDefault();
        setPrivacy((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`stage${privacy ? ' is-private' : ''}`}>
      <div className="stage-controls">
        <button
          type="button"
          role="switch"
          aria-checked={privacy}
          className="switch"
          onClick={() => setPrivacy((p) => !p)}
        >
          <span className="track">
            <span className="thumb" />
          </span>
          Privacy Mode {privacy ? 'on' : 'off'}
        </button>
        <span className="hint">
          or press <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>P</kbd>
        </span>
      </div>

      <div className="screens">
        <figure className="screen">
          <figcaption>Your screen</figcaption>
          <div className="desk">
            <Slide />
            <Floater text={text} />
          </div>
        </figure>
        <figure className="screen shared">
          <figcaption>
            <span className="live" /> What the call sees
          </figcaption>
          <div className="desk">
            <Slide />
            {privacy ? (
              <div className="ghost" aria-label="Undertone is left out of the share">
                <span>Left out of the share</span>
              </div>
            ) : (
              <Floater text={text} />
            )}
          </div>
        </figure>
      </div>
    </div>
  );
}
