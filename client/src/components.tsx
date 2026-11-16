// [AI-ASSISTED: Codex, 2026-10-21] Reusable presentation and accessible dialog boundary.
import { useEffect, useRef, type ReactNode } from 'react';
import { Fish, X, LoaderCircle, ArrowUpRight } from 'lucide-react';
import type { AvatarId } from '../../contracts/src/index';
export const AVATARS: Record<AvatarId, { emoji: string; name: string; color: string }> = {
  clownfish: { emoji: '🐠', name: 'Clownfish', color: '#fff0d6' },
  turtle: { emoji: '🐢', name: 'Sea turtle', color: '#e0eee4' },
  octopus: { emoji: '🐙', name: 'Octopus', color: '#eee4f4' },
  whale: { emoji: '🐳', name: 'Whale', color: '#e1edf8' },
  crab: { emoji: '🦀', name: 'Crab', color: '#fbe5df' },
  jellyfish: { emoji: '🪼', name: 'Jellyfish', color: '#f3e3ed' },
};
export function Avatar({ id = 'clownfish', size = 42 }: { id?: AvatarId; size?: number }) {
  const a = AVATARS[id] ?? AVATARS.clownfish;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: a.color, fontSize: size * 0.52 }}
      role="img"
      aria-label={a.name}
    >
      {a.emoji}
    </span>
  );
}
export function SailorAvatarIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      className="sailor-avatar-svg"
      aria-hidden="true"
    >
      <circle cx="64" cy="64" r="60" fill="#38bdf8" stroke="#f59e0b" strokeWidth="5" />
      {/* Sailor Hat */}
      <path
        d="M28 46 C32 26, 96 26, 100 46 C96 53, 32 53, 28 46 Z"
        fill="#ffffff"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
      <path d="M25 49 C29 40, 99 40, 103 49 C101 56, 27 56, 25 49 Z" fill="#1e3a8a" />
      <path d="M27 49 C30 42, 98 42, 101 49 C99 53, 29 53, 27 49 Z" fill="#ffffff" />
      <circle cx="64" cy="45" r="2.5" fill="#f59e0b" />
      <line x1="64" y1="46" x2="64" y2="53" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="60" y1="48" x2="68" y2="48" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <path d="M59 50 Q64 55 69 50" fill="none" stroke="#f59e0b" strokeWidth="2" />
      {/* Hair */}
      <path d="M48 54 Q52 61 56 55 Q60 62 66 54" fill="#92400e" />
      {/* Face */}
      <ellipse cx="64" cy="74" rx="32" ry="28" fill="#fed7aa" stroke="#ea580c" strokeWidth="1.5" />
      <ellipse cx="44" cy="79" rx="6" ry="4" fill="#fb7185" opacity="0.8" />
      <ellipse cx="84" cy="79" rx="6" ry="4" fill="#fb7185" opacity="0.8" />
      {/* Eyes */}
      <ellipse cx="49" cy="70" rx="5.5" ry="7.5" fill="#0f172a" />
      <circle cx="47.5" cy="67.5" r="2.5" fill="#ffffff" />
      <ellipse cx="79" cy="70" rx="5.5" ry="7.5" fill="#0f172a" />
      <circle cx="77.5" cy="67.5" r="2.5" fill="#ffffff" />
      {/* Smile */}
      <path d="M53 82 Q64 94 75 82 Z" fill="#991b1b" stroke="#7f1d1d" strokeWidth="1.2" />
      <path d="M58 87 Q64 85 70 87 Q64 93 58 87 Z" fill="#fb7185" />
      {/* Sailor Collar & Tie */}
      <path
        d="M36 108 L48 124 L64 118 L80 124 L92 108 Q64 98 36 108 Z"
        fill="#ffffff"
        stroke="#1e3a8a"
        strokeWidth="2"
      />
      <circle cx="64" cy="113" r="3.5" fill="#ef4444" />
      <path d="M62 116 L59 125 L63 124 Z" fill="#dc2626" />
      <path d="M66 116 L69 125 L65 124 Z" fill="#dc2626" />
    </svg>
  );
}

export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="smart-sailor-brand-logo">
      <SailorAvatarIcon size={38} />
      <div className="smart-sailor-brand-text">
        <span className="brand-smart">SMART </span>
        <span className="brand-sailor">SAILOR</span>
        {subtitle && <span className="brand-subtitle">{subtitle}</span>}
      </div>
    </div>
  );
}
export function Loading({ label = 'Finding our sea legs…' }: { label?: string }) {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="alert">
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function OceanArt({ large = false }: { large?: boolean }) {
  return (
    <svg
      className={large ? 'ocean-art large' : 'ocean-art'}
      viewBox="0 0 520 330"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={large ? 'water-lg' : 'water'}
          x1="250"
          y1="0"
          x2="250"
          y2="330"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#9AD4CC" />
          <stop offset="1" stopColor="#3F8D8D" />
        </linearGradient>
      </defs>
      <ellipse
        cx="280"
        cy="175"
        rx="192"
        ry="141"
        fill={`url(#${large ? 'water-lg' : 'water'})`}
        opacity=".23"
      />
      <path
        d="M127 283c48-28 128-32 176-14 64 24 104-9 146-23"
        stroke="#80b7a0"
        strokeWidth="15"
        strokeLinecap="round"
        opacity=".35"
      />
      <g stroke="#66a99c" strokeWidth="12" strokeLinecap="round">
        <path d="M145 279v-90m0 44-24-24m24 9 22-29m-22 61-29-10" />
        <path d="M398 276v-76m0 45 23-19m-23-4-17-19" />
      </g>
      <g transform="translate(267 143) rotate(-9)">
        <path d="m-56 0-45-32v64z" fill="#ed9561" />
        <ellipse rx="68" ry="45" fill="#efb47a" />
        <path d="M-29-40v80M4-44v87" stroke="#fff5df" strokeWidth="15" />
        <path d="m-20-42 25-19 20 21" fill="#efb47a" />
        <circle cx="43" cy="-7" r="6" fill="#163d43" />
        <path d="M44 13q11 6 20-2" stroke="#9e674e" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g transform="translate(391 92) scale(.5)">
        <path d="m-42 0-34-23v46z" fill="#aecf96" />
        <ellipse rx="50" ry="29" fill="#c8deaf" />
        <circle cx="31" cy="-5" r="5" fill="#235457" />
      </g>
      <g transform="translate(225 239) scale(.4) rotate(180)">
        <path d="m-42 0-34-23v46z" fill="#9fd3d3" />
        <ellipse rx="50" ry="29" fill="#c6e2de" />
        <circle cx="31" cy="-5" r="5" fill="#235457" />
      </g>
      <g stroke="#c4e2d8" strokeWidth="2" opacity=".7">
        <circle cx="370" cy="180" r="8" />
        <circle cx="389" cy="155" r="4" />
        <circle cx="185" cy="76" r="9" />
        <circle cx="166" cy="51" r="4" />
        <circle cx="435" cy="119" r="7" />
      </g>
      <path d="m336 264 10-16 9 16-10 14z" fill="#e3bd80" />
      <path d="M191 292q7-27 21-34" stroke="#9bc4ac" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
export function SectionLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
