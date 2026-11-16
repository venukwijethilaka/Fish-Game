// [AI-ASSISTED: Codex, 2026-10-21] Profile changes and destructive actions require server acknowledgement.
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Pencil,
  Trophy,
  Sparkles,
  Anchor,
  LogOut,
  Trash2,
  ShieldCheck,
  ArrowRight,
  LoaderCircle,
  KeyRound,
} from 'lucide-react';
import { avatarIds, type AvatarId, type ProfileDTO } from '../../../contracts/src/index';
import { api } from '../api';
import { useReef } from '../context';
import { Avatar, AVATARS, Modal, Notice, Loading } from '../components';
import { GoogleButton } from './auth';
export function Profile() {
  const { user, profile, refresh, logout } = useReef(),
    navigate = useNavigate();
  const [username, setUsername] = useState(user?.username ?? ''),
    [avatar, setAvatar] = useState<AvatarId>(user?.avatarId ?? 'clownfish'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [dialog, setDialog] = useState<'avatar' | 'delete' | 'password' | null>(null),
    [password, setPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [confirmation, setConfirmation] = useState(false),
    [verified, setVerified] = useState(false);
  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setAvatar(user.avatarId);
    }
  }, [user?.username, user?.avatarId]);
  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api<ProfileDTO>('/users/me', { username, avatarId: avatar }, 'PATCH');
      await refresh();
      setSuccess('Your explorer profile is up to date.');
      setDialog(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const verifyIdentity = async (credential?: string) => {
    setBusy(true);
    setError('');
    try {
      await api('/auth/reauthenticate', credential ? { credential } : { password }, 'POST', true);
      setVerified(true);
      setPassword('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sensitive = async () => {
    setBusy(true);
    setError('');
    try {
      if (dialog === 'delete') await api('/users/me', {}, 'DELETE');
      else await api('/users/me/password', { password: newPassword }, 'PATCH');
      window.dispatchEvent(new CustomEvent('reef:session-expired'));
      navigate('/login');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const open = (kind: typeof dialog) => {
    setDialog(kind);
    setError('');
    setSuccess('');
    setVerified(false);
    setConfirmation(false);
    setPassword('');
    setNewPassword('');
  };
  if (!profile || !user) return <Loading label="Finding your explorer profile…" />;
  return (
    <div className="profile-page page-enter">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR OWN LITTLE CORNER</span>
          <h1>An explorer, through and through.</h1>
          <p>A few details that make this ocean yours.</p>
        </div>
      </div>
      {success && (
        <div className="success-notice" role="status">
          <Check size={17} />
          {success}
        </div>
      )}
      {error && !dialog && <Notice>{error}</Notice>}
      <div className="profile-layout">
        <section className="panel identity-card">
          <div className="profile-avatar">
            <Avatar id={user.avatarId} size={110} />
            <button onClick={() => open('avatar')} aria-label="Change avatar">
              <Pencil size={15} />
            </button>
          </div>
          <h2>{user.username}</h2>
          <span>Ocean explorer</span>
          <div className="profile-rank">
            <Trophy size={19} />
            {profile.rank ? `#${profile.rank} in the global reef` : 'Your first live rank awaits'}
          </div>
          <span className="account-security">
            <ShieldCheck size={14} />
            Your account, your progress
          </span>
        </section>
        <section className="panel profile-details">
          <span className="eyebrow">EXPLORER DETAILS</span>
          <h2>Make yourself at home.</h2>
          <form onSubmit={save}>
            <label>
              Explorer name
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={24}
              />
            </label>
            <label>
              Email address
              <input value={user.email ?? ''} readOnly className="readonly" />
              <small>Email changes are not available in this build.</small>
            </label>
            <button
              className="button primary"
              disabled={busy || (username === user.username && avatar === user.avatarId)}
            >
              {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Save changes
            </button>
          </form>
        </section>
      </div>
      <div className="stat-grid profile-stats">
        <div className="stat-card">
          <span className="stat-icon sand">
            <Trophy size={21} />
          </span>
          <div>
            <small>Personal best · live</small>
            <strong>
              {profile.bestScore}
              <span>pts</span>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon mint">
            <Sparkles size={21} />
          </span>
          <div>
            <small>Total live points</small>
            <strong>
              {profile.totalScore}
              <span>pts</span>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon lavender">
            <Anchor size={21} />
          </span>
          <div>
            <small>Global highest score</small>
            <strong>
              {profile.globalHighestScore}
              <span>pts</span>
            </strong>
          </div>
        </div>
      </div>
      <section className="panel account-settings">
        <div>
          <span className="eyebrow">ACCOUNT & SECURITY</span>
          <h2>Take care of your little corner.</h2>
          <p>
            {profile.gamesPlayed} finished live dives · {profile.practiceGames} practice dives
          </p>
        </div>
        <div className="settings-row">
          <div>
            <strong>{user.hasPassword ? 'Change password' : 'Set a password'}</strong>
            <p>Confirm your identity before changing your credentials.</p>
          </div>
          <button className="button secondary" onClick={() => open('password')}>
            <KeyRound size={16} />
            {user.hasPassword ? 'Change' : 'Set password'}
          </button>
        </div>
        <div className="settings-row">
          <div>
            <strong>Log out everywhere</strong>
            <p>End all active sessions for your account.</p>
          </div>
          <button
            className="button secondary"
            onClick={() =>
              void logout(true)
                .then(() => navigate('/login'))
                .catch((e) => setError(e.message))
            }
          >
            <LogOut size={16} />
            Log out all
          </button>
        </div>
        <div className="settings-row danger-row">
          <div>
            <strong>Delete your account</strong>
            <p>Permanently remove your profile, game history and scores.</p>
          </div>
          <button className="button danger-outline" onClick={() => open('delete')}>
            <Trash2 size={16} />
            Delete account
          </button>
        </div>
      </section>
      {dialog === 'avatar' && (
        <Modal
          title="Find your little ocean companion."
          onClose={() => {
            setAvatar(user.avatarId);
            setDialog(null);
          }}
        >
          <p className="modal-copy">A familiar face for every new adventure.</p>
          {error && <Notice>{error}</Notice>}
          <div className="avatar-grid" role="radiogroup" aria-label="Choose avatar">
            {avatarIds.map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={avatar === id}
                className={avatar === id ? 'selected' : ''}
                onClick={() => setAvatar(id)}
              >
                <Avatar id={id} size={60} />
                <span>{AVATARS[id].name}</span>
                {avatar === id && <Check size={15} />}
              </button>
            ))}
          </div>
          <button className="button primary full" disabled={busy} onClick={() => void save()}>
            Save my companion
            <Check size={17} />
          </button>
        </Modal>
      )}
      {dialog && dialog !== 'avatar' && (
        <Modal
          title={dialog === 'delete' ? 'A final goodbye to the reef?' : 'Keep your account yours.'}
          onClose={() => setDialog(null)}
        >
          <p className="modal-copy">
            {dialog === 'delete'
              ? 'This permanently removes your profile, sessions, owned game history and public scores. This cannot be undone.'
              : 'A new password signs you out everywhere. You can then log back in with it.'}
          </p>
          {error && <Notice>{error}</Notice>}
          {!verified ? (
            <div className="reauth-form">
              <h3>First, confirm it’s you.</h3>
              {user.hasPassword ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void verifyIdentity();
                  }}
                >
                  <label>
                    Current password
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </label>
                  <button className="button primary full" disabled={busy}>
                    Confirm identity
                    <ShieldCheck size={16} />
                  </button>
                </form>
              ) : (
                <GoogleButton onCredential={(credential) => void verifyIdentity(credential)} />
              )}
            </div>
          ) : (
            <div>
              <div className="verified-label">
                <ShieldCheck size={17} />
                Identity confirmed
              </div>
              {dialog === 'delete' ? (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={confirmation}
                    onChange={(e) => setConfirmation(e.target.checked)}
                  />
                  I understand my account and scores will be permanently removed.
                </label>
              ) : (
                <label>
                  New password
                  <input
                    type="password"
                    value={newPassword}
                    minLength={12}
                    maxLength={128}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 12 characters"
                    autoComplete="new-password"
                  />
                </label>
              )}
              <button
                className={`button full ${dialog === 'delete' ? 'danger' : 'primary'}`}
                disabled={busy || (dialog === 'delete' ? !confirmation : newPassword.length < 12)}
                onClick={() => void sensitive()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : dialog === 'delete' ? (
                  <>
                    <Trash2 size={17} />
                    Delete my account permanently
                  </>
                ) : (
                  <>
                    Update password
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
