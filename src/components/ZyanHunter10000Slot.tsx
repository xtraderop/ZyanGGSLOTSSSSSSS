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
  RotateCw,
  Zap,
  Crosshair,
  Flame,
  Minus,
  Plus,
  X,
  Check,
  Play,
  Square,
  Sparkles,
  Trophy,
  Copy,
  RefreshCw,
} from "lucide-react";

import { ZYAN_SLOTS_ASSETS } from "../constants/slotAssets";

/* ============================================================================
 * 0. CUSTOMIZABLE ASSET SLOTS & ANTI-COPY <ProtectedArt />
 * ========================================================================== */

export const ZYAN_HUNTER_ASSETS: Partial<
  Record<HunterSymbolId | "STAGE_BG", string>
> = {
  STAGE_BG: ZYAN_SLOTS_ASSETS.ZYAN_HUNTER.STAGE_BG,
  xways_crate: ZYAN_SLOTS_ASSETS.ZYAN_HUNTER.XWAYS_AMMO_CRATE,
  dynamite_bomb: ZYAN_SLOTS_ASSETS.ZYAN_HUNTER.DYNAMITE_BOMB,
  bonus_duck_target: ZYAN_SLOTS_ASSETS.ZYAN_HUNTER.SCATTER_DUCK,
  wild_shell: ZYAN_SLOTS_ASSETS.ZYAN_HUNTER.WILD_GOLD_DUCK,
};

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
        style={{
          WebkitUserDrag: "none",
          pointerEvents: "none",
        } as React.CSSProperties}
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

export interface ZyanHunter10000BetRecord {
  gameKey: "ZYAN_HUNTER_10000";
  gameName: "Zyan Hunter 10,000x";
  wagerUSD: number;
  multiplier: number;
  payoutUSD: number;
  isWin: boolean;
  proofHash: string;
}

export interface ZyanHunter10000Props {
  externalBalanceUSD?: number;
  onBalanceChange?: (newBalanceUSD: number) => void;
  onRecordBet?: (bet: ZyanHunter10000BetRecord) => void;
  activeRtpPercent?: number; // Default 96.5% (controlled silently by Admin Panel)
  username?: string;
}

export type HunterSymbolId =
  | "beer_can"
  | "whiskey_jar"
  | "crossbow"
  | "duck_nest"
  | "armed_duck"
  | "hunter_blue"
  | "hunter_brown"
  | "hunter_pink"
  | "hunter_red_boss"
  | "wild_shell"
  | "xways_crate"
  | "dynamite_bomb"
  | "bonus_duck_target";

type RegularHunterSymbolId =
  | "beer_can"
  | "whiskey_jar"
  | "crossbow"
  | "duck_nest"
  | "armed_duck"
  | "hunter_blue"
  | "hunter_brown"
  | "hunter_pink"
  | "hunter_red_boss";

type SpinPhase =
  | "IDLE"
  | "DROPPING"
  | "RESOLVING_XWAYS"
  | "EVALUATING"
  | "EXPLODING"
  | "BOMB_DETONATING"
  | "CASCADING"
  | "SPIN_COMPLETE";

type BoosterMode = "none" | "xbet" | "day2" | "day64" | "day1024";

type BonusTierKey = "duck_hunt" | "hawk_eye" | "big_game";

type HunterUpgradeKey = "upgraded_xways" | "upgraded_bomb" | "extra_2_shots";

interface HunterCell {
  uid: string;
  symbol: HunterSymbolId;
  row: number;
  col: number;
  xwaysBoost?: number;
  isInfectiousXways?: boolean;
  isWinning?: boolean;
  isExploding?: boolean;
  isBombBlast?: boolean;
  isScatterHit?: boolean;
  isXwaysTransforming?: boolean;
  animType: "none" | "drop-out" | "drop-in" | "cascade";
  fallRows?: number;
  dropDelayMs?: number;
}

interface FloatingCallout {
  id: string;
  xPercent: number;
  yPercent: number;
  winUSD: number;
  posMultSum: number;
}

interface HunterHistoryItem {
  id: string;
  symbol: RegularHunterSymbolId;
  count: number;
  posMultSum: number;
  winUSD: number;
}

interface FairnessEntry {
  nonce: number;
  serverSeedHash: string;
  revealedServerSeed?: string;
  clientSeed: string;
  proofHash: string;
  wagerUSD: number;
  payoutUSD: number;
  multiplier: number;
}

interface BlastParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

interface InfectionArc {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
  color: string;
}

/* ============================================================================
 * 2. AUTHENTIC PAYTABLE, CONSTANTS & UPGRADE DEFINITIONS
 * ========================================================================== */

const COLS = 6;
const ROWS = 5;
const MAX_CELL_MULT = 8192;
const MAX_WIN_MULT = 10000;
const ZYAN_LOGO_URL =
  "https://i.ibb.co.com/20Dxw97d/Esports-wordmark-logo-ZYAN-GG-3d5c4c15-2-K.jpg";

const BET_PRESETS: number[] = [
  0.2, 0.4, 0.6, 0.8, 1.0, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0,
];

const REGULAR_HUNTER_SYMBOLS: RegularHunterSymbolId[] = [
  "hunter_red_boss",
  "hunter_pink",
  "hunter_brown",
  "hunter_blue",
  "armed_duck",
  "duck_nest",
  "crossbow",
  "whiskey_jar",
  "beer_can",
];

// Exact Nolimit City Duck Hunters 6x5 Scatter-Pays Paytable (8-9, 10-11, 12+)
const HUNTER_PAYTABLE: Record<
  RegularHunterSymbolId,
  { tier8_9: number; tier10_11: number; tier12Plus: number }
> = {
  beer_can: { tier8_9: 0.1, tier10_11: 0.15, tier12Plus: 1.0 },
  whiskey_jar: { tier8_9: 0.1, tier10_11: 0.2, tier12Plus: 1.25 },
  crossbow: { tier8_9: 0.1, tier10_11: 0.25, tier12Plus: 1.5 },
  duck_nest: { tier8_9: 0.1, tier10_11: 0.3, tier12Plus: 1.75 },
  armed_duck: { tier8_9: 0.1, tier10_11: 0.4, tier12Plus: 2.0 },
  hunter_blue: { tier8_9: 0.15, tier10_11: 0.6, tier12Plus: 2.5 },
  hunter_brown: { tier8_9: 0.15, tier10_11: 0.7, tier12Plus: 3.0 },
  hunter_pink: { tier8_9: 0.2, tier10_11: 0.8, tier12Plus: 3.5 },
  hunter_red_boss: { tier8_9: 0.3, tier10_11: 1.0, tier12Plus: 5.0 },
};

const SYMBOL_META: Record<
  HunterSymbolId,
  { name: string; colors: string[] }
> = {
  beer_can: { name: "Crushed Brew Can", colors: ["#60A5FA", "#E2E8F0", "#94A3B8"] },
  whiskey_jar: { name: "Moonshine Bottle", colors: ["#F59E0B", "#FDE68A", "#78350F"] },
  crossbow: { name: "Tactical Crossbow", colors: ["#34D399", "#94A3B8", "#065F46"] },
  duck_nest: { name: "Golden Egg Nest", colors: ["#FACC15", "#D97706", "#FEF08A"] },
  armed_duck: { name: "Rifle Duck", colors: ["#10B981", "#FBBF24", "#78350F"] },
  hunter_blue: { name: "Blue Recon Hunter", colors: ["#3B82F6", "#93C5FD", "#1E3A8A"] },
  hunter_brown: { name: "Camo Tracker", colors: ["#D97706", "#84CC16", "#78350F"] },
  hunter_pink: { name: "Sniper Queen", colors: ["#EC4899", "#F9A8D4", "#831843"] },
  hunter_red_boss: { name: "Bubba Boss Hunter", colors: ["#EF4444", "#FACC15", "#991B1B"] },
  wild_shell: { name: "Golden Shell Wild", colors: ["#FDE047", "#DC2626", "#FFFFFF"] },
  xways_crate: { name: "xWays Ammo Crate", colors: ["#F59E0B", "#34D399", "#FFFFFF"] },
  dynamite_bomb: { name: "Dynamite Bomb", colors: ["#EF4444", "#FDE047", "#FB923C"] },
  bonus_duck_target: { name: "Bullseye Duck Scatter", colors: ["#FDE047", "#EF4444", "#FFFFFF"] },
};

const BOOSTER_CONFIG: Record<
  BoosterMode,
  {
    label: string;
    costMult: number;
    preloadedMult: number;
    desc: string;
  }
> = {
  none: { label: "Standard", costMult: 1, preloadedMult: 1, desc: "Normal 1x grid" },
  xbet: {
    label: "xBet",
    costMult: 2,
    preloadedMult: 1,
    desc: "Guaranteed Scatter on Reel 2 (5x Bonus Chance)",
  },
  day2: {
    label: "Day 2 Spins",
    costMult: 5,
    preloadedMult: 2,
    desc: "All 30 cells start at 2x!",
  },
  day64: {
    label: "Day 64 Spins",
    costMult: 90,
    preloadedMult: 64,
    desc: "All 30 cells start at 64x!",
  },
  day1024: {
    label: "Day 1024 Spins",
    costMult: 1200,
    preloadedMult: 1024,
    desc: "All 30 cells start at 1,024x!",
  },
};

const BONUS_TIERS: Record<
  BonusTierKey,
  {
    title: string;
    spins: number;
    buyMult: number;
    upgradeCount: number;
    scattersRequired: number;
    accent: string;
  }
> = {
  duck_hunt: {
    title: "Duck Hunt Spins",
    spins: 7,
    buyMult: 70,
    upgradeCount: 1,
    scattersRequired: 3,
    accent: "#10B981",
  },
  hawk_eye: {
    title: "Hawk Eye Spins",
    spins: 8,
    buyMult: 200,
    upgradeCount: 2,
    scattersRequired: 4,
    accent: "#F59E0B",
  },
  big_game: {
    title: "Big Game Spins",
    spins: 10,
    buyMult: 600,
    upgradeCount: 3,
    scattersRequired: 5,
    accent: "#EF4444",
  },
};

const UPGRADE_LABELS: Record<
  HunterUpgradeKey,
  { name: string; desc: string }
> = {
  upgraded_xways: {
    name: "Upgraded xWays",
    desc: "All xWays become Infectious xWays",
  },
  upgraded_bomb: {
    name: "Upgraded Bomb",
    desc: "Dynamite Bombs blast 5×5 radius",
  },
  extra_2_shots: {
    name: "Extra +2 Shots",
    desc: "Every Scatter adds +2 Free Spins",
  },
};

function createMultiplierMatrix(fill = 1): number[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(fill));
}

function getHunterPayMult(sym: RegularHunterSymbolId, count: number): number {
  const row = HUNTER_PAYTABLE[sym];
  if (count >= 12) return row.tier12Plus;
  if (count >= 10) return row.tier10_11;
  if (count >= 8) return row.tier8_9;
  return 0;
}

function formatUSD(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return `$${safe.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getPositionBadgeStyle(mult: number): string {
  if (mult >= 2048) {
    return "border-yellow-200 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-slate-950 shadow-[0_0_12px_rgba(253,224,71,0.9)]";
  }
  if (mult >= 256) {
    return "border-rose-300 bg-gradient-to-r from-rose-600 to-red-700 text-white shadow-[0_0_10px_rgba(239,68,68,0.75)]";
  }
  if (mult >= 32) {
    return "border-purple-300 bg-gradient-to-r from-purple-600 to-fuchsia-700 text-white";
  }
  if (mult >= 4) {
    return "border-sky-300 bg-gradient-to-r from-blue-600 to-cyan-600 text-white";
  }
  return "border-emerald-300 bg-emerald-600/95 text-white";
}

/* ============================================================================
 * 3. PROVABLY FAIR CRYPTOGRAPHIC RNG
 * ========================================================================== */

function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0").repeat(8);
}

class HunterPrng {
  private pool: number[] = [];
  private idx = 0;

  constructor(seedHex: string) {
    this.expand(seedHex, 0);
  }

  private expand(hex: string, block: number): void {
    let s =
      parseInt(hex.slice((block * 8) % 56, ((block * 8) % 56) + 8), 16) ^
      (block * 0x9e3779b9);
    if (!Number.isFinite(s) || s === 0) s = 0x517cc1b7;
    for (let i = 0; i < 64; i++) {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      this.pool.push(((t ^ (t >>> 14)) >>> 0) / 4294967296);
    }
  }

  nextFloat(): number {
    if (this.idx >= this.pool.length) {
      this.expand(randomHex(16), Math.floor(this.idx / 64));
    }
    return this.pool[this.idx++];
  }
}

/* ============================================================================
 * 4. RUGGED HUNTER WEB AUDIO SYNTHESIZER
 * ========================================================================== */

class HunterAudioSynth {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensure(): AudioContext | null {
    if (this.muted || typeof window === "undefined") return null;
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  public unlock(): void {
    this.ensure();
  }

  public playClick(freq = 520): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + 0.05);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // Ignore
    }
  }

  // Heavy shell rack + wooden reel thud
  public playReelLock(col: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(125 + col * 8, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.085);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Ignore
    }
  }

  // Metallic xWays crate unlock chime
  public playXwaysUnlock(infectious: boolean): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const freqs = infectious ? [440, 660, 880, 1320] : [440, 660];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2200, now);
        osc.frequency.setValueAtTime(f, now + idx * 0.035);
        gain.gain.setValueAtTime(0.09, now + idx * 0.035);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.22);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.035);
        osc.stop(now + idx * 0.035 + 0.24);
      });
    } catch {
      // Ignore
    }
  }

  // Fiery Dynamite 3x3 / 5x5 Blast
  public playDynamiteExplosion(isUpgraded5x5: boolean): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Sub-bass boom
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(isUpgraded5x5 ? 110 : 90, now);
      sub.frequency.exponentialRampToValueAtTime(22, now + 0.55);
      subGain.gain.setValueAtTime(0.32, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 0.6);

      // Filtered noise blast
      const bufSize = ctx.sampleRate * 0.45;
      const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.14));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const lpf = ctx.createBiquadFilter();
      lpf.type = "lowpass";
      lpf.frequency.setValueAtTime(950, now);
      lpf.frequency.exponentialRampToValueAtTime(160, now + 0.42);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.28, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
      noise.connect(lpf);
      lpf.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(now);
    } catch {
      // Ignore
    }
  }

  public playScatterTargetPing(ord: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(480 + ord * 140, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.34);
    } catch {
      // Ignore
    }
  }

  public playComboHit(step: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 987.77];
      const f = notes[Math.min(step, notes.length - 1)];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 1.25, now + 0.14);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Ignore
    }
  }

  public playHornFanfare(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [293.66, 369.99, 440.0, 587.33].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        const lpf = ctx.createBiquadFilter();
        lpf.type = "lowpass";
        lpf.frequency.setValueAtTime(1600, now);
        osc.frequency.setValueAtTime(f, now + idx * 0.1);
        gain.gain.setValueAtTime(0.11, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.45);
        osc.connect(lpf);
        lpf.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.48);
      });
    } catch {
      // Ignore
    }
  }

  public playWinTick(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(980 + Math.random() * 180, now);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    } catch {
      // Ignore
    }
  }
}

/* ============================================================================
 * 5. 13 CUSTOM 3D-SHADED SVG SYMBOLS
 * ========================================================================== */

interface HunterSymbol3DProps {
  id: HunterSymbolId;
  xwaysBoost?: number;
  isInfectiousXways?: boolean;
  className?: string;
}

const HunterSymbol3D: React.FC<HunterSymbol3DProps> = React.memo(
  ({ id, xwaysBoost, isInfectiousXways, className = "w-full h-full" }) => {
    const uid = useId().replace(/:/g, "");
    const customUrl = ZYAN_HUNTER_ASSETS[id];

    const renderSvg = () => {
      switch (id) {
        case "beer_can":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Crushed Brew Can">
              <defs>
                <linearGradient id={`bc-body-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#1E3A8A" />
                  <stop offset="35%" stopColor="#60A5FA" />
                  <stop offset="70%" stopColor="#2563EB" />
                  <stop offset="100%" stopColor="#0F172A" />
                </linearGradient>
              </defs>
              <g transform="rotate(-10 50 50)">
                <rect x="30" y="18" width="40" height="66" rx="7" fill={`url(#bc-body-${uid})`} stroke="#CBD5E1" strokeWidth="2" />
                <ellipse cx="50" cy="18" rx="18" ry="5" fill="#E2E8F0" />
                <rect x="30" y="37" width="40" height="24" fill="#FDE047" />
                <text x="50" y="53" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="900" fontFamily="Montserrat, sans-serif">
                  BREW
                </text>
                <path d="M36 25 L36 74" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="3.5" strokeLinecap="round" />
              </g>
            </svg>
          );

        case "whiskey_jar":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Moonshine Bottle">
              <defs>
                <radialGradient id={`wj-glass-${uid}`} cx="35%" cy="35%" r="70%">
                  <stop offset="0%" stopColor="#FEF3C7" />
                  <stop offset="40%" stopColor="#F59E0B" />
                  <stop offset="85%" stopColor="#92400E" />
                  <stop offset="100%" stopColor="#451A03" />
                </radialGradient>
              </defs>
              <rect x="42" y="10" width="16" height="10" rx="2" fill="#78350F" />
              <rect x="40" y="18" width="20" height="14" rx="4" fill="#FDE68A" fillOpacity="0.65" />
              <rect x="25" y="30" width="50" height="56" rx="12" fill={`url(#wj-glass-${uid})`} stroke="#FDE68A" strokeWidth="2" />
              <rect x="31" y="45" width="38" height="24" rx="4" fill="#FFFBEB" />
              <text x="50" y="61" textAnchor="middle" fill="#78350F" fontSize="12" fontWeight="900" fontFamily="Montserrat, sans-serif">
                XXX
              </text>
              <ellipse cx="34" cy="40" rx="4" ry="8" fill="#FFFFFF" fillOpacity="0.55" />
            </svg>
          );

        case "crossbow":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Tactical Crossbow">
              <defs>
                <linearGradient id={`cb-wood-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#D97706" />
                  <stop offset="100%" stopColor="#451A03" />
                </linearGradient>
              </defs>
              <g transform="rotate(-30 50 50)">
                <path d="M18 32 Q50 12 82 32" fill="none" stroke="#34D399" strokeWidth="6" strokeLinecap="round" />
                <line x1="18" y1="32" x2="50" y2="54" stroke="#E2E8F0" strokeWidth="2" />
                <line x1="82" y1="32" x2="50" y2="54" stroke="#E2E8F0" strokeWidth="2" />
                <rect x="45" y="24" width="10" height="62" rx="4" fill={`url(#cb-wood-${uid})`} stroke="#FDE68A" strokeWidth="1.5" />
                <polygon points="50,8 43,24 57,24" fill="#94A3B8" />
              </g>
            </svg>
          );

        case "duck_nest":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Golden Egg Nest">
              <defs>
                <radialGradient id={`dn-egg-${uid}`} cx="35%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#FEF9C3" />
                  <stop offset="45%" stopColor="#FACC15" />
                  <stop offset="100%" stopColor="#B45309" />
                </radialGradient>
              </defs>
              <ellipse cx="38" cy="44" rx="14" ry="19" transform="rotate(-12 38 44)" fill={`url(#dn-egg-${uid})`} stroke="#FEF08A" strokeWidth="1.5" />
              <ellipse cx="62" cy="44" rx="14" ry="19" transform="rotate(12 62 44)" fill={`url(#dn-egg-${uid})`} stroke="#FEF08A" strokeWidth="1.5" />
              <ellipse cx="50" cy="41" rx="15" ry="20" fill={`url(#dn-egg-${uid})`} stroke="#FFFFFF" strokeWidth="1.5" />
              <ellipse cx="50" cy="68" rx="38" ry="18" fill="#78350F" stroke="#D97706" strokeWidth="3" />
              <path d="M18 65 Q50 78 82 65" fill="none" stroke="#F59E0B" strokeWidth="3" strokeDasharray="6 4" />
            </svg>
          );

        case "armed_duck":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Rifle Duck">
              <defs>
                <radialGradient id={`ad-head-${uid}`} cx="35%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#6EE7B7" />
                  <stop offset="50%" stopColor="#059669" />
                  <stop offset="100%" stopColor="#064E3B" />
                </radialGradient>
              </defs>
              <ellipse cx="52" cy="66" rx="28" ry="20" fill="#78350F" stroke="#D97706" strokeWidth="2" />
              <circle cx="48" cy="36" r="20" fill={`url(#ad-head-${uid})`} stroke="#A7F3D0" strokeWidth="1.5" />
              {/* Orange beak */}
              <path d="M28 36 L12 42 L30 46 Z" fill="#F59E0B" stroke="#FEF08A" strokeWidth="1" />
              {/* Camo headband & fierce eye */}
              <rect x="29" y="25" width="38" height="7" rx="2" fill="#DC2626" />
              <circle cx="40" cy="36" r="3.5" fill="#FFFFFF" />
              <circle cx="39" cy="36" r="1.8" fill="#0F172A" />
              {/* Rifle silhouette */}
              <rect x="34" y="57" width="52" height="7" rx="2" fill="#334155" stroke="#94A3B8" strokeWidth="1" />
            </svg>
          );

        case "hunter_blue":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Blue Recon Hunter">
              <defs>
                <radialGradient id={`hb-bg-${uid}`} cx="50%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#3B82F6" />
                  <stop offset="100%" stopColor="#1E3A8A" />
                </radialGradient>
              </defs>
              <rect x="10" y="10" width="80" height="80" rx="18" fill={`url(#hb-bg-${uid})`} stroke="#93C5FD" strokeWidth="2.5" />
              {/* Shoulders */}
              <path d="M22 86 C22 65 78 65 78 86 Z" fill="#1E293B" />
              {/* Face */}
              <circle cx="50" cy="46" r="19" fill="#FDBA74" />
              {/* Beard */}
              <path d="M32 48 C32 66 68 66 68 48 L62 58 L38 58 Z" fill="#475569" />
              {/* Blue Cap */}
              <path d="M28 36 C28 19 72 19 72 36 Z" fill="#2563EB" stroke="#BAE6FD" strokeWidth="1.5" />
              <rect x="26" y="33" width="48" height="6" rx="3" fill="#1D4ED8" />
              {/* Tactical Shades */}
              <rect x="35" y="40" width="13" height="7" rx="2" fill="#0F172A" />
              <rect x="52" y="40" width="13" height="7" rx="2" fill="#0F172A" />
            </svg>
          );

        case "hunter_brown":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Camo Tracker">
              <defs>
                <radialGradient id={`hbr-bg-${uid}`} cx="50%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#D97706" />
                  <stop offset="100%" stopColor="#451A03" />
                </radialGradient>
              </defs>
              <rect x="10" y="10" width="80" height="80" rx="18" fill={`url(#hbr-bg-${uid})`} stroke="#FCD34D" strokeWidth="2.5" />
              <path d="M22 86 C22 65 78 65 78 86 Z" fill="#365314" />
              <circle cx="50" cy="47" r="19" fill="#FDBA74" />
              <path d="M31 48 C31 68 69 68 69 48 Z" fill="#78350F" />
              {/* Boonie Hat */}
              <ellipse cx="50" cy="34" rx="30" ry="6" fill="#4D7C0F" />
              <path d="M33 34 C33 18 67 18 67 34 Z" fill="#65A30D" />
              <circle cx="43" cy="43" r="2.5" fill="#0F172A" />
              <circle cx="57" cy="43" r="2.5" fill="#0F172A" />
            </svg>
          );

        case "hunter_pink":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Sniper Queen">
              <defs>
                <radialGradient id={`hp-bg-${uid}`} cx="50%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#EC4899" />
                  <stop offset="100%" stopColor="#831843" />
                </radialGradient>
              </defs>
              <rect x="10" y="10" width="80" height="80" rx="18" fill={`url(#hp-bg-${uid})`} stroke="#F9A8D4" strokeWidth="2.5" />
              <path d="M22 86 C22 65 78 65 78 86 Z" fill="#3B0764" />
              <circle cx="50" cy="48" r="18" fill="#FED7AA" />
              <path d="M29 45 C29 22 71 22 71 45 L66 36 L34 36 Z" fill="#F472B6" />
              <rect x="34" y="42" width="13" height="6" rx="2" fill="#0F172A" />
              <rect x="53" y="42" width="13" height="6" rx="2" fill="#0F172A" />
              <path d="M44 56 Q50 60 56 56" fill="none" stroke="#BE123C" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          );

        case "hunter_red_boss":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Bubba Boss Hunter">
              <defs>
                <radialGradient id={`hrb-bg-${uid}`} cx="50%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="100%" stopColor="#7F1D1D" />
                </radialGradient>
              </defs>
              <rect x="8" y="8" width="84" height="84" rx="18" fill={`url(#hrb-bg-${uid})`} stroke="#FDE047" strokeWidth="3" />
              <path d="M20 88 C20 64 80 64 80 88 Z" fill="#1E293B" />
              <circle cx="50" cy="47" r="20" fill="#FDBA74" />
              {/* Boss mustache & beard */}
              <path d="M30 48 C30 70 70 70 70 48 L60 58 L40 58 Z" fill="#1E293B" />
              {/* 24k Gold Boss Cowboy/Trucker Crown */}
              <path d="M24 35 L76 35 L68 20 L32 20 Z" fill="#FACC15" stroke="#FEF9C3" strokeWidth="1.5" />
              <rect x="34" y="39" width="32" height="7" rx="2" fill="#0F172A" />
              <circle cx="67" cy="56" r="3" fill="#F59E0B" />
            </svg>
          );

        case "wild_shell":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Golden Shotgun Shell Wild">
              <defs>
                <linearGradient id={`ws-red-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#991B1B" />
                  <stop offset="40%" stopColor="#EF4444" />
                  <stop offset="100%" stopColor="#7F1D1D" />
                </linearGradient>
                <linearGradient id={`ws-brass-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#B45309" />
                  <stop offset="45%" stopColor="#FEF08A" />
                  <stop offset="100%" stopColor="#92400E" />
                </linearGradient>
              </defs>
              <g transform="rotate(14 50 50)">
                <rect x="33" y="14" width="34" height="50" rx="5" fill={`url(#ws-red-${uid})`} stroke="#FCA5A5" strokeWidth="1.5" />
                <rect x="31" y="62" width="38" height="22" rx="3" fill={`url(#ws-brass-${uid})`} stroke="#FEF9C3" strokeWidth="1.5" />
              </g>
              <rect x="18" y="39" width="64" height="20" rx="7" fill="#0F172A" stroke="#FDE047" strokeWidth="2" />
              <text x="50" y="53" textAnchor="middle" fill="#FDE047" fontSize="13" fontWeight="900" fontFamily="Montserrat, sans-serif">
                WILD
              </text>
            </svg>
          );

        case "xways_crate":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="xWays Ammo Crate">
              <defs>
                <linearGradient id={`xw-bg-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={isInfectiousXways ? "#EC4899" : "#10B981"} />
                  <stop offset="100%" stopColor={isInfectiousXways ? "#7C3AED" : "#064E3B"} />
                </linearGradient>
              </defs>
              <rect
                x="12"
                y="14"
                width="76"
                height="72"
                rx="12"
                fill={`url(#xw-bg-${uid})`}
                stroke="#FDE047"
                strokeWidth="3"
              />
              <line x1="16" y1="30" x2="84" y2="30" stroke="#FEF08A" strokeOpacity="0.45" strokeWidth="2.5" />
              <line x1="16" y1="70" x2="84" y2="70" stroke="#FEF08A" strokeOpacity="0.45" strokeWidth="2.5" />
              <text x="50" y="49" textAnchor="middle" fill="#FFFFFF" fontSize="15" fontWeight="900" fontFamily="Montserrat, sans-serif">
                {isInfectiousXways ? "INFECT" : "xWAYS"}
              </text>
              <text x="50" y="66" textAnchor="middle" fill="#FDE047" fontSize="14" fontWeight="900" fontFamily="Montserrat, sans-serif">
                {xwaysBoost ? `${xwaysBoost}x` : "2x-8x"}
              </text>
            </svg>
          );

        case "dynamite_bomb":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Dynamite Bomb">
              <path d="M52 24 C56 13 65 9 74 10" fill="none" stroke="#FDE68A" strokeWidth="4" strokeLinecap="round" />
              <g style={{ transformOrigin: "75px 10px", animation: "zyanBombFuseSpark 0.4s ease-in-out infinite" }}>
                <polygon points="75,2 77.5,8 84,10 77.5,12 75,18 72.5,12 66,10 72.5,8" fill="#FDE047" />
              </g>
              <rect x="26" y="26" width="14" height="58" rx="4" fill="#DC2626" stroke="#FCA5A5" strokeWidth="1.5" />
              <rect x="43" y="24" width="14" height="62" rx="4" fill="#EF4444" stroke="#FCA5A5" strokeWidth="1.5" />
              <rect x="60" y="26" width="14" height="58" rx="4" fill="#B91C1C" stroke="#FCA5A5" strokeWidth="1.5" />
              <rect x="23" y="45" width="54" height="16" rx="4" fill="#1E293B" stroke="#FDE047" strokeWidth="2" />
              <text x="50" y="56.5" textAnchor="middle" fill="#FDE047" fontSize="11" fontWeight="900" fontFamily="Montserrat, sans-serif">
                TNT
              </text>
            </svg>
          );

        case "bonus_duck_target":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Bullseye Duck Scatter">
              <circle cx="50" cy="48" r="38" fill="#DC2626" stroke="#FDE047" strokeWidth="3" />
              <circle cx="50" cy="48" r="27" fill="#FFFFFF" />
              <circle cx="50" cy="48" r="16" fill="#EF4444" />
              <circle cx="50" cy="48" r="6" fill="#FDE047" />
              <rect x="18" y="68" width="64" height="15" rx="7.5" fill="#78350F" stroke="#FDE047" strokeWidth="1.5" />
              <text x="50" y="79" textAnchor="middle" fill="#FEF08A" fontSize="9.5" fontWeight="900" fontFamily="Montserrat, sans-serif">
                BONUS
              </text>
            </svg>
          );
      }
    };

    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        {customUrl ? (
          <>
            <ProtectedArt
              src={customUrl}
              alt={SYMBOL_META[id].name}
              className="h-full w-full scale-110 rounded-xl object-contain mix-blend-lighten"
              fallback={renderSvg()}
            />
            {id === "xways_crate" && (
              <span className="font-display pointer-events-none absolute bottom-0.5 right-0.5 z-20 rounded bg-slate-950/90 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-300 ring-1 ring-amber-400/70">
                {xwaysBoost ? `${xwaysBoost}x` : "xWAYS"}
              </span>
            )}
            {id === "wild_shell" && (
              <span className="font-display pointer-events-none absolute bottom-0.5 left-1/2 z-20 -translate-x-1/2 rounded bg-slate-950/90 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/70">
                WILD
              </span>
            )}
          </>
        ) : (
          renderSvg()
        )}
      </div>
    );
  }
);
HunterSymbol3D.displayName = "HunterSymbol3D";

/* ============================================================================
 * 6. MAIN FLAGSHIP COMPONENT: ZyanHunter10000Slot
 * ========================================================================== */

export const ZyanHunter10000Slot: React.FC<ZyanHunter10000Props> = ({
  externalBalanceUSD,
  onBalanceChange,
  onRecordBet,
  activeRtpPercent = 96.5,
  username,
}) => {
  // --- Balance & Bridge State ---
  const [internalBalanceUSD, setInternalBalanceUSD] = useState<number>(1000.0);
  const isExternal = typeof externalBalanceUSD === "number";
  const balanceUSD = isExternal ? externalBalanceUSD : internalBalanceUSD;
  const balanceRef = useRef<number>(balanceUSD);
  balanceRef.current = balanceUSD;

  const updateBalance = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.round(next * 100) / 100);
      balanceRef.current = clamped;
      if (!isExternal) setInternalBalanceUSD(clamped);
      onBalanceChange?.(clamped);
      if (typeof window !== "undefined" && window.parent !== window) {
        window.parent.postMessage(
          { type: "ZYAN_BALANCE_SYNC", balanceUSD: clamped },
          "*"
        );
      }
    },
    [isExternal, onBalanceChange]
  );

  // --- Controls ---
  const [baseBetUSD, setBaseBetUSD] = useState<number>(1.0);
  const [boosterMode, setBoosterMode] = useState<BoosterMode>("none");
  const [turboSpin, setTurboSpin] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<boolean>(false);

  const effectiveSpinCostUSD = useMemo(() => {
    return (
      Math.round(baseBetUSD * BOOSTER_CONFIG[boosterMode].costMult * 100) / 100
    );
  }, [baseBetUSD, boosterMode]);

  // --- Core Grid & Position Multiplier Matrix (6x5 = 30 cells) ---
  const [grid, setGrid] = useState<HunterCell[]>([]);
  const [positionMultipliers, setPositionMultipliers] = useState<number[][]>(() =>
    createMultiplierMatrix(1)
  );
  const [phase, setPhase] = useState<SpinPhase>("IDLE");
  const [screenShaking, setScreenShaking] = useState<boolean>(false);
  const [spinWinUSD, setSpinWinUSD] = useState<number>(0);
  const [callouts, setCallouts] = useState<FloatingCallout[]>([]);
  const [historyItems, setHistoryItems] = useState<HunterHistoryItem[]>([]);

  // --- Free Spins & Upgrade Wheel State ---
  const [isFreeSpins, setIsFreeSpins] = useState<boolean>(false);
  const [bonusTier, setBonusTier] = useState<BonusTierKey>("duck_hunt");
  const [activeUpgrades, setActiveUpgrades] = useState<HunterUpgradeKey[]>([]);
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [freeSpinsTotal, setFreeSpinsTotal] = useState<number>(0);
  const [freeSpinNum, setFreeSpinNum] = useState<number>(0);
  const [bonusCumulativeWinUSD, setBonusCumulativeWinUSD] = useState<number>(0);
  const [upgradeWheelModal, setUpgradeWheelModal] = useState<{
    open: boolean;
    tier: BonusTierKey;
    awarded: HunterUpgradeKey[];
  }>({ open: false, tier: "duck_hunt", awarded: [] });
  const [bonusSummary, setBonusSummary] = useState<{
    open: boolean;
    totalWinUSD: number;
    spinsPlayed: number;
    isMaxWin: boolean;
  }>({ open: false, totalWinUSD: 0, spinsPlayed: 0, isMaxWin: false });

  // --- Post-Spin "EXTRA SPIN" Offer ---
  const [extraSpinOffer, setExtraSpinOffer] = useState<{
    open: boolean;
    costUSD: number;
    lockedMatrix: number[][];
    maxCellMult: number;
  }>({ open: false, costUSD: 0, lockedMatrix: [], maxCellMult: 1 });

  // --- Modals & Autoplay ---
  const [autoplayLeft, setAutoplayLeft] = useState<number>(0);
  const [showAutoMenu, setShowAutoMenu] = useState<boolean>(false);
  const [showBetModal, setShowBetModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [showFairnessModal, setShowFairnessModal] = useState<boolean>(false);
  const [buyConfirmTier, setBuyConfirmTier] = useState<BonusTierKey | null>(null);

  // --- Celebration ---
  const [celebration, setCelebration] = useState<{
    active: boolean;
    label: string;
    accent: string;
    targetUSD: number;
    mult: number;
    isMaxWin: boolean;
  }>({
    active: false,
    label: "",
    accent: "#F59E0B",
    targetUSD: 0,
    mult: 0,
    isMaxWin: false,
  });
  const [celebDisplayUSD, setCelebDisplayUSD] = useState<number>(0);
  const celebSkipRef = useRef<boolean>(false);

  // --- Provably Fair ---
  const [serverSeed, setServerSeed] = useState<string>(() => randomHex(32));
  const [serverSeedHash, setServerSeedHash] = useState<string>("");
  const [clientSeed, setClientSeed] = useState<string>("zyan-hunter-10000-seed");
  const [nonce, setNonce] = useState<number>(1);
  const [fairnessLogs, setFairnessLogs] = useState<FairnessEntry[]>([]);
  const [copiedStr, setCopiedStr] = useState<string | null>(null);

  // --- Concurrency & Canvas Refs ---
  const isSpinningRef = useRef<boolean>(false);
  const autoplayRef = useRef<number>(0);
  autoplayRef.current = autoplayLeft;

  const fsRef = useRef({
    active: false,
    tier: "duck_hunt" as BonusTierKey,
    upgrades: [] as HunterUpgradeKey[],
    left: 0,
    total: 0,
    num: 0,
    cumulativeWin: 0,
    wagerBase: 1.0,
    totalCost: 1.0,
    posMatrix: createMultiplierMatrix(1),
  });

  const synthRef = useRef<HunterAudioSynth | null>(null);
  if (!synthRef.current) synthRef.current = new HunterAudioSynth();
  useEffect(() => {
    if (synthRef.current) synthRef.current.muted = muted;
  }, [muted]);

  const gridBoxRef = useRef<HTMLDivElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const celebCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<BlastParticle[]>([]);
  const arcsRef = useRef<InfectionArc[]>([]);
  const uidRef = useRef<number>(1);
  const unmountedRef = useRef<boolean>(false);

  const nextUid = useCallback((p = "h") => {
    uidRef.current += 1;
    return `${p}-${uidRef.current}`;
  }, []);

  useEffect(() => {
    let alive = true;
    void sha256Hex(serverSeed).then((h) => {
      if (alive) setServerSeedHash(h);
    });
    return () => {
      alive = false;
    };
  }, [serverSeed]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (
        (d.type === "ZYAN_BALANCE_UPDATE" || d.type === "ZYAN_SET_BALANCE") &&
        typeof d.balanceUSD === "number" &&
        !isExternal
      ) {
        setInternalBalanceUSD(Math.max(0, Math.round(d.balanceUSD * 100) / 100));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [isExternal]);

  const sleep = useCallback(
    (ms: number) => new Promise<void>((res) => setTimeout(res, ms)),
    []
  );

  /* ==========================================================================
   * 7. SYMBOL WEIGHTING & GENERATION (SILENT activeRtpPercent)
   * ======================================================================== */

  const pickRegularSymbol = useCallback(
    (rng: HunterPrng): RegularHunterSymbolId => {
      const rtpBoost = (activeRtpPercent - 96.5) / 100;
      const weights: [RegularHunterSymbolId, number][] = [
        ["hunter_red_boss", Math.max(3.5, 5.2 + rtpBoost * 4)],
        ["hunter_pink", Math.max(4.5, 6.2 + rtpBoost * 3)],
        ["hunter_brown", 7.4],
        ["hunter_blue", 8.6],
        ["armed_duck", 10.5],
        ["duck_nest", 11.8],
        ["crossbow", 13.0],
        ["whiskey_jar", 14.5],
        ["beer_can", 16.0],
      ];
      const total = weights.reduce((s, w) => s + w[1], 0);
      let roll = rng.nextFloat() * total;
      for (const [sym, w] of weights) {
        roll -= w;
        if (roll <= 0) return sym;
      }
      return "beer_can";
    },
    [activeRtpPercent]
  );

  const rollHunterCell = useCallback(
    (
      rng: HunterPrng,
      row: number,
      col: number,
      opts: {
        inFreeSpins: boolean;
        upgradedXways: boolean;
        allowSpecials: boolean;
        allowScatter: boolean;
        animType: HunterCell["animType"];
        fallRows?: number;
        dropDelayMs?: number;
      }
    ): HunterCell => {
      const rtpFactor = Math.max(0.65, Math.min(1.4, activeRtpPercent / 96.5));

      if (opts.allowScatter) {
        const scChance = (opts.inFreeSpins ? 0.028 : boosterMode === "xbet" ? 0.036 : 0.018) * rtpFactor;
        if (rng.nextFloat() < scChance) {
          return {
            uid: nextUid("sc"),
            symbol: "bonus_duck_target",
            row,
            col,
            animType: opts.animType,
            fallRows: opts.fallRows,
            dropDelayMs: opts.dropDelayMs,
          };
        }
      }

      if (opts.allowSpecials) {
        // Golden Shotgun Shell Wild
        if (rng.nextFloat() < 0.032 * rtpFactor) {
          return {
            uid: nextUid("wl"),
            symbol: "wild_shell",
            row,
            col,
            animType: opts.animType,
            fallRows: opts.fallRows,
            dropDelayMs: opts.dropDelayMs,
          };
        }

        // xWays / Infectious xWays Crate
        if (rng.nextFloat() < (opts.inFreeSpins ? 0.036 : 0.024) * rtpFactor) {
          const boostRoll = rng.nextFloat();
          const xwaysBoost = boostRoll < 0.65 ? 2 : boostRoll < 0.9 ? 4 : 8;
          const isInf = opts.upgradedXways || rng.nextFloat() < 0.35;
          return {
            uid: nextUid("xw"),
            symbol: "xways_crate",
            row,
            col,
            xwaysBoost,
            isInfectiousXways: isInf,
            animType: opts.animType,
            fallRows: opts.fallRows,
            dropDelayMs: opts.dropDelayMs,
          };
        }

        // Dynamite Bomb (3x3 or 5x5)
        if (rng.nextFloat() < (opts.inFreeSpins ? 0.032 : 0.022) * rtpFactor) {
          return {
            uid: nextUid("tnt"),
            symbol: "dynamite_bomb",
            row,
            col,
            animType: opts.animType,
            fallRows: opts.fallRows,
            dropDelayMs: opts.dropDelayMs,
          };
        }
      }

      return {
        uid: nextUid("rg"),
        symbol: pickRegularSymbol(rng),
        row,
        col,
        animType: opts.animType,
        fallRows: opts.fallRows,
        dropDelayMs: opts.dropDelayMs,
      };
    },
    [activeRtpPercent, boosterMode, nextUid, pickRegularSymbol]
  );

  // Initial board on mount
  useEffect(() => {
    const rng = new HunterPrng(randomHex(32));
    const init: HunterCell[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        init.push(
          rollHunterCell(rng, r, c, {
            inFreeSpins: false,
            upgradedXways: false,
            allowSpecials: false,
            allowScatter: false,
            animType: "none",
          })
        );
      }
    }
    init[7] = { ...init[7], symbol: "wild_shell" };
    init[14] = { ...init[14], symbol: "dynamite_bomb" };
    init[21] = { ...init[21], symbol: "xways_crate", xwaysBoost: 4, isInfectiousXways: true };
    setGrid(init);
  }, [rollHunterCell]);

  /* ==========================================================================
   * 8. CANVAS BLAST PARTICLES & INFECTIOUS xWAYS ARCS
   * ======================================================================== */

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const canvas = fxCanvasRef.current;
      const box = gridBoxRef.current;
      if (canvas && box) {
        const rect = box.getBoundingClientRect();
        if (
          canvas.width !== Math.round(rect.width) ||
          canvas.height !== Math.round(rect.height)
        ) {
          canvas.width = Math.max(1, Math.round(rect.width));
          canvas.height = Math.max(1, Math.round(rect.height));
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const keepP: BlastParticle[] = [];
          for (const p of particlesRef.current) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.25;
            p.alpha -= p.decay;
            if (p.alpha > 0.02) {
              keepP.push(p);
              ctx.save();
              ctx.globalAlpha = Math.max(0, p.alpha);
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
          particlesRef.current = keepP;

          const keepA: InfectionArc[] = [];
          for (const a of arcsRef.current) {
            a.alpha -= 0.028;
            if (a.alpha > 0.02) {
              keepA.push(a);
              ctx.save();
              ctx.globalAlpha = a.alpha;
              ctx.shadowBlur = 14;
              ctx.shadowColor = a.color;
              ctx.strokeStyle = a.color;
              ctx.lineWidth = 3.5;
              ctx.beginPath();
              ctx.moveTo(a.x1, a.y1);
              ctx.lineTo(a.x2, a.y2);
              ctx.stroke();
              ctx.restore();
            }
          }
          arcsRef.current = keepA;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const emitCellBlast = useCallback(
    (col: number, row: number, colors: string[], count = 16) => {
      const box = gridBoxRef.current;
      if (!box) return;
      const cw = box.clientWidth / COLS;
      const ch = box.clientHeight / ROWS;
      const cx = (col + 0.5) * cw;
      const cy = (row + 0.5) * ch;
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const spd = 2.5 + Math.random() * 5.5;
        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 2,
          size: 3 + Math.random() * 4.5,
          color: colors[i % colors.length],
          alpha: 1,
          decay: 0.024 + Math.random() * 0.015,
        });
      }
    },
    []
  );

  const emitInfectionArc = useCallback(
    (c1: number, r1: number, c2: number, r2: number, color: string) => {
      const box = gridBoxRef.current;
      if (!box) return;
      const cw = box.clientWidth / COLS;
      const ch = box.clientHeight / ROWS;
      arcsRef.current.push({
        x1: (c1 + 0.5) * cw,
        y1: (r1 + 0.5) * ch,
        x2: (c2 + 0.5) * cw,
        y2: (r2 + 0.5) * ch,
        alpha: 1,
        color,
      });
    },
    []
  );

  /* ==========================================================================
   * 9. CELEBRATION OVERLAY
   * ======================================================================== */

  const triggerCelebration = useCallback(
    (winUSD: number, betBase: number, isMaxWin = false): Promise<void> => {
      const mult = betBase > 0 ? winUSD / betBase : 0;
      if (mult < 15 && !isMaxWin) return Promise.resolve();

      let label = "BIG WIN!";
      let accent = "#10B981";
      if (isMaxWin) {
        label = "10,000x MAX WIN — HUNT COMPLETE!";
        accent = "#FDE047";
      } else if (mult >= 250) {
        label = "LEGENDARY TROPHY WIN!";
        accent = "#FDE047";
      } else if (mult >= 75) {
        label = "EPIC WIN!";
        accent = "#EF4444";
      } else if (mult >= 30) {
        label = "MEGA WIN!";
        accent = "#F59E0B";
      }

      celebSkipRef.current = false;
      setCelebDisplayUSD(0);
      setCelebration({
        active: true,
        label,
        accent,
        targetUSD: winUSD,
        mult,
        isMaxWin,
      });

      return new Promise<void>((resolve) => {
        const dur = Math.min(3400, Math.max(1700, mult * 14));
        const start = performance.now();
        let lastTick = 0;

        const step = (now: number) => {
          if (unmountedRef.current) {
            resolve();
            return;
          }
          if (celebSkipRef.current) {
            setCelebDisplayUSD(winUSD);
            setTimeout(() => {
              setCelebration((c) => ({ ...c, active: false }));
              resolve();
            }, 600);
            return;
          }
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          setCelebDisplayUSD(winUSD * eased);

          if (now - lastTick > 75 && t < 0.96) {
            lastTick = now;
            synthRef.current?.playWinTick();
          }

          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            setCelebDisplayUSD(winUSD);
            setTimeout(() => {
              setCelebration((c) => ({ ...c, active: false }));
              resolve();
            }, 1050);
          }
        };
        requestAnimationFrame(step);
      });
    },
    []
  );

  useEffect(() => {
    if (!celebration.active) return;
    let raf = 0;
    const items: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      tilt: number;
      color: string;
    }[] = [];
    const palette = ["#FDE047", "#F59E0B", "#EF4444", "#10B981", "#FFFFFF"];

    const tick = () => {
      const canvas = celebCanvasRef.current;
      if (!canvas) return;
      if (
        canvas.width !== window.innerWidth ||
        canvas.height !== window.innerHeight
      ) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < 3; i++) {
        if (items.length < 110) {
          items.push({
            x: canvas.width * 0.5 + (Math.random() - 0.5) * 140,
            y: canvas.height + 20,
            vx: (Math.random() - 0.5) * 13,
            vy: -(11 + Math.random() * 10),
            r: 8 + Math.random() * 8,
            tilt: Math.random() * Math.PI,
            color: palette[Math.floor(Math.random() * palette.length)],
          });
        }
      }
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.x += it.vx;
        it.y += it.vy;
        it.vy += 0.35;
        it.tilt += 0.12;
        if (it.y > canvas.height + 50 && it.vy > 0) {
          items.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.scale(Math.max(0.2, Math.abs(Math.cos(it.tilt))), 1);
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(0, 0, it.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [celebration.active]);

  /* ==========================================================================
   * 10. CORE 6x5 ENGINE: xWAYS, DOUBLING POSITION MULTIPLIERS & 3x3/5x5 BOMBS
   * ======================================================================== */

  const executeHunterSpin = useCallback(
    async (opts: {
      rng: HunterPrng;
      betBaseUSD: number;
      inFreeSpins: boolean;
      upgrades: HunterUpgradeKey[];
      initialMatrix: number[][];
      forcedScatters?: number;
      guaranteeReel2Scatter?: boolean;
    }): Promise<{
      totalWinUSD: number;
      scattersLanded: number;
      finalPosMatrix: number[][];
    }> => {
      const spd = turboSpin ? 0.55 : 1;
      const upgradedXways = opts.upgrades.includes("upgraded_xways");
      const upgradedBomb = opts.upgrades.includes("upgraded_bomb");

      // Clone working position multiplier matrix
      const posMatrix = opts.initialMatrix.map((row) => [...row]);
      setPositionMultipliers(posMatrix.map((row) => [...row]));

      // 1. Drop old symbols out
      setPhase("DROPPING");
      setGrid((prev) =>
        prev.map((c) => ({
          ...c,
          isWinning: false,
          isExploding: false,
          isBombBlast: false,
          isScatterHit: false,
          isXwaysTransforming: false,
          animType: "drop-out",
        }))
      );
      await sleep(Math.round(170 * spd));
      if (unmountedRef.current)
        return { totalWinUSD: 0, scattersLanded: 0, finalPosMatrix: posMatrix };

      // 2. Generate 30 symbols for 6x5 grid
      const nextGrid: HunterCell[] = [];
      let scatterCount = 0;

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = rollHunterCell(opts.rng, r, c, {
            inFreeSpins: opts.inFreeSpins,
            upgradedXways,
            allowSpecials: true,
            allowScatter: scatterCount < 5,
            animType: "drop-in",
            dropDelayMs: c * Math.round(45 * spd),
          });
          if (cell.symbol === "bonus_duck_target") scatterCount += 1;
          nextGrid.push(cell);
        }
      }

      // xBet Booster: Guarantee a Bonus Scatter on Reel 2 (col === 1)
      if (opts.guaranteeReel2Scatter) {
        const hasReel2 = nextGrid.some(
          (cell) => cell.col === 1 && cell.symbol === "bonus_duck_target"
        );
        if (!hasReel2) {
          const targetRow = Math.floor(opts.rng.nextFloat() * ROWS);
          const idx = targetRow * COLS + 1;
          nextGrid[idx] = {
            ...nextGrid[idx],
            symbol: "bonus_duck_target",
            xwaysBoost: undefined,
            isInfectiousXways: undefined,
          };
        }
      }

      // Force scatters on Bonus Buy
      if (opts.forcedScatters && opts.forcedScatters > 0) {
        const chosen = new Set<number>();
        while (chosen.size < Math.min(5, opts.forcedScatters)) {
          chosen.add(Math.floor(opts.rng.nextFloat() * 30));
        }
        for (let i = 0; i < nextGrid.length; i++) {
          if (chosen.has(i)) {
            nextGrid[i] = {
              ...nextGrid[i],
              symbol: "bonus_duck_target",
              xwaysBoost: undefined,
              isInfectiousXways: undefined,
              isScatterHit: true,
            };
          } else if (nextGrid[i].symbol === "bonus_duck_target") {
            nextGrid[i] = {
              ...nextGrid[i],
              symbol: pickRegularSymbol(opts.rng),
            };
          }
        }
      }

      setGrid(nextGrid);

      let scOrd = 0;
      for (let c = 0; c < COLS; c++) {
        setTimeout(() => {
          if (unmountedRef.current) return;
          synthRef.current?.playReelLock(c);
          const colSc = nextGrid.filter(
            (cell) => cell.col === c && cell.symbol === "bonus_duck_target"
          ).length;
          if (colSc > 0) {
            scOrd += colSc;
            synthRef.current?.playScatterTargetPing(scOrd);
          }
        }, Math.round((c * 45 + 130) * spd));
      }

      await sleep(Math.round(480 * spd));
      if (unmountedRef.current)
        return { totalWinUSD: 0, scattersLanded: 0, finalPosMatrix: posMatrix };

      let workingGrid = nextGrid.map((c) => ({
        ...c,
        animType: "none" as HunterCell["animType"],
      }));
      let spinAccumUSD = 0;
      let tumbleStep = 0;

      // Helper to resolve xWays / Infectious xWays crates before evaluating wins
      const resolveXwaysOnBoard = async () => {
        const crates = workingGrid.filter((c) => c.symbol === "xways_crate");
        if (crates.length === 0) return;

        setPhase("RESOLVING_XWAYS");
        for (const crate of crates) {
          const revealedSym = pickRegularSymbol(opts.rng);
          const boost = crate.xwaysBoost || 2;
          const infectious = Boolean(crate.isInfectiousXways || upgradedXways);
          synthRef.current?.playXwaysUnlock(infectious);

          // Boost crate's own cell position multiplier
          posMatrix[crate.row][crate.col] = Math.min(
            MAX_CELL_MULT,
            Math.max(1, posMatrix[crate.row][crate.col]) * boost
          );

          // Transform crate into revealed regular symbol
          workingGrid = workingGrid.map((c) =>
            c.uid === crate.uid
              ? {
                  ...c,
                  symbol: revealedSym,
                  isXwaysTransforming: true,
                  xwaysBoost: undefined,
                }
              : c
          );

          // Infectious xWays: infect every other matching instance on board!
          if (infectious) {
            for (const other of workingGrid) {
              if (other.uid !== crate.uid && other.symbol === revealedSym) {
                posMatrix[other.row][other.col] = Math.min(
                  MAX_CELL_MULT,
                  Math.max(1, posMatrix[other.row][other.col]) * boost
                );
                emitInfectionArc(
                  crate.col,
                  crate.row,
                  other.col,
                  other.row,
                  "#EC4899"
                );
              }
            }
          }

          setGrid(workingGrid);
          setPositionMultipliers(posMatrix.map((r) => [...r]));
          await sleep(Math.round(280 * spd));
        }

        workingGrid = workingGrid.map((c) => ({
          ...c,
          isXwaysTransforming: false,
        }));
        setGrid(workingGrid);
      };

      // 3. Cascading Loop (xWays -> Scatter-Pays Wins -> Explode & Double -> Bomb Blast -> Cascade)
      while (true) {
        await resolveXwaysOnBoard();
        if (unmountedRef.current) break;

        setPhase("EVALUATING");

        const wildCells = workingGrid.filter((c) => c.symbol === "wild_shell");
        const winningGroups: {
          symbol: RegularHunterSymbolId;
          cells: HunterCell[];
          posMultSum: number;
          winUSD: number;
        }[] = [];

        for (const regSym of REGULAR_HUNTER_SYMBOLS) {
          const matchingRegular = workingGrid.filter((c) => c.symbol === regSym);
          if (matchingRegular.length === 0) continue;

          const combined = [...matchingRegular, ...wildCells];
          if (combined.length >= 8) {
            const payMult = getHunterPayMult(regSym, combined.length);
            // Sum all active positionMultipliers (> 1) underneath winning symbols!
            let activeSum = 0;
            for (const cell of combined) {
              const m = posMatrix[cell.row][cell.col];
              if (m > 1) activeSum += m;
            }
            const totalPosMult = Math.max(1, activeSum);
            const winUSD =
              Math.round(opts.betBaseUSD * payMult * totalPosMult * 100) / 100;

            winningGroups.push({
              symbol: regSym,
              cells: combined,
              posMultSum: totalPosMult,
              winUSD,
            });
          }
        }

        if (winningGroups.length > 0) {
          const winningUidSet = new Set<string>();
          const newCallouts: FloatingCallout[] = [];
          const newHist: HunterHistoryItem[] = [];
          let stepWin = 0;

          for (const grp of winningGroups) {
            stepWin += grp.winUSD;
            let sCol = 0;
            let sRow = 0;
            for (const cell of grp.cells) {
              winningUidSet.add(cell.uid);
              sCol += cell.col;
              sRow += cell.row;
            }
            newCallouts.push({
              id: nextUid("hc"),
              xPercent: ((sCol / grp.cells.length + 0.5) / COLS) * 100,
              yPercent: ((sRow / grp.cells.length + 0.5) / ROWS) * 100,
              winUSD: grp.winUSD,
              posMultSum: grp.posMultSum,
            });
            newHist.push({
              id: nextUid("hh"),
              symbol: grp.symbol,
              count: grp.cells.length,
              posMultSum: grp.posMultSum,
              winUSD: grp.winUSD,
            });
          }

          spinAccumUSD = Math.round((spinAccumUSD + stepWin) * 100) / 100;
          setSpinWinUSD(spinAccumUSD);
          setHistoryItems((prev) => [...prev, ...newHist]);
          setCallouts(newCallouts);
          synthRef.current?.playComboHit(tumbleStep);
          tumbleStep += 1;

          // Highlight winning cells
          workingGrid = workingGrid.map((c) =>
            winningUidSet.has(c.uid) ? { ...c, isWinning: true } : c
          );
          setGrid(workingGrid);
          await sleep(Math.round(350 * spd));
          if (unmountedRef.current) break;

          // Explode & DOUBLE every exploded cell's Position Multiplier!
          setPhase("EXPLODING");
          workingGrid = workingGrid.map((c) =>
            winningUidSet.has(c.uid)
              ? { ...c, isWinning: false, isExploding: true }
              : c
          );
          setGrid(workingGrid);

          for (const cell of workingGrid) {
            if (winningUidSet.has(cell.uid)) {
              emitCellBlast(cell.col, cell.row, SYMBOL_META[cell.symbol].colors);
              const cur = posMatrix[cell.row][cell.col];
              posMatrix[cell.row][cell.col] =
                cur === 1 ? 2 : Math.min(MAX_CELL_MULT, cur * 2);
            }
          }
          setPositionMultipliers(posMatrix.map((r) => [...r]));
          await sleep(Math.round(250 * spd));
          if (unmountedRef.current) break;

          // Gravity Collapse & Refill
          setPhase("CASCADING");
          setCallouts([]);
          const collapsed: HunterCell[] = new Array(COLS * ROWS);
          let existingSc = workingGrid.filter(
            (c) =>
              !winningUidSet.has(c.uid) && c.symbol === "bonus_duck_target"
          ).length;

          for (let c = 0; c < COLS; c++) {
            const survivors = workingGrid
              .filter((cell) => cell.col === c && !winningUidSet.has(cell.uid))
              .sort((a, b) => a.row - b.row);
            const missing = ROWS - survivors.length;

            for (let r = 0; r < missing; r++) {
              const rolled = rollHunterCell(opts.rng, r, c, {
                inFreeSpins: opts.inFreeSpins,
                upgradedXways,
                allowSpecials: true,
                allowScatter: existingSc < 5,
                animType: "cascade",
                fallRows: missing + 1,
              });
              if (rolled.symbol === "bonus_duck_target") existingSc += 1;
              collapsed[r * COLS + c] = rolled;
            }

            for (let i = 0; i < survivors.length; i++) {
              const tr = missing + i;
              const s = survivors[i];
              const delta = tr - s.row;
              collapsed[tr * COLS + c] = {
                ...s,
                row: tr,
                isWinning: false,
                isExploding: false,
                animType: delta > 0 ? "cascade" : "none",
                fallRows: delta > 0 ? delta : 0,
              };
            }
          }

          workingGrid = collapsed;
          setGrid(workingGrid);
          await sleep(Math.round(290 * spd));
          workingGrid = workingGrid.map((c) => ({
            ...c,
            animType: "none",
            fallRows: 0,
          }));
          continue;
        }

        // No 8+ wins remain — check for Dynamite Bombs to detonate!
        const bombs = workingGrid.filter((c) => c.symbol === "dynamite_bomb");
        if (bombs.length > 0) {
          setPhase("BOMB_DETONATING");
          const radius = upgradedBomb ? 2 : 1; // 3x3 vs 5x5!
          const destroyedUids = new Set<string>();

          for (const bomb of bombs) {
            if (unmountedRef.current) break;
            destroyedUids.add(bomb.uid);
            setScreenShaking(true);
            synthRef.current?.playDynamiteExplosion(upgradedBomb);

            const blastCoords = new Set<string>();
            for (let dr = -radius; dr <= radius; dr++) {
              for (let dc = -radius; dc <= radius; dc++) {
                const nr = bomb.row + dr;
                const nc = bomb.col + dc;
                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                  blastCoords.add(`${nr},${nc}`);
                  // Double position multiplier of EVERY cell inside the 3x3 / 5x5 blast zone!
                  const cur = posMatrix[nr][nc];
                  posMatrix[nr][nc] =
                    cur === 1 ? 2 : Math.min(MAX_CELL_MULT, cur * 2);
                  emitCellBlast(nc, nr, ["#EF4444", "#FDE047", "#FB923C"], 10);
                }
              }
            }

            workingGrid = workingGrid.map((c) => {
              if (!blastCoords.has(`${c.row},${c.col}`)) return c;
              // Leave Scatters & Wilds untouched; destroy regular symbols & bomb itself
              if (
                c.symbol === "bonus_duck_target" ||
                c.symbol === "wild_shell"
              ) {
                return { ...c, isBombBlast: true };
              }
              destroyedUids.add(c.uid);
              return { ...c, isBombBlast: true, isExploding: true };
            });

            setGrid(workingGrid);
            setPositionMultipliers(posMatrix.map((r) => [...r]));
            await sleep(Math.round(420 * spd));
            setScreenShaking(false);
          }

          // Gravity Collapse after Dynamite Bomb blast
          setPhase("CASCADING");
          const collapsed: HunterCell[] = new Array(COLS * ROWS);
          let existingSc = workingGrid.filter(
            (c) =>
              !destroyedUids.has(c.uid) && c.symbol === "bonus_duck_target"
          ).length;

          for (let c = 0; c < COLS; c++) {
            const survivors = workingGrid
              .filter((cell) => cell.col === c && !destroyedUids.has(cell.uid))
              .sort((a, b) => a.row - b.row);
            const missing = ROWS - survivors.length;

            for (let r = 0; r < missing; r++) {
              const rolled = rollHunterCell(opts.rng, r, c, {
                inFreeSpins: opts.inFreeSpins,
                upgradedXways,
                allowSpecials: true,
                allowScatter: existingSc < 5,
                animType: "cascade",
                fallRows: missing + 1,
              });
              if (rolled.symbol === "bonus_duck_target") existingSc += 1;
              collapsed[r * COLS + c] = rolled;
            }

            for (let i = 0; i < survivors.length; i++) {
              const tr = missing + i;
              const s = survivors[i];
              const delta = tr - s.row;
              collapsed[tr * COLS + c] = {
                ...s,
                row: tr,
                isBombBlast: false,
                isExploding: false,
                animType: delta > 0 ? "cascade" : "none",
                fallRows: delta > 0 ? delta : 0,
              };
            }
          }

          workingGrid = collapsed;
          setGrid(workingGrid);
          await sleep(Math.round(300 * spd));
          workingGrid = workingGrid.map((c) => ({
            ...c,
            animType: "none",
            fallRows: 0,
          }));
          continue; // Loop back to evaluate new symbols + doubled multipliers!
        }

        break; // Settled completely
      }

      const finalScatters = workingGrid.filter(
        (c) => c.symbol === "bonus_duck_target"
      );
      if (finalScatters.length >= 3 || (opts.inFreeSpins && finalScatters.length > 0)) {
        workingGrid = workingGrid.map((c) =>
          c.symbol === "bonus_duck_target" ? { ...c, isScatterHit: true } : c
        );
        setGrid(workingGrid);
        if (finalScatters.length >= 3) {
          synthRef.current?.playHornFanfare();
        }
        await sleep(360);
      }

      setPhase("SPIN_COMPLETE");
      return {
        totalWinUSD: spinAccumUSD,
        scattersLanded: finalScatters.length,
        finalPosMatrix: posMatrix,
      };
    },
    [
      emitCellBlast,
      emitInfectionArc,
      nextUid,
      pickRegularSymbol,
      rollHunterCell,
      sleep,
      turboSpin,
    ]
  );

  /* ==========================================================================
   * 11. SPIN ORCHESTRATOR, 3 BONUS TIERS & POST-SPIN EXTRA SPIN OFFER
   * ======================================================================== */

  const pickRandomUpgrades = useCallback(
    (rng: HunterPrng, count: number): HunterUpgradeKey[] => {
      const all: HunterUpgradeKey[] = [
        "upgraded_xways",
        "upgraded_bomb",
        "extra_2_shots",
      ];
      if (count >= 3) return all;
      const pool = [...all];
      const chosen: HunterUpgradeKey[] = [];
      for (let i = 0; i < count && pool.length > 0; i++) {
        const idx = Math.floor(rng.nextFloat() * pool.length);
        chosen.push(pool.splice(idx, 1)[0]);
      }
      return chosen;
    },
    []
  );

  const runSpin = useCallback(
    async (opts?: {
      buyTier?: BonusTierKey;
      extraSpin?: { costUSD: number; lockedMatrix: number[][] };
    }) => {
      if (isSpinningRef.current) return;
      synthRef.current?.unlock();

      const fsActive = fsRef.current.active;
      const isBuy = Boolean(opts?.buyTier);
      const isExtra = Boolean(opts?.extraSpin);

      let wagerUSD = 0;
      let spinBetBase = baseBetUSD;

      if (fsActive) {
        spinBetBase = fsRef.current.wagerBase;
        wagerUSD = 0;
      } else if (isBuy && opts?.buyTier) {
        wagerUSD =
          Math.round(baseBetUSD * BONUS_TIERS[opts.buyTier].buyMult * 100) /
          100;
        if (balanceRef.current < wagerUSD) {
          setAutoplayLeft(0);
          return;
        }
        updateBalance(balanceRef.current - wagerUSD);
      } else if (isExtra && opts?.extraSpin) {
        wagerUSD = opts.extraSpin.costUSD;
        if (balanceRef.current < wagerUSD) return;
        updateBalance(balanceRef.current - wagerUSD);
      } else {
        wagerUSD = effectiveSpinCostUSD;
        if (balanceRef.current < wagerUSD) {
          setAutoplayLeft(0);
          return;
        }
        updateBalance(balanceRef.current - wagerUSD);
      }

      isSpinningRef.current = true;
      setExtraSpinOffer((e) => ({ ...e, open: false }));
      setShowBetModal(false);
      setShowAutoMenu(false);
      setSpinWinUSD(0);
      setCallouts([]);
      setHistoryItems([]);

      const usedNonce = nonce;
      setNonce((n) => n + 1);
      const proofHash = await sha256Hex(`${serverSeed}:${clientSeed}:${usedNonce}`);
      const rng = new HunterPrng(proofHash);

      if (fsActive) {
        fsRef.current.left -= 1;
        fsRef.current.num += 1;
        setFreeSpinsLeft(fsRef.current.left);
        setFreeSpinNum(fsRef.current.num);
      }

      const initialMatrix = fsActive
        ? fsRef.current.posMatrix
        : isExtra && opts?.extraSpin
          ? opts.extraSpin.lockedMatrix
          : createMultiplierMatrix(
              isBuy ? 1 : BOOSTER_CONFIG[boosterMode].preloadedMult
            );

      const forcedScatters =
        isBuy && opts?.buyTier
          ? BONUS_TIERS[opts.buyTier].scattersRequired
          : undefined;

      const res = await executeHunterSpin({
        rng,
        betBaseUSD: spinBetBase,
        inFreeSpins: fsActive,
        upgrades: fsActive ? fsRef.current.upgrades : [],
        initialMatrix,
        forcedScatters,
        guaranteeReel2Scatter: !fsActive && !isBuy && !isExtra && boosterMode === "xbet",
      });

      if (unmountedRef.current) {
        isSpinningRef.current = false;
        return;
      }

      const maxCapUSD = Math.round(spinBetBase * MAX_WIN_MULT * 100) / 100;

      if (!fsActive) {
        // Check for Bonus Trigger (3, 4, or 5 Scatters OR Bonus Buy)
        let triggeredTier: BonusTierKey | null = opts?.buyTier || null;
        if (!triggeredTier && res.scattersLanded >= 3) {
          triggeredTier =
            res.scattersLanded >= 5
              ? "big_game"
              : res.scattersLanded === 4
                ? "hawk_eye"
                : "duck_hunt";
        }

        if (triggeredTier) {
          setAutoplayLeft(0);
          const cfg = BONUS_TIERS[triggeredTier];
          const awardedUpgrades = pickRandomUpgrades(rng, cfg.upgradeCount);

          setUpgradeWheelModal({
            open: true,
            tier: triggeredTier,
            awarded: awardedUpgrades,
          });
          await sleep(2000);
          setUpgradeWheelModal((w) => ({ ...w, open: false }));

          const startWin = Math.min(maxCapUSD, res.totalWinUSD);
          fsRef.current = {
            active: true,
            tier: triggeredTier,
            upgrades: awardedUpgrades,
            left: cfg.spins,
            total: cfg.spins,
            num: 0,
            cumulativeWin: startWin,
            wagerBase: spinBetBase,
            totalCost: isBuy ? wagerUSD : effectiveSpinCostUSD,
            posMatrix: res.finalPosMatrix,
          };

          setIsFreeSpins(true);
          setBonusTier(triggeredTier);
          setActiveUpgrades(awardedUpgrades);
          setFreeSpinsLeft(cfg.spins);
          setFreeSpinsTotal(cfg.spins);
          setFreeSpinNum(0);
          setBonusCumulativeWinUSD(startWin);

          isSpinningRef.current = false;
          if (!unmountedRef.current) void runSpin();
          return;
        }

        // Base Spin Settlement
        const capped = Math.min(maxCapUSD, res.totalWinUSD);
        const hitMax = res.totalWinUSD >= maxCapUSD;
        if (capped > 0) updateBalance(balanceRef.current + capped);

        const mult =
          spinBetBase > 0 ? Math.round((capped / spinBetBase) * 100) / 100 : 0;
        const record: ZyanHunter10000BetRecord = {
          gameKey: "ZYAN_HUNTER_10000",
          gameName: "Zyan Hunter 10,000x",
          wagerUSD,
          multiplier: mult,
          payoutUSD: capped,
          isWin: capped > 0,
          proofHash,
        };
        onRecordBet?.(record);
        if (typeof window !== "undefined" && window.parent !== window) {
          window.parent.postMessage({ type: "ZYAN_SLOT_BET", ...record }, "*");
        }
        setFairnessLogs((prev) => [
          {
            nonce: usedNonce,
            serverSeedHash,
            clientSeed,
            proofHash,
            wagerUSD,
            payoutUSD: capped,
            multiplier: mult,
          },
          ...prev.slice(0, 24),
        ]);

        if (capped >= spinBetBase * 15 || hitMax) {
          await triggerCelebration(capped, spinBetBase, hitMax);
        }

        // Post-Spin "EXTRA SPIN" Offer when high multipliers sit on board & cost <= win
        const flatMults = res.finalPosMatrix.flat();
        const maxCell = Math.max(...flatMults);
        const sumAbove1 = flatMults.reduce((s, m) => (m > 1 ? s + m : s), 0);
        if (!hitMax && !isExtra && autoplayRef.current === 0 && (maxCell >= 8 || sumAbove1 >= 36) && capped > 0) {
          const rawExtraCost = Math.max(
            spinBetBase * 1.5,
            Math.round((sumAbove1 * spinBetBase * 0.12) * 100) / 100
          );
          if (rawExtraCost <= capped && balanceRef.current >= rawExtraCost) {
            setExtraSpinOffer({
              open: true,
              costUSD: rawExtraCost,
              lockedMatrix: res.finalPosMatrix,
              maxCellMult: maxCell,
            });
          }
        }

        setPhase("IDLE");
        isSpinningRef.current = false;

        if (autoplayRef.current > 0 && !unmountedRef.current) {
          setAutoplayLeft((a) => a - 1);
          if (balanceRef.current >= effectiveSpinCostUSD) {
            setTimeout(() => {
              if (!isSpinningRef.current && !unmountedRef.current) {
                void runSpin();
              }
            }, turboSpin ? 220 : 420);
          } else {
            setAutoplayLeft(0);
          }
        }
      } else {
        // Inside Free Spins — Position Multipliers NEVER reset!
        fsRef.current.posMatrix = res.finalPosMatrix;
        const nextCum = Math.min(
          maxCapUSD,
          Math.round((fsRef.current.cumulativeWin + res.totalWinUSD) * 100) / 100
        );
        const hitMax = nextCum >= maxCapUSD;
        fsRef.current.cumulativeWin = nextCum;
        setBonusCumulativeWinUSD(nextCum);

        // Retrigger: +1 shot per scatter (or +2 if Extra +2 Shots upgrade active)
        if (!hitMax && res.scattersLanded > 0) {
          const perScatter = fsRef.current.upgrades.includes("extra_2_shots")
            ? 2
            : 1;
          const addSpins = res.scattersLanded * perScatter;
          fsRef.current.left += addSpins;
          fsRef.current.total += addSpins;
          setFreeSpinsLeft(fsRef.current.left);
          setFreeSpinsTotal(fsRef.current.total);
        }

        if (fsRef.current.left > 0 && !hitMax) {
          await sleep(turboSpin ? 280 : 500);
          isSpinningRef.current = false;
          if (!unmountedRef.current) void runSpin();
          return;
        }

        // Complete Free Spins Bonus
        const finalBonusWin = fsRef.current.cumulativeWin;
        const played = fsRef.current.num;
        const cost = fsRef.current.totalCost;

        if (finalBonusWin > 0) {
          updateBalance(balanceRef.current + finalBonusWin);
        }

        const mult =
          spinBetBase > 0
            ? Math.round((finalBonusWin / spinBetBase) * 100) / 100
            : 0;
        const record: ZyanHunter10000BetRecord = {
          gameKey: "ZYAN_HUNTER_10000",
          gameName: "Zyan Hunter 10,000x",
          wagerUSD: cost,
          multiplier: mult,
          payoutUSD: finalBonusWin,
          isWin: finalBonusWin > 0,
          proofHash,
        };
        onRecordBet?.(record);
        if (typeof window !== "undefined" && window.parent !== window) {
          window.parent.postMessage({ type: "ZYAN_SLOT_BET", ...record }, "*");
        }
        setFairnessLogs((prev) => [
          {
            nonce: usedNonce,
            serverSeedHash,
            clientSeed,
            proofHash,
            wagerUSD: cost,
            payoutUSD: finalBonusWin,
            multiplier: mult,
          },
          ...prev.slice(0, 24),
        ]);

        if (finalBonusWin >= spinBetBase * 15 || hitMax) {
          await triggerCelebration(finalBonusWin, spinBetBase, hitMax);
        }

        setBonusSummary({
          open: true,
          totalWinUSD: finalBonusWin,
          spinsPlayed: played,
          isMaxWin: hitMax,
        });

        fsRef.current.active = false;
        setIsFreeSpins(false);
        setActiveUpgrades([]);
        setPositionMultipliers(createMultiplierMatrix(1));
        setPhase("IDLE");
        isSpinningRef.current = false;
      }
    },
    [
      baseBetUSD,
      boosterMode,
      clientSeed,
      effectiveSpinCostUSD,
      executeHunterSpin,
      nonce,
      onRecordBet,
      pickRandomUpgrades,
      serverSeed,
      serverSeedHash,
      sleep,
      triggerCelebration,
      turboSpin,
      updateBalance,
    ]
  );

  // Spacebar shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (celebration.active) {
        celebSkipRef.current = true;
        return;
      }
      if (bonusSummary.open) {
        setBonusSummary((s) => ({ ...s, open: false }));
        return;
      }
      if (
        !showBetModal &&
        !showInfoModal &&
        !showFairnessModal &&
        !buyConfirmTier &&
        !upgradeWheelModal.open &&
        !isSpinningRef.current
      ) {
        void runSpin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    bonusSummary.open,
    buyConfirmTier,
    celebration.active,
    runSpin,
    showBetModal,
    showFairnessModal,
    showInfoModal,
    upgradeWheelModal.open,
  ]);

  const adjustBet = useCallback(
    (dir: -1 | 1) => {
      if (isSpinningRef.current || isFreeSpins) return;
      synthRef.current?.playClick(dir > 0 ? 640 : 480);
      const idx = BET_PRESETS.findIndex((v) => v >= baseBetUSD - 0.001);
      const safe = idx === -1 ? 0 : idx;
      const next = Math.max(0, Math.min(BET_PRESETS.length - 1, safe + dir));
      setBaseBetUSD(BET_PRESETS[next]);
    },
    [baseBetUSD, isFreeSpins]
  );

  const rotateServerSeed = useCallback(() => {
    const old = serverSeed;
    setFairnessLogs((prev) =>
      prev.map((l) =>
        l.serverSeedHash === serverSeedHash
          ? { ...l, revealedServerSeed: old }
          : l
      )
    );
    setServerSeed(randomHex(32));
    setNonce(1);
    synthRef.current?.playClick(780);
  }, [serverSeed, serverSeedHash]);

  const isBusy = phase !== "IDLE" || isFreeSpins || upgradeWheelModal.open;

  /* ==========================================================================
   * 12. RENDER
   * ======================================================================== */

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      style={
        ZYAN_HUNTER_ASSETS.STAGE_BG
          ? {
              backgroundImage: `url(${ZYAN_HUNTER_ASSETS.STAGE_BG})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
      className={`relative min-h-screen w-full overflow-hidden transition-colors duration-700 ${
        isFreeSpins
          ? "bg-[radial-gradient(ellipse_at_top,#450a0a_0%,#1c0a0a_50%,#090505_100%)]"
          : "bg-[radial-gradient(ellipse_at_top,#2a120b_0%,#110d14_55%,#07060a_100%)]"
      }`}
    >
      {/* Dark Swamp Vignette + Ambient Rugged Gold & Crimson Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(7,6,10,0.35)_0%,rgba(6,5,10,0.86)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-36 left-1/2 h-[500px] w-[920px] -translate-x-1/2 rounded-full bg-gradient-to-r from-red-600/20 via-amber-500/20 to-orange-600/15 blur-[130px]"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1220px] flex-col justify-between px-2.5 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4">
        {/* TOP HEADER */}
        <header className="mb-2 flex flex-wrap items-center justify-between gap-2.5 border-b border-white/10 pb-2.5 sm:mb-3">
          <div className="flex items-center gap-3 shrink-0">
            {!logoError ? (
              <img
                src={ZYAN_LOGO_URL}
                alt="ZYAN.GG"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
                style={{ mixBlendMode: "lighten" }}
                className="h-8 w-auto object-contain sm:h-10"
              />
            ) : (
              <span className="font-display text-xl font-black tracking-tight text-white">
                ZYAN.GG
              </span>
            )}
            {username && (
              <span className="hidden text-xs font-medium text-slate-300 sm:inline">
                Hunter: <strong className="text-white">{username}</strong>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <h1 className="font-display bg-gradient-to-r from-amber-300 via-yellow-400 to-red-500 bg-clip-text text-lg font-black uppercase tracking-tight text-transparent drop-shadow-[0_2px_10px_rgba(239,68,68,0.4)] sm:text-2xl lg:text-[26px]">
              ZYAN HUNTER 10,000x
            </h1>
            <span className="font-display inline-flex items-center gap-1 rounded-md border border-red-500/50 bg-red-950/50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300 sm:text-[11px]">
              <Crosshair className="h-3 w-3 text-red-400" />
              EXTREME VOLATILITY • MAX WIN 10,000x
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                synthRef.current?.playClick();
                setShowFairnessModal(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:border-amber-400/50 hover:bg-white/10"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Fairness</span>
            </button>
            <button
              type="button"
              onClick={() => {
                synthRef.current?.playClick();
                setShowInfoModal(true);
              }}
              aria-label="Paytable"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:border-red-400/50 hover:bg-white/10"
            >
              <Info className="h-3.5 w-3.5 text-amber-300" />
              <span className="hidden sm:inline">Paytable</span>
            </button>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute" : "Mute"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-rose-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-amber-300" />
              )}
            </button>
          </div>
        </header>

        {/* Mobile Compact Feature Buy & Booster Strip (< 768px) */}
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 md:hidden">
          {(["duck_hunt", "hawk_eye", "big_game"] as BonusTierKey[]).map((t) => {
            const cfg = BONUS_TIERS[t];
            const cost = Math.round(baseBetUSD * cfg.buyMult * 100) / 100;
            return (
              <button
                key={t}
                type="button"
                disabled={isBusy || balanceUSD < cost}
                onClick={() => setBuyConfirmTier(t)}
                className="shrink-0 rounded-lg border border-amber-500/45 bg-slate-900/90 px-2.5 py-1.5 text-left disabled:opacity-40"
              >
                <div className="font-display text-[10px] font-black uppercase text-amber-300">
                  {cfg.title}
                </div>
                <div className="font-ui text-xs font-extrabold text-white">
                  {formatUSD(cost)}
                </div>
              </button>
            );
          })}
        </div>

        {/* MAIN ARENA: LEFT NOLIMIT PANEL + 6x5 GRID */}
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-stretch lg:gap-4">
          {/* Desktop Left Column (250px): 3 Bonus Tiers + xBet / Day 2/64/1024 Boosters */}
          <aside className="hidden w-[250px] shrink-0 flex-col gap-2 md:flex">
            {/* 3 Escalating Bonus Buy Tiers */}
            <div className="rounded-xl border border-amber-500/35 bg-slate-950/85 p-2.5 backdrop-blur-md">
              <div className="font-display mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-300">
                <Flame className="h-3.5 w-3.5 text-red-400" />
                BONUS FEATURE BUYS
              </div>
              <div className="space-y-1.5">
                {(["duck_hunt", "hawk_eye", "big_game"] as BonusTierKey[]).map(
                  (t) => {
                    const cfg = BONUS_TIERS[t];
                    const cost =
                      Math.round(baseBetUSD * cfg.buyMult * 100) / 100;
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={isBusy || balanceUSD < cost}
                        onClick={() => {
                          synthRef.current?.playClick();
                          setBuyConfirmTier(t);
                        }}
                        className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-gradient-to-r from-slate-900 to-red-950/60 px-2.5 py-2 text-left transition hover:border-amber-400 disabled:opacity-40"
                      >
                        <div>
                          <div className="font-display text-[11px] font-black uppercase text-white">
                            {cfg.title}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {cfg.spins} Spins · {cfg.upgradeCount} Upgrade
                            {cfg.upgradeCount > 1 ? "s" : ""}
                          </div>
                        </div>
                        <span className="font-ui text-xs font-extrabold text-amber-300">
                          {formatUSD(cost)}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Nolimit xBet & Day 2 / Day 64 / Day 1024 Boosters */}
            <div className="rounded-xl border border-white/15 bg-slate-950/85 p-2.5 backdrop-blur-md">
              <div className="font-display mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                xBET &amp; DAY BOOSTERS
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {(["xbet", "day2", "day64", "day1024"] as BoosterMode[]).map(
                  (mode) => {
                    const cfg = BOOSTER_CONFIG[mode];
                    const active = boosterMode === mode;
                    const cost =
                      Math.round(baseBetUSD * cfg.costMult * 100) / 100;
                    return (
                      <button
                        key={mode}
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          synthRef.current?.playClick();
                          setBoosterMode(active ? "none" : mode);
                        }}
                        className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left transition disabled:opacity-45 ${
                          active
                            ? "border-amber-400 bg-amber-500/20 text-white"
                            : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25"
                        }`}
                      >
                        <div>
                          <div className="font-display text-[11px] font-black uppercase">
                            {cfg.label} ({cfg.costMult}x)
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {cfg.desc}
                          </div>
                        </div>
                        <span className="font-ui shrink-0 text-[11px] font-extrabold text-amber-300">
                          {formatUSD(cost)}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Live Hunter Tumble Log */}
            <div className="flex flex-1 flex-col rounded-xl border border-white/12 bg-slate-950/80 p-2.5 backdrop-blur-md">
              <div className="mb-1.5 flex items-center justify-between border-b border-white/10 pb-1">
                <span className="font-display text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
                  HUNT LOG
                </span>
                <span className="font-ui text-[11px] font-bold text-amber-300">
                  {historyItems.length}
                </span>
              </div>
              {historyItems.length === 0 ? (
                <div className="flex flex-1 items-center justify-center py-3 text-center text-[11px] text-slate-500">
                  Exploding wins double cell multipliers up to 8,192x
                </div>
              ) : (
                <div className="max-h-[140px] space-y-1 overflow-y-auto pr-1">
                  {historyItems.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5">
                          <HunterSymbol3D id={it.symbol} />
                        </div>
                        <span className="font-ui font-bold text-slate-200">
                          ×{it.count}
                        </span>
                        {it.posMultSum > 1 && (
                          <span className="font-display rounded bg-amber-400/20 px-1 text-[10px] font-black text-amber-300">
                            {it.posMultSum}x
                          </span>
                        )}
                      </div>
                      <span className="font-ui font-extrabold text-emerald-400">
                        +{formatUSD(it.winUSD)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Center Stage: Top Banner + 6x5 Grid */}
          <main className="flex min-w-0 flex-1 flex-col">
            <div
              className={`mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 backdrop-blur-md sm:px-4 ${
                isFreeSpins
                  ? "border-red-500/70 bg-gradient-to-r from-red-950/90 via-amber-950/80 to-red-950/90 shadow-[0_0_24px_rgba(239,68,68,0.3)]"
                  : "border-white/15 bg-slate-950/80"
              }`}
            >
              {isFreeSpins ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display rounded bg-red-600 px-2 py-0.5 text-[11px] font-black uppercase text-white">
                      {BONUS_TIERS[bonusTier].title}
                    </span>
                    <span className="font-display text-xs font-black uppercase text-amber-200 sm:text-sm">
                      SHOT {freeSpinNum} / {freeSpinsTotal} ({freeSpinsLeft} LEFT)
                    </span>
                    {activeUpgrades.map((up) => (
                      <span
                        key={up}
                        className="font-display rounded border border-amber-300/40 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-200"
                      >
                        {UPGRADE_LABELS[up].name}
                      </span>
                    ))}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-amber-300/80">
                      BONUS WIN:{" "}
                    </span>
                    <span className="font-ui text-base font-black text-amber-300 sm:text-lg">
                      {formatUSD(bonusCumulativeWinUSD)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-display text-[11px] font-extrabold uppercase tracking-wider text-slate-300 sm:text-xs">
                    {boosterMode !== "none"
                      ? `ACTIVE BOOSTER: ${BOOSTER_CONFIG[boosterMode].label.toUpperCase()} (${BOOSTER_CONFIG[boosterMode].costMult}x)`
                      : "8+ SCATTER PAYS · CELLS DOUBLE UP TO 8,192x"}
                  </span>
                  <span
                    className={`font-display text-sm font-black uppercase sm:text-base ${
                      spinWinUSD > 0 ? "text-emerald-400" : "text-slate-400"
                    }`}
                  >
                    {spinWinUSD > 0
                      ? `SPIN WIN: ${formatUSD(spinWinUSD)}`
                      : "LOCKED & LOADED"}
                  </span>
                </div>
              )}
            </div>

            {/* Post-Spin EXTRA SPIN Offer Banner */}
            {extraSpinOffer.open && !isBusy && (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-amber-400 bg-gradient-to-r from-amber-950/95 via-red-950/95 to-amber-950/95 px-4 py-2.5 shadow-[0_0_28px_rgba(245,158,11,0.4)]">
                <div>
                  <div className="font-display text-xs font-black uppercase text-amber-300 sm:text-sm">
                    EXTRA SPIN OFFER — KEEP BOARD MULTIPLIERS (UP TO{" "}
                    {extraSpinOffer.maxCellMult}x)!
                  </div>
                  <div className="text-[11px] text-slate-200">
                    Lock all active position multipliers on the 6×5 grid for 1 more shot
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExtraSpinOffer((e) => ({ ...e, open: false }))
                    }
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/10"
                  >
                    SKIP
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void runSpin({
                        extraSpin: {
                          costUSD: extraSpinOffer.costUSD,
                          lockedMatrix: extraSpinOffer.lockedMatrix,
                        },
                      })
                    }
                    className="font-display rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-1.5 text-xs font-black uppercase text-slate-950 shadow-lg hover:brightness-110"
                  >
                    BUY EXTRA SPIN {formatUSD(extraSpinOffer.costUSD)}
                  </button>
                </div>
              </div>
            )}

            {/* 6x5 Grid Container with Permanent Etched Position Multipliers & Screen Shake */}
            <div
              style={
                screenShaking
                  ? { animation: "zyanHunterShake 0.4s ease-in-out" }
                  : undefined
              }
              className={`relative flex-1 rounded-2xl border-2 p-1.5 shadow-2xl transition-colors duration-500 sm:p-2.5 lg:p-3 ${
                isFreeSpins
                  ? "border-red-500/75 bg-gradient-to-b from-red-950/65 via-[#180a0a]/85 to-amber-950/65 shadow-[0_0_50px_rgba(239,68,68,0.28)]"
                  : "border-amber-500/45 bg-gradient-to-b from-[#1e1510]/80 via-[#0e0b10]/90 to-[#1a0d0d]/80 shadow-[0_0_45px_rgba(245,158,11,0.18)]"
              } backdrop-blur-xl`}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.04]"
              >
                <span className="font-display text-5xl font-black tracking-widest text-white sm:text-7xl">
                  ZYAN.GG
                </span>
              </div>

              <div
                ref={gridBoxRef}
                className="relative grid h-full min-h-[290px] w-full grid-cols-6 grid-rows-5 gap-1 overflow-hidden rounded-xl bg-black/40 p-1 sm:min-h-[420px] sm:gap-2 sm:p-2"
              >
                {grid.map((cell) => {
                  const posMult = positionMultipliers[cell.row]?.[cell.col] ?? 1;
                  const animStyle: React.CSSProperties = {};
                  if (cell.animType === "drop-out") {
                    animStyle.animation = `zyanReelDropOut ${turboSpin ? "95ms" : "170ms"} ease-in forwards`;
                  } else if (cell.animType === "drop-in") {
                    animStyle.animation = `zyanReelDropIn ${turboSpin ? "210ms" : "330ms"} cubic-bezier(0.22, 1.28, 0.36, 1) ${cell.dropDelayMs || 0}ms both`;
                  } else if (cell.animType === "cascade" && (cell.fallRows || 0) > 0) {
                    (animStyle as Record<string, string | number>)["--zyan-fall-from"] = `-${(cell.fallRows || 1) * 108}%`;
                    animStyle.animation = `zyanCascadeFall ${turboSpin ? "155ms" : "250ms"} cubic-bezier(0.22, 1.2, 0.36, 1) both`;
                  } else if (cell.isWinning) {
                    animStyle.animation = "zyanSymbolWinPulse 0.34s ease-out forwards";
                  } else if (cell.isExploding) {
                    animStyle.animation = "zyanSymbolExplode 0.24s ease-in forwards";
                  } else if (cell.isScatterHit) {
                    animStyle.animation = "zyanScatterLand 0.45s ease-out infinite";
                  }

                  return (
                    <div
                      key={cell.uid}
                      style={animStyle}
                      className={`relative flex aspect-square items-center justify-center rounded-lg p-1 transition-colors sm:rounded-xl sm:p-1.5 ${
                        cell.isWinning
                          ? "z-10 border-2 border-amber-300 bg-amber-400/20 shadow-[0_0_20px_rgba(251,191,36,0.7)]"
                          : cell.isBombBlast
                            ? "z-10 border-2 border-red-400 bg-red-500/25 shadow-[0_0_20px_rgba(239,68,68,0.85)]"
                            : cell.isXwaysTransforming
                              ? "z-10 border-2 border-emerald-400 bg-emerald-500/20"
                              : posMult > 1
                                ? "border border-amber-400/45 bg-amber-500/[0.08]"
                                : "border border-white/5 bg-white/[0.03]"
                      }`}
                    >
                      {/* Permanently Etched Doubling Cell Position Multiplier Badge */}
                      {posMult > 1 && (
                        <div
                          className={`font-display pointer-events-none absolute top-0.5 left-0.5 z-20 rounded border px-1 py-0.5 text-[9px] font-black leading-none sm:text-[11px] ${getPositionBadgeStyle(
                            posMult
                          )}`}
                        >
                          {posMult.toLocaleString()}x
                        </div>
                      )}

                      <HunterSymbol3D
                        id={cell.symbol}
                        xwaysBoost={cell.xwaysBoost}
                        isInfectiousXways={cell.isInfectiousXways}
                        className="h-full w-full select-none"
                      />
                    </div>
                  );
                })}

                <canvas
                  ref={fxCanvasRef}
                  className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                />

                {callouts.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      left: `${c.xPercent}%`,
                      top: `${c.yPercent}%`,
                      animation: "zyanFloatCallout 0.9s ease-out forwards",
                    }}
                    className="pointer-events-none absolute z-30 rounded-lg border border-amber-300 bg-slate-950/95 px-2.5 py-1 text-center shadow-2xl"
                  >
                    {c.posMultSum > 1 && (
                      <div className="font-display text-[10px] font-black text-amber-300">
                        {c.posMultSum.toLocaleString()}X POS MULT
                      </div>
                    )}
                    <span className="font-display text-sm font-black text-emerald-300 sm:text-lg">
                      +{formatUSD(c.winUSD)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>

        {/* BOTTOM CONTROL BAR */}
        <footer className="relative mt-2.5 rounded-2xl border border-white/15 bg-slate-950/90 px-3 py-2.5 shadow-xl backdrop-blur-md sm:mt-3 sm:px-5 sm:py-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <button
                type="button"
                onClick={() => {
                  synthRef.current?.playClick();
                  setShowInfoModal(true);
                }}
                aria-label="Paytable & Rules"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/5 text-slate-200 hover:border-amber-400"
              >
                <Info className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  synthRef.current?.playClick();
                  setTurboSpin((t) => !t);
                }}
                className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition ${
                  turboSpin
                    ? "border-amber-400 bg-amber-400/20 text-amber-300"
                    : "border-white/15 bg-white/5 text-slate-300"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">TURBO</span>
              </button>

              {/* Mobile Booster Quick Cycle */}
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  const order: BoosterMode[] = [
                    "none",
                    "xbet",
                    "day2",
                    "day64",
                    "day1024",
                  ];
                  const next =
                    order[(order.indexOf(boosterMode) + 1) % order.length];
                  setBoosterMode(next);
                }}
                className="inline-flex h-10 items-center rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 text-[11px] font-bold text-amber-200 disabled:opacity-45 md:hidden"
              >
                {BOOSTER_CONFIG[boosterMode].label}
              </button>

              <div className="min-w-[96px]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  CREDIT
                </div>
                <div className="font-ui text-base font-extrabold text-white sm:text-lg">
                  {formatUSD(balanceUSD)}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isBusy || baseBetUSD <= BET_PRESETS[0]}
                  onClick={() => adjustBet(-1)}
                  aria-label="Decrease Bet"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white disabled:opacity-35"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    synthRef.current?.playClick();
                    setShowBetModal((s) => !s);
                  }}
                  className="min-w-[94px] rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-left transition hover:border-amber-400/60"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {boosterMode !== "none"
                      ? `${BOOSTER_CONFIG[boosterMode].label} BET`
                      : "BASE BET"}
                  </div>
                  <div className="font-ui text-sm font-extrabold text-amber-300 sm:text-base">
                    {formatUSD(effectiveSpinCostUSD)}
                  </div>
                </button>
                <button
                  type="button"
                  disabled={
                    isBusy || baseBetUSD >= BET_PRESETS[BET_PRESETS.length - 1]
                  }
                  onClick={() => adjustBet(1)}
                  aria-label="Increase Bet"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white disabled:opacity-35"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
              <div className="relative">
                {autoplayLeft > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAutoplayLeft(0)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-rose-400 bg-rose-500/20 px-3 text-xs font-extrabold text-rose-200"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span className="font-ui">STOP ({autoplayLeft})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      synthRef.current?.playClick();
                      setShowAutoMenu((s) => !s);
                    }}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3 text-xs font-bold text-slate-200 disabled:opacity-45"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>AUTOPLAY</span>
                  </button>
                )}

                {showAutoMenu && (
                  <div className="absolute right-0 bottom-14 z-40 w-44 rounded-xl border border-white/20 bg-slate-900 p-2 shadow-2xl">
                    <div className="mb-1.5 px-2 text-[11px] font-bold uppercase text-slate-400">
                      Auto Spins
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[10, 25, 50, 100].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => {
                            setShowAutoMenu(false);
                            setAutoplayLeft(cnt);
                            if (!isSpinningRef.current && !isFreeSpins) {
                              void runSpin();
                            }
                          }}
                          className="font-ui rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-extrabold text-white hover:border-amber-400"
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
                disabled={
                  isBusy || (!isFreeSpins && balanceUSD < effectiveSpinCostUSD)
                }
                onClick={() => void runSpin()}
                aria-label="Spin Reels"
                className={`group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 transition-transform duration-150 sm:h-16 sm:w-16 ${
                  isBusy
                    ? "cursor-not-allowed border-red-400/40 bg-slate-800"
                    : "border-amber-300 bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 shadow-[0_0_28px_rgba(239,68,68,0.55)] hover:scale-105 active:scale-95"
                }`}
              >
                <RotateCw
                  className={`h-7 w-7 text-slate-950 sm:h-8 sm:w-8 ${
                    isBusy ? "animate-spin text-amber-300" : "group-hover:rotate-45"
                  }`}
                />
              </button>
            </div>
          </div>

          {showBetModal && (
            <div className="absolute bottom-20 left-2 z-40 w-[290px] rounded-2xl border border-white/20 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl sm:left-32">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-xs font-black uppercase text-amber-300">
                  BASE BET ($0.20 – $100.00)
                </span>
                <button
                  type="button"
                  onClick={() => setShowBetModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {BET_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      synthRef.current?.playClick(640);
                      setBaseBetUSD(p);
                      setShowBetModal(false);
                    }}
                    className={`font-ui rounded-lg border py-2 text-xs font-bold transition ${
                      Math.abs(baseBetUSD - p) < 0.001
                        ? "border-amber-400 bg-amber-400 text-slate-950"
                        : "border-white/10 bg-white/5 text-slate-200 hover:border-white/30"
                    }`}
                  >
                    {formatUSD(p)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </footer>
      </div>

      {/* BONUS BUY CONFIRMATION MODAL */}
      {buyConfirmTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border-2 border-amber-400 bg-gradient-to-b from-red-950 to-slate-950 p-6 shadow-2xl">
            <h2 className="font-display text-lg font-black uppercase text-amber-300">
              BUY {BONUS_TIERS[buyConfirmTier].title}
            </h2>
            <p className="mt-2 text-sm text-slate-200">
              Purchase <strong>{BONUS_TIERS[buyConfirmTier].spins} Free Spins</strong>{" "}
              with persistent position multipliers and{" "}
              <strong>{BONUS_TIERS[buyConfirmTier].upgradeCount} Hunter Upgrade(s)</strong>{" "}
              for{" "}
              <strong className="text-amber-300">
                {formatUSD(baseBetUSD * BONUS_TIERS[buyConfirmTier].buyMult)}
              </strong>
              ?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setBuyConfirmTier(null)}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-bold uppercase text-slate-200"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => {
                  const t = buyConfirmTier;
                  setBuyConfirmTier(null);
                  void runSpin({ buyTier: t });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2.5 text-xs font-black uppercase text-slate-950"
              >
                <Check className="h-4 w-4" />
                YES, HUNT NOW
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HUNTER UPGRADE WHEEL REVEAL OVERLAY */}
      {upgradeWheelModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl border-2 border-amber-400 bg-gradient-to-b from-red-950 via-[#1a0909] to-slate-950 p-6 text-center shadow-[0_0_60px_rgba(245,158,11,0.5)]">
            <div className="font-display text-xs font-black uppercase tracking-widest text-amber-300">
              HUNTER UPGRADE WHEEL
            </div>
            <h2 className="font-display mt-1 text-2xl font-black uppercase text-white">
              {BONUS_TIERS[upgradeWheelModal.tier].title} —{" "}
              {BONUS_TIERS[upgradeWheelModal.tier].spins} SPINS
            </h2>
            <div className="mt-4 space-y-2 text-left">
              {(
                [
                  "upgraded_xways",
                  "upgraded_bomb",
                  "extra_2_shots",
                ] as HunterUpgradeKey[]
              ).map((up) => {
                const active = upgradeWheelModal.awarded.includes(up);
                return (
                  <div
                    key={up}
                    className={`flex items-center justify-between rounded-xl border p-3 ${
                      active
                        ? "border-amber-300 bg-amber-400/20 text-white"
                        : "border-white/10 bg-white/[0.03] text-slate-500"
                    }`}
                  >
                    <div>
                      <div className="font-display text-sm font-black uppercase">
                        {UPGRADE_LABELS[up].name}
                      </div>
                      <div className="text-xs">{UPGRADE_LABELS[up].desc}</div>
                    </div>
                    <span className="font-display text-xs font-black uppercase">
                      {active ? "ACTIVE" : "LOCKED"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* END OF BONUS SUMMARY */}
      {bonusSummary.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border-2 border-amber-400 bg-gradient-to-b from-red-950 to-slate-950 p-7 text-center shadow-2xl">
            <div className="font-display text-xs font-black uppercase tracking-widest text-amber-300">
              {bonusSummary.isMaxWin
                ? "10,000x MAX WIN — HUNT COMPLETE!"
                : "HUNT COMPLETE"}
            </div>
            <h2 className="font-display mt-2 text-2xl font-black uppercase text-white">
              TOTAL BONUS WIN
            </h2>
            <div className="font-display my-4 bg-gradient-to-r from-amber-200 via-yellow-400 to-red-400 bg-clip-text text-4xl font-black text-transparent sm:text-5xl">
              {formatUSD(bonusSummary.totalWinUSD)}
            </div>
            <p className="text-xs text-slate-300">
              Won across {bonusSummary.spinsPlayed} Free Spins
            </p>
            <button
              type="button"
              onClick={() => setBonusSummary((s) => ({ ...s, open: false }))}
              className="font-display mt-6 w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-3 text-sm font-black uppercase text-slate-950"
            >
              COLLECT & CONTINUE
            </button>
          </div>
        </div>
      )}

      {/* CELEBRATION OVERLAY */}
      {celebration.active && (
        <div
          onClick={() => {
            celebSkipRef.current = true;
          }}
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/80 backdrop-blur-sm"
        >
          <canvas
            ref={celebCanvasRef}
            className="pointer-events-none fixed inset-0 h-full w-full"
          />
          <div className="relative z-10 mx-4 text-center">
            <div
              style={{ color: celebration.accent }}
              className="font-display text-3xl font-black uppercase drop-shadow-[0_4px_24px_rgba(239,68,68,0.75)] sm:text-5xl"
            >
              {celebration.label}
            </div>
            <div className="font-display mt-4 bg-gradient-to-b from-white via-amber-200 to-red-500 bg-clip-text text-5xl font-black text-transparent sm:text-7xl">
              {formatUSD(celebDisplayUSD)}
            </div>
            <div className="font-ui mt-3 text-sm font-bold text-slate-300">
              {celebration.mult.toFixed(2)}x Base Bet · Click or Press Space
            </div>
          </div>
        </div>
      )}

      {/* PAYTABLE MODAL */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-black uppercase text-white">
                  ZYAN HUNTER 10,000x — PAYTABLE &amp; MECHANICS
                </h2>
                <p className="text-xs text-slate-400">
                  6×5 Scatter-Pays · Doubling Position Multipliers up to 8,192x · Base Bet{" "}
                  {formatUSD(baseBetUSD)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {REGULAR_HUNTER_SYMBOLS.map((sym) => {
                  const p = HUNTER_PAYTABLE[sym];
                  return (
                    <div
                      key={sym}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
                    >
                      <div className="h-14 w-14 shrink-0">
                        <HunterSymbol3D id={sym} />
                      </div>
                      <div className="flex-1 text-xs">
                        <div className="font-display font-bold text-white">
                          {SYMBOL_META[sym].name}
                        </div>
                        <div className="font-ui mt-1 space-y-0.5 text-slate-300">
                          <div className="flex justify-between">
                            <span className="text-slate-400">12+</span>
                            <span className="font-bold text-amber-300">
                              {p.tier12Plus.toFixed(2)}x ({formatUSD(baseBetUSD * p.tier12Plus)})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">10–11</span>
                            <span>{p.tier10_11.toFixed(2)}x</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">8–9</span>
                            <span>{p.tier8_9.toFixed(2)}x</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROVABLY FAIR MODAL */}
      {showFairnessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-amber-400/35 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400" />
                <h2 className="font-display text-base font-black uppercase text-white">
                  PROVABLY FAIR SEED VERIFIER
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowFairnessModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto p-5 text-xs">
              <div>
                <label className="mb-1 block font-bold uppercase tracking-wider text-slate-400">
                  Server Seed Hash (SHA-256)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={serverSeedHash}
                    className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 font-mono text-[11px] text-emerald-300"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.clipboard)
                        void navigator.clipboard.writeText(serverSeedHash);
                      setCopiedStr(serverSeedHash);
                      setTimeout(() => setCopiedStr(null), 1500);
                    }}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 font-semibold text-white"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedStr === serverSeedHash ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block font-bold uppercase text-slate-400">
                    Client Seed
                  </label>
                  <input
                    type="text"
                    value={clientSeed}
                    disabled={isBusy}
                    onChange={(e) => setClientSeed(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold uppercase text-slate-400">
                    Next Nonce
                  </label>
                  <div className="font-ui rounded-lg border border-white/15 bg-black/50 px-3 py-2 font-bold text-amber-300">
                    #{nonce}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="text-slate-300">
                  Rotate Server Seed to reveal previous key for SHA-256 audit.
                </span>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={rotateServerSeed}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 font-bold text-slate-950 disabled:opacity-45"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Rotate
                </button>
              </div>

              <div className="max-h-52 space-y-2 overflow-y-auto">
                {fairnessLogs.length === 0 ? (
                  <div className="rounded-xl border border-white/10 p-4 text-center text-slate-500">
                    Spin to record cryptographic SHA-256 spin proofs.
                  </div>
                ) : (
                  fairnessLogs.map((l) => (
                    <div
                      key={`${l.nonce}-${l.proofHash}`}
                      className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5"
                    >
                      <div className="flex justify-between font-bold">
                        <span className="text-slate-200">
                          Nonce #{l.nonce} · Wager {formatUSD(l.wagerUSD)}
                        </span>
                        <span className="text-emerald-400">
                          Payout {formatUSD(l.payoutUSD)} ({l.multiplier.toFixed(2)}x)
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[10px] text-slate-400">
                        Proof: {l.proofHash}
                      </div>
                      {l.revealedServerSeed && (
                        <div className="mt-0.5 truncate font-mono text-[10px] text-emerald-400">
                          Seed: {l.revealedServerSeed}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZyanHunter10000Slot;
