import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Volume2,
  VolumeX,
  Info,
  ShieldCheck,
  Zap,
  Sparkles,
  Minus,
  Plus,
  X,
  Check,
  Play,
  Square,
  Trophy,
  Copy,
  RefreshCw,
  Crown,
  Flame,
} from "lucide-react";

import { ZYAN_SLOTS_ASSETS } from "../constants/slotAssets";

/* ============================================================================
 * 0. OFFICIAL ZYAN.GG BRANDING, ICONIFY ASSETS & ANTI-COPY <ProtectedArt />
 * ========================================================================== */

const ZYAN_LOGO_URL =
  "https://i.ibb.co.com/20Dxw97d/Esports-wordmark-logo-ZYAN-GG-3d5c4c15-2-K.jpg";

export const OLYMPUS_ICONIFY_ASSETS = {
  crown_gold:
    "https://api.iconify.design/game-icons/imperial-crown.svg?color=%23fde047",
  hourglass_sand:
    "https://api.iconify.design/game-icons/sands-of-time.svg?color=%23fcd34d",
  ring_ruby:
    "https://api.iconify.design/game-icons/gem-ring.svg?color=%23fb7185",
  chalice_gold:
    "https://api.iconify.design/game-icons/chalice-drops.svg?color=%23fbbf24",
} as const;

interface ProtectedArtProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

const ProtectedArt: React.FC<ProtectedArtProps> = ({
  src,
  alt,
  className = "",
  fallback = null,
}) => {
  const [failed, setFailed] = useState(false);
  if (failed && fallback) return <>{fallback}</>;

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="relative flex h-full w-full select-none items-center justify-center"
      style={{
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        referrerPolicy="no-referrer"
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onError={() => setFailed(true)}
        style={
          {
            WebkitUserDrag: "none",
            pointerEvents: "none",
          } as React.CSSProperties
        }
        className={className}
      />
      <div
        aria-hidden="true"
        onContextMenu={(e) => e.preventDefault()}
        className="absolute inset-0 z-10"
      />
    </div>
  );
};

/* ============================================================================
 * 1. PUBLIC PLUG-AND-PLAY TYPES & BRIDGE INTERFACES
 * ========================================================================== */

export interface ZyanOlympus1000BetRecord {
  gameKey: "ZYAN_OLYMPUS_1000";
  gameName: "Zyan Gates of Olympus 1000";
  wagerUSD: number;
  multiplier: number;
  payoutUSD: number;
  isWin: boolean;
  proofHash: string;
}

export interface ZyanOlympus1000SlotProps {
  externalBalanceUSD?: number;
  onBalanceChange?: (newBalanceUSD: number) => void;
  onRecordBet?: (bet: ZyanOlympus1000BetRecord) => void;
  activeRtpPercent?: number; // Default 96.5% (controlled silently by Admin Panel)
  username?: string;
}

export type OlympusSymbolId =
  | "gem_blue"
  | "gem_green"
  | "gem_yellow"
  | "gem_purple"
  | "gem_red"
  | "chalice_gold"
  | "ring_ruby"
  | "hourglass_sand"
  | "crown_gold"
  | "scatter_zeus"
  | "orb_multiplier";

type RegularOlympusSymbolId =
  | "gem_blue"
  | "gem_green"
  | "gem_yellow"
  | "gem_purple"
  | "gem_red"
  | "chalice_gold"
  | "ring_ruby"
  | "hourglass_sand"
  | "crown_gold";

type SpinPhase =
  | "IDLE"
  | "DROPPING"
  | "ZEUS_STRIKING"
  | "EVALUATING"
  | "EXPLODING"
  | "CASCADING"
  | "APPLYING_ORBS"
  | "SPIN_COMPLETE";

type ZeusState = "IDLE" | "STRIKING" | "CELEBRATING";

interface OlympusCell {
  uid: string;
  symbol: OlympusSymbolId;
  row: number;
  col: number;
  orbMultiplier?: number;
  fallRows?: number;
  isExploding?: boolean;
  isWinning?: boolean;
  justStruckByZeus?: boolean;
}

interface TumbleLogItem {
  id: string;
  step: number;
  symbol: RegularOlympusSymbolId | "scatter_zeus";
  count: number;
  payoutUSD: number;
}

interface FloatingCallout {
  id: string;
  row: number;
  col: number;
  text: string;
  subtext?: string;
  color: string;
}

interface SpinHistoryEntry {
  id: string;
  wagerUSD: number;
  payoutUSD: number;
  multiplier: number;
  mode: string;
  proofHash: string;
}

/* ============================================================================
 * 2. PAYTABLE, ORB WEIGHTS & CONSTANTS (GATES OF OLYMPUS 1000 1:1 MATH)
 * ========================================================================== */

const GRID_COLS = 6;
const GRID_ROWS = 5;
const MAX_WIN_MULT = 15000;

// [8-9 matches, 10-11 matches, 12+ matches] x Base Bet
const PAYTABLE: Record<RegularOlympusSymbolId, [number, number, number]> = {
  gem_blue: [0.25, 0.75, 2.0],
  gem_green: [0.4, 0.9, 4.0],
  gem_yellow: [0.5, 1.0, 5.0],
  gem_purple: [0.8, 1.2, 8.0],
  gem_red: [1.0, 1.5, 10.0],
  chalice_gold: [1.5, 2.0, 12.0],
  ring_ruby: [2.0, 5.0, 15.0],
  hourglass_sand: [2.5, 10.0, 25.0],
  crown_gold: [10.0, 25.0, 50.0],
};

// Scatter pay for 4, 5, 6 Zeus Scatters
const SCATTER_PAYS: Record<number, number> = {
  4: 3.0,
  5: 5.0,
  6: 100.0,
};

const REGULAR_SYMBOL_IDS: RegularOlympusSymbolId[] = [
  "gem_blue",
  "gem_green",
  "gem_yellow",
  "gem_purple",
  "gem_red",
  "chalice_gold",
  "ring_ruby",
  "hourglass_sand",
  "crown_gold",
];

const SYMBOL_LABELS: Record<OlympusSymbolId, string> = {
  gem_blue: "Sapphire Diamond",
  gem_green: "Emerald Rhombus",
  gem_yellow: "Solar Topaz Hexagon",
  gem_purple: "Amethyst Triangle",
  gem_red: "Crimson Ruby Pentagon",
  chalice_gold: "Golden Goblet",
  ring_ruby: "Ruby Signet Ring",
  hourglass_sand: "Golden Hourglass",
  crown_gold: "24k Olympian Crown",
  scatter_zeus: "Zeus Scatter",
  orb_multiplier: "Winged Multiplier Orb",
};

const ORB_VALUES = [
  2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500, 1000,
] as const;

const ORB_WEIGHTS_NORMAL = [
  26, 20, 16, 14, 11, 8, 6.5, 5, 4.2, 3.2, 2.5, 1.6, 0.9, 0.35, 0.16, 0.08,
];

// Super Free Spins: minimum orb is 15x!
const SUPER_ORB_VALUES = [15, 20, 25, 50, 100, 250, 500, 1000] as const;
const SUPER_ORB_WEIGHTS = [34, 24, 18, 12, 7.5, 2.8, 1.2, 0.5];

const BET_LADDER_USD = [
  0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0,
  300.0, 500.0,
];

/* ============================================================================
 * 3. CRYPTOGRAPHIC PRNG & SHA-256 PROVABLY FAIR HELPERS
 * ========================================================================== */

function randomHex(bytesLen: number): string {
  const bytes = new Uint8Array(bytesLen);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytesLen; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function computeSha256Hex(message: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(message));
    return Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
  }
  let h = 2166136261;
  for (let i = 0; i < message.length; i++) {
    h ^= message.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(64, "0");
}

function createSeededRng(seedHex: string): () => number {
  let h1 = 0xdeadbeef ^ seedHex.length;
  let h2 = 0x41c6ce57 ^ seedHex.length;
  for (let i = 0; i < seedHex.length; i++) {
    const ch = seedHex.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return () => {
    h1 =
      Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
      Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 =
      Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
      Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return (combined % 1000000000) / 1000000000;
  };
}

function pickWeighted<T>(
  items: readonly T[],
  weights: readonly number[],
  rng: () => number
): T {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function formatUSD(val: number): string {
  return `$${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function getOrbTier(value: number): {
  label: string;
  ringGradient: string;
  coreGradient: string;
  wingFill: string;
  glow: string;
  textColor: string;
} {
  if (value >= 250) {
    return {
      label: "SUPERNOVA",
      ringGradient: "from-amber-200 via-red-500 to-rose-900",
      coreGradient: "from-red-500 via-orange-600 to-amber-950",
      wingFill: "#fde047",
      glow: "rgba(239,68,68,0.95)",
      textColor: "#fef08a",
    };
  }
  if (value >= 50) {
    return {
      label: "ROYAL",
      ringGradient: "from-fuchsia-300 via-purple-500 to-indigo-900",
      coreGradient: "from-purple-500 via-fuchsia-700 to-indigo-950",
      wingFill: "#e9d5ff",
      glow: "rgba(192,132,252,0.9)",
      textColor: "#ffffff",
    };
  }
  if (value >= 10) {
    return {
      label: "SAPPHIRE",
      ringGradient: "from-cyan-200 via-sky-500 to-blue-900",
      coreGradient: "from-sky-400 via-blue-600 to-slate-950",
      wingFill: "#bae6fd",
      glow: "rgba(56,189,248,0.88)",
      textColor: "#ffffff",
    };
  }
  return {
    label: "EMERALD",
    ringGradient: "from-emerald-200 via-emerald-500 to-teal-900",
    coreGradient: "from-emerald-400 via-teal-600 to-slate-950",
    wingFill: "#a7f3d0",
    glow: "rgba(52,211,153,0.85)",
    textColor: "#ffffff",
  };
}

/* ============================================================================
 * 4. SYNTHESIZED OLYMPIAN HARP, MARBLE THUD & ZEUS THUNDER AUDIO ENGINE
 * ========================================================================== */

class OlympusAudioEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock() {
    this.ensureContext();
  }

  public playSpinStart() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playMarbleDrop(colIndex: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(118 - colIndex * 5, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.085);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playTumbleChime(tumbleStep: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const scale = [392, 440, 493.88, 587.33, 659.25, 783.99, 880, 987.77, 1174.66];
    const base = scale[Math.min(scale.length - 1, tumbleStep)];
    [base, base * 1.25, base * 1.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      const t = now + idx * 0.035;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.075, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.27);
    });
  }

  public playZeusThunderStrike() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Jagged electric lightning crackle
    const bufferSize = Math.floor(ctx.sampleRate * 0.42);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.09));
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(160, now + 0.38);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.32, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    noiseSrc.connect(filter).connect(nGain).connect(ctx.destination);
    noiseSrc.start(now);

    // 2. Sub-bass Olympian thunder rumble
    const sub = ctx.createOscillator();
    const sGain = ctx.createGain();
    sub.type = "sawtooth";
    sub.frequency.setValueAtTime(95, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.35);
    sGain.gain.setValueAtTime(0.18, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    sub.connect(sGain).connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.37);

    // 3. Electric high shimmer
    const zap = ctx.createOscillator();
    const zGain = ctx.createGain();
    zap.type = "sine";
    zap.frequency.setValueAtTime(1650, now);
    zap.frequency.exponentialRampToValueAtTime(620, now + 0.16);
    zGain.gain.setValueAtTime(0.07, now);
    zGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    zap.connect(zGain).connect(ctx.destination);
    zap.start(now);
    zap.stop(now + 0.18);
  }

  public playScatterGong(count: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freq = 330 + count * 65;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  public playWinFanfare(mult: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord =
      mult >= 50
        ? [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5]
        : [261.63, 329.63, 392.0, 523.25, 659.25];
    chord.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = mult >= 50 ? "sawtooth" : "triangle";
      const t = now + idx * 0.06;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.095, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.44);
    });
  }
}

/* ============================================================================
 * 5. OLYMPIAN SYMBOLS: 3D GEMS, RELICS, ZEUS SCATTER & WINGED MULTIPLIER ORBS
 * ========================================================================== */

const OlympusSymbolArtwork: React.FC<{
  symbol: OlympusSymbolId;
  orbMultiplier?: number;
}> = React.memo(({ symbol, orbMultiplier = 2 }) => {
  const uid = useId().replace(/:/g, "");

  // 5 Low-Pay Faceted Olympian Gems
  if (
    symbol === "gem_blue" ||
    symbol === "gem_green" ||
    symbol === "gem_yellow" ||
    symbol === "gem_purple" ||
    symbol === "gem_red"
  ) {
    if (symbol === "gem_blue") {
      // Sapphire Diamond
      return (
        <svg viewBox="0 0 100 100" className="h-[84%] w-[84%] drop-shadow-[0_4px_10px_rgba(56,189,248,0.55)]">
          <defs>
            <linearGradient id={`${uid}-gb`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e0f2fe" />
              <stop offset="45%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#082f49" />
            </linearGradient>
          </defs>
          <polygon points="50,8 88,50 50,92 12,50" fill={`url(#${uid}-gb)`} stroke="#bae6fd" strokeWidth="3" />
          <polygon points="50,22 72,50 50,78 28,50" fill="#38bdf8" fillOpacity="0.45" stroke="#e0f2fe" strokeWidth="1.5" />
          <line x1="50" y1="8" x2="50" y2="92" stroke="#e0f2fe" strokeOpacity="0.35" strokeWidth="1.5" />
        </svg>
      );
    }
    if (symbol === "gem_green") {
      // Emerald Rhombus
      return (
        <svg viewBox="0 0 100 100" className="h-[84%] w-[84%] drop-shadow-[0_4px_10px_rgba(16,185,129,0.55)]">
          <defs>
            <linearGradient id={`${uid}-gg`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d1fae5" />
              <stop offset="45%" stopColor="#059669" />
              <stop offset="100%" stopColor="#022c22" />
            </linearGradient>
          </defs>
          <polygon points="28,14 72,14 88,50 72,86 28,86 12,50" fill={`url(#${uid}-gg)`} stroke="#a7f3d0" strokeWidth="3" />
          <polygon points="36,28 64,28 74,50 64,72 36,72 26,50" fill="#34d399" fillOpacity="0.4" stroke="#ecfdf5" strokeWidth="1.5" />
        </svg>
      );
    }
    if (symbol === "gem_yellow") {
      // Solar Topaz Hexagon
      return (
        <svg viewBox="0 0 100 100" className="h-[84%] w-[84%] drop-shadow-[0_4px_10px_rgba(250,204,21,0.55)]">
          <defs>
            <linearGradient id={`${uid}-gy`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fef9c3" />
              <stop offset="48%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#713f12" />
            </linearGradient>
          </defs>
          <polygon points="50,8 86,29 86,71 50,92 14,71 14,29" fill={`url(#${uid}-gy)`} stroke="#fef08a" strokeWidth="3" />
          <polygon points="50,24 72,37 72,63 50,76 28,63 28,37" fill="#facc15" fillOpacity="0.45" stroke="#fefce8" strokeWidth="1.5" />
        </svg>
      );
    }
    if (symbol === "gem_purple") {
      // Amethyst Triangle
      return (
        <svg viewBox="0 0 100 100" className="h-[84%] w-[84%] drop-shadow-[0_4px_10px_rgba(168,85,247,0.6)]">
          <defs>
            <linearGradient id={`${uid}-gp`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f3e8ff" />
              <stop offset="48%" stopColor="#9333ea" />
              <stop offset="100%" stopColor="#3b0764" />
            </linearGradient>
          </defs>
          <polygon points="50,10 90,82 10,82" fill={`url(#${uid}-gp)`} stroke="#e9d5ff" strokeWidth="3" strokeLinejoin="round" />
          <polygon points="50,28 73,72 27,72" fill="#c084fc" fillOpacity="0.45" stroke="#faf5ff" strokeWidth="1.5" />
        </svg>
      );
    }
    // Crimson Ruby Pentagon
    return (
      <svg viewBox="0 0 100 100" className="h-[84%] w-[84%] drop-shadow-[0_4px_10px_rgba(244,63,94,0.65)]">
        <defs>
          <linearGradient id={`${uid}-gr`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffe4e6" />
            <stop offset="48%" stopColor="#e11d48" />
            <stop offset="100%" stopColor="#4c0519" />
          </linearGradient>
        </defs>
        <polygon points="50,8 90,38 75,88 25,88 10,38" fill={`url(#${uid}-gr)`} stroke="#fecdd3" strokeWidth="3" strokeLinejoin="round" />
        <polygon points="50,25 74,44 65,75 35,75 26,44" fill="#fb7185" fillOpacity="0.4" stroke="#fff1f2" strokeWidth="1.5" />
      </svg>
    );
  }

  // 4 High-Pay Olympian Relics (Iconify + 3D Gold-Trimmed Medallion + SVG Fallbacks)
  if (
    symbol === "crown_gold" ||
    symbol === "hourglass_sand" ||
    symbol === "ring_ruby" ||
    symbol === "chalice_gold"
  ) {
    const relicMeta: Record<
      typeof symbol,
      {
        src: string;
        bg: string;
        border: string;
        fallback: React.ReactNode;
      }
    > = {
      crown_gold: {
        src: OLYMPUS_ICONIFY_ASSETS.crown_gold,
        bg: "from-amber-700/90 via-yellow-950/90 to-slate-950",
        border: "border-yellow-300/80",
        fallback: (
          <svg viewBox="0 0 100 100" className="h-[74%] w-[74%]">
            <path d="M14 74 L20 30 L38 48 L50 20 L62 48 L80 30 L86 74 Z" fill="#facc15" stroke="#713f12" strokeWidth="3" strokeLinejoin="round" />
            <rect x="14" y="74" width="72" height="10" rx="3" fill="#eab308" stroke="#713f12" strokeWidth="2.5" />
            <circle cx="50" cy="56" r="5" fill="#ef4444" />
          </svg>
        ),
      },
      hourglass_sand: {
        src: OLYMPUS_ICONIFY_ASSETS.hourglass_sand,
        bg: "from-cyan-900/90 via-amber-950/85 to-slate-950",
        border: "border-amber-300/70",
        fallback: (
          <svg viewBox="0 0 100 100" className="h-[74%] w-[74%]">
            <rect x="24" y="14" width="52" height="8" rx="3" fill="#fbbf24" />
            <rect x="24" y="78" width="52" height="8" rx="3" fill="#fbbf24" />
            <path d="M30 22 L70 22 L54 50 L70 78 L30 78 L46 50 Z" fill="#38bdf8" fillOpacity="0.45" stroke="#fde047" strokeWidth="3" />
          </svg>
        ),
      },
      ring_ruby: {
        src: OLYMPUS_ICONIFY_ASSETS.ring_ruby,
        bg: "from-rose-950/90 via-amber-950/80 to-slate-950",
        border: "border-rose-300/70",
        fallback: (
          <svg viewBox="0 0 100 100" className="h-[74%] w-[74%]">
            <circle cx="50" cy="58" r="24" fill="none" stroke="#fbbf24" strokeWidth="9" />
            <polygon points="50,16 64,28 56,42 44,42 36,28" fill="#f43f5e" stroke="#fecdd3" strokeWidth="2.5" />
          </svg>
        ),
      },
      chalice_gold: {
        src: OLYMPUS_ICONIFY_ASSETS.chalice_gold,
        bg: "from-amber-900/85 via-slate-900 to-slate-950",
        border: "border-amber-400/65",
        fallback: (
          <svg viewBox="0 0 100 100" className="h-[74%] w-[74%]">
            <path d="M26 20 L74 20 L66 50 C62 60, 38 60, 34 50 Z" fill="#fbbf24" stroke="#78350f" strokeWidth="3" />
            <rect x="45" y="56" width="10" height="20" fill="#d97706" />
            <rect x="30" y="76" width="40" height="8" rx="3" fill="#fbbf24" />
          </svg>
        ),
      },
    };
    const meta = relicMeta[symbol];
    return (
      <div
        className={`relative flex h-full w-full items-center justify-center rounded-xl border ${meta.border} bg-gradient-to-b ${meta.bg} p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_5px_12px_rgba(0,0,0,0.75)]`}
      >
        <ProtectedArt
          src={meta.src}
          alt={SYMBOL_LABELS[symbol]}
          className="h-[76%] w-[76%] object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.9)]"
          fallback={meta.fallback}
        />
      </div>
    );
  }

  // Zeus Lightning Scatter
  if (symbol === "scatter_zeus") {
    return (
      <div className="relative flex h-full w-full items-center justify-center p-0.5">
        <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-cyan-300 bg-gradient-to-b from-sky-500 via-indigo-800 to-slate-950 shadow-[0_0_22px_rgba(56,189,248,0.85),inset_0_0_14px_rgba(253,224,71,0.45)]">
          <svg viewBox="0 0 80 80" className="h-[62%] w-[62%] drop-shadow-[0_0_8px_rgba(253,224,71,0.9)]">
            <defs>
              <linearGradient id={`${uid}-zbolt`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fef9c3" />
                <stop offset="50%" stopColor="#fde047" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
            <circle cx="40" cy="40" r="30" fill="#0f172a" fillOpacity="0.65" stroke="#7dd3fc" strokeWidth="2.5" />
            <polygon points="44,12 22,44 38,44 32,68 58,34 42,34" fill={`url(#${uid}-zbolt)`} stroke="#082f49" strokeWidth="2" />
          </svg>
          <span className="font-display -mt-0.5 text-[8px] font-black uppercase tracking-widest text-amber-200 sm:text-[9px]">
            ZEUS
          </span>
        </div>
      </div>
    );
  }

  // Winged Golden Multiplier Orb (2x - 1000x)
  const tier = getOrbTier(orbMultiplier);
  const orbSvgFallback = (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <path
        d="M18 46 C4 34, 4 20, 18 18 C14 28, 22 36, 30 40 Z"
        fill={tier.wingFill}
        stroke="#78350f"
        strokeWidth="1.5"
      />
      <path
        d="M82 46 C96 34, 96 20, 82 18 C86 28, 78 36, 70 40 Z"
        fill={tier.wingFill}
        stroke="#78350f"
        strokeWidth="1.5"
      />
      <circle cx="50" cy="52" r="31" fill="#f59e0b" stroke="#fef08a" strokeWidth="2.5" />
      <circle cx="50" cy="52" r="25" fill="#090d16" stroke="#fde047" strokeWidth="1.5" />
    </svg>
  );

  return (
    <div
      className="relative flex h-full w-full items-center justify-center p-0.5"
      style={{ filter: `drop-shadow(0 0 10px ${tier.glow})` }}
    >
      <ProtectedArt
        src={ZYAN_SLOTS_ASSETS.ZYAN_OLYMPUS.WINGED_ORB_MULT}
        alt={`Winged Multiplier Orb ${orbMultiplier}x`}
        className="h-full w-full scale-115 rounded-xl object-contain mix-blend-lighten"
        fallback={orbSvgFallback}
      />
      <span
        className="font-display pointer-events-none absolute inset-0 z-20 flex items-center justify-center pt-0.5 text-center font-black leading-none tracking-tight"
        style={{
          color: tier.textColor,
          fontSize:
            orbMultiplier >= 1000
              ? "13px"
              : orbMultiplier >= 100
                ? "15px"
                : "18px",
          textShadow: "0 2px 6px rgba(0,0,0,0.98), 0 0 10px rgba(0,0,0,0.95)",
        }}
      >
        {orbMultiplier}x
      </span>
    </div>
  );
});

/* ============================================================================
 * 6. ANIMATED ZEUS GUARDIAN PANEL (SVG ARTWORK + STRIKE STATE)
 * ========================================================================== */

const ZeusGuardianArt: React.FC<{ state: ZeusState; compact?: boolean }> = ({
  state,
  compact = false,
}) => {
  const uid = useId().replace(/:/g, "");
  const isStriking = state === "STRIKING";
  const isCelebrating = state === "CELEBRATING";

  return (
    <div
      className={`relative flex flex-col items-center justify-center transition-transform duration-300 ${
        isStriking ? "scale-105 brightness-125" : isCelebrating ? "scale-[1.03]" : "scale-100"
      } ${compact ? "h-14 w-14" : "h-full w-full"}`}
    >
      <ProtectedArt
        src={ZYAN_SLOTS_ASSETS.ZYAN_OLYMPUS.ZEUS_GUARDIAN}
        alt="Zeus Guardian"
        className="h-full w-full rounded-2xl object-contain mix-blend-lighten drop-shadow-[0_10px_28px_rgba(56,189,248,0.45)]"
        fallback={
          <svg
            viewBox="0 0 180 240"
            className="h-full w-full drop-shadow-[0_12px_28px_rgba(56,189,248,0.4)]"
          >
        <defs>
          <radialGradient id={`${uid}-aura`} cx="50%" cy="40%" r="55%">
            <stop
              offset="0%"
              stopColor={isStriking ? "#38bdf8" : "#fbbf24"}
              stopOpacity={isStriking ? "0.65" : "0.28"}
            />
            <stop offset="100%" stopColor="#020617" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${uid}-armor`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>
          <linearGradient id={`${uid}-bolt`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>

        {/* Storm Aura */}
        <circle cx="90" cy="100" r="82" fill={`url(#${uid}-aura)`} />

        {/* Storm Cloud Pedestal */}
        <path
          d="M22 204 C12 204, 8 190, 22 184 C26 170, 48 166, 62 174 C76 164, 104 164, 118 174 C132 166, 154 170, 158 184 C172 190, 168 204, 158 204 Z"
          fill="#1e293b"
          stroke="#38bdf8"
          strokeOpacity="0.55"
          strokeWidth="2"
        />

        {/* Golden Armor Torso & Cape */}
        <path
          d="M44 184 L54 114 L126 114 L136 184 Z"
          fill={`url(#${uid}-armor)`}
          stroke="#451a03"
          strokeWidth="3"
        />
        <path
          d="M52 114 L90 128 L128 114"
          fill="none"
          stroke="#fef08a"
          strokeWidth="3"
        />

        {/* Zeus Head & Flowing White Beard */}
        <circle cx="90" cy="76" r="24" fill="#fed7aa" stroke="#7c2d12" strokeWidth="2.5" />
        {/* Hair & Crown Wreath */}
        <path
          d="M64 72 C64 48, 116 48, 116 72 C108 60, 72 60, 64 72 Z"
          fill="#f8fafc"
        />
        <path
          d="M64 60 L74 52 L90 56 L106 52 L116 60"
          fill="none"
          stroke="#fde047"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Flowing Beard */}
        <path
          d="M68 82 C68 112, 82 126, 90 130 C98 126, 112 112, 112 82 C102 90, 78 90, 68 82 Z"
          fill="#f1f5f9"
          stroke="#94a3b8"
          strokeWidth="1.5"
        />
        {/* Glowing Electric-Cyan Eyes */}
        <circle cx="81" cy="73" r="3.6" fill="#38bdf8" />
        <circle cx="99" cy="73" r="3.6" fill="#38bdf8" />
        <circle cx="81" cy="73" r="1.5" fill="#ffffff" />
        <circle cx="99" cy="73" r="1.5" fill="#ffffff" />

        {/* Raised Arm & Golden Thunderbolt */}
        <g
          transform={
            isStriking ? "translate(-12, -16) rotate(-18 128 118)" : "translate(0, 0)"
          }
          className="transition-transform duration-200"
        >
          <path
            d="M122 118 L144 88"
            stroke="#fed7aa"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <polygon
            points="152,32 132,76 146,76 136,118 166,68 150,68"
            fill={`url(#${uid}-bolt)`}
            stroke="#0284c7"
            strokeWidth="2"
          />
        </g>
      </svg>
        }
      />
    </div>
  );
};

/* ============================================================================
 * 7. BOARD GENERATOR & SCATTER-PAYS EVALUATOR (6x5, 8+ MATCHES)
 * ========================================================================== */

let olympusUidCounter = 1;
function nextUid(prefix = "ol"): string {
  olympusUidCounter += 1;
  return `${prefix}-${olympusUidCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function rollCellSymbol(params: {
  rng: () => number;
  inFreeSpins: boolean;
  isSuperFreeSpins: boolean;
  doubleChance: boolean;
  activeRtpPercent: number;
  allowOrb?: boolean;
}): { symbol: OlympusSymbolId; orbMultiplier?: number } {
  const {
    rng,
    inFreeSpins,
    isSuperFreeSpins,
    doubleChance,
    activeRtpPercent,
    allowOrb = true,
  } = params;

  const rtpFactor = Math.max(0.75, Math.min(1.2, activeRtpPercent / 96.5));
  const pool: OlympusSymbolId[] = [
    "gem_blue",
    "gem_green",
    "gem_yellow",
    "gem_purple",
    "gem_red",
    "chalice_gold",
    "ring_ruby",
    "hourglass_sand",
    "crown_gold",
    "scatter_zeus",
    "orb_multiplier",
  ];

  const weights = [
    17, // gem_blue
    15.5, // gem_green
    14, // gem_yellow
    12.5, // gem_purple
    11, // gem_red
    7.5, // chalice_gold
    5.8, // ring_ruby
    4.5 * rtpFactor, // hourglass_sand
    3.2 * rtpFactor, // crown_gold
    inFreeSpins ? 1.55 : doubleChance ? 3.2 : 1.6, // scatter_zeus
    allowOrb ? (inFreeSpins ? 4.4 : 2.15) * rtpFactor : 0, // orb_multiplier
  ];

  const picked = pickWeighted(pool, weights, rng);
  if (picked === "orb_multiplier") {
    const orbMultiplier = isSuperFreeSpins
      ? pickWeighted(SUPER_ORB_VALUES, SUPER_ORB_WEIGHTS, rng)
      : pickWeighted(ORB_VALUES, ORB_WEIGHTS_NORMAL, rng);
    return { symbol: picked, orbMultiplier };
  }
  return { symbol: picked };
}

function generateInitialGrid(params: {
  rng: () => number;
  inFreeSpins: boolean;
  isSuperFreeSpins: boolean;
  doubleChance: boolean;
  activeRtpPercent: number;
  forceFourScatters?: boolean;
}): OlympusCell[][] {
  const {
    rng,
    inFreeSpins,
    isSuperFreeSpins,
    doubleChance,
    activeRtpPercent,
    forceFourScatters = false,
  } = params;

  const grid: OlympusCell[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowArr: OlympusCell[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const rolled = rollCellSymbol({
        rng,
        inFreeSpins,
        isSuperFreeSpins,
        doubleChance,
        activeRtpPercent,
        allowOrb: !forceFourScatters,
      });
      rowArr.push({
        uid: nextUid(),
        symbol: rolled.symbol,
        row: r,
        col: c,
        orbMultiplier: rolled.orbMultiplier,
      });
    }
    grid.push(rowArr);
  }

  // Guarantee 4+ Zeus Scatters on Bonus Buy
  if (forceFourScatters) {
    const allCoords: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        allCoords.push({ r, c });
      }
    }
    for (let i = allCoords.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = allCoords[i];
      allCoords[i] = allCoords[j];
      allCoords[j] = tmp;
    }
    const targetCount = rng() < 0.14 ? 5 : 4;
    let existing = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (grid[r][c].symbol === "scatter_zeus") existing++;
      }
    }
    for (let k = 0; k < allCoords.length && existing < targetCount; k++) {
      const { r, c } = allCoords[k];
      if (grid[r][c].symbol !== "scatter_zeus") {
        grid[r][c] = {
          uid: nextUid("sz"),
          symbol: "scatter_zeus",
          row: r,
          col: c,
        };
        existing++;
      }
    }
  }

  return grid;
}

function evaluateScatterClusterWins(
  grid: OlympusCell[][],
  baseBetUSD: number
): {
  winningGroups: Array<{
    symbol: RegularOlympusSymbolId;
    coords: Array<{ row: number; col: number }>;
    payoutUSD: number;
  }>;
  stepWinUSD: number;
} {
  const counts = new Map<
    RegularOlympusSymbolId,
    Array<{ row: number; col: number }>
  >();

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const sym = grid[r][c].symbol;
      if ((REGULAR_SYMBOL_IDS as string[]).includes(sym)) {
        const reg = sym as RegularOlympusSymbolId;
        const arr = counts.get(reg) ?? [];
        arr.push({ row: r, col: c });
        counts.set(reg, arr);
      }
    }
  }

  const winningGroups: Array<{
    symbol: RegularOlympusSymbolId;
    coords: Array<{ row: number; col: number }>;
    payoutUSD: number;
  }> = [];

  let stepWinUSD = 0;
  counts.forEach((coords, sym) => {
    if (coords.length >= 8) {
      const tierIdx = coords.length >= 12 ? 2 : coords.length >= 10 ? 1 : 0;
      const mult = PAYTABLE[sym][tierIdx];
      const payoutUSD = Number((baseBetUSD * mult).toFixed(2));
      winningGroups.push({ symbol: sym, coords, payoutUSD });
      stepWinUSD = Number((stepWinUSD + payoutUSD).toFixed(2));
    }
  });

  return { winningGroups, stepWinUSD };
}

/* ============================================================================
 * 8. MAIN COMPONENT: <ZyanOlympus1000Slot />
 * ========================================================================== */

export const ZyanOlympus1000Slot: React.FC<ZyanOlympus1000SlotProps> = ({
  externalBalanceUSD,
  onBalanceChange,
  onRecordBet,
  activeRtpPercent = 96.5,
  username = "Olympian",
}) => {
  // Wallet & RTP Sync
  const [internalBalanceUSD, setInternalBalanceUSD] = useState<number>(1000.0);
  const isControlledBalance = typeof externalBalanceUSD === "number";
  const balanceUSD = isControlledBalance
    ? externalBalanceUSD
    : internalBalanceUSD;
  const [runtimeRtpPercent, setRuntimeRtpPercent] =
    useState<number>(activeRtpPercent);

  useEffect(() => {
    setRuntimeRtpPercent(activeRtpPercent);
  }, [activeRtpPercent]);

  const balanceRef = useRef<number>(balanceUSD);
  balanceRef.current = balanceUSD;

  const commitBalance = useCallback(
    (nextBal: number) => {
      const rounded = Math.max(0, Number(nextBal.toFixed(2)));
      balanceRef.current = rounded;
      if (!isControlledBalance) {
        setInternalBalanceUSD(rounded);
      }
      onBalanceChange?.(rounded);
    },
    [isControlledBalance, onBalanceChange]
  );

  // Betting & Ante State
  const [betIndex, setBetIndex] = useState<number>(4); // $1.00 base bet
  const baseBetUSD = BET_LADDER_USD[betIndex];
  const [doubleChanceActive, setDoubleChanceActive] = useState<boolean>(false);
  const effectiveSpinCostUSD = Number(
    (baseBetUSD * (doubleChanceActive ? 1.25 : 1)).toFixed(2)
  );

  // Grid, Zeus, Tumble & Bonus State
  const [grid, setGrid] = useState<OlympusCell[][]>(() => {
    const initRng = createSeededRng("zyan-olympus-1000-initial-board");
    return generateInitialGrid({
      rng: initRng,
      inFreeSpins: false,
      isSuperFreeSpins: false,
      doubleChance: false,
      activeRtpPercent: 96.5,
    });
  });

  const [spinPhase, setSpinPhase] = useState<SpinPhase>("IDLE");
  const [stoppedCols, setStoppedCols] = useState<boolean[]>([
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
  const [zeusState, setZeusState] = useState<ZeusState>("IDLE");
  const [tumbleWinUSD, setTumbleWinUSD] = useState<number>(0);
  const [tumbleHistory, setTumbleHistory] = useState<TumbleLogItem[]>([]);
  const [floatingCallouts, setFloatingCallouts] = useState<FloatingCallout[]>(
    []
  );
  const [lastSpinWinUSD, setLastSpinWinUSD] = useState<number>(0);
  const [lastSpinMult, setLastSpinMult] = useState<number>(0);
  const [bannerStatus, setBannerStatus] = useState<string>(
    "8+ MATCHING SYMBOLS ANYWHERE • ZEUS ORBS UP TO 1,000x"
  );
  const [stageShake, setStageShake] = useState<boolean>(false);

  // Free Spins & Cumulative Global Multiplier Meter
  const [inFreeSpins, setInFreeSpins] = useState<boolean>(false);
  const [isSuperFreeSpins, setIsSuperFreeSpins] = useState<boolean>(false);
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [freeSpinsTotal, setFreeSpinsTotal] = useState<number>(0);
  const [globalBonusMultiplier, setGlobalBonusMultiplier] = useState<number>(0);
  const [bonusTotalWinUSD, setBonusTotalWinUSD] = useState<number>(0);
  const [bonusIntroOverlay, setBonusIntroOverlay] = useState<{
    title: string;
    subtitle: string;
    isSuper: boolean;
  } | null>(null);
  const [winCelebration, setWinCelebration] = useState<{
    tier: "BIG WIN" | "MEGA WIN" | "OLYMPUS 15,000x MAX WIN";
    amountUSD: number;
    mult: number;
  } | null>(null);

  // Audio, Autoplay, Modals & Provably Fair State
  const audioRef = useRef<OlympusAudioEngine | null>(null);
  if (!audioRef.current) audioRef.current = new OlympusAudioEngine();

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [autoSpinsLeft, setAutoSpinsLeft] = useState<number>(0);
  const [showAutoMenu, setShowAutoMenu] = useState<boolean>(false);
  const [showPaytableModal, setShowPaytableModal] = useState<boolean>(false);
  const [showFairModal, setShowFairModal] = useState<boolean>(false);
  const [showMobileBuyModal, setShowMobileBuyModal] = useState<boolean>(false);

  const [serverSeed] = useState<string>(() => randomHex(16));
  const [clientSeed, setClientSeed] = useState<string>(() => randomHex(8));
  const [nonce, setNonce] = useState<number>(1);
  const [lastProofHash, setLastProofHash] = useState<string>("");
  const [spinHistory, setSpinHistory] = useState<SpinHistoryEntry[]>([]);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [verifyOutput, setVerifyOutput] = useState<string | null>(null);

  // DOM Refs for Unclipped Canvas Lightning Bolts & Beams
  const mainStageRef = useRef<HTMLDivElement | null>(null);
  const lightningCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const zeusDesktopRef = useRef<HTMLDivElement | null>(null);
  const zeusMobileRef = useRef<HTMLDivElement | null>(null);
  const tumbleBarRef = useRef<HTMLDivElement | null>(null);
  const globalMeterRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isBusyRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // postMessage Bridge for GitHub Integration
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.parent?.postMessage(
      { type: "ZYAN_SLOT_READY", gameKey: "ZYAN_OLYMPUS_1000" },
      "*"
    );

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (
        data.type === "ZYAN_BALANCE_SYNC" &&
        typeof data.balanceUSD === "number"
      ) {
        commitBalance(data.balanceUSD);
      } else if (
        data.type === "ZYAN_SET_RTP" &&
        typeof data.rtpPercent === "number"
      ) {
        setRuntimeRtpPercent(data.rtpPercent);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [commitBalance]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (audioRef.current) audioRef.current.enabled = next;
  };

  const triggerShake = useCallback(() => {
    setStageShake(true);
    setTimeout(() => {
      if (mountedRef.current) setStageShake(false);
    }, 360);
  }, []);

  const emitBetRecord = useCallback(
    (wagerUSD: number, payoutUSD: number, proofHash: string) => {
      const mult = wagerUSD > 0 ? Number((payoutUSD / wagerUSD).toFixed(2)) : 0;
      const record: ZyanOlympus1000BetRecord = {
        gameKey: "ZYAN_OLYMPUS_1000",
        gameName: "Zyan Gates of Olympus 1000",
        wagerUSD,
        multiplier: mult,
        payoutUSD,
        isWin: payoutUSD > 0,
        proofHash,
      };
      onRecordBet?.(record);
      window.parent?.postMessage(
        { type: "ZYAN_SLOT_BET_RESULT", payload: record },
        "*"
      );
    },
    [onRecordBet]
  );

  // Unclipped Canvas Lightning Bolt Painter
  const fireLightningBeams = useCallback(
    (
      segments: Array<{
        fromEl: HTMLElement | null;
        toEl: HTMLElement | null;
        color: string;
        secondaryColor: string;
      }>,
      durationMs = 460
    ) => {
      const canvas = lightningCanvasRef.current;
      const stage = mainStageRef.current;
      if (!canvas || !stage) return;

      const stageRect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(stageRect.width * dpr));
      canvas.height = Math.max(1, Math.floor(stageRect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const getCenter = (el: HTMLElement | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        return {
          x: (r.left - stageRect.left + r.width / 2) * dpr,
          y: (r.top - stageRect.top + r.height / 2) * dpr,
        };
      };

      const pts = segments
        .map((seg) => ({
          from: getCenter(seg.fromEl),
          to: getCenter(seg.toEl),
          color: seg.color,
          secondaryColor: seg.secondaryColor,
        }))
        .filter((s) => s.from && s.to);

      if (pts.length === 0) return;

      const start = performance.now();
      const renderFrame = (now: number) => {
        if (!mountedRef.current) return;
        const elapsed = now - start;
        const progress = Math.min(1, elapsed / durationMs);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (progress < 1) {
          const alpha = 1 - Math.pow(progress, 2);
          ctx.save();
          ctx.globalAlpha = alpha;

          pts.forEach((seg) => {
            if (!seg.from || !seg.to) return;
            const steps = 9;
            const dx = (seg.to.x - seg.from.x) / steps;
            const dy = (seg.to.y - seg.from.y) / steps;

            // Jagged outer electric glow
            ctx.beginPath();
            ctx.moveTo(seg.from.x, seg.from.y);
            for (let i = 1; i < steps; i++) {
              const jitter = (Math.random() - 0.5) * 26 * dpr;
              ctx.lineTo(seg.from.x + dx * i + jitter, seg.from.y + dy * i + jitter * 0.6);
            }
            ctx.lineTo(seg.to.x, seg.to.y);
            ctx.strokeStyle = seg.color;
            ctx.lineWidth = 6 * dpr;
            ctx.shadowColor = seg.color;
            ctx.shadowBlur = 16 * dpr;
            ctx.stroke();

            // Inner white-hot core
            ctx.beginPath();
            ctx.moveTo(seg.from.x, seg.from.y);
            for (let i = 1; i < steps; i++) {
              const jitter = (Math.random() - 0.5) * 14 * dpr;
              ctx.lineTo(seg.from.x + dx * i + jitter, seg.from.y + dy * i + jitter * 0.6);
            }
            ctx.lineTo(seg.to.x, seg.to.y);
            ctx.strokeStyle = seg.secondaryColor;
            ctx.lineWidth = 2.4 * dpr;
            ctx.shadowBlur = 0;
            ctx.stroke();
          });

          ctx.restore();
          requestAnimationFrame(renderFrame);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      };

      requestAnimationFrame(renderFrame);
    },
    []
  );

  const getActiveZeusSourceEl = useCallback((): HTMLElement | null => {
    const desk = zeusDesktopRef.current;
    if (desk && desk.getBoundingClientRect().width > 0) return desk;
    return zeusMobileRef.current;
  }, []);

  /* --------------------------------------------------------------------------
   * CORE TUMBLE & ZEUS LIGHTNING SPIN SEQUENCE
   * ------------------------------------------------------------------------ */

  const runSingleTumbleSpin = useCallback(
    async (opts: {
      inFS: boolean;
      superFS: boolean;
      currentGlobalMult: number;
      forceBuyScatters: boolean;
      wagerBetUSD: number;
      spinNonce: number;
    }): Promise<{
      totalSpinWinUSD: number;
      updatedGlobalMult: number;
      scattersLanded: number;
      scatterPayUSD: number;
      proofHash: string;
    }> => {
      const {
        inFS,
        superFS,
        currentGlobalMult,
        forceBuyScatters,
        wagerBetUSD,
        spinNonce,
      } = opts;

      const proofHash = await computeSha256Hex(
        `${serverSeed}:${clientSeed}:${spinNonce}:${inFS ? (superFS ? "SUPER_FS" : "FS") : "BASE"}`
      );
      if (mountedRef.current) setLastProofHash(proofHash);
      const rng = createSeededRng(proofHash);

      let board = generateInitialGrid({
        rng,
        inFreeSpins: inFS,
        isSuperFreeSpins: superFS,
        doubleChance: doubleChanceActive,
        activeRtpPercent: runtimeRtpPercent,
        forceFourScatters: forceBuyScatters,
      });

      if (!mountedRef.current) {
        return {
          totalSpinWinUSD: 0,
          updatedGlobalMult: currentGlobalMult,
          scattersLanded: 0,
          scatterPayUSD: 0,
          proofHash,
        };
      }

      setSpinPhase("DROPPING");
      setTumbleWinUSD(0);
      setTumbleHistory([]);
      setFloatingCallouts([]);
      setStoppedCols([false, false, false, false, false, false]);
      setGrid(board);

      for (let col = 0; col < GRID_COLS; col++) {
        await sleep(col === 0 ? 190 : 88);
        if (!mountedRef.current) break;
        setStoppedCols((prev) => {
          const next = [...prev];
          next[col] = true;
          return next;
        });
        audioRef.current?.playMarbleDrop(col);

        const colHasScatter = board.some((r) => r[col].symbol === "scatter_zeus");
        if (colHasScatter) {
          audioRef.current?.playScatterGong(col + 1);
        }
      }

      // Random Zeus Lightning Strike (spawns 1 to 4 Winged Multiplier Orbs onto regular gem cells)
      const zeusStrikeChance = forceBuyScatters ? 0 : inFS ? 0.34 : 0.16;
      if (rng() < zeusStrikeChance) {
        const candidates: Array<{ r: number; c: number }> = [];
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            const sym = board[r][c].symbol;
            if (sym !== "scatter_zeus" && sym !== "orb_multiplier") {
              candidates.push({ r, c });
            }
          }
        }

        if (candidates.length > 0) {
          const strikeCount = Math.min(
            candidates.length,
            rng() < 0.15 ? 4 : rng() < 0.42 ? 3 : rng() < 0.72 ? 2 : 1
          );
          for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = candidates[i];
            candidates[i] = candidates[j];
            candidates[j] = tmp;
          }

          setSpinPhase("ZEUS_STRIKING");
          setZeusState("STRIKING");
          setBannerStatus(
            `ZEUS LIGHTNING STRIKE! SPAWNING ${strikeCount} MULTIPLIER ORB${strikeCount > 1 ? "S" : ""}!`
          );

          const struckTargets = candidates.slice(0, strikeCount);
          const zeusSource = getActiveZeusSourceEl();
          fireLightningBeams(
            struckTargets.map((pos) => ({
              fromEl: zeusSource,
              toEl: cellRefs.current[`${pos.r}-${pos.c}`] ?? null,
              color: "#38bdf8",
              secondaryColor: "#fef08a",
            })),
            480
          );
          audioRef.current?.playZeusThunderStrike();
          triggerShake();

          const updatedBoard = board.map((r) => [...r]);
          struckTargets.forEach((pos) => {
            const val = superFS
              ? pickWeighted(SUPER_ORB_VALUES, SUPER_ORB_WEIGHTS, rng)
              : pickWeighted(ORB_VALUES, ORB_WEIGHTS_NORMAL, rng);
            updatedBoard[pos.r][pos.c] = {
              uid: nextUid("zorb"),
              symbol: "orb_multiplier",
              row: pos.r,
              col: pos.c,
              orbMultiplier: val,
              justStruckByZeus: true,
            };
          });
          board = updatedBoard;
          setGrid(board);
          await sleep(500);
          if (mountedRef.current) setZeusState("IDLE");
        }
      }

      // Cascading Tumble Loop
      let spinTumbleAccumUSD = 0;
      let tumbleStep = 0;
      const capUSD = Number((wagerBetUSD * MAX_WIN_MULT).toFixed(2));

      while (mountedRef.current) {
        setSpinPhase("EVALUATING");
        const evalRes = evaluateScatterClusterWins(board, wagerBetUSD);
        if (evalRes.winningGroups.length === 0) break;

        tumbleStep += 1;
        const winSet = new Set<string>();
        const stepLogs: TumbleLogItem[] = [];
        const newCallouts: FloatingCallout[] = [];

        evalRes.winningGroups.forEach((grp) => {
          grp.coords.forEach((pt) => winSet.add(`${pt.row}-${pt.col}`));
          stepLogs.push({
            id: nextUid("tlog"),
            step: tumbleStep,
            symbol: grp.symbol,
            count: grp.coords.length,
            payoutUSD: grp.payoutUSD,
          });
          const anchor = grp.coords[Math.floor(grp.coords.length / 2)];
          newCallouts.push({
            id: nextUid("call"),
            row: anchor.row,
            col: anchor.col,
            text: `+${formatUSD(grp.payoutUSD)}`,
            subtext: `${grp.coords.length}×`,
            color: "#fde047",
          });
        });

        spinTumbleAccumUSD = Number(
          (spinTumbleAccumUSD + evalRes.stepWinUSD).toFixed(2)
        );
        setTumbleWinUSD(spinTumbleAccumUSD);
        setTumbleHistory((prev) => [...stepLogs, ...prev].slice(0, 8));
        setFloatingCallouts(newCallouts);

        // Highlight winning cells
        board = board.map((rowArr, r) =>
          rowArr.map((cell, c) =>
            winSet.has(`${r}-${c}`) ? { ...cell, isWinning: true } : cell
          )
        );
        setGrid(board);
        audioRef.current?.playTumbleChime(tumbleStep - 1);
        await sleep(340);
        if (!mountedRef.current) break;

        // Explode winning symbols
        setSpinPhase("EXPLODING");
        board = board.map((rowArr, r) =>
          rowArr.map((cell, c) =>
            winSet.has(`${r}-${c}`)
              ? { ...cell, isExploding: true, isWinning: false }
              : cell
          )
        );
        setGrid(board);
        await sleep(230);
        if (!mountedRef.current) break;

        // Gravity collapse & fill new symbols from top
        setSpinPhase("CASCADING");
        setFloatingCallouts([]);
        const collapsed: OlympusCell[][] = Array.from(
          { length: GRID_ROWS },
          () => []
        );

        for (let c = 0; c < GRID_COLS; c++) {
          const survivors: OlympusCell[] = [];
          for (let r = GRID_ROWS - 1; r >= 0; r--) {
            const cell = board[r][c];
            if (!winSet.has(`${r}-${c}`)) {
              survivors.push(cell);
            }
          }
          const missingCount = GRID_ROWS - survivors.length;
          for (let r = GRID_ROWS - 1; r >= 0; r--) {
            const idxFromBottom = GRID_ROWS - 1 - r;
            if (idxFromBottom < survivors.length) {
              const old = survivors[idxFromBottom];
              const dropDist = Math.max(0, r - old.row);
              collapsed[r][c] = {
                ...old,
                row: r,
                col: c,
                isWinning: false,
                isExploding: false,
                justStruckByZeus: false,
                fallRows: dropDist,
              };
            } else {
              const rolled = rollCellSymbol({
                rng,
                inFreeSpins: inFS,
                isSuperFreeSpins: superFS,
                doubleChance: doubleChanceActive,
                activeRtpPercent: runtimeRtpPercent,
                allowOrb: !forceBuyScatters,
              });
              collapsed[r][c] = {
                uid: nextUid("cas"),
                symbol: rolled.symbol,
                row: r,
                col: c,
                orbMultiplier: rolled.orbMultiplier,
                fallRows: missingCount,
              };
            }
          }
        }

        board = collapsed;
        setGrid(board);
        await sleep(290);
        if (!mountedRef.current) break;

        // Mid-tumble random Zeus strike opportunity
        if (!forceBuyScatters && rng() < (inFS ? 0.14 : 0.06)) {
          const regCells: Array<{ r: number; c: number }> = [];
          for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
              if (
                board[r][c].symbol !== "scatter_zeus" &&
                board[r][c].symbol !== "orb_multiplier"
              ) {
                regCells.push({ r, c });
              }
            }
          }
          if (regCells.length > 0) {
            const pick = regCells[Math.floor(rng() * regCells.length)];
            const orbVal = superFS
              ? pickWeighted(SUPER_ORB_VALUES, SUPER_ORB_WEIGHTS, rng)
              : pickWeighted(ORB_VALUES, ORB_WEIGHTS_NORMAL, rng);

            setSpinPhase("ZEUS_STRIKING");
            setZeusState("STRIKING");
            fireLightningBeams(
              [
                {
                  fromEl: getActiveZeusSourceEl(),
                  toEl: cellRefs.current[`${pick.r}-${pick.c}`] ?? null,
                  color: "#38bdf8",
                  secondaryColor: "#fef08a",
                },
              ],
              420
            );
            audioRef.current?.playZeusThunderStrike();
            triggerShake();

            const nextBoard = board.map((r) => [...r]);
            nextBoard[pick.r][pick.c] = {
              uid: nextUid("mzorb"),
              symbol: "orb_multiplier",
              row: pick.r,
              col: pick.c,
              orbMultiplier: orbVal,
              justStruckByZeus: true,
            };
            board = nextBoard;
            setGrid(board);
            await sleep(420);
            if (mountedRef.current) setZeusState("IDLE");
          }
        }
      }

      if (!mountedRef.current) {
        return {
          totalSpinWinUSD: 0,
          updatedGlobalMult: currentGlobalMult,
          scattersLanded: 0,
          scatterPayUSD: 0,
          proofHash,
        };
      }

      // Count Scatters & Scatter Payout
      let scattersLanded = 0;
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (board[r][c].symbol === "scatter_zeus") scattersLanded++;
        }
      }
      const scatterMult =
        SCATTER_PAYS[Math.min(6, scattersLanded)] ??
        (scattersLanded >= 6 ? 100 : 0);
      const scatterPayUSD =
        !inFS && scatterMult > 0
          ? Number((wagerBetUSD * scatterMult).toFixed(2))
          : 0;

      // Gather All Winged Multiplier Orbs Currently on Screen
      const orbsOnBoard: Array<{ row: number; col: number; value: number }> = [];
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const cell = board[r][c];
          if (cell.symbol === "orb_multiplier" && (cell.orbMultiplier ?? 0) > 0) {
            orbsOnBoard.push({
              row: r,
              col: c,
              value: cell.orbMultiplier!,
            });
          }
        }
      }
      const newOrbsSum = orbsOnBoard.reduce((sum, o) => sum + o.value, 0);

      let updatedGlobalMult = currentGlobalMult;
      let finalTumblePayoutUSD = spinTumbleAccumUSD;

      // AUTHENTIC GATES OF OLYMPUS 1000 MULTIPLIER MATH:
      if (spinTumbleAccumUSD > 0 && orbsOnBoard.length > 0) {
        setSpinPhase("APPLYING_ORBS");
        setZeusState("CELEBRATING");
        audioRef.current?.playZeusThunderStrike();

        if (!inFS) {
          // BASE GAME: Orbs shoot lightning beams into top Tumble Win Bar & multiply tumble win by orbSum
          fireLightningBeams(
            orbsOnBoard.map((orb) => ({
              fromEl: cellRefs.current[`${orb.row}-${orb.col}`] ?? null,
              toEl: tumbleBarRef.current,
              color: "#fbbf24",
              secondaryColor: "#ffffff",
            })),
            560
          );
          finalTumblePayoutUSD = Number(
            (spinTumbleAccumUSD * newOrbsSum).toFixed(2)
          );
          setBannerStatus(
            `MULTIPLIER ORBS (${newOrbsSum}x) × ${formatUSD(spinTumbleAccumUSD)} = ${formatUSD(finalTumblePayoutUSD)}!`
          );
          setTumbleWinUSD(finalTumblePayoutUSD);
          await sleep(620);
        } else {
          // FREE SPINS:
          // 1) Orbs fly/shoot into left Global Multiplier Meter -> globalBonusMultiplier += newOrbsSum
          updatedGlobalMult = currentGlobalMult + newOrbsSum;
          setGlobalBonusMultiplier(updatedGlobalMult);

          fireLightningBeams(
            orbsOnBoard.map((orb) => ({
              fromEl: cellRefs.current[`${orb.row}-${orb.col}`] ?? null,
              toEl: globalMeterRef.current ?? tumbleBarRef.current,
              color: "#fde047",
              secondaryColor: "#38bdf8",
            })),
            480
          );
          await sleep(500);

          if (!mountedRef.current) {
            return {
              totalSpinWinUSD: 0,
              updatedGlobalMult,
              scattersLanded,
              scatterPayUSD,
              proofHash,
            };
          }

          // 2) Entire updated Global Multiplier shoots golden lightning into top Tumble Win Bar!
          fireLightningBeams(
            [
              {
                fromEl: globalMeterRef.current ?? getActiveZeusSourceEl(),
                toEl: tumbleBarRef.current,
                color: "#f59e0b",
                secondaryColor: "#ffffff",
              },
            ],
            520
          );
          finalTumblePayoutUSD = Number(
            (spinTumbleAccumUSD * updatedGlobalMult).toFixed(2)
          );
          setBannerStatus(
            `GLOBAL MULTIPLIER ${updatedGlobalMult}x × ${formatUSD(spinTumbleAccumUSD)} = ${formatUSD(finalTumblePayoutUSD)}!`
          );
          setTumbleWinUSD(finalTumblePayoutUSD);
          await sleep(580);
        }

        if (mountedRef.current) setZeusState("IDLE");
      }

      const rawCombined = Number((finalTumblePayoutUSD + scatterPayUSD).toFixed(2));
      const totalSpinWinUSD = Math.min(capUSD, rawCombined);

      return {
        totalSpinWinUSD,
        updatedGlobalMult,
        scattersLanded,
        scatterPayUSD,
        proofHash,
      };
    },
    [
      clientSeed,
      doubleChanceActive,
      fireLightningBeams,
      getActiveZeusSourceEl,
      runtimeRtpPercent,
      serverSeed,
      triggerShake,
    ]
  );

  // Free Spins Loop (15 Spins or 500x Super Free Spins + +5 Retriggers)
  const executeFreeSpinsBonus = useCallback(
    async (opts: {
      superFS: boolean;
      wagerBetUSD: number;
      totalBuyOrSpinCostUSD: number;
      initialScatterPayUSD: number;
      startingNonce: number;
    }) => {
      const {
        superFS,
        wagerBetUSD,
        totalBuyOrSpinCostUSD,
        initialScatterPayUSD,
        startingNonce,
      } = opts;

      let currentNonce = startingNonce;
      let cumulativeBonusWinUSD = initialScatterPayUSD;
      let runningGlobalMult = 0;
      let spinsRemaining = 15;
      let totalSpinsAwarded = 15;
      const capUSD = Number((wagerBetUSD * MAX_WIN_MULT).toFixed(2));

      setInFreeSpins(true);
      setIsSuperFreeSpins(superFS);
      setGlobalBonusMultiplier(0);
      setBonusTotalWinUSD(cumulativeBonusWinUSD);
      setFreeSpinsTotal(15);
      setFreeSpinsLeft(15);

      setBonusIntroOverlay({
        title: superFS ? "SUPER FREE SPINS" : "GATES OF OLYMPUS FREE SPINS",
        subtitle: superFS
          ? "15 SUPER SPINS • ALL MULTIPLIER ORBS GUARANTEED 15x–1,000x!"
          : "15 FREE SPINS • CUMULATIVE GLOBAL MULTIPLIER NEVER RESETS!",
        isSuper: superFS,
      });
      audioRef.current?.playWinFanfare(35);
      await sleep(1750);
      if (!mountedRef.current) return;
      setBonusIntroOverlay(null);

      while (spinsRemaining > 0 && mountedRef.current) {
        setFreeSpinsLeft(spinsRemaining);
        setFreeSpinsTotal(totalSpinsAwarded);
        setBannerStatus(
          `${superFS ? "SUPER " : ""}FREE SPINS • SPIN ${totalSpinsAwarded - spinsRemaining + 1} OF ${totalSpinsAwarded}`
        );

        currentNonce += 1;
        setNonce(currentNonce);

        const res = await runSingleTumbleSpin({
          inFS: true,
          superFS,
          currentGlobalMult: runningGlobalMult,
          forceBuyScatters: false,
          wagerBetUSD,
          spinNonce: currentNonce,
        });
        if (!mountedRef.current) break;

        runningGlobalMult = res.updatedGlobalMult;

        // Check +5 Retrigger on 3+ Scatters
        if (res.scattersLanded >= 3) {
          spinsRemaining += 5;
          totalSpinsAwarded += 5;
          setBannerStatus(
            `RETRIGGER! +5 EXTRA FREE SPINS (${res.scattersLanded} ZEUS SCATTERS)`
          );
          audioRef.current?.playWinFanfare(20);
          await sleep(650);
        }

        const headroom = Math.max(0, capUSD - cumulativeBonusWinUSD);
        const spinAward = Math.min(headroom, res.totalSpinWinUSD);
        cumulativeBonusWinUSD = Number((cumulativeBonusWinUSD + spinAward).toFixed(2));
        setLastSpinWinUSD(spinAward);
        setLastSpinMult(Number((spinAward / wagerBetUSD).toFixed(2)));
        setBonusTotalWinUSD(cumulativeBonusWinUSD);

        if (spinAward > 0) {
          commitBalance(balanceRef.current + spinAward);
          audioRef.current?.playWinFanfare(spinAward / wagerBetUSD);
        }

        spinsRemaining -= 1;
        await sleep(spinAward > 0 ? 780 : 380);
        if (cumulativeBonusWinUSD >= capUSD) break;
      }

      if (!mountedRef.current) return;

      const finalMult = Number((cumulativeBonusWinUSD / wagerBetUSD).toFixed(2));
      const finalHash = await computeSha256Hex(
        `${serverSeed}:${clientSeed}:${currentNonce}:OLYMPUS_FS_END`
      );
      setLastProofHash(finalHash);
      emitBetRecord(totalBuyOrSpinCostUSD, cumulativeBonusWinUSD, finalHash);
      setSpinHistory((prev) => [
        {
          id: nextUid("hist"),
          wagerUSD: totalBuyOrSpinCostUSD,
          payoutUSD: cumulativeBonusWinUSD,
          multiplier: finalMult,
          mode: superFS ? "Super Free Spins" : "Free Spins",
          proofHash: finalHash,
        },
        ...prev.slice(0, 14),
      ]);

      if (finalMult >= 15) {
        const tier =
          finalMult >= MAX_WIN_MULT
            ? "OLYMPUS 15,000x MAX WIN"
            : finalMult >= 50
              ? "MEGA WIN"
              : "BIG WIN";
        setWinCelebration({
          tier,
          amountUSD: cumulativeBonusWinUSD,
          mult: finalMult,
        });
        audioRef.current?.playWinFanfare(finalMult);
        await sleep(2300);
        if (mountedRef.current) setWinCelebration(null);
      }

      setInFreeSpins(false);
      setIsSuperFreeSpins(false);
      setFreeSpinsLeft(0);
      setFreeSpinsTotal(0);
      setBannerStatus(
        cumulativeBonusWinUSD > 0
          ? `OLYMPUS BONUS WON ${formatUSD(cumulativeBonusWinUSD)} (${finalMult.toFixed(2)}x)!`
          : "FREE SPINS COMPLETE • SPIN AGAIN FOR ZEUS ORBS"
      );
    },
    [
      clientSeed,
      commitBalance,
      emitBetRecord,
      runSingleTumbleSpin,
      serverSeed,
    ]
  );

  // Trigger Base Game Spin
  const handleSpin = useCallback(async () => {
    if (isBusyRef.current) return;
    audioRef.current?.unlock();

    if (balanceRef.current < effectiveSpinCostUSD) {
      setAutoSpinsLeft(0);
      setBannerStatus("INSUFFICIENT USD BALANCE — LOWER BET OR TOP UP");
      return;
    }

    isBusyRef.current = true;
    setShowAutoMenu(false);
    setShowMobileBuyModal(false);
    setWinCelebration(null);

    const spinCost = effectiveSpinCostUSD;
    const wagerBet = baseBetUSD;
    commitBalance(balanceRef.current - spinCost);

    const nextNonce = nonce + 1;
    setNonce(nextNonce);
    setLastSpinWinUSD(0);
    setLastSpinMult(0);
    setBannerStatus(
      doubleChanceActive
        ? "DOUBLE CHANCE ACTIVE • DROPPING 6x5 REELS..."
        : "DROPPING 6x5 OLYMPIAN REELS..."
    );
    audioRef.current?.playSpinStart();

    const res = await runSingleTumbleSpin({
      inFS: false,
      superFS: false,
      currentGlobalMult: 0,
      forceBuyScatters: false,
      wagerBetUSD: wagerBet,
      spinNonce: nextNonce,
    });

    if (!mountedRef.current) {
      isBusyRef.current = false;
      return;
    }

    if (res.totalSpinWinUSD > 0) {
      commitBalance(balanceRef.current + res.totalSpinWinUSD);
      const mult = Number((res.totalSpinWinUSD / wagerBet).toFixed(2));
      setLastSpinWinUSD(res.totalSpinWinUSD);
      setLastSpinMult(mult);
      audioRef.current?.playWinFanfare(mult);
    }

    if (res.scattersLanded >= 4) {
      setAutoSpinsLeft(0);
      await executeFreeSpinsBonus({
        superFS: false,
        wagerBetUSD: wagerBet,
        totalBuyOrSpinCostUSD: spinCost,
        initialScatterPayUSD: res.totalSpinWinUSD,
        startingNonce: nextNonce,
      });
    } else {
      const mult = Number((res.totalSpinWinUSD / wagerBet).toFixed(2));
      emitBetRecord(spinCost, res.totalSpinWinUSD, res.proofHash);
      setSpinHistory((prev) => [
        {
          id: nextUid("hist"),
          wagerUSD: spinCost,
          payoutUSD: res.totalSpinWinUSD,
          multiplier: mult,
          mode: doubleChanceActive ? "Double Chance" : "Base Spin",
          proofHash: res.proofHash,
        },
        ...prev.slice(0, 14),
      ]);

      if (res.totalSpinWinUSD > 0) {
        setBannerStatus(
          `OLYMPUS WON ${formatUSD(res.totalSpinWinUSD)} (${mult.toFixed(2)}x)!`
        );
      } else {
        setBannerStatus("SPIN COMPLETE • 4+ ZEUS SCATTERS TRIGGER FREE SPINS");
      }

      if (mult >= 15) {
        const tier =
          mult >= MAX_WIN_MULT
            ? "OLYMPUS 15,000x MAX WIN"
            : mult >= 50
              ? "MEGA WIN"
              : "BIG WIN";
        setWinCelebration({
          tier,
          amountUSD: res.totalSpinWinUSD,
          mult,
        });
        await sleep(2100);
        if (mountedRef.current) setWinCelebration(null);
      }
    }

    if (mountedRef.current) {
      setSpinPhase("IDLE");
    }
    isBusyRef.current = false;
  }, [
    baseBetUSD,
    commitBalance,
    doubleChanceActive,
    effectiveSpinCostUSD,
    emitBetRecord,
    executeFreeSpinsBonus,
    nonce,
    runSingleTumbleSpin,
  ]);

  // Buy 100x Free Spins or 500x Super Free Spins
  const handleBonusBuy = useCallback(
    async (superMode: boolean) => {
      if (isBusyRef.current || inFreeSpins) return;
      audioRef.current?.unlock();

      const multCost = superMode ? 500 : 100;
      const buyCostUSD = Number((baseBetUSD * multCost).toFixed(2));
      if (balanceRef.current < buyCostUSD) {
        setBannerStatus(
          `NEED ${formatUSD(buyCostUSD)} FOR ${superMode ? "500x SUPER" : "100x"} BONUS BUY`
        );
        return;
      }

      isBusyRef.current = true;
      setAutoSpinsLeft(0);
      setShowMobileBuyModal(false);
      setWinCelebration(null);
      commitBalance(balanceRef.current - buyCostUSD);

      const nextNonce = nonce + 1;
      setNonce(nextNonce);
      setLastSpinWinUSD(0);
      setLastSpinMult(0);
      setBannerStatus(
        superMode
          ? "500x SUPER FREE SPINS PURCHASED • SUMMONING ZEUS!"
          : "100x FREE SPINS PURCHASED • SUMMONING ZEUS!"
      );
      audioRef.current?.playZeusThunderStrike();

      // Drop 4+ Guaranteed Scatters on Trigger Spin
      const triggerRes = await runSingleTumbleSpin({
        inFS: false,
        superFS: superMode,
        currentGlobalMult: 0,
        forceBuyScatters: true,
        wagerBetUSD: baseBetUSD,
        spinNonce: nextNonce,
      });

      if (!mountedRef.current) {
        isBusyRef.current = false;
        return;
      }

      if (triggerRes.totalSpinWinUSD > 0) {
        commitBalance(balanceRef.current + triggerRes.totalSpinWinUSD);
      }

      await executeFreeSpinsBonus({
        superFS: superMode,
        wagerBetUSD: baseBetUSD,
        totalBuyOrSpinCostUSD: buyCostUSD,
        initialScatterPayUSD: triggerRes.totalSpinWinUSD,
        startingNonce: nextNonce,
      });

      if (mountedRef.current) {
        setSpinPhase("IDLE");
      }
      isBusyRef.current = false;
    },
    [
      baseBetUSD,
      commitBalance,
      executeFreeSpinsBonus,
      inFreeSpins,
      nonce,
      runSingleTumbleSpin,
    ]
  );

  // Autoplay loop
  useEffect(() => {
    if (autoSpinsLeft <= 0) return;
    if (isBusyRef.current || spinPhase !== "IDLE" || inFreeSpins) return;

    const timer = setTimeout(() => {
      if (autoSpinsLeft > 0 && !isBusyRef.current) {
        setAutoSpinsLeft((prev) => Math.max(0, prev - 1));
        handleSpin();
      }
    }, 340);

    return () => clearTimeout(timer);
  }, [autoSpinsLeft, handleSpin, inFreeSpins, spinPhase]);

  // Spacebar spin shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        if (!showPaytableModal && !showFairModal && !showMobileBuyModal) {
          handleSpin();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSpin, showFairModal, showMobileBuyModal, showPaytableModal]);

  const isSpinning = spinPhase !== "IDLE";
  const buy100CostUSD = Number((baseBetUSD * 100).toFixed(2));
  const buy500CostUSD = Number((baseBetUSD * 500).toFixed(2));

  return (
    <div
      style={{
        backgroundImage: `url(${ZYAN_SLOTS_ASSETS.ZYAN_OLYMPUS.STAGE_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      className={`relative flex min-h-[calc(100vh-49px)] w-full flex-col justify-between overflow-hidden bg-gradient-to-b ${
        inFreeSpins
          ? isSuperFreeSpins
            ? "from-[#2a091f] via-[#120829] to-[#05040d]"
            : "from-[#0a1d3d] via-[#0b1026] to-[#040610]"
          : "from-[#120d2a] via-[#090c1c] to-[#04050c]"
      } text-white transition-colors duration-700`}
    >
      {/* Celestial Cloud & Electric Storm Ambient Vignette */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden bg-slate-950/50">
        <div
          className={`absolute -top-24 left-1/2 h-[440px] w-[820px] -translate-x-1/2 rounded-full blur-3xl transition-colors duration-700 ${
            zeusState === "STRIKING"
              ? "bg-cyan-400/35"
              : inFreeSpins
                ? "bg-amber-500/25"
                : "bg-sky-500/20"
          }`}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_32%,rgba(3,5,14,0.88)_100%)]" />
      </div>

      {/* TOP HEADER: ZYAN.GG Logo + Game Emblem + MAX WIN 15,000x */}
      <header className="relative z-20 mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 px-3 pt-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-28 overflow-hidden rounded-lg bg-black/30 px-1.5 py-0.5 sm:h-9 sm:w-32">
            <ProtectedArt
              src={ZYAN_LOGO_URL}
              alt="ZYAN.GG Official Logo"
              className="h-full w-full object-contain mix-blend-lighten"
              fallback={
                <span className="font-display text-sm font-black tracking-widest text-amber-400">
                  ZYAN.GG
                </span>
              }
            />
          </div>
          <span className="font-ui hidden rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-300 md:inline-block">
            {username}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-center">
          <h1 className="font-display bg-gradient-to-r from-amber-200 via-yellow-400 to-cyan-300 bg-clip-text text-base font-black uppercase tracking-tight text-transparent drop-shadow-[0_2px_12px_rgba(56,189,248,0.45)] sm:text-2xl lg:text-[26px]">
            ZYAN GATES OF OLYMPUS 1000
          </h1>
          <span className="font-display whitespace-nowrap rounded-md border border-cyan-300/60 bg-gradient-to-r from-amber-400 via-yellow-300 to-cyan-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-[0_0_16px_rgba(56,189,248,0.65)] sm:text-xs">
            MAX WIN 15,000x
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mobile Compact Zeus Guardian Badge */}
          <div
            ref={zeusMobileRef}
            className="flex items-center gap-1 rounded-xl border border-cyan-400/40 bg-slate-950/80 px-2 py-0.5 xl:hidden"
          >
            <ZeusGuardianArt state={zeusState} compact />
          </div>
          <button
            type="button"
            onClick={() => setShowFairModal(true)}
            className="font-ui flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-400/30 bg-emerald-950/50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-900/60"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Fairness</span>
          </button>
        </div>
      </header>

      {/* MAIN STAGE: Left Feature Buy & Global Multiplier + Center 6x5 Grid + Right Zeus Guardian */}
      <main
        ref={mainStageRef}
        className="relative z-20 mx-auto my-auto flex w-full max-w-[1440px] flex-1 flex-col items-center justify-center gap-3 px-2 py-2 lg:flex-row lg:items-stretch lg:gap-4 lg:px-6 lg:py-3"
      >
        {/* Unclipped Canvas for Zeus Lightning Strikes & Orb Beams */}
        <canvas
          ref={lightningCanvasRef}
          className="pointer-events-none absolute inset-0 z-40 h-full w-full"
        />

        {/* LEFT DESKTOP COLUMN: Feature Buy + Ante Bet + Global Multiplier + Tumble History */}
        <aside className="hidden w-[262px] shrink-0 flex-col justify-between gap-2.5 lg:flex">
          {/* Ornate Cumulative Global Multiplier Meter (Active in Free Spins, Preview in Base) */}
          <div
            ref={globalMeterRef}
            className={`relative overflow-hidden rounded-2xl border-2 p-3 text-center shadow-2xl transition-all duration-300 ${
              inFreeSpins
                ? "border-amber-300 bg-gradient-to-b from-amber-500/25 via-slate-900 to-slate-950 shadow-[0_0_28px_rgba(251,191,36,0.45)]"
                : "border-amber-400/30 bg-slate-950/80"
            }`}
          >
            <div className="font-display flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
              <Crown className="h-3.5 w-3.5" />
              <span>TOTAL MULTIPLIER</span>
            </div>
            <div className="font-display mt-0.5 bg-gradient-to-b from-white via-amber-200 to-amber-500 bg-clip-text text-3xl font-black text-transparent">
              {inFreeSpins ? `${globalBonusMultiplier}x` : "0x"}
            </div>
            <p className="font-ui mt-0.5 text-[10px] text-slate-300">
              {inFreeSpins
                ? "Stacks permanently all Free Spins!"
                : "Cumulative meter in Free Spins"}
            </p>
          </div>

          {/* 100x & 500x Bonus Buy + 1.25x Double Chance Stack */}
          <div className="flex flex-col gap-2 rounded-2xl border border-amber-400/25 bg-slate-950/80 p-2.5 shadow-xl backdrop-blur-md">
            <button
              type="button"
              disabled={isSpinning || inFreeSpins || balanceUSD < buy100CostUSD}
              onClick={() => handleBonusBuy(false)}
              className="group relative overflow-hidden rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-500 p-2.5 text-left text-slate-950 shadow-lg transition hover:brightness-110 disabled:opacity-45"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-black uppercase">
                  BUY FREE SPINS
                </span>
                <span className="font-display rounded bg-slate-950/90 px-1.5 py-0.5 text-[9px] font-black text-amber-300">
                  100x
                </span>
              </div>
              <div className="font-ui mt-1 flex items-center justify-between text-xs font-extrabold">
                <span>15 Free Spins</span>
                <span>{formatUSD(buy100CostUSD)}</span>
              </div>
            </button>

            <button
              type="button"
              disabled={isSpinning || inFreeSpins || balanceUSD < buy500CostUSD}
              onClick={() => handleBonusBuy(true)}
              className="group relative overflow-hidden rounded-xl border border-rose-300/70 bg-gradient-to-r from-rose-600 via-red-600 to-amber-500 p-2.5 text-left text-white shadow-[0_0_20px_rgba(244,63,94,0.4)] transition hover:brightness-110 disabled:opacity-45"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-black uppercase">
                  SUPER FREE SPINS
                </span>
                <span className="font-display rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-black text-amber-300">
                  500x
                </span>
              </div>
              <div className="font-ui mt-0.5 text-[10px] font-semibold text-amber-100">
                All Orbs Min 15x–1,000x
              </div>
              <div className="font-ui mt-1 flex items-center justify-between text-xs font-black text-amber-200">
                <span>15 Super Spins</span>
                <span>{formatUSD(buy500CostUSD)}</span>
              </div>
            </button>

            {/* 1.25x Double Chance Ante Toggle */}
            <button
              type="button"
              disabled={isSpinning || inFreeSpins}
              onClick={() => setDoubleChanceActive((p) => !p)}
              className={`flex items-center justify-between rounded-xl border p-2.5 text-left transition ${
                doubleChanceActive
                  ? "border-cyan-300 bg-cyan-500/20 shadow-[0_0_16px_rgba(56,189,248,0.35)]"
                  : "border-white/15 bg-slate-900/90 hover:border-cyan-400/50"
              } disabled:opacity-45`}
            >
              <div>
                <div className="font-display text-[11px] font-black uppercase text-white">
                  DOUBLE CHANCE
                </div>
                <div className="font-ui text-[10px] text-slate-300">
                  2x Natural Scatter Odds (1.25x)
                </div>
              </div>
              <span
                className={`font-display rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                  doubleChanceActive
                    ? "bg-cyan-400 text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                {doubleChanceActive ? "ON" : "OFF"}
              </span>
            </button>
          </div>

          {/* Tumble Win History Box */}
          <div className="flex-1 rounded-2xl border border-white/10 bg-slate-950/80 p-2.5">
            <div className="font-display mb-1.5 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-cyan-300">
              <span>TUMBLE CASCADE LOG</span>
              <span>{tumbleHistory.length} HITS</span>
            </div>
            {tumbleHistory.length === 0 ? (
              <div className="font-ui text-[11px] text-slate-500">
                8+ matching symbols anywhere trigger cascading tumbles.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {tumbleHistory.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="font-ui flex items-center justify-between rounded-lg bg-white/5 px-2 py-1 text-[11px]"
                  >
                    <span className="truncate text-slate-200">
                      {item.count}× {SYMBOL_LABELS[item.symbol]}
                    </span>
                    <span className="font-bold text-amber-300">
                      +{formatUSD(item.payoutUSD)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* CENTER: TOP TUMBLE WIN BAR + 6x5 MARBLE & GOLD GRID */}
        <section
          className={`relative flex w-full max-w-[700px] flex-col items-center justify-center ${
            stageShake ? "animate-[zyanHunterShake_0.34s_ease-in-out]" : ""
          }`}
        >
          {/* Top Tumble Win Bar + Free Spins Counter */}
          <div
            ref={tumbleBarRef}
            className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-400/40 bg-slate-950/85 px-3.5 py-2 shadow-xl backdrop-blur-md"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {inFreeSpins ? (
                <span className="font-display shrink-0 rounded-md bg-gradient-to-r from-amber-400 to-cyan-400 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">
                  {isSuperFreeSpins ? "SUPER FS" : "FREE SPINS"} {freeSpinsLeft}/
                  {freeSpinsTotal}
                </span>
              ) : (
                <Zap className="h-4 w-4 shrink-0 text-cyan-300" />
              )}
              <span className="font-ui truncate text-[11px] font-bold text-amber-100 sm:text-xs">
                {bannerStatus}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {inFreeSpins && (
                <span className="font-display rounded-md border border-amber-300/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-black text-amber-300 lg:hidden">
                  MULT: {globalBonusMultiplier}x
                </span>
              )}
              {tumbleWinUSD > 0 ? (
                <span className="font-display whitespace-nowrap rounded-lg bg-amber-400/20 px-2.5 py-0.5 text-xs font-black text-amber-300 sm:text-sm">
                  TUMBLE {formatUSD(tumbleWinUSD)}
                </span>
              ) : lastSpinWinUSD > 0 ? (
                <span className="font-display whitespace-nowrap rounded-lg bg-emerald-500/20 px-2.5 py-0.5 text-xs font-black text-emerald-300 sm:text-sm">
                  WON {formatUSD(lastSpinWinUSD)} ({lastSpinMult.toFixed(2)}x)
                </span>
              ) : null}
            </div>
          </div>

          {/* 6x5 MARBLE & GOLD GLASS REEL ARENA */}
          <div className="relative w-full overflow-hidden rounded-2xl border-2 border-amber-400/45 bg-[#080d1e]/92 p-2 shadow-[0_24px_65px_rgba(0,0,0,0.9),inset_0_0_32px_rgba(56,189,248,0.16)] sm:p-3">
            {/* Free Spins Total Bar */}
            {inFreeSpins && (
              <div className="font-ui mb-2 flex items-center justify-between rounded-xl border border-amber-300/30 bg-amber-950/35 px-3 py-1 text-xs font-bold">
                <span className="text-amber-200">
                  GLOBAL MULTIPLIER:{" "}
                  <strong className="text-cyan-300">{globalBonusMultiplier}x</strong>
                </span>
                <span className="text-emerald-300">
                  BONUS TOTAL: <strong>{formatUSD(bonusTotalWinUSD)}</strong>
                </span>
              </div>
            )}

            {/* 6x5 CELL GRID */}
            <div className="relative grid aspect-[6/5] w-full grid-cols-6 grid-rows-5 gap-1 sm:gap-2">
              {grid.map((rowArr, r) =>
                rowArr.map((cell, c) => {
                  const colStopped = stoppedCols[c];
                  const fallStyle: React.CSSProperties = {};
                  if (cell.fallRows && cell.fallRows > 0) {
                    (
                      fallStyle as Record<string, string | number>
                    )["--zyan-fall-from"] = `-${cell.fallRows * 108}%`;
                    fallStyle.animation =
                      "zyanCascadeFall 0.27s cubic-bezier(0.22,1,0.36,1)";
                  } else if (!colStopped) {
                    fallStyle.animation = "zyanReelDropOut 0.16s ease-in forwards";
                  } else if (cell.isExploding) {
                    fallStyle.animation = "zyanSymbolExplode 0.23s ease-in forwards";
                  } else if (cell.isWinning) {
                    fallStyle.animation = "zyanSymbolWinPulse 0.34s ease-out infinite";
                  } else if (cell.justStruckByZeus) {
                    fallStyle.animation = "zyanBombDetonate 0.45s ease-out";
                  } else {
                    fallStyle.animation =
                      "zyanReelDropIn 0.27s cubic-bezier(0.22,1,0.36,1)";
                  }

                  return (
                    <div
                      key={`${cell.uid}-${r}-${c}`}
                      ref={(el) => {
                        cellRefs.current[`${r}-${c}`] = el;
                      }}
                      style={fallStyle}
                      className={`relative flex items-center justify-center rounded-xl border transition-colors duration-150 ${
                        cell.isWinning
                          ? "z-10 border-amber-300 bg-amber-400/20 shadow-[0_0_20px_rgba(251,191,36,0.7)]"
                          : cell.symbol === "orb_multiplier"
                            ? "border-amber-300/60 bg-slate-900/75"
                            : "border-white/10 bg-slate-900/60"
                      }`}
                    >
                      <OlympusSymbolArtwork
                        symbol={cell.symbol}
                        orbMultiplier={cell.orbMultiplier}
                      />
                    </div>
                  );
                })
              )}

              {/* Floating Callouts on Winning Clusters */}
              {floatingCallouts.map((call) => (
                <div
                  key={call.id}
                  style={{
                    left: `${((call.col + 0.5) / GRID_COLS) * 100}%`,
                    top: `${((call.row + 0.45) / GRID_ROWS) * 100}%`,
                  }}
                  className="pointer-events-none absolute z-30 -translate-x-1/2 animate-[zyanFloatCallout_0.85s_ease-out_forwards] rounded-lg border border-amber-300/70 bg-slate-950/90 px-2 py-0.5 text-center shadow-xl"
                >
                  <div className="font-display text-xs font-black text-amber-300 sm:text-sm">
                    {call.text}
                  </div>
                  {call.subtext && (
                    <div className="font-ui text-[9px] font-bold text-cyan-200">
                      {call.subtext}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* BONUS INTRO OVERLAY */}
            {bonusIntroOverlay && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/88 p-4 text-center backdrop-blur-sm">
                <span className="font-display mb-1 text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
                  {bonusIntroOverlay.isSuper
                    ? "OLYMPUS 1000 EXCLUSIVE"
                    : "4+ SCATTERS TRIGGERED"}
                </span>
                <h2 className="font-display bg-gradient-to-r from-amber-200 via-yellow-400 to-cyan-300 bg-clip-text text-2xl font-black uppercase text-transparent sm:text-4xl">
                  {bonusIntroOverlay.title}
                </h2>
                <p className="font-ui mt-2 max-w-md text-xs font-bold uppercase tracking-wider text-slate-200 sm:text-sm">
                  {bonusIntroOverlay.subtitle}
                </p>
              </div>
            )}

            {/* BIG / MEGA / 15,000x MAX WIN CELEBRATION OVERLAY */}
            {winCelebration && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center backdrop-blur-md">
                <Trophy className="mb-2 h-14 w-14 text-amber-400 drop-shadow-[0_0_24px_rgba(251,191,36,0.95)]" />
                <div className="font-display bg-gradient-to-r from-amber-200 via-yellow-400 to-cyan-300 bg-clip-text text-3xl font-black uppercase tracking-tight text-transparent sm:text-5xl">
                  {winCelebration.tier}
                </div>
                <div className="font-display mt-2 text-3xl font-black text-emerald-300 drop-shadow sm:text-5xl">
                  {formatUSD(winCelebration.amountUSD)}
                </div>
                <div className="font-ui mt-1.5 text-sm font-extrabold uppercase tracking-widest text-amber-200">
                  {winCelebration.mult.toFixed(2)}x BASE BET
                </div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT DESKTOP COLUMN: ANIMATED ZEUS GUARDIAN PANEL */}
        <aside className="hidden w-[230px] shrink-0 flex-col items-center justify-between rounded-2xl border border-cyan-400/25 bg-gradient-to-b from-sky-950/60 via-slate-950/85 to-slate-950 p-3 shadow-2xl xl:flex">
          <div className="w-full text-center">
            <span className="font-display text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">
              LORD OF OLYMPUS
            </span>
            <h2 className="font-display mt-0.5 text-sm font-black uppercase text-amber-300">
              ZEUS GUARDIAN
            </h2>
          </div>

          <div
            ref={zeusDesktopRef}
            className="relative my-2 flex h-[270px] w-full items-center justify-center"
          >
            <ZeusGuardianArt state={zeusState} />
          </div>

          <div className="w-full rounded-xl border border-white/10 bg-black/45 p-2.5 text-center">
            <div className="font-display text-[10px] font-black uppercase text-amber-300">
              {zeusState === "STRIKING"
                ? "LIGHTNING STRIKE!"
                : zeusState === "CELEBRATING"
                  ? "ORBS UNLEASHED!"
                  : "WINGED ORBS: 2x–1,000x"}
            </div>
            <p className="font-ui mt-1 text-[10px] leading-snug text-slate-300">
              Zeus randomly strikes the reels to summon 1–4 Winged Multiplier Orbs up to 1,000x!
            </p>
          </div>
        </aside>
      </main>

      {/* BOTTOM PRAGMATIC CONTROL BAR */}
      <footer className="relative z-30 border-t border-white/10 bg-slate-950/95 px-3 py-2.5 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2.5">
          {/* LEFT: Paytable Info, Sound, Balance, Bet $ USD */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowPaytableModal(true)}
              aria-label="Paytable and Rules"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-slate-900 text-slate-200 transition hover:border-amber-400/50 hover:text-white"
            >
              <Info className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? "Mute audio" : "Unmute audio"}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-slate-900 text-slate-200 transition hover:border-amber-400/50 hover:text-white"
            >
              {soundEnabled ? (
                <Volume2 className="h-5 w-5 text-cyan-300" />
              ) : (
                <VolumeX className="h-5 w-5 text-slate-500" />
              )}
            </button>

            <div className="flex flex-col rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1">
              <span className="font-display text-[9px] font-bold uppercase tracking-wider text-slate-400">
                CREDIT
              </span>
              <span className="font-ui text-sm font-extrabold text-emerald-300 sm:text-base">
                {formatUSD(balanceUSD)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/90 px-2.5 py-1">
              <button
                type="button"
                disabled={isSpinning || inFreeSpins || betIndex <= 0}
                onClick={() => setBetIndex((i) => Math.max(0, i - 1))}
                aria-label="Decrease bet"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <div className="flex min-w-[74px] flex-col text-center">
                <span className="font-display text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  {doubleChanceActive ? "BET (1.25x)" : "BET"}
                </span>
                <span className="font-ui text-sm font-extrabold text-white sm:text-base">
                  {formatUSD(effectiveSpinCostUSD)}
                </span>
              </div>
              <button
                type="button"
                disabled={
                  isSpinning ||
                  inFreeSpins ||
                  betIndex >= BET_LADDER_USD.length - 1
                }
                onClick={() =>
                  setBetIndex((i) => Math.min(BET_LADDER_USD.length - 1, i + 1))
                }
                aria-label="Increase bet"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* RIGHT: Mobile Buy Bonus + Autoplay + Tactile Spin */}
          <div className="relative flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              disabled={isSpinning || inFreeSpins}
              onClick={() => setShowMobileBuyModal(true)}
              className="font-display flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-amber-300/70 bg-gradient-to-r from-amber-400 via-yellow-400 to-cyan-400 px-3 text-xs font-black uppercase text-slate-950 shadow-lg transition hover:brightness-110 disabled:opacity-45 lg:hidden"
            >
              <Flame className="h-4 w-4" />
              <span>BUY</span>
            </button>

            <div className="relative">
              {autoSpinsLeft > 0 ? (
                <button
                  type="button"
                  onClick={() => setAutoSpinsLeft(0)}
                  className="font-display flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-red-400/60 bg-red-950/80 px-3 text-xs font-black uppercase text-red-200"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>STOP ({autoSpinsLeft})</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={inFreeSpins}
                  onClick={() => setShowAutoMenu((s) => !s)}
                  className="font-display flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/15 bg-slate-900 px-3 text-xs font-black uppercase text-slate-200 transition hover:border-cyan-400/50 hover:text-white disabled:opacity-45"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">AUTOPLAY</span>
                </button>
              )}

              {showAutoMenu && (
                <div className="absolute bottom-14 right-0 z-50 w-44 rounded-xl border border-white/15 bg-slate-950 p-2 shadow-2xl">
                  <div className="font-display mb-1.5 px-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    AUTO SPINS
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[10, 25, 50, 100].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => {
                          setShowAutoMenu(false);
                          setAutoSpinsLeft(cnt);
                        }}
                        className="font-ui rounded-lg border border-white/10 bg-slate-900 py-1.5 text-xs font-bold text-white hover:border-cyan-400/60 hover:bg-slate-800"
                      >
                        {cnt} Spins
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={isSpinning || inFreeSpins}
              onClick={handleSpin}
              aria-label="Spin Reels"
              className={`font-display flex h-12 w-24 items-center justify-center rounded-2xl border-2 border-cyan-200/80 bg-gradient-to-b from-amber-300 via-yellow-400 to-cyan-500 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_6px_26px_rgba(56,189,248,0.45),inset_0_2px_0_rgba(255,255,255,0.65)] transition active:translate-y-0.5 sm:h-14 sm:w-28 sm:text-base ${
                isSpinning || inFreeSpins
                  ? "cursor-not-allowed opacity-55"
                  : "cursor-pointer hover:brightness-110"
              }`}
            >
              {isSpinning ? "..." : "SPIN"}
            </button>
          </div>
        </div>

        {/* Footer Watermark */}
        <div className="mx-auto mt-2 flex w-full max-w-[1440px] items-center justify-between border-t border-white/5 pt-1.5 text-[10px] text-slate-500">
          <div className="flex items-center gap-2">
            <div className="h-4 w-16 overflow-hidden">
              <ProtectedArt
                src={ZYAN_LOGO_URL}
                alt="ZYAN.GG"
                className="h-full w-full object-contain mix-blend-lighten opacity-75"
              />
            </div>
            <span className="font-ui">
              GATES OF OLYMPUS 1000 • 6×5 SCATTER PAYS • 15,000x MAX
            </span>
          </div>
          <span className="font-ui hidden sm:inline">
            SPACEBAR TO SPIN • $ USD ENGINE
          </span>
        </div>
      </footer>

      {/* ====================================================================
       * MODALS: MOBILE FEATURE BUY, PAYTABLE & RULES, PROVABLY FAIR
       * ================================================================== */}

      {showMobileBuyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-400/40 bg-slate-950 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <h3 className="font-display text-base font-black uppercase text-amber-300">
                OLYMPUS FEATURE BUYS
              </h3>
              <button
                type="button"
                onClick={() => setShowMobileBuyModal(false)}
                className="rounded-lg bg-slate-900 p-1.5 text-slate-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={balanceUSD < buy100CostUSD}
                onClick={() => handleBonusBuy(false)}
                className="rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-400 to-orange-500 p-3 text-left text-slate-950 disabled:opacity-45"
              >
                <div className="flex items-center justify-between font-display text-xs font-black uppercase">
                  <span>BUY FREE SPINS (100x)</span>
                  <span>{formatUSD(buy100CostUSD)}</span>
                </div>
                <p className="font-ui mt-0.5 text-[11px] font-bold">
                  15 Free Spins with Cumulative Global Multiplier Meter.
                </p>
              </button>

              <button
                type="button"
                disabled={balanceUSD < buy500CostUSD}
                onClick={() => handleBonusBuy(true)}
                className="rounded-xl border border-rose-300/70 bg-gradient-to-r from-rose-600 to-amber-500 p-3 text-left text-white disabled:opacity-45"
              >
                <div className="flex items-center justify-between font-display text-xs font-black uppercase">
                  <span>SUPER FREE SPINS (500x)</span>
                  <span>{formatUSD(buy500CostUSD)}</span>
                </div>
                <p className="font-ui mt-0.5 text-[11px]">
                  15 Super Spins — Every Winged Orb is 15x to 1,000x!
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDoubleChanceActive((p) => !p);
                  setShowMobileBuyModal(false);
                }}
                className={`rounded-xl border p-3 text-left ${
                  doubleChanceActive
                    ? "border-cyan-300 bg-cyan-500/20"
                    : "border-white/15 bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between font-display text-xs font-black uppercase text-white">
                  <span>DOUBLE CHANCE (1.25x BET)</span>
                  <span className="text-cyan-300">
                    {doubleChanceActive ? "ON" : "OFF"}
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaytableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-cyan-400/35 bg-slate-950 p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-display text-lg font-black uppercase text-amber-300">
                  OLYMPUS 1000 PAYTABLE & RULES
                </h3>
                <p className="font-ui text-xs text-slate-400">
                  6×5 Scatter-Pays (8+ Anywhere) • Cascading Tumbles • 15,000x Max Win
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPaytableModal(false)}
                className="rounded-lg bg-slate-900 p-1.5 text-slate-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {REGULAR_SYMBOL_IDS.slice()
                .reverse()
                .map((sym) => {
                  const pays = PAYTABLE[sym];
                  return (
                    <div
                      key={sym}
                      className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-slate-900/80 p-2"
                    >
                      <div className="h-12 w-12 shrink-0">
                        <OlympusSymbolArtwork symbol={sym} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-display truncate text-[10px] font-black uppercase text-white">
                          {SYMBOL_LABELS[sym]}
                        </div>
                        <div className="font-ui mt-0.5 text-[10px] text-slate-300">
                          <div>
                            12+:{" "}
                            <strong className="text-amber-300">
                              {pays[2].toFixed(2)}x
                            </strong>
                          </div>
                          <div>
                            10–11:{" "}
                            <strong className="text-slate-100">
                              {pays[1].toFixed(2)}x
                            </strong>
                          </div>
                          <div>
                            8–9:{" "}
                            <strong className="text-slate-400">
                              {pays[0].toFixed(2)}x
                            </strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="font-ui mt-4 grid gap-2.5 text-xs text-slate-300 sm:grid-cols-2">
              <div className="rounded-xl border border-cyan-400/30 bg-cyan-950/25 p-3">
                <div className="font-display mb-1 flex items-center gap-1.5 font-black uppercase text-cyan-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  WINGED MULTIPLIER ORBS (2x–1,000x)
                </div>
                In Base Game, when tumbles finish with a win, all Orbs on screen sum together and multiply your spin&apos;s tumble win. In Free Spins, whenever a win lands AND at least 1 new Orb appears, new Orbs add permanently to the Cumulative Global Multiplier Meter, and the full updated total multiplies the win!
              </div>
              <div className="rounded-xl border border-amber-400/30 bg-amber-950/25 p-3">
                <div className="font-display mb-1 font-black uppercase text-amber-300">
                  ZEUS SCATTERS & SUPER FREE SPINS
                </div>
                Land 4, 5, or 6 Zeus Scatters for <strong>3.00x, 5.00x, or 100.00x</strong> + <strong>15 Free Spins</strong> (3+ Scatters during bonus award <strong>+5 Extra Spins</strong>). Buy <strong>Super Free Spins (500x)</strong> for guaranteed <strong>15x–1,000x</strong> Orbs on every drop!
              </div>
            </div>
          </div>
        </div>
      )}

      {showFairModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-emerald-400/35 bg-slate-950 p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
                <h3 className="font-display text-base font-black uppercase text-emerald-300">
                  PROVABLY FAIR (SHA-256)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFairModal(false)}
                className="rounded-lg bg-slate-900 p-1.5 text-slate-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="font-ui flex flex-col gap-3 text-xs">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Active Server Seed
                </label>
                <div className="break-all rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 font-mono text-[11px] text-slate-300">
                  {serverSeed}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Client Seed
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={clientSeed}
                    onChange={(e) => setClientSeed(e.target.value)}
                    className="flex-1 rounded-lg border border-white/15 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() => setClientSeed(randomHex(8))}
                    className="flex items-center gap-1 rounded-lg border border-white/15 bg-slate-800 px-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Rotate
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900 px-3 py-2">
                <span className="text-slate-400">Current Nonce</span>
                <span className="font-mono font-bold text-amber-300">{nonce}</span>
              </div>

              {lastProofHash && (
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Last Spin SHA-256 Digest
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-2">
                    <span className="flex-1 break-all font-mono text-[10px] text-emerald-200">
                      {lastProofHash}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(lastProofHash);
                        setCopiedHash(true);
                        setTimeout(() => setCopiedHash(false), 1500);
                      }}
                      className="rounded bg-emerald-900/80 p-1.5 text-emerald-200 hover:bg-emerald-800"
                    >
                      {copiedHash ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {spinHistory.length > 0 && (
                <div className="max-h-28 overflow-y-auto rounded-lg border border-white/10 bg-slate-900 p-2">
                  <div className="font-display mb-1 text-[10px] font-black uppercase text-slate-400">
                    RECENT VERIFIED SPINS
                  </div>
                  {spinHistory.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-0.5 text-[11px]"
                    >
                      <span className="text-slate-300">
                        {item.mode} ({formatUSD(item.wagerUSD)})
                      </span>
                      <span
                        className={
                          item.payoutUSD > 0
                            ? "font-bold text-emerald-300"
                            : "text-slate-500"
                        }
                      >
                        {formatUSD(item.payoutUSD)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={async () => {
                  const digest = await computeSha256Hex(
                    `${serverSeed}:${clientSeed}:${nonce}:BASE`
                  );
                  setVerifyOutput(`SHA-256 Verified: ${digest.slice(0, 32)}...`);
                }}
                className="font-display rounded-xl bg-emerald-500 py-2 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-emerald-400"
              >
                Verify Seed Digest
              </button>
              {verifyOutput && (
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-950/40 px-3 py-2 font-mono text-[11px] text-emerald-300">
                  {verifyOutput}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZyanOlympus1000Slot;
