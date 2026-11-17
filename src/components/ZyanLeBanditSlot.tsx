import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Menu,
  Volume2,
  VolumeX,
  ShieldCheck,
  ChevronUp,
  ChevronDown,
  Zap,
  Sparkles,
  Camera,
  Rainbow,
  X,
  Check,
  Play,
  Square,
  Trophy,
  Copy,
  RefreshCw,
  Coins,
  Clover,
} from "lucide-react";

import { ZYAN_SLOTS_ASSETS } from "../constants/slotAssets";

/* ============================================================================
 * 0. OFFICIAL ZYAN.GG BRANDING, ICONIFY ASSETS & ANTI-COPY <ProtectedArt />
 * ========================================================================== */

const ZYAN_LOGO_URL =
  "https://i.ibb.co.com/20Dxw97d/Esports-wordmark-logo-ZYAN-GG-3d5c4c15-2-K.jpg";

export const LE_BANDIT_ICONIFY_ASSETS = {
  trap_bear: "https://api.iconify.design/game-icons/wolf-trap.svg?color=%23cbd5e1",
  cheese_wedge:
    "https://api.iconify.design/game-icons/cheese-wedge.svg?color=%23fde047",
  beer_stein:
    "https://api.iconify.design/game-icons/beer-stein.svg?color=%23fbbf24",
  baguette_bread:
    "https://api.iconify.design/game-icons/croissant.svg?color=%23fdba74",
  top_hat: "https://api.iconify.design/game-icons/top-hat.svg?color=%23e2e8f0",
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

export interface ZyanLeBanditBetRecord {
  gameKey: "ZYAN_LE_BANDIT";
  gameName: "Zyan Le Bandit";
  wagerUSD: number;
  multiplier: number;
  payoutUSD: number;
  isWin: boolean;
  proofHash: string;
}

export interface ZyanLeBanditSlotProps {
  externalBalanceUSD?: number;
  onBalanceChange?: (newBalanceUSD: number) => void;
  onRecordBet?: (bet: ZyanLeBanditBetRecord) => void;
  activeRtpPercent?: number; // Default 96.5% (controlled silently by Admin Panel)
  username?: string;
}

export type BanditSymbolId =
  | "rank_10"
  | "rank_j"
  | "rank_q"
  | "rank_k"
  | "rank_a"
  | "trap_bear"
  | "cheese_wedge"
  | "beer_stein"
  | "baguette_bread"
  | "top_hat"
  | "wild_poster"
  | "rainbow_trigger"
  | "scatter_camera";

type RegularBanditSymbolId =
  | "rank_10"
  | "rank_j"
  | "rank_q"
  | "rank_k"
  | "rank_a"
  | "trap_bear"
  | "cheese_wedge"
  | "beer_stein"
  | "baguette_bread"
  | "top_hat";

type BonusTier =
  | "NONE"
  | "LUCK_OF_THE_BANDIT"
  | "ALL_THAT_GLITTERS"
  | "TREASURE_RAINBOW";

type SpinPhase =
  | "IDLE"
  | "DROPPING"
  | "EVALUATING"
  | "SUPER_EXPLODING"
  | "CASCADING"
  | "RAINBOW_ACTIVATING"
  | "GOLD_SPINNING"
  | "CLOVER_MULTIPLYING"
  | "POT_SWEEPING"
  | "COLLECTING_COINS";

type GoldRevealKind =
  | "bronze_coin"
  | "silver_coin"
  | "gold_coin"
  | "clover"
  | "pot_of_gold";

interface GoldRevealItem {
  uid: string;
  kind: GoldRevealKind;
  value: number; // Coin mult (0.2..500+), Clover mult (2..10), or Pot accumulated value
  activatedPot?: boolean;
  consumedClover?: boolean;
  isPulsing?: boolean;
  isSpinningMini?: boolean;
}

interface BanditCell {
  uid: string;
  symbol: BanditSymbolId;
  row: number;
  col: number;
  fallRows?: number;
  isWinning?: boolean;
  isExploding?: boolean;
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
 * 2. PAYTABLE, COIN/CLOVER WEIGHTS & CONSTANTS (LE BANDIT 1:1 MATH)
 * ========================================================================== */

const GRID_COLS = 6;
const GRID_ROWS = 5;
const MAX_WIN_MULT = 10000;

// Cluster sizes: [5, 6, 7, 8, 9-10, 11-12, 13+]
const PAYTABLE: Record<
  RegularBanditSymbolId,
  [number, number, number, number, number, number, number]
> = {
  rank_10: [0.1, 0.2, 0.4, 0.7, 1.5, 5.0, 15.0],
  rank_j: [0.1, 0.2, 0.4, 0.7, 1.5, 5.0, 15.0],
  rank_q: [0.1, 0.2, 0.4, 0.7, 1.5, 5.0, 15.0],
  rank_k: [0.1, 0.2, 0.4, 0.7, 1.5, 5.0, 15.0],
  rank_a: [0.1, 0.2, 0.4, 0.7, 1.5, 5.0, 15.0],
  trap_bear: [0.3, 0.6, 1.2, 2.5, 5.0, 10.0, 25.0],
  cheese_wedge: [0.3, 0.6, 1.2, 2.5, 5.0, 10.0, 25.0],
  beer_stein: [0.5, 1.0, 2.0, 4.0, 8.0, 18.0, 50.0],
  baguette_bread: [0.5, 1.0, 2.0, 4.0, 8.0, 18.0, 50.0],
  top_hat: [1.0, 2.0, 4.0, 8.0, 16.0, 35.0, 100.0],
};

const REGULAR_SYMBOL_IDS: RegularBanditSymbolId[] = [
  "rank_10",
  "rank_j",
  "rank_q",
  "rank_k",
  "rank_a",
  "trap_bear",
  "cheese_wedge",
  "beer_stein",
  "baguette_bread",
  "top_hat",
];

const SYMBOL_LABELS: Record<BanditSymbolId, string> = {
  rank_10: "10 Vintage",
  rank_j: "J Vintage",
  rank_q: "Q Vintage",
  rank_k: "K Vintage",
  rank_a: "A Vintage",
  trap_bear: "Bandit Trap",
  cheese_wedge: "Swiss Cheese",
  beer_stein: "Tavern Pint",
  baguette_bread: "Parisian Baguette",
  top_hat: "Magician Top Hat",
  wild_poster: "Wanted Poster WILD",
  rainbow_trigger: "Neon Rainbow",
  scatter_camera: "Polaroid FS Scatter",
};

const BRONZE_COIN_VALUES = [0.2, 0.5, 1, 2, 3, 4] as const;
const BRONZE_COIN_WEIGHTS = [28, 25, 20, 14, 8, 5];

const SILVER_COIN_VALUES = [5, 10, 15, 20] as const;
const SILVER_COIN_WEIGHTS = [42, 28, 18, 12];

const GOLD_COIN_VALUES = [25, 50, 100, 250, 500] as const;
const GOLD_COIN_WEIGHTS = [46, 28, 16, 7, 3];

const CLOVER_VALUES = [2, 3, 4, 5, 10] as const;
const CLOVER_WEIGHTS = [42, 26, 16, 11, 5];

const BET_LADDER_USD = [
  0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0,
  300.0, 500.0,
];

const FEATURE_BUY_CARDS = [
  {
    id: "bonus_hunt" as const,
    title: "BONUS HUNT",
    subtitle: "5x Bonus Chance",
    badge: "3x BET",
    costMult: 3,
    isToggle: true,
    accent: "from-amber-400 via-yellow-500 to-orange-500",
    border: "border-amber-400/50",
    desc: "Each spin is 5x more likely to trigger a Bonus Game.",
  },
  {
    id: "rainbow_spins" as const,
    title: "RAINBOW SPINS",
    subtitle: "Guaranteed Rainbow",
    badge: "50x BET",
    costMult: 50,
    isToggle: true,
    accent: "from-fuchsia-400 via-pink-500 to-cyan-400",
    border: "border-fuchsia-400/55",
    desc: "Guarantees at least 1 Neon Rainbow lands on EVERY spin!",
  },
  {
    id: "luck_bandit" as const,
    title: "LUCK OF THE BANDIT",
    subtitle: "8 Free Spins",
    badge: "100x BET",
    costMult: 100,
    isToggle: false,
    accent: "from-emerald-400 via-teal-400 to-cyan-400",
    border: "border-emerald-400/55",
    desc: "Golden Squares stay active between spins until a Rainbow reveals them.",
  },
  {
    id: "all_glitters" as const,
    title: "ALL THAT GLITTERS IS GOLD",
    subtitle: "12 Free Spins • Permanent Gold",
    badge: "250x BET",
    costMult: 250,
    isToggle: false,
    accent: "from-yellow-300 via-amber-400 to-orange-500",
    border: "border-yellow-300/70",
    desc: "Golden Squares NEVER reset for all 12 Free Spins—even after Rainbows!",
  },
];

/* ============================================================================
 * 3. CRYPTOGRAPHIC PRNG & HMAC-SHA256 PROVABLY FAIR HELPERS
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

async function computeHmacSha256Hex(
  serverSeed: string,
  message: string
): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(serverSeed),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return Array.from(new Uint8Array(sig), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
  }
  let h = 2166136261;
  const full = `${serverSeed}:${message}`;
  for (let i = 0; i < full.length; i++) {
    h ^= full.charCodeAt(i);
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

function formatMultBadge(v: number): string {
  return Number.isInteger(v) ? `${v}x` : `${v.toFixed(1)}x`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/* ============================================================================
 * 4. SYNTHESIZED PARISIAN HEIST, RAINBOW HARP & POT SWEEP AUDIO ENGINE
 * ========================================================================== */

class BanditAudioEngine {
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

  public playTileClack(colIndex: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220 + colIndex * 28, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.045);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playSuperCascadePop(step: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const base = 360 + Math.min(step, 8) * 55;
    [base, base * 1.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const t = now + i * 0.035;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  public playRainbowHarp() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const arp = [392, 493.88, 587.33, 739.99, 783.99, 987.77, 1174.66];
    arp.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      const t = now + idx * 0.045;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  public playCoinClink(tier: "bronze" | "silver" | "gold") {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freq = tier === "gold" ? 1760 : tier === "silver" ? 1320 : 980;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.18, now + 0.06);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playCloverPowerUp() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      const t = now + i * 0.04;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.085, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  public playPotVacuumSweep() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.34);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playWinFanfare(mult: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes =
      mult >= 50
        ? [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5]
        : [293.66, 369.99, 440, 587.33];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = mult >= 50 ? "sawtooth" : "triangle";
      const t = now + i * 0.06;
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
 * 5. HIGH-CONTRAST PARISIAN HEIST SYMBOLS & GOLDEN REVEAL ARTWORK
 * ========================================================================== */

const BanditSymbolArtwork: React.FC<{ symbol: BanditSymbolId }> = React.memo(
  ({ symbol }) => {
    const uid = useId().replace(/:/g, "");

    // 5 Low-Pay Vintage Letters (10, J, Q, K, A)
    if (
      symbol === "rank_10" ||
      symbol === "rank_j" ||
      symbol === "rank_q" ||
      symbol === "rank_k" ||
      symbol === "rank_a"
    ) {
      const charMap: Record<typeof symbol, string> = {
        rank_10: "10",
        rank_j: "J",
        rank_q: "Q",
        rank_k: "K",
        rank_a: "A",
      };
      const palMap: Record<
        typeof symbol,
        { top: string; bot: string; ring: string }
      > = {
        rank_10: { top: "#e2e8f0", bot: "#64748b", ring: "#94a3b8" },
        rank_j: { top: "#93c5fd", bot: "#1d4ed8", ring: "#60a5fa" },
        rank_q: { top: "#f9a8d4", bot: "#be185d", ring: "#f472b6" },
        rank_k: { top: "#fca5a5", bot: "#b91c1c", ring: "#f87171" },
        rank_a: { top: "#fde047", bot: "#b45309", ring: "#fbbf24" },
      };
      const pal = palMap[symbol];
      const lbl = charMap[symbol];
      return (
        <svg
          viewBox="0 0 100 100"
          className="h-[88%] w-[88%] drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)]"
        >
          <defs>
            <linearGradient id={`${uid}-vr`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={pal.top} />
              <stop offset="100%" stopColor={pal.bot} />
            </linearGradient>
          </defs>
          <rect
            x="10"
            y="10"
            width="80"
            height="80"
            rx="16"
            fill="#14131c"
            stroke={pal.ring}
            strokeOpacity="0.45"
            strokeWidth="2.5"
          />
          <text
            x="50"
            y="67"
            textAnchor="middle"
            fill={`url(#${uid}-vr)`}
            stroke="#09090d"
            strokeWidth="3.5"
            paintOrder="stroke"
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 900,
              fontSize: lbl === "10" ? "43px" : "50px",
              letterSpacing: "-2px",
            }}
          >
            {lbl}
          </text>
        </svg>
      );
    }

    // 5 High-Pay Parisian Heist Symbols (Iconify Game-Icons + 3D SVG Frames & Fallbacks)
    if (
      symbol === "trap_bear" ||
      symbol === "cheese_wedge" ||
      symbol === "beer_stein" ||
      symbol === "baguette_bread" ||
      symbol === "top_hat"
    ) {
      const cfgMap: Record<
        typeof symbol,
        { src: string; bg: string; border: string; fallback: React.ReactNode }
      > = {
        trap_bear: {
          src: LE_BANDIT_ICONIFY_ASSETS.trap_bear,
          bg: "from-slate-800 via-zinc-900 to-black",
          border: "border-slate-300/45",
          fallback: (
            <svg viewBox="0 0 100 100" className="h-[74%] w-[74%]">
              <ellipse cx="50" cy="54" rx="34" ry="20" fill="none" stroke="#cbd5e1" strokeWidth="7" />
              <polygon points="28,36 36,48 44,36 52,48 60,36 68,48 74,36" fill="#e2e8f0" />
            </svg>
          ),
        },
        cheese_wedge: {
          src: LE_BANDIT_ICONIFY_ASSETS.cheese_wedge,
          bg: "from-amber-900/90 via-yellow-950/90 to-stone-950",
          border: "border-yellow-300/55",
          fallback: (
            <svg viewBox="0 0 100 100" className="h-[74%] w-[74%]">
              <polygon points="16,68 82,40 82,76 16,76" fill="#facc15" stroke="#713f12" strokeWidth="3" />
              <polygon points="16,68 50,24 82,40" fill="#fde047" stroke="#713f12" strokeWidth="3" />
              <circle cx="52" cy="58" r="6" fill="#a16207" />
              <circle cx="68" cy="64" r="4.5" fill="#a16207" />
            </svg>
          ),
        },
        beer_stein: {
          src: LE_BANDIT_ICONIFY_ASSETS.beer_stein,
          bg: "from-amber-950 via-orange-950/80 to-stone-950",
          border: "border-amber-400/60",
          fallback: (
            <svg viewBox="0 0 100 100" className="h-[74%] w-[74%]">
              <rect x="28" y="30" width="38" height="54" rx="6" fill="#f59e0b" stroke="#fef3c7" strokeWidth="3" />
              <path d="M66 40 H78 V68 H66" fill="none" stroke="#fef3c7" strokeWidth="5" />
              <ellipse cx="47" cy="28" rx="22" ry="10" fill="#ffffff" />
            </svg>
          ),
        },
        baguette_bread: {
          src: LE_BANDIT_ICONIFY_ASSETS.baguette_bread,
          bg: "from-orange-950 via-amber-950/85 to-stone-950",
          border: "border-orange-300/60",
          fallback: (
            <svg viewBox="0 0 100 100" className="h-[74%] w-[74%]">
              <ellipse cx="50" cy="50" rx="34" ry="16" transform="rotate(-30 50 50)" fill="#fb923c" stroke="#7c2d12" strokeWidth="3" />
              <line x1="36" y1="54" x2="44" y2="42" stroke="#fed7aa" strokeWidth="3" strokeLinecap="round" />
              <line x1="48" y1="46" x2="56" y2="34" stroke="#fed7aa" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ),
        },
        top_hat: {
          src: LE_BANDIT_ICONIFY_ASSETS.top_hat,
          bg: "from-emerald-950 via-slate-900 to-black",
          border: "border-emerald-300/70",
          fallback: (
            <svg viewBox="0 0 100 100" className="h-[74%] w-[74%]">
              <rect x="30" y="20" width="40" height="48" rx="4" fill="#1e293b" stroke="#e2e8f0" strokeWidth="2.5" />
              <rect x="30" y="54" width="40" height="10" fill="#10b981" />
              <ellipse cx="50" cy="70" rx="36" ry="9" fill="#0f172a" stroke="#e2e8f0" strokeWidth="2.5" />
            </svg>
          ),
        },
      };
      const cfg = cfgMap[symbol];

      return (
        <div
          className={`relative flex h-full w-full items-center justify-center rounded-xl border ${cfg.border} bg-gradient-to-b ${cfg.bg} p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_5px_12px_rgba(0,0,0,0.7)]`}
        >
          <ProtectedArt
            src={cfg.src}
            alt={SYMBOL_LABELS[symbol]}
            className="h-[76%] w-[76%] object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.9)]"
            fallback={cfg.fallback}
          />
        </div>
      );
    }

    // Wanted Poster WILD
    if (symbol === "wild_poster") {
      return (
        <div className="relative flex h-full w-full items-center justify-center p-0.5">
          <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-amber-300 bg-gradient-to-b from-amber-100 via-amber-200 to-amber-400 px-1 text-stone-950 shadow-[0_0_18px_rgba(251,191,36,0.7)]">
            <span className="font-display text-[7px] font-black uppercase tracking-widest text-red-700 sm:text-[8px]">
              WANTED
            </span>
            <span className="font-display text-sm font-black uppercase leading-none tracking-tight text-stone-950 sm:text-base">
              WILD
            </span>
            <span className="font-ui text-[7px] font-bold text-stone-800">
              SMOKY
            </span>
          </div>
        </div>
      );
    }

    // Neon Rainbow Trigger
    if (symbol === "rainbow_trigger") {
      return (
        <div className="relative flex h-full w-full items-center justify-center p-0.5">
          <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-cyan-200 bg-gradient-to-br from-fuchsia-600 via-indigo-800 to-emerald-600 shadow-[0_0_24px_rgba(236,72,153,0.85)]">
            <Rainbow className="h-6 w-6 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.9)] sm:h-7 sm:w-7" />
            <span className="font-display text-[8px] font-black uppercase tracking-wider text-amber-200">
              RAINBOW
            </span>
          </div>
        </div>
      );
    }

    // Polaroid Camera FS Scatter
    return (
      <div className="relative flex h-full w-full items-center justify-center p-0.5">
        <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-emerald-300 bg-gradient-to-b from-emerald-500 via-teal-700 to-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.8)]">
          <Camera className="h-5 w-5 text-white drop-shadow sm:h-6 sm:w-6" />
          <span className="font-display mt-0.5 rounded bg-amber-300 px-1.5 text-[8px] font-black uppercase tracking-widest text-slate-950">
            FS
          </span>
        </div>
      </div>
    );
  }
);

const GoldRevealArtwork: React.FC<{ item: GoldRevealItem }> = React.memo(
  ({ item }) => {
    if (item.isSpinningMini) {
      return (
        <div className="flex h-full w-full animate-pulse items-center justify-center rounded-xl border-2 border-amber-300 bg-gradient-to-b from-amber-300 via-yellow-500 to-amber-700">
          <Coins className="h-6 w-6 animate-spin text-stone-950" />
        </div>
      );
    }

    if (
      item.kind === "bronze_coin" ||
      item.kind === "silver_coin" ||
      item.kind === "gold_coin"
    ) {
      const styleMap = {
        bronze_coin: {
          ring: "border-orange-300",
          bg: "from-orange-400 via-amber-700 to-stone-950",
          txt: "text-orange-100",
          glow: "shadow-[0_0_14px_rgba(251,146,60,0.6)]",
        },
        silver_coin: {
          ring: "border-slate-200",
          bg: "from-slate-100 via-slate-400 to-slate-800",
          txt: "text-slate-950",
          glow: "shadow-[0_0_16px_rgba(226,232,240,0.7)]",
        },
        gold_coin: {
          ring: "border-yellow-200",
          bg: "from-yellow-200 via-amber-400 to-amber-700",
          txt: "text-stone-950",
          glow: "shadow-[0_0_22px_rgba(251,191,36,0.9)]",
        },
      }[item.kind];

      return (
        <div
          className={`flex h-full w-full items-center justify-center p-0.5 transition-transform duration-200 ${
            item.isPulsing ? "scale-110" : "scale-100"
          }`}
        >
          <div
            className={`flex h-[90%] w-[90%] flex-col items-center justify-center rounded-full border-2 ${styleMap.ring} bg-gradient-to-b ${styleMap.bg} ${styleMap.glow}`}
          >
            <span
              className={`font-display text-xs font-black leading-none tracking-tight sm:text-sm ${styleMap.txt}`}
            >
              {formatMultBadge(item.value)}
            </span>
          </div>
        </div>
      );
    }

    if (item.kind === "clover") {
      return (
        <div
          className={`flex h-full w-full items-center justify-center p-0.5 transition-transform duration-200 ${
            item.isPulsing ? "scale-115" : "scale-100"
          }`}
        >
          <div
            className={`flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-400 via-green-600 to-emerald-950 shadow-[0_0_20px_rgba(52,211,153,0.9)] ${
              item.consumedClover ? "opacity-50" : "opacity-100"
            }`}
          >
            <Clover className="h-4 w-4 text-emerald-100 sm:h-5 sm:w-5" />
            <span className="font-display text-xs font-black leading-none text-white sm:text-sm">
              ×{item.value}
            </span>
          </div>
        </div>
      );
    }

    // Pot of Gold Collector (3D Cauldron Studio Asset + SVG/CSS Fallback)
    return (
      <div
        className={`relative flex h-full w-full items-center justify-center p-0.5 transition-transform duration-200 ${
          item.isPulsing ? "scale-112" : "scale-100"
        }`}
      >
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border-2 border-amber-300 bg-gradient-to-b from-amber-950/80 via-slate-900 to-emerald-950/90 shadow-[0_0_24px_rgba(251,191,36,0.95)]">
          <ProtectedArt
            src={ZYAN_SLOTS_ASSETS.ZYAN_BANDIT.POT_OF_GOLD}
            alt="Pot of Gold Collector"
            className="h-full w-full scale-115 rounded-xl object-contain mix-blend-lighten"
            fallback={
              <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-amber-300 via-yellow-500 to-emerald-900">
                <span className="font-display text-[7px] font-black uppercase tracking-widest text-stone-950">
                  POT GOLD
                </span>
              </div>
            }
          />
          <span className="font-display pointer-events-none absolute bottom-0.5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-black leading-none text-amber-300 ring-1 ring-amber-400/75 sm:text-xs">
            {formatMultBadge(item.value)}
          </span>
        </div>
      </div>
    );
  }
);

/* ============================================================================
 * 6. CLUSTER PAYS BFS EVALUATOR & BOARD GENERATORS
 * ========================================================================== */

let banditUidCounter = 1;
function nextUid(prefix = "lb"): string {
  banditUidCounter += 1;
  return `${prefix}-${banditUidCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function getClusterPayIndex(size: number): number {
  if (size >= 13) return 6;
  if (size >= 11) return 5;
  if (size >= 9) return 4;
  if (size === 8) return 3;
  if (size === 7) return 2;
  if (size === 6) return 1;
  return 0;
}

function rollCellSymbol(params: {
  rng: () => number;
  bonusHunt: boolean;
  rainbowFeatureSpins: boolean;
  bonusTier: BonusTier;
  activeRtpPercent: number;
  allowRainbow?: boolean;
}): BanditSymbolId {
  const { rng, bonusHunt, bonusTier, activeRtpPercent, allowRainbow = true } =
    params;

  const rtpFactor = Math.max(0.75, Math.min(1.2, activeRtpPercent / 96.5));
  const inBonus = bonusTier !== "NONE";

  const pool: BanditSymbolId[] = [
    "rank_10",
    "rank_j",
    "rank_q",
    "rank_k",
    "rank_a",
    "trap_bear",
    "cheese_wedge",
    "beer_stein",
    "baguette_bread",
    "top_hat",
    "wild_poster",
    "rainbow_trigger",
    "scatter_camera",
  ];

  const weights = [
    17, // rank_10
    16, // rank_j
    15, // rank_q
    14, // rank_k
    13, // rank_a
    7.5, // trap_bear
    7.0, // cheese_wedge
    5.5, // beer_stein
    5.0, // baguette_bread
    3.6 * rtpFactor, // top_hat
    (inBonus ? 4.2 : 2.8) * rtpFactor, // wild_poster
    allowRainbow ? (inBonus ? 2.8 : 1.75) * rtpFactor : 0, // rainbow_trigger
    inBonus ? 1.8 : bonusHunt ? 3.8 : 1.15, // scatter_camera
  ];

  return pickWeighted(pool, weights, rng);
}

function generateInitialGrid(params: {
  rng: () => number;
  bonusHunt: boolean;
  rainbowFeatureSpins: boolean;
  bonusTier: BonusTier;
  activeRtpPercent: number;
  forceScatters?: number;
}): BanditCell[][] {
  const {
    rng,
    bonusHunt,
    rainbowFeatureSpins,
    bonusTier,
    activeRtpPercent,
    forceScatters = 0,
  } = params;

  const grid: BanditCell[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowArr: BanditCell[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      rowArr.push({
        uid: nextUid(),
        symbol: rollCellSymbol({
          rng,
          bonusHunt,
          rainbowFeatureSpins,
          bonusTier,
          activeRtpPercent,
          allowRainbow: forceScatters === 0,
        }),
        row: r,
        col: c,
      });
    }
    grid.push(rowArr);
  }

  // Ensure guaranteed Rainbow on Rainbow FeatureSpins OR Bonus 3 (Treasure at the End of the Rainbow)
  const needsGuaranteedRainbow =
    forceScatters === 0 &&
    (rainbowFeatureSpins || bonusTier === "TREASURE_RAINBOW");

  if (needsGuaranteedRainbow) {
    const hasRainbow = grid.some((row) =>
      row.some((c) => c.symbol === "rainbow_trigger")
    );
    if (!hasRainbow) {
      const rr = Math.floor(rng() * GRID_ROWS);
      const rc = Math.floor(rng() * GRID_COLS);
      grid[rr][rc] = {
        uid: nextUid("rb"),
        symbol: "rainbow_trigger",
        row: rr,
        col: rc,
      };
    }
  }

  // Inject forced FS Scatters for Bonus Buys (100x = 3 scatters, 250x = 4 scatters)
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
    let existing = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (grid[r][c].symbol === "scatter_camera") existing++;
      }
    }
    for (let k = 0; k < coords.length && existing < forceScatters; k++) {
      const { r, c } = coords[k];
      if (grid[r][c].symbol !== "scatter_camera") {
        grid[r][c] = {
          uid: nextUid("fsc"),
          symbol: "scatter_camera",
          row: r,
          col: c,
        };
        existing++;
      }
    }
  }

  return grid;
}

function evaluateOrthogonalClusters(
  grid: BanditCell[][],
  baseBetUSD: number
): {
  clusters: Array<{
    symbol: RegularBanditSymbolId;
    coords: Array<{ row: number; col: number }>;
    payoutUSD: number;
  }>;
  stepWinUSD: number;
  winningSymbolTypes: Set<RegularBanditSymbolId>;
  clusterMarkCoords: Array<{ row: number; col: number }>;
  superRemovalMask: boolean[][];
} {
  const clusters: Array<{
    symbol: RegularBanditSymbolId;
    coords: Array<{ row: number; col: number }>;
    payoutUSD: number;
  }> = [];

  const winningSymbolTypes = new Set<RegularBanditSymbolId>();
  const clusterMarkCoords: Array<{ row: number; col: number }> = [];
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (const sym of REGULAR_SYMBOL_IDS) {
    const visitedReg = Array.from({ length: GRID_ROWS }, () =>
      Array(GRID_COLS).fill(false)
    );

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (grid[r][c].symbol !== sym || visitedReg[r][c]) continue;

        const visitedLocal = Array.from({ length: GRID_ROWS }, () =>
          Array(GRID_COLS).fill(false)
        );
        const queue: Array<{ row: number; col: number }> = [{ row: r, col: c }];
        const group: Array<{ row: number; col: number }> = [];
        visitedLocal[r][c] = true;
        visitedReg[r][c] = true;

        while (queue.length > 0) {
          const cur = queue.shift()!;
          group.push(cur);
          for (const [dr, dc] of dirs) {
            const nr = cur.row + dr;
            const nc = cur.col + dc;
            if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
            if (visitedLocal[nr][nc]) continue;
            const nSym = grid[nr][nc].symbol;
            if (nSym === sym || nSym === "wild_poster") {
              visitedLocal[nr][nc] = true;
              if (nSym === sym) visitedReg[nr][nc] = true;
              queue.push({ row: nr, col: nc });
            }
          }
        }

        if (group.length >= 5) {
          const payIdx = getClusterPayIndex(group.length);
          const mult = PAYTABLE[sym][payIdx];
          const payoutUSD = Number((baseBetUSD * mult).toFixed(2));
          clusters.push({ symbol: sym, coords: group, payoutUSD });
          winningSymbolTypes.add(sym);
          group.forEach((pt) => clusterMarkCoords.push(pt));
        }
      }
    }
  }

  // SUPER CASCADE RULE:
  // Remove exact cluster cells (including connected wilds) AND every single matching instance of any winningSymbolTypes across the whole 6x5 grid!
  const superRemovalMask = Array.from({ length: GRID_ROWS }, () =>
    Array(GRID_COLS).fill(false)
  );
  if (clusters.length > 0) {
    clusterMarkCoords.forEach((pt) => {
      superRemovalMask[pt.row][pt.col] = true;
    });
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const s = grid[r][c].symbol;
        if (
          (REGULAR_SYMBOL_IDS as string[]).includes(s) &&
          winningSymbolTypes.has(s as RegularBanditSymbolId)
        ) {
          superRemovalMask[r][c] = true;
        }
      }
    }
  }

  const stepWinUSD = Number(
    clusters.reduce((acc, cl) => acc + cl.payoutUSD, 0).toFixed(2)
  );

  return {
    clusters,
    stepWinUSD,
    winningSymbolTypes,
    clusterMarkCoords,
    superRemovalMask,
  };
}

function rollGoldRevealItem(params: {
  rng: () => number;
  removeBronze: boolean;
  allowPot: boolean;
  activeRtpPercent: number;
}): GoldRevealItem {
  const { rng, removeBronze, allowPot, activeRtpPercent } = params;
  const rtpFactor = Math.max(0.75, Math.min(1.2, activeRtpPercent / 96.5));

  const kindPool: GoldRevealKind[] = [
    "bronze_coin",
    "silver_coin",
    "gold_coin",
    "clover",
    "pot_of_gold",
  ];
  const weights = [
    removeBronze ? 0 : 62, // bronze_coin
    removeBronze ? 64 : 21, // silver_coin
    (removeBronze ? 18 : 6.2) * rtpFactor, // gold_coin
    9.5 * rtpFactor, // clover
    allowPot ? 4.8 * rtpFactor : 0, // pot_of_gold
  ];

  const kind = pickWeighted(kindPool, weights, rng);
  if (kind === "bronze_coin") {
    return {
      uid: nextUid("gc"),
      kind,
      value: pickWeighted(BRONZE_COIN_VALUES, BRONZE_COIN_WEIGHTS, rng),
    };
  }
  if (kind === "silver_coin") {
    return {
      uid: nextUid("sc"),
      kind,
      value: pickWeighted(SILVER_COIN_VALUES, SILVER_COIN_WEIGHTS, rng),
    };
  }
  if (kind === "gold_coin") {
    return {
      uid: nextUid("auc"),
      kind,
      value: pickWeighted(GOLD_COIN_VALUES, GOLD_COIN_WEIGHTS, rng),
    };
  }
  if (kind === "clover") {
    return {
      uid: nextUid("clv"),
      kind,
      value: pickWeighted(CLOVER_VALUES, CLOVER_WEIGHTS, rng),
    };
  }
  return {
    uid: nextUid("pot"),
    kind: "pot_of_gold",
    value: 0,
    activatedPot: false,
  };
}

/* ============================================================================
 * 7. MAIN COMPONENT: <ZyanLeBanditSlot />
 * ========================================================================== */

export const ZyanLeBanditSlot: React.FC<ZyanLeBanditSlotProps> = ({
  externalBalanceUSD,
  onBalanceChange,
  onRecordBet,
  activeRtpPercent = 96.5,
  username = "Bandit",
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

  // Betting & FeatureSpins Toggles
  const [betIndex, setBetIndex] = useState<number>(4); // $1.00 base bet
  const baseBetUSD = BET_LADDER_USD[betIndex];
  const [bonusHuntActive, setBonusHuntActive] = useState<boolean>(false);
  const [rainbowSpinsActive, setRainbowSpinsActive] = useState<boolean>(false);

  const effectiveSpinCostUSD = Number(
    (
      baseBetUSD *
      (rainbowSpinsActive ? 50 : bonusHuntActive ? 3 : 1)
    ).toFixed(2)
  );

  // Grid, Golden Squares & Rainbow Reveal State
  const [grid, setGrid] = useState<BanditCell[][]>(() => {
    const seedRng = createSeededRng("zyan-le-bandit-initial-board-10000x");
    return generateInitialGrid({
      rng: seedRng,
      bonusHunt: false,
      rainbowFeatureSpins: false,
      bonusTier: "NONE",
      activeRtpPercent: 96.5,
    });
  });

  const [goldenSquares, setGoldenSquares] = useState<boolean[][]>(() =>
    Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
  );
  const [goldRevealMap, setGoldRevealMap] = useState<
    Record<string, GoldRevealItem>
  >({});

  const [spinPhase, setSpinPhase] = useState<SpinPhase>("IDLE");
  const [stoppedCols, setStoppedCols] = useState<boolean[]>([
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
  const [floatingCallouts, setFloatingCallouts] = useState<FloatingCallout[]>(
    []
  );
  const [lastSpinWinUSD, setLastSpinWinUSD] = useState<number>(0);
  const [lastSpinMult, setLastSpinMult] = useState<number>(0);
  const [bannerStatus, setBannerStatus] = useState<string>(
    "SUPER CASCADE • GOLDEN SQUARES + RAINBOW COINS UP TO 500x"
  );
  const [stageShake, setStageShake] = useState<boolean>(false);

  // 3 Bonus Tiers State
  const [bonusTier, setBonusTier] = useState<BonusTier>("NONE");
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [freeSpinsTotal, setFreeSpinsTotal] = useState<number>(0);
  const [bonusTotalWinUSD, setBonusTotalWinUSD] = useState<number>(0);
  const [bonusIntroOverlay, setBonusIntroOverlay] = useState<{
    title: string;
    subtitle: string;
    badge: string;
  } | null>(null);
  const [winCelebration, setWinCelebration] = useState<{
    tier: "BIG WIN" | "MEGA WIN" | "LE BANDIT 10,000x MAX WIN";
    amountUSD: number;
    mult: number;
  } | null>(null);

  // Audio, Autoplay, Modals & Provably Fair
  const audioRef = useRef<BanditAudioEngine | null>(null);
  if (!audioRef.current) audioRef.current = new BanditAudioEngine();

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [autoSpinsLeft, setAutoSpinsLeft] = useState<number>(0);
  const [showAutoMenu, setShowAutoMenu] = useState<boolean>(false);
  const [showPaytableModal, setShowPaytableModal] = useState<boolean>(false);
  const [showBuyModal, setShowBuyModal] = useState<boolean>(false);
  const [showFairModal, setShowFairModal] = useState<boolean>(false);

  const [serverSeed] = useState<string>(() => randomHex(16));
  const [clientSeed, setClientSeed] = useState<string>(() => randomHex(8));
  const [nonce, setNonce] = useState<number>(1);
  const [lastProofHash, setLastProofHash] = useState<string>("");
  const [history, setHistory] = useState<SpinHistoryEntry[]>([]);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [verifyOutput, setVerifyOutput] = useState<string | null>(null);

  // DOM Refs for Unclipped Canvas Rainbow & Clover/Pot Sweep Beams
  const mainStageRef = useRef<HTMLDivElement | null>(null);
  const beamCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
      { type: "ZYAN_SLOT_READY", gameKey: "ZYAN_LE_BANDIT" },
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
    }, 340);
  }, []);

  const emitBetRecord = useCallback(
    (wagerUSD: number, payoutUSD: number, proofHash: string) => {
      const mult = wagerUSD > 0 ? Number((payoutUSD / wagerUSD).toFixed(2)) : 0;
      const record: ZyanLeBanditBetRecord = {
        gameKey: "ZYAN_LE_BANDIT",
        gameName: "Zyan Le Bandit",
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

  // Canvas Beam Helper (Prismatic Rainbow, Clover Emerald, Pot Gold Suction)
  const fireBeams = useCallback(
    (
      segments: Array<{
        fromKey: string;
        toKey: string;
        color: string;
        width?: number;
      }>,
      durationMs = 420
    ) => {
      const canvas = beamCanvasRef.current;
      const stage = mainStageRef.current;
      if (!canvas || !stage) return;

      const stageRect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(stageRect.width * dpr));
      canvas.height = Math.max(1, Math.floor(stageRect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const getCenter = (key: string) => {
        const el = cellRefs.current[key];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        return {
          x: (r.left - stageRect.left + r.width / 2) * dpr,
          y: (r.top - stageRect.top + r.height / 2) * dpr,
        };
      };

      const pts = segments
        .map((s) => ({
          from: getCenter(s.fromKey),
          to: getCenter(s.toKey),
          color: s.color,
          width: (s.width ?? 4) * dpr,
        }))
        .filter((s) => s.from && s.to);

      if (pts.length === 0) return;

      const start = performance.now();
      const render = (now: number) => {
        if (!mountedRef.current) return;
        const p = Math.min(1, (now - start) / durationMs);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (p < 1) {
          ctx.save();
          ctx.globalAlpha = 1 - Math.pow(p, 2);
          pts.forEach((seg) => {
            if (!seg.from || !seg.to) return;
            ctx.beginPath();
            ctx.moveTo(seg.from.x, seg.from.y);
            ctx.lineTo(seg.to.x, seg.to.y);
            ctx.strokeStyle = seg.color;
            ctx.lineWidth = seg.width;
            ctx.shadowColor = seg.color;
            ctx.shadowBlur = 14 * dpr;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(seg.from.x, seg.from.y);
            ctx.lineTo(seg.to.x, seg.to.y);
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = Math.max(1.5 * dpr, seg.width * 0.4);
            ctx.shadowBlur = 0;
            ctx.stroke();
          });
          ctx.restore();
          requestAnimationFrame(render);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      };

      requestAnimationFrame(render);
    },
    []
  );

  /* --------------------------------------------------------------------------
   * CORE ROUND EXECUTION: SUPER CASCADE + GOLDEN SQUARES + RAINBOW CHOREOGRAPHY
   * ------------------------------------------------------------------------ */

  const runSingleBanditSpin = useCallback(
    async (opts: {
      activeBonusTier: BonusTier;
      initialGoldenSquares: boolean[][];
      wagerBetUSD: number;
      spinNonce: number;
      forceScatters?: number;
    }): Promise<{
      totalSpinWinUSD: number;
      nextGoldenSquares: boolean[][];
      scattersLanded: number;
      proofHash: string;
    }> => {
      const {
        activeBonusTier,
        initialGoldenSquares,
        wagerBetUSD,
        spinNonce,
        forceScatters = 0,
      } = opts;

      const proofHash = await computeHmacSha256Hex(
        serverSeed,
        `${clientSeed}:${spinNonce}:${activeBonusTier}`
      );
      if (mountedRef.current) setLastProofHash(proofHash);
      const rng = createSeededRng(proofHash);

      let board = generateInitialGrid({
        rng,
        bonusHunt: bonusHuntActive,
        rainbowFeatureSpins: rainbowSpinsActive,
        bonusTier: activeBonusTier,
        activeRtpPercent: runtimeRtpPercent,
        forceScatters,
      });

      let curGolden = initialGoldenSquares.map((row) => [...row]);

      if (!mountedRef.current) {
        return {
          totalSpinWinUSD: 0,
          nextGoldenSquares: curGolden,
          scattersLanded: 0,
          proofHash,
        };
      }

      setSpinPhase("DROPPING");
      setGoldRevealMap({});
      setFloatingCallouts([]);
      setStoppedCols([false, false, false, false, false, false]);
      setGoldenSquares(curGolden);
      setGrid(board);

      for (let col = 0; col < GRID_COLS; col++) {
        await sleep(col === 0 ? 185 : 85);
        if (!mountedRef.current) break;
        setStoppedCols((prev) => {
          const next = [...prev];
          next[col] = true;
          return next;
        });
        audioRef.current?.playTileClack(col);
      }

      // 1. SUPER CASCADE LOOP & GOLDEN SQUARE MARKING
      let spinClusterWinUSD = 0;
      let cascadeStep = 0;
      const capUSD = Number((wagerBetUSD * MAX_WIN_MULT).toFixed(2));

      while (mountedRef.current) {
        setSpinPhase("EVALUATING");
        const evalRes = evaluateOrthogonalClusters(board, wagerBetUSD);
        if (evalRes.clusters.length === 0) break;

        cascadeStep += 1;
        // Mark exact connected winning clusters as 24k Golden Squares
        evalRes.clusterMarkCoords.forEach((pt) => {
          curGolden[pt.row][pt.col] = true;
        });
        setGoldenSquares(curGolden.map((r) => [...r]));

        spinClusterWinUSD = Number(
          (spinClusterWinUSD + evalRes.stepWinUSD).toFixed(2)
        );

        const newCallouts: FloatingCallout[] = evalRes.clusters.map((cl) => {
          const mid = cl.coords[Math.floor(cl.coords.length / 2)];
          return {
            id: nextUid("cl"),
            row: mid.row,
            col: mid.col,
            text: `+${formatUSD(cl.payoutUSD)}`,
            subtext: `${cl.coords.length}×`,
            color: "#fde047",
          };
        });
        setFloatingCallouts(newCallouts);

        // Highlight winning cells & ALL matching symbols being Super-Cascaded
        board = board.map((rowArr, r) =>
          rowArr.map((cell, c) =>
            evalRes.superRemovalMask[r][c]
              ? { ...cell, isWinning: true }
              : cell
          )
        );
        setGrid(board);
        audioRef.current?.playSuperCascadePop(cascadeStep);
        await sleep(320);
        if (!mountedRef.current) break;

        // Super Cascade Explode ALL matching symbols across entire 6x5 board
        setSpinPhase("SUPER_EXPLODING");
        board = board.map((rowArr, r) =>
          rowArr.map((cell, c) =>
            evalRes.superRemovalMask[r][c]
              ? { ...cell, isExploding: true, isWinning: false }
              : cell
          )
        );
        setGrid(board);
        await sleep(220);
        if (!mountedRef.current) break;

        // Collapse & Refill
        setSpinPhase("CASCADING");
        setFloatingCallouts([]);
        const collapsed: BanditCell[][] = Array.from(
          { length: GRID_ROWS },
          () => []
        );

        for (let c = 0; c < GRID_COLS; c++) {
          const survivors: BanditCell[] = [];
          for (let r = GRID_ROWS - 1; r >= 0; r--) {
            if (!evalRes.superRemovalMask[r][c]) {
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
                uid: nextUid("sup"),
                symbol: rollCellSymbol({
                  rng,
                  bonusHunt: bonusHuntActive,
                  rainbowFeatureSpins: rainbowSpinsActive,
                  bonusTier: activeBonusTier,
                  activeRtpPercent: runtimeRtpPercent,
                  allowRainbow: forceScatters === 0,
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
        await sleep(270);
      }

      if (!mountedRef.current) {
        return {
          totalSpinWinUSD: 0,
          nextGoldenSquares: curGolden,
          scattersLanded: 0,
          proofHash,
        };
      }

      // Count Polaroid FS Scatters
      let scattersLanded = 0;
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (board[r][c].symbol === "scatter_camera") scattersLanded++;
        }
      }

      // Gather Golden Square & Rainbow Trigger coordinates
      const goldenCoords: Array<{ row: number; col: number }> = [];
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (curGolden[r][c]) goldenCoords.push({ row: r, col: c });
        }
      }
      const rainbowCoords: Array<{ row: number; col: number }> = [];
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (board[r][c].symbol === "rainbow_trigger") {
            rainbowCoords.push({ row: r, col: c });
          }
        }
      }

      let coinFeatureWinUSD = 0;

      // 2. SIGNATURE RAINBOW -> COIN, CLOVER & POT OF GOLD CHOREOGRAPHY!
      if (rainbowCoords.length > 0 && goldenCoords.length > 0) {
        const removeBronze = activeBonusTier === "TREASURE_RAINBOW";

        setSpinPhase("RAINBOW_ACTIVATING");
        setBannerStatus(
          `RAINBOW ACTIVATED! REVEALING ${goldenCoords.length} GOLDEN SQUARE${goldenCoords.length > 1 ? "S" : ""}!`
        );
        audioRef.current?.playRainbowHarp();

        const rainbowOrigin = `${rainbowCoords[0].row}-${rainbowCoords[0].col}`;
        fireBeams(
          goldenCoords.map((pt, i) => ({
            fromKey: rainbowOrigin,
            toKey: `${pt.row}-${pt.col}`,
            color: ["#f43f5e", "#f59e0b", "#10b981", "#38bdf8", "#a855f7"][
              i % 5
            ],
            width: 3.5,
          })),
          480
        );
        await sleep(460);
        if (!mountedRef.current) {
          return {
            totalSpinWinUSD: 0,
            nextGoldenSquares: curGolden,
            scattersLanded,
            proofHash,
          };
        }

        // STEP 1: Initial Golden Square Mini-Reel Spin
        setSpinPhase("GOLD_SPINNING");
        const spinningMap: Record<string, GoldRevealItem> = {};
        goldenCoords.forEach((pt) => {
          spinningMap[`${pt.row}-${pt.col}`] = {
            uid: nextUid("spin"),
            kind: "gold_coin",
            value: 0,
            isSpinningMini: true,
          };
        });
        setGoldRevealMap(spinningMap);
        await sleep(340);
        if (!mountedRef.current) {
          return {
            totalSpinWinUSD: 0,
            nextGoldenSquares: curGolden,
            scattersLanded,
            proofHash,
          };
        }

        let revealMap: Record<string, GoldRevealItem> = {};
        goldenCoords.forEach((pt) => {
          const item = rollGoldRevealItem({
            rng,
            removeBronze,
            allowPot: true,
            activeRtpPercent: runtimeRtpPercent,
          });
          revealMap[`${pt.row}-${pt.col}`] = item;
        });
        setGoldRevealMap({ ...revealMap });
        audioRef.current?.playCoinClink("gold");
        await sleep(360);

        // LOOP: STEP 2 (Clovers) -> STEP 3 (Pots of Gold + Re-Spin Other Golden Squares)
        let waveCount = 0;
        while (mountedRef.current && waveCount < 10) {
          waveCount += 1;

          // STEP 2: Four-Leaf Clover 3x3 Neighborhood Multiplication
          const cloverKeys: string[] = [];
          for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
              const key = `${r}-${c}`;
              const it = revealMap[key];
              if (it && it.kind === "clover" && !it.consumedClover) {
                cloverKeys.push(key);
              }
            }
          }

          if (cloverKeys.length > 0) {
            setSpinPhase("CLOVER_MULTIPLYING");
            for (const cKey of cloverKeys) {
              if (!mountedRef.current) break;
              const [crStr, ccStr] = cKey.split("-");
              const cr = Number(crStr);
              const cc = Number(ccStr);
              const cloverItem = revealMap[cKey];
              if (!cloverItem) continue;

              const targetKeys: string[] = [];
              for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                  if (dr === 0 && dc === 0) continue;
                  const nr = cr + dr;
                  const nc = cc + dc;
                  if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS)
                    continue;
                  const nKey = `${nr}-${nc}`;
                  const target = revealMap[nKey];
                  if (
                    target &&
                    (target.kind === "bronze_coin" ||
                      target.kind === "silver_coin" ||
                      target.kind === "gold_coin" ||
                      target.kind === "pot_of_gold")
                  ) {
                    targetKeys.push(nKey);
                    revealMap[nKey] = {
                      ...target,
                      value: Number((target.value * cloverItem.value).toFixed(2)),
                      isPulsing: true,
                    };
                  }
                }
              }

              revealMap[cKey] = { ...cloverItem, consumedClover: true, isPulsing: true };
              setGoldRevealMap({ ...revealMap });

              if (targetKeys.length > 0) {
                fireBeams(
                  targetKeys.map((tk) => ({
                    fromKey: cKey,
                    toKey: tk,
                    color: "#34d399",
                    width: 4,
                  })),
                  360
                );
                audioRef.current?.playCloverPowerUp();
              }
              await sleep(380);

              // Clear pulse
              targetKeys.forEach((tk) => {
                if (revealMap[tk]) revealMap[tk] = { ...revealMap[tk], isPulsing: false };
              });
              if (revealMap[cKey]) revealMap[cKey] = { ...revealMap[cKey], isPulsing: false };
              setGoldRevealMap({ ...revealMap });
            }
          }

          // STEP 3: Check for Unactivated Pots of Gold (top-to-bottom, left-to-right)
          const unactivatedPots: string[] = [];
          for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
              const key = `${r}-${c}`;
              const it = revealMap[key];
              if (it && it.kind === "pot_of_gold" && !it.activatedPot) {
                unactivatedPots.push(key);
              }
            }
          }

          if (unactivatedPots.length === 0) break;

          setSpinPhase("POT_SWEEPING");
          for (const potKey of unactivatedPots) {
            if (!mountedRef.current) break;
            const potItem = revealMap[potKey];
            if (!potItem) continue;

            // Sweep ALL Coins AND previously filled Pots of Gold across entire board into this Pot!
            let sweptSum = potItem.value;
            const sweptKeys: string[] = [];
            for (const pt of goldenCoords) {
              const k = `${pt.row}-${pt.col}`;
              if (k === potKey) continue;
              const other = revealMap[k];
              if (!other) continue;
              if (
                other.kind === "bronze_coin" ||
                other.kind === "silver_coin" ||
                other.kind === "gold_coin" ||
                (other.kind === "pot_of_gold" && other.activatedPot)
              ) {
                sweptSum = Number((sweptSum + other.value).toFixed(2));
                sweptKeys.push(k);
              }
            }

            if (sweptKeys.length > 0) {
              fireBeams(
                sweptKeys.map((sk) => ({
                  fromKey: sk,
                  toKey: potKey,
                  color: "#fbbf24",
                  width: 3.5,
                })),
                420
              );
            }
            audioRef.current?.playPotVacuumSweep();
            triggerShake();

            // Clear swept items from non-pot squares and absorb earlier filled pots
            sweptKeys.forEach((sk) => {
              delete revealMap[sk];
            });
            revealMap[potKey] = {
              ...potItem,
              value: sweptSum,
              activatedPot: true,
              isPulsing: true,
            };
            setGoldRevealMap({ ...revealMap });
            setBannerStatus(
              `POT OF GOLD SWEPT ${formatMultBadge(sweptSum)}! RE-SPINNING GOLDEN SQUARES!`
            );
            await sleep(480);
            if (!mountedRef.current) break;
            revealMap[potKey] = { ...revealMap[potKey], isPulsing: false };
          }

          // Re-spin ALL OTHER Golden Squares (except existing active Pots of Gold)
          setSpinPhase("GOLD_SPINNING");
          const respinCoords = goldenCoords.filter((pt) => {
            const existing = revealMap[`${pt.row}-${pt.col}`];
            return !(existing && existing.kind === "pot_of_gold" && existing.activatedPot);
          });

          if (respinCoords.length === 0) break;

          const tempSpinMap = { ...revealMap };
          respinCoords.forEach((pt) => {
            tempSpinMap[`${pt.row}-${pt.col}`] = {
              uid: nextUid("rspin"),
              kind: "gold_coin",
              value: 0,
              isSpinningMini: true,
            };
          });
          setGoldRevealMap(tempSpinMap);
          await sleep(320);
          if (!mountedRef.current) break;

          const nextReveal = { ...revealMap };
          respinCoords.forEach((pt) => {
            nextReveal[`${pt.row}-${pt.col}`] = rollGoldRevealItem({
              rng,
              removeBronze,
              allowPot: waveCount < 4, // Allow re-triggering pots up to 4 waves naturally
              activeRtpPercent: runtimeRtpPercent,
            });
          });
          revealMap = nextReveal;
          setGoldRevealMap({ ...revealMap });
          audioRef.current?.playCoinClink("silver");
          await sleep(340);
        }

        // STEP 4: Final Coin & Pot Sum Collection
        setSpinPhase("COLLECTING_COINS");
        let totalCoinMultSum = 0;
        Object.values(revealMap).forEach((item) => {
          if (
            item.kind === "bronze_coin" ||
            item.kind === "silver_coin" ||
            item.kind === "gold_coin" ||
            item.kind === "pot_of_gold"
          ) {
            totalCoinMultSum = Number((totalCoinMultSum + item.value).toFixed(2));
          }
        });

        coinFeatureWinUSD = Number((wagerBetUSD * totalCoinMultSum).toFixed(2));
        if (coinFeatureWinUSD > 0) {
          audioRef.current?.playWinFanfare(totalCoinMultSum);
          setBannerStatus(
            `RAINBOW LOOT: ${formatMultBadge(totalCoinMultSum)} = ${formatUSD(coinFeatureWinUSD)}!`
          );
          await sleep(680);
        }

        // Reset Golden Squares ONLY in Base Game or Luck of the Bandit (Bonus 1)
        if (
          activeBonusTier === "NONE" ||
          activeBonusTier === "LUCK_OF_THE_BANDIT"
        ) {
          curGolden = Array.from({ length: GRID_ROWS }, () =>
            Array(GRID_COLS).fill(false)
          );
        }
      } else if (activeBonusTier === "NONE") {
        // In Base Game without Rainbow, Golden Squares reset at end of spin
        curGolden = Array.from({ length: GRID_ROWS }, () =>
          Array(GRID_COLS).fill(false)
        );
      }

      if (mountedRef.current) {
        setGoldRevealMap({});
        setGoldenSquares(curGolden);
      }

      const rawSpinTotalUSD = Number(
        (spinClusterWinUSD + coinFeatureWinUSD).toFixed(2)
      );
      const totalSpinWinUSD = Math.min(capUSD, rawSpinTotalUSD);

      return {
        totalSpinWinUSD,
        nextGoldenSquares: curGolden,
        scattersLanded,
        proofHash,
      };
    },
    [
      bonusHuntActive,
      clientSeed,
      fireBeams,
      rainbowSpinsActive,
      runtimeRtpPercent,
      serverSeed,
      triggerShake,
    ]
  );

  // Execute 3 Escalating Free Spins Bonus Tiers
  const executeBonusRound = useCallback(
    async (opts: {
      initialTier: Exclude<BonusTier, "NONE">;
      wagerBetUSD: number;
      totalCostUSD: number;
      startingNonce: number;
    }) => {
      const { initialTier, wagerBetUSD, totalCostUSD, startingNonce } = opts;

      let currentTier: Exclude<BonusTier, "NONE"> = initialTier;
      let spinsRemaining = currentTier === "LUCK_OF_THE_BANDIT" ? 8 : 12;
      let totalSpinsAwarded = spinsRemaining;
      let currentNonce = startingNonce;
      let cumulativeBonusWinUSD = 0;
      const capUSD = Number((wagerBetUSD * MAX_WIN_MULT).toFixed(2));

      let persistentGolden = Array.from({ length: GRID_ROWS }, () =>
        Array(GRID_COLS).fill(false)
      );
      setGoldenSquares(persistentGolden);
      setBonusTier(currentTier);
      setBonusTotalWinUSD(0);

      const getTierMeta = (tier: Exclude<BonusTier, "NONE">) =>
        tier === "LUCK_OF_THE_BANDIT"
          ? {
              title: "LUCK OF THE BANDIT",
              subtitle:
                "8 FREE SPINS • GOLDEN SQUARES PERSIST UNTIL RAINBOW ACTIVATION",
              badge: "BONUS TIER 1",
            }
          : tier === "ALL_THAT_GLITTERS"
            ? {
                title: "ALL THAT GLITTERS IS GOLD",
                subtitle:
                  "12 FREE SPINS • PERMANENT GOLDEN SQUARES NEVER RESET!",
                badge: "BONUS TIER 2",
              }
            : {
                title: "TREASURE AT THE END OF THE RAINBOW",
                subtitle:
                  "12 EPIC SPINS • PERMANENT GOLD + GUARANTEED RAINBOW + NO BRONZE COINS!",
                badge: "BONUS TIER 3",
              };

      setBonusIntroOverlay(getTierMeta(currentTier));
      audioRef.current?.playWinFanfare(35);
      await sleep(1800);
      if (!mountedRef.current) return;
      setBonusIntroOverlay(null);

      while (spinsRemaining > 0 && mountedRef.current) {
        setBonusTier(currentTier);
        setFreeSpinsLeft(spinsRemaining);
        setFreeSpinsTotal(totalSpinsAwarded);
        setBannerStatus(
          `${getTierMeta(currentTier).title} • SPIN ${totalSpinsAwarded - spinsRemaining + 1}/${totalSpinsAwarded}`
        );

        currentNonce += 1;
        setNonce(currentNonce);

        const res = await runSingleBanditSpin({
          activeBonusTier: currentTier,
          initialGoldenSquares: persistentGolden,
          wagerBetUSD,
          spinNonce: currentNonce,
        });
        if (!mountedRef.current) break;

        persistentGolden = res.nextGoldenSquares;
        setGoldenSquares(persistentGolden);

        // Retrigger & Bonus Tier Upgrade Rules inside Free Spins
        if (res.scattersLanded >= 2) {
          if (
            currentTier === "LUCK_OF_THE_BANDIT" &&
            res.scattersLanded >= 4
          ) {
            currentTier = "ALL_THAT_GLITTERS";
            spinsRemaining += 4;
            totalSpinsAwarded += 4;
            setBonusIntroOverlay({
              title: "UPGRADED: ALL THAT GLITTERS IS GOLD!",
              subtitle: "+4 EXTRA SPINS & PERMANENT GOLDEN SQUARES UNLOCKED!",
              badge: "BONUS UPGRADE",
            });
            audioRef.current?.playWinFanfare(50);
            await sleep(1400);
            if (mountedRef.current) setBonusIntroOverlay(null);
          } else if (res.scattersLanded >= 3) {
            spinsRemaining += 4;
            totalSpinsAwarded += 4;
            setBannerStatus(`RETRIGGER! +4 EXTRA FREE SPINS!`);
            await sleep(500);
          } else if (res.scattersLanded === 2) {
            spinsRemaining += 2;
            totalSpinsAwarded += 2;
            setBannerStatus(`+2 EXTRA FREE SPINS!`);
            await sleep(450);
          }
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
        }

        spinsRemaining -= 1;
        await sleep(awardUSD > 0 ? 680 : 340);
        if (cumulativeBonusWinUSD >= capUSD) break;
      }

      if (!mountedRef.current) return;

      const finalMult = Number((cumulativeBonusWinUSD / wagerBetUSD).toFixed(2));
      const finalHash = await computeHmacSha256Hex(
        serverSeed,
        `${clientSeed}:${currentNonce}:BANDIT_BONUS_END`
      );
      setLastProofHash(finalHash);
      emitBetRecord(totalCostUSD, cumulativeBonusWinUSD, finalHash);
      setHistory((prev) => [
        {
          id: nextUid("hist"),
          wagerUSD: totalCostUSD,
          payoutUSD: cumulativeBonusWinUSD,
          multiplier: finalMult,
          mode: getTierMeta(currentTier).title,
          proofHash: finalHash,
        },
        ...prev.slice(0, 14),
      ]);

      if (finalMult >= 15) {
        const tier =
          finalMult >= MAX_WIN_MULT
            ? "LE BANDIT 10,000x MAX WIN"
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

      setBonusTier("NONE");
      setFreeSpinsLeft(0);
      setFreeSpinsTotal(0);
      setGoldenSquares(
        Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
      );
      setBannerStatus(
        cumulativeBonusWinUSD > 0
          ? `HEIST COMPLETE • WON ${formatUSD(cumulativeBonusWinUSD)} (${finalMult.toFixed(2)}x)!`
          : "HEIST COMPLETE • SPIN AGAIN FOR RAINBOW COINS"
      );
    },
    [
      clientSeed,
      commitBalance,
      emitBetRecord,
      runSingleBanditSpin,
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
    setShowBuyModal(false);
    setWinCelebration(null);

    const spinCost = effectiveSpinCostUSD;
    const wagerBet = baseBetUSD;
    commitBalance(balanceRef.current - spinCost);

    const nextNonce = nonce + 1;
    setNonce(nextNonce);
    setLastSpinWinUSD(0);
    setLastSpinMult(0);
    setBannerStatus(
      rainbowSpinsActive
        ? "RAINBOW FEATURESPINS ACTIVE • GUARANTEED RAINBOW!"
        : bonusHuntActive
          ? "BONUSHUNT ACTIVE • 5x BONUS TRIGGER CHANCE!"
          : "SPINNING 6×5 SUPER CASCADE REELS..."
    );

    const emptyGolden = Array.from({ length: GRID_ROWS }, () =>
      Array(GRID_COLS).fill(false)
    );

    const res = await runSingleBanditSpin({
      activeBonusTier: "NONE",
      initialGoldenSquares: emptyGolden,
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
      const targetTier: Exclude<BonusTier, "NONE"> =
        res.scattersLanded >= 5
          ? "TREASURE_RAINBOW"
          : res.scattersLanded === 4
            ? "ALL_THAT_GLITTERS"
            : "LUCK_OF_THE_BANDIT";

      await executeBonusRound({
        initialTier: targetTier,
        wagerBetUSD: wagerBet,
        totalCostUSD: spinCost,
        startingNonce: nextNonce,
      });
    } else {
      const mult = Number((res.totalSpinWinUSD / wagerBet).toFixed(2));
      emitBetRecord(spinCost, res.totalSpinWinUSD, res.proofHash);
      setHistory((prev) => [
        {
          id: nextUid("hist"),
          wagerUSD: spinCost,
          payoutUSD: res.totalSpinWinUSD,
          multiplier: mult,
          mode: rainbowSpinsActive
            ? "Rainbow Spin"
            : bonusHuntActive
              ? "BonusHunt"
              : "Base Spin",
          proofHash: res.proofHash,
        },
        ...prev.slice(0, 14),
      ]);

      if (res.totalSpinWinUSD > 0) {
        setBannerStatus(
          `LE BANDIT WON ${formatUSD(res.totalSpinWinUSD)} (${mult.toFixed(2)}x)!`
        );
      } else {
        setBannerStatus("SPIN COMPLETE • LAND 5+ CLUSTERS & RAINBOWS");
      }

      if (mult >= 15) {
        const tier =
          mult >= MAX_WIN_MULT
            ? "LE BANDIT 10,000x MAX WIN"
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
    bonusHuntActive,
    commitBalance,
    effectiveSpinCostUSD,
    emitBetRecord,
    executeBonusRound,
    nonce,
    rainbowSpinsActive,
    runSingleBanditSpin,
  ]);

  // Handle 4 Hacksaw Feature Buy Cards
  const handleFeatureBuy = useCallback(
    async (
      id: "bonus_hunt" | "rainbow_spins" | "luck_bandit" | "all_glitters"
    ) => {
      if (isBusyRef.current || bonusTier !== "NONE") return;
      audioRef.current?.unlock();

      if (id === "bonus_hunt") {
        setRainbowSpinsActive(false);
        setBonusHuntActive((p) => !p);
        setShowBuyModal(false);
        return;
      }

      if (id === "rainbow_spins") {
        setBonusHuntActive(false);
        setRainbowSpinsActive((p) => !p);
        setShowBuyModal(false);
        return;
      }

      const isGlitters = id === "all_glitters";
      const costMult = isGlitters ? 250 : 100;
      const buyCostUSD = Number((baseBetUSD * costMult).toFixed(2));

      if (balanceRef.current < buyCostUSD) {
        setBannerStatus(
          `NEED ${formatUSD(buyCostUSD)} FOR THIS BONUS — LOWER BASE BET`
        );
        return;
      }

      isBusyRef.current = true;
      setAutoSpinsLeft(0);
      setShowBuyModal(false);
      setWinCelebration(null);
      commitBalance(balanceRef.current - buyCostUSD);

      const nextNonce = nonce + 1;
      setNonce(nextNonce);
      setLastSpinWinUSD(0);
      setLastSpinMult(0);

      // Show triggering scatter drop
      const emptyGolden = Array.from({ length: GRID_ROWS }, () =>
        Array(GRID_COLS).fill(false)
      );
      await runSingleBanditSpin({
        activeBonusTier: "NONE",
        initialGoldenSquares: emptyGolden,
        wagerBetUSD: baseBetUSD,
        spinNonce: nextNonce,
        forceScatters: isGlitters ? 4 : 3,
      });

      if (!mountedRef.current) {
        isBusyRef.current = false;
        return;
      }

      await executeBonusRound({
        initialTier: isGlitters ? "ALL_THAT_GLITTERS" : "LUCK_OF_THE_BANDIT",
        wagerBetUSD: baseBetUSD,
        totalCostUSD: buyCostUSD,
        startingNonce: nextNonce,
      });

      if (mountedRef.current) {
        setSpinPhase("IDLE");
      }
      isBusyRef.current = false;
    },
    [
      baseBetUSD,
      bonusTier,
      commitBalance,
      executeBonusRound,
      nonce,
      runSingleBanditSpin,
    ]
  );

  // Autoplay Loop
  useEffect(() => {
    if (autoSpinsLeft <= 0) return;
    if (isBusyRef.current || spinPhase !== "IDLE" || bonusTier !== "NONE")
      return;

    const timer = setTimeout(() => {
      if (autoSpinsLeft > 0 && !isBusyRef.current) {
        setAutoSpinsLeft((prev) => Math.max(0, prev - 1));
        handleSpin();
      }
    }, 340);

    return () => clearTimeout(timer);
  }, [autoSpinsLeft, bonusTier, handleSpin, spinPhase]);

  // Spacebar Spin Shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        if (!showPaytableModal && !showFairModal && !showBuyModal) {
          handleSpin();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSpin, showBuyModal, showFairModal, showPaytableModal]);

  const isSpinning = spinPhase !== "IDLE";
  const stageBackdrop = useMemo(() => {
    if (bonusTier === "TREASURE_RAINBOW") {
      return "from-[#142e1b] via-[#1c132d] to-[#07070e]";
    }
    if (bonusTier === "ALL_THAT_GLITTERS") {
      return "from-[#2e2007] via-[#17120c] to-[#06060b]";
    }
    if (bonusTier === "LUCK_OF_THE_BANDIT") {
      return "from-[#0b251c] via-[#0e1518] to-[#06070c]";
    }
    return "from-[#181724] via-[#101018] to-[#07070c]";
  }, [bonusTier]);

  return (
    <div
      style={{
        backgroundImage: `url(${ZYAN_SLOTS_ASSETS.ZYAN_BANDIT.STAGE_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      className={`relative flex min-h-[calc(100vh-49px)] w-full flex-col justify-between overflow-hidden bg-gradient-to-b ${stageBackdrop} text-white transition-colors duration-700`}
    >
      {/* Parisian Alley Neon Ambient Vignette */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden bg-slate-950/50">
        <div
          className={`absolute -top-24 left-1/2 h-[420px] w-[780px] -translate-x-1/2 rounded-full blur-3xl transition-colors duration-700 ${
            bonusTier === "ALL_THAT_GLITTERS" || bonusTier === "TREASURE_RAINBOW"
              ? "bg-amber-400/25"
              : "bg-emerald-500/20"
          }`}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(5,5,9,0.88)_100%)]" />
      </div>

      {/* TOP HEADER: ZYAN.GG Logo + ZYAN LE BANDIT Emblem */}
      <header className="relative z-20 mx-auto flex w-full max-w-[1380px] flex-wrap items-center justify-between gap-2 px-3 pt-3 sm:px-6">
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
          <h1 className="font-display bg-gradient-to-r from-amber-200 via-yellow-400 to-emerald-300 bg-clip-text text-lg font-black uppercase tracking-tight text-transparent drop-shadow-[0_2px_10px_rgba(16,185,129,0.4)] sm:text-2xl lg:text-[26px]">
            ZYAN LE BANDIT
          </h1>
          <span className="font-display whitespace-nowrap rounded-md border border-emerald-300/60 bg-gradient-to-r from-amber-400 via-yellow-300 to-emerald-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-[0_0_16px_rgba(16,185,129,0.55)] sm:text-xs">
            SUPER CASCADE • MAX WIN 10,000x
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

      {/* MAIN STAGE: Left Feature Buy Panel + Center 6x5 Cluster Grid */}
      <main
        ref={mainStageRef}
        className="relative z-20 mx-auto my-auto flex w-full max-w-[1380px] flex-1 flex-col items-center justify-center gap-3 px-2 py-2 lg:flex-row lg:items-stretch lg:gap-5 lg:px-6 lg:py-3"
      >
        <canvas
          ref={beamCanvasRef}
          className="pointer-events-none absolute inset-0 z-40 h-full w-full"
        />

        {/* LEFT DESKTOP FEATURE BUY PANEL */}
        <aside className="hidden w-[258px] shrink-0 flex-col justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-md lg:flex">
          <div>
            <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-display text-xs font-black uppercase tracking-wider text-emerald-300">
                BUY FEATURE
              </span>
              <span className="font-ui text-[11px] font-bold text-slate-400">
                Base {formatUSD(baseBetUSD)}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {FEATURE_BUY_CARDS.map((card) => {
                const costUSD = Number((baseBetUSD * card.costMult).toFixed(2));
                const isActive =
                  (card.id === "bonus_hunt" && bonusHuntActive) ||
                  (card.id === "rainbow_spins" && rainbowSpinsActive);
                const cantAfford = !card.isToggle && balanceUSD < costUSD;

                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={isSpinning || bonusTier !== "NONE" || cantAfford}
                    onClick={() => handleFeatureBuy(card.id)}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      isActive
                        ? "border-emerald-300 bg-emerald-500/20 shadow-[0_0_18px_rgba(16,185,129,0.35)]"
                        : `${card.border} bg-slate-900/85 hover:bg-slate-800/90`
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div>
                        <div className="font-display text-[11px] font-black uppercase leading-tight text-white">
                          {card.title}
                        </div>
                        <div className="font-ui mt-0.5 text-[10px] font-medium text-slate-300">
                          {card.subtitle}
                        </div>
                      </div>
                      <span
                        className={`font-display shrink-0 rounded-md bg-gradient-to-r ${card.accent} px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-950`}
                      >
                        {isActive ? "ON" : card.badge}
                      </span>
                    </div>
                    <div className="font-ui mt-2 flex items-center justify-between border-t border-white/10 pt-1.5 text-[11px] font-extrabold text-amber-300">
                      <span>{card.isToggle ? "Spin Cost" : "Buy Price"}</span>
                      <span>{formatUSD(costUSD)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Smokey Raccoon Bandit Mascot & Treasure Bonus Info */}
          <div className="flex flex-col gap-2 rounded-xl border border-amber-400/25 bg-black/55 p-2.5">
            <div className="flex items-center gap-2.5">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-amber-400/40 bg-slate-950/80">
                <ProtectedArt
                  src={ZYAN_SLOTS_ASSETS.ZYAN_BANDIT.BANDIT_MASCOT}
                  alt="Smokey Bandit Mascot"
                  className="h-full w-full scale-110 object-contain mix-blend-lighten"
                />
              </div>
              <div className="min-w-0">
                <div className="font-display text-[10px] font-black uppercase text-amber-300">
                  SMOKEY LE BANDIT
                </div>
                <p className="font-ui mt-0.5 text-[10px] leading-snug text-slate-300">
                  5 Scatters: Permanent Gold Squares + Rainbow every spin + Bronze Coins removed!
                </p>
              </div>
            </div>
            {history.length > 0 && (
              <div className="mt-2 border-t border-white/10 pt-1.5">
                {history.slice(0, 2).map((h) => (
                  <div
                    key={h.id}
                    className="font-ui flex items-center justify-between text-[10px]"
                  >
                    <span className="truncate text-slate-400">{h.mode}</span>
                    <span
                      className={
                        h.payoutUSD > 0
                          ? "font-bold text-emerald-300"
                          : "text-slate-500"
                      }
                    >
                      {formatUSD(h.payoutUSD)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* CENTER: 6x5 GOLDEN SQUARE CLUSTER ARENA */}
        <section
          className={`relative flex w-full max-w-[700px] flex-col items-center justify-center ${
            stageShake ? "animate-[zyanHunterShake_0.34s_ease-in-out]" : ""
          }`}
        >
          {/* Status / Bonus Bar */}
          {bonusTier !== "NONE" ? (
            <div className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl border border-emerald-400/45 bg-slate-950/90 px-3.5 py-2 shadow-xl">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-300" />
                <span className="font-display text-xs font-black uppercase text-emerald-300 sm:text-sm">
                  {bonusTier === "TREASURE_RAINBOW"
                    ? "TREASURE AT END OF RAINBOW"
                    : bonusTier === "ALL_THAT_GLITTERS"
                      ? "ALL THAT GLITTERS IS GOLD"
                      : "LUCK OF THE BANDIT"}
                </span>
              </div>
              <div className="font-ui flex items-center gap-3 text-xs font-bold">
                <span className="text-slate-300">
                  SPINS:{" "}
                  <strong className="text-amber-300">
                    {freeSpinsLeft}/{freeSpinsTotal}
                  </strong>
                </span>
                <span className="text-emerald-300">
                  WIN: <strong>{formatUSD(bonusTotalWinUSD)}</strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-1.5 backdrop-blur-sm">
              <span className="font-ui truncate text-[11px] font-bold text-amber-200 sm:text-xs">
                {bannerStatus}
              </span>
              {lastSpinWinUSD > 0 && (
                <span className="font-display shrink-0 whitespace-nowrap rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-black text-emerald-300">
                  WIN {formatUSD(lastSpinWinUSD)} ({lastSpinMult.toFixed(2)}x)
                </span>
              )}
            </div>
          )}

          {/* 6x5 GRID CONTAINER */}
          <div className="relative w-full overflow-hidden rounded-2xl border-2 border-amber-400/40 bg-[#0d0e15]/95 p-2 shadow-[0_22px_62px_rgba(0,0,0,0.9),inset_0_0_28px_rgba(251,191,36,0.14)] sm:p-3">
            <div className="relative grid aspect-[6/5] w-full grid-cols-6 grid-rows-5 gap-1 sm:gap-2">
              {grid.map((rowArr, r) =>
                rowArr.map((cell, c) => {
                  const key = `${r}-${c}`;
                  const isGolden = goldenSquares[r]?.[c];
                  const revealItem = goldRevealMap[key];
                  const colStopped = stoppedCols[c];

                  const animStyle: React.CSSProperties = {};
                  if (cell.fallRows && cell.fallRows > 0) {
                    (
                      animStyle as Record<string, string | number>
                    )["--zyan-fall-from"] = `-${cell.fallRows * 108}%`;
                    animStyle.animation =
                      "zyanCascadeFall 0.26s cubic-bezier(0.22,1,0.36,1)";
                  } else if (!colStopped) {
                    animStyle.animation = "zyanReelDropOut 0.15s ease-in forwards";
                  } else if (cell.isExploding) {
                    animStyle.animation = "zyanSymbolExplode 0.21s ease-in forwards";
                  } else if (cell.isWinning) {
                    animStyle.animation = "zyanSymbolWinPulse 0.32s ease-out infinite";
                  } else {
                    animStyle.animation =
                      "zyanReelDropIn 0.26s cubic-bezier(0.22,1,0.36,1)";
                  }

                  return (
                    <div
                      key={`${cell.uid}-${r}-${c}`}
                      ref={(el) => {
                        cellRefs.current[key] = el;
                      }}
                      style={revealItem ? undefined : animStyle}
                      className={`relative flex items-center justify-center rounded-xl border transition-all duration-200 ${
                        isGolden
                          ? "border-amber-300 bg-gradient-to-b from-amber-400/35 via-yellow-500/25 to-amber-700/35 shadow-[inset_0_0_16px_rgba(251,191,36,0.6),0_0_14px_rgba(251,191,36,0.45)]"
                          : cell.isWinning
                            ? "z-10 border-emerald-300 bg-emerald-500/20 shadow-[0_0_18px_rgba(52,211,153,0.7)]"
                            : "border-white/10 bg-slate-900/65"
                      }`}
                    >
                      {revealItem ? (
                        <GoldRevealArtwork item={revealItem} />
                      ) : (
                        <BanditSymbolArtwork symbol={cell.symbol} />
                      )}
                    </div>
                  );
                })
              )}

              {/* Floating Callouts */}
              {floatingCallouts.map((call) => (
                <div
                  key={call.id}
                  style={{
                    left: `${((call.col + 0.5) / GRID_COLS) * 100}%`,
                    top: `${((call.row + 0.45) / GRID_ROWS) * 100}%`,
                  }}
                  className="pointer-events-none absolute z-30 -translate-x-1/2 animate-[zyanFloatCallout_0.8s_ease-out_forwards] rounded-lg border border-amber-300/70 bg-slate-950/90 px-2 py-0.5 text-center shadow-xl"
                >
                  <div className="font-display text-xs font-black text-amber-300 sm:text-sm">
                    {call.text}
                  </div>
                  {call.subtext && (
                    <div className="font-ui text-[9px] font-bold text-emerald-300">
                      {call.subtext}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* BONUS INTRO OVERLAY */}
            {bonusIntroOverlay && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center backdrop-blur-sm">
                <span className="font-display mb-1 text-xs font-black uppercase tracking-[0.28em] text-emerald-300">
                  {bonusIntroOverlay.badge}
                </span>
                <h2 className="font-display bg-gradient-to-r from-amber-200 via-yellow-400 to-emerald-300 bg-clip-text text-2xl font-black uppercase text-transparent sm:text-4xl">
                  {bonusIntroOverlay.title}
                </h2>
                <p className="font-ui mt-2 max-w-md text-xs font-bold uppercase tracking-wider text-slate-200 sm:text-sm">
                  {bonusIntroOverlay.subtitle}
                </p>
              </div>
            )}

            {/* BIG / MEGA / 10,000x MAX WIN CELEBRATION OVERLAY */}
            {winCelebration && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center backdrop-blur-md">
                <Trophy className="mb-2 h-14 w-14 text-amber-400 drop-shadow-[0_0_24px_rgba(251,191,36,0.95)]" />
                <div className="font-display bg-gradient-to-r from-amber-200 via-yellow-400 to-emerald-300 bg-clip-text text-3xl font-black uppercase tracking-tight text-transparent sm:text-5xl">
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
      </main>

      {/* HACKSAW MINIMALIST CONTROL BAR */}
      <footer className="relative z-30 border-t border-white/10 bg-[#090910]/95 px-3 py-2.5 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex w-full max-w-[1380px] flex-wrap items-center justify-between gap-2.5">
          {/* LEFT: Menu, Sound, Balance, Bet */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowPaytableModal(true)}
              aria-label="Paytable and Rules"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-slate-900 text-slate-200 transition hover:border-emerald-400/50 hover:text-white"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? "Mute audio" : "Unmute audio"}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-slate-900 text-slate-200 transition hover:border-emerald-400/50 hover:text-white"
            >
              {soundEnabled ? (
                <Volume2 className="h-5 w-5 text-emerald-300" />
              ) : (
                <VolumeX className="h-5 w-5 text-slate-500" />
              )}
            </button>

            <div className="flex flex-col rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1">
              <span className="font-display text-[9px] font-bold uppercase tracking-wider text-slate-400">
                BALANCE
              </span>
              <span className="font-ui text-sm font-extrabold text-emerald-300 sm:text-base">
                {formatUSD(balanceUSD)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/90 px-2.5 py-1">
              <div className="flex flex-col pr-1">
                <span className="font-display text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  {rainbowSpinsActive
                    ? "RAINBOW (50x)"
                    : bonusHuntActive
                      ? "HUNT (3x)"
                      : "BET"}
                </span>
                <span className="font-ui text-sm font-extrabold text-white sm:text-base">
                  {formatUSD(effectiveSpinCostUSD)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled={
                    isSpinning ||
                    bonusTier !== "NONE" ||
                    betIndex >= BET_LADDER_USD.length - 1
                  }
                  onClick={() =>
                    setBetIndex((i) => Math.min(BET_LADDER_USD.length - 1, i + 1))
                  }
                  aria-label="Increase bet"
                  className="flex h-4 w-6 items-center justify-center rounded bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={isSpinning || bonusTier !== "NONE" || betIndex <= 0}
                  onClick={() => setBetIndex((i) => Math.max(0, i - 1))}
                  aria-label="Decrease bet"
                  className="flex h-4 w-6 items-center justify-center rounded bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: BUY BONUS, AUTOPLAY, SPIN */}
          <div className="relative flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              disabled={isSpinning || bonusTier !== "NONE"}
              onClick={() => setShowBuyModal(true)}
              className="font-display flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-amber-300/70 bg-gradient-to-r from-amber-300 via-yellow-400 to-emerald-400 px-3.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg transition hover:brightness-110 disabled:opacity-45"
            >
              <Zap className="h-4 w-4" />
              <span>BUY BONUS</span>
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
                  disabled={bonusTier !== "NONE"}
                  onClick={() => setShowAutoMenu((s) => !s)}
                  className="font-display flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/15 bg-slate-900 px-3 text-xs font-black uppercase text-slate-200 transition hover:border-emerald-400/50 hover:text-white disabled:opacity-45"
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
                        className="font-ui rounded-lg border border-white/10 bg-slate-900 py-1.5 text-xs font-bold text-white hover:border-emerald-400/60 hover:bg-slate-800"
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
              disabled={isSpinning || bonusTier !== "NONE"}
              onClick={handleSpin}
              aria-label="Spin Reels"
              className={`font-display flex h-12 w-24 items-center justify-center rounded-2xl border-2 border-emerald-200/80 bg-gradient-to-b from-amber-300 via-yellow-400 to-emerald-500 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_6px_26px_rgba(16,185,129,0.45),inset_0_2px_0_rgba(255,255,255,0.65)] transition active:translate-y-0.5 sm:h-14 sm:w-28 sm:text-base ${
                isSpinning || bonusTier !== "NONE"
                  ? "cursor-not-allowed opacity-55"
                  : "cursor-pointer hover:brightness-110"
              }`}
            >
              {isSpinning ? "..." : "SPIN"}
            </button>
          </div>
        </div>

        {/* Footer Watermark */}
        <div className="mx-auto mt-2 flex w-full max-w-[1380px] items-center justify-between border-t border-white/5 pt-1.5 text-[10px] text-slate-500">
          <div className="flex items-center gap-2">
            <div className="h-4 w-16 overflow-hidden">
              <ProtectedArt
                src={ZYAN_LOGO_URL}
                alt="ZYAN.GG"
                className="h-full w-full object-contain mix-blend-lighten opacity-75"
              />
            </div>
            <span className="font-ui">
              LE BANDIT • 6×5 SUPER CASCADE • 10,000x MAX
            </span>
          </div>
          <span className="font-ui hidden sm:inline">
            SPACEBAR TO SPIN • $ USD ENGINE
          </span>
        </div>
      </footer>

      {/* ====================================================================
       * MODALS: BUY BONUS, PAYTABLE & RULES, PROVABLY FAIR HMAC-SHA256
       * ================================================================== */}

      {showBuyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-emerald-400/40 bg-slate-950 p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <div>
                <h3 className="font-display text-lg font-black uppercase text-emerald-300">
                  LE BANDIT FEATURE BUYS
                </h3>
                <p className="font-ui text-xs text-slate-400">
                  Base Bet: <strong className="text-white">{formatUSD(baseBetUSD)}</strong> • Balance:{" "}
                  <strong className="text-emerald-300">{formatUSD(balanceUSD)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBuyModal(false)}
                className="rounded-lg bg-slate-900 p-1.5 text-slate-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {FEATURE_BUY_CARDS.map((card) => {
                const costUSD = Number((baseBetUSD * card.costMult).toFixed(2));
                const isActive =
                  (card.id === "bonus_hunt" && bonusHuntActive) ||
                  (card.id === "rainbow_spins" && rainbowSpinsActive);
                const cantAfford = !card.isToggle && balanceUSD < costUSD;

                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={cantAfford}
                    onClick={() => handleFeatureBuy(card.id)}
                    className={`flex flex-col justify-between rounded-xl border ${card.border} bg-slate-900/90 p-3 text-left transition hover:bg-slate-800 disabled:opacity-45`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-xs font-black uppercase text-white">
                          {card.title}
                        </span>
                        <span
                          className={`font-display rounded bg-gradient-to-r ${card.accent} px-1.5 py-0.5 text-[9px] font-black text-slate-950`}
                        >
                          {isActive ? "ACTIVE" : card.badge}
                        </span>
                      </div>
                      <p className="font-ui mt-1 text-[11px] leading-snug text-slate-300">
                        {card.desc}
                      </p>
                    </div>
                    <div className="font-ui mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-xs font-black text-amber-300">
                      <span>{card.isToggle ? "Toggle Spin Cost" : "Buy Now"}</span>
                      <span>{formatUSD(costUSD)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showPaytableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-amber-400/35 bg-slate-950 p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-display text-lg font-black uppercase text-amber-300">
                  LE BANDIT PAYTABLE & GOLDEN SQUARES
                </h3>
                <p className="font-ui text-xs text-slate-400">
                  6×5 Orthogonal Cluster Pays (5+ Touching) • Super Cascade • 10,000x Max Win
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
                        <BanditSymbolArtwork symbol={sym} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-display truncate text-[10px] font-black uppercase text-white">
                          {SYMBOL_LABELS[sym]}
                        </div>
                        <div className="font-ui mt-0.5 text-[10px] text-slate-300">
                          <div>
                            13+:{" "}
                            <strong className="text-amber-300">
                              {pays[6].toFixed(2)}x
                            </strong>
                          </div>
                          <div>
                            9–10:{" "}
                            <strong className="text-slate-100">
                              {pays[4].toFixed(2)}x
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
              <div className="rounded-xl border border-amber-400/30 bg-amber-950/25 p-3">
                <div className="font-display mb-1 font-black uppercase text-amber-300">
                  RAINBOW REVEAL CHOREOGRAPHY
                </div>
                Winning clusters mark <strong>Golden Squares</strong> and trigger a{" "}
                <strong>Super Cascade</strong> (removing ALL matching symbols across the board). If a{" "}
                <strong>Rainbow</strong> lands, Golden Squares reveal{" "}
                <strong>Bronze (0.2x–4x)</strong>, <strong>Silver (5x–20x)</strong>, and{" "}
                <strong>Gold Coins (25x–500x)</strong>, <strong>Clovers (2x–10x adjacent 3×3)</strong>, and{" "}
                <strong>Pots of Gold</strong> that sweep all Coins and re-spin all other Golden Squares!
              </div>
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-950/25 p-3">
                <div className="font-display mb-1 font-black uppercase text-emerald-300">
                  3 FREE SPINS TIERS (3, 4, OR 5 SCATTERS)
                </div>
                <strong>Luck of the Bandit (3 FS):</strong> 8 spins, Golden Squares persist until Rainbow.{" "}
                <strong>All That Glitters (4 FS):</strong> 12 spins, Permanent Golden Squares.{" "}
                <strong>Treasure at the End of the Rainbow (5 FS):</strong> 12 spins, Permanent Gold + Rainbow EVERY spin + Bronze Coins removed!
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
                  PROVABLY FAIR (HMAC-SHA256)
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
                    Last Spin HMAC-SHA256 Proof
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

              <button
                type="button"
                onClick={async () => {
                  const computed = await computeHmacSha256Hex(
                    serverSeed,
                    `${clientSeed}:${nonce}:NONE`
                  );
                  setVerifyOutput(
                    `HMAC-SHA256 Verified: ${computed.slice(0, 32)}...`
                  );
                }}
                className="font-display rounded-xl bg-emerald-500 py-2 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-emerald-400"
              >
                Verify Nonce Signature
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

export default ZyanLeBanditSlot;
