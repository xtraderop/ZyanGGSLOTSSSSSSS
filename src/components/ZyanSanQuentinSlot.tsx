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
  Lock,
  Unlock,
  Zap,
  Skull,
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

export interface ZyanSanQuentinBetRecord {
  gameKey: "ZYAN_SAN_QUENTIN_XWAYS";
  gameName: "Zyan San Quentin xWays";
  wagerUSD: number;
  multiplier: number;
  payoutUSD: number;
  isWin: boolean;
  proofHash: string;
}

export interface ZyanSanQuentinSlotProps {
  externalBalanceUSD?: number;
  onBalanceChange?: (newBalanceUSD: number) => void;
  onRecordBet?: (bet: ZyanSanQuentinBetRecord) => void;
  activeRtpPercent?: number; // Default 96.5% (controlled silently by Admin Panel)
  username?: string;
}

export type InmateSymbolId =
  | "inmate_joe"
  | "inmate_bill"
  | "inmate_heinrich"
  | "inmate_luis"
  | "inmate_beefy";

export type LowItemSymbolId =
  | "item_soap"
  | "item_lighter"
  | "item_shiv"
  | "item_handcuffs"
  | "item_toilet_roll";

export type RegularSanQuentinSymbolId = LowItemSymbolId | InmateSymbolId;

export type MainCellSymbolId =
  | RegularSanQuentinSymbolId
  | "scatter_tower"
  | "split_wild"
  | "wild_badge"
  | "jumping_wild";

type EnhancerContent =
  | { kind: "locked" }
  | { kind: "inmate"; symbol: InmateSymbolId }
  | { kind: "wild" }
  | { kind: "xways"; revealedSymbol: RegularSanQuentinSymbolId; stackSize: 4 }
  | { kind: "razor_split" }
  | { kind: "setup_spins"; spins: number };

interface JumpingWildState {
  id: string;
  col: number;
  row: number;
  multiplier: number; // 1 up to 512
  justDoubled?: boolean;
}

interface MainCell {
  uid: string;
  symbol: MainCellSymbolId;
  col: number;
  row: number;
  splitCount: number; // 1, 2, 4, or 8 depending on Split Wild + Razor Splits
  jumpingWildMult?: number;
  isTempExtraJumpWild?: boolean;
  isScatterTurnedWild?: boolean;
  isWinning?: boolean;
}

type SpinPhase =
  | "IDLE"
  | "SPINNING"
  | "ENHANCING"
  | "EVALUATING"
  | "LOCKDOWN_SETUP";

type LockdownTier = 1 | 2 | 3;

interface LockdownState {
  active: boolean;
  tier: LockdownTier; // 1 = 1 JW (3 reels), 2 = 2 JW (4 reels), 3 = 3 JW (5 reels)
  unlockedReels: boolean[]; // length 5
  spinsLeft: number;
  totalSpinsAwarded: number;
  spinsPlayed: number;
  totalWinUSD: number;
  specialInmate: InmateSymbolId;
  specialInmateMult: number; // 4x to 15x
  jumpingWilds: JumpingWildState[];
  setupPhaseLabel?: string;
}

interface FloatingCallout {
  id: string;
  col: number;
  row: number;
  text: string;
  subtext?: string;
  tone: "gold" | "crimson" | "cyan";
}

interface SpinHistoryEntry {
  id: string;
  wagerUSD: number;
  payoutUSD: number;
  multiplier: number;
  mode: string;
  ways: number;
  proofHash: string;
}

/* ============================================================================
 * 2. PAYTABLE, CONSTANTS & SYMBOL METADATA
 * ========================================================================== */

const REEL_COUNT = 5;
const MAIN_ROWS = 3;
const MAX_WIN_MULT = 150000;
const MAX_JUMPING_WILD_MULT = 512;

// [3-of-a-kind, 4-of-a-kind, 5-of-a-kind] multipliers of Base Bet
const PAYTABLE: Record<RegularSanQuentinSymbolId, [number, number, number]> = {
  item_soap: [0.15, 0.4, 1.5],
  item_lighter: [0.15, 0.4, 1.6],
  item_shiv: [0.15, 0.4, 1.75],
  item_handcuffs: [0.15, 0.4, 1.85],
  item_toilet_roll: [0.15, 0.4, 2.0],
  inmate_joe: [0.25, 0.7, 2.5],
  inmate_bill: [0.3, 0.8, 3.0],
  inmate_heinrich: [0.35, 0.9, 3.5],
  inmate_luis: [0.4, 1.0, 4.0],
  inmate_beefy: [0.5, 1.25, 5.0],
};

const LOW_ITEM_IDS: LowItemSymbolId[] = [
  "item_soap",
  "item_lighter",
  "item_shiv",
  "item_handcuffs",
  "item_toilet_roll",
];

const INMATE_IDS: InmateSymbolId[] = [
  "inmate_joe",
  "inmate_bill",
  "inmate_heinrich",
  "inmate_luis",
  "inmate_beefy",
];

const ALL_REGULAR_IDS: RegularSanQuentinSymbolId[] = [
  ...LOW_ITEM_IDS,
  ...INMATE_IDS,
];

const SYMBOL_LABELS: Record<MainCellSymbolId, string> = {
  item_soap: "Prison Soap",
  item_lighter: "Zippo Lighter",
  item_shiv: "Toothbrush Shiv",
  item_handcuffs: "Steel Handcuffs",
  item_toilet_roll: "Contraband Roll",
  inmate_joe: "Crazy Joe",
  inmate_bill: "Biker Bill",
  inmate_heinrich: "Heinrich 3rd",
  inmate_luis: "Loco Luis",
  inmate_beefy: "Beefy Dick",
  scatter_tower: "Guard Tower Scatter",
  split_wild: "Split Wild",
  wild_badge: "Wild",
  jumping_wild: "Jumping Wild",
};

const INMATE_THEMES: Record<
  InmateSymbolId,
  { border: string; bg: string; glow: string; tagBg: string; shortName: string }
> = {
  inmate_joe: {
    border: "border-emerald-400/80",
    bg: "from-emerald-950/90 via-slate-900 to-emerald-950/90",
    glow: "shadow-[0_0_14px_rgba(52,211,153,0.35)]",
    tagBg: "bg-emerald-500 text-slate-950",
    shortName: "CRAZY JOE",
  },
  inmate_bill: {
    border: "border-sky-400/80",
    bg: "from-sky-950/90 via-slate-900 to-sky-950/90",
    glow: "shadow-[0_0_14px_rgba(56,189,248,0.35)]",
    tagBg: "bg-sky-400 text-slate-950",
    shortName: "BIKER BILL",
  },
  inmate_heinrich: {
    border: "border-purple-400/80",
    bg: "from-purple-950/90 via-slate-900 to-purple-950/90",
    glow: "shadow-[0_0_14px_rgba(192,132,252,0.38)]",
    tagBg: "bg-purple-400 text-slate-950",
    shortName: "HEINRICH III",
  },
  inmate_luis: {
    border: "border-orange-400/85",
    bg: "from-orange-950/90 via-slate-900 to-orange-950/90",
    glow: "shadow-[0_0_16px_rgba(251,146,60,0.42)]",
    tagBg: "bg-orange-400 text-slate-950",
    shortName: "LOCO LUIS",
  },
  inmate_beefy: {
    border: "border-amber-400",
    bg: "from-red-950/95 via-amber-950/70 to-slate-950",
    glow: "shadow-[0_0_18px_rgba(251,191,36,0.55)]",
    tagBg: "bg-gradient-to-r from-amber-400 to-red-500 text-slate-950",
    shortName: "BEEFY DICK",
  },
};

const BET_LADDER_USD = [
  0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0, 20.0, 40.0, 50.0, 75.0,
  100.0,
];

const FEATURE_BUYS: Array<{
  tier: LockdownTier;
  title: string;
  subtitle: string;
  costMult: number;
  jumpingWilds: number;
  unlockedReels: number;
  accentClass: string;
  badgeText: string;
}> = [
  {
    tier: 1,
    title: "LOCKDOWN 1 JW",
    subtitle: "3 Unlocked Reels • 1 Jumping Wild",
    costMult: 100,
    jumpingWilds: 1,
    unlockedReels: 3,
    accentClass:
      "from-amber-500/20 via-amber-600/10 to-slate-900 border-amber-500/50 hover:border-amber-400",
    badgeText: "100x",
  },
  {
    tier: 2,
    title: "LOCKDOWN 2 JW",
    subtitle: "4 Unlocked Reels • 2 Jumping Wilds",
    costMult: 400,
    jumpingWilds: 2,
    unlockedReels: 4,
    accentClass:
      "from-orange-500/25 via-red-900/15 to-slate-900 border-orange-500/55 hover:border-orange-400",
    badgeText: "400x",
  },
  {
    tier: 3,
    title: "PSYCHO MANHUNT",
    subtitle: "All 5 Reels (10 Cells) • 3 Jumping Wilds",
    costMult: 2000,
    jumpingWilds: 3,
    unlockedReels: 5,
    accentClass:
      "from-red-600/30 via-amber-500/20 to-slate-950 border-red-500/75 hover:border-amber-300",
    badgeText: "2,000x",
  },
];

/* ============================================================================
 * 3. METALLIC PRISON AUDIO SYNTH (Web Audio API)
 * ========================================================================== */

class SanQuentinAudioEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playIronCellSlam(reelIdx: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Low iron thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(115 - reelIdx * 6, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.14);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);

    // Metallic clank harmonic
    const clang = ctx.createOscillator();
    const clangGain = ctx.createGain();
    clang.type = "square";
    clang.frequency.setValueAtTime(520 + reelIdx * 35, now);
    clang.frequency.exponentialRampToValueAtTime(210, now + 0.07);
    clangGain.gain.setValueAtTime(0.055, now);
    clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    clang.connect(clangGain);
    clangGain.connect(ctx.destination);
    clang.start(now);
    clang.stop(now + 0.085);
  }

  public playGateUnlock() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.09);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.22);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playRazorSlash(doubledJumpWild = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Metallic razor sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(4200, now + 0.06);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.2);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);

    if (doubledJumpWild) {
      const ping = ctx.createOscillator();
      const pingGain = ctx.createGain();
      ping.type = "sine";
      ping.frequency.setValueAtTime(880, now + 0.06);
      ping.frequency.exponentialRampToValueAtTime(1760, now + 0.22);
      pingGain.gain.setValueAtTime(0.13, now + 0.06);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      ping.connect(pingGain);
      pingGain.connect(ctx.destination);
      ping.start(now + 0.06);
      ping.stop(now + 0.25);
    }
  }

  public playXwaysUnpack() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [320, 440, 580, 740].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + i * 0.035);
      gain.gain.setValueAtTime(0.08, now + i * 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.035 + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.035);
      osc.stop(now + i * 0.035 + 0.13);
    });
  }

  public playPrisonSiren() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.linearRampToValueAtTime(760, now + 0.32);
    osc.frequency.linearRampToValueAtTime(320, now + 0.65);
    osc.frequency.linearRampToValueAtTime(790, now + 0.98);
    osc.frequency.linearRampToValueAtTime(280, now + 1.3);
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1600, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.36);
  }

  public playWinHit(multiplier: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Industrial bass drop + metallic hit
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(multiplier >= 20 ? 110 : 88, now);
    sub.frequency.exponentialRampToValueAtTime(36, now + 0.45);
    subGain.gain.setValueAtTime(multiplier >= 20 ? 0.25 : 0.14, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.5);

    const chord =
      multiplier >= 100
        ? [220, 330, 440, 554.37, 659.25]
        : multiplier >= 15
        ? [220, 330, 440, 523.25]
        : [330, 440, 554.37];

    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = multiplier >= 25 ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      gain.gain.setValueAtTime(0.075, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.46);
    });
  }
}

/* ============================================================================
 * 4. PROVABLY FAIR CRYPTO HELPERS & RNG ENGINE
 * ========================================================================== */

async function sha256Hex(input: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const buf = new TextEncoder().encode(input);
    const digest = await window.crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(64, "a");
}

function randomHex(len = 16): string {
  const chars = "0123456789abcdef";
  let out = "";
  const arr = new Uint8Array(len);
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += chars[arr[i] % 16];
  } else {
    for (let i = 0; i < len; i++)
      out += chars[Math.floor(Math.random() * 16)];
  }
  return out;
}

function secureRand(): number {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] / 4294967296;
  }
  return Math.random();
}

function pickWeighted<T>(items: Array<{ item: T; weight: number }>): T {
  const total = items.reduce((acc, x) => acc + x.weight, 0);
  let r = secureRand() * total;
  for (const entry of items) {
    r -= entry.weight;
    if (r <= 0) return entry.item;
  }
  return items[items.length - 1].item;
}

/* ============================================================================
 * 5. SAN QUENTIN xWAYS MATH ENGINE (WAYS, xWAYS, RAZOR SPLIT, JUMPING WILDS)
 * ========================================================================== */

function rollRegularSymbol(rtpScale: number): RegularSanQuentinSymbolId {
  const highBoost = Math.max(0.75, Math.min(1.25, rtpScale));
  return pickWeighted<RegularSanQuentinSymbolId>([
    { item: "item_soap", weight: 16 },
    { item: "item_lighter", weight: 15 },
    { item: "item_shiv", weight: 14 },
    { item: "item_handcuffs", weight: 13 },
    { item: "item_toilet_roll", weight: 12 },
    { item: "inmate_joe", weight: 8.5 * highBoost },
    { item: "inmate_bill", weight: 7.5 * highBoost },
    { item: "inmate_heinrich", weight: 6.5 * highBoost },
    { item: "inmate_luis", weight: 5.5 * highBoost },
    { item: "inmate_beefy", weight: 4.5 * highBoost },
  ]);
}

function rollEnhancerContent(
  isLockdown: boolean,
  rtpScale: number
): Exclude<EnhancerContent, { kind: "locked" } | { kind: "setup_spins" }> {
  const boost = Math.max(0.8, Math.min(1.25, rtpScale));
  const roll = pickWeighted<
    "inmate" | "wild" | "xways" | "razor_split"
  >([
    { item: "inmate", weight: isLockdown ? 44 : 48 },
    { item: "wild", weight: isLockdown ? 10 * boost : 9 * boost },
    { item: "xways", weight: isLockdown ? 23 * boost : 22 * boost },
    { item: "razor_split", weight: isLockdown ? 23 * boost : 21 * boost },
  ]);

  if (roll === "wild") return { kind: "wild" };
  if (roll === "razor_split") return { kind: "razor_split" };
  if (roll === "xways") {
    const sym = pickWeighted<RegularSanQuentinSymbolId>([
      { item: "item_soap", weight: 11 },
      { item: "item_lighter", weight: 11 },
      { item: "item_shiv", weight: 10 },
      { item: "item_handcuffs", weight: 10 },
      { item: "item_toilet_roll", weight: 10 },
      { item: "inmate_joe", weight: 10 },
      { item: "inmate_bill", weight: 10 },
      { item: "inmate_heinrich", weight: 9 },
      { item: "inmate_luis", weight: 9 },
      { item: "inmate_beefy", weight: 10 },
    ]);
    return { kind: "xways", revealedSymbol: sym, stackSize: 4 };
  }

  const inmate = pickWeighted<InmateSymbolId>([
    { item: "inmate_joe", weight: 25 },
    { item: "inmate_bill", weight: 22 },
    { item: "inmate_heinrich", weight: 20 },
    { item: "inmate_luis", weight: 18 },
    { item: "inmate_beefy", weight: 15 },
  ]);
  return { kind: "inmate", symbol: inmate };
}

function generateInitialGrid(
  rtpPercent: number,
  lockdown: LockdownState | null,
  forceScattersCount?: number
): {
  mainGrid: MainCell[][]; // [col][row]
  topEnhancers: EnhancerContent[];
  bottomEnhancers: EnhancerContent[];
  nextJumpingWilds: JumpingWildState[];
  scatterCount: number;
  extraSpinsAwarded: number;
  unlockedReelsThisSpin: boolean[];
} {
  const rtpScale = rtpPercent / 96.5;
  const isLockdown = Boolean(lockdown?.active);
  const stamp = `${Date.now()}-${Math.floor(secureRand() * 1e6)}`;

  // 1. Place Jumping Wilds if in Lockdown Spins
  const occupiedJumpKeys = new Set<string>();
  const nextJumpingWilds: JumpingWildState[] = [];
  if (lockdown?.active) {
    for (const jw of lockdown.jumpingWilds) {
      let col = Math.floor(secureRand() * REEL_COUNT);
      let row = Math.floor(secureRand() * MAIN_ROWS);
      let guard = 0;
      while (occupiedJumpKeys.has(`${col}-${row}`) && guard < 30) {
        col = Math.floor(secureRand() * REEL_COUNT);
        row = Math.floor(secureRand() * MAIN_ROWS);
        guard++;
      }
      occupiedJumpKeys.add(`${col}-${row}`);
      nextJumpingWilds.push({
        id: jw.id,
        col,
        row,
        multiplier: jw.multiplier,
        justDoubled: false,
      });
    }
  }

  // 2. Determine Scatter placements
  const scatterReels = new Set<number>();
  if (forceScattersCount && forceScattersCount > 0) {
    const pool = [0, 1, 2, 3, 4];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(secureRand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < Math.min(5, forceScattersCount); i++) {
      scatterReels.add(pool[i]);
    }
  } else if (!isLockdown) {
    for (let col = 0; col < REEL_COUNT; col++) {
      const scatterChance = 0.082 * Math.min(1.15, rtpScale);
      if (secureRand() < scatterChance) {
        scatterReels.add(col);
      }
    }
  } else if (lockdown?.active) {
    // In Lockdown Spins, landing a Guard Tower Scatter on any LOCKED reel unlocks it for this spin, awards +1 spin & turns into extra JW!
    for (let col = 0; col < REEL_COUNT; col++) {
      if (!lockdown.unlockedReels[col] && secureRand() < 0.14) {
        scatterReels.add(col);
      }
    }
  }

  // 3. Build Main 5x3 Grid
  const mainGrid: MainCell[][] = [];
  let extraSpinsAwarded = 0;

  for (let col = 0; col < REEL_COUNT; col++) {
    const colCells: MainCell[] = [];
    const scatterRow = scatterReels.has(col)
      ? Math.floor(secureRand() * MAIN_ROWS)
      : -1;

    // Avoid putting scatter on a jumping wild cell
    let resolvedScatterRow = scatterRow;
    if (
      resolvedScatterRow >= 0 &&
      occupiedJumpKeys.has(`${col}-${resolvedScatterRow}`)
    ) {
      resolvedScatterRow = (resolvedScatterRow + 1) % MAIN_ROWS;
      if (occupiedJumpKeys.has(`${col}-${resolvedScatterRow}`)) {
        resolvedScatterRow = -1;
      }
    }

    // Split Wild chance (max 1 per reel)
    let splitWildRow = -1;
    if (secureRand() < (isLockdown ? 0.095 : 0.075) * Math.min(1.2, rtpScale)) {
      const candidateRow = Math.floor(secureRand() * MAIN_ROWS);
      if (
        candidateRow !== resolvedScatterRow &&
        !occupiedJumpKeys.has(`${col}-${candidateRow}`)
      ) {
        splitWildRow = candidateRow;
      }
    }

    for (let row = 0; row < MAIN_ROWS; row++) {
      const jwHere = nextJumpingWilds.find(
        (j) => j.col === col && j.row === row
      );
      if (jwHere) {
        colCells.push({
          uid: `sq-${stamp}-${col}-${row}`,
          symbol: "jumping_wild",
          col,
          row,
          splitCount: 1,
          jumpingWildMult: jwHere.multiplier,
        });
      } else if (row === resolvedScatterRow) {
        if (isLockdown) {
          extraSpinsAwarded += 1;
        }
        colCells.push({
          uid: `sq-${stamp}-${col}-${row}`,
          symbol: "scatter_tower",
          col,
          row,
          splitCount: 1,
          isTempExtraJumpWild: isLockdown,
        });
      } else if (row === splitWildRow) {
        colCells.push({
          uid: `sq-${stamp}-${col}-${row}`,
          symbol: "split_wild",
          col,
          row,
          splitCount: 1,
        });
      } else {
        colCells.push({
          uid: `sq-${stamp}-${col}-${row}`,
          symbol: rollRegularSymbol(rtpScale),
          col,
          row,
          splitCount: 1,
        });
      }
    }
    mainGrid.push(colCells);
  }

  // Count scatters
  let scatterCount = 0;
  const scatterHasReel: boolean[] = Array(REEL_COUNT).fill(false);
  for (let col = 0; col < REEL_COUNT; col++) {
    for (let row = 0; row < MAIN_ROWS; row++) {
      if (mainGrid[col][row].symbol === "scatter_tower") {
        scatterCount += 1;
        scatterHasReel[col] = true;
      }
    }
  }

  // Base game: if 1 or 2 scatters land, they transform into Wilds (and still unlock their reel's Enhancers!)
  if (!isLockdown && (scatterCount === 1 || scatterCount === 2)) {
    for (let col = 0; col < REEL_COUNT; col++) {
      for (let row = 0; row < MAIN_ROWS; row++) {
        if (mainGrid[col][row].symbol === "scatter_tower") {
          mainGrid[col][row].isScatterTurnedWild = true;
        }
      }
    }
  }

  // 4. Determine which reels' Top & Bottom Enhancers are unlocked this spin
  const unlockedReelsThisSpin: boolean[] = Array(REEL_COUNT).fill(false);
  const topEnhancers: EnhancerContent[] = [];
  const bottomEnhancers: EnhancerContent[] = [];

  for (let col = 0; col < REEL_COUNT; col++) {
    const permanentlyUnlocked = lockdown?.active
      ? lockdown.unlockedReels[col]
      : false;
    const isUnlocked = permanentlyUnlocked || scatterHasReel[col];
    unlockedReelsThisSpin[col] = isUnlocked;

    if (isUnlocked) {
      topEnhancers.push(rollEnhancerContent(isLockdown, rtpScale));
      bottomEnhancers.push(rollEnhancerContent(isLockdown, rtpScale));
    } else {
      topEnhancers.push({ kind: "locked" });
      bottomEnhancers.push({ kind: "locked" });
    }
  }

  // 5. Apply Razor Split & Split Wild effects + Jumping Wild Doubling!
  for (let col = 0; col < REEL_COUNT; col++) {
    const topRazor = topEnhancers[col].kind === "razor_split" ? 1 : 0;
    const botRazor = bottomEnhancers[col].kind === "razor_split" ? 1 : 0;
    const razorCount = topRazor + botRazor;
    const razorMult = razorCount === 2 ? 4 : razorCount === 1 ? 2 : 1;

    const hasSplitWild = mainGrid[col].some((c) => c.symbol === "split_wild");
    const splitWildMult = hasSplitWild ? 2 : 1;

    // Double any Jumping Wild on this reel for EACH Razor Split on this reel
    if (razorCount > 0) {
      for (const jw of nextJumpingWilds) {
        if (jw.col === col) {
          for (let r = 0; r < razorCount; r++) {
            jw.multiplier = Math.min(MAX_JUMPING_WILD_MULT, jw.multiplier * 2);
          }
          jw.justDoubled = true;
          const targetCell = mainGrid[col][jw.row];
          if (targetCell) {
            targetCell.jumpingWildMult = jw.multiplier;
          }
        }
      }
    }

    // Apply split counts to main grid cells on this reel
    for (let row = 0; row < MAIN_ROWS; row++) {
      const cell = mainGrid[col][row];
      if (cell.symbol === "jumping_wild") {
        cell.splitCount = 1;
      } else if (cell.symbol === "scatter_tower") {
        // If 1 or 2 scatters turned into wild, razor splits can split them too
        cell.splitCount = cell.isScatterTurnedWild ? razorMult : 1;
      } else if (cell.symbol === "split_wild") {
        // Split Wild counts as Wild (split by razor if present) and doubles regular symbols on reel
        cell.splitCount = razorMult;
      } else {
        // Regular symbol: split by Razor Splits AND Split Wild
        cell.splitCount = razorMult * splitWildMult;
      }
    }
  }

  return {
    mainGrid,
    topEnhancers,
    bottomEnhancers,
    nextJumpingWilds,
    scatterCount,
    extraSpinsAwarded,
    unlockedReelsThisSpin,
  };
}

interface WaysEvaluationResult {
  totalWinUSD: number;
  totalActiveWays: number;
  winningSymbols: RegularSanQuentinSymbolId[];
  winningCells: Set<string>; // "main-col-row" | "top-col" | "bot-col"
  symbolBreakdowns: Array<{
    symbol: RegularSanQuentinSymbolId;
    matchLength: number;
    ways: number;
    winUSD: number;
    inmateMult: number;
  }>;
}

function calculateSanQuentinWaysWin(
  mainGrid: MainCell[][],
  topEnhancers: EnhancerContent[],
  bottomEnhancers: EnhancerContent[],
  baseBetUSD: number,
  lockdown: LockdownState | null
): WaysEvaluationResult {
  // 1. Calculate totalActiveWays across the 5 reels
  const activePositionsPerReel: number[] = [];
  for (let col = 0; col < REEL_COUNT; col++) {
    let reelPositions = 0;
    for (let row = 0; row < MAIN_ROWS; row++) {
      const c = mainGrid[col][row];
      if (c.symbol === "jumping_wild") {
        reelPositions += Math.max(1, c.jumpingWildMult || 1);
      } else if (c.symbol === "scatter_tower" && !c.isScatterTurnedWild && !c.isTempExtraJumpWild) {
        reelPositions += 1;
      } else {
        reelPositions += c.splitCount;
      }
    }
    const addEnhancerWays = (enh: EnhancerContent) => {
      if (enh.kind === "xways") return enh.stackSize; // 4 ways
      if (enh.kind === "inmate" || enh.kind === "wild") return 1;
      return 0;
    };
    reelPositions += addEnhancerWays(topEnhancers[col]);
    reelPositions += addEnhancerWays(bottomEnhancers[col]);
    activePositionsPerReel.push(Math.max(1, reelPositions));
  }

  const totalActiveWays = activePositionsPerReel.reduce(
    (acc, n) => acc * n,
    1
  );

  // 2. Evaluate all 10 regular symbols left-to-right (col 0 -> 4)
  const winningCells = new Set<string>();
  const winningSymbols: RegularSanQuentinSymbolId[] = [];
  const symbolBreakdowns: WaysEvaluationResult["symbolBreakdowns"] = [];
  let totalWinUSD = 0;

  for (const sym of ALL_REGULAR_IDS) {
    const waysCount: number[] = [];
    const matchedCellKeysByCol: string[][] = [];

    for (let col = 0; col < REEL_COUNT; col++) {
      let countOnReel = 0;
      const colKeys: string[] = [];

      for (let row = 0; row < MAIN_ROWS; row++) {
        const cell = mainGrid[col][row];
        if (cell.symbol === sym) {
          countOnReel += cell.splitCount;
          colKeys.push(`main-${col}-${row}`);
        } else if (cell.symbol === "jumping_wild") {
          countOnReel += cell.jumpingWildMult || 1;
          colKeys.push(`main-${col}-${row}`);
        } else if (
          cell.symbol === "split_wild" ||
          cell.symbol === "wild_badge"
        ) {
          countOnReel += cell.splitCount;
          colKeys.push(`main-${col}-${row}`);
        } else if (cell.symbol === "scatter_tower") {
          if (cell.isTempExtraJumpWild || cell.isScatterTurnedWild) {
            countOnReel += cell.splitCount;
            colKeys.push(`main-${col}-${row}`);
          }
        }
      }

      // Check top & bottom enhancers on this reel
      const evalEnhancer = (
        enh: EnhancerContent,
        prefix: "top" | "bot"
      ) => {
        if (enh.kind === "wild") {
          countOnReel += 1;
          colKeys.push(`${prefix}-${col}`);
        } else if (enh.kind === "inmate" && enh.symbol === sym) {
          countOnReel += 1;
          colKeys.push(`${prefix}-${col}`);
        } else if (enh.kind === "xways" && enh.revealedSymbol === sym) {
          countOnReel += enh.stackSize; // 4
          colKeys.push(`${prefix}-${col}`);
        }
      };

      evalEnhancer(topEnhancers[col], "top");
      evalEnhancer(bottomEnhancers[col], "bot");

      waysCount.push(countOnReel);
      matchedCellKeysByCol.push(colKeys);
    }

    // Must hit consecutively starting on Reel 0 for at least 3 reels
    let matchLength = 0;
    for (let col = 0; col < REEL_COUNT; col++) {
      if (waysCount[col] > 0) matchLength++;
      else break;
    }

    if (matchLength >= 3) {
      let waysProduct = 1;
      for (let col = 0; col < matchLength; col++) {
        waysProduct *= waysCount[col];
        for (const k of matchedCellKeysByCol[col]) {
          winningCells.add(k);
        }
      }

      const globalInmateMultiplier =
        lockdown?.active && lockdown.specialInmate === sym
          ? lockdown.specialInmateMult
          : 1;

      const payMult = PAYTABLE[sym][matchLength - 3];
      const symWinUSD =
        baseBetUSD * payMult * waysProduct * globalInmateMultiplier;

      totalWinUSD += symWinUSD;
      winningSymbols.push(sym);
      symbolBreakdowns.push({
        symbol: sym,
        matchLength,
        ways: waysProduct,
        winUSD: symWinUSD,
        inmateMult: globalInmateMultiplier,
      });
    }
  }

  return {
    totalWinUSD,
    totalActiveWays,
    winningSymbols,
    winningCells,
    symbolBreakdowns,
  };
}

/* ============================================================================
 * 6. CRISP CUSTOM 3D SVG ARTWORK FOR ALL SYMBOLS & ENHANCERS
 * ========================================================================== */

const SanQuentinSymbolGraphic: React.FC<{
  symbol: MainCellSymbolId;
  splitCount?: number;
  jumpingWildMult?: number;
  isTempExtraJumpWild?: boolean;
  isScatterTurnedWild?: boolean;
  isSpecialInmate?: boolean;
  specialInmateMult?: number;
}> = ({
  symbol,
  splitCount = 1,
  jumpingWildMult = 1,
  isTempExtraJumpWild = false,
  isScatterTurnedWild = false,
  isSpecialInmate = false,
  specialInmateMult = 1,
}) => {
  const uid = useId().replace(/:/g, "");

  // Jumping Wild (or Temp Extra Jumping Wild from Lockdown Scatter)
  if (symbol === "jumping_wild" || (symbol === "scatter_tower" && isTempExtraJumpWild)) {
    const jwFallback = (
      <svg viewBox="0 0 80 80" className="h-[86%] w-[86%]">
        <polygon
          points="40,6 49,25 70,27 54,41 59,62 40,52 21,62 26,41 10,27 31,25"
          fill="#f59e0b"
          stroke="#fffbeb"
          strokeWidth="2.5"
        />
        <circle cx="40" cy="38" r="15" fill="#0f172a" stroke="#fbbf24" strokeWidth="2" />
      </svg>
    );

    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border-2 border-amber-300 bg-gradient-to-br from-amber-950/60 via-red-950/50 to-slate-950 shadow-[0_0_20px_rgba(251,191,36,0.65)]">
        <ProtectedArt
          src={ZYAN_SLOTS_ASSETS.ZYAN_SAN_QUENTIN.JUMPING_WILD}
          alt="Jumping Wild"
          className="h-full w-full scale-110 rounded-lg object-contain mix-blend-lighten"
          fallback={jwFallback}
        />
        <span className="font-display pointer-events-none absolute left-0.5 top-0.5 z-20 rounded bg-slate-950/90 px-1 py-0.5 text-[7px] font-black uppercase leading-none text-amber-300">
          WILD
        </span>
        <div className="font-display pointer-events-none absolute bottom-0.5 right-0.5 z-20 rounded bg-gradient-to-r from-amber-400 to-yellow-300 px-1.5 py-0.5 text-[10px] font-black leading-none text-slate-950 shadow-md sm:text-xs">
          {jumpingWildMult}x
        </div>
      </div>
    );
  }

  // Guard Tower Scatter (or turned Wild when 1-2 landed in Base)
  if (symbol === "scatter_tower") {
    return (
      <div
        className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border-2 ${
          isScatterTurnedWild
            ? "border-amber-400 bg-gradient-to-br from-amber-500/30 via-slate-900 to-amber-950/80 shadow-[0_0_16px_rgba(251,191,36,0.55)]"
            : "border-red-500/90 bg-gradient-to-br from-red-950/90 via-slate-900 to-slate-950 shadow-[0_0_16px_rgba(239,68,68,0.45)]"
        }`}
      >
        <svg viewBox="0 0 80 80" className="h-[88%] w-[88%]">
          <defs>
            <linearGradient id={`tw-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
          </defs>
          {/* Searchlight beams */}
          <polygon
            points="40,26 4,4 22,4"
            fill="#fde047"
            fillOpacity="0.28"
          />
          <polygon
            points="40,26 58,4 76,4"
            fill="#fde047"
            fillOpacity="0.28"
          />
          {/* Watchtower legs */}
          <line x1="25" y1="74" x2="32" y2="38" stroke="#64748b" strokeWidth="4" />
          <line x1="55" y1="74" x2="48" y2="38" stroke="#64748b" strokeWidth="4" />
          <line x1="27" y1="58" x2="53" y2="58" stroke="#475569" strokeWidth="3" />
          {/* Tower Cabin */}
          <polygon points="22,22 40,10 58,22" fill="#dc2626" stroke="#fca5a5" strokeWidth="1.5" />
          <rect
            x="25"
            y="22"
            width="30"
            height="17"
            rx="2"
            fill={`url(#tw-${uid})`}
            stroke="#94a3b8"
            strokeWidth="1.5"
          />
          <rect x="30" y="25" width="20" height="8" rx="1" fill="#fef08a" />
        </svg>
        <span
          className={`font-display absolute bottom-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[8px] font-black uppercase leading-none tracking-wider shadow sm:text-[9px] ${
            isScatterTurnedWild
              ? "bg-amber-400 text-slate-950"
              : "bg-red-600 text-white"
          }`}
        >
          {isScatterTurnedWild ? "WILD" : "BONUS"}
        </span>
      </div>
    );
  }

  // Split Wild
  if (symbol === "split_wild") {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border-2 border-cyan-400 bg-gradient-to-br from-cyan-950/90 via-slate-900 to-blue-950 shadow-[0_0_16px_rgba(34,211,238,0.45)]">
        <svg viewBox="0 0 80 80" className="h-[88%] w-[88%]">
          <defs>
            <linearGradient id={`sw-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
          </defs>
          {/* Crossed Razor Arrows */}
          <path
            d="M16 24 L40 40 L16 56 M64 24 L40 40 L64 56"
            fill="none"
            stroke={`url(#sw-${uid})`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1="40"
            y1="10"
            x2="40"
            y2="70"
            stroke="#e0f2fe"
            strokeWidth="3"
            strokeDasharray="4 3"
          />
          <rect
            x="16"
            y="29"
            width="48"
            height="22"
            rx="5"
            fill="#0f172a"
            stroke="#22d3ee"
            strokeWidth="2"
          />
          <text
            x="40"
            y="43"
            textAnchor="middle"
            fill="#67e8f9"
            fontSize="10"
            fontWeight="900"
            fontFamily="Montserrat, sans-serif"
          >
            SPLIT W
          </text>
        </svg>
        <span className="font-display absolute bottom-0.5 right-0.5 rounded bg-cyan-400 px-1 py-0.5 text-[8px] font-black leading-none text-slate-950">
          REEL ×2
        </span>
      </div>
    );
  }

  // Regular Wild Badge
  if (symbol === "wild_badge") {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border-2 border-amber-400 bg-gradient-to-br from-amber-900/60 via-slate-900 to-slate-950 shadow-[0_0_14px_rgba(251,191,36,0.45)]">
        <svg viewBox="0 0 80 80" className="h-[85%] w-[85%]">
          <circle
            cx="40"
            cy="40"
            r="28"
            fill="#1e293b"
            stroke="#fbbf24"
            strokeWidth="4"
          />
          <text
            x="40"
            y="45"
            textAnchor="middle"
            fill="#fde047"
            fontSize="16"
            fontWeight="900"
            fontFamily="Montserrat, sans-serif"
          >
            WILD
          </text>
        </svg>
      </div>
    );
  }

  // 5 High-Pay Inmate Boss Characters
  if (symbol.startsWith("inmate_")) {
    const inmateId = symbol as InmateSymbolId;
    const theme = INMATE_THEMES[inmateId];

    return (
      <div
        className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 bg-gradient-to-b ${theme.border} ${theme.bg} ${theme.glow}`}
      >
        {/* Mugshot height lines in background */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1.5 flex flex-col gap-1.5 opacity-20"
        >
          <div className="h-px w-full bg-slate-300" />
          <div className="h-px w-full bg-slate-300" />
          <div className="h-px w-full bg-slate-300" />
        </div>

        <svg viewBox="0 0 80 76" className="relative z-10 h-[78%] w-[86%]">
          <defs>
            <linearGradient id={`skin-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
          </defs>
          {/* Prison Jumpsuit Shoulders */}
          <path
            d="M14 74 C14 54, 66 54, 66 74 Z"
            fill={
              inmateId === "inmate_beefy"
                ? "#dc2626"
                : inmateId === "inmate_luis"
                ? "#ea580c"
                : inmateId === "inmate_heinrich"
                ? "#7e22ce"
                : inmateId === "inmate_bill"
                ? "#0284c7"
                : "#15803d"
            }
            stroke="#0f172a"
            strokeWidth="2"
          />
          {/* Head & Character Traits */}
          <circle
            cx="40"
            cy="34"
            r="19"
            fill={`url(#skin-${uid})`}
            stroke="#0f172a"
            strokeWidth="2.5"
          />
          {inmateId === "inmate_joe" && (
            <>
              {/* Spiky green-tinted wild hair & crazy grin */}
              <path d="M21 27 L27 10 L35 19 L42 8 L50 19 L58 12 L59 27 Z" fill="#1e293b" />
              <circle cx="33" cy="33" r="3" fill="#0f172a" />
              <circle cx="47" cy="32" r="4" fill="#fff" stroke="#0f172a" strokeWidth="1.5" />
              <circle cx="47" cy="32" r="1.5" fill="#0f172a" />
              <path d="M31 44 Q40 50 49 43" fill="none" stroke="#0f172a" strokeWidth="2.5" />
            </>
          )}
          {inmateId === "inmate_bill" && (
            <>
              {/* Biker shades & thick handlebar mustache */}
              <rect x="24" y="27" width="14" height="8" rx="2" fill="#0f172a" />
              <rect x="42" y="27" width="14" height="8" rx="2" fill="#0f172a" />
              <line x1="38" y1="30" x2="42" y2="30" stroke="#94a3b8" strokeWidth="2" />
              <path d="M26 42 Q40 36 54 42 L52 48 Q40 43 28 48 Z" fill="#334155" />
              <path d="M21 23 Q40 12 59 23 Z" fill="#1e293b" />
            </>
          )}
          {inmateId === "inmate_heinrich" && (
            <>
              {/* Monocle & pointed goatee */}
              <circle cx="33" cy="32" r="3" fill="#0f172a" />
              <circle cx="47" cy="32" r="6" fill="none" stroke="#fbbf24" strokeWidth="2" />
              <circle cx="47" cy="32" r="2" fill="#0f172a" />
              <polygon points="34,47 46,47 40,58" fill="#1e293b" />
              <path d="M23 22 Q40 15 57 22" fill="none" stroke="#94a3b8" strokeWidth="4" />
            </>
          )}
          {inmateId === "inmate_luis" && (
            <>
              {/* Bandana & face tattoo */}
              <path d="M20 26 Q40 14 60 26 L58 19 Q40 8 22 19 Z" fill="#f97316" />
              <circle cx="33" cy="33" r="2.8" fill="#0f172a" />
              <circle cx="47" cy="33" r="2.8" fill="#0f172a" />
              <path d="M31 44 L49 44" stroke="#0f172a" strokeWidth="2.5" />
              <path d="M47 38 L50 42" stroke="#0f172a" strokeWidth="1.8" />
            </>
          )}
          {inmateId === "inmate_beefy" && (
            <>
              {/* Boss Crown / Gold Chain & Scar */}
              <polygon
                points="25,19 30,8 40,16 50,8 55,19"
                fill="#fbbf24"
                stroke="#78350f"
                strokeWidth="1.5"
              />
              <line x1="27" y1="27" x2="37" y2="31" stroke="#0f172a" strokeWidth="2.5" />
              <line x1="53" y1="27" x2="43" y2="31" stroke="#0f172a" strokeWidth="2.5" />
              <circle cx="33" cy="34" r="2.6" fill="#0f172a" />
              <circle cx="47" cy="34" r="2.6" fill="#0f172a" />
              <line x1="48" y1="25" x2="53" y2="41" stroke="#dc2626" strokeWidth="2" />
              <path d="M32 45 Q40 41 48 45" fill="none" stroke="#0f172a" strokeWidth="2.5" />
              <path d="M28 57 Q40 66 52 57" fill="none" stroke="#fbbf24" strokeWidth="3" />
            </>
          )}
        </svg>

        <div
          className={`font-display relative z-10 w-full truncate px-1 py-0.5 text-center text-[7px] font-black uppercase leading-none tracking-wider sm:text-[8px] ${theme.tagBg}`}
        >
          {theme.shortName}
        </div>

        {/* Split count indicator */}
        {splitCount > 1 && (
          <div className="font-display absolute right-0.5 top-0.5 z-20 rounded bg-cyan-400 px-1 py-0.5 text-[8px] font-black leading-none text-slate-950 shadow">
            ×{splitCount}
          </div>
        )}

        {/* Special Lockdown Inmate Multiplier Badge */}
        {isSpecialInmate && specialInmateMult > 1 && (
          <div className="font-display absolute left-0.5 top-0.5 z-20 rounded bg-gradient-to-r from-amber-300 to-yellow-500 px-1 py-0.5 text-[8px] font-black leading-none text-slate-950 shadow">
            ★{specialInmateMult}x
          </div>
        )}
      </div>
    );
  }

  // 5 Low-Pay Contraband Items
  const lowId = symbol as LowItemSymbolId;
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-slate-600/70 bg-gradient-to-b from-slate-800/90 to-slate-950/95">
      <svg viewBox="0 0 80 80" className="h-[80%] w-[80%]">
        <defs>
          <linearGradient id={`low-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>

        {lowId === "item_soap" && (
          <>
            <rect
              x="16"
              y="24"
              width="48"
              height="32"
              rx="10"
              fill="#f472b6"
              stroke="#fbcfe8"
              strokeWidth="2.5"
            />
            <rect
              x="23"
              y="30"
              width="34"
              height="20"
              rx="6"
              fill="none"
              stroke="#db2777"
              strokeWidth="2"
            />
            <text
              x="40"
              y="44"
              textAnchor="middle"
              fill="#831843"
              fontSize="10"
              fontWeight="900"
              fontFamily="Montserrat, sans-serif"
            >
              SOAP
            </text>
          </>
        )}

        {lowId === "item_lighter" && (
          <>
            <rect
              x="26"
              y="30"
              width="28"
              height="38"
              rx="4"
              fill={`url(#low-${uid})`}
              stroke="#475569"
              strokeWidth="2"
            />
            <rect x="26" y="20" width="16" height="10" rx="2" fill="#cbd5e1" />
            <path
              d="M46 10 C54 18, 52 27, 45 27 C39 27, 38 18, 46 10 Z"
              fill="#f97316"
            />
            <path
              d="M46 16 C49 20, 48 25, 45 25 C43 25, 42 20, 46 16 Z"
              fill="#fde047"
            />
          </>
        )}

        {lowId === "item_shiv" && (
          <>
            <g transform="rotate(-38 40 40)">
              <rect
                x="14"
                y="34"
                width="36"
                height="12"
                rx="4"
                fill="#38bdf8"
                stroke="#0284c7"
                strokeWidth="2"
              />
              <polygon
                points="50,34 72,40 50,46"
                fill="#e2e8f0"
                stroke="#64748b"
                strokeWidth="1.5"
              />
              <line x1="20" y1="34" x2="20" y2="46" stroke="#1e293b" strokeWidth="2" />
              <line x1="26" y1="34" x2="26" y2="46" stroke="#1e293b" strokeWidth="2" />
              <line x1="32" y1="34" x2="32" y2="46" stroke="#1e293b" strokeWidth="2" />
            </g>
          </>
        )}

        {lowId === "item_handcuffs" && (
          <>
            <circle
              cx="26"
              cy="44"
              r="14"
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="5"
            />
            <circle
              cx="54"
              cy="44"
              r="14"
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="5"
            />
            <line
              x1="34"
              y1="30"
              x2="46"
              y2="30"
              stroke="#94a3b8"
              strokeWidth="4"
              strokeDasharray="3 2"
            />
          </>
        )}

        {lowId === "item_toilet_roll" && (
          <>
            <rect
              x="22"
              y="22"
              width="34"
              height="38"
              rx="4"
              fill="#f8fafc"
              stroke="#94a3b8"
              strokeWidth="2"
            />
            <ellipse
              cx="39"
              cy="22"
              rx="17"
              ry="7"
              fill="#e2e8f0"
              stroke="#94a3b8"
              strokeWidth="2"
            />
            <ellipse cx="39" cy="22" rx="6" ry="2.5" fill="#475569" />
            <path d="M56 36 L66 42 L66 64 L52 56 Z" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
          </>
        )}
      </svg>

      {splitCount > 1 && (
        <div className="font-display absolute right-0.5 top-0.5 z-20 rounded bg-cyan-400 px-1 py-0.5 text-[8px] font-black leading-none text-slate-950 shadow">
          ×{splitCount}
        </div>
      )}
    </div>
  );
};

const EnhancerCellTile: React.FC<{
  content: EnhancerContent;
  isWinning?: boolean;
}> = ({ content, isWinning = false }) => {
  if (content.kind === "locked") {
    return (
      <div className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-lg border border-slate-700/90 bg-gradient-to-b from-slate-900 to-slate-950 shadow-inner sm:h-14">
        {/* Heavy vertical steel prison bars */}
        <div className="absolute inset-0 flex justify-evenly px-1.5 opacity-85">
          <div className="h-full w-1.5 bg-gradient-to-r from-slate-600 via-slate-300 to-slate-700" />
          <div className="h-full w-1.5 bg-gradient-to-r from-slate-600 via-slate-300 to-slate-700" />
          <div className="h-full w-1.5 bg-gradient-to-r from-slate-600 via-slate-300 to-slate-700" />
          <div className="h-full w-1.5 bg-gradient-to-r from-slate-600 via-slate-300 to-slate-700" />
        </div>
        <div className="relative z-10 flex items-center gap-1 rounded border border-slate-600/80 bg-slate-950/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
          <Lock className="h-2.5 w-2.5 text-amber-500/80" />
          <span>LOCKED</span>
        </div>
      </div>
    );
  }

  if (content.kind === "setup_spins") {
    return (
      <div className="relative flex h-12 w-full items-center justify-center rounded-lg border-2 border-amber-400 bg-gradient-to-br from-amber-500/30 via-slate-900 to-red-950/60 shadow-[0_0_14px_rgba(251,191,36,0.45)] sm:h-14">
        <div className="font-display text-center">
          <div className="text-sm font-black leading-none text-amber-300 sm:text-base">
            +{content.spins}
          </div>
          <div className="text-[8px] font-black uppercase tracking-wider text-amber-100">
            SPINS
          </div>
        </div>
      </div>
    );
  }

  if (content.kind === "razor_split") {
    return (
      <div className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-lg border-2 border-cyan-400 bg-gradient-to-br from-cyan-950 via-slate-900 to-blue-950 shadow-[0_0_16px_rgba(34,211,238,0.5)] sm:h-14">
        <ProtectedArt
          src={ZYAN_SLOTS_ASSETS.ZYAN_SAN_QUENTIN.RAZOR_SPLIT}
          alt="Razor Split"
          className="h-full w-full scale-110 rounded-lg object-contain mix-blend-lighten"
          fallback={
            <svg viewBox="0 0 80 44" className="h-[88%] w-[88%]">
              <polygon
                points="6,22 22,8 58,8 74,22 58,36 22,36"
                fill="#cbd5e1"
                stroke="#f8fafc"
                strokeWidth="2"
              />
              <rect x="26" y="16" width="28" height="12" rx="3" fill="#0f172a" />
            </svg>
          }
        />
        <span className="font-display pointer-events-none absolute bottom-0.5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950/90 px-1.5 py-0.5 text-[8px] font-black uppercase leading-none text-cyan-300 ring-1 ring-cyan-400/70">
          RAZOR ×2
        </span>
      </div>
    );
  }

  if (content.kind === "xways") {
    return (
      <div
        className={`relative flex h-12 w-full items-center gap-1 overflow-hidden rounded-lg border-2 bg-gradient-to-br from-amber-950/90 via-slate-900 to-orange-950/80 px-1 sm:h-14 ${
          isWinning
            ? "border-yellow-300 shadow-[0_0_18px_rgba(250,204,21,0.75)]"
            : "border-amber-400/90 shadow-[0_0_12px_rgba(245,158,11,0.35)]"
        }`}
      >
        <div className="h-9 w-9 shrink-0 sm:h-11 sm:w-11">
          <SanQuentinSymbolGraphic symbol={content.revealedSymbol} />
        </div>
        <div className="font-display flex min-w-0 flex-1 flex-col items-center justify-center text-center">
          <span className="text-[8px] font-black uppercase tracking-wider text-amber-300">
            xWAYS
          </span>
          <span className="text-xs font-black leading-none text-white sm:text-sm">
            ×4
          </span>
        </div>
      </div>
    );
  }

  if (content.kind === "wild") {
    return (
      <div
        className={`relative flex h-12 w-full items-center justify-center overflow-hidden rounded-lg border-2 bg-slate-950 p-0.5 sm:h-14 ${
          isWinning
            ? "border-yellow-300 shadow-[0_0_16px_rgba(250,204,21,0.7)]"
            : "border-amber-400/80"
        }`}
      >
        <SanQuentinSymbolGraphic symbol="wild_badge" />
      </div>
    );
  }

  // Inmate symbol inside enhancer
  return (
    <div
      className={`relative flex h-12 w-full items-center justify-center overflow-hidden rounded-lg border-2 p-0.5 sm:h-14 ${
        isWinning
          ? "border-yellow-300 shadow-[0_0_16px_rgba(250,204,21,0.75)]"
          : "border-slate-600"
      }`}
    >
      <SanQuentinSymbolGraphic symbol={content.symbol} />
    </div>
  );
};

/* ============================================================================
 * 7. MAIN COMPONENT: <ZyanSanQuentinSlot />
 * ========================================================================== */

export const ZyanSanQuentinSlot: React.FC<ZyanSanQuentinSlotProps> = ({
  externalBalanceUSD,
  onBalanceChange,
  onRecordBet,
  activeRtpPercent = 96.5,
  username = "Prisoner_01",
}) => {
  const audioRef = useRef<SanQuentinAudioEngine | null>(null);
  if (!audioRef.current) {
    audioRef.current = new SanQuentinAudioEngine();
  }

  // Wallet state (syncs with externalBalanceUSD if provided)
  const [internalBalanceUSD, setInternalBalanceUSD] = useState<number>(1000.0);
  const balanceUSD =
    typeof externalBalanceUSD === "number"
      ? externalBalanceUSD
      : internalBalanceUSD;

  const updateBalance = useCallback(
    (next: number) => {
      const rounded = Math.max(0, Math.round(next * 100) / 100);
      if (typeof externalBalanceUSD !== "number") {
        setInternalBalanceUSD(rounded);
      }
      onBalanceChange?.(rounded);
      if (typeof window !== "undefined" && window.parent !== window) {
        window.parent.postMessage(
          { type: "ZYAN_BALANCE_SYNC", balanceUSD: rounded },
          "*"
        );
      }
    },
    [externalBalanceUSD, onBalanceChange]
  );

  // Controls & Mode States
  const [betIndex, setBetIndex] = useState<number>(4); // $1.00 default
  const baseBetUSD = BET_LADDER_USD[betIndex];
  const [turboMode, setTurboMode] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [autoSpinRemaining, setAutoSpinRemaining] = useState<number>(0);

  // Provably Fair State
  const [clientSeed, setClientSeed] = useState<string>(() => randomHex(12));
  const [serverSeed] = useState<string>(() => randomHex(32));
  const [nonce, setNonce] = useState<number>(1);
  const [lastProofHash, setLastProofHash] = useState<string>("");

  // Game Board States
  const [spinPhase, setSpinPhase] = useState<SpinPhase>("IDLE");
  const [mainGrid, setMainGrid] = useState<MainCell[][]>(() => {
    const initial = generateInitialGrid(activeRtpPercent, null);
    return initial.mainGrid;
  });
  const [topEnhancers, setTopEnhancers] = useState<EnhancerContent[]>(() =>
    Array(REEL_COUNT).fill({ kind: "locked" })
  );
  const [bottomEnhancers, setBottomEnhancers] = useState<EnhancerContent[]>(
    () => Array(REEL_COUNT).fill({ kind: "locked" })
  );
  const [winningCells, setWinningCells] = useState<Set<string>>(
    () => new Set()
  );
  const [razorFlashReels, setRazorFlashReels] = useState<boolean[]>(() =>
    Array(REEL_COUNT).fill(false)
  );
  const [activeWinWays, setActiveWinWays] = useState<number>(243);
  const [lastWinUSD, setLastWinUSD] = useState<number>(0);
  const [callouts, setCallouts] = useState<FloatingCallout[]>([]);
  const [screenShake, setScreenShake] = useState<boolean>(false);

  // Lockdown Spins State
  const [lockdownState, setLockdownState] = useState<LockdownState | null>(
    null
  );
  const lockdownRef = useRef<LockdownState | null>(null);
  lockdownRef.current = lockdownState;

  // Modals & Celebrations
  const [showPaytable, setShowPaytable] = useState<boolean>(false);
  const [showFairness, setShowFairness] = useState<boolean>(false);
  const [confirmBuyTier, setConfirmBuyTier] = useState<LockdownTier | null>(
    null
  );
  const [winBanner, setWinBanner] = useState<{
    tierLabel: string;
    amountUSD: number;
    mult: number;
    isMaxWin: boolean;
  } | null>(null);
  const [history, setHistory] = useState<SpinHistoryEntry[]>([]);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

  const isBusy = spinPhase !== "IDLE";
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  // Listen for external parent wallet sync
  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.data?.type === "ZYAN_SET_BALANCE" && typeof e.data.balanceUSD === "number") {
        setInternalBalanceUSD(e.data.balanceUSD);
      }
    };
    window.addEventListener("message", handleMsg);
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: "ZYAN_GAME_READY", gameKey: "ZYAN_SAN_QUENTIN_XWAYS" },
        "*"
      );
    }
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const pushCallout = useCallback(
    (
      col: number,
      row: number,
      text: string,
      subtext?: string,
      tone: "gold" | "crimson" | "cyan" = "gold"
    ) => {
      const id = `c-${Date.now()}-${Math.floor(secureRand() * 99999)}`;
      setCallouts((prev) => [...prev, { id, col, row, text, subtext, tone }]);
      setTimeout(() => {
        if (mountedRef.current) {
          setCallouts((prev) => prev.filter((item) => item.id !== id));
        }
      }, 1500);
    },
    []
  );

  const emitBetRecord = useCallback(
    (
      wagerUSD: number,
      payoutUSD: number,
      mode: string,
      ways: number,
      proofHash: string
    ) => {
      const mult = wagerUSD > 0 ? payoutUSD / wagerUSD : 0;
      const record: ZyanSanQuentinBetRecord = {
        gameKey: "ZYAN_SAN_QUENTIN_XWAYS",
        gameName: "Zyan San Quentin xWays",
        wagerUSD,
        multiplier: Math.round(mult * 100) / 100,
        payoutUSD: Math.round(payoutUSD * 100) / 100,
        isWin: payoutUSD > 0,
        proofHash,
      };
      onRecordBet?.(record);
      if (typeof window !== "undefined" && window.parent !== window) {
        window.parent.postMessage({ type: "ZYAN_BET_RECORD", record }, "*");
      }
      setHistory((prev) => [
        {
          id: `${Date.now()}-${Math.floor(secureRand() * 9999)}`,
          wagerUSD,
          payoutUSD: record.payoutUSD,
          multiplier: record.multiplier,
          mode,
          ways,
          proofHash,
        },
        ...prev.slice(0, 14),
      ]);
    },
    [onRecordBet]
  );

  // Pre-Lockdown Spins Setup Sequence + Full Bonus Loop
  const runLockdownSession = useCallback(
    async (
      tier: LockdownTier,
      unlockedReels: boolean[],
      initialWagerUSD: number,
      initialProofHash: string
    ) => {
      setAutoSpinRemaining(0);
      setSpinPhase("LOCKDOWN_SETUP");
      setWinningCells(new Set());
      audioRef.current?.playPrisonSiren();

      // Step 1: Unlocked Top & Bottom Enhancer cells spin to reveal +1, +2, or +3 spins each
      const topSetup: EnhancerContent[] = unlockedReels.map((isOpen) =>
        isOpen
          ? {
              kind: "setup_spins",
              spins: pickWeighted([
                { item: 1, weight: 52 },
                { item: 2, weight: 36 },
                { item: 3, weight: 12 },
              ]),
            }
          : { kind: "locked" }
      );
      const botSetup: EnhancerContent[] = unlockedReels.map((isOpen) =>
        isOpen
          ? {
              kind: "setup_spins",
              spins: pickWeighted([
                { item: 1, weight: 52 },
                { item: 2, weight: 36 },
                { item: 3, weight: 12 },
              ]),
            }
          : { kind: "locked" }
      );

      let startingSpins = 0;
      for (let c = 0; c < REEL_COUNT; c++) {
        const t = topSetup[c];
        const b = botSetup[c];
        if (t.kind === "setup_spins") startingSpins += t.spins;
        if (b.kind === "setup_spins") startingSpins += b.spins;
      }

      // Select Special Inmate Symbol + Permanent Multiplier (4x to 15x)
      const specialInmate = pickWeighted<InmateSymbolId>([
        { item: "inmate_joe", weight: 24 },
        { item: "inmate_bill", weight: 22 },
        { item: "inmate_heinrich", weight: 20 },
        { item: "inmate_luis", weight: 18 },
        { item: "inmate_beefy", weight: 16 },
      ]);
      const specialInmateMult = 4 + Math.floor(secureRand() * 12); // 4x..15x

      // Initialize Jumping Wilds (1, 2, or 3)
      const jwCount = tier;
      const jumpingWilds: JumpingWildState[] = [];
      for (let i = 0; i < jwCount; i++) {
        jumpingWilds.push({
          id: `jw-${i + 1}`,
          col: i % REEL_COUNT,
          row: i % MAIN_ROWS,
          multiplier: 1,
        });
      }

      const initLockdown: LockdownState = {
        active: true,
        tier,
        unlockedReels,
        spinsLeft: startingSpins,
        totalSpinsAwarded: startingSpins,
        spinsPlayed: 0,
        totalWinUSD: 0,
        specialInmate,
        specialInmateMult,
        jumpingWilds,
        setupPhaseLabel: `LOCKDOWN UNLOCKED: ${startingSpins} SPINS • ${INMATE_THEMES[specialInmate].shortName} ${specialInmateMult}x`,
      };

      setTopEnhancers(topSetup);
      setBottomEnhancers(botSetup);
      setLockdownState(initLockdown);

      await sleep(turboMode ? 900 : 1850);
      if (!mountedRef.current) return;

      let activeLockdown: LockdownState = {
        ...initLockdown,
        setupPhaseLabel: undefined,
      };
      setLockdownState(activeLockdown);

      const maxCapUSD = baseBetUSD * MAX_WIN_MULT;
      let peakWays = 243;

      // Step 2: Execute Lockdown Free Spins Loop
      while (
        activeLockdown.spinsLeft > 0 &&
        activeLockdown.totalWinUSD < maxCapUSD &&
        mountedRef.current
      ) {
        activeLockdown = {
          ...activeLockdown,
          spinsLeft: activeLockdown.spinsLeft - 1,
          spinsPlayed: activeLockdown.spinsPlayed + 1,
        };
        setLockdownState({ ...activeLockdown });
        setSpinPhase("SPINNING");
        setWinningCells(new Set());
        setRazorFlashReels(Array(REEL_COUNT).fill(false));

        const spinOutcome = generateInitialGrid(
          activeRtpPercent,
          activeLockdown
        );

        await sleep(turboMode ? 240 : 460);
        if (!mountedRef.current) return;

        // Slam reels sequentially
        for (let c = 0; c < REEL_COUNT; c++) {
          audioRef.current?.playIronCellSlam(c);
          if (!turboMode) await sleep(55);
        }

        setMainGrid(spinOutcome.mainGrid);
        setSpinPhase("ENHANCING");

        // Open Enhancer cells
        setTopEnhancers(spinOutcome.topEnhancers);
        setBottomEnhancers(spinOutcome.bottomEnhancers);

        const anyXways =
          spinOutcome.topEnhancers.some((e) => e.kind === "xways") ||
          spinOutcome.bottomEnhancers.some((e) => e.kind === "xways");
        const anyRazor =
          spinOutcome.topEnhancers.some((e) => e.kind === "razor_split") ||
          spinOutcome.bottomEnhancers.some((e) => e.kind === "razor_split");
        const doubledAnyJW = spinOutcome.nextJumpingWilds.some(
          (j) => j.justDoubled
        );

        if (anyXways) audioRef.current?.playXwaysUnpack();
        if (anyRazor) {
          audioRef.current?.playRazorSlash(doubledAnyJW);
          setRazorFlashReels(
            spinOutcome.topEnhancers.map(
              (t, idx) =>
                t.kind === "razor_split" ||
                spinOutcome.bottomEnhancers[idx].kind === "razor_split"
            )
          );
        }

        for (const jw of spinOutcome.nextJumpingWilds) {
          if (jw.justDoubled) {
            pushCallout(
              jw.col,
              jw.row,
              `WILD ${jw.multiplier}x!`,
              "RAZOR DOUBLED",
              "cyan"
            );
          }
        }

        if (spinOutcome.extraSpinsAwarded > 0) {
          audioRef.current?.playGateUnlock();
          activeLockdown = {
            ...activeLockdown,
            spinsLeft: activeLockdown.spinsLeft + spinOutcome.extraSpinsAwarded,
            totalSpinsAwarded:
              activeLockdown.totalSpinsAwarded + spinOutcome.extraSpinsAwarded,
          };
          pushCallout(
            2,
            1,
            `+${spinOutcome.extraSpinsAwarded} EXTRA SPIN`,
            "GUARD TOWER WILD",
            "crimson"
          );
        }

        activeLockdown = {
          ...activeLockdown,
          jumpingWilds: spinOutcome.nextJumpingWilds,
        };
        setLockdownState({ ...activeLockdown });

        await sleep(turboMode ? 220 : 420);
        if (!mountedRef.current) return;

        // Evaluate Ways Win
        setSpinPhase("EVALUATING");
        const evalResult = calculateSanQuentinWaysWin(
          spinOutcome.mainGrid,
          spinOutcome.topEnhancers,
          spinOutcome.bottomEnhancers,
          baseBetUSD,
          activeLockdown
        );
        peakWays = Math.max(peakWays, evalResult.totalActiveWays);
        setActiveWinWays(evalResult.totalActiveWays);
        setWinningCells(evalResult.winningCells);

        if (evalResult.totalWinUSD > 0) {
          const remainingAllowance = Math.max(
            0,
            maxCapUSD - activeLockdown.totalWinUSD
          );
          const cappedSpinWin = Math.min(
            remainingAllowance,
            evalResult.totalWinUSD
          );
          const nextTotalWin = activeLockdown.totalWinUSD + cappedSpinWin;
          activeLockdown = {
            ...activeLockdown,
            totalWinUSD: nextTotalWin,
          };
          setLockdownState({ ...activeLockdown });
          setLastWinUSD(nextTotalWin);

          const spinMult = cappedSpinWin / baseBetUSD;
          audioRef.current?.playWinHit(spinMult);
          if (spinMult >= 25) {
            setScreenShake(true);
            setTimeout(() => mountedRef.current && setScreenShake(false), 500);
          }
          pushCallout(
            2,
            1,
            `+$${cappedSpinWin.toFixed(2)}`,
            `${evalResult.totalActiveWays.toLocaleString()} WAYS`,
            spinMult >= 20 ? "gold" : "crimson"
          );

          await sleep(turboMode ? 550 : 1050);
        } else {
          await sleep(turboMode ? 260 : 520);
        }
      }

      if (!mountedRef.current) return;

      // Credit total Lockdown Win
      const finalBonusWin = Math.round(activeLockdown.totalWinUSD * 100) / 100;
      const finalMult = finalBonusWin / baseBetUSD;
      const isMaxWin = finalMult >= MAX_WIN_MULT - 0.01;

      if (finalBonusWin > 0) {
        updateBalance(balanceUSD - initialWagerUSD + finalBonusWin);
      }

      emitBetRecord(
        initialWagerUSD,
        finalBonusWin,
        `Lockdown ${tier} JW`,
        peakWays,
        initialProofHash
      );

      if (finalMult >= 15 || isMaxWin) {
        setWinBanner({
          tierLabel: isMaxWin
            ? "150,000x PSYCHO MANHUNT MAX WIN!"
            : finalMult >= 250
            ? "PSYCHO MANHUNT WIN!"
            : finalMult >= 60
            ? "MEGA RIOT WIN!"
            : "LOCKDOWN BIG WIN!",
          amountUSD: finalBonusWin,
          mult: finalMult,
          isMaxWin,
        });
      }

      setLockdownState(null);
      setSpinPhase("IDLE");
    },
    [
      activeRtpPercent,
      balanceUSD,
      baseBetUSD,
      emitBetRecord,
      pushCallout,
      turboMode,
      updateBalance,
    ]
  );

  // Execute Single Base Spin (or Feature Buy trigger)
  const executeSpin = useCallback(
    async (buyTier?: LockdownTier) => {
      if (spinPhase !== "IDLE" || lockdownRef.current?.active) return;

      const featureDef = buyTier
        ? FEATURE_BUYS.find((f) => f.tier === buyTier)
        : undefined;
      const wagerUSD = featureDef
        ? Math.round(baseBetUSD * featureDef.costMult * 100) / 100
        : baseBetUSD;

      if (balanceUSD < wagerUSD) {
        setAutoSpinRemaining(0);
        pushCallout(2, 1, "INSUFFICIENT FUNDS", `$${wagerUSD.toFixed(2)} NEEDED`, "crimson");
        return;
      }

      // Debit wallet immediately
      const balanceAfterDebit = Math.round((balanceUSD - wagerUSD) * 100) / 100;
      updateBalance(balanceAfterDebit);
      setLastWinUSD(0);
      setWinBanner(null);
      setWinningCells(new Set());
      setRazorFlashReels(Array(REEL_COUNT).fill(false));

      const currentNonce = nonce;
      setNonce((n) => n + 1);
      const proofHash = await sha256Hex(
        `${serverSeed}:${clientSeed}:${currentNonce}`
      );
      setLastProofHash(proofHash);

      // Direct Feature Buy -> Land 3, 4, or 5 Guard Tower Scatters and launch Lockdown!
      if (featureDef) {
        setSpinPhase("SPINNING");
        const scatterTarget = featureDef.tier + 2; // 3, 4, or 5 scatters
        const buyOutcome = generateInitialGrid(
          activeRtpPercent,
          null,
          scatterTarget
        );

        await sleep(turboMode ? 220 : 420);
        for (let c = 0; c < REEL_COUNT; c++) {
          audioRef.current?.playIronCellSlam(c);
          if (!turboMode) await sleep(50);
        }

        setMainGrid(buyOutcome.mainGrid);
        setTopEnhancers(buyOutcome.topEnhancers);
        setBottomEnhancers(buyOutcome.bottomEnhancers);

        await sleep(turboMode ? 280 : 600);
        if (!mountedRef.current) return;

        // Determine unlocked reels (matching featureDef.unlockedReels)
        const unlocked = buyOutcome.mainGrid.map((colCells) =>
          colCells.some((c) => c.symbol === "scatter_tower")
        );
        // Ensure exact count
        let countUnlocked = unlocked.filter(Boolean).length;
        for (let c = 0; c < REEL_COUNT && countUnlocked < featureDef.unlockedReels; c++) {
          if (!unlocked[c]) {
            unlocked[c] = true;
            countUnlocked++;
          }
        }

        // Note: balanceAfterDebit is captured inside runLockdownSession via closure only if passed;
        // let's make sure updateBalance inside runLockdownSession uses fresh balanceAfterDebit.
        // We'll pass a tiny wrapper or rely on updated state—actually since balanceUSD prop may lag 1 render,
        // let's pass explicit remaining balance handling! Let's fix runLockdownSession's balance credit carefully:
        await runLockdownSessionWithDebit(
          featureDef.tier,
          unlocked,
          wagerUSD,
          balanceAfterDebit,
          proofHash
        );
        return;
      }

      // Normal Base Spin
      setSpinPhase("SPINNING");
      const outcome = generateInitialGrid(activeRtpPercent, null);

      await sleep(turboMode ? 200 : 420);
      if (!mountedRef.current) return;

      for (let c = 0; c < REEL_COUNT; c++) {
        audioRef.current?.playIronCellSlam(c);
        if (!turboMode) await sleep(55);
      }

      setMainGrid(outcome.mainGrid);
      setSpinPhase("ENHANCING");

      const anyUnlocked = outcome.unlockedReelsThisSpin.some(Boolean);
      if (anyUnlocked) {
        audioRef.current?.playGateUnlock();
      }
      setTopEnhancers(outcome.topEnhancers);
      setBottomEnhancers(outcome.bottomEnhancers);

      const anyXways =
        outcome.topEnhancers.some((e) => e.kind === "xways") ||
        outcome.bottomEnhancers.some((e) => e.kind === "xways");
      const anyRazor =
        outcome.topEnhancers.some((e) => e.kind === "razor_split") ||
        outcome.bottomEnhancers.some((e) => e.kind === "razor_split");
      if (anyXways) audioRef.current?.playXwaysUnpack();
      if (anyRazor) {
        audioRef.current?.playRazorSlash(false);
        setRazorFlashReels(
          outcome.topEnhancers.map(
            (t, idx) =>
              t.kind === "razor_split" ||
              outcome.bottomEnhancers[idx].kind === "razor_split"
          )
        );
      }

      if (outcome.scatterCount === 1 || outcome.scatterCount === 2) {
        pushCallout(
          2,
          0,
          "TOWER WILD!",
          "ENHANCER CELLS OPENED",
          "gold"
        );
      }

      await sleep(turboMode ? 190 : 380);
      if (!mountedRef.current) return;

      // Evaluate Base Spin Win
      setSpinPhase("EVALUATING");
      const evalRes = calculateSanQuentinWaysWin(
        outcome.mainGrid,
        outcome.topEnhancers,
        outcome.bottomEnhancers,
        baseBetUSD,
        null
      );
      setActiveWinWays(evalRes.totalActiveWays);
      setWinningCells(evalRes.winningCells);

      const maxCapUSD = baseBetUSD * MAX_WIN_MULT;
      const baseWinUSD =
        Math.round(Math.min(maxCapUSD, evalRes.totalWinUSD) * 100) / 100;

      if (baseWinUSD > 0) {
        updateBalance(balanceAfterDebit + baseWinUSD);
        setLastWinUSD(baseWinUSD);
        const mult = baseWinUSD / baseBetUSD;
        audioRef.current?.playWinHit(mult);
        if (mult >= 20) {
          setScreenShake(true);
          setTimeout(() => mountedRef.current && setScreenShake(false), 450);
        }
        pushCallout(
          2,
          1,
          `+$${baseWinUSD.toFixed(2)}`,
          `${evalRes.totalActiveWays.toLocaleString()} WAYS`,
          mult >= 15 ? "gold" : "cyan"
        );
      }

      // Check Natural 3, 4, or 5 Guard Tower Scatters -> Lockdown Spins!
      if (outcome.scatterCount >= 3) {
        const tier: LockdownTier =
          outcome.scatterCount >= 5 ? 3 : outcome.scatterCount === 4 ? 2 : 1;
        const unlocked = outcome.mainGrid.map((colCells) =>
          colCells.some((c) => c.symbol === "scatter_tower")
        );
        await sleep(turboMode ? 350 : 750);
        await runLockdownSessionWithDebit(
          tier,
          unlocked,
          wagerUSD,
          balanceAfterDebit + baseWinUSD,
          proofHash
        );
        return;
      }

      emitBetRecord(
        wagerUSD,
        baseWinUSD,
        "Base Spin",
        evalRes.totalActiveWays,
        proofHash
      );

      if (baseWinUSD / baseBetUSD >= 20) {
        setWinBanner({
          tierLabel:
            baseWinUSD / baseBetUSD >= 100
              ? "MEGA PRISON RIOT!"
              : "BIG YARD WIN!",
          amountUSD: baseWinUSD,
          mult: baseWinUSD / baseBetUSD,
          isMaxWin: baseWinUSD >= maxCapUSD,
        });
      }

      await sleep(turboMode ? 220 : 480);
      if (mountedRef.current) {
        setSpinPhase("IDLE");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeRtpPercent,
      balanceUSD,
      baseBetUSD,
      clientSeed,
      nonce,
      serverSeed,
      spinPhase,
      turboMode,
    ]
  );

  // Wrapper ensuring exact post-debit wallet balance is credited after Lockdown Spins
  const runLockdownSessionWithDebit = useCallback(
    async (
      tier: LockdownTier,
      unlockedReels: boolean[],
      initialWagerUSD: number,
      balanceBeforeBonusWin: number,
      initialProofHash: string
    ) => {
      setAutoSpinRemaining(0);
      setSpinPhase("LOCKDOWN_SETUP");
      setWinningCells(new Set());
      audioRef.current?.playPrisonSiren();

      const topSetup: EnhancerContent[] = unlockedReels.map((isOpen) =>
        isOpen
          ? {
              kind: "setup_spins",
              spins: pickWeighted([
                { item: 1, weight: 52 },
                { item: 2, weight: 36 },
                { item: 3, weight: 12 },
              ]),
            }
          : { kind: "locked" }
      );
      const botSetup: EnhancerContent[] = unlockedReels.map((isOpen) =>
        isOpen
          ? {
              kind: "setup_spins",
              spins: pickWeighted([
                { item: 1, weight: 52 },
                { item: 2, weight: 36 },
                { item: 3, weight: 12 },
              ]),
            }
          : { kind: "locked" }
      );

      let startingSpins = 0;
      for (let c = 0; c < REEL_COUNT; c++) {
        const t = topSetup[c];
        const b = botSetup[c];
        if (t.kind === "setup_spins") startingSpins += t.spins;
        if (b.kind === "setup_spins") startingSpins += b.spins;
      }

      const specialInmate = pickWeighted<InmateSymbolId>([
        { item: "inmate_joe", weight: 24 },
        { item: "inmate_bill", weight: 22 },
        { item: "inmate_heinrich", weight: 20 },
        { item: "inmate_luis", weight: 18 },
        { item: "inmate_beefy", weight: 16 },
      ]);
      const specialInmateMult = 4 + Math.floor(secureRand() * 12);

      const jumpingWilds: JumpingWildState[] = [];
      for (let i = 0; i < tier; i++) {
        jumpingWilds.push({
          id: `jw-${i + 1}`,
          col: i % REEL_COUNT,
          row: i % MAIN_ROWS,
          multiplier: 1,
        });
      }

      let activeLockdown: LockdownState = {
        active: true,
        tier,
        unlockedReels,
        spinsLeft: startingSpins,
        totalSpinsAwarded: startingSpins,
        spinsPlayed: 0,
        totalWinUSD: 0,
        specialInmate,
        specialInmateMult,
        jumpingWilds,
        setupPhaseLabel: `LOCKDOWN UNLOCKED: ${startingSpins} SPINS • ${INMATE_THEMES[specialInmate].shortName} ${specialInmateMult}x`,
      };

      setTopEnhancers(topSetup);
      setBottomEnhancers(botSetup);
      setLockdownState(activeLockdown);

      await sleep(turboMode ? 900 : 1850);
      if (!mountedRef.current) return;

      activeLockdown = { ...activeLockdown, setupPhaseLabel: undefined };
      setLockdownState(activeLockdown);

      const maxCapUSD = baseBetUSD * MAX_WIN_MULT;
      let peakWays = 243;

      while (
        activeLockdown.spinsLeft > 0 &&
        activeLockdown.totalWinUSD < maxCapUSD &&
        mountedRef.current
      ) {
        activeLockdown = {
          ...activeLockdown,
          spinsLeft: activeLockdown.spinsLeft - 1,
          spinsPlayed: activeLockdown.spinsPlayed + 1,
        };
        setLockdownState({ ...activeLockdown });
        setSpinPhase("SPINNING");
        setWinningCells(new Set());
        setRazorFlashReels(Array(REEL_COUNT).fill(false));

        const spinOutcome = generateInitialGrid(
          activeRtpPercent,
          activeLockdown
        );

        await sleep(turboMode ? 220 : 440);
        if (!mountedRef.current) return;

        for (let c = 0; c < REEL_COUNT; c++) {
          audioRef.current?.playIronCellSlam(c);
          if (!turboMode) await sleep(50);
        }

        setMainGrid(spinOutcome.mainGrid);
        setSpinPhase("ENHANCING");
        setTopEnhancers(spinOutcome.topEnhancers);
        setBottomEnhancers(spinOutcome.bottomEnhancers);

        const anyXways =
          spinOutcome.topEnhancers.some((e) => e.kind === "xways") ||
          spinOutcome.bottomEnhancers.some((e) => e.kind === "xways");
        const anyRazor =
          spinOutcome.topEnhancers.some((e) => e.kind === "razor_split") ||
          spinOutcome.bottomEnhancers.some((e) => e.kind === "razor_split");
        const doubledAnyJW = spinOutcome.nextJumpingWilds.some(
          (j) => j.justDoubled
        );

        if (anyXways) audioRef.current?.playXwaysUnpack();
        if (anyRazor) {
          audioRef.current?.playRazorSlash(doubledAnyJW);
          setRazorFlashReels(
            spinOutcome.topEnhancers.map(
              (t, idx) =>
                t.kind === "razor_split" ||
                spinOutcome.bottomEnhancers[idx].kind === "razor_split"
            )
          );
        }

        for (const jw of spinOutcome.nextJumpingWilds) {
          if (jw.justDoubled) {
            pushCallout(
              jw.col,
              jw.row,
              `WILD ${jw.multiplier}x!`,
              "RAZOR DOUBLED",
              "cyan"
            );
          }
        }

        if (spinOutcome.extraSpinsAwarded > 0) {
          audioRef.current?.playGateUnlock();
          activeLockdown = {
            ...activeLockdown,
            spinsLeft: activeLockdown.spinsLeft + spinOutcome.extraSpinsAwarded,
            totalSpinsAwarded:
              activeLockdown.totalSpinsAwarded + spinOutcome.extraSpinsAwarded,
          };
          pushCallout(
            2,
            1,
            `+${spinOutcome.extraSpinsAwarded} EXTRA SPIN`,
            "TOWER JUMPING WILD",
            "crimson"
          );
        }

        activeLockdown = {
          ...activeLockdown,
          jumpingWilds: spinOutcome.nextJumpingWilds,
        };
        setLockdownState({ ...activeLockdown });

        await sleep(turboMode ? 200 : 400);
        if (!mountedRef.current) return;

        setSpinPhase("EVALUATING");
        const evalResult = calculateSanQuentinWaysWin(
          spinOutcome.mainGrid,
          spinOutcome.topEnhancers,
          spinOutcome.bottomEnhancers,
          baseBetUSD,
          activeLockdown
        );
        peakWays = Math.max(peakWays, evalResult.totalActiveWays);
        setActiveWinWays(evalResult.totalActiveWays);
        setWinningCells(evalResult.winningCells);

        if (evalResult.totalWinUSD > 0) {
          const remainingAllowance = Math.max(
            0,
            maxCapUSD - activeLockdown.totalWinUSD
          );
          const cappedSpinWin = Math.min(
            remainingAllowance,
            evalResult.totalWinUSD
          );
          const nextTotalWin = activeLockdown.totalWinUSD + cappedSpinWin;
          activeLockdown = {
            ...activeLockdown,
            totalWinUSD: nextTotalWin,
          };
          setLockdownState({ ...activeLockdown });
          setLastWinUSD(nextTotalWin);

          const spinMult = cappedSpinWin / baseBetUSD;
          audioRef.current?.playWinHit(spinMult);
          if (spinMult >= 25) {
            setScreenShake(true);
            setTimeout(() => mountedRef.current && setScreenShake(false), 500);
          }
          pushCallout(
            2,
            1,
            `+$${cappedSpinWin.toFixed(2)}`,
            `${evalResult.totalActiveWays.toLocaleString()} WAYS`,
            spinMult >= 20 ? "gold" : "crimson"
          );
          await sleep(turboMode ? 520 : 980);
        } else {
          await sleep(turboMode ? 240 : 480);
        }
      }

      if (!mountedRef.current) return;

      const finalBonusWin = Math.round(activeLockdown.totalWinUSD * 100) / 100;
      const finalMult = finalBonusWin / baseBetUSD;
      const isMaxWin = finalMult >= MAX_WIN_MULT - 0.01;

      if (finalBonusWin > 0) {
        updateBalance(balanceBeforeBonusWin + finalBonusWin);
      }

      emitBetRecord(
        initialWagerUSD,
        finalBonusWin,
        `Lockdown ${tier} JW`,
        peakWays,
        initialProofHash
      );

      if (finalMult >= 15 || isMaxWin) {
        setWinBanner({
          tierLabel: isMaxWin
            ? "150,000x PSYCHO MANHUNT MAX WIN!"
            : finalMult >= 250
            ? "PSYCHO MANHUNT WIN!"
            : finalMult >= 60
            ? "MEGA RIOT WIN!"
            : "LOCKDOWN BIG WIN!",
          amountUSD: finalBonusWin,
          mult: finalMult,
          isMaxWin,
        });
      }

      setLockdownState(null);
      setSpinPhase("IDLE");
    },
    [
      activeRtpPercent,
      baseBetUSD,
      emitBetRecord,
      pushCallout,
      turboMode,
      updateBalance,
    ]
  );

  // Unused callback suppressor note: keep runLockdownSession clean or avoid dead ref
  void runLockdownSession;

  // Auto-spin driver
  useEffect(() => {
    if (
      autoSpinRemaining > 0 &&
      spinPhase === "IDLE" &&
      !lockdownState?.active &&
      !winBanner
    ) {
      const t = setTimeout(() => {
        setAutoSpinRemaining((n) => Math.max(0, n - 1));
        executeSpin();
      }, turboMode ? 240 : 520);
      return () => clearTimeout(t);
    }
  }, [
    autoSpinRemaining,
    executeSpin,
    lockdownState?.active,
    spinPhase,
    turboMode,
    winBanner,
  ]);

  // Spacebar shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !showFairness &&
        !showPaytable &&
        confirmBuyTier === null
      ) {
        e.preventDefault();
        if (spinPhase === "IDLE" && !lockdownState?.active) {
          executeSpin();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmBuyTier, executeSpin, lockdownState?.active, showFairness, showPaytable, spinPhase]);

  const unlockedCount = useMemo(() => {
    return topEnhancers.filter((e) => e.kind !== "locked").length;
  }, [topEnhancers]);

  return (
    <section
      style={{
        backgroundImage: `url(${ZYAN_SLOTS_ASSETS.ZYAN_SAN_QUENTIN.STAGE_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      className={`font-ui relative min-h-[calc(100vh-45px)] w-full overflow-hidden bg-gradient-to-b from-[#0b0d13] via-[#121620] to-[#08090e] text-white ${
        screenShake ? "animate-[zyanHunterShake_0.45s_ease-in-out]" : ""
      }`}
    >
      {/* Concrete Prison Yard Ambient Vignette & Searchlight Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,9,14,0.4)_0%,rgba(8,9,14,0.88)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.12),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(220,38,38,0.12),transparent_58%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, #94a3b8 0px, #94a3b8 2px, transparent 2px, transparent 54px)",
        }}
      />

      {/* Main Arena Container */}
      <div className="relative z-10 mx-auto flex max-w-[1380px] flex-col gap-3 px-2.5 py-3 sm:px-5 sm:py-4">
        {/* TOP HEADER BAR */}
        <header className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/85 px-3 py-2.5 shadow-xl backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-24 shrink-0 overflow-hidden rounded-md sm:h-9 sm:w-28">
              <ProtectedArt
                src={ZYAN_LOGO_URL}
                alt="ZYAN.GG"
                className="h-full w-full object-contain mix-blend-lighten"
              />
            </div>
            <div className="h-6 w-px bg-slate-700/80" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display bg-gradient-to-r from-slate-100 via-amber-300 to-red-500 bg-clip-text text-sm font-black uppercase tracking-wider text-transparent sm:text-xl">
                  ZYAN SAN QUENTIN xWAYS
                </h1>
                <span className="font-display whitespace-nowrap rounded border border-red-500/70 bg-gradient-to-r from-red-950 to-amber-950 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300 shadow-[0_0_12px_rgba(239,68,68,0.35)] sm:text-xs">
                  PSYCHO MANHUNT • MAX WIN 150,000x
                </span>
              </div>
              <p className="hidden text-[11px] font-semibold text-slate-400 sm:block">
                Cell Block D • {username} • Top &amp; Bottom Enhancers • xWays 4-Stacks • Razor Split Doublers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/35 px-3 py-1.5 text-right">
              <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/80">
                Balance
              </div>
              <div className="font-ui whitespace-nowrap text-sm font-black text-emerald-300 sm:text-base">
                $
                {balanceUSD.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowFairness(true)}
              aria-label="Provably Fair"
              className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-slate-200 transition hover:border-amber-400/60 hover:text-amber-300"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="hidden md:inline">Fairness</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPaytable(true)}
              aria-label="Paytable and Rules"
              className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-slate-200 transition hover:border-amber-400/60 hover:text-amber-300"
            >
              <Info className="h-4 w-4 text-amber-400" />
              <span className="hidden md:inline">Paytable</span>
            </button>

            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute audio" : "Mute audio"}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-amber-400/60 hover:text-amber-300"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-red-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-amber-400" />
              )}
            </button>
          </div>
        </header>

        {/* CENTER STAGE: LEFT FEATURE BUY STACK + 5-REEL ENHANCER STAGE + RIGHT SUMMARY */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[248px_minmax(0,1fr)]">
          {/* LEFT NOLIMIT FEATURE BUY PANEL */}
          <aside className="flex flex-col gap-2.5 rounded-2xl border border-slate-700/80 bg-slate-950/85 p-3 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <Skull className="h-4 w-4 text-red-500" />
                <span className="font-display text-xs font-black uppercase tracking-wider text-amber-300">
                  Nolimit Bonus Buy
                </span>
              </div>
              <span className="text-[10px] font-bold text-slate-400">
                {activeRtpPercent.toFixed(1)}% RTP
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {FEATURE_BUYS.map((fb) => {
                const costUSD = baseBetUSD * fb.costMult;
                const disabled = isBusy || Boolean(lockdownState?.active);
                return (
                  <button
                    key={fb.tier}
                    type="button"
                    disabled={disabled}
                    onClick={() => setConfirmBuyTier(fb.tier)}
                    className={`group relative flex flex-col gap-1 rounded-xl border bg-gradient-to-br p-2.5 text-left transition ${fb.accentClass} disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display whitespace-nowrap text-xs font-black uppercase text-white">
                        {fb.title}
                      </span>
                      <span className="font-display whitespace-nowrap rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                        {fb.badgeText}
                      </span>
                    </div>
                    <p className="text-[10px] font-semibold text-slate-300">
                      {fb.subtitle}
                    </p>
                    <div className="mt-0.5 flex items-center justify-between border-t border-white/10 pt-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Buy Cost
                      </span>
                      <span className="font-ui whitespace-nowrap text-xs font-black text-emerald-300">
                        $
                        {costUSD.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Live Jumping Wilds & Enhancer Telemetry */}
            <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
              <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Cell Block Status</span>
                <span className="text-amber-300">
                  {unlockedCount}/5 Reels Open
                </span>
              </div>
              {lockdownState?.active ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-red-400">Lockdown Spins</span>
                    <span className="font-ui text-white">
                      {lockdownState.spinsLeft} Left
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-amber-300">Special Inmate</span>
                    <span className="font-display text-[11px] font-black text-amber-200">
                      {INMATE_THEMES[lockdownState.specialInmate].shortName}{" "}
                      {lockdownState.specialInmateMult}x
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {lockdownState.jumpingWilds.map((jw, idx) => (
                      <span
                        key={jw.id}
                        className="font-ui rounded border border-amber-400/60 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-black text-amber-200"
                      >
                        JW#{idx + 1}: {jw.multiplier}x
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] leading-snug text-slate-400">
                  Land <strong className="text-amber-300">Guard Towers</strong>{" "}
                  to open Top &amp; Bottom Enhancers for{" "}
                  <strong className="text-amber-300">xWays (4-Stack)</strong> &amp;{" "}
                  <strong className="text-cyan-300">Razor Split</strong>.
                </p>
              )}
            </div>
          </aside>

          {/* CENTER 5-REEL + TOP/BOTTOM ENHANCERS ARENA */}
          <div className="flex flex-col gap-2.5">
            <div className="relative overflow-hidden rounded-2xl border-2 border-slate-700/90 bg-gradient-to-b from-[#171b26] via-[#0e1118] to-[#171b26] p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.8)] sm:p-4">
              {/* Top Arena Status Strip: Live Active Win Ways + Lockdown Meter */}
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-950/90 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span className="font-display text-[11px] font-black uppercase tracking-wider text-slate-300 sm:text-xs">
                    ACTIVE WIN WAYS:
                  </span>
                  <span className="font-ui text-sm font-black text-amber-300 sm:text-base">
                    {activeWinWays.toLocaleString("en-US")}
                  </span>
                </div>

                {lockdownState?.active ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display whitespace-nowrap rounded bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                      SPINS LEFT: {lockdownState.spinsLeft}
                    </span>
                    <span className="font-display whitespace-nowrap rounded border border-amber-400/70 bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-amber-200">
                      {INMATE_THEMES[lockdownState.specialInmate].shortName}{" "}
                      {lockdownState.specialInmateMult}x
                    </span>
                    <span className="font-ui whitespace-nowrap text-xs font-black text-emerald-300">
                      BONUS WIN: ${lockdownState.totalWinUSD.toFixed(2)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Last Win:
                    </span>
                    <span className="font-ui text-sm font-black text-emerald-300">
                      ${lastWinUSD.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* 5-REEL GRID: TOP ENHANCERS -> MAIN 5x3 GRID -> BOTTOM ENHANCERS */}
              <div className="relative select-none">
                {/* 1. TOP 5 ENHANCER CELLS */}
                <div className="mb-1.5 grid grid-cols-5 gap-1.5 sm:gap-2.5">
                  {topEnhancers.map((enh, col) => (
                    <div key={`top-${col}`} className="relative">
                      <EnhancerCellTile
                        content={enh}
                        isWinning={winningCells.has(`top-${col}`)}
                      />
                    </div>
                  ))}
                </div>

                {/* Steel Divider Strip */}
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-500/80">
                    ▲ TOP ENHANCER CELLS
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    5×3 CELL BLOCK
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-500/80">
                    BOTTOM ENHANCERS ▼
                  </span>
                </div>

                {/* 2. MAIN 5x3 PLAYABLE GRID */}
                <div className="relative grid grid-cols-5 gap-1.5 rounded-xl border border-slate-700/75 bg-slate-950/75 p-1.5 sm:gap-2.5 sm:p-2.5">
                  {mainGrid.map((colCells, colIdx) => (
                    <div
                      key={`reel-${colIdx}`}
                      className={`relative flex flex-col gap-1.5 sm:gap-2.5 ${
                        spinPhase === "SPINNING" ? "opacity-75" : "opacity-100"
                      }`}
                    >
                      {/* Razor Split Vertical Flash */}
                      {razorFlashReels[colIdx] && (
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-1 -translate-x-1/2 bg-gradient-to-b from-cyan-300 via-white to-cyan-300 shadow-[0_0_20px_#22d3ee]"
                          style={{
                            animation: "zyanRazorSlice 0.55s ease-out forwards",
                          }}
                        />
                      )}

                      {colCells.map((cell, rowIdx) => {
                        const isWin = winningCells.has(`main-${colIdx}-${rowIdx}`);
                        const isSpecialInmate =
                          Boolean(lockdownState?.active) &&
                          cell.symbol === lockdownState?.specialInmate;
                        const isJW =
                          cell.symbol === "jumping_wild" ||
                          Boolean(cell.isTempExtraJumpWild);

                        return (
                          <div
                            key={cell.uid}
                            className={`relative aspect-square w-full transition-transform duration-200 ${
                              isWin
                                ? "z-20 scale-[1.04] ring-2 ring-amber-300 rounded-lg shadow-[0_0_18px_rgba(250,204,21,0.75)]"
                                : ""
                            }`}
                            style={
                              spinPhase === "SPINNING"
                                ? {
                                    animation: `zyanReelDropOut 0.22s ease-in ${colIdx * 35}ms forwards`,
                                  }
                                : isJW
                                ? {
                                    animation:
                                      "zyanJumpWildHop 0.42s cubic-bezier(0.22,1,0.36,1)",
                                  }
                                : {
                                    animation: `zyanReelDropIn 0.34s cubic-bezier(0.22,1,0.36,1) ${colIdx * 45}ms both`,
                                  }
                            }
                          >
                            <SanQuentinSymbolGraphic
                              symbol={cell.symbol}
                              splitCount={cell.splitCount}
                              jumpingWildMult={cell.jumpingWildMult}
                              isTempExtraJumpWild={cell.isTempExtraJumpWild}
                              isScatterTurnedWild={cell.isScatterTurnedWild}
                              isSpecialInmate={isSpecialInmate}
                              specialInmateMult={
                                lockdownState?.specialInmateMult || 1
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Floating Callouts Overlay */}
                  {callouts.map((c) => (
                    <div
                      key={c.id}
                      className="pointer-events-none absolute z-30 whitespace-nowrap"
                      style={{
                        left: `${(c.col + 0.5) * 20}%`,
                        top: `${(c.row + 0.5) * 33.3}%`,
                        animation: "zyanFloatCallout 1.4s ease-out forwards",
                      }}
                    >
                      <div
                        className={`font-display rounded-lg border px-2.5 py-1 text-center shadow-2xl ${
                          c.tone === "cyan"
                            ? "border-cyan-300 bg-cyan-950/95 text-cyan-200"
                            : c.tone === "crimson"
                            ? "border-red-400 bg-red-950/95 text-amber-200"
                            : "border-amber-300 bg-slate-950/95 text-amber-300"
                        }`}
                      >
                        <div className="text-xs font-black uppercase sm:text-sm">
                          {c.text}
                        </div>
                        {c.subtext && (
                          <div className="text-[9px] font-bold uppercase tracking-wider text-white/85">
                            {c.subtext}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Pre-Lockdown Setup Intro Banner */}
                  {spinPhase === "LOCKDOWN_SETUP" &&
                    lockdownState?.setupPhaseLabel && (
                      <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px]">
                        <div className="rounded-2xl border-2 border-amber-400 bg-gradient-to-b from-red-950/95 via-slate-950 to-slate-950 px-5 py-4 text-center shadow-[0_0_40px_rgba(239,68,68,0.65)]">
                          <div className="font-display text-xs font-black uppercase tracking-widest text-red-400">
                            PRISON LOCKDOWN INITIATED
                          </div>
                          <div className="font-display mt-1 text-base font-black uppercase text-amber-300 sm:text-xl">
                            {lockdownState.setupPhaseLabel}
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-300">
                            {lockdownState.tier} Jumping Wild
                            {lockdownState.tier > 1 ? "s" : ""} Active • Up to
                            512x Each
                          </div>
                        </div>
                      </div>
                    )}
                </div>

                {/* 3. BOTTOM 5 ENHANCER CELLS */}
                <div className="mt-1.5 grid grid-cols-5 gap-1.5 sm:gap-2.5">
                  {bottomEnhancers.map((enh, col) => (
                    <div key={`bot-${col}`} className="relative">
                      <EnhancerCellTile
                        content={enh}
                        isWinning={winningCells.has(`bot-${col}`)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CONTROL BAR (BET LADDER, AUTO-SPIN, TURBO, SPIN BUTTON) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-700/80 bg-slate-950/90 px-3 py-2.5 shadow-xl sm:px-5">
              {/* Bet Selector */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isBusy || Boolean(lockdownState?.active) || betIndex === 0}
                  onClick={() => setBetIndex((i) => Math.max(0, i - 1))}
                  aria-label="Decrease bet"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-amber-400 disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="min-w-[92px] rounded-xl border border-slate-700/80 bg-slate-900/90 px-3 py-1 text-center">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Base Bet
                  </div>
                  <div className="font-ui whitespace-nowrap text-sm font-black text-white">
                    ${baseBetUSD.toFixed(2)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={
                    isBusy ||
                    Boolean(lockdownState?.active) ||
                    betIndex === BET_LADDER_USD.length - 1
                  }
                  onClick={() =>
                    setBetIndex((i) =>
                      Math.min(BET_LADDER_USD.length - 1, i + 1)
                    )
                  }
                  aria-label="Increase bet"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-amber-400 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Turbo + Autoplay + Main Spin CTA */}
              <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTurboMode((t) => !t)}
                  className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-black uppercase transition ${
                    turboMode
                      ? "border-amber-400 bg-amber-500/20 text-amber-300"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                  }`}
                >
                  <Flame className="h-3.5 w-3.5" />
                  <span>Turbo</span>
                </button>

                {autoSpinRemaining > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAutoSpinRemaining(0)}
                    className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-red-500 bg-red-600/20 px-3 text-xs font-black uppercase text-red-300"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span>Stop ({autoSpinRemaining})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy || Boolean(lockdownState?.active)}
                    onClick={() => setAutoSpinRemaining(25)}
                    className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-black uppercase text-slate-200 transition hover:border-amber-400 disabled:opacity-45"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Auto 25</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isBusy || Boolean(lockdownState?.active)}
                  onClick={() => executeSpin()}
                  className="font-display flex h-11 min-w-[140px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-red-600 px-6 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.5)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {lockdownState?.active ? (
                    <>
                      <Unlock className="h-4 w-4" />
                      <span>LOCKDOWN ({lockdownState.spinsLeft})</span>
                    </>
                  ) : isBusy ? (
                    <span>SPINNING...</span>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>SPIN</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* COMPACT SESSION HISTORY STRIP */}
            {history.length > 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-display text-xs font-black uppercase tracking-wider text-slate-300">
                    Recent Cell Block Spins
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Last {history.length} Verified Rolls
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] font-bold uppercase text-slate-500">
                        <th className="py-1.5 pr-3">Mode</th>
                        <th className="py-1.5 pr-3">Wager</th>
                        <th className="py-1.5 pr-3">Ways</th>
                        <th className="py-1.5 pr-3">Mult</th>
                        <th className="py-1.5 text-right">Payout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {history.slice(0, 6).map((h) => (
                        <tr key={h.id} className="text-slate-300">
                          <td className="py-1.5 pr-3 font-semibold">{h.mode}</td>
                          <td className="font-ui py-1.5 pr-3">
                            ${h.wagerUSD.toFixed(2)}
                          </td>
                          <td className="font-ui py-1.5 pr-3 text-slate-400">
                            {h.ways.toLocaleString()}
                          </td>
                          <td className="font-ui py-1.5 pr-3 font-bold text-amber-300">
                            {h.multiplier.toFixed(2)}x
                          </td>
                          <td
                            className={`font-ui py-1.5 text-right font-black ${
                              h.payoutUSD > 0
                                ? "text-emerald-400"
                                : "text-slate-500"
                            }`}
                          >
                            ${h.payoutUSD.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER WATERMARK */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 overflow-hidden">
              <ProtectedArt
                src={ZYAN_LOGO_URL}
                alt="ZYAN.GG"
                className="h-full w-full object-contain mix-blend-lighten"
              />
            </div>
            <span>ZYAN SAN QUENTIN xWAYS • Extreme Volatility Engine</span>
          </div>
          <span className="font-ui">
            243 to 46,656+ Win Ways • Max Cap 150,000x Base Bet
          </span>
        </footer>
      </div>

      {/* FEATURE BUY CONFIRMATION MODAL */}
      {confirmBuyTier !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          {(() => {
            const fb = FEATURE_BUYS.find((f) => f.tier === confirmBuyTier)!;
            const costUSD = baseBetUSD * fb.costMult;
            const canAfford = balanceUSD >= costUSD;
            return (
              <div className="w-full max-w-md rounded-2xl border border-amber-400/60 bg-slate-950 p-5 shadow-2xl">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-red-400">
                      Confirm Lockdown Entry
                    </div>
                    <h2 className="font-display mt-0.5 text-lg font-black uppercase text-white">
                      {fb.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmBuyTier(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-slate-300">
                  {fb.subtitle}. Top &amp; Bottom Enhancers roll starting spins,
                  a random Inmate gets a permanent{" "}
                  <strong className="text-amber-300">4x–15x</strong> multiplier,
                  and Razor Splits double Jumping Wilds up to{" "}
                  <strong className="text-cyan-300">512x</strong>!
                </p>

                <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-3">
                  <span className="text-xs font-bold uppercase text-slate-400">
                    Total Cost ({fb.badgeText})
                  </span>
                  <span className="font-ui text-lg font-black text-emerald-300">
                    $
                    {costUSD.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmBuyTier(null)}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-xs font-black uppercase text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!canAfford}
                    onClick={() => {
                      const tierToBuy = confirmBuyTier;
                      setConfirmBuyTier(null);
                      executeSpin(tierToBuy);
                    }}
                    className="font-display flex-1 rounded-xl bg-gradient-to-r from-amber-400 to-red-600 py-2.5 text-xs font-black uppercase text-slate-950 shadow-lg hover:brightness-110 disabled:opacity-45"
                  >
                    {canAfford ? "Buy & Start" : "Insufficient Funds"}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* BIG WIN / 150,000x MAX WIN CELEBRATION MODAL */}
      {winBanner && (
        <div
          onClick={() => setWinBanner(null)}
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-3xl border-2 border-amber-400 bg-gradient-to-b from-red-950 via-slate-950 to-slate-950 p-6 text-center shadow-[0_0_80px_rgba(251,191,36,0.45)]">
            <Trophy className="mx-auto h-14 w-14 text-amber-300" />
            <div className="font-display mt-2 text-xs font-black uppercase tracking-widest text-red-400">
              {winBanner.isMaxWin ? "CAP REACHED" : "CELL BLOCK PAYOUT"}
            </div>
            <h2 className="font-display mt-1 bg-gradient-to-r from-amber-200 via-yellow-400 to-red-400 bg-clip-text text-2xl font-black uppercase text-transparent sm:text-3xl">
              {winBanner.tierLabel}
            </h2>
            <div className="font-ui mt-3 text-4xl font-black text-emerald-300 sm:text-5xl">
              $
              {winBanner.amountUSD.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="font-ui mt-1 text-sm font-black text-amber-300">
              {winBanner.mult.toFixed(2)}x Base Bet
            </div>
            <p className="mt-4 text-xs font-semibold text-slate-400">
              Click anywhere to return to Cell Block D
            </p>
          </div>
        </div>
      )}

      {/* PAYTABLE & MECHANICS MODAL */}
      {showPaytable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-display text-base font-black uppercase text-amber-300">
                San Quentin xWays — Paytable &amp; Mechanics
              </h2>
              <button
                type="button"
                onClick={() => setShowPaytable(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-slate-300">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                  <div className="font-display font-black uppercase text-amber-300">
                    Top &amp; Bottom Enhancer Cells
                  </div>
                  <p className="mt-1 leading-relaxed text-slate-400">
                    Start locked behind steel bars. Guard Tower Scatters unlock
                    them to reveal High-Pay Inmates, Wilds,{" "}
                    <strong className="text-amber-300">xWays (4-Stack)</strong>{" "}
                    or <strong className="text-cyan-300">Razor Split</strong>!
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                  <div className="font-display font-black uppercase text-cyan-300">
                    Razor Split &amp; Jumping Wilds
                  </div>
                  <p className="mt-1 leading-relaxed text-slate-400">
                    Razor Split doubles main-reel regular symbols (×4 if both
                    Top &amp; Bottom hit!). In Lockdown Spins, any Razor Split
                    on a Jumping Wild&apos;s reel doubles that Wild up to{" "}
                    <strong className="text-amber-300">512x</strong>!
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-display mb-2 text-xs font-black uppercase text-white">
                  Symbol Payouts (× Base Bet per Way)
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {ALL_REGULAR_IDS.map((sym) => {
                    const [p3, p4, p5] = PAYTABLE[sym];
                    return (
                      <div
                        key={sym}
                        className="flex flex-col items-center rounded-xl border border-slate-800 bg-slate-900/70 p-2 text-center"
                      >
                        <div className="h-12 w-12">
                          <SanQuentinSymbolGraphic symbol={sym} />
                        </div>
                        <div className="mt-1 truncate text-[10px] font-bold text-slate-200">
                          {SYMBOL_LABELS[sym]}
                        </div>
                        <div className="font-ui mt-1 text-[10px] text-slate-400">
                          5: <strong className="text-amber-300">{p5.toFixed(2)}x</strong>
                          <br />
                          4: {p4.toFixed(2)}x • 3: {p3.toFixed(2)}x
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROVABLY FAIR MODAL */}
      {showFairness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/40 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
                <h2 className="font-display text-sm font-black uppercase text-white">
                  SHA-256 Provably Fair Verifier
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowFairness(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400">
                  Client Seed
                </label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    type="text"
                    value={clientSeed}
                    onChange={(e) => setClientSeed(e.target.value)}
                    className="font-ui flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setClientSeed(randomHex(12))}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-amber-300 hover:border-amber-400"
                    aria-label="Rotate client seed"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400">
                  Server Seed Hash &amp; Nonce
                </span>
                <div className="font-ui mt-1 break-all rounded-lg border border-slate-800 bg-slate-900 p-2 text-[11px] text-slate-300">
                  Nonce #{nonce} • {serverSeed}
                </div>
              </div>

              {lastProofHash && (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      Last Roll SHA-256 Proof
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(lastProofHash);
                        setCopiedHash(true);
                        setTimeout(() => setCopiedHash(false), 1200);
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold text-emerald-400"
                    >
                      {copiedHash ? (
                        <>
                          <Check className="h-3 w-3" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="font-ui mt-1 break-all rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2 text-[10px] text-emerald-300">
                    {lastProofHash}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ZyanSanQuentinSlot;
