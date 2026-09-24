import { useEffect, useRef, useState, useCallback } from 'react';
import mwpLogoWhite from '@/assets/mwp_logo_white.png';
import mwpLogoBlack from '@/assets/mwp_logo_black.png';

// ── Easing (mirrors Flutter's Curves.easeInOutCubic) ──
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Pen geometry (fractional coords of the logo box) ──
const PEN = {
  topRailY: 0.08,
  midRailY: 0.815,
  leftX: 0.145,
  startX: 0.96,
  endX: 0.47,
  phaseTop: 0.44,
  phaseDrop: 0.54,
  topLettersLeft: 0.12,
  topLettersRight: 0.85,
  bottomLettersLeft: 0.48,
  bottomLettersRight: 0.83,
  topHiddenX: 0.90,
  bottomHiddenX: 0.03,
};

function penTip(t: number) {
  const { topRailY, midRailY, leftX, startX, endX, phaseTop, phaseDrop } = PEN;
  if (t <= phaseTop) {
    const k = t / phaseTop;
    return { x: startX + (leftX - startX) * k, y: topRailY };
  }
  if (t <= phaseDrop) {
    const k = (t - phaseTop) / (phaseDrop - phaseTop);
    return { x: leftX, y: topRailY + (midRailY - topRailY) * k };
  }
  const k = (t - phaseDrop) / (1 - phaseDrop);
  return { x: leftX + (endX - leftX) * k, y: midRailY };
}

function topRevealEdge(t: number): number {
  if (t >= PEN.phaseTop) return PEN.topLettersLeft - 0.03;
  const k = t / PEN.phaseTop;
  const end = PEN.topLettersLeft - 0.03;
  return PEN.topHiddenX + (end - PEN.topHiddenX) * k;
}

function bottomRevealEdge(t: number): number {
  if (t <= PEN.phaseDrop) return PEN.bottomHiddenX;
  const k = (t - PEN.phaseDrop) / (1 - PEN.phaseDrop);
  const end = PEN.bottomLettersRight + 0.05;
  return PEN.bottomHiddenX + (end - PEN.bottomHiddenX) * k;
}

type Phase = 'trace' | 'flash' | 'text' | 'exit';

interface ThemeColors {
  bgTop: string;
  bgBottom: string;
  logo: string;
  pen: string;
  penGlow: string;
  penCore: string;
  tipHalo: string;
  tipCore: string;
  ghostAlpha: number;
  textPercent: string;
  textLoading: string;
  textFooter: string;
  glowColor: string;
}

const darkColors: ThemeColors = {
  bgTop: '#0D0D0D',
  bgBottom: '#000000',
  logo: mwpLogoWhite,
  pen: 'rgba(239, 68, 68, 0.95)',
  penGlow: 'rgba(239, 68, 68, 0.30)',
  penCore: 'rgba(239, 68, 68, 0.95)',
  tipHalo: 'rgba(239, 68, 68, 0.35)',
  tipCore: 'rgba(255, 200, 200, 1)',
  ghostAlpha: 0.09,
  textPercent: '#9CA3AF',
  textLoading: '#6B7280',
  textFooter: '#6B7280',
  glowColor: '239, 68, 68',
};

const lightColors: ThemeColors = {
  bgTop: '#F8F9FC',
  bgBottom: '#FFFFFF',
  logo: mwpLogoBlack,
  pen: 'rgba(220, 38, 38, 0.90)',
  penGlow: 'rgba(220, 38, 38, 0.20)',
  penCore: 'rgba(220, 38, 38, 0.90)',
  tipHalo: 'rgba(220, 38, 38, 0.25)',
  tipCore: 'rgba(220, 38, 38, 1)',
  ghostAlpha: 0.07,
  textPercent: '#6B7280',
  textLoading: '#9CA3AF',
  textFooter: '#9CA3AF',
  glowColor: '220, 38, 38',
};

function getThemeColors(): ThemeColors {
  const isDark = document.documentElement.classList.contains('dark');
  return isDark ? darkColors : lightColors;
}

export function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState<Phase>('trace');
  const phaseRef = useRef<Phase>('trace');
  const onCompleteRef = useRef(onComplete);
  const colorsRef = useRef<ThemeColors>(getThemeColors());
  onCompleteRef.current = onComplete;

  // Detect theme and preload the correct logo
  useEffect(() => {
    colorsRef.current = getThemeColors();
    const img = new Image();
    img.src = colorsRef.current.logo;
    img.onload = () => { logoRef.current = img; };
  }, []);

  const drawCanvas = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const c = colorsRef.current;
    ctx.clearRect(0, 0, w, h);

    const tip = penTip(t);

    // Ghost logo
    ctx.globalAlpha = c.ghostAlpha;
    if (logoRef.current) ctx.drawImage(logoRef.current, 0, 0, w, h);
    ctx.globalAlpha = 1;

    // MYWORK band: visible right of topRevealEdge
    const tre = topRevealEdge(t);
    ctx.save();
    ctx.beginPath();
    ctx.rect(tre * w, 0, (1 - tre) * w, h * 0.66);
    ctx.clip();
    if (logoRef.current) ctx.drawImage(logoRef.current, 0, 0, w, h);
    ctx.restore();

    // PORTAL band: visible left of bottomRevealEdge
    const bre = bottomRevealEdge(t);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, h * 0.66, bre * w, h * 0.34);
    ctx.clip();
    if (logoRef.current) ctx.drawImage(logoRef.current, 0, 0, w, h);
    ctx.restore();

    // Pen line
    const px = (x: number) => x * w;
    const py = (y: number) => y * h;

    ctx.beginPath();
    ctx.moveTo(px(PEN.startX), py(PEN.topRailY));
    if (t <= PEN.phaseTop) {
      ctx.lineTo(px(tip.x), py(tip.y));
    } else {
      ctx.lineTo(px(PEN.leftX), py(PEN.topRailY));
      if (t <= PEN.phaseDrop) {
        ctx.lineTo(px(tip.x), py(tip.y));
      } else {
        ctx.lineTo(px(PEN.leftX), py(PEN.midRailY));
        ctx.lineTo(px(tip.x), py(tip.y));
      }
    }

    // Glow
    ctx.strokeStyle = c.penGlow;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = `rgba(${c.glowColor}, 0.5)`;
    ctx.shadowBlur = 8;
    ctx.stroke();

    // Core line
    ctx.shadowBlur = 0;
    ctx.strokeStyle = c.penCore;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tip halo
    ctx.beginPath();
    ctx.arc(px(tip.x), py(tip.y), 7, 0, Math.PI * 2);
    ctx.fillStyle = c.tipHalo;
    ctx.shadowColor = `rgba(${c.glowColor}, 0.6)`;
    ctx.shadowBlur = 10;
    ctx.fill();

    // Tip core
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(px(tip.x), py(tip.y), 2.2, 0, Math.PI * 2);
    ctx.fillStyle = c.tipCore;
    ctx.fill();
  }, []);

  // ── Main animation — runs once, owns the full lifecycle ──
  useEffect(() => {
    const TRACE_MS = 2600;
    const TEXT_DELAY = 300;
    const EXIT_DELAY = 1000;
    const EXIT_MS = 500;

    let raf = 0;
    let startTime = 0;
    let finished = false;

    function setPhaseState(p: Phase) {
      phaseRef.current = p;
      setPhase(p);
    }

    function tick(now: number) {
      if (finished) return;
      const elapsed = now - startTime;
      const total = TRACE_MS + TEXT_DELAY + EXIT_DELAY + EXIT_MS;

      if (elapsed >= total) {
        finished = true;
        onCompleteRef.current();
        return;
      }

      if (elapsed < TRACE_MS) {
        const raw = elapsed / TRACE_MS;
        const t = easeInOutCubic(raw);
        setPercent(Math.round(raw * 100));
        drawCanvas(t);
      } else if (elapsed < TRACE_MS + TEXT_DELAY) {
        if (phaseRef.current !== 'text') setPhaseState('text');
        drawCanvas(1);
      } else if (elapsed >= TRACE_MS + TEXT_DELAY + EXIT_DELAY) {
        if (phaseRef.current !== 'exit') setPhaseState('exit');
      }

      raf = requestAnimationFrame(tick);
    }

    const timer = setTimeout(() => {
      startTime = performance.now();
      raf = requestAnimationFrame(tick);
    }, 100);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [drawCanvas]);

  const showText = phase !== 'trace';
  const showFooter = showText;
  const c = colorsRef.current;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: `linear-gradient(to bottom, ${c.bgTop}, ${c.bgBottom})`,
        opacity: phase === 'exit' ? 0 : 1,
        transition: 'opacity 0.5s ease-in',
      }}
    >
      {/* Ambient glow */}
      <div
        className="absolute pointer-events-none"
        // style={{
        //   top: '30%',
        //   left: '50%',
        //   transform: 'translate(-50%, -50%)',
        //   width: 280,
        //   height: 200,
        //   borderRadius: '50%',
        //   boxShadow: `0 0 ${80 + percent * 0.4}px ${8 + percent * 0.14}px rgba(${c.glowColor}, ${0.05 + percent * 0.001})`,
        // }}
      />

      {/* Logo container */}
      <div className="relative" style={{ width: 320, height: 80, outline: 'none' }}>
        <canvas
          ref={canvasRef}
          width={320 * 2}
          height={80 * 2}
          style={{
            width: 320,
            height: 80,
            position: 'absolute',
            top: 0,
            left: 0,
            outline: 'none',
          }}
        />
      </div>

      {/* Status row */}
      <div className="mt-6 h-5 relative" style={{ width: 320 }}>
        {!showText && (
          <span
            className="absolute inset-0 flex items-center justify-center font-semibold"
            style={{ color: c.textPercent, fontSize: 13, letterSpacing: 0.4 }}
          >
            {percent}%
          </span>
        )}
        {showText && (
          <span
            className="absolute inset-0 flex items-center justify-center"
            style={{
              color: c.textLoading,
              fontSize: 14,
              letterSpacing: 0.3,
              opacity: 1,
              transform: 'translateY(0)',
              transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
            }}
          >
            Loading your workspace
          </span>
        )}
      </div>

      {/* Footer */}
      <div
        className="absolute bottom-8"
        style={{
          color: c.textFooter,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: 1.2,
          opacity: showFooter ? 0.55 : 0,
          transition: 'opacity 0.6s ease-out',
        }}
      >
        MyWorkPortal
      </div>
    </div>
  );
}
