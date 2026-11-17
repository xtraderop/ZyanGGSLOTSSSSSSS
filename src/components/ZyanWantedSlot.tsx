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
  Crosshair,
  Flame,
  Skull,
  TrainFront,
  X,
  Check,
  Play,
  Square,
  Trophy,
  Copy,
  RefreshCw,
  Swords,
  Sparkles,
} from "lucide-react";

import { ZYAN_SLOTS_ASSETS } from "../constants/slotAssets";

/* ============================================================================
 * 0. OFFICIAL ZYAN.GG BRANDING, ICONIFY ASSETS & ANTI-COPY <ProtectedArt />
 * ========================================================================== */

const ZYAN_LOGO_URL =
  "https://i.ibb.co.com/20Dxw97d/Esports-wordmark-logo-ZYAN-GG-3d5c4c15-2-K.jpg";

export const WANTED_ICONIFY_ASSETS = {
  skull_bull: "https://api.iconify.design/game-icons/bull-horns.svg?color=%23f5e6c8",
  outlaw_mask: "https://api.iconify.design/game-icons/bandit.svg?color=%23fca5a5",
  money_sack: "https://api.iconify.design/game-icons/money-stack.svg?color=%236ee7b7",
  whiskey: "https://api.iconify.design/game-icons/ozean-bottle.svg?color=%23fcd34d",
  revolver_chamber: "https://api.iconify.design/game-icons/revolver.svg?color=%23fde047",
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

export interface ZyanWantedBetRecord {
  gameKey: "ZYAN_WANTED";
  gameName: "Zyan Wanted: Dead or a Wild";
  wagerUSD: number;
  multiplier: number;
  payoutUSD: number;
  isWin: boolean;
  proofHash: string;
}

export interface ZyanWantedSlotProps {
  externalBalanceUSD?: number;
  onBalanceChange?: (newBalanceUSD: number) => void;
  onRecordBet?: (bet: ZyanWantedBetRecord) => void;
  activeRtpPercent?: number; // Default 96.5% (controlled silently by Admin Panel)
  username?: string;
}

export type WantedSymbolId =
  | "rank_10"
  | "rank_j"
  | "rank_q"
  | "rank_k"
  | "rank_a"
  | "skull_bull"
  | "outlaw_mask"
  | "money_sack"
  | "whiskey"
  | "revolver_chamber"
  | "wild_star"
  | "vs_symbol"
  | "scatter_train"
  | "scatter_duel"
  | "scatter_dead"
  | "dead_blocker"
  | "dead_wild_card"
  | "dead_mult_coin";

type PaySymbolId =
  | "rank_10"
  | "rank_j"
  | "rank_q"
  | "rank_k"
  | "rank_a"
  | "skull_bull"
  | "outlaw_mask"
  | "money_sack"
  | "whiskey"
  | "revolver_chamber";

type BonusMode = "NONE" | "TRAIN_ROBBERY" | "DUEL_AT_DAWN" | "DEAD_COLLECT" | "DEAD_SHOWDOWN";

type SpinPhase =
  | "IDLE"
  | "DROPPING"
  | "VS_EXPANDING"
  | "VS_DUELING"
  | "EVALUATING"
  | "DEAD_COLLECTING"
  | "SPIN_COMPLETE";

interface WantedCell {
  uid: string;
  symbol: WantedSymbolId;
  row: number;
  col: number;
  deadWildValue?: number; // +1 to +3 for dead_wild_card
  deadMultValue?: number; // +1 to +10 for dead_mult_coin
  isStickyWild?: boolean;
  isShowdownShotWild?: boolean;
  revealDelayMs?: number;
}

interface VsDuelColumnState {
  col: number;
  topMult: number;
  bottomMult: number;
  winningSide: "top" | "bottom";
  winningMult: number;
  topOutlaw: string;
  bottomOutlaw: string;
  stage: "expanding" | "dueling" | "locked";
}

interface PaylineWinDetail {
  lineIndex: number; // 0..14
  symbol: PaySymbolId | "wild_star";
  matchLength: number; // 3..5
  coords: Array<{ row: number; col: number }>;
  basePayoutMult: number;
  vsMultSum: number;
  globalMult: number;
  totalLineMult: number;
  payoutUSD: number;
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
 * 2. OFFICIAL 15 PAYLINES, PAYTABLE & CONSTANTS
 * ========================================================================== */

const GRID_ROWS = 5;
const GRID_COLS = 5;
const MAX_WIN_MULT = 12500;

export const WANTED_15_PAYLINES: number[][] = [
  [0, 0, 0, 0, 0], // Line 1: Top row
  [1, 1, 1, 1, 1], // Line 2: Upper-mid row
  [2, 2, 2, 2, 2], // Line 3: Center row
  [3, 3, 3, 3, 3], // Line 4: Lower-mid row
  [4, 4, 4, 4, 4], // Line 5: Bottom row
  [0, 1, 2, 1, 0], // Line 6: V-shape top
  [4, 3, 2, 3, 4], // Line 7: Inverted V bottom
  [1, 0, 0, 0, 1], // Line 8: Top arch
  [3, 4, 4, 4, 3], // Line 9: Bottom arch
  [1, 2, 3, 2, 1], // Line 10: Mid V
  [3, 2, 1, 2, 3], // Line 11: Mid inverted V
  [0, 1, 0, 1, 0], // Line 12: Top zigzag
  [4, 3, 4, 3, 4], // Line 13: Bottom zigzag
  [2, 1, 2, 1, 2], // Line 14: Center-up zigzag
  [2, 3, 2, 3, 2], // Line 15: Center-down zigzag
];

const PAYLINE_COLORS = [
  "#f59e0b",
  "#ef4444",
  "#fbbf24",
  "#10b981",
  "#38bdf8",
  "#f97316",
  "#ec4899",
  "#a855f7",
  "#eab308",
  "#22d3ee",
  "#fb7185",
  "#84cc16",
  "#f43f5e",
  "#60a5fa",
  "#c084fc",
];

const PAYTABLE: Record<PaySymbolId | "wild_star", [number, number, number]> = {
  rank_10: [0.1, 0.25, 1.0],
  rank_j: [0.1, 0.25, 1.0],
  rank_q: [0.1, 0.25, 1.0],
  rank_k: [0.1, 0.25, 1.0],
  rank_a: [0.1, 0.25, 1.0],
  skull_bull: [0.5, 1.5, 3.0],
  outlaw_mask: [0.8, 2.5, 5.0],
  money_sack: [1.0, 3.5, 8.0],
  whiskey: [1.25, 5.0, 10.0],
  revolver_chamber: [2.0, 8.0, 20.0],
  wild_star: [2.0, 8.0, 20.0],
};

const PAY_SYMBOL_IDS: PaySymbolId[] = [
  "rank_10",
  "rank_j",
  "rank_q",
  "rank_k",
  "rank_a",
  "skull_bull",
  "outlaw_mask",
  "money_sack",
  "whiskey",
  "revolver_chamber",
];

const SYMBOL_LABELS: Record<WantedSymbolId, string> = {
  rank_10: "10 Iron Rank",
  rank_j: "J Iron Rank",
  rank_q: "Q Iron Rank",
  rank_k: "K Iron Rank",
  rank_a: "A Iron Rank",
  skull_bull: "Desert Bull Skull",
  outlaw_mask: "Outlaw Bandana",
  money_sack: "Loot Sack",
  whiskey: "Outlaw Whiskey",
  revolver_chamber: "Six-Shooter Cylinder",
  wild_star: "Sheriff Star WILD",
  vs_symbol: "VS Duel Reel",
  scatter_train: "Train Robbery Scatter",
  scatter_duel: "Duel at Dawn Scatter",
  scatter_dead: "Dead Man's Hand Scatter",
  dead_blocker: "Dead Skull Blocker",
  dead_wild_card: "Wild Card",
  dead_mult_coin: "Multiplier Coin",
};

const VS_MULTIPLIER_POOL = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100];
const VS_MULTIPLIER_WEIGHTS = [24, 20, 16, 14, 10, 8, 7, 6, 6, 4.5, 3.5, 2.5, 1.2, 0.5];

const OUTLAW_NAMES = [
  "KID VANCE",
  "BLACK JACK",
  "RED HARLOW",
  "DOC REAPER",
  "IRON SILAS",
  "DUST DEVIL",
  "CROW CALLAHAN",
  "DEADEYE COLE",
];

const BET_LADDER_USD = [
  0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0, 300.0, 500.0,
];

const FEATURE_BUY_CARDS = [
  {
    id: "bonus_hunt" as const,
    title: "BONUS HUNT",
    subtitle: "5x Bonus Chance",
    costMult: 3,
    badge: "3x BET",
    accent: "from-amber-400 via-yellow-500 to-orange-500",
    border: "border-amber-400/50",
    description: "Triples your wager to boost Scatter & VS Duel Reel odds by 5x.",
  },
  {
    id: "train" as const,
    title: "THE GREAT TRAIN ROBBERY",
    subtitle: "10 Free Spins • Sticky Wilds",
    costMult: 80,
    badge: "80x BET",
    accent: "from-sky-400 via-cyan-500 to-indigo-600",
    border: "border-sky-400/50",
    description: "Every Wild Sheriff Star locks permanently for all remaining spins.",
  },
  {
    id: "duel" as const,
    title: "DUEL AT DAWN",
    subtitle: "10 Free Spins • High VS Odds",
    costMult: 200,
    badge: "200x BET",
    accent: "from-red-500 via-orange-500 to-amber-400",
    border: "border-red-500/60",
    description: "Blood-red dusk stage loaded with frequent 1–5 VS Duel Reels (2x–100x).",
  },
  {
    id: "dead" as const,
    title: "DEAD MAN'S HAND",
    subtitle: "2-Phase Collect & Showdown",
    costMult: 400,
    badge: "400x BET",
    accent: "from-fuchsia-500 via-rose-600 to-amber-500",
    border: "border-rose-500/60",
    description: "Collect up to 20 Wilds & 31x+ Multiplier, then fire 3 Showdown Spins.",
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
  // Deterministic fallback for non-secure contexts
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
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return (combined % 1000000000) / 1000000000;
  };
}

function pickWeighted<T>(items: T[], weights: number[], rng: () => number): T {
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
 * 4. SYNTHESIZED WESTERN GUNSHOT & REVOLVER WEB AUDIO ENGINE
 * ========================================================================== */

class WantedAudioEngine {
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

  public playSpinTrigger() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Revolver hammer cock + leather snap
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playReelStop(colIndex: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Metallic revolver cylinder click
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = "square";
    clickOsc.frequency.setValueAtTime(860 + colIndex * 95, now);
    clickOsc.frequency.exponentialRampToValueAtTime(240, now + 0.032);
    clickGain.gain.setValueAtTime(0.07, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    clickOsc.connect(clickGain).connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.045);

    // Low wooden saloon thud
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = "sine";
    thudOsc.frequency.setValueAtTime(125 - colIndex * 6, now);
    thudOsc.frequency.exponentialRampToValueAtTime(48, now + 0.07);
    thudGain.gain.setValueAtTime(0.14, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    thudOsc.connect(thudGain).connect(ctx.destination);
    thudOsc.start(now);
    thudOsc.stop(now + 0.085);
  }

  public playScatterChime(count: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const baseFreq = 440 + count * 110;
    [baseFreq, baseFreq * 1.25].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      gain.gain.setValueAtTime(0.09, now + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.24);
    });
  }

  public playVsExpand() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(390, now + 0.28);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.33);
  }

  public playGunshotDuel() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Sharp gunshot noise crack
    const bufferSize = Math.floor(ctx.sampleRate * 0.22);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(1300, now);
    bandpass.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.28, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    noiseSrc.connect(bandpass).connect(noiseGain).connect(ctx.destination);
    noiseSrc.start(now);

    // 2. Sub punch
    const punch = ctx.createOscillator();
    const punchGain = ctx.createGain();
    punch.type = "sine";
    punch.frequency.setValueAtTime(160, now);
    punch.frequency.exponentialRampToValueAtTime(34, now + 0.14);
    punchGain.gain.setValueAtTime(0.24, now);
    punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    punch.connect(punchGain).connect(ctx.destination);
    punch.start(now);
    punch.stop(now + 0.17);

    // 3. Spaghetti-Western ricochet whistle
    const ric = ctx.createOscillator();
    const ricGain = ctx.createGain();
    ric.type = "sine";
    ric.frequency.setValueAtTime(2200, now + 0.06);
    ric.frequency.exponentialRampToValueAtTime(720, now + 0.28);
    ricGain.gain.setValueAtTime(0.06, now + 0.06);
    ricGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    ric.connect(ricGain).connect(ctx.destination);
    ric.start(now + 0.06);
    ric.stop(now + 0.31);
  }

  public playStickyLock() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.07);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playDeadCollectHit() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [587.33, 880].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + idx * 0.05);
      gain.gain.setValueAtTime(0.11, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.2);
    });
  }

  public playWinFanfare(mult: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes =
      mult >= 50
        ? [293.66, 369.99, 440, 587.33, 739.99, 880, 1174.66]
        : mult >= 15
          ? [293.66, 369.99, 440, 587.33, 739.99]
          : [392, 493.88, 587.33];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = mult >= 15 ? "sawtooth" : "triangle";
      const t = now + i * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(mult >= 50 ? 0.11 : 0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  }
}

/* ============================================================================
 * 5. HIGH-CONTRAST 3D WESTERN SYMBOLS (ICONIFY + CUSTOM SVG FRAMES & FALLBACKS)
 * ========================================================================== */

const SymbolArtwork: React.FC<{
  symbol: WantedSymbolId;
  deadWildValue?: number;
  deadMultValue?: number;
}> = React.memo(({ symbol, deadWildValue = 1, deadMultValue = 2 }) => {
  const uid = useId().replace(/:/g, "");

  // Iron Western Ranks (10, J, Q, K, A)
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
    const paletteMap: Record<
      typeof symbol,
      { top: string; mid: string; bot: string; stroke: string; glow: string }
    > = {
      rank_10: {
        top: "#e2e8f0",
        mid: "#94a3b8",
        bot: "#475569",
        stroke: "#cbd5e1",
        glow: "rgba(148,163,184,0.35)",
      },
      rank_j: {
        top: "#bae6fd",
        mid: "#38bdf8",
        bot: "#0369a1",
        stroke: "#7dd3fc",
        glow: "rgba(56,189,248,0.35)",
      },
      rank_q: {
        top: "#ddd6fe",
        mid: "#a855f7",
        bot: "#581c87",
        stroke: "#c084fc",
        glow: "rgba(168,85,247,0.35)",
      },
      rank_k: {
        top: "#fecaca",
        mid: "#ef4444",
        bot: "#7f1d1d",
        stroke: "#f87171",
        glow: "rgba(239,68,68,0.4)",
      },
      rank_a: {
        top: "#fef08a",
        mid: "#f59e0b",
        bot: "#92400e",
        stroke: "#fde047",
        glow: "rgba(245,158,11,0.45)",
      },
    };
    const pal = paletteMap[symbol];
    const label = charMap[symbol];

    return (
      <div className="relative flex h-full w-full items-center justify-center p-1.5">
        <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.85)]">
          <defs>
            <linearGradient id={`${uid}-iron`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={pal.top} />
              <stop offset="52%" stopColor={pal.mid} />
              <stop offset="100%" stopColor={pal.bot} />
            </linearGradient>
            <linearGradient id={`${uid}-plate`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1e1b18" />
              <stop offset="100%" stopColor="#0b0908" />
            </linearGradient>
          </defs>
          <rect
            x="10"
            y="10"
            width="80"
            height="80"
            rx="16"
            fill={`url(#${uid}-plate)`}
            stroke={pal.stroke}
            strokeOpacity="0.4"
            strokeWidth="2.5"
          />
          <circle cx="20" cy="20" r="2.2" fill="#78716c" />
          <circle cx="80" cy="20" r="2.2" fill="#78716c" />
          <circle cx="20" cy="80" r="2.2" fill="#78716c" />
          <circle cx="80" cy="80" r="2.2" fill="#78716c" />
          <text
            x="50"
            y="67"
            textAnchor="middle"
            fill={`url(#${uid}-iron)`}
            stroke="#090707"
            strokeWidth="3.5"
            paintOrder="stroke"
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 900,
              fontSize: label === "10" ? "44px" : "52px",
              letterSpacing: "-2px",
            }}
          >
            {label}
          </text>
        </svg>
      </div>
    );
  }

  // 5 High-Pay Outlaw Symbols using Iconify Game-Icons + 3D Western Plaque + SVG Fallbacks
  if (
    symbol === "skull_bull" ||
    symbol === "outlaw_mask" ||
    symbol === "money_sack" ||
    symbol === "whiskey" ||
    symbol === "revolver_chamber"
  ) {
    const configMap: Record<
      typeof symbol,
      {
        iconUrl: string;
        bgGrad: string;
        border: string;
        badge: string;
        fallbackGlyph: React.ReactNode;
      }
    > = {
      skull_bull: {
        iconUrl: WANTED_ICONIFY_ASSETS.skull_bull,
        bgGrad: "from-stone-800/95 via-amber-950/90 to-stone-950",
        border: "border-amber-200/40",
        badge: "BULL",
        fallbackGlyph: (
          <svg viewBox="0 0 100 100" className="h-[72%] w-[72%]">
            <path
              d="M14 26 C18 42, 30 48, 36 46 L42 74 L58 74 L64 46 C70 48, 82 42, 86 26 C74 34, 65 34, 58 32 L42 32 C35 34, 26 34, 14 26 Z"
              fill="#f5e6c8"
              stroke="#451a03"
              strokeWidth="3"
            />
            <circle cx="43" cy="50" r="4.5" fill="#1c1917" />
            <circle cx="57" cy="50" r="4.5" fill="#1c1917" />
          </svg>
        ),
      },
      outlaw_mask: {
        iconUrl: WANTED_ICONIFY_ASSETS.outlaw_mask,
        bgGrad: "from-red-950/95 via-stone-900 to-black",
        border: "border-red-400/50",
        badge: "OUTLAW",
        fallbackGlyph: (
          <svg viewBox="0 0 100 100" className="h-[72%] w-[72%]">
            <ellipse cx="50" cy="34" rx="34" ry="8" fill="#451a03" stroke="#fca5a5" strokeWidth="2" />
            <path d="M32 34 L38 16 L62 16 L68 34 Z" fill="#292524" />
            <path d="M28 50 L72 50 L62 82 L50 88 L38 82 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="2.5" />
            <circle cx="41" cy="44" r="3.5" fill="#fef3c7" />
            <circle cx="59" cy="44" r="3.5" fill="#fef3c7" />
          </svg>
        ),
      },
      money_sack: {
        iconUrl: WANTED_ICONIFY_ASSETS.money_sack,
        bgGrad: "from-emerald-950/95 via-stone-900 to-black",
        border: "border-emerald-400/50",
        badge: "LOOT",
        fallbackGlyph: (
          <svg viewBox="0 0 100 100" className="h-[72%] w-[72%]">
            <path d="M36 22 L64 22 L56 34 L44 34 Z" fill="#d97706" />
            <path d="M26 62 C26 42, 40 34, 50 34 C60 34, 74 42, 74 62 C74 80, 64 86, 50 86 C36 86, 26 80, 26 62 Z" fill="#10b981" stroke="#064e3b" strokeWidth="3" />
            <text x="50" y="68" textAnchor="middle" fill="#fef08a" fontWeight="900" fontSize="28">$</text>
          </svg>
        ),
      },
      whiskey: {
        iconUrl: WANTED_ICONIFY_ASSETS.whiskey,
        bgGrad: "from-amber-950/95 via-orange-950/80 to-black",
        border: "border-amber-400/55",
        badge: "WHISKEY",
        fallbackGlyph: (
          <svg viewBox="0 0 100 100" className="h-[72%] w-[72%]">
            <rect x="43" y="14" width="14" height="16" rx="2" fill="#d97706" />
            <path d="M38 30 L62 30 L70 46 L70 84 L30 84 L30 46 Z" fill="#f59e0b" stroke="#78350f" strokeWidth="3" />
            <rect x="34" y="52" width="32" height="20" rx="3" fill="#fef3c7" />
            <text x="50" y="66" textAnchor="middle" fill="#78350f" fontWeight="900" fontSize="11">XXX</text>
          </svg>
        ),
      },
      revolver_chamber: {
        iconUrl: WANTED_ICONIFY_ASSETS.revolver_chamber,
        bgGrad: "from-amber-900/90 via-red-950/90 to-black",
        border: "border-yellow-400/75",
        badge: "CHAMBER",
        fallbackGlyph: (
          <svg viewBox="0 0 100 100" className="h-[74%] w-[74%]">
            <circle cx="50" cy="50" r="34" fill="#d4af37" stroke="#451a03" strokeWidth="3.5" />
            {[0, 60, 120, 180, 240, 300].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              const cx = 50 + Math.cos(rad) * 19;
              const cy = 50 + Math.sin(rad) * 19;
              return <circle key={deg} cx={cx} cy={cy} r="6.8" fill="#1c1917" stroke="#fef08a" strokeWidth="1.5" />;
            })}
            <circle cx="50" cy="50" r="6" fill="#1c1917" />
          </svg>
        ),
      },
    };

    const cfg = configMap[symbol];
    return (
      <div
        className={`relative flex h-full w-full items-center justify-center rounded-xl border ${cfg.border} bg-gradient-to-b ${cfg.bgGrad} p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_6px_14px_rgba(0,0,0,0.75)]`}
      >
        <div className="pointer-events-none absolute inset-1 rounded-lg border border-white/10" />
        <ProtectedArt
          src={cfg.iconUrl}
          alt={SYMBOL_LABELS[symbol]}
          className="h-[72%] w-[72%] object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)]"
          fallback={cfg.fallbackGlyph}
        />
      </div>
    );
  }

  // 24k Gold Sheriff Star WILD
  if (symbol === "wild_star") {
    return (
      <div className="relative flex h-full w-full items-center justify-center p-1">
        <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_0_14px_rgba(251,191,36,0.7)]">
          <defs>
            <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fef9c3" />
              <stop offset="45%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
          </defs>
          <polygon
            points="50,6 62,33 92,35 69,55 77,85 50,69 23,85 31,55 8,35 38,33"
            fill={`url(#${uid}-gold)`}
            stroke="#451a03"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="6" r="4.5" fill="#fef08a" stroke="#78350f" strokeWidth="1.5" />
          <circle cx="92" cy="35" r="4.5" fill="#fef08a" stroke="#78350f" strokeWidth="1.5" />
          <circle cx="77" cy="85" r="4.5" fill="#fef08a" stroke="#78350f" strokeWidth="1.5" />
          <circle cx="23" cy="85" r="4.5" fill="#fef08a" stroke="#78350f" strokeWidth="1.5" />
          <circle cx="8" cy="35" r="4.5" fill="#fef08a" stroke="#78350f" strokeWidth="1.5" />
          <rect x="14" y="42" width="72" height="22" rx="5" fill="#18120e" stroke="#fbbf24" strokeWidth="2" />
          <text
            x="50"
            y="58"
            textAnchor="middle"
            fill="#fde047"
            style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "15px", letterSpacing: "1px" }}
          >
            WILD
          </text>
        </svg>
      </div>
    );
  }

  // Blazing Crimson & Gold "VS" Badge (3D Golden Revolvers Studio Asset + SVG Fallback)
  if (symbol === "vs_symbol") {
    return (
      <div className="relative flex h-full w-full items-center justify-center p-1">
        <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-amber-300 bg-gradient-to-br from-red-950 via-[#1a080a] to-black shadow-[0_0_22px_rgba(239,68,68,0.85),inset_0_0_12px_rgba(251,191,36,0.45)]">
          <ProtectedArt
            src={ZYAN_SLOTS_ASSETS.ZYAN_WANTED.VS_DUEL_BADGE}
            alt="VS Duel Badge"
            className="h-full w-full scale-110 rounded-xl object-contain mix-blend-lighten"
            fallback={
              <div className="flex flex-col items-center justify-center">
                <span className="font-display bg-gradient-to-b from-amber-200 via-yellow-400 to-amber-600 bg-clip-text text-2xl font-black italic tracking-tighter text-transparent sm:text-3xl">
                  VS
                </span>
                <span className="font-display -mt-1 text-[8px] font-extrabold uppercase tracking-[0.2em] text-amber-200">
                  DUEL REEL
                </span>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  // 3 Distinct Bonus Scatter Symbols
  if (symbol === "scatter_train" || symbol === "scatter_duel" || symbol === "scatter_dead") {
    const meta =
      symbol === "scatter_train"
        ? {
            label: "TRAIN",
            sub: "ROBBERY",
            grad: "from-sky-600 via-indigo-800 to-slate-950",
            border: "border-sky-300",
            glow: "shadow-[0_0_18px_rgba(56,189,248,0.7)]",
            icon: <TrainFront className="h-6 w-6 text-sky-200 sm:h-7 sm:w-7" />,
          }
        : symbol === "scatter_duel"
          ? {
              label: "DUEL",
              sub: "AT DAWN",
              grad: "from-red-600 via-orange-700 to-stone-950",
              border: "border-amber-300",
              glow: "shadow-[0_0_20px_rgba(245,158,11,0.75)]",
              icon: <Swords className="h-6 w-6 text-amber-200 sm:h-7 sm:w-7" />,
            }
          : {
              label: "DEAD",
              sub: "MAN'S HAND",
              grad: "from-fuchsia-700 via-rose-900 to-black",
              border: "border-rose-300",
              glow: "shadow-[0_0_20px_rgba(244,63,94,0.8)]",
              icon: <Skull className="h-6 w-6 text-rose-200 sm:h-7 sm:w-7" />,
            };

    return (
      <div className="relative flex h-full w-full items-center justify-center p-1">
        <div
          className={`relative flex h-full w-full flex-col items-center justify-center rounded-xl border-2 ${meta.border} bg-gradient-to-b ${meta.grad} ${meta.glow} px-1 text-center`}
        >
          {meta.icon}
          <span className="font-display mt-0.5 text-[10px] font-black leading-none tracking-wider text-white sm:text-xs">
            {meta.label}
          </span>
          <span className="font-display text-[7px] font-bold uppercase tracking-widest text-amber-200 sm:text-[8px]">
            {meta.sub}
          </span>
        </div>
      </div>
    );
  }

  // Dead Man's Hand Phase 1 Collect Symbols
  if (symbol === "dead_blocker") {
    return (
      <div className="relative flex h-full w-full items-center justify-center p-1.5">
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-stone-800 bg-stone-950/85 opacity-55">
          <Skull className="h-6 w-6 text-stone-600" />
        </div>
      </div>
    );
  }

  if (symbol === "dead_wild_card") {
    return (
      <div className="relative flex h-full w-full items-center justify-center p-1">
        <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-amber-300 bg-gradient-to-b from-amber-500 via-amber-700 to-stone-950 shadow-[0_0_18px_rgba(251,191,36,0.75)]">
          <span className="font-display text-lg font-black leading-none text-white drop-shadow sm:text-xl">
            +{deadWildValue}
          </span>
          <span className="font-display mt-0.5 text-[8px] font-black uppercase tracking-wider text-amber-100">
            WILD CARD
          </span>
        </div>
      </div>
    );
  }

  // dead_mult_coin
  return (
    <div className="relative flex h-full w-full items-center justify-center p-1">
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full border-2 border-rose-300 bg-gradient-to-b from-rose-500 via-red-700 to-stone-950 shadow-[0_0_18px_rgba(244,63,94,0.8)]">
        <span className="font-display text-base font-black leading-none text-amber-200 drop-shadow sm:text-lg">
          +{deadMultValue}x
        </span>
        <span className="font-display text-[7px] font-black uppercase tracking-widest text-white">
          MULT
        </span>
      </div>
    </div>
  );
});

/* ============================================================================
 * 6. GAME MATH, PAYLINE EVALUATOR & BOARD GENERATORS
 * ========================================================================== */

let uidCounter = 1;
function nextUid(prefix = "wc"): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function generateGrid(options: {
  rng: () => number;
  mode: BonusMode;
  bonusHunt: boolean;
  stickyWildMask: boolean[][];
  activeRtpPercent: number;
  spinIndex: number;
}): WantedCell[][] {
  const { rng, mode, bonusHunt, stickyWildMask, activeRtpPercent } = options;

  // RTP tuning factor nudges wild / vs / high-pay weights silently
  const rtpFactor = Math.max(0.75, Math.min(1.2, activeRtpPercent / 96.5));
  const isDuelBonus = mode === "DUEL_AT_DAWN";
  const isTrainBonus = mode === "TRAIN_ROBBERY";

  const symbolPool: WantedSymbolId[] = [
    "rank_10",
    "rank_j",
    "rank_q",
    "rank_k",
    "rank_a",
    "skull_bull",
    "outlaw_mask",
    "money_sack",
    "whiskey",
    "revolver_chamber",
    "wild_star",
    "vs_symbol",
    "scatter_train",
    "scatter_duel",
    "scatter_dead",
  ];

  const baseWeights = [
    17, // rank_10
    16, // rank_j
    15, // rank_q
    14, // rank_k
    13, // rank_a
    8.5, // skull_bull
    6.5, // outlaw_mask
    5.0, // money_sack
    4.0, // whiskey
    3.0 * rtpFactor, // revolver_chamber
    (isTrainBonus ? 6.2 : 2.6) * rtpFactor, // wild_star
    (isDuelBonus ? 11.5 : bonusHunt ? 3.8 : 2.2) * rtpFactor, // vs_symbol
    mode === "NONE" ? (bonusHunt ? 2.6 : 0.75) : 0, // scatter_train
    mode === "NONE" ? (bonusHunt ? 2.4 : 0.68) : 0, // scatter_duel
    mode === "NONE" ? (bonusHunt ? 2.1 : 0.58) : 0, // scatter_dead
  ];

  // Guarantee high excitement in Duel at Dawn on a fair portion of spins
  const forceVsCount =
    isDuelBonus && rng() < 0.72
      ? rng() < 0.14
        ? 4
        : rng() < 0.36
          ? 3
          : rng() < 0.65
            ? 2
            : 1
      : 0;

  const grid: WantedCell[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowArr: WantedCell[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      if (isTrainBonus && stickyWildMask[r]?.[c]) {
        rowArr.push({
          uid: nextUid("sw"),
          symbol: "wild_star",
          row: r,
          col: c,
          isStickyWild: true,
        });
        continue;
      }

      let picked = pickWeighted(symbolPool, baseWeights, rng);
      // Prevent duplicate VS symbols on the same reel (1 VS per column max, authentic Hacksaw rule)
      if (
        picked === "vs_symbol" &&
        grid.some((prevRow) => prevRow[c]?.symbol === "vs_symbol")
      ) {
        picked = pickWeighted(PAY_SYMBOL_IDS, [14, 14, 13, 12, 11, 8, 6, 5, 4, 3], rng);
      }
      // Prevent duplicate same-type scatters on the same reel
      if (
        (picked === "scatter_train" ||
          picked === "scatter_duel" ||
          picked === "scatter_dead") &&
        grid.some((prevRow) => prevRow[c]?.symbol === picked)
      ) {
        picked = pickWeighted(PAY_SYMBOL_IDS, [14, 14, 13, 12, 11, 8, 6, 5, 4, 3], rng);
      }

      rowArr.push({
        uid: nextUid(),
        symbol: picked,
        row: r,
        col: c,
      });
    }
    grid.push(rowArr);
  }

  // Inject forced Duel at Dawn VS columns if selected
  if (forceVsCount > 0) {
    const colsWithVs = new Set<number>();
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid.some((row) => row[c].symbol === "vs_symbol")) colsWithVs.add(c);
    }
    const availableCols = [0, 1, 2, 3, 4].filter((c) => !colsWithVs.has(c));
    while (colsWithVs.size < forceVsCount && availableCols.length > 0) {
      const idx = Math.floor(rng() * availableCols.length);
      const col = availableCols.splice(idx, 1)[0];
      const row = Math.floor(rng() * GRID_ROWS);
      grid[row][col] = { uid: nextUid("vs"), symbol: "vs_symbol", row, col };
      colsWithVs.add(col);
    }
  }

  return grid;
}

function generateDeadCollectGrid(
  rng: () => number,
  currentWilds: number
): WantedCell[][] {
  const grid: WantedCell[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowArr: WantedCell[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const roll = rng();
      if (roll < 0.095 && currentWilds < 20) {
        const val = rng() < 0.14 ? 3 : rng() < 0.38 ? 2 : 1;
        rowArr.push({
          uid: nextUid("dwc"),
          symbol: "dead_wild_card",
          row: r,
          col: c,
          deadWildValue: val,
        });
      } else if (roll < 0.175) {
        const multChoices = [1, 2, 3, 4, 5, 8, 10];
        const multWeights = [34, 24, 16, 10, 8, 5, 3];
        rowArr.push({
          uid: nextUid("dmc"),
          symbol: "dead_mult_coin",
          row: r,
          col: c,
          deadMultValue: pickWeighted(multChoices, multWeights, rng),
        });
      } else {
        rowArr.push({
          uid: nextUid("dbl"),
          symbol: "dead_blocker",
          row: r,
          col: c,
        });
      }
    }
    grid.push(rowArr);
  }
  return grid;
}

function evaluatePaylines(params: {
  grid: WantedCell[][];
  expandedVsMultByCol: Map<number, number>;
  baseBetUSD: number;
  globalMult: number;
}): {
  wins: PaylineWinDetail[];
  totalPayoutUSD: number;
  totalWinMult: number;
  isFullScreenVs: boolean;
} {
  const { grid, expandedVsMultByCol, baseBetUSD, globalMult } = params;
  const wins: PaylineWinDetail[] = [];

  // Full-Screen 5-Reel VS Jackpot Check
  if (expandedVsMultByCol.size === GRID_COLS) {
    let sum5 = 0;
    expandedVsMultByCol.forEach((m) => {
      sum5 += m;
    });
    const perLineMult = 20.0 * sum5 * globalMult;
    WANTED_15_PAYLINES.forEach((line, lineIndex) => {
      wins.push({
        lineIndex,
        symbol: "wild_star",
        matchLength: 5,
        coords: line.map((r, c) => ({ row: r, col: c })),
        basePayoutMult: 20.0,
        vsMultSum: sum5,
        globalMult,
        totalLineMult: perLineMult,
        payoutUSD: Number((baseBetUSD * perLineMult).toFixed(2)),
      });
    });
    const rawTotalMult = 300 * sum5 * globalMult;
    const cappedMult = Math.min(MAX_WIN_MULT, rawTotalMult);
    return {
      wins,
      totalWinMult: Number(cappedMult.toFixed(2)),
      totalPayoutUSD: Number((baseBetUSD * cappedMult).toFixed(2)),
      isFullScreenVs: true,
    };
  }

  const isWildAt = (row: number, col: number): boolean =>
    expandedVsMultByCol.has(col) || grid[row][col].symbol === "wild_star";

  const isPaySymbol = (sym: WantedSymbolId): sym is PaySymbolId =>
    (PAY_SYMBOL_IDS as string[]).includes(sym);

  WANTED_15_PAYLINES.forEach((line, lineIndex) => {
    // Evaluate pure wild line first
    let pureWildLen = 0;
    for (let c = 0; c < GRID_COLS; c++) {
      if (isWildAt(line[c], c)) pureWildLen++;
      else break;
    }

    let bestCandidate: {
      symbol: PaySymbolId | "wild_star";
      matchLength: number;
      basePayoutMult: number;
    } | null = null;

    if (pureWildLen >= 3) {
      bestCandidate = {
        symbol: "wild_star",
        matchLength: pureWildLen,
        basePayoutMult: PAYTABLE.wild_star[pureWildLen - 3],
      };
    }

    // Evaluate every pay symbol for longest left-to-right match (with wilds)
    for (const candidateSym of PAY_SYMBOL_IDS) {
      let matchLen = 0;
      for (let c = 0; c < GRID_COLS; c++) {
        const cellSym = grid[line[c]][c].symbol;
        if (cellSym === candidateSym || isWildAt(line[c], c)) {
          matchLen++;
        } else {
          break;
        }
      }
      if (matchLen >= 3) {
        const pay = PAYTABLE[candidateSym][matchLen - 3];
        if (!bestCandidate || pay > bestCandidate.basePayoutMult) {
          bestCandidate = {
            symbol: candidateSym,
            matchLength: matchLen,
            basePayoutMult: pay,
          };
        }
      }
    }

    // Ensure non-wild symbol match isn't purely scatter/blocker without any real symbol (already handled by pureWildLen check)
    if (bestCandidate) {
      // Confirm first symbol on payline isn't a scatter/blocker that shouldn't substitute
      const firstSym = grid[line[0]][0].symbol;
      if (
        !isWildAt(line[0], 0) &&
        !isPaySymbol(firstSym)
      ) {
        return;
      }

      // Additive Multi-Reel VS Multiplier Math across winning payline columns
      let vsMultSum = 0;
      for (let c = 0; c < bestCandidate.matchLength; c++) {
        const colVsMult = expandedVsMultByCol.get(c);
        if (colVsMult) vsMultSum += colVsMult;
      }
      const effectiveVsFactor = vsMultSum > 0 ? vsMultSum : 1;
      const totalLineMult = bestCandidate.basePayoutMult * effectiveVsFactor * globalMult;
      wins.push({
        lineIndex,
        symbol: bestCandidate.symbol,
        matchLength: bestCandidate.matchLength,
        coords: line.slice(0, bestCandidate.matchLength).map((r, c) => ({ row: r, col: c })),
        basePayoutMult: bestCandidate.basePayoutMult,
        vsMultSum,
        globalMult,
        totalLineMult,
        payoutUSD: Number((baseBetUSD * totalLineMult).toFixed(2)),
      });
    }
  });

  const rawMultSum = wins.reduce((acc, w) => acc + w.totalLineMult, 0);
  const cappedMult = Math.min(MAX_WIN_MULT, Number(rawMultSum.toFixed(2)));
  return {
    wins,
    totalWinMult: cappedMult,
    totalPayoutUSD: Number((baseBetUSD * cappedMult).toFixed(2)),
    isFullScreenVs: false,
  };
}

/* ============================================================================
 * 7. MAIN COMPONENT: <ZyanWantedSlot />
 * ========================================================================== */

export const ZyanWantedSlot: React.FC<ZyanWantedSlotProps> = ({
  externalBalanceUSD,
  onBalanceChange,
  onRecordBet,
  activeRtpPercent = 96.5,
  username = "Outlaw",
}) => {
  // Wallet & RTP Sync
  const [internalBalanceUSD, setInternalBalanceUSD] = useState<number>(1000.0);
  const isControlledBalance = typeof externalBalanceUSD === "number";
  const balanceUSD = isControlledBalance ? externalBalanceUSD : internalBalanceUSD;
  const [runtimeRtpPercent, setRuntimeRtpPercent] = useState<number>(activeRtpPercent);

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

  // Betting & Mode State
  const [betIndex, setBetIndex] = useState<number>(4); // $1.00 default
  const baseBetUSD = BET_LADDER_USD[betIndex];
  const [bonusHuntActive, setBonusHuntActive] = useState<boolean>(false);
  const effectiveSpinCostUSD = Number(
    (baseBetUSD * (bonusHuntActive ? 3 : 1)).toFixed(2)
  );

  // Grid & Animation State
  const [grid, setGrid] = useState<WantedCell[][]>(() => {
    const seedRng = createSeededRng("zyan-wanted-initial-board-12500x");
    return generateGrid({
      rng: seedRng,
      mode: "NONE",
      bonusHunt: false,
      stickyWildMask: Array.from({ length: GRID_ROWS }, () =>
        Array(GRID_COLS).fill(false)
      ),
      activeRtpPercent: 96.5,
      spinIndex: 0,
    });
  });

  const [spinPhase, setSpinPhase] = useState<SpinPhase>("IDLE");
  const [stoppedCols, setStoppedCols] = useState<boolean[]>([true, true, true, true, true]);
  const [vsDuelColumns, setVsDuelColumns] = useState<VsDuelColumnState[]>([]);
  const [activePaylineWins, setActivePaylineWins] = useState<PaylineWinDetail[]>([]);
  const [highlightedLineIdx, setHighlightedLineIdx] = useState<number | null>(null);
  const [lastWinUSD, setLastWinUSD] = useState<number>(0);
  const [lastWinMult, setLastWinMult] = useState<number>(0);
  const [bannerStatus, setBannerStatus] = useState<string>(
    "DEAD OR A WILD • 15 PAYLINES • EXPANDING VS DUELS UP TO 100x"
  );
  const [stageShake, setStageShake] = useState<boolean>(false);

  // Bonus Mode State
  const [bonusMode, setBonusMode] = useState<BonusMode>("NONE");
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [freeSpinsTotal, setFreeSpinsTotal] = useState<number>(0);
  const [bonusTotalWinUSD, setBonusTotalWinUSD] = useState<number>(0);
  const [stickyWildMask, setStickyWildMask] = useState<boolean[][]>(() =>
    Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
  );

  // Dead Man's Hand 2-Phase State
  const [deadCollectedWilds, setDeadCollectedWilds] = useState<number>(0);
  const [deadShowdownMult, setDeadShowdownMult] = useState<number>(1);
  const [deadRefillSpins, setDeadRefillSpins] = useState<number>(3);
  const [deadShowdownSpinsLeft, setDeadShowdownSpinsLeft] = useState<number>(0);
  const [deadFlyToast, setDeadFlyToast] = useState<string | null>(null);

  // Big / Mega / Max Win Overlay
  const [winCelebration, setWinCelebration] = useState<{
    tier: "BIG WIN" | "MEGA WIN" | "WANTED MAX WIN";
    amountUSD: number;
    mult: number;
  } | null>(null);
  const [bonusIntroBanner, setBonusIntroBanner] = useState<{
    title: string;
    subtitle: string;
    theme: "train" | "duel" | "dead" | "showdown";
  } | null>(null);

  // Audio, Autoplay, Modals & Provably Fair State
  const audioRef = useRef<WantedAudioEngine | null>(null);
  if (!audioRef.current) audioRef.current = new WantedAudioEngine();

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

  const isBusyRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // postMessage Bridge for GitHub Parent App Integration
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.parent?.postMessage(
      { type: "ZYAN_SLOT_READY", gameKey: "ZYAN_WANTED" },
      "*"
    );

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "ZYAN_BALANCE_SYNC" && typeof data.balanceUSD === "number") {
        commitBalance(data.balanceUSD);
      } else if (data.type === "ZYAN_SET_RTP" && typeof data.rtpPercent === "number") {
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

  // Cycle active payline highlight on win
  useEffect(() => {
    if (activePaylineWins.length === 0) {
      setHighlightedLineIdx(null);
      return;
    }
    setHighlightedLineIdx(activePaylineWins[0].lineIndex);
    if (activePaylineWins.length === 1) return;
    let cursor = 0;
    const timer = setInterval(() => {
      cursor = (cursor + 1) % activePaylineWins.length;
      setHighlightedLineIdx(activePaylineWins[cursor].lineIndex);
    }, 950);
    return () => clearInterval(timer);
  }, [activePaylineWins]);

  // Helper to emit bet telemetry cleanly
  const emitBetRecord = useCallback(
    (wagerUSD: number, payoutUSD: number, proofHash: string) => {
      const mult = wagerUSD > 0 ? Number((payoutUSD / wagerUSD).toFixed(2)) : 0;
      const record: ZyanWantedBetRecord = {
        gameKey: "ZYAN_WANTED",
        gameName: "Zyan Wanted: Dead or a Wild",
        wagerUSD,
        multiplier: mult,
        payoutUSD,
        isWin: payoutUSD > 0,
        proofHash,
      };
      onRecordBet?.(record);
      window.parent?.postMessage({ type: "ZYAN_SLOT_BET_RESULT", payload: record }, "*");
    },
    [onRecordBet]
  );

  // Trigger brief screen shake on VS Gunfight or Big Win
  const triggerShake = useCallback(() => {
    setStageShake(true);
    setTimeout(() => {
      if (mountedRef.current) setStageShake(false);
    }, 360);
  }, []);

  /* --------------------------------------------------------------------------
   * CORE ROUND EXECUTION: BASE SPIN + TRAIN ROBBERY + DUEL AT DAWN + DEAD MAN'S HAND
   * ------------------------------------------------------------------------ */

  const runSingleGridSpin = useCallback(
    async (opts: {
      mode: BonusMode;
      stickyMask: boolean[][];
      showdownWildCount: number;
      globalMult: number;
      wagerBetUSD: number;
      spinNonce: number;
    }): Promise<{
      finalGrid: WantedCell[][];
      newStickyMask: boolean[][];
      payoutUSD: number;
      winMult: number;
      wins: PaylineWinDetail[];
      proofHash: string;
      triggeredBonus: "TRAIN_ROBBERY" | "DUEL_AT_DAWN" | "DEAD_COLLECT" | null;
    }> => {
      const { mode, stickyMask, showdownWildCount, globalMult, wagerBetUSD, spinNonce } = opts;
      const proofHash = await computeHmacSha256Hex(
        serverSeed,
        `${clientSeed}:${spinNonce}:${mode}`
      );
      if (mountedRef.current) setLastProofHash(proofHash);
      const rng = createSeededRng(proofHash);

      // Build board
      let board = generateGrid({
        rng,
        mode,
        bonusHunt: bonusHuntActive,
        stickyWildMask: stickyMask,
        activeRtpPercent: runtimeRtpPercent,
        spinIndex: spinNonce,
      });

      // If Dead Man's Hand Phase 2 (Showdown), shoot all collected Wilds onto random distinct positions!
      if (mode === "DEAD_SHOWDOWN" && showdownWildCount > 0) {
        const allPositions: Array<{ r: number; c: number }> = [];
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            allPositions.push({ r, c });
          }
        }
        // Shuffle positions deterministically with rng
        for (let i = allPositions.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          const tmp = allPositions[i];
          allPositions[i] = allPositions[j];
          allPositions[j] = tmp;
        }
        const shots = Math.min(showdownWildCount, 25);
        for (let s = 0; s < shots; s++) {
          const { r, c } = allPositions[s];
          board[r][c] = {
            uid: nextUid("sdw"),
            symbol: "wild_star",
            row: r,
            col: c,
            isShowdownShotWild: true,
          };
        }
      }

      if (!mountedRef.current) {
        return {
          finalGrid: board,
          newStickyMask: stickyMask,
          payoutUSD: 0,
          winMult: 0,
          wins: [],
          proofHash,
          triggeredBonus: null,
        };
      }

      // Drop animation across 5 columns
      setSpinPhase("DROPPING");
      setVsDuelColumns([]);
      setActivePaylineWins([]);
      setStoppedCols([false, false, false, false, false]);
      setGrid(board);

      for (let col = 0; col < GRID_COLS; col++) {
        await sleep(col === 0 ? 220 : 105);
        if (!mountedRef.current) break;
        setStoppedCols((prev) => {
          const next = [...prev];
          next[col] = true;
          return next;
        });
        audioRef.current?.playReelStop(col);

        const hasScatterInCol = board.some(
          (r) =>
            r[col].symbol === "scatter_train" ||
            r[col].symbol === "scatter_duel" ||
            r[col].symbol === "scatter_dead"
        );
        if (hasScatterInCol) {
          audioRef.current?.playScatterChime(col + 1);
        }
      }

      // Sticky Wild Lock handling for Great Train Robbery
      const nextSticky = stickyMask.map((row) => [...row]);
      if (mode === "TRAIN_ROBBERY") {
        let newlyLocked = false;
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            if (board[r][c].symbol === "wild_star" && !nextSticky[r][c]) {
              nextSticky[r][c] = true;
              board[r][c] = { ...board[r][c], isStickyWild: true };
              newlyLocked = true;
            }
          }
        }
        if (newlyLocked) {
          setGrid(board.map((r) => [...r]));
          audioRef.current?.playStickyLock();
        }
      }

      // Check VS Duel Reel Expansion Eligibility
      const vsCols: number[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        if (board.some((r) => r[c].symbol === "vs_symbol")) {
          vsCols.push(c);
        }
      }

      const expandedVsMultByCol = new Map<number, number>();
      if (vsCols.length > 0) {
        // Test whether expanding these VS columns forms >= 1 winning payline OR all 5 reels have VS
        const hypotheticalMap = new Map<number, number>();
        vsCols.forEach((c) => hypotheticalMap.set(c, 2));
        const testEval = evaluatePaylines({
          grid: board,
          expandedVsMultByCol: hypotheticalMap,
          baseBetUSD: wagerBetUSD,
          globalMult,
        });

        if (testEval.wins.length > 0 || vsCols.length === GRID_COLS) {
          // 1) Roll Duel Multipliers & Outlaws for each VS Column
          const duelStates: VsDuelColumnState[] = vsCols.map((col) => {
            const topMult = pickWeighted(VS_MULTIPLIER_POOL, VS_MULTIPLIER_WEIGHTS, rng);
            let bottomMult = pickWeighted(VS_MULTIPLIER_POOL, VS_MULTIPLIER_WEIGHTS, rng);
            if (bottomMult === topMult) {
              bottomMult =
                VS_MULTIPLIER_POOL[
                  (VS_MULTIPLIER_POOL.indexOf(topMult) + 2) % VS_MULTIPLIER_POOL.length
                ];
            }
            const winningSide: "top" | "bottom" = rng() < 0.52 ? "top" : "bottom";
            const winningMult = winningSide === "top" ? topMult : bottomMult;
            expandedVsMultByCol.set(col, winningMult);

            const o1 = OUTLAW_NAMES[Math.floor(rng() * OUTLAW_NAMES.length)];
            let o2 = OUTLAW_NAMES[Math.floor(rng() * OUTLAW_NAMES.length)];
            if (o2 === o1) o2 = "BLACK JACK";

            return {
              col,
              topMult,
              bottomMult,
              winningSide,
              winningMult,
              topOutlaw: o1,
              bottomOutlaw: o2,
              stage: "expanding",
            };
          });

          // 2) Vertical Reel Expansion Animation (350ms)
          setSpinPhase("VS_EXPANDING");
          setBannerStatus(
            `VS DUEL EXPANDING ON ${vsCols.length} REEL${vsCols.length > 1 ? "S" : ""}!`
          );
          setVsDuelColumns(duelStates);
          audioRef.current?.playVsExpand();
          await sleep(350);

          if (!mountedRef.current) {
            return {
              finalGrid: board,
              newStickyMask: nextSticky,
              payoutUSD: 0,
              winMult: 0,
              wins: [],
              proofHash,
              triggeredBonus: null,
            };
          }

          // 3) Gunfight Duel Flash (400ms)
          setSpinPhase("VS_DUELING");
          setVsDuelColumns((prev) => prev.map((d) => ({ ...d, stage: "dueling" })));
          audioRef.current?.playGunshotDuel();
          triggerShake();
          await sleep(400);

          if (!mountedRef.current) {
            return {
              finalGrid: board,
              newStickyMask: nextSticky,
              payoutUSD: 0,
              winMult: 0,
              wins: [],
              proofHash,
              triggeredBonus: null,
            };
          }

          // 4) Lock winning multipliers
          setVsDuelColumns((prev) => prev.map((d) => ({ ...d, stage: "locked" })));
          await sleep(140);
        }
      }

      // Evaluate 15 Paylines
      setSpinPhase("EVALUATING");
      const evalRes = evaluatePaylines({
        grid: board,
        expandedVsMultByCol,
        baseBetUSD: wagerBetUSD,
        globalMult,
      });

      setActivePaylineWins(evalRes.wins);
      if (evalRes.totalPayoutUSD > 0) {
        audioRef.current?.playWinFanfare(evalRes.totalWinMult);
        if (evalRes.totalWinMult >= 15) triggerShake();
      }

      // Check Natural Bonus Triggers in Base Game
      let triggeredBonus: "TRAIN_ROBBERY" | "DUEL_AT_DAWN" | "DEAD_COLLECT" | null =
        null;
      if (mode === "NONE") {
        let trainCount = 0;
        let duelCount = 0;
        let deadCount = 0;
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            const sym = board[r][c].symbol;
            if (sym === "scatter_train") trainCount++;
            else if (sym === "scatter_duel") duelCount++;
            else if (sym === "scatter_dead") deadCount++;
          }
        }
        if (deadCount >= 3) triggeredBonus = "DEAD_COLLECT";
        else if (duelCount >= 3) triggeredBonus = "DUEL_AT_DAWN";
        else if (trainCount >= 3) triggeredBonus = "TRAIN_ROBBERY";
      }

      return {
        finalGrid: board,
        newStickyMask: nextSticky,
        payoutUSD: evalRes.totalPayoutUSD,
        winMult: evalRes.totalWinMult,
        wins: evalRes.wins,
        proofHash,
        triggeredBonus,
      };
    },
    [bonusHuntActive, clientSeed, runtimeRtpPercent, serverSeed, triggerShake]
  );

  // Execute Full Bonus Sequence (Train Robbery, Duel at Dawn, or 2-Phase Dead Man's Hand)
  const executeBonusSequence = useCallback(
    async (
      targetMode: "TRAIN_ROBBERY" | "DUEL_AT_DAWN" | "DEAD_COLLECT",
      wagerBetUSD: number,
      totalCostUSD: number,
      startingNonce: number
    ) => {
      let currentNonce = startingNonce;
      let cumulativeBonusWinUSD = 0;
      const maxBonusCapUSD = Number((wagerBetUSD * MAX_WIN_MULT).toFixed(2));
      setBonusTotalWinUSD(0);

      if (targetMode === "TRAIN_ROBBERY" || targetMode === "DUEL_AT_DAWN") {
        const isTrain = targetMode === "TRAIN_ROBBERY";
        setBonusMode(targetMode);
        setBonusIntroBanner({
          title: isTrain ? "THE GREAT TRAIN ROBBERY" : "DUEL AT DAWN",
          subtitle: isTrain
            ? "10 FREE SPINS • STICKY WILD SHERIFF STARS"
            : "10 FREE SPINS • HIGH-FREQUENCY VS GUNFIGHTS",
          theme: isTrain ? "train" : "duel",
        });
        audioRef.current?.playWinFanfare(25);
        await sleep(1650);
        if (!mountedRef.current) return;
        setBonusIntroBanner(null);

        let stickyMask = Array.from({ length: GRID_ROWS }, () =>
          Array(GRID_COLS).fill(false)
        );
        setStickyWildMask(stickyMask);
        setFreeSpinsTotal(10);

        for (let spinNum = 10; spinNum >= 1; spinNum--) {
          if (!mountedRef.current) break;
          setFreeSpinsLeft(spinNum);
          setBannerStatus(
            `${isTrain ? "TRAIN ROBBERY" : "DUEL AT DAWN"} • SPIN ${11 - spinNum} OF 10`
          );

          currentNonce += 1;
          setNonce(currentNonce);

          const res = await runSingleGridSpin({
            mode: targetMode,
            stickyMask,
            showdownWildCount: 0,
            globalMult: 1,
            wagerBetUSD,
            spinNonce: currentNonce,
          });
          if (!mountedRef.current) break;

          stickyMask = res.newStickyMask;
          setStickyWildMask(stickyMask);

          const remainingHeadroom = Math.max(0, maxBonusCapUSD - cumulativeBonusWinUSD);
          const spinAwardUSD = Math.min(remainingHeadroom, res.payoutUSD);
          cumulativeBonusWinUSD = Number((cumulativeBonusWinUSD + spinAwardUSD).toFixed(2));

          setLastWinUSD(spinAwardUSD);
          setLastWinMult(Number((spinAwardUSD / wagerBetUSD).toFixed(2)));
          setBonusTotalWinUSD(cumulativeBonusWinUSD);

          if (spinAwardUSD > 0) {
            commitBalance(balanceRef.current + spinAwardUSD);
          }

          await sleep(spinAwardUSD > 0 ? 850 : 420);
          if (cumulativeBonusWinUSD >= maxBonusCapUSD) break;
        }
      } else {
        // DEAD MAN'S HAND — 2-PHASE BONUS
        setBonusMode("DEAD_COLLECT");
        setDeadCollectedWilds(0);
        setDeadShowdownMult(1);
        setDeadRefillSpins(3);
        setDeadShowdownSpinsLeft(0);
        setVsDuelColumns([]);
        setActivePaylineWins([]);

        setBonusIntroBanner({
          title: "DEAD MAN'S HAND",
          subtitle: "PHASE 1: COLLECT WILDS & MULTIPLIERS (3 REFILLING SPINS)",
          theme: "dead",
        });
        audioRef.current?.playWinFanfare(35);
        await sleep(1700);
        if (!mountedRef.current) return;
        setBonusIntroBanner(null);

        let collectedWilds = 0;
        let showdownMult = 1;
        let refills = 3;

        while (refills > 0 && mountedRef.current) {
          setDeadRefillSpins(refills);
          setBannerStatus(
            `DEAD MAN'S HAND • COLLECT PHASE • ${refills} REFILL${refills > 1 ? "S" : ""} LEFT`
          );

          currentNonce += 1;
          setNonce(currentNonce);
          const proofHash = await computeHmacSha256Hex(
            serverSeed,
            `${clientSeed}:${currentNonce}:DEAD_COLLECT`
          );
          setLastProofHash(proofHash);
          const rng = createSeededRng(proofHash);

          const collectGrid = generateDeadCollectGrid(rng, collectedWilds);

          setSpinPhase("DROPPING");
          setStoppedCols([false, false, false, false, false]);
          setGrid(collectGrid);

          for (let col = 0; col < GRID_COLS; col++) {
            await sleep(col === 0 ? 180 : 85);
            if (!mountedRef.current) break;
            setStoppedCols((prev) => {
              const next = [...prev];
              next[col] = true;
              return next;
            });
            audioRef.current?.playReelStop(col);
          }

          let addedWilds = 0;
          let addedMult = 0;
          for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
              const cell = collectGrid[r][c];
              if (cell.symbol === "dead_wild_card") {
                addedWilds += cell.deadWildValue ?? 1;
              } else if (cell.symbol === "dead_mult_coin") {
                addedMult += cell.deadMultValue ?? 1;
              }
            }
          }

          if (addedWilds > 0 || addedMult > 0) {
            setSpinPhase("DEAD_COLLECTING");
            collectedWilds = Math.min(20, collectedWilds + addedWilds);
            showdownMult = showdownMult + addedMult;
            setDeadCollectedWilds(collectedWilds);
            setDeadShowdownMult(showdownMult);
            setDeadFlyToast(
              `${addedWilds > 0 ? `+${addedWilds} WILDS ` : ""}${addedMult > 0 ? `+${addedMult}x MULT` : ""}`.trim()
            );
            audioRef.current?.playDeadCollectHit();
            refills = 3; // Reset back to 3 spins!
            setDeadRefillSpins(3);
            await sleep(650);
            if (mountedRef.current) setDeadFlyToast(null);
          } else {
            refills -= 1;
            setDeadRefillSpins(refills);
            await sleep(360);
          }
        }

        if (!mountedRef.current) return;

        // Guarantee at least 3 Wilds if somehow 0 landed in Phase 1
        if (collectedWilds === 0) {
          collectedWilds = 3;
          setDeadCollectedWilds(3);
        }

        // PHASE 2 — THE SHOWDOWN (3 Final High-Voltage Spins!)
        setBonusMode("DEAD_SHOWDOWN");
        setBonusIntroBanner({
          title: "THE SHOWDOWN",
          subtitle: `3 SPINS • ${collectedWilds} WILDS SHOT RANDOMLY • ×${showdownMult} MULTIPLIER`,
          theme: "showdown",
        });
        audioRef.current?.playGunshotDuel();
        triggerShake();
        await sleep(1700);
        if (!mountedRef.current) return;
        setBonusIntroBanner(null);

        const emptySticky = Array.from({ length: GRID_ROWS }, () =>
          Array(GRID_COLS).fill(false)
        );

        for (let sdSpin = 3; sdSpin >= 1; sdSpin--) {
          if (!mountedRef.current) break;
          setDeadShowdownSpinsLeft(sdSpin);
          setBannerStatus(
            `THE SHOWDOWN • SPIN ${4 - sdSpin} OF 3 • ${collectedWilds} WILDS × ${showdownMult}x`
          );

          currentNonce += 1;
          setNonce(currentNonce);

          const res = await runSingleGridSpin({
            mode: "DEAD_SHOWDOWN",
            stickyMask: emptySticky,
            showdownWildCount: collectedWilds,
            globalMult: showdownMult,
            wagerBetUSD,
            spinNonce: currentNonce,
          });
          if (!mountedRef.current) break;

          const remainingHeadroom = Math.max(0, maxBonusCapUSD - cumulativeBonusWinUSD);
          const spinAwardUSD = Math.min(remainingHeadroom, res.payoutUSD);
          cumulativeBonusWinUSD = Number((cumulativeBonusWinUSD + spinAwardUSD).toFixed(2));

          setLastWinUSD(spinAwardUSD);
          setLastWinMult(Number((spinAwardUSD / wagerBetUSD).toFixed(2)));
          setBonusTotalWinUSD(cumulativeBonusWinUSD);

          if (spinAwardUSD > 0) {
            commitBalance(balanceRef.current + spinAwardUSD);
          }

          await sleep(spinAwardUSD > 0 ? 950 : 480);
          if (cumulativeBonusWinUSD >= maxBonusCapUSD) break;
        }
      }

      if (!mountedRef.current) return;

      // Record Bonus Summary & Show Celebration if Big
      const finalMult = Number((cumulativeBonusWinUSD / wagerBetUSD).toFixed(2));
      const finalHash = await computeHmacSha256Hex(
        serverSeed,
        `${clientSeed}:${currentNonce}:BONUS_END`
      );
      setLastProofHash(finalHash);
      emitBetRecord(totalCostUSD, cumulativeBonusWinUSD, finalHash);
      setHistory((prev) => [
        {
          id: nextUid("hist"),
          wagerUSD: totalCostUSD,
          payoutUSD: cumulativeBonusWinUSD,
          multiplier: finalMult,
          mode:
            targetMode === "TRAIN_ROBBERY"
              ? "Train Robbery"
              : targetMode === "DUEL_AT_DAWN"
                ? "Duel at Dawn"
                : "Dead Man's Hand",
          proofHash: finalHash,
        },
        ...prev.slice(0, 14),
      ]);

      if (finalMult >= 15) {
        const tier =
          finalMult >= MAX_WIN_MULT
            ? "WANTED MAX WIN"
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

      setBonusMode("NONE");
      setFreeSpinsLeft(0);
      setFreeSpinsTotal(0);
      setDeadShowdownSpinsLeft(0);
      setStickyWildMask(
        Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
      );
      setBannerStatus(
        cumulativeBonusWinUSD > 0
          ? `BONUS COMPLETE • WON ${formatUSD(cumulativeBonusWinUSD)} (${finalMult.toFixed(2)}x)!`
          : "BONUS COMPLETE • SPIN AGAIN FOR VS DUELS"
      );
    },
    [
      clientSeed,
      commitBalance,
      emitBetRecord,
      runSingleGridSpin,
      serverSeed,
      triggerShake,
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
    setLastWinUSD(0);
    setLastWinMult(0);
    setBannerStatus(
      bonusHuntActive
        ? "BONUS HUNT ACTIVE • HUNTING SCATTERS & VS DUELS..."
        : "SPINNING 5x5 REELS..."
    );
    audioRef.current?.playSpinTrigger();

    const emptySticky = Array.from({ length: GRID_ROWS }, () =>
      Array(GRID_COLS).fill(false)
    );

    const res = await runSingleGridSpin({
      mode: "NONE",
      stickyMask: emptySticky,
      showdownWildCount: 0,
      globalMult: 1,
      wagerBetUSD: wagerBet,
      spinNonce: nextNonce,
    });

    if (!mountedRef.current) {
      isBusyRef.current = false;
      return;
    }

    if (res.payoutUSD > 0) {
      commitBalance(balanceRef.current + res.payoutUSD);
      setLastWinUSD(res.payoutUSD);
      setLastWinMult(res.winMult);
      setBannerStatus(
        `${res.wins.length} PAYLINE${res.wins.length > 1 ? "S" : ""} WON ${formatUSD(res.payoutUSD)} (${res.winMult.toFixed(2)}x)`
      );
    } else {
      setBannerStatus("SPIN COMPLETE • LAND VS OR 3 SCATTERS");
    }

    if (!res.triggeredBonus) {
      emitBetRecord(spinCost, res.payoutUSD, res.proofHash);
      setHistory((prev) => [
        {
          id: nextUid("hist"),
          wagerUSD: spinCost,
          payoutUSD: res.payoutUSD,
          multiplier: Number((res.payoutUSD / wagerBet).toFixed(2)),
          mode: bonusHuntActive ? "Bonus Hunt" : "Base Spin",
          proofHash: res.proofHash,
        },
        ...prev.slice(0, 14),
      ]);

      if (res.winMult >= 15) {
        const tier =
          res.winMult >= MAX_WIN_MULT
            ? "WANTED MAX WIN"
            : res.winMult >= 50
              ? "MEGA WIN"
              : "BIG WIN";
        setWinCelebration({
          tier,
          amountUSD: res.payoutUSD,
          mult: res.winMult,
        });
        await sleep(2100);
        if (mountedRef.current) setWinCelebration(null);
      }
    } else {
      // Natural Bonus Triggered!
      setAutoSpinsLeft(0);
      await executeBonusSequence(res.triggeredBonus, wagerBet, spinCost, nextNonce);
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
    executeBonusSequence,
    nonce,
    runSingleGridSpin,
  ]);

  // Direct Feature Buy Handler (80x Train, 200x Duel, 400x Dead Man's Hand)
  const handleFeatureBuy = useCallback(
    async (buyId: "bonus_hunt" | "train" | "duel" | "dead") => {
      if (isBusyRef.current) return;
      audioRef.current?.unlock();

      if (buyId === "bonus_hunt") {
        setBonusHuntActive((prev) => !prev);
        setShowBuyModal(false);
        return;
      }

      const multMap = { train: 80, duel: 200, dead: 400 } as const;
      const modeMap = {
        train: "TRAIN_ROBBERY",
        duel: "DUEL_AT_DAWN",
        dead: "DEAD_COLLECT",
      } as const;

      const buyCostUSD = Number((baseBetUSD * multMap[buyId]).toFixed(2));
      if (balanceRef.current < buyCostUSD) {
        setBannerStatus(
          `NEED ${formatUSD(buyCostUSD)} TO BUY THIS BONUS — LOWER BASE BET`
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
      setLastWinUSD(0);
      setLastWinMult(0);

      await executeBonusSequence(modeMap[buyId], baseBetUSD, buyCostUSD, nextNonce);

      if (mountedRef.current) {
        setSpinPhase("IDLE");
      }
      isBusyRef.current = false;
    },
    [baseBetUSD, commitBalance, executeBonusSequence, nonce]
  );

  // Autoplay loop
  useEffect(() => {
    if (autoSpinsLeft <= 0) return;
    if (isBusyRef.current || spinPhase !== "IDLE" || bonusMode !== "NONE") return;

    const timer = setTimeout(() => {
      if (autoSpinsLeft > 0 && !isBusyRef.current) {
        setAutoSpinsLeft((prev) => Math.max(0, prev - 1));
        handleSpin();
      }
    }, 340);

    return () => clearTimeout(timer);
  }, [autoSpinsLeft, bonusMode, handleSpin, spinPhase]);

  // Spacebar spin shortcut
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

  // Active payline SVG coordinate set
  const activeWinCoordKeys = useMemo(() => {
    const keys = new Set<string>();
    if (highlightedLineIdx === null) return keys;
    const found = activePaylineWins.find((w) => w.lineIndex === highlightedLineIdx);
    if (found) {
      found.coords.forEach((pt) => keys.add(`${pt.row}-${pt.col}`));
    }
    return keys;
  }, [activePaylineWins, highlightedLineIdx]);

  // Stage Theme based on Bonus Mode
  const stageBackdropClass = useMemo(() => {
    if (bonusMode === "DUEL_AT_DAWN") {
      return "from-[#3b0707] via-[#1b0509] to-[#080305]";
    }
    if (bonusMode === "TRAIN_ROBBERY") {
      return "from-[#091b2b] via-[#0c1220] to-[#05070c]";
    }
    if (bonusMode === "DEAD_COLLECT" || bonusMode === "DEAD_SHOWDOWN") {
      return "from-[#2c061d] via-[#130612] to-[#050307]";
    }
    return "from-[#1c1008] via-[#110a07] to-[#070505]";
  }, [bonusMode]);

  const isSpinning = spinPhase !== "IDLE";

  return (
    <div
      style={{
        backgroundImage: `url(${ZYAN_SLOTS_ASSETS.ZYAN_WANTED.STAGE_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      className={`relative flex min-h-[calc(100vh-49px)] w-full flex-col justify-between overflow-hidden bg-gradient-to-b ${stageBackdropClass} text-white transition-colors duration-700`}
    >
      {/* Atmospheric Western Dusk & Wanted Poster Ambient Vignette */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black/45">
        <div
          className={`absolute -top-24 left-1/2 h-[420px] w-[780px] -translate-x-1/2 rounded-full blur-3xl transition-colors duration-700 ${
            bonusMode === "DUEL_AT_DAWN"
              ? "bg-red-600/30"
              : bonusMode === "TRAIN_ROBBERY"
                ? "bg-sky-500/20"
                : bonusMode === "DEAD_COLLECT" || bonusMode === "DEAD_SHOWDOWN"
                  ? "bg-rose-600/25"
                  : "bg-amber-600/20"
          }`}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(4,3,4,0.88)_100%)]" />
      </div>

      {/* TOP HEADER: Official ZYAN.GG Logo + Game Emblem + MAX WIN 12,500x */}
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
          <span className="font-ui hidden rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-stone-300 md:inline-block">
            {username}
          </span>
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <h1 className="font-display bg-gradient-to-b from-amber-100 via-amber-400 to-red-500 bg-clip-text text-base font-black uppercase tracking-tight text-transparent drop-shadow-[0_2px_10px_rgba(239,68,68,0.45)] sm:text-2xl lg:text-[26px]">
              ZYAN WANTED: DEAD OR A WILD
            </h1>
            <span className="font-display whitespace-nowrap rounded-md border border-amber-300/60 bg-gradient-to-r from-red-700 via-rose-600 to-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-[0_0_16px_rgba(239,68,68,0.65)] sm:text-xs">
              MAX WIN 12,500x
            </span>
          </div>
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

      {/* MAIN STAGE: Left Feature Buy Panel + Center 5x5 Hacksaw Grid */}
      <main className="relative z-20 mx-auto my-auto flex w-full max-w-[1380px] flex-1 flex-col items-center justify-center gap-3 px-2 py-2 lg:flex-row lg:items-stretch lg:gap-5 lg:px-6 lg:py-3">
        {/* LEFT DESKTOP HACKSAW FEATURE BUY PANEL */}
        <aside className="hidden w-[256px] shrink-0 flex-col justify-between gap-2 rounded-2xl border border-white/10 bg-stone-950/75 p-3 shadow-2xl backdrop-blur-md lg:flex">
          <div>
            <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-display text-xs font-black uppercase tracking-wider text-amber-300">
                BUY FEATURE
              </span>
              <span className="font-ui text-[11px] font-bold text-stone-400">
                Base {formatUSD(baseBetUSD)}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {FEATURE_BUY_CARDS.map((card) => {
                const isHunt = card.id === "bonus_hunt";
                const costUSD = Number((baseBetUSD * card.costMult).toFixed(2));
                const isActive = isHunt && bonusHuntActive;
                const disabled = isSpinning || bonusMode !== "NONE" || (!isHunt && balanceUSD < costUSD);

                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={isSpinning || bonusMode !== "NONE"}
                    onClick={() => handleFeatureBuy(card.id)}
                    className={`group relative overflow-hidden rounded-xl border p-2.5 text-left transition ${
                      isActive
                        ? "border-amber-300 bg-amber-500/20 shadow-[0_0_18px_rgba(251,191,36,0.3)]"
                        : `${card.border} bg-stone-900/80 hover:bg-stone-800/90`
                    } ${disabled ? "opacity-60" : "cursor-pointer"}`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div>
                        <div className="font-display text-[11px] font-black uppercase leading-tight text-white">
                          {card.title}
                        </div>
                        <div className="font-ui mt-0.5 text-[10px] font-medium text-stone-300">
                          {card.subtitle}
                        </div>
                      </div>
                      <span
                        className={`font-display shrink-0 rounded-md bg-gradient-to-r ${card.accent} px-1.5 py-0.5 text-[9px] font-black uppercase text-stone-950`}
                      >
                        {isHunt && bonusHuntActive ? "ON" : card.badge}
                      </span>
                    </div>
                    <div className="font-ui mt-2 flex items-center justify-between border-t border-white/10 pt-1.5 text-[11px] font-extrabold text-amber-300">
                      <span>{isHunt ? "Spin Cost" : "Buy Price"}</span>
                      <span>{formatUSD(costUSD)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mini Recent Spin Log */}
          <div className="rounded-xl border border-white/10 bg-black/45 p-2">
            <div className="font-display mb-1 text-[10px] font-black uppercase tracking-wider text-stone-400">
              RECENT SHOWDOWNS
            </div>
            {history.length === 0 ? (
              <div className="font-ui text-[10px] text-stone-500">
                Spin to log verified payouts.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {history.slice(0, 3).map((h) => (
                  <div
                    key={h.id}
                    className="font-ui flex items-center justify-between text-[10px]"
                  >
                    <span className="truncate text-stone-300">{h.mode}</span>
                    <span
                      className={`font-bold ${
                        h.payoutUSD > 0 ? "text-emerald-400" : "text-stone-500"
                      }`}
                    >
                      {h.payoutUSD > 0 ? `+${formatUSD(h.payoutUSD)}` : "$0.00"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* CENTER: 5x5 HACKSAW REEL ARENA */}
        <section
          className={`relative flex w-full max-w-[660px] flex-col items-center justify-center ${
            stageShake ? "animate-[zyanHunterShake_0.34s_ease-in-out]" : ""
          }`}
        >
          {/* DEAD MAN'S HAND TOP METERS OR ACTIVE BONUS BANNER */}
          {bonusMode === "DEAD_COLLECT" || bonusMode === "DEAD_SHOWDOWN" ? (
            <div className="mb-2 grid w-full grid-cols-3 items-center gap-2 rounded-xl border border-rose-500/40 bg-stone-950/90 px-3 py-2 shadow-xl">
              <div className="flex flex-col">
                <span className="font-display text-[9px] font-extrabold uppercase tracking-widest text-amber-300">
                  COLLECTED WILDS
                </span>
                <span className="font-display text-lg font-black text-white sm:text-xl">
                  {deadCollectedWilds}{" "}
                  <span className="text-xs font-bold text-stone-400">/ 20</span>
                </span>
              </div>

              <div className="flex flex-col items-center text-center">
                <span className="font-display text-[9px] font-extrabold uppercase tracking-widest text-rose-300">
                  {bonusMode === "DEAD_COLLECT" ? "REFILL SPINS" : "SHOWDOWN SPINS"}
                </span>
                <span className="font-display text-xl font-black text-amber-300">
                  {bonusMode === "DEAD_COLLECT"
                    ? deadRefillSpins
                    : deadShowdownSpinsLeft}
                </span>
              </div>

              <div className="flex flex-col items-end text-right">
                <span className="font-display text-[9px] font-extrabold uppercase tracking-widest text-rose-400">
                  GLOBAL MULTIPLIER
                </span>
                <span className="font-display text-lg font-black text-rose-300 sm:text-xl">
                  {deadShowdownMult}x
                </span>
              </div>
            </div>
          ) : bonusMode === "TRAIN_ROBBERY" || bonusMode === "DUEL_AT_DAWN" ? (
            <div className="mb-2 flex w-full items-center justify-between rounded-xl border border-amber-400/40 bg-stone-950/90 px-3.5 py-2 shadow-xl">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-400" />
                <span className="font-display text-xs font-black uppercase tracking-wider text-amber-200 sm:text-sm">
                  {bonusMode === "TRAIN_ROBBERY"
                    ? "THE GREAT TRAIN ROBBERY"
                    : "DUEL AT DAWN"}
                </span>
              </div>
              <div className="font-ui flex items-center gap-3 text-xs font-bold">
                <span className="text-stone-300">
                  SPINS:{" "}
                  <strong className="text-amber-300">
                    {freeSpinsLeft}/{freeSpinsTotal}
                  </strong>
                </span>
                <span className="text-emerald-300">
                  BONUS WIN: <strong>{formatUSD(bonusTotalWinUSD)}</strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-stone-950/75 px-3 py-1.5 backdrop-blur-sm">
              <span className="font-ui truncate text-[11px] font-bold tracking-wide text-amber-200 sm:text-xs">
                {bannerStatus}
              </span>
              {lastWinUSD > 0 && (
                <span className="font-display shrink-0 whitespace-nowrap rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-black text-emerald-300">
                  WIN {formatUSD(lastWinUSD)} ({lastWinMult.toFixed(2)}x)
                </span>
              )}
            </div>
          )}

          {/* 5x5 WANTED REEL FRAME */}
          <div className="relative w-full overflow-hidden rounded-2xl border-2 border-amber-500/35 bg-[#0e0a09]/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.9),inset_0_0_28px_rgba(0,0,0,0.85)] sm:p-3">
            {/* Corner Iron Rivets */}
            <div className="pointer-events-none absolute left-2 top-2 h-2 w-2 rounded-full bg-amber-600/60" />
            <div className="pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-600/60" />
            <div className="pointer-events-none absolute bottom-2 left-2 h-2 w-2 rounded-full bg-amber-600/60" />
            <div className="pointer-events-none absolute bottom-2 right-2 h-2 w-2 rounded-full bg-amber-600/60" />

            {/* Dead Man's Hand Fly Toast */}
            {deadFlyToast && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 animate-[zyanFloatCallout_0.75s_ease-out_forwards] rounded-lg border border-amber-300 bg-black/90 px-3 py-1 shadow-xl">
                <span className="font-display text-xs font-black uppercase tracking-wider text-amber-300">
                  {deadFlyToast} COLLECTED!
                </span>
              </div>
            )}

            {/* 5x5 CELL GRID */}
            <div className="relative grid aspect-square w-full grid-cols-5 grid-rows-5 gap-1.5 sm:gap-2">
              {grid.map((rowArr, r) =>
                rowArr.map((cell, c) => {
                  const colStopped = stoppedCols[c];
                  const isSticky =
                    bonusMode === "TRAIN_ROBBERY" && stickyWildMask[r]?.[c];
                  const isPaylineMatch = activeWinCoordKeys.has(`${r}-${c}`);
                  const vsInThisCol = vsDuelColumns.some((d) => d.col === c);

                  return (
                    <div
                      key={`${cell.uid}-${r}-${c}`}
                      className={`relative flex items-center justify-center overflow-hidden rounded-xl border transition-all duration-200 ${
                        isPaylineMatch
                          ? "z-10 border-amber-300 bg-amber-500/20 shadow-[0_0_20px_rgba(251,191,36,0.7)]"
                          : isSticky
                            ? "border-amber-400/80 bg-amber-950/40 shadow-[0_0_14px_rgba(251,191,36,0.45)]"
                            : cell.isShowdownShotWild
                              ? "border-rose-400/80 bg-rose-950/35 shadow-[0_0_14px_rgba(244,63,94,0.5)]"
                              : "border-white/10 bg-stone-900/65"
                      }`}
                      style={{
                        animation: !colStopped
                          ? `zyanReelDropOut 0.16s ease-in forwards`
                          : isSticky
                            ? `zyanStickyClank 0.35s ease-out`
                            : `zyanReelDropIn 0.28s cubic-bezier(0.22,1,0.36,1)`,
                        opacity: vsInThisCol ? 0.15 : 1,
                      }}
                    >
                      <SymbolArtwork
                        symbol={cell.symbol}
                        deadWildValue={cell.deadWildValue}
                        deadMultValue={cell.deadMultValue}
                      />

                      {isSticky && (
                        <span className="font-display absolute bottom-0.5 right-0.5 rounded bg-amber-400 px-1 text-[7px] font-black uppercase text-stone-950">
                          STICKY
                        </span>
                      )}
                    </div>
                  );
                })
              )}

              {/* EXPANDING "VS" DUEL REELS OVERLAY (FULL COLUMN 5-ROW BANNERS) */}
              {vsDuelColumns.map((duel) => (
                <div
                  key={`vs-col-${duel.col}`}
                  style={{
                    gridColumnStart: duel.col + 1,
                    gridColumnEnd: duel.col + 2,
                    gridRowStart: 1,
                    gridRowEnd: 6,
                    animation: "zyanVsExpand 0.35s cubic-bezier(0.22,1,0.36,1) forwards",
                  }}
                  className="pointer-events-none relative z-30 flex flex-col items-center justify-between overflow-hidden rounded-xl border-2 border-amber-300 bg-gradient-to-b from-red-950 via-[#1f0709] to-stone-950 py-2 shadow-[0_0_32px_rgba(239,68,68,0.85),inset_0_0_24px_rgba(251,191,36,0.35)]"
                >
                  {/* Top Rival Outlaw */}
                  <div
                    className={`flex flex-col items-center rounded-lg px-1.5 py-1 transition-all duration-200 ${
                      duel.stage === "locked" && duel.winningSide === "top"
                        ? "bg-amber-500/25 ring-1 ring-amber-300"
                        : duel.stage === "locked"
                          ? "opacity-40"
                          : "bg-black/40"
                    }`}
                  >
                    <span className="font-display text-[7px] font-black tracking-widest text-stone-300 sm:text-[8px]">
                      {duel.topOutlaw}
                    </span>
                    <span className="font-display text-sm font-black text-amber-300 sm:text-base">
                      {duel.topMult}x
                    </span>
                  </div>

                  {/* Center Gunfight Clash & Locked Multiplier */}
                  <div className="relative flex flex-col items-center justify-center px-1 text-center">
                    {duel.stage === "dueling" && (
                      <div className="flex flex-col items-center animate-[zyanDuelFlash_0.38s_ease-out]">
                        <div className="h-14 w-14 sm:h-16 sm:w-16">
                          <ProtectedArt
                            src={ZYAN_SLOTS_ASSETS.ZYAN_WANTED.VS_DUEL_BADGE}
                            alt="VS Gunfight Duel"
                            className="h-full w-full scale-110 rounded-xl object-contain mix-blend-lighten"
                            fallback={
                              <Crosshair className="h-8 w-8 text-red-400 drop-shadow-[0_0_14px_rgba(248,113,113,1)] sm:h-10 sm:w-10" />
                            }
                          />
                        </div>
                        <span className="font-display mt-1 text-[9px] font-black uppercase tracking-widest text-amber-200">
                          DUEL!
                        </span>
                      </div>
                    )}

                    {duel.stage === "expanding" && (
                      <div className="h-12 w-12 sm:h-14 sm:w-14">
                        <ProtectedArt
                          src={ZYAN_SLOTS_ASSETS.ZYAN_WANTED.VS_DUEL_BADGE}
                          alt="VS Expanding Duel"
                          className="h-full w-full scale-110 rounded-xl object-contain mix-blend-lighten"
                          fallback={
                            <span className="font-display text-lg font-black italic text-red-400 sm:text-2xl">
                              VS
                            </span>
                          }
                        />
                      </div>
                    )}

                    {duel.stage === "locked" && (
                      <div className="flex flex-col items-center animate-[zyanDuelFlash_0.3s_ease-out]">
                        <div className="mb-1 h-10 w-10 opacity-85 sm:h-12 sm:w-12">
                          <ProtectedArt
                            src={ZYAN_SLOTS_ASSETS.ZYAN_WANTED.VS_DUEL_BADGE}
                            alt="VS Wild Reel"
                            className="h-full w-full rounded-xl object-contain mix-blend-lighten"
                          />
                        </div>
                        <span className="font-display rounded-md bg-amber-400 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest text-stone-950 sm:text-[8px]">
                          WILD REEL
                        </span>
                        <span className="font-display mt-1 bg-gradient-to-b from-white via-amber-200 to-amber-500 bg-clip-text text-2xl font-black text-transparent drop-shadow-[0_3px_10px_rgba(251,191,36,0.9)] sm:text-4xl">
                          {duel.winningMult}x
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Rival Outlaw */}
                  <div
                    className={`flex flex-col items-center rounded-lg px-1.5 py-1 transition-all duration-200 ${
                      duel.stage === "locked" && duel.winningSide === "bottom"
                        ? "bg-amber-500/25 ring-1 ring-amber-300"
                        : duel.stage === "locked"
                          ? "opacity-40"
                          : "bg-black/40"
                    }`}
                  >
                    <span className="font-display text-sm font-black text-red-300 sm:text-base">
                      {duel.bottomMult}x
                    </span>
                    <span className="font-display text-[7px] font-black tracking-widest text-stone-300 sm:text-[8px]">
                      {duel.bottomOutlaw}
                    </span>
                  </div>
                </div>
              ))}

              {/* VECTOR PAYLINE TRACER SVG OVERLAY */}
              {highlightedLineIdx !== null && (
                <svg
                  viewBox="0 0 500 500"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                >
                  {(() => {
                    const winObj = activePaylineWins.find(
                      (w) => w.lineIndex === highlightedLineIdx
                    );
                    if (!winObj) return null;
                    const pts = winObj.coords
                      .map((pt) => `${pt.col * 100 + 50},${pt.row * 100 + 50}`)
                      .join(" ");
                    const color =
                      PAYLINE_COLORS[winObj.lineIndex % PAYLINE_COLORS.length];
                    return (
                      <>
                        <polyline
                          points={pts}
                          fill="none"
                          stroke="#000000"
                          strokeWidth="12"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeOpacity="0.65"
                        />
                        <polyline
                          points={pts}
                          fill="none"
                          stroke={color}
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </>
                    );
                  })()}
                </svg>
              )}
            </div>

            {/* Active Payline Win Callout Pill */}
            {highlightedLineIdx !== null && (
              <div className="mt-2 flex items-center justify-center">
                {(() => {
                  const winObj = activePaylineWins.find(
                    (w) => w.lineIndex === highlightedLineIdx
                  );
                  if (!winObj) return null;
                  return (
                    <div className="font-ui flex flex-wrap items-center justify-center gap-2 rounded-lg border border-amber-400/40 bg-black/75 px-3 py-1 text-[11px] font-bold text-amber-200">
                      <span>LINE {winObj.lineIndex + 1}</span>
                      <span className="text-stone-400">•</span>
                      <span>
                        {winObj.matchLength}x {SYMBOL_LABELS[winObj.symbol]}
                      </span>
                      {winObj.vsMultSum > 0 && (
                        <>
                          <span className="text-stone-400">•</span>
                          <span className="text-red-400">
                            VS ×{winObj.vsMultSum}
                          </span>
                        </>
                      )}
                      <span className="text-stone-400">•</span>
                      <span className="text-emerald-300">
                        {formatUSD(winObj.payoutUSD)}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* BONUS INTRO BANNER OVERLAY */}
            {bonusIntroBanner && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 p-4 text-center backdrop-blur-sm">
                <span className="font-display mb-1 text-[11px] font-black uppercase tracking-[0.28em] text-amber-300">
                  BONUS TRIGGERED
                </span>
                <h2 className="font-display bg-gradient-to-b from-amber-100 via-amber-400 to-red-500 bg-clip-text text-2xl font-black uppercase text-transparent sm:text-4xl">
                  {bonusIntroBanner.title}
                </h2>
                <p className="font-ui mt-2 max-w-md text-xs font-bold uppercase tracking-wider text-stone-200 sm:text-sm">
                  {bonusIntroBanner.subtitle}
                </p>
              </div>
            )}

            {/* BIG / MEGA / MAX WIN CELEBRATION OVERLAY */}
            {winCelebration && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/88 p-4 text-center backdrop-blur-md">
                <Trophy className="mb-2 h-14 w-14 text-amber-400 drop-shadow-[0_0_24px_rgba(251,191,36,0.9)]" />
                <div className="font-display bg-gradient-to-b from-amber-100 via-yellow-400 to-red-500 bg-clip-text text-3xl font-black uppercase tracking-tight text-transparent sm:text-5xl">
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

      {/* HACKSAW MINIMALIST CONTROL BAR (BOTTOM OF STAGE) */}
      <footer className="relative z-30 border-t border-white/10 bg-[#0b0909]/95 px-3 py-2.5 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex w-full max-w-[1380px] flex-wrap items-center justify-between gap-2.5">
          {/* LEFT: Menu/Paytable, Sound, BALANCE ($ USD), BET ($ USD) */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowPaytableModal(true)}
              aria-label="Paytable and Rules"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-stone-900 text-stone-200 transition hover:border-amber-400/50 hover:text-white"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? "Mute audio" : "Unmute audio"}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-stone-900 text-stone-200 transition hover:border-amber-400/50 hover:text-white"
            >
              {soundEnabled ? (
                <Volume2 className="h-5 w-5 text-amber-300" />
              ) : (
                <VolumeX className="h-5 w-5 text-stone-500" />
              )}
            </button>

            <div className="flex flex-col rounded-xl border border-white/10 bg-stone-900/90 px-3 py-1">
              <span className="font-display text-[9px] font-bold uppercase tracking-wider text-stone-400">
                BALANCE
              </span>
              <span className="font-ui text-sm font-extrabold text-emerald-300 sm:text-base">
                {formatUSD(balanceUSD)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-stone-900/90 px-2.5 py-1">
              <div className="flex flex-col pr-1">
                <span className="font-display text-[9px] font-bold uppercase tracking-wider text-stone-400">
                  {bonusHuntActive ? "HUNT BET (3x)" : "BET"}
                </span>
                <span className="font-ui text-sm font-extrabold text-white sm:text-base">
                  {formatUSD(effectiveSpinCostUSD)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled={isSpinning || bonusMode !== "NONE" || betIndex >= BET_LADDER_USD.length - 1}
                  onClick={() => setBetIndex((i) => Math.min(BET_LADDER_USD.length - 1, i + 1))}
                  aria-label="Increase bet"
                  className="flex h-4 w-6 items-center justify-center rounded bg-stone-800 text-stone-200 hover:bg-stone-700 disabled:opacity-40"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={isSpinning || bonusMode !== "NONE" || betIndex <= 0}
                  onClick={() => setBetIndex((i) => Math.max(0, i - 1))}
                  aria-label="Decrease bet"
                  className="flex h-4 w-6 items-center justify-center rounded bg-stone-800 text-stone-200 hover:bg-stone-700 disabled:opacity-40"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: BUY BONUS Gold Button, AUTOPLAY, Large Tactile Rounded-Square SPIN */}
          <div className="relative flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              disabled={isSpinning || bonusMode !== "NONE"}
              onClick={() => setShowBuyModal(true)}
              className="font-display flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-amber-300/70 bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-500 px-3.5 text-xs font-black uppercase tracking-wider text-stone-950 shadow-[0_0_20px_rgba(251,191,36,0.35)] transition hover:brightness-110 disabled:opacity-45"
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
                  disabled={bonusMode !== "NONE"}
                  onClick={() => setShowAutoMenu((s) => !s)}
                  className="font-display flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/15 bg-stone-900 px-3 text-xs font-black uppercase text-stone-200 transition hover:border-amber-400/50 hover:text-white disabled:opacity-45"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">AUTOPLAY</span>
                </button>
              )}

              {showAutoMenu && (
                <div className="absolute bottom-14 right-0 z-50 w-44 rounded-xl border border-white/15 bg-stone-950 p-2 shadow-2xl">
                  <div className="font-display mb-1.5 px-1 text-[10px] font-black uppercase tracking-wider text-stone-400">
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
                        className="font-ui rounded-lg border border-white/10 bg-stone-900 py-1.5 text-xs font-bold text-white hover:border-amber-400/60 hover:bg-stone-800"
                      >
                        {cnt} Spins
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* LARGE TACTILE ROUNDED-SQUARE SPIN BUTTON */}
            <button
              type="button"
              disabled={isSpinning || bonusMode !== "NONE"}
              onClick={handleSpin}
              aria-label="Spin Reels"
              className={`font-display flex h-12 w-24 items-center justify-center rounded-2xl border-2 border-amber-200/80 bg-gradient-to-b from-amber-300 via-amber-500 to-red-700 text-sm font-black uppercase tracking-wider text-stone-950 shadow-[0_6px_24px_rgba(245,158,11,0.5),inset_0_2px_0_rgba(255,255,255,0.6)] transition active:translate-y-0.5 sm:h-14 sm:w-28 sm:text-base ${
                isSpinning || bonusMode !== "NONE"
                  ? "cursor-not-allowed opacity-55"
                  : "cursor-pointer hover:brightness-110"
              }`}
            >
              {isSpinning ? "..." : "SPIN"}
            </button>
          </div>
        </div>

        {/* Footer Watermark */}
        <div className="mx-auto mt-2 flex w-full max-w-[1380px] items-center justify-between border-t border-white/5 pt-1.5 text-[10px] text-stone-500">
          <div className="flex items-center gap-2">
            <div className="h-4 w-16 overflow-hidden">
              <ProtectedArt
                src={ZYAN_LOGO_URL}
                alt="ZYAN.GG"
                className="h-full w-full object-contain mix-blend-lighten opacity-75"
              />
            </div>
            <span className="font-ui">WANTED: DEAD OR A WILD • 15 PAYLINES • 12,500x MAX</span>
          </div>
          <span className="font-ui hidden sm:inline">SPACEBAR TO SPIN • $ USD ENGINE</span>
        </div>
      </footer>

      {/* ====================================================================
       * MODALS: BUY BONUS, PAYTABLE & RULES, PROVABLY FAIR HMAC-SHA256
       * ================================================================== */}

      {showBuyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-amber-400/40 bg-stone-950 p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <div>
                <h3 className="font-display text-lg font-black uppercase text-amber-300">
                  BUY FEATURE BONUS
                </h3>
                <p className="font-ui text-xs text-stone-400">
                  Base Bet: <strong className="text-white">{formatUSD(baseBetUSD)}</strong> • Balance:{" "}
                  <strong className="text-emerald-300">{formatUSD(balanceUSD)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBuyModal(false)}
                className="rounded-lg bg-stone-900 p-1.5 text-stone-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {FEATURE_BUY_CARDS.map((card) => {
                const isHunt = card.id === "bonus_hunt";
                const costUSD = Number((baseBetUSD * card.costMult).toFixed(2));
                const cantAfford = !isHunt && balanceUSD < costUSD;
                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={cantAfford}
                    onClick={() => handleFeatureBuy(card.id)}
                    className={`flex flex-col justify-between rounded-xl border ${card.border} bg-stone-900/90 p-3 text-left transition hover:bg-stone-800 disabled:opacity-45`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-xs font-black uppercase text-white">
                          {card.title}
                        </span>
                        <span
                          className={`font-display rounded bg-gradient-to-r ${card.accent} px-1.5 py-0.5 text-[9px] font-black text-stone-950`}
                        >
                          {isHunt && bonusHuntActive ? "ACTIVE" : card.badge}
                        </span>
                      </div>
                      <p className="font-ui mt-1 text-[11px] leading-snug text-stone-300">
                        {card.description}
                      </p>
                    </div>
                    <div className="font-ui mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-xs font-black text-amber-300">
                      <span>{isHunt ? "Toggle Hunt Cost" : "Buy Now"}</span>
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
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-amber-400/35 bg-stone-950 p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-display text-lg font-black uppercase text-amber-300">
                  PAYTABLE, VS DUELS & 15 PAYLINES
                </h3>
                <p className="font-ui text-xs text-stone-400">
                  5×5 Grid • 15 Fixed Left-to-Right Paylines • Max Win Cap 12,500x
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPaytableModal(false)}
                className="rounded-lg bg-stone-900 p-1.5 text-stone-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Symbol Multipliers Grid */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(PAYTABLE) as Array<keyof typeof PAYTABLE>).map((sym) => {
                const pays = PAYTABLE[sym];
                return (
                  <div
                    key={sym}
                    className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-stone-900/80 p-2"
                  >
                    <div className="h-12 w-12 shrink-0">
                      <SymbolArtwork symbol={sym} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display truncate text-[10px] font-black uppercase text-white">
                        {SYMBOL_LABELS[sym]}
                      </div>
                      <div className="font-ui mt-0.5 text-[10px] text-stone-300">
                        <div>5x: <strong className="text-amber-300">{pays[2].toFixed(2)}x</strong></div>
                        <div>4x: <strong className="text-stone-200">{pays[1].toFixed(2)}x</strong></div>
                        <div>3x: <strong className="text-stone-400">{pays[0].toFixed(2)}x</strong></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mechanics Overview */}
            <div className="font-ui mt-4 grid gap-2.5 text-xs text-stone-300 sm:grid-cols-2">
              <div className="rounded-xl border border-red-500/30 bg-red-950/25 p-3">
                <div className="font-display mb-1 flex items-center gap-1.5 font-black uppercase text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  EXPANDING VS DUEL REELS (2x–100x)
                </div>
                Whenever VS lands and creates at least 1 winning payline (or 5 VS reels land), it expands across all 5 rows into a full WILD Duel Reel. Two Outlaws battle for a multiplier (2x–100x). All VS multipliers on a winning payline are ADDED together!
              </div>
              <div className="rounded-xl border border-sky-500/30 bg-sky-950/25 p-3">
                <div className="font-display mb-1 font-black uppercase text-sky-300">
                  3 BONUS MODES (LAND 3+ SCATTERS)
                </div>
                <strong>Great Train Robbery:</strong> 10 spins with Sticky Wilds.{" "}
                <strong>Duel at Dawn:</strong> 10 spins with frequent 1–5 VS Duel Reels.{" "}
                <strong>Dead Man&apos;s Hand:</strong> Collect up to 20 Wilds &amp; 31x+ multiplier, then shoot all Wilds across 3 Showdown Spins!
              </div>
            </div>
          </div>
        </div>
      )}

      {showFairModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-emerald-400/35 bg-stone-950 p-4 shadow-2xl sm:p-5">
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
                className="rounded-lg bg-stone-900 p-1.5 text-stone-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="font-ui flex flex-col gap-3 text-xs">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Active Server Seed
                </label>
                <div className="break-all rounded-lg border border-white/10 bg-stone-900 px-2.5 py-2 font-mono text-[11px] text-stone-300">
                  {serverSeed}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Client Seed (Editable)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={clientSeed}
                    onChange={(e) => setClientSeed(e.target.value)}
                    className="flex-1 rounded-lg border border-white/15 bg-stone-900 px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() => setClientSeed(randomHex(8))}
                    className="flex items-center gap-1 rounded-lg border border-white/15 bg-stone-800 px-2.5 text-xs font-bold text-stone-200 hover:bg-stone-700"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Rotate
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-stone-900 px-3 py-2">
                <span className="text-stone-400">Current Nonce</span>
                <span className="font-mono font-bold text-amber-300">{nonce}</span>
              </div>

              {lastProofHash && (
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-stone-400">
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
                  setVerifyOutput(`HMAC-SHA256 Verified: ${computed.slice(0, 32)}...`);
                }}
                className="font-display rounded-xl bg-emerald-500 py-2 text-xs font-black uppercase tracking-wider text-stone-950 hover:bg-emerald-400"
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

export default ZyanWantedSlot;
