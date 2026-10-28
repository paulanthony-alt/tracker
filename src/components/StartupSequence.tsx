/**
 * The startup sequence: an arc-reactor ring that powers up while Vyro loads,
 * shown each time the app opens after you sign in. It holds just short of
 * 100% until your data is ready, then says welcome and fades away. Tap or
 * press any key to skip; it can be turned off in Settings (per device).
 */
import { useEffect, useRef } from 'react';
import '@fontsource/michroma/latin-400.css';
import '@fontsource/rajdhani/latin-300.css';
import '@fontsource/rajdhani/latin-400.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import './startup.css';

const PREF_KEY = 'vyro.startupAnimation';

export function startupAnimationEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setStartupAnimationEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: it just keeps playing */
  }
}

const CY = '66,226,255';
const TAU = Math.PI * 2;
const STAGES: [number, string][] = [
  [0, 'Waking the core'],
  [0.2, 'Authenticating session'],
  [0.45, 'Loading your workspace'],
  [0.72, 'Syncing modules'],
  [0.93, 'All systems online'],
];
const KEYS = [
  [0, 0],
  [0.12, 0.07],
  [0.38, 0.34],
  [0.58, 0.52],
  [0.82, 0.88],
  [1, 1],
];
/** Where the sequence waits (fraction of its length) if your data isn't loaded yet. */
const HOLD = 0.88;
/** How long the welcome shows before fading, and how long the fade takes. */
const WELCOME_MS = 1800;
const FADE_MS = 1000;

/** Uneven progress, so it feels like real work rather than a timer. */
function prog(f: number) {
  for (let i = 1; i < KEYS.length; i++) {
    if (f <= KEYS[i][0]) {
      const a = KEYS[i - 1];
      const b = KEYS[i];
      const k = (f - a[0]) / (b[0] - a[0]);
      const e = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
      return a[1] + (b[1] - a[1]) * e;
    }
  }
  return 1;
}

export function StartupSequence({ ready, name, onDone }: { ready: boolean; name?: string; onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reactorRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const wordRef = useRef<HTMLHeadingElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const readyRef = useRef(ready);
  const nameRef = useRef(name);
  const doneRef = useRef(onDone);
  const welcomedRef = useRef(false);
  readyRef.current = ready;
  nameRef.current = name;
  doneRef.current = onDone;
  const welcome = (n?: string) => (n ? `Welcome back, ${n}` : 'Welcome back');

  // Your name can arrive a moment after the rest of your data; update the greeting if so.
  useEffect(() => {
    if (welcomedRef.current && statusRef.current) statusRef.current.textContent = welcome(name);
  }, [name]);

  useEffect(() => {
    const root = rootRef.current!;
    const cv = canvasRef.current!;
    const ctx = cv.getContext('2d');
    const reactor = reactorRef.current!;
    const pctEl = pctRef.current!;
    const statusEl = statusRef.current!;
    const word = wordRef.current!;
    const clock = clockRef.current!;
    const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const DURATION = RM ? 1600 : 4800;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

    let W = 0;
    let H = 0;
    let DPR = 1;
    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
    };
    window.addEventListener('resize', resize);
    resize();

    const P = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.2,
      a: 0.15 + Math.random() * 0.4,
      v: 0.004 + Math.random() * 0.012,
      d: Math.random() * TAU,
    }));

    let t0 = performance.now();
    const start = t0;
    let last = t0;
    let doneAt: number | null = null;
    let stageIdx = 0;
    let sayTimer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    let leaving = false;

    const say = (m: string) => {
      statusEl.classList.add('out');
      clearTimeout(sayTimer);
      sayTimer = setTimeout(() => {
        statusEl.textContent = welcomedRef.current ? welcome(nameRef.current) : m;
        statusEl.classList.remove('out');
      }, 180);
    };
    const leave = () => {
      if (leaving) return;
      leaving = true;
      root.classList.add('gone');
      later(() => doneRef.current(), FADE_MS);
    };
    const finish = () => {
      welcomedRef.current = true;
      say(welcome(nameRef.current));
      word.classList.add('lit');
      later(leave, WELCOME_MS);
    };

    // Skip: any tap, click or key. Keys are swallowed so they don't also trigger app shortcuts.
    const onKey = (e: KeyboardEvent) => {
      if (leaving) return;
      e.preventDefault();
      e.stopPropagation();
      leave();
    };
    window.addEventListener('keydown', onKey, true);
    root.addEventListener('click', leave);
    later(() => hintRef.current?.classList.add('show'), 1200);

    const tickClock = () => {
      clock.textContent = new Date().toLocaleTimeString([], { hour12: false });
    };
    tickClock();
    const clockTimer = setInterval(tickClock, 1000);

    const draw = (now: number, p: number, sec: number, doneT: number | null) => {
      if (!ctx) return;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const rc = reactor.getBoundingClientRect();
      const cx = rc.left + rc.width / 2;
      const cy = rc.top + rc.height / 2;
      const R = rc.width / 2;
      const m = Math.min(1, sec / 1.0);
      const A = 1 - Math.pow(1 - m, 3);
      const rot = RM ? 0 : sec;
      const pulse = 0.5 + 0.5 * Math.sin(sec * 2.2);
      const col = (a: number) => `rgba(${CY},${Math.max(0, a)})`;
      // Glow without shadowBlur (which is slow enough to hold up loading): a wide faint
      // stroke and a medium one under the bright line, added together by 'lighter'.
      const glowArc = (r: number, a0: number, a1: number, width: number, alpha: number, glow: number) => {
        for (const [w, k] of [
          [width + glow, 0.1],
          [width + glow * 0.45, 0.22],
          [width, 1],
        ] as const) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, a0, a1);
          ctx.lineWidth = w;
          ctx.strokeStyle = col(alpha * k);
          ctx.stroke();
        }
      };

      ctx.globalCompositeOperation = 'lighter';

      // drifting particles
      for (const q of P) {
        if (!RM) {
          q.y -= q.v * 3 * Math.min((now - last) / 1000, 0.05);
          q.x += Math.sin(q.d + sec * 0.3) * 0.0003;
          if (q.y < -0.02) q.y = 1.02;
        }
        ctx.beginPath();
        ctx.arc(q.x * W, q.y * H, q.r, 0, TAU);
        ctx.fillStyle = col(q.a * 0.6 * A);
        ctx.fill();
      }

      // ambient glow
      const ag = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.7);
      ag.addColorStop(0, col(0.09 * A));
      ag.addColorStop(1, col(0));
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.7, 0, TAU);
      ctx.fill();

      // radar sweep
      if (ctx.createConicGradient && !RM) {
        const g = ctx.createConicGradient(rot * 1.1 - Math.PI / 2, cx, cy);
        g.addColorStop(0, col(0));
        g.addColorStop(0.72, col(0));
        g.addColorStop(1, col((doneT === null ? 0.2 : 0.1) * A));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.7, 0, TAU);
        ctx.fill();
      }

      // outer tick ring with a bright head that follows progress
      const N = 144;
      const head = p * N;
      for (let i = 0; i < N; i++) {
        const a = -Math.PI / 2 + (i / N) * TAU;
        const major = i % 6 === 0;
        let b: number;
        if (doneT !== null) {
          b = 0.35 + 0.25 * Math.sin(a * 2 - sec * 1.6) + (1 - Math.min(doneT / 1.2, 1)) * 0.6;
        } else {
          const d = head - i;
          b = d >= 0 ? Math.max(0, 1 - d / 16) : Math.max(0, 1 + d / 1.5);
        }
        const len = (major ? 0.075 : 0.04) * R;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.lineTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
        ctx.lineWidth = major ? 1.6 : 1;
        ctx.strokeStyle = col((0.16 + 0.7 * b) * A);
        ctx.stroke();
      }

      // counter-rotating arc segments
      for (let k = 0; k < 3; k++) {
        const s = -rot * 0.15 + (k * TAU) / 3;
        glowArc(R * 0.9, s, s + 1.22, 1.5, 0.55 * A, 8);
      }

      // fine dotted ring
      ctx.setLineDash([1, 5]);
      ctx.lineDashOffset = -rot * 6;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.8, 0, TAU);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = col(0.32 * A);
      ctx.stroke();
      ctx.setLineDash([]);

      // progress ring
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.72, 0, TAU);
      ctx.lineWidth = 3;
      ctx.strokeStyle = col(0.12 * A);
      ctx.stroke();
      if (p > 0) {
        const end = -Math.PI / 2 + p * TAU;
        ctx.lineCap = 'round';
        glowArc(R * 0.72, -Math.PI / 2, end, 3, 0.95 * A, 16);
        ctx.lineCap = 'butt';
        if (p < 1) {
          ctx.beginPath();
          ctx.arc(cx + Math.cos(end) * R * 0.72, cy + Math.sin(end) * R * 0.72, 3.2, 0, TAU);
          ctx.fillStyle = `rgba(255,255,255,${A})`;
          ctx.fill();
        }
      }

      // reactor coils, they light up one by one
      for (let i = 0; i < 10; i++) {
        const a0 = -Math.PI / 2 + (i * TAU) / 10 + 0.07 + rot * 0.04;
        const lit = Math.max(0, Math.min(1, p * 10 - i));
        const flash = doneT !== null ? 0.15 * Math.sin(sec * 2 - i * 0.5) + 0.1 : 0;
        glowArc(R * 0.56, a0, a0 + TAU / 10 - 0.14, R * 0.07, (0.1 + 0.8 * lit + flash) * A, lit * 12);
      }

      // core
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
      cg.addColorStop(0, col((0.22 + 0.12 * pulse) * A));
      cg.addColorStop(0.55, col(0.07 * A));
      cg.addColorStop(1, col(0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.5, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.44, 0, TAU);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = col((0.35 + 0.3 * pulse) * A);
      ctx.stroke();

      // completion pulse
      if (doneT !== null && doneT < 1.6) {
        const k = doneT / 1.6;
        const e = 1 - Math.pow(1 - k, 3);
        glowArc(R * (0.72 + 0.9 * e), 0, TAU, 2, (1 - k) * 0.7, 16);
      }

      ctx.globalCompositeOperation = 'source-over';
    };

    const frame = (now: number) => {
      // Hold short of the end until your data has loaded, then carry on from there.
      if (!readyRef.current && now - t0 > HOLD * DURATION) t0 = now - HOLD * DURATION;
      const f = Math.min((now - t0) / DURATION, 1);
      const p = prog(f);
      if (f >= 1 && doneAt === null) {
        doneAt = now;
        finish();
      }
      if (doneAt === null) {
        let idx = 0;
        for (let i = 0; i < STAGES.length; i++) if (p >= STAGES[i][0]) idx = i;
        if (idx !== stageIdx) {
          stageIdx = idx;
          say(STAGES[idx][1]);
        }
      }
      pctEl.textContent = String(Math.round(p * 100));
      // The rings keep turning on the real clock, even while progress holds.
      draw(now, p, (now - start) / 1000, doneAt === null ? null : (now - doneAt) / 1000);
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(clockTimer);
      clearTimeout(sayTimer);
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey, true);
      root.removeEventListener('click', leave);
    };
  }, []);

  return (
    <div ref={rootRef} className="vyro-boot" aria-label="Vyro is starting">
      <div className="stage">
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="corner tl">
          <span className="dot" />
          Vyro<i>/</i>Secure session
        </div>
        <div ref={clockRef} className="corner tr">
          --:--:--
        </div>
        <section className="core">
          <div ref={reactorRef} className="reactor">
            <div className="pct">
              <span ref={pctRef}>0</span>
              <small>%</small>
            </div>
          </div>
          <h1 ref={wordRef} className="word">
            VYRO
          </h1>
          <p ref={statusRef} className="status" role="status" aria-live="polite">
            Waking the core
          </p>
        </section>
        <p ref={hintRef} className="hint">
          {window.matchMedia('(pointer: coarse)').matches ? 'Tap to skip' : 'Click or press any key to skip'}
        </p>
      </div>
    </div>
  );
}
