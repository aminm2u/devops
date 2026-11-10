import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, X, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastrCardProps {
  type: ToastType;
  message: string;
  duration: number;
  createdAt: number;
  onClose: () => void;
}

// Static class maps so Tailwind can extract every class name at build time.
const ACCENT_BG: Record<ToastType, string> = {
  success: 'bg-emerald-500',
  error: 'bg-destructive',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
};

const PROGRESS_BG: Record<ToastType, string> = {
  success: 'bg-emerald-500',
  error: 'bg-destructive',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
};

const TITLES: Record<ToastType, string> = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

function formatRelativeAge(ageMs: number): string {
  const seconds = ageMs / 1000;
  if (seconds < 15) return 'just now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ToastrCard({ type, message, duration, createdAt, onClose }: ToastrCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const progressRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  // Relative timestamp: tick every 10s (minute-granularity display).
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);

  // Progress bar: rAF loop accumulating elapsed time, pausable on hover.
  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      if (lastTickRef.current === null) lastTickRef.current = t;
      const delta = t - lastTickRef.current;
      lastTickRef.current = t;
      if (!pausedRef.current) {
        elapsedRef.current += delta;
        const remaining = Math.max(0, 1 - elapsedRef.current / duration);
        if (progressRef.current) {
          progressRef.current.style.width = `${remaining * 100}%`;
        }
        if (remaining <= 0) return; // fully elapsed; stop the loop
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  const Icon = type === 'success' ? Check : type === 'error' ? XCircle : type === 'warning' ? AlertTriangle : Info;

  return (
    <div
      className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg"
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
    >
      <div className="flex items-start justify-between gap-2 p-3 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${ACCENT_BG[type]}`}
          >
            <Icon size={12} strokeWidth={3} />
          </span>
          <span className="text-sm font-semibold leading-5">{TITLES[type]}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs leading-5 text-muted-foreground">
            {formatRelativeAge(now - createdAt)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notification"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="break-words px-3 pb-3 text-sm text-muted-foreground">{message}</div>
      <div
        ref={progressRef}
        className={`absolute bottom-0 left-0 h-0.5 ${PROGRESS_BG[type]}`}
        style={{ width: '100%' }}
      />
    </div>
  );
}
