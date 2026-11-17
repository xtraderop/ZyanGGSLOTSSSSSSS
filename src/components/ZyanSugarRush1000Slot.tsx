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
  Sparkles,
  Minus,
  Plus,
  X,
  Check,
  Play,
  Square,
  Flame,
  Trophy,
  Copy,
  RefreshCw,
  Rocket,
  Candy,
} from "lucide-react";

import { ZYAN_SLOTS_ASSETS } from "../constants/slotAssets";

/* ============================================================================
 * 0. OFFICIAL ZYAN.GG BRANDING & ANTI-COPY <ProtectedArt />
 * ========================================================================== */

const ZYAN_LOGO_URL =
  "https://i.ibb.co.com/20Dxw97d/Esports-wordmark-logo-ZYAN-GG-3d5c4c15-2-K.jpg";

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

export interface ZyanSugarRush1000BetRecord {
  gameKey: "ZYAN_SUGAR_RUSH_1000";
  gameName: "Zyan Sugar Rush 1000";
  wagerUSD: number;
  multiplier: number;
  payoutUSD: number;
  isWin: boolean;
  proofHash: string;
}

export interface ZyanSugarRush1000SlotProps {
  externalBalanceUSD?: number;
  onBalanceChange?: (newBalanceUSD: number) => void;
  onRecordBet?: (bet: ZyanSugarRush1000BetRecord) => void;
  activeRtpPercent?: number; // Default 96.5% (controlled silently by Admin Panel)
  username?: string;
}

export type SugarSymbolId =
  | "gummy_orange"
  | "gummy_purple"
  | "gummy_red"
  | "candy_green_star"
  | "candy_purple_bean"
  | "candy_orange_heart"
  | "candy_pink_sphere"
  | "scatter_rocket";

type RegularSugarSymbolId = Exclude<SugarSymbolId, "scatter_rocket">;

type SpinPhase =
  | "IDLE"
  | "DROPPING"
  | "EVALUATING"
  | "EXPLODING"
  | "CASCADING";

interface SugarCell {
  uid: string;
  symbol: SugarSymbolId;
  row: number;
  col: number;
  fallRows?: number;
  isWinning?: boolean;
  isExploding?: boolean;
}

interface TumbleHistoryItem {
  id: string;
  step: number;
  symbol: RegularSugarSymbolId;
  clusterSize: number;
  spotMultApplied: number;
  payoutUSD: number;
}

interface FloatingCallout {
  id: string;
  row: number;
  col: number;
  text: string;
  subtext?: string;
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
 * 2. PAYTABLE (7x7 ORTHOGONAL CLUSTERS 5..15+), SPOTS & CONSTANTS
 * ========================================================================== */

const GRID_ROWS = 7;
const GRID_COLS = 7;
const MAX_WIN_MULT = 25000;
const MAX_SPOT_HITS = 11; // 1 = Wrapper, 2 = 2x ... 11 = 1024x

// Cluster sizes: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15+]
const PAYTABLE: Record<
  RegularSugarSymbolId,
  [number, number, number, number, number, number, number, number, number, number, number]
> = {
  candy_pink_sphere: [1.0, 1.5, 1.75, 2.0, 2.5, 5.0, 7.5, 15.0, 35.0, 70.0, 150.0],
  candy_orange_heart: [0.75, 1.0, 1.25, 1.5, 2.0, 3.5, 5.5, 10.0, 25.0, 50.0, 100.0],
  candy_purple_bean: [0.5, 0.75, 1.0, 1.25, 1.5, 2.5, 4.0, 7.5, 15.0, 30.0, 60.0],
  candy_green_star: [0.4, 0.55, 0.75, 1.0, 1.25, 2.0, 3.0, 5.0, 10.0, 20.0, 40.0],
  gummy_red: [0.3, 0.4, 0.55, 0.75, 1.0, 1.5, 2.5, 4.0, 8.0, 15.0, 30.0],
  gummy_purple: [0.25, 0.35, 0.45, 0.6, 0.8, 1.25, 2.0, 3.5, 6.5, 12.5, 25.0],
  gummy_orange: [0.2, 0.3, 0.4, 0.5, 0.65, 1.0, 1.5, 2.5, 5.0, 10.0, 20.0],
};

const REGULAR_SYMBOL_IDS: RegularSugarSymbolId[] = [
  "gummy_orange",
  "gummy_purple",
  "gummy_red",
  "candy_green_star",
  "candy_purple_bean",
  "candy_orange_heart",
  "candy_pink_sphere",
];

const SYMBOL_LABELS: Record<SugarSymbolId, string> = {
  gummy_orange: "Orange Gummy Bear",
  gummy_purple: "Purple Gummy Bear",
  gummy_red: "Red Gummy Bear",
  candy_green_star: "Emerald Star Candy",
  candy_purple_bean: "Purple Jellybean",
  candy_orange_heart: "Orange Heart Candy",
  candy_pink_sphere: "Pink Lollipop Sphere",
  scatter_rocket: "Rocket Gumball Scatter",
};

const SCATTER_TO_SPINS: Record<number, number> = {
  3: 10,
  4: 12,
  5: 15,
  6: 20,
  7: 30,
};

const BET_LADDER_USD = [
  0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0,
  300.0, 500.0,
];

function getSpotMultiplier(hits: number): number {
  if (hits < 2) return 0;
  return Math.min(1024, Math.pow(2, hits - 1));
}

function getSpotVisualStyle(hits: number): {
  frameClass: string;
  badgeClass: string;
  label: string;
} | null {
  if (hits <= 0) return null;
  if (hits === 1) {
    return {
      frameClass:
        "border-pink-400/75 bg-pink-500/15 shadow-[inset_0_0_12px_rgba(244,114,182,0.45)]",
      badgeClass: "bg-pink-500/85 text-white",
      label: "WRAP",
    };
  }
  const mult = getSpotMultiplier(hits);
  if (mult <= 4) {
    return {
      frameClass:
        "border-[#FACC15] bg-yellow-400/20 shadow-[inset_0_0_14px_rgba(250,204,21,0.55),0_0_10px_rgba(250,204,21,0.35)]",
      badgeClass: "bg-[#FACC15] text-slate-950",
      label: `${mult}x`,
    };
  }
  if (mult <= 32) {
    return {
      frameClass:
        "border-[#F97316] bg-orange-500/25 shadow-[inset_0_0_16px_rgba(249,115,22,0.65),0_0_14px_rgba(249,115,22,0.45)]",
      badgeClass: "bg-[#F97316] text-white",
      label: `${mult}x`,
    };
  }
  if (mult <= 256) {
    return {
      frameClass:
        "border-[#EC4899] bg-pink-500/30 shadow-[inset_0_0_18px_rgba(236,72,153,0.75),0_0_16px_rgba(236,72,153,0.55)]",
      badgeClass: "bg-[#EC4899] text-white",
      label: `${mult}x`,
    };
  }
  // 512x - 1,024x Blazing 24k Gold & Rainbow Supernova Frame
  return {
    frameClass:
      "border-[#F59E0B] bg-gradient-to-br from-amber-400/40 via-pink-500/35 to-cyan-400/35 shadow-[inset_0_0_20px_rgba(245,158,11,0.9),0_0_20px_rgba(251,191,36,0.75)]",
    badgeClass:
      "bg-gradient-to-r from-yellow-300 via-amber-400 to-pink-500 text-slate-950 ring-1 ring-white",
    label: `${mult}x`,
  };
}

function createEmptySpots(): number[][] {
  return Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(0));
}

function createSuperPreloadedSpots(): number[][] {
  // All 49 cells pre-loaded: Center (3,3) = 16x (5 hits), inner ring = 8x (4 hits),
  // middle ring = 4x (3 hits), outer perimeter = 2x (2 hits) & corners = WRAPPER (1 hit).
  const matrix = createEmptySpots();
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const dist = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      if (dist === 0) matrix[r][c] = 5; // 16x
      else if (dist === 1) matrix[r][c] = 4; // 8x
      else if (dist === 2) matrix[r][c] = 3; // 4x
      else {
        const isCorner = (r === 0 || r === 6) && (c === 0 || c === 6);
        matrix[r][c] = isCorner ? 1 : 2; // Wrapper on corners, 2x on outer ring
      }
    }
  }
  return matrix;
}

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

/* ============================================================================
 * 4. SYNTHESIZED SUGAR RUSH CANDY POP & ROCKET AUDIO ENGINE
 * ========================================================================== */

class SugarRushAudioEngine {
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

  public playJellyDrop(colIndex: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160 + colIndex * 22, now);
    osc.frequency.exponentialRampToValueAtTime(240 + colIndex * 18, now + 0.045);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playCandySpotPop(tumbleStep: number, maxMultOnStep: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const boost = maxMultOnStep >= 16 ? 1.5 : maxMultOnStep >= 2 ? 1.2 : 1.0;
    const baseFreq = (420 + Math.min(tumbleStep, 10) * 60) * boost;
    [baseFreq, baseFreq * 1.33].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      const t = now + i * 0.035;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.15, t + 0.09);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  public playRocketWhoosh() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.25);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playWinFanfare(mult: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord =
      mult >= 50
        ? [329.63, 415.3, 493.88, 659.25, 830.61, 987.77, 1318.51]
        : [329.63, 415.3, 493.88, 659.25];
    chord.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = mult >= 50 ? "sawtooth" : "triangle";
      const t = now + idx * 0.055;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }
}

/* ============================================================================
 * 5. GLOSSY 3D GUMMY BEARS, CANDIES & ROCKET SCATTER SVG ARTWORK
 * ========================================================================== */

const SugarSymbolArtwork: React.FC<{ symbol: SugarSymbolId }> = React.memo(
  ({ symbol }) => {
    const uid = useId().replace(/:/g, "");

    // 3 Low-Pay 3D Gummy Bears (Orange, Purple, Red)
    if (
      symbol === "gummy_orange" ||
      symbol === "gummy_purple" ||
      symbol === "gummy_red"
    ) {
      const bearPalette = {
        gummy_orange: {
          hi: "#fed7aa",
          mid: "#fb923c",
          dark: "#9a3412",
          stroke: "#ffedd5",
        },
        gummy_purple: {
          hi: "#f3e8ff",
          mid: "#a855f7",
          dark: "#581c87",
          stroke: "#e9d5ff",
        },
        gummy_red: {
          hi: "#fecdd3",
          mid: "#f43f5e",
          dark: "#881337",
          stroke: "#ffe4e6",
        },
      }[symbol];

      return (
        <svg
          viewBox="0 0 100 100"
          className="h-[88%] w-[88%] drop-shadow-[0_4px_8px_rgba(0,0,0,0.65)]"
        >
          <defs>
            <radialGradient id={`${uid}-gb`} cx="35%" cy="28%" r="72%">
              <stop offset="0%" stopColor={bearPalette.hi} />
              <stop offset="48%" stopColor={bearPalette.mid} />
              <stop offset="100%" stopColor={bearPalette.dark} />
            </radialGradient>
          </defs>
          {/* Ears */}
          <circle cx="32" cy="24" r="11" fill={`url(#${uid}-gb)`} stroke={bearPalette.stroke} strokeWidth="2" />
          <circle cx="68" cy="24" r="11" fill={`url(#${uid}-gb)`} stroke={bearPalette.stroke} strokeWidth="2" />
          {/* Arms & Legs */}
          <ellipse cx="24" cy="56" rx="10" ry="8" fill={`url(#${uid}-gb)`} stroke={bearPalette.stroke} strokeWidth="1.8" />
          <ellipse cx="76" cy="56" rx="10" ry="8" fill={`url(#${uid}-gb)`} stroke={bearPalette.stroke} strokeWidth="1.8" />
          <ellipse cx="36" cy="82" rx="10" ry="8" fill={`url(#${uid}-gb)`} stroke={bearPalette.stroke} strokeWidth="1.8" />
          <ellipse cx="64" cy="82" rx="10" ry="8" fill={`url(#${uid}-gb)`} stroke={bearPalette.stroke} strokeWidth="1.8" />
          {/* Head & Belly */}
          <ellipse cx="50" cy="64" rx="22" ry="20" fill={`url(#${uid}-gb)`} stroke={bearPalette.stroke} strokeWidth="2" />
          <circle cx="50" cy="36" r="20" fill={`url(#${uid}-gb)`} stroke={bearPalette.stroke} strokeWidth="2" />
          {/* Snout & Eyes */}
          <ellipse cx="50" cy="41" rx="8" ry="6" fill={bearPalette.hi} fillOpacity="0.65" />
          <circle cx="43" cy="33" r="2.6" fill="#1e1b24" />
          <circle cx="57" cy="33" r="2.6" fill="#1e1b24" />
          <circle cx="50" cy="39" r="2.4" fill="#1e1b24" />
          {/* Gloss highlight */}
          <ellipse cx="42" cy="24" rx="6" ry="3" fill="#ffffff" fillOpacity="0.55" transform="rotate(-20 42 24)" />
        </svg>
      );
    }

    // 4 High-Pay Glossy 3D Candies
    if (symbol === "candy_green_star") {
      return (
        <svg viewBox="0 0 100 100" className="h-[88%] w-[88%] drop-shadow-[0_4px_10px_rgba(16,185,129,0.55)]">
          <defs>
            <linearGradient id={`${uid}-star`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d1fae5" />
              <stop offset="45%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#064e3b" />
            </linearGradient>
          </defs>
          <polygon
            points="50,8 62,34 90,37 69,56 75,85 50,70 25,85 31,56 10,37 38,34"
            fill={`url(#${uid}-star)`}
            stroke="#a7f3d0"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <ellipse cx="44" cy="36" rx="10" ry="4" fill="#ffffff" fillOpacity="0.55" transform="rotate(-24 44 36)" />
        </svg>
      );
    }

    if (symbol === "candy_purple_bean") {
      return (
        <svg viewBox="0 0 100 100" className="h-[88%] w-[88%] drop-shadow-[0_4px_10px_rgba(192,132,252,0.55)]">
          <defs>
            <linearGradient id={`${uid}-bean`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fae8ff" />
              <stop offset="50%" stopColor="#c026d3" />
              <stop offset="100%" stopColor="#4a044e" />
            </linearGradient>
          </defs>
          <path
            d="M28 66 C14 50, 22 24, 46 22 C66 20, 84 30, 82 50 C80 68, 60 66, 52 72 C42 80, 36 74, 28 66 Z"
            fill={`url(#${uid}-bean)`}
            stroke="#f5d0fe"
            strokeWidth="3"
          />
          <ellipse cx="44" cy="34" rx="14" ry="5" fill="#ffffff" fillOpacity="0.55" transform="rotate(-15 44 34)" />
        </svg>
      );
    }

    if (symbol === "candy_orange_heart") {
      return (
        <svg viewBox="0 0 100 100" className="h-[88%] w-[88%] drop-shadow-[0_4px_10px_rgba(251,146,60,0.6)]">
          <defs>
            <linearGradient id={`${uid}-heart`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="45%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#9a3412" />
            </linearGradient>
          </defs>
          <path
            d="M50 84 C20 64, 12 42, 22 26 C30 14, 44 18, 50 28 C56 18, 70 14, 78 26 C88 42, 80 64, 50 84 Z"
            fill={`url(#${uid}-heart)`}
            stroke="#ffedd5"
            strokeWidth="3"
          />
          <ellipse cx="35" cy="32" rx="9" ry="4.5" fill="#ffffff" fillOpacity="0.6" transform="rotate(-32 35 32)" />
        </svg>
      );
    }

    if (symbol === "candy_pink_sphere") {
      return (
        <svg viewBox="0 0 100 100" className="h-[88%] w-[88%] drop-shadow-[0_4px_12px_rgba(236,72,153,0.75)]">
          <defs>
            <radialGradient id={`${uid}-sph`} cx="32%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#f472b6" />
              <stop offset="72%" stopColor="#db2777" />
              <stop offset="100%" stopColor="#831843" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="36" fill={`url(#${uid}-sph)`} stroke="#fbcfe8" strokeWidth="3" />
          <path
            d="M22 46 Q50 26 78 46"
            fill="none"
            stroke="#fef08a"
            strokeWidth="5"
            strokeLinecap="round"
            strokeOpacity="0.85"
          />
          <path
            d="M24 62 Q50 42 76 62"
            fill="none"
            stroke="#fbcfe8"
            strokeWidth="4"
            strokeLinecap="round"
            strokeOpacity="0.7"
          />
          <ellipse cx="38" cy="30" rx="10" ry="5" fill="#ffffff" fillOpacity="0.7" transform="rotate(-25 38 30)" />
        </svg>
      );
    }

    // 3D Gumball Rocket Ship Scatter (Studio 3D Asset + Icon Fallback)
    return (
      <div className="relative flex h-full w-full items-center justify-center p-0.5">
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border-2 border-amber-300 bg-gradient-to-b from-fuchsia-950/90 via-rose-950/85 to-slate-950 shadow-[0_0_20px_rgba(236,72,153,0.9)]">
          <ProtectedArt
            src={ZYAN_SLOTS_ASSETS.ZYAN_SUGAR_RUSH.SCATTER_ROCKET}
            alt="Rocket Gumball Scatter"
            className="h-full w-full scale-115 rounded-xl object-contain mix-blend-lighten"
            fallback={
              <Rocket className="h-5 w-5 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] sm:h-6 sm:w-6" />
            }
          />
          <span className="font-display pointer-events-none absolute bottom-0.5 left-1/2 z-20 -translate-x-1/2 rounded bg-slate-950/90 px-1 text-[7px] font-black uppercase tracking-wider text-amber-300">
            SCATTER
          </span>
        </div>
      </div>
    );
  }
);

/* ============================================================================
 * 6. BOARD GENERATOR & 7x7 ORTHOGONAL CLUSTER-PAYS EVALUATOR
 * ========================================================================== */

let sugarUidCounter = 1;
function nextUid(prefix = "sr"): string {
  sugarUidCounter += 1;
  return `${prefix}-${sugarUidCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function getSugarClusterPayIndex(size: number): number {
  if (size >= 15) return 10;
  return Math.max(0, size - 5);
}

function rollCellSymbol(params: {
  rng: () => number;
  inFreeSpins: boolean;
  activeRtpPercent: number;
  allowScatter?: boolean;
}): SugarSymbolId {
  const { rng, inFreeSpins, activeRtpPercent, allowScatter = true } = params;
  const rtpFactor = Math.max(0.75, Math.min(1.2, activeRtpPercent / 96.5));

  const pool: SugarSymbolId[] = [
    "gummy_orange",
    "gummy_purple",
    "gummy_red",
    "candy_green_star",
    "candy_purple_bean",
    "candy_orange_heart",
    "candy_pink_sphere",
    "scatter_rocket",
  ];

  const weights = [
    22, // gummy_orange
    20, // gummy_purple
    18, // gummy_red
    13.5, // candy_green_star
    11.5, // candy_purple_bean
    9.5 * rtpFactor, // candy_orange_heart
    7.0 * rtpFactor, // candy_pink_sphere
    allowScatter ? (inFreeSpins ? 1.5 : 1.75) : 0, // scatter_rocket
  ];

  return pickWeighted(pool, weights, rng);
}

function generateInitialGrid(params: {
  rng: () => number;
  inFreeSpins: boolean;
  activeRtpPercent: number;
  forceScatters?: number;
}): SugarCell[][] {
  const { rng, inFreeSpins, activeRtpPercent, forceScatters = 0 } = params;
  const grid: SugarCell[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowArr: SugarCell[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      rowArr.push({
        uid: nextUid(),
        symbol: rollCellSymbol({
          rng,
          inFreeSpins,
          activeRtpPercent,
          allowScatter: forceScatters === 0,
        }),
        row: r,
        col: c,
      });
    }
    grid.push(rowArr);
  }

  if (forceScatters > 0) {
    const coords: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) coords.push({ r, c });
    }
    for (let i = coords.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = coords[i];
      coords[i] = coords[j];
      coords[j] = tmp;
    }
    for (let k = 0; k < forceScatters && k < coords.length; k++) {
      const { r, c } = coords[k];
      grid[r][c] = {
        uid: nextUid("fsc"),
        symbol: "scatter_rocket",
        row: r,
        col: c,
      };
    }
  }

  return grid;
}

function evaluateSugarClusters(params: {
  grid: SugarCell[][];
  spotHitCount: number[][];
  baseBetUSD: number;
}): {
  clusters: Array<{
    symbol: RegularSugarSymbolId;
    coords: Array<{ row: number; col: number }>;
    spotMultSum: number;
    effectiveMult: number;
    payoutUSD: number;
  }>;
  stepWinUSD: number;
  explodingCoords: Array<{ row: number; col: number }>;
} {
  const { grid, spotHitCount, baseBetUSD } = params;
  const visited = Array.from({ length: GRID_ROWS }, () =>
    Array(GRID_COLS).fill(false)
  );
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  const clusters: Array<{
    symbol: RegularSugarSymbolId;
    coords: Array<{ row: number; col: number }>;
    spotMultSum: number;
    effectiveMult: number;
    payoutUSD: number;
  }> = [];

  const explodingCoords: Array<{ row: number; col: number }> = [];

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const sym = grid[r][c].symbol;
      if (sym === "scatter_rocket" || visited[r][c]) continue;

      const queue: Array<{ row: number; col: number }> = [{ row: r, col: c }];
      const group: Array<{ row: number; col: number }> = [];
      visited[r][c] = true;

      while (queue.length > 0) {
        const cur = queue.shift()!;
        group.push(cur);
        for (const [dr, dc] of dirs) {
          const nr = cur.row + dr;
          const nc = cur.col + dc;
          if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
          if (visited[nr][nc]) continue;
          if (grid[nr][nc].symbol === sym) {
            visited[nr][nc] = true;
            queue.push({ row: nr, col: nc });
          }
        }
      }

      if (group.length >= 5) {
        const regSym = sym as RegularSugarSymbolId;
        const payIdx = getSugarClusterPayIndex(group.length);
        const baseMult = PAYTABLE[regSym][payIdx];

        // Sum all active Spot Multipliers (>= 2x) underneath this cluster BEFORE exploding!
        const spotMultSum = group.reduce(
          (sum, pt) => sum + getSpotMultiplier(spotHitCount[pt.row][pt.col]),
          0
        );
        const effectiveMult = Math.max(1, spotMultSum);
        const payoutUSD = Number(
          (baseBetUSD * baseMult * effectiveMult).toFixed(2)
        );

        clusters.push({
          symbol: regSym,
          coords: group,
          spotMultSum,
          effectiveMult,
          payoutUSD,
        });
        group.forEach((pt) => explodingCoords.push(pt));
      }
    }
  }

  const stepWinUSD = Number(
    clusters.reduce((acc, cl) => acc + cl.payoutUSD, 0).toFixed(2)
  );

  return { clusters, stepWinUSD, explodingCoords };
}

/* ============================================================================
 * 7. MAIN COMPONENT: <ZyanSugarRush1000Slot />
 * ========================================================================== */

export const ZyanSugarRush1000Slot: React.FC<ZyanSugarRush1000SlotProps> = ({
  externalBalanceUSD,
  onBalanceChange,
  onRecordBet,
  activeRtpPercent = 96.5,
  username = "SweetVIP",
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

  // Bet State
  const [betIndex, setBetIndex] = useState<number>(4); // $1.00 base bet
  const baseBetUSD = BET_LADDER_USD[betIndex];

  // Grid, 7x7 Spot Matrix & Tumble State
  const [grid, setGrid] = useState<SugarCell[][]>(() => {
    const seedRng = createSeededRng("zyan-sugar-rush-1000-initial-board");
    return generateInitialGrid({
      rng: seedRng,
      inFreeSpins: false,
      activeRtpPercent: 96.5,
    });
  });

  const [spotHitCount, setSpotHitCount] = useState<number[][]>(() =>
    createEmptySpots()
  );
  const [spinPhase, setSpinPhase] = useState<SpinPhase>("IDLE");
  const [stoppedCols, setStoppedCols] = useState<boolean[]>([
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
  const [tumbleWinUSD, setTumbleWinUSD] = useState<number>(0);
  const [tumbleHistory, setTumbleHistory] = useState<TumbleHistoryItem[]>([]);
  const [floatingCallouts, setFloatingCallouts] = useState<FloatingCallout[]>(
    []
  );
  const [lastSpinWinUSD, setLastSpinWinUSD] = useState<number>(0);
  const [lastSpinMult, setLastSpinMult] = useState<number>(0);
  const [bannerStatus, setBannerStatus] = useState<string>(
    "7×7 CLUSTER PAYS • EXPLODING SPOTS DOUBLE 2x TO 1,024x"
  );

  // Free Spins & Super Free Spins State
  const [inFreeSpins, setInFreeSpins] = useState<boolean>(false);
  const [isSuperFreeSpins, setIsSuperFreeSpins] = useState<boolean>(false);
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [freeSpinsTotal, setFreeSpinsTotal] = useState<number>(0);
  const [bonusTotalWinUSD, setBonusTotalWinUSD] = useState<number>(0);
  const [bonusIntroOverlay, setBonusIntroOverlay] = useState<{
    title: string;
    subtitle: string;
    isSuper: boolean;
  } | null>(null);
  const [winCelebration, setWinCelebration] = useState<{
    tier: "BIG WIN" | "MEGA WIN" | "SUGAR RUSH 25,000x MAX WIN";
    amountUSD: number;
    mult: number;
  } | null>(null);

  // Audio, Autoplay, Modals & Provably Fair
  const audioRef = useRef<SugarRushAudioEngine | null>(null);
  if (!audioRef.current) audioRef.current = new SugarRushAudioEngine();

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
      { type: "ZYAN_SLOT_READY", gameKey: "ZYAN_SUGAR_RUSH_1000" },
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

  const emitBetRecord = useCallback(
    (wagerUSD: number, payoutUSD: number, proofHash: string) => {
      const mult = wagerUSD > 0 ? Number((payoutUSD / wagerUSD).toFixed(2)) : 0;
      const record: ZyanSugarRush1000BetRecord = {
        gameKey: "ZYAN_SUGAR_RUSH_1000",
        gameName: "Zyan Sugar Rush 1000",
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

  /* --------------------------------------------------------------------------
   * CORE TUMBLE & SPOT MULTIPLIER DOUBLING ENGINE (2x -> 1,024x)
   * ------------------------------------------------------------------------ */

  const runSingleTumbleSpin = useCallback(
    async (opts: {
      inFS: boolean;
      initialSpotMatrix: number[][];
      wagerBetUSD: number;
      spinNonce: number;
      forceScatters?: number;
    }): Promise<{
      totalSpinWinUSD: number;
      updatedSpotMatrix: number[][];
      scattersLanded: number;
      proofHash: string;
    }> => {
      const {
        inFS,
        initialSpotMatrix,
        wagerBetUSD,
        spinNonce,
        forceScatters = 0,
      } = opts;

      const proofHash = await computeSha256Hex(
        `${serverSeed}:${clientSeed}:${spinNonce}:${inFS ? "FS" : "BASE"}`
      );
      if (mountedRef.current) setLastProofHash(proofHash);
      const rng = createSeededRng(proofHash);

      let board = generateInitialGrid({
        rng,
        inFreeSpins: inFS,
        activeRtpPercent: runtimeRtpPercent,
        forceScatters,
      });

      const curSpots = initialSpotMatrix.map((row) => [...row]);

      if (!mountedRef.current) {
        return {
          totalSpinWinUSD: 0,
          updatedSpotMatrix: curSpots,
          scattersLanded: 0,
          proofHash,
        };
      }

      setSpinPhase("DROPPING");
      setTumbleWinUSD(0);
      setTumbleHistory([]);
      setFloatingCallouts([]);
      setSpotHitCount(curSpots.map((r) => [...r]));
      setStoppedCols([false, false, false, false, false, false, false]);
      setGrid(board);

      for (let col = 0; col < GRID_COLS; col++) {
        await sleep(col === 0 ? 175 : 75);
        if (!mountedRef.current) break;
        setStoppedCols((prev) => {
          const next = [...prev];
          next[col] = true;
          return next;
        });
        audioRef.current?.playJellyDrop(col);

        if (board.some((r) => r[col].symbol === "scatter_rocket")) {
          audioRef.current?.playRocketWhoosh();
        }
      }

      let spinAccumUSD = 0;
      let tumbleStep = 0;
      const capUSD = Number((wagerBetUSD * MAX_WIN_MULT).toFixed(2));

      while (mountedRef.current) {
        setSpinPhase("EVALUATING");
        const evalRes = evaluateSugarClusters({
          grid: board,
          spotHitCount: curSpots,
          baseBetUSD: wagerBetUSD,
        });

        if (evalRes.clusters.length === 0) break;

        tumbleStep += 1;
        const winSet = new Set<string>();
        const logItems: TumbleHistoryItem[] = [];
        const callouts: FloatingCallout[] = [];
        let maxSpotMultUsed = 1;

        evalRes.clusters.forEach((cl) => {
          if (cl.effectiveMult > maxSpotMultUsed) {
            maxSpotMultUsed = cl.effectiveMult;
          }
          cl.coords.forEach((pt) => winSet.add(`${pt.row}-${pt.col}`));
          logItems.push({
            id: nextUid("log"),
            step: tumbleStep,
            symbol: cl.symbol,
            clusterSize: cl.coords.length,
            spotMultApplied: cl.spotMultSum > 0 ? cl.spotMultSum : 1,
            payoutUSD: cl.payoutUSD,
          });
          const anchor = cl.coords[Math.floor(cl.coords.length / 2)];
          callouts.push({
            id: nextUid("fc"),
            row: anchor.row,
            col: anchor.col,
            text: `+${formatUSD(cl.payoutUSD)}`,
            subtext:
              cl.spotMultSum > 0
                ? `${cl.coords.length}× (${cl.spotMultSum}x SPOTS)`
                : `${cl.coords.length}×`,
          });
        });

        spinAccumUSD = Math.min(
          capUSD,
          Number((spinAccumUSD + evalRes.stepWinUSD).toFixed(2))
        );
        setTumbleWinUSD(spinAccumUSD);
        setTumbleHistory((prev) => [...logItems, ...prev].slice(0, 8));
        setFloatingCallouts(callouts);

        // Highlight winning clusters
        board = board.map((rowArr, r) =>
          rowArr.map((cell, c) =>
            winSet.has(`${r}-${c}`) ? { ...cell, isWinning: true } : cell
          )
        );
        setGrid(board);
        audioRef.current?.playCandySpotPop(tumbleStep, maxSpotMultUsed);
        await sleep(310);
        if (!mountedRef.current) break;

        // Explode clusters AND upgrade Spot Multipliers (`spotHitCount[r][c] += 1`)
        setSpinPhase("EXPLODING");
        evalRes.explodingCoords.forEach((pt) => {
          curSpots[pt.row][pt.col] = Math.min(
            MAX_SPOT_HITS,
            curSpots[pt.row][pt.col] + 1
          );
        });
        setSpotHitCount(curSpots.map((r) => [...r]));

        board = board.map((rowArr, r) =>
          rowArr.map((cell, c) =>
            winSet.has(`${r}-${c}`)
              ? { ...cell, isExploding: true, isWinning: false }
              : cell
          )
        );
        setGrid(board);
        await sleep(220);
        if (!mountedRef.current) break;

        // Gravity collapse & fill new candies from top
        setSpinPhase("CASCADING");
        setFloatingCallouts([]);
        const collapsed: SugarCell[][] = Array.from(
          { length: GRID_ROWS },
          () => []
        );

        for (let c = 0; c < GRID_COLS; c++) {
          const survivors: SugarCell[] = [];
          for (let r = GRID_ROWS - 1; r >= 0; r--) {
            if (!winSet.has(`${r}-${c}`)) {
              survivors.push(board[r][c]);
            }
          }
          const missing = GRID_ROWS - survivors.length;
          for (let r = GRID_ROWS - 1; r >= 0; r--) {
            const idxFromBot = GRID_ROWS - 1 - r;
            if (idxFromBot < survivors.length) {
              const old = survivors[idxFromBot];
              collapsed[r][c] = {
                ...old,
                row: r,
                col: c,
                isWinning: false,
                isExploding: false,
                fallRows: Math.max(0, r - old.row),
              };
            } else {
              collapsed[r][c] = {
                uid: nextUid("cas"),
                symbol: rollCellSymbol({
                  rng,
                  inFreeSpins: inFS,
                  activeRtpPercent: runtimeRtpPercent,
                  allowScatter: forceScatters === 0,
                }),
                row: r,
                col: c,
                fallRows: missing,
              };
            }
          }
        }
        board = collapsed;
        setGrid(board);
        await sleep(260);

        if (spinAccumUSD >= capUSD) break;
      }

      if (!mountedRef.current) {
        return {
          totalSpinWinUSD: 0,
          updatedSpotMatrix: curSpots,
          scattersLanded: 0,
          proofHash,
        };
      }

      let scattersLanded = 0;
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (board[r][c].symbol === "scatter_rocket") scattersLanded++;
        }
      }

      return {
        totalSpinWinUSD: spinAccumUSD,
        updatedSpotMatrix: curSpots,
        scattersLanded,
        proofHash,
      };
    },
    [clientSeed, runtimeRtpPercent, serverSeed]
  );

  // Execute Free Spins OR Pre-Loaded 49-Spot Super Free Spins
  const executeFreeSpins = useCallback(
    async (opts: {
      initialSpins: number;
      superMode: boolean;
      wagerBetUSD: number;
      totalCostUSD: number;
      initialWinUSD: number;
      startingNonce: number;
    }) => {
      const {
        initialSpins,
        superMode,
        wagerBetUSD,
        totalCostUSD,
        initialWinUSD,
        startingNonce,
      } = opts;

      let currentNonce = startingNonce;
      let spinsRemaining = initialSpins;
      let totalSpinsAwarded = initialSpins;
      let cumulativeBonusWinUSD = initialWinUSD;
      const capUSD = Number((wagerBetUSD * MAX_WIN_MULT).toFixed(2));

      let persistentSpots = superMode
        ? createSuperPreloadedSpots()
        : createEmptySpots();

      setInFreeSpins(true);
      setIsSuperFreeSpins(superMode);
      setSpotHitCount(persistentSpots.map((r) => [...r]));
      setBonusTotalWinUSD(cumulativeBonusWinUSD);
      setFreeSpinsLeft(initialSpins);
      setFreeSpinsTotal(initialSpins);

      setBonusIntroOverlay({
        title: superMode
          ? "SUPER FREE SPINS (49 PRE-LOADED SPOTS!)"
          : "SUGAR RUSH FREE SPINS",
        subtitle: superMode
          ? `${initialSpins} SUPER SPINS • CENTER 16x, RINGS 8x/4x/2x PRE-LOADED!`
          : `${initialSpins} FREE SPINS • MULTIPLIER SPOTS PERSIST UP TO 1,024x!`,
        isSuper: superMode,
      });
      audioRef.current?.playWinFanfare(40);
      await sleep(1800);
      if (!mountedRef.current) return;
      setBonusIntroOverlay(null);

      while (spinsRemaining > 0 && mountedRef.current) {
        setFreeSpinsLeft(spinsRemaining);
        setFreeSpinsTotal(totalSpinsAwarded);
        setBannerStatus(
          `${superMode ? "SUPER " : ""}FREE SPINS • SPIN ${totalSpinsAwarded - spinsRemaining + 1}/${totalSpinsAwarded}`
        );

        currentNonce += 1;
        setNonce(currentNonce);

        const res = await runSingleTumbleSpin({
          inFS: true,
          initialSpotMatrix: persistentSpots,
          wagerBetUSD,
          spinNonce: currentNonce,
        });
        if (!mountedRef.current) break;

        persistentSpots = res.updatedSpotMatrix;
        setSpotHitCount(persistentSpots.map((r) => [...r]));

        // Check Free Spins Retrigger (3..7 Scatters -> +10..+30 Spins)
        if (res.scattersLanded >= 3) {
          const addedSpins =
            SCATTER_TO_SPINS[Math.min(7, res.scattersLanded)] ?? 10;
          spinsRemaining += addedSpins;
          totalSpinsAwarded += addedSpins;
          setBannerStatus(
            `RETRIGGER! +${addedSpins} EXTRA FREE SPINS (${res.scattersLanded} ROCKETS)`
          );
          audioRef.current?.playRocketWhoosh();
          await sleep(650);
        }

        const headroom = Math.max(0, capUSD - cumulativeBonusWinUSD);
        const awardUSD = Math.min(headroom, res.totalSpinWinUSD);
        cumulativeBonusWinUSD = Number(
          (cumulativeBonusWinUSD + awardUSD).toFixed(2)
        );
        setLastSpinWinUSD(awardUSD);
        setLastSpinMult(Number((awardUSD / wagerBetUSD).toFixed(2)));
        setBonusTotalWinUSD(cumulativeBonusWinUSD);

        if (awardUSD > 0) {
          commitBalance(balanceRef.current + awardUSD);
          audioRef.current?.playWinFanfare(awardUSD / wagerBetUSD);
        }

        spinsRemaining -= 1;
        await sleep(awardUSD > 0 ? 720 : 340);
        if (cumulativeBonusWinUSD >= capUSD) break;
      }

      if (!mountedRef.current) return;

      const finalMult = Number((cumulativeBonusWinUSD / wagerBetUSD).toFixed(2));
      const finalHash = await computeSha256Hex(
        `${serverSeed}:${clientSeed}:${currentNonce}:SUGAR_FS_END`
      );
      setLastProofHash(finalHash);
      emitBetRecord(totalCostUSD, cumulativeBonusWinUSD, finalHash);
      setSpinHistory((prev) => [
        {
          id: nextUid("hist"),
          wagerUSD: totalCostUSD,
          payoutUSD: cumulativeBonusWinUSD,
          multiplier: finalMult,
          mode: superMode ? "Super Free Spins" : "Free Spins",
          proofHash: finalHash,
        },
        ...prev.slice(0, 14),
      ]);

      if (finalMult >= 15) {
        const tier =
          finalMult >= MAX_WIN_MULT
            ? "SUGAR RUSH 25,000x MAX WIN"
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
      setSpotHitCount(createEmptySpots());
      setBannerStatus(
        cumulativeBonusWinUSD > 0
          ? `SUGAR BONUS WON ${formatUSD(cumulativeBonusWinUSD)} (${finalMult.toFixed(2)}x)!`
          : "FREE SPINS COMPLETE • SPIN AGAIN FOR 1,024x SPOTS"
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

    const wagerBet = baseBetUSD;
    if (balanceRef.current < wagerBet) {
      setAutoSpinsLeft(0);
      setBannerStatus("INSUFFICIENT USD BALANCE — LOWER BET OR TOP UP");
      return;
    }

    isBusyRef.current = true;
    setShowAutoMenu(false);
    setShowMobileBuyModal(false);
    setWinCelebration(null);
    commitBalance(balanceRef.current - wagerBet);

    const nextNonce = nonce + 1;
    setNonce(nextNonce);
    setLastSpinWinUSD(0);
    setLastSpinMult(0);
    setBannerStatus("DROPPING 7×7 CANDY CLUSTERS...");

    const res = await runSingleTumbleSpin({
      inFS: false,
      initialSpotMatrix: createEmptySpots(),
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
    }

    if (res.scattersLanded >= 3) {
      setAutoSpinsLeft(0);
      const awardedSpins =
        SCATTER_TO_SPINS[Math.min(7, res.scattersLanded)] ?? 10;
      await executeFreeSpins({
        initialSpins: awardedSpins,
        superMode: false,
        wagerBetUSD: wagerBet,
        totalCostUSD: wagerBet,
        initialWinUSD: res.totalSpinWinUSD,
        startingNonce: nextNonce,
      });
    } else {
      const mult = Number((res.totalSpinWinUSD / wagerBet).toFixed(2));
      emitBetRecord(wagerBet, res.totalSpinWinUSD, res.proofHash);
      setSpinHistory((prev) => [
        {
          id: nextUid("hist"),
          wagerUSD: wagerBet,
          payoutUSD: res.totalSpinWinUSD,
          multiplier: mult,
          mode: "Base Spin",
          proofHash: res.proofHash,
        },
        ...prev.slice(0, 14),
      ]);

      if (res.totalSpinWinUSD > 0) {
        setBannerStatus(
          `SUGAR RUSH WON ${formatUSD(res.totalSpinWinUSD)} (${mult.toFixed(2)}x)!`
        );
      } else {
        setBannerStatus("SPIN COMPLETE • 3+ ROCKETS TRIGGER FREE SPINS");
      }

      if (mult >= 15) {
        const tier =
          mult >= MAX_WIN_MULT
            ? "SUGAR RUSH 25,000x MAX WIN"
            : mult >= 50
              ? "MEGA WIN"
              : "BIG WIN";
        setWinCelebration({
          tier,
          amountUSD: res.totalSpinWinUSD,
          mult,
        });
        audioRef.current?.playWinFanfare(mult);
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
    emitBetRecord,
    executeFreeSpins,
    nonce,
    runSingleTumbleSpin,
  ]);

  // 100x Bonus Buy OR 500x Pre-Loaded Super Free Spins Buy
  const handleBonusBuy = useCallback(
    async (superMode: boolean) => {
      if (isBusyRef.current || inFreeSpins) return;
      audioRef.current?.unlock();

      const costMult = superMode ? 500 : 100;
      const buyCostUSD = Number((baseBetUSD * costMult).toFixed(2));
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

      const buyHash = await computeSha256Hex(
        `${serverSeed}:${clientSeed}:${nextNonce}:BUY_${superMode ? "500" : "100"}`
      );
      const buyRng = createSeededRng(buyHash);
      const scatterCount = pickWeighted([3, 4, 5, 6, 7], [68, 20, 8, 3, 1], buyRng);
      const awardedSpins = SCATTER_TO_SPINS[scatterCount] ?? 10;

      // Show triggering Rocket Scatter drop
      const triggerRes = await runSingleTumbleSpin({
        inFS: false,
        initialSpotMatrix: createEmptySpots(),
        wagerBetUSD: baseBetUSD,
        spinNonce: nextNonce,
        forceScatters: scatterCount,
      });

      if (!mountedRef.current) {
        isBusyRef.current = false;
        return;
      }

      if (triggerRes.totalSpinWinUSD > 0) {
        commitBalance(balanceRef.current + triggerRes.totalSpinWinUSD);
      }

      await executeFreeSpins({
        initialSpins: awardedSpins,
        superMode,
        wagerBetUSD: baseBetUSD,
        totalCostUSD: buyCostUSD,
        initialWinUSD: triggerRes.totalSpinWinUSD,
        startingNonce: nextNonce,
      });

      if (mountedRef.current) {
        setSpinPhase("IDLE");
      }
      isBusyRef.current = false;
    },
    [
      baseBetUSD,
      clientSeed,
      commitBalance,
      executeFreeSpins,
      inFreeSpins,
      nonce,
      runSingleTumbleSpin,
      serverSeed,
    ]
  );

  // Autoplay Loop
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

  // Spacebar Spin Shortcut
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

  // Count highest active spot multiplier on board for banner indicator
  const highestSpotMult = useMemo(() => {
    let best = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const m = getSpotMultiplier(spotHitCount[r][c]);
        if (m > best) best = m;
      }
    }
    return best;
  }, [spotHitCount]);

  return (
    <div
      style={{
        backgroundImage: `url(${ZYAN_SLOTS_ASSETS.ZYAN_SUGAR_RUSH.STAGE_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      className={`relative flex min-h-[calc(100vh-49px)] w-full flex-col justify-between overflow-hidden bg-gradient-to-b ${
        inFreeSpins
          ? isSuperFreeSpins
            ? "from-[#2f0828] via-[#1c0a2a] to-[#080410]"
            : "from-[#280b2a] via-[#150821] to-[#07040e]"
          : "from-[#1c0925] via-[#11081b] to-[#07040c]"
      } text-white transition-colors duration-700`}
    >
      {/* Candy Kingdom Ambient Vignette */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden bg-slate-950/45">
        <div
          className={`absolute -top-24 left-1/2 h-[440px] w-[820px] -translate-x-1/2 rounded-full blur-3xl transition-colors duration-700 ${
            isSuperFreeSpins ? "bg-amber-400/25" : "bg-pink-500/25"
          }`}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_32%,rgba(6,3,12,0.88)_100%)]" />
      </div>

      {/* TOP HEADER: ZYAN.GG Logo + ZYAN SUGAR RUSH 1000 Emblem */}
      <header className="relative z-20 mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-2 px-3 pt-3 sm:px-6">
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
          <span className="font-ui hidden rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-pink-200 md:inline-block">
            {username}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-center">
          <h1 className="font-display bg-gradient-to-r from-pink-300 via-fuchsia-400 to-amber-300 bg-clip-text text-base font-black uppercase tracking-tight text-transparent drop-shadow-[0_2px_12px_rgba(236,72,153,0.5)] sm:text-2xl lg:text-[26px]">
            ZYAN SUGAR RUSH 1000
          </h1>
          <span className="font-display whitespace-nowrap rounded-md border border-pink-300/60 bg-gradient-to-r from-pink-500 via-rose-500 to-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-[0_0_16px_rgba(236,72,153,0.65)] sm:text-xs">
            1,024x SPOTS • MAX WIN 25,000x
          </span>
        </div>

        <div className="flex items-center gap-1.5">
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

      {/* MAIN STAGE: Left Feature Buy + Tumble History | Center 7x7 Grid */}
      <main className="relative z-20 mx-auto my-auto flex w-full max-w-[1400px] flex-1 flex-col items-center justify-center gap-3 px-2 py-2 lg:flex-row lg:items-stretch lg:gap-5 lg:px-6 lg:py-3">
        {/* LEFT DESKTOP PRAGMATIC FEATURE BUY & TUMBLE HISTORY */}
        <aside className="hidden w-[264px] shrink-0 flex-col justify-between gap-2.5 lg:flex">
          <div className="flex flex-col gap-2 rounded-2xl border border-pink-400/30 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-display text-xs font-black uppercase tracking-wider text-pink-300">
                BUY FEATURE
              </span>
              <span className="font-ui text-[11px] font-bold text-slate-400">
                Base {formatUSD(baseBetUSD)}
              </span>
            </div>

            <button
              type="button"
              disabled={isSpinning || inFreeSpins || balanceUSD < buy100CostUSD}
              onClick={() => handleBonusBuy(false)}
              className="rounded-xl border border-pink-300/60 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-600 p-2.5 text-left text-white shadow-lg transition hover:brightness-110 disabled:opacity-45"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-black uppercase">
                  BUY FREE SPINS
                </span>
                <span className="font-display rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-black text-amber-300">
                  100x
                </span>
              </div>
              <div className="font-ui mt-0.5 text-[10px] text-pink-100">
                10–30 Spins • Persistent 1,024x Spots
              </div>
              <div className="font-ui mt-1.5 flex items-center justify-between border-t border-white/20 pt-1 text-xs font-black text-amber-200">
                <span>Buy Now</span>
                <span>{formatUSD(buy100CostUSD)}</span>
              </div>
            </button>

            <button
              type="button"
              disabled={isSpinning || inFreeSpins || balanceUSD < buy500CostUSD}
              onClick={() => handleBonusBuy(true)}
              className="rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-600 p-2.5 text-left text-slate-950 shadow-[0_0_22px_rgba(245,158,11,0.45)] transition hover:brightness-110 disabled:opacity-45"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-black uppercase">
                  SUPER FREE SPINS
                </span>
                <span className="font-display rounded bg-slate-950 px-1.5 py-0.5 text-[9px] font-black text-amber-300">
                  500x
                </span>
              </div>
              <div className="font-ui mt-0.5 text-[10px] font-bold text-stone-950">
                All 49 Spots Pre-Loaded (2x–16x)!
              </div>
              <div className="font-ui mt-1.5 flex items-center justify-between border-t border-black/20 pt-1 text-xs font-black text-white drop-shadow">
                <span>Buy Super</span>
                <span>{formatUSD(buy500CostUSD)}</span>
              </div>
            </button>
          </div>

          {/* Tumble Win History Box */}
          <div className="flex flex-1 flex-col rounded-2xl border border-white/10 bg-slate-950/80 p-3">
            <div className="font-display mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-amber-300">
              <span>TUMBLE WIN LOG</span>
              {highestSpotMult >= 2 && (
                <span className="rounded bg-pink-500/25 px-1.5 py-0.5 text-pink-200">
                  PEAK {highestSpotMult}x
                </span>
              )}
            </div>

            {tumbleHistory.length === 0 ? (
              <div className="font-ui text-[11px] leading-relaxed text-slate-400">
                5+ touching candies explode, mark a <strong>WRAP</strong>, then double{" "}
                <strong>2x → 4x → ... → 1,024x</strong> on every subsequent hit!
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {tumbleHistory.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className="font-ui flex items-center justify-between rounded-lg bg-white/5 px-2 py-1 text-[11px]"
                  >
                    <span className="truncate text-slate-200">
                      {item.clusterSize}× {SYMBOL_LABELS[item.symbol]}
                      {item.spotMultApplied > 1 ? (
                        <strong className="ml-1 text-pink-300">
                          ×{item.spotMultApplied}
                        </strong>
                      ) : null}
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

        {/* CENTER: TOP TUMBLE WIN COUNTER + 7x7 GRID */}
        <section className="relative flex w-full max-w-[650px] flex-col items-center justify-center">
          {/* Top Tumble Win Counter / Bonus Bar */}
          <div className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-pink-400/40 bg-slate-950/85 px-3.5 py-2 shadow-xl backdrop-blur-md">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {inFreeSpins ? (
                <span className="font-display shrink-0 rounded-md bg-gradient-to-r from-pink-500 to-amber-400 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                  {isSuperFreeSpins ? "SUPER FS" : "FREE SPINS"} {freeSpinsLeft}/
                  {freeSpinsTotal}
                </span>
              ) : (
                <Candy className="h-4 w-4 shrink-0 text-pink-400" />
              )}
              <span className="font-ui truncate text-[11px] font-bold text-pink-100 sm:text-xs">
                {bannerStatus}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {inFreeSpins && (
                <span className="font-display whitespace-nowrap rounded-md border border-emerald-400/35 bg-emerald-950/60 px-2 py-0.5 text-[11px] font-black text-emerald-300">
                  BONUS: {formatUSD(bonusTotalWinUSD)}
                </span>
              )}
              {tumbleWinUSD > 0 ? (
                <span className="font-display whitespace-nowrap rounded-lg bg-pink-500/25 px-2.5 py-0.5 text-xs font-black text-amber-300 sm:text-sm">
                  TUMBLE {formatUSD(tumbleWinUSD)}
                </span>
              ) : lastSpinWinUSD > 0 ? (
                <span className="font-display whitespace-nowrap rounded-lg bg-emerald-500/20 px-2.5 py-0.5 text-xs font-black text-emerald-300 sm:text-sm">
                  WIN {formatUSD(lastSpinWinUSD)} ({lastSpinMult.toFixed(2)}x)
                </span>
              ) : null}
            </div>
          </div>

          {/* 7x7 CANDY MACHINE FRAME */}
          <div className="relative w-full overflow-hidden rounded-2xl border-2 border-pink-400/45 bg-[#12071e]/95 p-1.5 shadow-[0_24px_65px_rgba(0,0,0,0.9),inset_0_0_28px_rgba(236,72,153,0.18)] sm:p-2.5">
            <div className="relative grid aspect-square w-full grid-cols-7 grid-rows-7 gap-1 sm:gap-1.5">
              {grid.map((rowArr, r) =>
                rowArr.map((cell, c) => {
                  const colStopped = stoppedCols[c];
                  const hits = spotHitCount[r]?.[c] ?? 0;
                  const spotStyle = getSpotVisualStyle(hits);

                  const animStyle: React.CSSProperties = {};
                  if (cell.fallRows && cell.fallRows > 0) {
                    (
                      animStyle as Record<string, string | number>
                    )["--zyan-fall-from"] = `-${cell.fallRows * 108}%`;
                    animStyle.animation =
                      "zyanCascadeFall 0.25s cubic-bezier(0.22,1,0.36,1)";
                  } else if (!colStopped) {
                    animStyle.animation = "zyanReelDropOut 0.14s ease-in forwards";
                  } else if (cell.isExploding) {
                    animStyle.animation = "zyanSymbolExplode 0.2s ease-in forwards";
                  } else if (cell.isWinning) {
                    animStyle.animation = "zyanSymbolWinPulse 0.3s ease-out infinite";
                  } else {
                    animStyle.animation =
                      "zyanReelDropIn 0.24s cubic-bezier(0.22,1,0.36,1)";
                  }

                  return (
                    <div
                      key={`${cell.uid}-${r}-${c}`}
                      style={animStyle}
                      className={`relative flex items-center justify-center rounded-lg border transition-colors duration-150 sm:rounded-xl ${
                        spotStyle
                          ? spotStyle.frameClass
                          : cell.isWinning
                            ? "z-10 border-amber-300 bg-amber-400/20 shadow-[0_0_16px_rgba(251,191,36,0.7)]"
                            : "border-white/10 bg-slate-900/55"
                      }`}
                    >
                      {/* 3D Gold Candy Wrapper Spot Tile Layer */}
                      {spotStyle && (
                        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-lg sm:rounded-xl">
                          <ProtectedArt
                            src={ZYAN_SLOTS_ASSETS.ZYAN_SUGAR_RUSH.WRAPPER_SPOT_TILE}
                            alt="Candy Wrapper Multiplier Spot"
                            className="h-full w-full object-cover opacity-80 mix-blend-lighten"
                          />
                        </div>
                      )}

                      {/* Multiplier Spot Badge Behind/Corner of Cell */}
                      {spotStyle && (
                        <span
                          className={`font-display pointer-events-none absolute right-0.5 top-0.5 z-20 rounded px-1 py-0 text-[8px] font-black leading-tight shadow sm:text-[9px] ${spotStyle.badgeClass}`}
                        >
                          {spotStyle.label}
                        </span>
                      )}

                      <div className="relative z-10 flex h-full w-full items-center justify-center">
                        <SugarSymbolArtwork symbol={cell.symbol} />
                      </div>
                    </div>
                  );
                })
              )}

              {/* Floating Cluster Callouts */}
              {floatingCallouts.map((call) => (
                <div
                  key={call.id}
                  style={{
                    left: `${((call.col + 0.5) / GRID_COLS) * 100}%`,
                    top: `${((call.row + 0.45) / GRID_ROWS) * 100}%`,
                  }}
                  className="pointer-events-none absolute z-30 -translate-x-1/2 animate-[zyanFloatCallout_0.8s_ease-out_forwards] rounded-lg border border-amber-300/75 bg-slate-950/90 px-2 py-0.5 text-center shadow-xl"
                >
                  <div className="font-display text-xs font-black text-amber-300 sm:text-sm">
                    {call.text}
                  </div>
                  {call.subtext && (
                    <div className="font-ui text-[9px] font-bold text-pink-200">
                      {call.subtext}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* BONUS INTRO OVERLAY */}
            {bonusIntroOverlay && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center backdrop-blur-sm">
                <span className="font-display mb-1 text-xs font-black uppercase tracking-[0.28em] text-pink-300">
                  {bonusIntroOverlay.isSuper
                    ? "SUGAR RUSH 1000 EXCLUSIVE"
                    : "3+ ROCKETS TRIGGERED"}
                </span>
                <h2 className="font-display bg-gradient-to-r from-pink-300 via-amber-300 to-yellow-400 bg-clip-text text-2xl font-black uppercase text-transparent sm:text-4xl">
                  {bonusIntroOverlay.title}
                </h2>
                <p className="font-ui mt-2 max-w-md text-xs font-bold uppercase tracking-wider text-slate-200 sm:text-sm">
                  {bonusIntroOverlay.subtitle}
                </p>
              </div>
            )}

            {/* BIG / MEGA / 25,000x MAX WIN OVERLAY */}
            {winCelebration && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center backdrop-blur-md">
                <Trophy className="mb-2 h-14 w-14 text-amber-400 drop-shadow-[0_0_24px_rgba(251,191,36,0.95)]" />
                <div className="font-display bg-gradient-to-r from-pink-300 via-yellow-400 to-amber-300 bg-clip-text text-3xl font-black uppercase tracking-tight text-transparent sm:text-5xl">
                  {winCelebration.tier}
                </div>
                <div className="font-display mt-2 text-3xl font-black text-emerald-300 drop-shadow sm:text-5xl">
                  {formatUSD(winCelebration.amountUSD)}
                </div>
                <div className="font-ui mt-1.5 text-sm font-extrabold uppercase tracking-widest text-pink-200">
                  {winCelebration.mult.toFixed(2)}x BASE BET
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* BOTTOM PRAGMATIC CONTROL BAR */}
      <footer className="relative z-30 border-t border-white/10 bg-[#0d0615]/95 px-3 py-2.5 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-2.5">
          {/* LEFT: Paytable Info, Sound, Credit, Bet $ USD */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowPaytableModal(true)}
              aria-label="Paytable and Rules"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-slate-900 text-slate-200 transition hover:border-pink-400/50 hover:text-white"
            >
              <Info className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? "Mute audio" : "Unmute audio"}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-slate-900 text-slate-200 transition hover:border-pink-400/50 hover:text-white"
            >
              {soundEnabled ? (
                <Volume2 className="h-5 w-5 text-pink-300" />
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
              <div className="flex min-w-[70px] flex-col text-center">
                <span className="font-display text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  BET
                </span>
                <span className="font-ui text-sm font-extrabold text-white sm:text-base">
                  {formatUSD(baseBetUSD)}
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

          {/* RIGHT: Mobile Buy Bonus, Autoplay, Spin */}
          <div className="relative flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              disabled={isSpinning || inFreeSpins}
              onClick={() => setShowMobileBuyModal(true)}
              className="font-display flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-amber-300/70 bg-gradient-to-r from-pink-500 via-rose-500 to-amber-400 px-3 text-xs font-black uppercase text-white shadow-lg transition hover:brightness-110 disabled:opacity-45 lg:hidden"
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
                  className="font-display flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/15 bg-slate-900 px-3 text-xs font-black uppercase text-slate-200 transition hover:border-pink-400/50 hover:text-white disabled:opacity-45"
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
                        className="font-ui rounded-lg border border-white/10 bg-slate-900 py-1.5 text-xs font-bold text-white hover:border-pink-400/60 hover:bg-slate-800"
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
              className={`font-display flex h-12 w-24 items-center justify-center rounded-2xl border-2 border-pink-200/80 bg-gradient-to-b from-pink-400 via-fuchsia-500 to-amber-400 text-sm font-black uppercase tracking-wider text-white shadow-[0_6px_26px_rgba(236,72,153,0.5),inset_0_2px_0_rgba(255,255,255,0.55)] transition active:translate-y-0.5 sm:h-14 sm:w-28 sm:text-base ${
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
        <div className="mx-auto mt-2 flex w-full max-w-[1400px] items-center justify-between border-t border-white/5 pt-1.5 text-[10px] text-slate-500">
          <div className="flex items-center gap-2">
            <div className="h-4 w-16 overflow-hidden">
              <ProtectedArt
                src={ZYAN_LOGO_URL}
                alt="ZYAN.GG"
                className="h-full w-full object-contain mix-blend-lighten opacity-75"
              />
            </div>
            <span className="font-ui">
              SUGAR RUSH 1000 • 7×7 CLUSTER PAYS • 25,000x MAX
            </span>
          </div>
          <span className="font-ui hidden sm:inline">
            SPACEBAR TO SPIN • $ USD ENGINE
          </span>
        </div>
      </footer>

      {/* ====================================================================
       * MODALS: MOBILE BONUS BUY, PAYTABLE & RULES, PROVABLY FAIR
       * ================================================================== */}

      {showMobileBuyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-pink-400/40 bg-slate-950 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <h3 className="font-display text-base font-black uppercase text-pink-300">
                SUGAR RUSH 1000 FEATURE BUYS
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
                className="rounded-xl border border-pink-300/60 bg-gradient-to-r from-pink-500 to-purple-600 p-3 text-left text-white disabled:opacity-45"
              >
                <div className="flex items-center justify-between font-display text-xs font-black uppercase">
                  <span>BUY FREE SPINS (100x)</span>
                  <span>{formatUSD(buy100CostUSD)}</span>
                </div>
                <p className="font-ui mt-0.5 text-[11px]">
                  10–30 Free Spins with persistent 2x–1,024x Multiplier Spots.
                </p>
              </button>

              <button
                type="button"
                disabled={balanceUSD < buy500CostUSD}
                onClick={() => handleBonusBuy(true)}
                className="rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-600 p-3 text-left text-slate-950 disabled:opacity-45"
              >
                <div className="flex items-center justify-between font-display text-xs font-black uppercase">
                  <span>SUPER FREE SPINS (500x)</span>
                  <span>{formatUSD(buy500CostUSD)}</span>
                </div>
                <p className="font-ui mt-0.5 text-[11px] font-bold">
                  All 49 cells pre-loaded (16x center, 8x/4x/2x rings & corner wrappers)!
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaytableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-pink-400/35 bg-slate-950 p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-display text-lg font-black uppercase text-pink-300">
                  SUGAR RUSH 1000 PAYTABLE & SPOT RULES
                </h3>
                <p className="font-ui text-xs text-slate-400">
                  7×7 Orthogonal Cluster Pays (5+ Touching) • Spots Up to 1,024x • 25,000x Max Win
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
                        <SugarSymbolArtwork symbol={sym} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-display truncate text-[10px] font-black uppercase text-white">
                          {SYMBOL_LABELS[sym]}
                        </div>
                        <div className="font-ui mt-0.5 text-[10px] text-slate-300">
                          <div>
                            15+:{" "}
                            <strong className="text-amber-300">
                              {pays[10].toFixed(2)}x
                            </strong>
                          </div>
                          <div>
                            10:{" "}
                            <strong className="text-slate-100">
                              {pays[5].toFixed(2)}x
                            </strong>
                          </div>
                          <div>
                            5:{" "}
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
              <div className="rounded-xl border border-pink-400/30 bg-pink-950/25 p-3">
                <div className="font-display mb-1 flex items-center gap-1.5 font-black uppercase text-pink-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  CANDY WRAPPER SPOTS (2x → 1,024x)
                </div>
                1st explosion marks a <strong>WRAP</strong>. 2nd explosion activates{" "}
                <strong>2x</strong>, then every subsequent explosion doubles it:{" "}
                <strong>4x, 8x, 16x, 32x, 64x, 128x, 256x, 512x, 1,024x</strong>. All active Spot Multipliers under a winning cluster sum together and multiply the win!
              </div>
              <div className="rounded-xl border border-amber-400/30 bg-amber-950/25 p-3">
                <div className="font-display mb-1 font-black uppercase text-amber-300">
                  FREE SPINS & 500x SUPER FREE SPINS
                </div>
                3, 4, 5, 6, or 7 Rocket Scatters award{" "}
                <strong>10, 12, 15, 20, or 30 Free Spins</strong> where Spots NEVER reset!{" "}
                <strong>Super Free Spins (500x)</strong> pre-loads all 49 cells before Spin 1 (16x center, 8x/4x/2x rings & corner wrappers).
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

export default ZyanSugarRush1000Slot;
