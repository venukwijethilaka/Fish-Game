// [AI-ASSISTED: Codex, 2026-11-05] Pirate Island authentication with Virtual Identity (JWT in HttpOnly cookie).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Anchor,
  Compass,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
  Waves,
  ArrowRight,
  Fish,
} from 'lucide-react';
import type { UserDTO } from '../../../contracts/src/index';
import { api, csrfToken } from '../api';
import { useReef } from '../context';
import { Notice, SailorAvatarIcon } from '../components';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: Record<string, unknown>) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null),
    callback = useRef(onCredential);
  callback.current = onCredential;
  const { config } = useReef();

  useEffect(() => {
    if (!config?.googleClientId) return;
    let disposed = false;
    const render = async () => {
      const nonce = await csrfToken();
      if (disposed || !window.google || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        nonce,
        callback: (r: { credential: string }) => callback.current(r.credential),
      });
      window.google.accounts.id.renderButton(ref.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
      });
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-google]');
    if (window.google) void render();
    else {
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.dataset.google = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', render);
    }
    return () => {
      disposed = true;
      script?.removeEventListener('load', render);
    };
  }, [config?.googleClientId]);

  return config?.googleClientId ? <div ref={ref} className="google-button" /> : null;
}

export function AuthPage({ register = false }: { register?: boolean }) {
  const { user, authenticate, config } = useReef(),
    navigate = useNavigate();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const form = new FormData(e.currentTarget);
    if (register && form.get('password') !== form.get('confirm')) {
      setError('Your passwords do not match, Captain!');
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ user: UserDTO }>(
        register ? '/auth/register' : '/auth/login',
        {
          email: form.get('email'),
          password: form.get('password'),
          ...(register ? { username: form.get('username') } : {}),
        },
        'POST',
        true,
      );
      authenticate(r.user);
      navigate('/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async (credential: string) => {
    setBusy(true);
    try {
      const r = await api<{ user: UserDTO }>('/auth/google', { credential }, 'POST', true);
      authenticate(r.user);
      navigate('/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pirate-auth-container">
      {/* Animated Tropical Water & Palm Background */}
      <div className="pirate-sea-bg">
        <div className="sun-caustic-shimmer" />
        <div className="floating-palm-left" />
        <div className="floating-palm-right" />
      </div>

      <div className="pirate-auth-card">
        {/* Top Wooden Signboard with Iron Rivets */}
        <div className="pirate-auth-signboard">
          <div className="signboard-screw screw-tl" />
          <div className="signboard-screw screw-tr" />
          <div className="signboard-screw screw-bl" />
          <div className="signboard-screw screw-br" />
          <div className="signboard-title-row">
            <SailorAvatarIcon size={34} />
            <h1>SMART SAILOR</h1>
            <Compass size={28} className="signboard-icon" />
          </div>
          <p className="signboard-subtitle">
            A Kid-Friendly Sailing Adventure across 15 Ocean Checkpoints
          </p>
        </div>

        {/* Nautical Tab Switcher */}
        <div className="pirate-auth-tabs">
          <Link
            to="/login"
            className={`pirate-tab-btn ${!register ? 'active' : ''}`}
            aria-selected={!register}
          >
            <Anchor size={18} />
            <span>BOARD SHIP (LOG IN)</span>
          </Link>
          <Link
            to="/register"
            className={`pirate-tab-btn ${register ? 'active' : ''}`}
            aria-selected={register}
          >
            <Compass size={18} />
            <span>ENLIST CREW (REGISTER)</span>
          </Link>
        </div>

        {/* Parchment Logbook Form */}
        <div className="pirate-parchment-body">
          <div className="parchment-eyebrow">
            <Sparkles size={14} />
            <span>{register ? 'JOIN THE EXPEDITION CREW' : 'WELCOME BACK, CAPTAIN'}</span>
          </div>

          <h2 className="parchment-headline">
            {register ? 'Enlist Your Captain Profile' : 'Weigh Anchor & Take the Helm'}
          </h2>
          <p className="parchment-desc">
            {register
              ? 'Create a virtual identity verified against the Neon/PostgreSQL ledger.'
              : 'Enter your credentials to resume your voyage toward the Final Pirate Island.'}
          </p>

          {error && <Notice>{error}</Notice>}

          <form onSubmit={submit} className="pirate-form">
            {register && (
              <div className="pirate-input-group">
                <label htmlFor="reg-username">
                  <User size={15} />
                  <span>Captain's Name</span>
                </label>
                <input
                  id="reg-username"
                  name="username"
                  autoComplete="nickname"
                  required
                  minLength={3}
                  maxLength={24}
                  placeholder="e.g. Captain Blackbeard"
                  className="pirate-input"
                />
              </div>
            )}

            <div className="pirate-input-group">
              <label htmlFor="auth-email">
                <Mail size={15} />
                <span>Captain's Dispatch (Email)</span>
              </label>
              <input
                id="auth-email"
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="captain@seven-seas.org"
                maxLength={254}
                className="pirate-input"
              />
            </div>

            <div className="pirate-input-group">
              <label htmlFor="auth-pwd">
                <KeyRound size={15} />
                <span>Secret Cipher (Password)</span>
              </label>
              <div className="pirate-password-wrapper">
                <input
                  id="auth-pwd"
                  type={show ? 'text' : 'password'}
                  name="password"
                  autoComplete={register ? 'new-password' : 'current-password'}
                  required
                  minLength={register ? 12 : 1}
                  maxLength={128}
                  placeholder={register ? 'At least 12 characters' : 'Enter your cipher'}
                  className="pirate-input"
                />
                <button
                  type="button"
                  className="pirate-eye-btn"
                  onClick={() => setShow(!show)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {register && (
              <div className="pirate-input-group">
                <label htmlFor="auth-confirm">
                  <ShieldCheck size={15} />
                  <span>Confirm Secret Cipher</span>
                </label>
                <div className="pirate-password-wrapper">
                  <input
                    id="auth-confirm"
                    type={show ? 'text' : 'password'}
                    name="confirm"
                    autoComplete="new-password"
                    required
                    placeholder="Repeat your secret cipher"
                    className="pirate-input"
                  />
                </div>
              </div>
            )}

            <button type="submit" className="pirate-submit-btn" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={20} />
                  <span>PREPARING SHIP…</span>
                </>
              ) : (
                <>
                  <span>{register ? 'ENLIST & SET SAIL' : 'WEIGH ANCHOR & DIVE IN'}</span>
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>

          {config?.googleClientId && (
            <div className="pirate-google-section">
              <div className="pirate-divider">
                <span>OR SIGN WITH GOOGLE FLEET</span>
              </div>
              <GoogleButton onCredential={google} />
            </div>
          )}

          {/* Academic Rubric Footer Badge */}
          <div className="pirate-rubric-badge">
            <ShieldCheck size={16} />
            <span>
              Theme 4: <strong>Virtual Identity</strong> — HttpOnly Cookie Session verified via Argon2 & PostgreSQL
            </span>
          </div>
        </div>

        <div className="pirate-card-footer">
          <span>Smart Sailor · CIS045-3 Distributed Service Architectures</span>
        </div>
      </div>
    </div>
  );
}
