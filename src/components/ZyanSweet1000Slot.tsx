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
} from "lucide-react";

import { ZYAN_SLOTS_ASSETS } from "../constants/slotAssets";

/* ============================================================================
 * 0. STUDIO 3D CUSTOM ASSETS & ANTI-COPY <ProtectedArt />
 * ========================================================================== */

export const SWEET_1000_CUSTOM_ASSETS = ZYAN_SLOTS_ASSETS.SWEET_1000;

interface ProtectedArtProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallback?: React.ReactNode;
}

const ProtectedArt: React.FC<ProtectedArtProps> = ({
  src,
  alt,
  className = "",
  style,
  fallback = null,
}) => {
  const [failed, setFailed] = useState(false);

  if (failed && fallback) {
    return <>{fallback}</>;
  }

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
          ...style,
        } as React.CSSProperties}
        className={className}
      />
      {/* Transparent anti-save shield */}
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

export interface ZyanSweet1000BetRecord {
  gameKey: "SWEET_1000";
  gameName: "Zyan.gg Sweet 1000";
  wagerUSD: number;
  multiplier: number;
  payoutUSD: number;
  isWin: boolean;
  proofHash: string;
}

export interface ZyanSweet1000Props {
  externalBalanceUSD?: number;
  onBalanceChange?: (newBalanceUSD: number) => void;
  onRecordBet?: (bet: ZyanSweet1000BetRecord) => void;
  activeRtpPercent?: number; // Default 96.5% (controlled silently by Admin Panel, hidden from player UI)
  username?: string;
}

export type SymbolId =
  | "heart_red"
  | "candy_purple"
  | "candy_green"
  | "candy_blue"
  | "fruit_apple"
  | "fruit_plum"
  | "fruit_melon"
  | "fruit_grape"
  | "fruit_banana"
  | "scatter_lollipop"
  | "bomb_multiplier";

type RegularSymbolId = Exclude<SymbolId, "scatter_lollipop" | "bomb_multiplier">;

type SpinPhase =
  | "IDLE"
  | "DROPPING"
  | "EVALUATING"
  | "EXPLODING"
  | "CASCADING"
  | "BOMB_MULTIPLYING"
  | "SPIN_COMPLETE";

interface CellData {
  uid: string;
  symbol: SymbolId;
  col: number;
  row: number;
  bombValue?: number;
  isWinning?: boolean;
  isExploding?: boolean;
  isBombDetonating?: boolean;
  isScatterHit?: boolean;
  animType: "none" | "drop-out" | "drop-in" | "cascade";
  fallRows?: number;
  dropDelayMs?: number;
}

interface TumbleHistoryItem {
  id: string;
  symbol: SymbolId;
  count: number;
  winUSD: number;
}

interface FloatingCallout {
  id: string;
  xPercent: number;
  yPercent: number;
  amountUSD: number;
  symbol: SymbolId;
}

interface FairnessHistoryItem {
  nonce: number;
  serverSeedHash: string;
  revealedServerSeed?: string;
  clientSeed: string;
  proofHash: string;
  wagerUSD: number;
  payoutUSD: number;
  multiplier: number;
  timestamp: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  rotation: number;
  vRot: number;
  shape: "shard" | "circle" | "star";
}

interface LaserBeam {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number; // 0..1
  alpha: number;
  color: string;
  bombValue: number;
  ringRadius: number;
}

interface CelebrationState {
  active: boolean;
  tierLabel: string;
  tierAccent: string;
  targetUSD: number;
  multiplier: number;
  isMaxWin: boolean;
}

/* ============================================================================
 * 2. PAYTABLE, CONSTANTS & SYMBOL METADATA
 * ========================================================================== */

const COLS = 6;
const ROWS = 5;
const MAX_WIN_MULTIPLIER = 25000;
const ZYAN_LOGO_URL =
  "https://i.ibb.co.com/20Dxw97d/Esports-wordmark-logo-ZYAN-GG-3d5c4c15-2-K.jpg";

const BET_PRESETS: number[] = [
  0.2, 0.4, 0.6, 0.8, 1.0, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0, 250.0, 500.0,
];

const BOMB_VALUES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 1000] as const;

const SYMBOL_META: Record<
  SymbolId,
  { name: string; color: string; particleColors: string[] }
> = {
  heart_red: {
    name: "Ruby Heart Candy",
    color: "#F43F5E",
    particleColors: ["#FB7185", "#E11D48", "#FDE047", "#FFFFFF"],
  },
  candy_purple: {
    name: "Amethyst Square",
    color: "#A855F7",
    particleColors: ["#C084FC", "#9333EA", "#F472B6", "#FFFFFF"],
  },
  candy_green: {
    name: "Emerald Pentagon",
    color: "#10B981",
    particleColors: ["#34D399", "#059669", "#A7F3D0", "#FFFFFF"],
  },
  candy_blue: {
    name: "Sapphire Oval",
    color: "#3B82F6",
    particleColors: ["#60A5FA", "#2563EB", "#BAE6FD", "#FFFFFF"],
  },
  fruit_apple: {
    name: "Crimson Apple",
    color: "#EF4444",
    particleColors: ["#F87171", "#DC2626", "#4ADE80", "#FFFFFF"],
  },
  fruit_plum: {
    name: "Royal Plum",
    color: "#8B5CF6",
    particleColors: ["#A78BFA", "#6D28D9", "#C4B5FD", "#FFFFFF"],
  },
  fruit_melon: {
    name: "Neon Watermelon",
    color: "#EC4899",
    particleColors: ["#F472B6", "#10B981", "#FB7185", "#FFFFFF"],
  },
  fruit_grape: {
    name: "Electric Grapes",
    color: "#7C3AED",
    particleColors: ["#A855F7", "#6366F1", "#34D399", "#FFFFFF"],
  },
  fruit_banana: {
    name: "Golden Banana",
    color: "#FACC15",
    particleColors: ["#FDE047", "#EAB308", "#FEF08A", "#FFFFFF"],
  },
  scatter_lollipop: {
    name: "Swirl Lollipop Scatter",
    color: "#EC4899",
    particleColors: ["#F472B6", "#FBBF24", "#FFFFFF", "#EC4899"],
  },
  bomb_multiplier: {
    name: "Multiplier Bomb",
    color: "#F59E0B",
    particleColors: ["#FBBF24", "#F59E0B", "#EC4899", "#38BDF8"],
  },
};

// Exact Scatter-Pays Paytable (8-9, 10-11, 12+)
const PAYTABLE: Record<
  RegularSymbolId,
  { tier8_9: number; tier10_11: number; tier12Plus: number }
> = {
  heart_red: { tier8_9: 10.0, tier10_11: 25.0, tier12Plus: 50.0 },
  candy_purple: { tier8_9: 2.5, tier10_11: 10.0, tier12Plus: 25.0 },
  candy_green: { tier8_9: 2.0, tier10_11: 5.0, tier12Plus: 15.0 },
  candy_blue: { tier8_9: 1.5, tier10_11: 2.0, tier12Plus: 12.0 },
  fruit_apple: { tier8_9: 1.0, tier10_11: 1.5, tier12Plus: 10.0 },
  fruit_plum: { tier8_9: 0.8, tier10_11: 1.2, tier12Plus: 8.0 },
  fruit_melon: { tier8_9: 0.5, tier10_11: 1.0, tier12Plus: 5.0 },
  fruit_grape: { tier8_9: 0.4, tier10_11: 0.9, tier12Plus: 4.0 },
  fruit_banana: { tier8_9: 0.25, tier10_11: 0.75, tier12Plus: 2.0 },
};

const SCATTER_PAYOUTS: Record<number, number> = {
  4: 3.0,
  5: 5.0,
  6: 100.0,
};

const REGULAR_SYMBOLS: RegularSymbolId[] = [
  "heart_red",
  "candy_purple",
  "candy_green",
  "candy_blue",
  "fruit_apple",
  "fruit_plum",
  "fruit_melon",
  "fruit_grape",
  "fruit_banana",
];

function formatUSD(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return `$${safe.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getClusterMultiplier(symbol: RegularSymbolId, count: number): number {
  const row = PAYTABLE[symbol];
  if (count >= 12) return row.tier12Plus;
  if (count >= 10) return row.tier10_11;
  if (count >= 8) return row.tier8_9;
  return 0;
}

/* ============================================================================
 * 3. PROVABLY FAIR CRYPTOGRAPHIC RNG & SHA-256 HELPERS
 * ========================================================================== */

function generateRandomHex(bytesLength = 32): string {
  const arr = new Uint8Array(bytesLength);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
  }
  // Fallback deterministic hash if crypto.subtle unavailable in insecure context
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  ).repeat(4);
}

class DeterministicSpinRng {
  private pool: number[] = [];
  private cursor = 0;

  constructor(private readonly seedHex: string) {
    this.expandBlock(0);
  }

  private expandBlock(blockIdx: number): void {
    // Fast 32-bit xorshift/mulberry seeded by SHA-256 digest hex + block index
    let state =
      parseInt(this.seedHex.slice((blockIdx * 8) % 56, ((blockIdx * 8) % 56) + 8), 16) ^
      (blockIdx * 0x9e3779b9);
    if (!Number.isFinite(state) || state === 0) state = 0x6d2b79f5;
    for (let i = 0; i < 64; i++) {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      this.pool.push(((t ^ (t >>> 14)) >>> 0) / 4294967296);
    }
  }

  nextFloat(): number {
    if (this.cursor >= this.pool.length) {
      this.expandBlock(Math.floor(this.cursor / 64));
    }
    return this.pool[this.cursor++];
  }
}

/* ============================================================================
 * 4. WEB AUDIO API POLYPHONIC SLOT SYNTHESIZER
 * ========================================================================== */

class SlotAudioEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === "undefined") return null;
    try {
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
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  public unlock(): void {
    this.ensureContext();
  }

  public playClick(pitch = 660): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(pitch, now);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.72, now + 0.055);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.065);
    } catch {
      // Ignore audio errors
    }
  }

  public playReelThud(colIndex: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = "sine";
      const startFreq = 112 + colIndex * 4;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.09);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(280, now);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Ignore
    }
  }

  public playTumbleChime(tumbleIndex: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      // Major scale pitch escalation: C5, D5, E5, G5, A5, C6, D6, E6
      const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
      const baseFreq = scale[Math.min(tumbleIndex, scale.length - 1)];
      const now = ctx.currentTime;

      [1, 1.5, 2].forEach((mult, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 0 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(baseFreq * mult, now + idx * 0.025);
        gain.gain.setValueAtTime(idx === 0 ? 0.14 : 0.06, now + idx * 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34 + idx * 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.025);
        osc.stop(now + 0.42);
      });
    } catch {
      // Ignore
    }
  }

  public playScatterBell(scatterOrdinal: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const freqs = [520, 620, 740, 880, 1046, 1244];
      const f = freqs[Math.min(scatterOrdinal - 1, freqs.length - 1)] || 520;

      // Metallic bell + shimmer harmonic
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "triangle";
      osc1.frequency.setValueAtTime(f, now);
      osc2.frequency.setValueAtTime(f * 2.41, now);

      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.46);
      osc2.stop(now + 0.46);

      // Subtle tease snare/drumroll pulse on 3rd+ scatter
      if (scatterOrdinal >= 3) {
        for (let i = 0; i < 4; i++) {
          const dOsc = ctx.createOscillator();
          const dGain = ctx.createGain();
          dOsc.type = "triangle";
          dOsc.frequency.setValueAtTime(170 + i * 25, now + i * 0.055);
          dGain.gain.setValueAtTime(0.06, now + i * 0.055);
          dGain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.05);
          dOsc.connect(dGain);
          dGain.connect(ctx.destination);
          dOsc.start(now + i * 0.055);
          dOsc.stop(now + i * 0.055 + 0.055);
        }
      }
    } catch {
      // Ignore
    }
  }

  public playBombBlast(bombValue: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // 1. Sub-bass impact
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(98, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 0.35);
      subGain.gain.setValueAtTime(0.28, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 0.4);

      // 2. Golden laser sweep
      const laser = ctx.createOscillator();
      const laserGain = ctx.createGain();
      laser.type = "sawtooth";
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(2800, now + 0.25);

      laser.frequency.setValueAtTime(320, now);
      laser.frequency.exponentialRampToValueAtTime(
        bombValue >= 100 ? 1760 : 1280,
        now + 0.26
      );
      laserGain.gain.setValueAtTime(0.11, now);
      laserGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      laser.connect(filter);
      filter.connect(laserGain);
      laserGain.connect(ctx.destination);
      laser.start(now);
      laser.stop(now + 0.3);

      // 3. Extra Nova chord on 100x or 1000x
      if (bombValue >= 100) {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const c = ctx.createOscillator();
          const cg = ctx.createGain();
          c.type = "triangle";
          c.frequency.setValueAtTime(freq, now + 0.04 * i);
          cg.gain.setValueAtTime(0.09, now + 0.04 * i);
          cg.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
          c.connect(cg);
          cg.connect(ctx.destination);
          c.start(now + 0.04 * i);
          c.stop(now + 0.56);
        });
      }
    } catch {
      // Ignore
    }
  }

  public playBonusFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      notes.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, now + idx * 0.08);
        gain.gain.setValueAtTime(0.14, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.48);
      });
    } catch {
      // Ignore
    }
  }

  public playWinTick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1180 + Math.random() * 180, now);
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
 * 5. CUSTOM 3D GLOSSY SVG SYMBOLS (11 DEDICATED LAYERED ARTWORKS)
 * ========================================================================== */

interface SlotSymbol3DProps {
  id: SymbolId;
  bombValue?: number;
  className?: string;
}

const SlotSymbol3D: React.FC<SlotSymbol3DProps> = React.memo(
  ({ id, bombValue = 2, className = "w-full h-full" }) => {
    const uid = useId().replace(/:/g, "");

    const bombTier = useMemo(() => {
      if (bombValue >= 1000) {
        return {
          label: "1000x",
          c1: "#FFF7AE",
          c2: "#F59E0B",
          c3: "#EC4899",
          c4: "#7C3AED",
          rim: "#FDE047",
          isNova: true,
        };
      }
      if (bombValue >= 50) {
        return {
          label: `${bombValue}x`,
          c1: "#FCA5A5",
          c2: "#EF4444",
          c3: "#991B1B",
          c4: "#F59E0B",
          rim: "#FBBF24",
          isNova: false,
        };
      }
      if (bombValue >= 10) {
        return {
          label: `${bombValue}x`,
          c1: "#F5D0FE",
          c2: "#C026D3",
          c3: "#6B21A8",
          c4: "#EC4899",
          rim: "#F472B6",
          isNova: false,
        };
      }
      return {
        label: `${bombValue}x`,
        c1: "#BAE6FD",
        c2: "#06B6D4",
        c3: "#047857",
        c4: "#10B981",
        rim: "#67E8F9",
        isNova: false,
      };
    }, [bombValue]);

    switch (id) {
      case "heart_red":
        return (
          <svg viewBox="0 0 100 100" className={className} aria-label="Ruby Heart Candy">
            <defs>
              <radialGradient id={`hr-body-${uid}`} cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#FFB4C2" />
                <stop offset="32%" stopColor="#FB2C5D" />
                <stop offset="78%" stopColor="#BE123C" />
                <stop offset="100%" stopColor="#7A0624" />
              </radialGradient>
              <linearGradient id={`hr-rim-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFE4E6" />
                <stop offset="50%" stopColor="#FDA4AF" />
                <stop offset="100%" stopColor="#9F1239" />
              </linearGradient>
              <filter id={`hr-sh-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
              </filter>
            </defs>
            <g filter={`url(#hr-sh-${uid})`}>
              <path
                d="M50 86 C20 67 10 48 10 32 C10 18 21 10 33 10 C42 10 47 15 50 21 C53 15 58 10 67 10 C79 10 90 18 90 32 C90 48 80 67 50 86 Z"
                fill={`url(#hr-rim-${uid})`}
              />
              <path
                d="M50 81 C23 64 14 47 14 33 C14 21 23 14 33 14 C41 14 46 19 50 25 C54 19 59 14 67 14 C77 14 86 21 86 33 C86 47 77 64 50 81 Z"
                fill={`url(#hr-body-${uid})`}
              />
              {/* Faceted inner gem heart */}
              <path
                d="M50 71 C31 58 23 45 23 34 C23 26 29 21 35 21 C41 21 46 25 50 30 C54 25 59 21 65 21 C71 21 77 26 77 34 C77 45 69 58 50 71 Z"
                fill="#FFFFFF"
                fillOpacity="0.14"
              />
              {/* Glossy top highlights */}
              <ellipse
                cx="31"
                cy="27"
                rx="10"
                ry="5.5"
                transform="rotate(-28 31 27)"
                fill="#FFFFFF"
                fillOpacity="0.72"
              />
              <circle cx="24" cy="36" r="3" fill="#FFFFFF" fillOpacity="0.55" />
              <ellipse
                cx="68"
                cy="25"
                rx="6"
                ry="3"
                transform="rotate(24 68 25)"
                fill="#FFFFFF"
                fillOpacity="0.35"
              />
            </g>
          </svg>
        );

      case "candy_purple":
        return (
          <svg viewBox="0 0 100 100" className={className} aria-label="Amethyst Square Candy">
            <defs>
              <linearGradient id={`cp-outer-${uid}`} x1="15%" y1="10%" x2="85%" y2="90%">
                <stop offset="0%" stopColor="#F0ABFC" />
                <stop offset="45%" stopColor="#A855F7" />
                <stop offset="100%" stopColor="#4C1D95" />
              </linearGradient>
              <radialGradient id={`cp-core-${uid}`} cx="38%" cy="32%" r="65%">
                <stop offset="0%" stopColor="#FAE8FF" />
                <stop offset="35%" stopColor="#C084FC" />
                <stop offset="85%" stopColor="#7E22CE" />
                <stop offset="100%" stopColor="#3B0764" />
              </radialGradient>
              <filter id={`cp-sh-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
              </filter>
            </defs>
            <g filter={`url(#cp-sh-${uid})`}>
              <rect
                x="13"
                y="13"
                width="74"
                height="74"
                rx="18"
                fill={`url(#cp-outer-${uid})`}
              />
              <rect
                x="18"
                y="18"
                width="64"
                height="64"
                rx="14"
                fill={`url(#cp-core-${uid})`}
              />
              {/* 3D bevel facets */}
              <path
                d="M28 24 L72 24 L64 34 L36 34 Z"
                fill="#FFFFFF"
                fillOpacity="0.28"
              />
              <path
                d="M28 76 L72 76 L64 66 L36 66 Z"
                fill="#2E1065"
                fillOpacity="0.45"
              />
              <rect
                x="33"
                y="33"
                width="34"
                height="34"
                rx="8"
                fill="#FFFFFF"
                fillOpacity="0.12"
                stroke="#F5D0FE"
                strokeOpacity="0.4"
                strokeWidth="1.5"
              />
              <ellipse
                cx="35"
                cy="28"
                rx="13"
                ry="4.5"
                transform="rotate(-14 35 28)"
                fill="#FFFFFF"
                fillOpacity="0.72"
              />
            </g>
          </svg>
        );

      case "candy_green":
        return (
          <svg viewBox="0 0 100 100" className={className} aria-label="Emerald Pentagon Gem">
            <defs>
              <linearGradient id={`cg-rim-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#A7F3D0" />
                <stop offset="50%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#064E3B" />
              </linearGradient>
              <radialGradient id={`cg-core-${uid}`} cx="38%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#ECFDF5" />
                <stop offset="32%" stopColor="#34D399" />
                <stop offset="78%" stopColor="#059669" />
                <stop offset="100%" stopColor="#022C22" />
              </radialGradient>
              <filter id={`cg-sh-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
              </filter>
            </defs>
            <g filter={`url(#cg-sh-${uid})`}>
              <polygon
                points="50,9 90,38 75,86 25,86 10,38"
                fill={`url(#cg-rim-${uid})`}
                stroke="#6EE7B7"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <polygon
                points="50,16 83,40 70,80 30,80 17,40"
                fill={`url(#cg-core-${uid})`}
                strokeLinejoin="round"
              />
              <polygon
                points="50,27 71,43 63,69 37,69 29,43"
                fill="#FFFFFF"
                fillOpacity="0.16"
                stroke="#A7F3D0"
                strokeOpacity="0.45"
                strokeWidth="1.2"
              />
              <ellipse
                cx="39"
                cy="30"
                rx="12"
                ry="4.5"
                transform="rotate(-24 39 30)"
                fill="#FFFFFF"
                fillOpacity="0.72"
              />
              <circle cx="27" cy="40" r="2.8" fill="#FFFFFF" fillOpacity="0.6" />
            </g>
          </svg>
        );

      case "candy_blue":
        return (
          <svg viewBox="0 0 100 100" className={className} aria-label="Sapphire Oval Candy">
            <defs>
              <radialGradient id={`cb-core-${uid}`} cx="35%" cy="28%" r="70%">
                <stop offset="0%" stopColor="#E0F2FE" />
                <stop offset="30%" stopColor="#38BDF8" />
                <stop offset="75%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#1E3A8A" />
              </radialGradient>
              <linearGradient id={`cb-rim-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#BAE6FD" />
                <stop offset="100%" stopColor="#1D4ED8" />
              </linearGradient>
              <filter id={`cb-sh-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
              </filter>
            </defs>
            <g filter={`url(#cb-sh-${uid})`}>
              <ellipse
                cx="50"
                cy="50"
                rx="38"
                ry="32"
                transform="rotate(-18 50 50)"
                fill={`url(#cb-rim-${uid})`}
              />
              <ellipse
                cx="50"
                cy="50"
                rx="34"
                ry="28"
                transform="rotate(-18 50 50)"
                fill={`url(#cb-core-${uid})`}
              />
              {/* Candy swirl highlight */}
              <path
                d="M25 48 C34 32 62 30 74 44"
                fill="none"
                stroke="#FFFFFF"
                strokeOpacity="0.35"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <ellipse
                cx="39"
                cy="34"
                rx="13"
                ry="5"
                transform="rotate(-24 39 34)"
                fill="#FFFFFF"
                fillOpacity="0.78"
              />
              <circle cx="27" cy="44" r="3" fill="#FFFFFF" fillOpacity="0.55" />
            </g>
          </svg>
        );

      case "fruit_apple":
        return (
          <svg viewBox="0 0 100 100" className={className} aria-label="Glossy Crimson Apple">
            <defs>
              <radialGradient id={`fa-body-${uid}`} cx="34%" cy="32%" r="68%">
                <stop offset="0%" stopColor="#FF9CA6" />
                <stop offset="28%" stopColor="#EF4444" />
                <stop offset="76%" stopColor="#B91C1C" />
                <stop offset="100%" stopColor="#450A0A" />
              </radialGradient>
              <linearGradient id={`fa-leaf-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#86EFAC" />
                <stop offset="100%" stopColor="#15803D" />
              </linearGradient>
              <filter id={`fa-sh-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
              </filter>
            </defs>
            <g filter={`url(#fa-sh-${uid})`}>
              {/* Stem & leaf */}
              <path
                d="M50 27 C49 17 53 12 58 9"
                fill="none"
                stroke="#78350F"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M52 21 C59 10 74 11 77 19 C68 25 57 25 52 21 Z"
                fill={`url(#fa-leaf-${uid})`}
                stroke="#BBF7D0"
                strokeWidth="1"
              />
              {/* Apple 3D body */}
              <path
                d="M50 28 C37 22 18 28 16 49 C14 70 30 88 43 87 C47 87 49 85 50 84 C51 85 53 87 57 87 C70 88 86 70 84 49 C82 28 63 22 50 28 Z"
                fill={`url(#fa-body-${uid})`}
              />
              {/* Glossy specular */}
              <ellipse
                cx="32"
                cy="42"
                rx="9"
                ry="14"
                transform="rotate(-14 32 42)"
                fill="#FFFFFF"
                fillOpacity="0.62"
              />
              <circle cx="29" cy="60" r="3.2" fill="#FFFFFF" fillOpacity="0.45" />
            </g>
          </svg>
        );

      case "fruit_plum":
        return (
          <svg viewBox="0 0 100 100" className={className} aria-label="Royal Violet Plum">
            <defs>
              <radialGradient id={`fp-body-${uid}`} cx="34%" cy="30%" r="72%">
                <stop offset="0%" stopColor="#DDD6FE" />
                <stop offset="28%" stopColor="#8B5CF6" />
                <stop offset="76%" stopColor="#5B21B6" />
                <stop offset="100%" stopColor="#2E1065" />
              </radialGradient>
              <filter id={`fp-sh-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
              </filter>
            </defs>
            <g filter={`url(#fp-sh-${uid})`}>
              <path
                d="M50 22 C50 14 54 10 58 8"
                fill="none"
                stroke="#78350F"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
              <path
                d="M51 17 C59 10 70 12 72 19 C63 23 55 21 51 17 Z"
                fill="#22C55E"
              />
              <ellipse cx="50" cy="55" rx="33" ry="34" fill={`url(#fp-body-${uid})`} />
              {/* Plum cleft */}
              <path
                d="M52 24 C45 41 45 69 52 86"
                fill="none"
                stroke="#2E1065"
                strokeOpacity="0.45"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <ellipse
                cx="35"
                cy="41"
                rx="8.5"
                ry="13"
                transform="rotate(-18 35 41)"
                fill="#FFFFFF"
                fillOpacity="0.58"
              />
              <circle cx="32" cy="59" r="3" fill="#FFFFFF" fillOpacity="0.45" />
            </g>
          </svg>
        );

      case "fruit_melon":
        return (
          <svg viewBox="0 0 100 100" className={className} aria-label="Neon Watermelon Slice">
            <defs>
              <radialGradient id={`fm-flesh-${uid}`} cx="45%" cy="35%" r="70%">
                <stop offset="0%" stopColor="#FDA4AF" />
                <stop offset="35%" stopColor="#FB3768" />
                <stop offset="100%" stopColor="#BE123C" />
              </radialGradient>
              <linearGradient id={`fm-rind-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4ADE80" />
                <stop offset="100%" stopColor="#15803D" />
              </linearGradient>
              <filter id={`fm-sh-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
              </filter>
            </defs>
            <g filter={`url(#fm-sh-${uid})`} transform="rotate(-12 50 50)">
              {/* Outer dark green rind */}
              <path d="M12 42 A40 40 0 0 0 88 42 Z" fill={`url(#fm-rind-${uid})`} />
              {/* Pale inner pith */}
              <path d="M17 42 A34.5 34.5 0 0 0 83 42 Z" fill="#DCFCE7" />
              {/* Juicy crimson-pink flesh */}
              <path d="M21 42 A30 30 0 0 0 79 42 Z" fill={`url(#fm-flesh-${uid})`} />
              {/* Seeds */}
              <ellipse cx="38" cy="53" rx="2.2" ry="3.8" fill="#1F2937" />
              <ellipse cx="50" cy="58" rx="2.2" ry="3.8" fill="#1F2937" />
              <ellipse cx="62" cy="53" rx="2.2" ry="3.8" fill="#1F2937" />
              <ellipse cx="44" cy="48" rx="1.8" ry="3" fill="#1F2937" />
              <ellipse cx="56" cy="48" rx="1.8" ry="3" fill="#1F2937" />
              {/* Gloss */}
              <path
                d="M27 46 L73 46"
                stroke="#FFFFFF"
                strokeOpacity="0.45"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </g>
          </svg>
        );

      case "fruit_grape":
        return (
          <svg viewBox="0 0 100 100" className={className} aria-label="Electric Grape Cluster">
            <defs>
              <radialGradient id={`fg-orb-${uid}`} cx="34%" cy="30%" r="68%">
                <stop offset="0%" stopColor="#F3E8FF" />
                <stop offset="30%" stopColor="#A855F7" />
                <stop offset="78%" stopColor="#6D28D9" />
                <stop offset="100%" stopColor="#2E1065" />
              </radialGradient>
              <filter id={`fg-sh-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.5" />
              </filter>
            </defs>
            <g filter={`url(#fg-sh-${uid})`}>
              {/* Stem & leaf */}
              <path
                d="M50 26 C50 15 56 11 63 10"
                fill="none"
                stroke="#4ADE80"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
              <path d="M51 19 C40 11 30 14 29 22 C37 25 46 23 51 19 Z" fill="#22C55E" />
              {/* Grape orbs back-to-front */}
              {[
                [33, 38],
                [50, 36],
                [67, 38],
                [39, 53],
                [58, 53],
                [48, 69],
                [50, 81],
              ].map(([cx, cy], idx) => (
                <g key={idx}>
                  <circle cx={cx} cy={cy} r="13.5" fill={`url(#fg-orb-${uid})`} />
                  <ellipse
                    cx={cx - 4.2}
                    cy={cy - 4.5}
                    rx="4"
                    ry="2.6"
                    transform={`rotate(-25 ${cx - 4.2} ${cy - 4.5})`}
                    fill="#FFFFFF"
                    fillOpacity="0.7"
                  />
                </g>
              ))}
            </g>
          </svg>
        );

      case "fruit_banana":
        return (
          <svg viewBox="0 0 100 100" className={className} aria-label="Golden Banana">
            <defs>
              <linearGradient id={`fb-gold1-${uid}`} x1="10%" y1="10%" x2="90%" y2="90%">
                <stop offset="0%" stopColor="#FEF9C3" />
                <stop offset="40%" stopColor="#FACC15" />
                <stop offset="100%" stopColor="#CA8A04" />
              </linearGradient>
              <linearGradient id={`fb-gold2-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FEF08A" />
                <stop offset="50%" stopColor="#EAB308" />
                <stop offset="100%" stopColor="#A16207" />
              </linearGradient>
              <filter id={`fb-sh-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
              </filter>
            </defs>
            <g filter={`url(#fb-sh-${uid})`}>
              {/* Back banana */}
              <path
                d="M27 25 C25 46 39 74 75 79 C79 79 81 74 77 70 C53 62 41 44 40 24 C40 19 28 20 27 25 Z"
                fill={`url(#fb-gold2-${uid})`}
              />
              {/* Front banana */}
              <path
                d="M19 32 C17 55 34 83 78 86 C84 86 86 79 80 75 C52 67 36 47 35 28 C34 22 20 25 19 32 Z"
                fill={`url(#fb-gold1-${uid})`}
              />
              {/* Brown tips */}
              <path
                d="M23 27 L31 24"
                stroke="#78350F"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <circle cx="80" cy="80" r="3.2" fill="#78350F" />
              {/* Glossy curved highlight */}
              <path
                d="M26 37 C27 54 41 72 67 78"
                fill="none"
                stroke="#FFFFFF"
                strokeOpacity="0.65"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </g>
          </svg>
        );

      case "scatter_lollipop": {
        const svgFallback = (
          <svg viewBox="0 0 100 100" className={className} aria-label="Swirl Lollipop Scatter">
            <defs>
              <radialGradient id={`sl-disc-${uid}`} cx="38%" cy="32%" r="68%">
                <stop offset="0%" stopColor="#FFF1F2" />
                <stop offset="35%" stopColor="#F472B6" />
                <stop offset="80%" stopColor="#DB2777" />
                <stop offset="100%" stopColor="#831843" />
              </radialGradient>
              <linearGradient id={`sl-gold-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FEF08A" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#B45309" />
              </linearGradient>
              <filter id={`sl-sh-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#EC4899" floodOpacity="0.55" />
              </filter>
            </defs>
            <g filter={`url(#sl-sh-${uid})`}>
              <rect x="46" y="62" width="8" height="30" rx="4" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
              <circle cx="50" cy="40" r="32" fill={`url(#sl-gold-${uid})`} />
              <circle cx="50" cy="40" r="28" fill={`url(#sl-disc-${uid})`} />
              <path
                d="M50 40 C50 34 57 34 57 40 C57 49 43 50 41 40 C39 27 59 23 66 34 C72 45 63 60 49 61 C33 62 24 46 30 30"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="4.2"
                strokeLinecap="round"
                strokeOpacity="0.9"
              />
              <ellipse cx="39" cy="27" rx="11" ry="4.5" transform="rotate(-28 39 27)" fill="#FFFFFF" fillOpacity="0.7" />
            </g>
          </svg>
        );
        return (
          <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
            <ProtectedArt
              src={SWEET_1000_CUSTOM_ASSETS.SCATTER_LOLLIPOP}
              alt="Swirl Lollipop Scatter"
              className="h-full w-full scale-110 rounded-xl object-contain mix-blend-lighten drop-shadow-[0_0_12px_rgba(236,72,153,0.75)]"
              fallback={svgFallback}
            />
          </div>
        );
      }

      case "bomb_multiplier": {
        const svgFallback = (
          <svg viewBox="0 0 100 100" className={className} aria-label={`${bombTier.label} Multiplier Bomb`}>
            <defs>
              <radialGradient id={`bm-orb-${uid}`} cx="36%" cy="30%" r="72%">
                <stop offset="0%" stopColor={bombTier.c1} />
                <stop offset="40%" stopColor={bombTier.c2} />
                <stop offset="82%" stopColor={bombTier.c3} />
                <stop offset="100%" stopColor={bombTier.c4} />
              </radialGradient>
              <linearGradient id={`bm-gold-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FEF08A" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#92400E" />
              </linearGradient>
            </defs>
            <path d="M52 24 C55 15 62 11 70 11" fill="none" stroke="#FDE68A" strokeWidth="4" strokeLinecap="round" />
            <rect x="41" y="21" width="18" height="9" rx="3" fill={`url(#bm-gold-${uid})`} />
            <circle cx="50" cy="57" r="33" fill="none" stroke={bombTier.rim} strokeWidth="2.5" />
            <circle cx="50" cy="57" r="31" fill={`url(#bm-orb-${uid})`} />
          </svg>
        );
        return (
          <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
            <ProtectedArt
              src={SWEET_1000_CUSTOM_ASSETS.MULTIPLIER_BOMB}
              alt={`${bombTier.label} Multiplier Bomb`}
              className={`h-full w-full scale-115 rounded-full object-contain mix-blend-lighten ${
                bombTier.isNova
                  ? "drop-shadow-[0_0_16px_rgba(253,224,71,0.95)]"
                  : "drop-shadow-[0_0_10px_rgba(245,158,11,0.7)]"
              }`}
              fallback={svgFallback}
            />
            {/* Exact Multiplier Stamped Dead-Center Over Bomb */}
            <span
              style={{
                WebkitTextStroke: "1.5px #140726",
                textShadow:
                  "0 2px 6px rgba(0,0,0,0.95), 0 0 14px rgba(245,158,11,0.85)",
              }}
              className={`font-display pointer-events-none absolute inset-0 z-20 flex items-center justify-center pt-1 font-black leading-none tracking-tight text-white ${
                bombValue >= 1000
                  ? "text-sm sm:text-lg"
                  : bombValue >= 100
                    ? "text-base sm:text-xl"
                    : "text-lg sm:text-2xl"
              }`}
            >
              {bombTier.label}
            </span>
          </div>
        );
      }
    }
  }
);
SlotSymbol3D.displayName = "SlotSymbol3D";

/* ============================================================================
 * 6. MAIN FLAGSHIP COMPONENT: ZyanSweet1000Slot
 * ========================================================================== */

export const ZyanSweet1000Slot: React.FC<ZyanSweet1000Props> = ({
  externalBalanceUSD,
  onBalanceChange,
  onRecordBet,
  activeRtpPercent = 96.5,
  username,
}) => {
  // --- Balance State (Standalone or Bridged) ---
  const [internalBalanceUSD, setInternalBalanceUSD] = useState<number>(1000.0);
  const isExternalControlled = typeof externalBalanceUSD === "number";
  const balanceUSD = isExternalControlled ? externalBalanceUSD : internalBalanceUSD;

  const balanceRef = useRef<number>(balanceUSD);
  balanceRef.current = balanceUSD;

  const updateBalance = useCallback(
    (nextBalance: number) => {
      const clamped = Math.max(0, Math.round(nextBalance * 100) / 100);
      balanceRef.current = clamped;
      if (!isExternalControlled) {
        setInternalBalanceUSD(clamped);
      }
      onBalanceChange?.(clamped);
      if (typeof window !== "undefined" && window.parent !== window) {
        window.parent.postMessage(
          { type: "ZYAN_BALANCE_SYNC", balanceUSD: clamped },
          "*"
        );
      }
    },
    [isExternalControlled, onBalanceChange]
  );

  // --- Bet & Mode Controls ---
  const [baseBetUSD, setBaseBetUSD] = useState<number>(2.0);
  const [doubleChance, setDoubleChance] = useState<boolean>(false);
  const [turboSpin, setTurboSpin] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<boolean>(false);

  const effectiveSpinCostUSD = useMemo(() => {
    const raw = doubleChance ? baseBetUSD * 1.25 : baseBetUSD;
    return Math.round(raw * 100) / 100;
  }, [baseBetUSD, doubleChance]);

  // --- Slot Engine State ---
  const [grid, setGrid] = useState<CellData[]>([]);
  const [phase, setPhase] = useState<SpinPhase>("IDLE");
  const [tumbleWinUSD, setTumbleWinUSD] = useState<number>(0);
  const [bombMultiplierSum, setBombMultiplierSum] = useState<number | null>(null);
  const [multipliedFinalWinUSD, setMultipliedFinalWinUSD] = useState<number | null>(
    null
  );
  const [tumbleHistory, setTumbleHistory] = useState<TumbleHistoryItem[]>([]);
  const [floatingCallouts, setFloatingCallouts] = useState<FloatingCallout[]>([]);

  // --- Free Spins Bonus State ---
  const [isFreeSpins, setIsFreeSpins] = useState<boolean>(false);
  const [isSuperBonus, setIsSuperBonus] = useState<boolean>(false);
  const [freeSpinsRemaining, setFreeSpinsRemaining] = useState<number>(0);
  const [totalFreeSpinsAwarded, setTotalFreeSpinsAwarded] = useState<number>(0);
  const [currentFreeSpinNum, setCurrentFreeSpinNum] = useState<number>(0);
  const [bonusCumulativeWinUSD, setBonusCumulativeWinUSD] = useState<number>(0);
  const [bonusNoticeBanner, setBonusNoticeBanner] = useState<string | null>(null);
  const [bonusSummaryModal, setBonusSummaryModal] = useState<{
    open: boolean;
    totalWinUSD: number;
    spinsPlayed: number;
    isMaxWin: boolean;
  }>({ open: false, totalWinUSD: 0, spinsPlayed: 0, isMaxWin: false });

  // --- Autoplay & UI Popovers / Modals ---
  const [autoplayRemaining, setAutoplayRemaining] = useState<number>(0);
  const [showAutoplayMenu, setShowAutoplayMenu] = useState<boolean>(false);
  const [showBetModal, setShowBetModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [showFairnessModal, setShowFairnessModal] = useState<boolean>(false);
  const [buyConfirmModal, setBuyConfirmModal] = useState<{
    open: boolean;
    superMode: boolean;
  }>({ open: false, superMode: false });

  // --- Win Celebration Overlay ---
  const [celebration, setCelebration] = useState<CelebrationState>({
    active: false,
    tierLabel: "",
    tierAccent: "#F59E0B",
    targetUSD: 0,
    multiplier: 0,
    isMaxWin: false,
  });
  const [celebrationDisplayUSD, setCelebrationDisplayUSD] = useState<number>(0);
  const celebrationSkipRef = useRef<boolean>(false);

  // --- Provably Fair Seed State ---
  const [serverSeed, setServerSeed] = useState<string>(() => generateRandomHex(32));
  const [serverSeedHash, setServerSeedHash] = useState<string>("");
  const [clientSeed, setClientSeed] = useState<string>("zyan-sweet-1000-player");
  const [nonce, setNonce] = useState<number>(1);
  const [fairnessHistory, setFairnessHistory] = useState<FairnessHistoryItem[]>([]);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // --- Refs for Concurrency & Timers ---
  const isSpinningRef = useRef<boolean>(false);
  const autoplayRef = useRef<number>(0);
  autoplayRef.current = autoplayRemaining;

  const freeSpinsStateRef = useRef({
    active: false,
    superMode: false,
    remaining: 0,
    awarded: 0,
    currentNum: 0,
    cumulativeWin: 0,
    wagerBase: 2.0,
    totalCost: 2.0,
  });

  const audioRef = useRef<SlotAudioEngine | null>(null);
  if (!audioRef.current) {
    audioRef.current = new SlotAudioEngine();
  }
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const mainStageRef = useRef<HTMLElement | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const celebrationCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const particlesRef = useRef<Particle[]>([]);
  const lasersRef = useRef<LaserBeam[]>([]);
  const uidCounterRef = useRef<number>(1);
  const unmountedRef = useRef<boolean>(false);

  const nextUid = useCallback((prefix = "cell") => {
    uidCounterRef.current += 1;
    return `${prefix}-${uidCounterRef.current}`;
  }, []);

  // Sync serverSeedHash whenever serverSeed changes
  useEffect(() => {
    let active = true;
    void sha256Hex(serverSeed).then((h) => {
      if (active) setServerSeedHash(h);
    });
    return () => {
      active = false;
    };
  }, [serverSeed]);

  // Cleanup on unmount
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // --- PostMessage Bridge Listener for GitHub / Iframe Integration ---
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (
        (data.type === "ZYAN_BALANCE_UPDATE" || data.type === "ZYAN_SET_BALANCE") &&
        typeof data.balanceUSD === "number" &&
        !isExternalControlled
      ) {
        setInternalBalanceUSD(Math.max(0, Math.round(data.balanceUSD * 100) / 100));
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isExternalControlled]);

  // --- Helper: Sleep with unmount awareness ---
  const sleep = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }, []);

  /* ==========================================================================
   * 7. RNG SYMBOL GENERATION (SILENTLY CALIBRATED BY activeRtpPercent)
   * ======================================================================== */

  const pickRegularSymbol = useCallback(
    (rng: DeterministicSpinRng): RegularSymbolId => {
      // Silent RTP calibration factor around 96.5% baseline
      const rtpDelta = (activeRtpPercent - 96.5) / 100;
      const weights: [RegularSymbolId, number][] = [
        ["heart_red", Math.max(2.5, 4.2 + rtpDelta * 4.5)],
        ["candy_purple", Math.max(3.5, 5.4 + rtpDelta * 4.0)],
        ["candy_green", Math.max(4.5, 6.6 + rtpDelta * 3.0)],
        ["candy_blue", Math.max(5.5, 7.8 + rtpDelta * 2.5)],
        ["fruit_apple", 9.8],
        ["fruit_plum", 11.2],
        ["fruit_melon", 13.0],
        ["fruit_grape", 14.5],
        ["fruit_banana", 16.5],
      ];
      const total = weights.reduce((acc, w) => acc + w[1], 0);
      let roll = rng.nextFloat() * total;
      for (const [sym, w] of weights) {
        roll -= w;
        if (roll <= 0) return sym;
      }
      return "fruit_banana";
    },
    [activeRtpPercent]
  );

  const pickBombValue = useCallback(
    (rng: DeterministicSpinRng, superMode: boolean): number => {
      if (superMode) {
        // Super Free Spins: EVERY bomb is guaranteed >= 20x!
        const superWeights: [number, number][] = [
          [20, 42],
          [25, 28],
          [50, 17],
          [100, 9.5],
          [1000, 3.5],
        ];
        const total = superWeights.reduce((acc, w) => acc + w[1], 0);
        let roll = rng.nextFloat() * total;
        for (const [val, w] of superWeights) {
          roll -= w;
          if (roll <= 0) return val;
        }
        return 20;
      }
      // Standard Free Spins Bomb Weights (2x - 1000x)
      const standardWeights: [number, number][] = [
        [2, 24],
        [3, 18],
        [4, 14],
        [5, 11],
        [6, 8],
        [8, 6.5],
        [10, 5.5],
        [12, 4.0],
        [15, 3.0],
        [20, 2.2],
        [25, 1.5],
        [50, 1.1],
        [100, 0.75],
        [1000, 0.45],
      ];
      const total = standardWeights.reduce((acc, w) => acc + w[1], 0);
      let roll = rng.nextFloat() * total;
      for (const [val, w] of standardWeights) {
        roll -= w;
        if (roll <= 0) return val;
      }
      return 2;
    },
    []
  );

  const rollCellSymbol = useCallback(
    (
      rng: DeterministicSpinRng,
      options: {
        inFreeSpins: boolean;
        superMode: boolean;
        anteDoubleChance: boolean;
        allowScatter: boolean;
        allowBomb: boolean;
      }
    ): { symbol: SymbolId; bombValue?: number } => {
      const rtpBias = Math.max(0.65, Math.min(1.35, activeRtpPercent / 96.5));

      if (options.inFreeSpins && options.allowBomb) {
        const bombChance = (options.superMode ? 0.068 : 0.056) * rtpBias;
        if (rng.nextFloat() < bombChance) {
          return {
            symbol: "bomb_multiplier",
            bombValue: pickBombValue(rng, options.superMode),
          };
        }
      }

      if (options.allowScatter) {
        const baseScatterChance = options.inFreeSpins
          ? 0.024
          : options.anteDoubleChance
            ? 0.044
            : 0.022;
        if (rng.nextFloat() < baseScatterChance * rtpBias) {
          return { symbol: "scatter_lollipop" };
        }
      }

      return { symbol: pickRegularSymbol(rng) };
    },
    [activeRtpPercent, pickBombValue, pickRegularSymbol]
  );

  // Initialize attractive opening board on mount
  useEffect(() => {
    const initRng = new DeterministicSpinRng(generateRandomHex(32));
    const initial: CellData[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const sym = pickRegularSymbol(initRng);
        initial.push({
          uid: nextUid("init"),
          symbol: sym,
          col,
          row,
          animType: "none",
        });
      }
    }
    // Place 2 eye-catching scatters for visual appeal on first load
    initial[7] = {
      ...initial[7],
      symbol: "scatter_lollipop",
    };
    initial[22] = {
      ...initial[22],
      symbol: "heart_red",
    };
    setGrid(initial);
  }, [nextUid, pickRegularSymbol]);

  /* ==========================================================================
   * 8. CANVAS PARTICLE SHATTER & LASER BEAM RENDERER (60FPS)
   * ======================================================================== */

  useEffect(() => {
    let animId = 0;
    const renderLoop = () => {
      const canvas = gridCanvasRef.current;
      const stage = mainStageRef.current;
      if (canvas && stage) {
        const rect = stage.getBoundingClientRect();
        if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
          canvas.width = Math.max(1, Math.round(rect.width));
          canvas.height = Math.max(1, Math.round(rect.height));
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Update & draw particles
          const nextParticles: Particle[] = [];
          for (const p of particlesRef.current) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.28; // gravity
            p.rotation += p.vRot;
            p.alpha -= p.decay;
            if (p.alpha > 0.02) {
              nextParticles.push(p);
              ctx.save();
              ctx.globalAlpha = Math.max(0, p.alpha);
              ctx.translate(p.x, p.y);
              ctx.rotate(p.rotation);
              ctx.fillStyle = p.color;
              if (p.shape === "circle") {
                ctx.beginPath();
                ctx.arc(0, 0, p.size * 0.55, 0, Math.PI * 2);
                ctx.fill();
              } else if (p.shape === "star") {
                ctx.beginPath();
                for (let s = 0; s < 4; s++) {
                  const ang = (s * Math.PI) / 2;
                  ctx.lineTo(Math.cos(ang) * p.size, Math.sin(ang) * p.size);
                  ctx.lineTo(
                    Math.cos(ang + Math.PI / 4) * (p.size * 0.35),
                    Math.sin(ang + Math.PI / 4) * (p.size * 0.35)
                  );
                }
                ctx.closePath();
                ctx.fill();
              } else {
                ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size * 0.7);
              }
              ctx.restore();
            }
          }
          particlesRef.current = nextParticles;

          // Update & draw bomb laser beams & shockwaves
          const nextBeams: LaserBeam[] = [];
          for (const b of lasersRef.current) {
            b.progress = Math.min(1, b.progress + 0.085);
            b.ringRadius += 4.2;
            b.alpha -= 0.022;
            if (b.alpha > 0.02) {
              nextBeams.push(b);
              // Shockwave ring at bomb origin
              ctx.save();
              ctx.globalAlpha = Math.max(0, b.alpha * 0.85);
              ctx.strokeStyle = b.color;
              ctx.lineWidth = 3.5;
              ctx.beginPath();
              ctx.arc(b.startX, b.startY, b.ringRadius, 0, Math.PI * 2);
              ctx.stroke();

              // Golden laser beam shooting up to TUMBLE WIN banner
              const curX = b.startX + (b.endX - b.startX) * b.progress;
              const curY = b.startY + (b.endY - b.startY) * b.progress;
              const grad = ctx.createLinearGradient(b.startX, b.startY, curX, curY);
              grad.addColorStop(0, "#FFFFFF");
              grad.addColorStop(0.4, b.color);
              grad.addColorStop(1, "#FDE047");

              ctx.shadowBlur = 18;
              ctx.shadowColor = b.color;
              ctx.strokeStyle = grad;
              ctx.lineWidth = b.bombValue >= 100 ? 7 : 4.5;
              ctx.lineCap = "round";
              ctx.beginPath();
              ctx.moveTo(b.startX, b.startY);
              ctx.lineTo(curX, curY);
              ctx.stroke();

              // Core white hot inner line
              ctx.lineWidth = 2;
              ctx.strokeStyle = "#FFFFFF";
              ctx.beginPath();
              ctx.moveTo(b.startX, b.startY);
              ctx.lineTo(curX, curY);
              ctx.stroke();
              ctx.restore();
            }
          }
          lasersRef.current = nextBeams;
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const spawnCellShatterParticles = useCallback(
    (col: number, row: number, symbol: SymbolId) => {
      const container = gridContainerRef.current;
      const stage = mainStageRef.current;
      if (!container || !stage) return;
      const gridRect = container.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const offsetX = gridRect.left - stageRect.left;
      const offsetY = gridRect.top - stageRect.top;
      const cellW = gridRect.width / COLS;
      const cellH = gridRect.height / ROWS;
      const cx = offsetX + (col + 0.5) * cellW;
      const cy = offsetY + (row + 0.5) * cellH;
      const colors = SYMBOL_META[symbol].particleColors;
      const shapes: Particle["shape"][] = ["shard", "circle", "star"];

      // Exactly 20 glowing particles per winning cell
      for (let i = 0; i < 20; i++) {
        const angle = (Math.PI * 2 * i) / 20 + (Math.random() - 0.5) * 0.35;
        const speed = 2.4 + Math.random() * 5.2;
        particlesRef.current.push({
          x: cx + (Math.random() - 0.5) * cellW * 0.3,
          y: cy + (Math.random() - 0.5) * cellH * 0.3,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2.2,
          size: 4 + Math.random() * 5.5,
          color: colors[i % colors.length],
          alpha: 1,
          decay: 0.022 + Math.random() * 0.015,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.25,
          shape: shapes[i % shapes.length],
        });
      }
    },
    []
  );

  const spawnBombLaser = useCallback((col: number, row: number, bombValue: number) => {
    const container = gridContainerRef.current;
    const stage = mainStageRef.current;
    if (!container || !stage) return;
    const gridRect = container.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const offsetX = gridRect.left - stageRect.left;
    const offsetY = gridRect.top - stageRect.top;
    const cellW = gridRect.width / COLS;
    const cellH = gridRect.height / ROWS;
    const startX = offsetX + (col + 0.5) * cellW;
    const startY = offsetY + (row + 0.5) * cellH;
    // Aim golden laser directly into the center of the top TUMBLE WIN banner
    let endX = stageRect.width * 0.5;
    let endY = 24;
    if (bannerRef.current) {
      const bannerRect = bannerRef.current.getBoundingClientRect();
      endX = bannerRect.left + bannerRect.width * 0.5 - stageRect.left;
      endY = bannerRect.top + bannerRect.height * 0.5 - stageRect.top;
    }
    const color =
      bombValue >= 1000
        ? "#FDE047"
        : bombValue >= 50
          ? "#F59E0B"
          : bombValue >= 10
            ? "#EC4899"
            : "#38BDF8";

    lasersRef.current.push({
      startX,
      startY,
      endX,
      endY,
      progress: 0.08,
      alpha: 1,
      color,
      bombValue,
      ringRadius: 8,
    });
    // Burst sparks at bomb center too
    for (let i = 0; i < 24; i++) {
      const ang = (Math.PI * 2 * i) / 24;
      const spd = 2.5 + Math.random() * 5.5;
      particlesRef.current.push({
        x: startX,
        y: startY,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 1.5,
        size: 5 + Math.random() * 5,
        color: i % 2 === 0 ? "#FDE047" : color,
        alpha: 1,
        decay: 0.024,
        rotation: 0,
        vRot: 0.15,
        shape: "star",
      });
    }
  }, []);

  /* ==========================================================================
   * 9. WIN TIER CELEBRATION OVERLAY + GOLD COIN & CANDY FOUNTAIN CANVAS
   * ======================================================================== */

  const triggerCelebration = useCallback(
    (winUSD: number, wagerBaseUSD: number, isMaxWin = false): Promise<void> => {
      const mult = wagerBaseUSD > 0 ? winUSD / wagerBaseUSD : 0;
      if (mult < 15 && !isMaxWin) return Promise.resolve();

      let tierLabel = "BIG WIN!";
      let tierAccent = "#10B981";
      if (isMaxWin) {
        tierLabel = "25,000x MAX WIN REACHED!";
        tierAccent = "#FDE047";
      } else if (mult >= 500) {
        tierLabel = "ZYAN 1000x SENSATIONAL WIN!";
        tierAccent = "#FDE047";
      } else if (mult >= 100) {
        tierLabel = "SUPERB WIN!";
        tierAccent = "#EC4899";
      } else if (mult >= 35) {
        tierLabel = "MEGA WIN!";
        tierAccent = "#F59E0B";
      }

      celebrationSkipRef.current = false;
      setCelebrationDisplayUSD(0);
      setCelebration({
        active: true,
        tierLabel,
        tierAccent,
        targetUSD: winUSD,
        multiplier: mult,
        isMaxWin,
      });

      return new Promise<void>((resolve) => {
        const duration = Math.min(3600, Math.max(1800, mult * 14));
        const start = performance.now();
        let lastTick = 0;

        const step = (now: number) => {
          if (unmountedRef.current) {
            resolve();
            return;
          }
          if (celebrationSkipRef.current) {
            setCelebrationDisplayUSD(winUSD);
            setTimeout(() => {
              setCelebration((c) => ({ ...c, active: false }));
              resolve();
            }, 650);
            return;
          }
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setCelebrationDisplayUSD(winUSD * eased);

          if (now - lastTick > 75 && t < 0.96) {
            lastTick = now;
            audioRef.current?.playWinTick();
          }

          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            setCelebrationDisplayUSD(winUSD);
            setTimeout(() => {
              setCelebration((c) => ({ ...c, active: false }));
              resolve();
            }, 1100);
          }
        };
        requestAnimationFrame(step);
      });
    },
    []
  );

  // Fountain canvas animation during Celebration
  useEffect(() => {
    if (!celebration.active) return;
    let raf = 0;
    interface CoinDrop {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      tilt: number;
      vTilt: number;
      color: string;
      isCoin: boolean;
    }
    const items: CoinDrop[] = [];
    const palette = ["#FDE047", "#F59E0B", "#EC4899", "#A855F7", "#34D399", "#38BDF8"];

    const tick = () => {
      const canvas = celebrationCanvasRef.current;
      if (!canvas) return;
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Spawn fountain coins & candies from bottom center
      for (let i = 0; i < 3; i++) {
        if (items.length < 130) {
          items.push({
            x: canvas.width * 0.5 + (Math.random() - 0.5) * 140,
            y: canvas.height + 20,
            vx: (Math.random() - 0.5) * 14,
            vy: -(11 + Math.random() * 11),
            r: 9 + Math.random() * 9,
            tilt: Math.random() * Math.PI,
            vTilt: 0.08 + Math.random() * 0.14,
            color: palette[Math.floor(Math.random() * palette.length)],
            isCoin: Math.random() < 0.65,
          });
        }
      }

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.x += it.vx;
        it.y += it.vy;
        it.vy += 0.36;
        it.tilt += it.vTilt;

        if (it.y > canvas.height + 60 && it.vy > 0) {
          items.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(it.x, it.y);
        const scaleX = Math.max(0.2, Math.abs(Math.cos(it.tilt)));
        ctx.scale(scaleX, 1);
        if (it.isCoin) {
          const grad = ctx.createRadialGradient(-3, -3, 1, 0, 0, it.r);
          grad.addColorStop(0, "#FEF9C3");
          grad.addColorStop(0.55, "#F59E0B");
          grad.addColorStop(1, "#92400E");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, it.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FDE047";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = it.color;
          ctx.beginPath();
          ctx.roundRect(-it.r * 0.8, -it.r * 0.8, it.r * 1.6, it.r * 1.6, 5);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          ctx.beginPath();
          ctx.arc(-it.r * 0.25, -it.r * 0.25, it.r * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [celebration.active]);

  /* ==========================================================================
   * 10. CORE 6x5 SCATTER-PAYS CASCADING TUMBLE ENGINE
   * ======================================================================== */

  const recordSpinSettlement = useCallback(
    (params: {
      wagerUSD: number;
      payoutUSD: number;
      baseBetForMult: number;
      proofHash: string;
      usedNonce: number;
    }) => {
      const mult =
        params.baseBetForMult > 0
          ? Math.round((params.payoutUSD / params.baseBetForMult) * 100) / 100
          : 0;
      const record: ZyanSweet1000BetRecord = {
        gameKey: "SWEET_1000",
        gameName: "Zyan.gg Sweet 1000",
        wagerUSD: params.wagerUSD,
        multiplier: mult,
        payoutUSD: Math.round(params.payoutUSD * 100) / 100,
        isWin: params.payoutUSD > 0,
        proofHash: params.proofHash,
      };
      onRecordBet?.(record);
      if (typeof window !== "undefined" && window.parent !== window) {
        window.parent.postMessage({ type: "ZYAN_SLOT_BET", ...record }, "*");
      }
      setFairnessHistory((prev) => [
        {
          nonce: params.usedNonce,
          serverSeedHash,
          clientSeed,
          proofHash: params.proofHash,
          wagerUSD: params.wagerUSD,
          payoutUSD: record.payoutUSD,
          multiplier: mult,
          timestamp: Date.now(),
        },
        ...prev.slice(0, 24),
      ]);
    },
    [clientSeed, onRecordBet, serverSeedHash]
  );

  const executeSingleDropAndTumbles = useCallback(
    async (opts: {
      rng: DeterministicSpinRng;
      betBaseUSD: number;
      inFreeSpins: boolean;
      superMode: boolean;
      forcedScatters?: number;
    }): Promise<{
      spinTotalWinUSD: number;
      scattersLanded: number;
      scatterWinUSD: number;
    }> => {
      const speedFactor = turboSpin ? 0.55 : 1;

      // 1. Drop old symbols out
      setPhase("DROPPING");
      setGrid((prev) =>
        prev.map((c) => ({
          ...c,
          isWinning: false,
          isExploding: false,
          isBombDetonating: false,
          isScatterHit: false,
          animType: "drop-out",
        }))
      );
      await sleep(Math.round(180 * speedFactor));
      if (unmountedRef.current) return { spinTotalWinUSD: 0, scattersLanded: 0, scatterWinUSD: 0 };

      // 2. Generate 30 fresh symbols for 6x5 grid
      const nextGrid: CellData[] = [];
      let scatterCountOnBoard = 0;

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const rolled = rollCellSymbol(opts.rng, {
            inFreeSpins: opts.inFreeSpins,
            superMode: opts.superMode,
            anteDoubleChance: doubleChance,
            allowScatter: scatterCountOnBoard < 6,
            allowBomb: opts.inFreeSpins,
          });
          if (rolled.symbol === "scatter_lollipop") {
            scatterCountOnBoard += 1;
          }
          nextGrid.push({
            uid: nextUid("sym"),
            symbol: rolled.symbol,
            bombValue: rolled.bombValue,
            col,
            row,
            animType: "drop-in",
            dropDelayMs: col * Math.round(45 * speedFactor),
          });
        }
      }

      // Force scatters for 100x / 500x Bonus Buy
      if (opts.forcedScatters && opts.forcedScatters > 0) {
        const chosenIndices = new Set<number>();
        while (chosenIndices.size < Math.min(opts.forcedScatters, 6)) {
          const idx = Math.floor(opts.rng.nextFloat() * 30);
          chosenIndices.add(idx);
        }
        let placed = 0;
        for (let i = 0; i < nextGrid.length; i++) {
          if (chosenIndices.has(i)) {
            nextGrid[i] = {
              ...nextGrid[i],
              symbol: "scatter_lollipop",
              bombValue: undefined,
              isScatterHit: true,
            };
            placed++;
          } else if (nextGrid[i].symbol === "scatter_lollipop" && placed > 0) {
            nextGrid[i] = {
              ...nextGrid[i],
              symbol: pickRegularSymbol(opts.rng),
            };
          }
        }
      }

      setGrid(nextGrid);

      // Staggered reel drop thuds + scatter bells
      let scatterHitCounter = 0;
      for (let c = 0; c < COLS; c++) {
        setTimeout(() => {
          if (unmountedRef.current) return;
          audioRef.current?.playReelThud(c);
          const colScatters = nextGrid.filter(
            (cell) => cell.col === c && cell.symbol === "scatter_lollipop"
          );
          if (colScatters.length > 0) {
            scatterHitCounter += colScatters.length;
            audioRef.current?.playScatterBell(scatterHitCounter);
          }
        }, Math.round((c * 45 + 140) * speedFactor));
      }

      await sleep(Math.round(480 * speedFactor));
      if (unmountedRef.current) return { spinTotalWinUSD: 0, scattersLanded: 0, scatterWinUSD: 0 };

      // 3. Cascading Tumble Loop
      let workingGrid = nextGrid.map((c) => ({ ...c, animType: "none" as CellData["animType"] }));
      let spinTumbleAccumUSD = 0;
      let tumbleStep = 0;

      while (true) {
        setPhase("EVALUATING");

        // Count regular symbols across all 30 cells
        const counts = new Map<RegularSymbolId, CellData[]>();
        for (const cell of workingGrid) {
          if (
            cell.symbol !== "scatter_lollipop" &&
            cell.symbol !== "bomb_multiplier"
          ) {
            const list = counts.get(cell.symbol) || [];
            list.push(cell);
            counts.set(cell.symbol, list);
          }
        }

        const winningGroups: {
          symbol: RegularSymbolId;
          cells: CellData[];
          winUSD: number;
        }[] = [];

        for (const [sym, cells] of counts.entries()) {
          if (cells.length >= 8) {
            const mult = getClusterMultiplier(sym, cells.length);
            const winUSD = Math.round(opts.betBaseUSD * mult * 100) / 100;
            winningGroups.push({ symbol: sym, cells, winUSD });
          }
        }

        if (winningGroups.length === 0) {
          break; // No more winning clusters
        }

        // Mark winning cells & spawn floating callouts
        const winningUidSet = new Set<string>();
        const newCallouts: FloatingCallout[] = [];
        const newHistoryEntries: TumbleHistoryItem[] = [];
        let stepWinUSD = 0;

        for (const grp of winningGroups) {
          stepWinUSD += grp.winUSD;
          let sumCol = 0;
          let sumRow = 0;
          for (const cell of grp.cells) {
            winningUidSet.add(cell.uid);
            sumCol += cell.col;
            sumRow += cell.row;
          }
          const avgCol = sumCol / grp.cells.length;
          const avgRow = sumRow / grp.cells.length;
          newCallouts.push({
            id: nextUid("callout"),
            xPercent: ((avgCol + 0.5) / COLS) * 100,
            yPercent: ((avgRow + 0.5) / ROWS) * 100,
            amountUSD: grp.winUSD,
            symbol: grp.symbol,
          });
          newHistoryEntries.push({
            id: nextUid("hist"),
            symbol: grp.symbol,
            count: grp.cells.length,
            winUSD: grp.winUSD,
          });
        }

        spinTumbleAccumUSD = Math.round((spinTumbleAccumUSD + stepWinUSD) * 100) / 100;
        setTumbleWinUSD(spinTumbleAccumUSD);
        setTumbleHistory((prev) => [...prev, ...newHistoryEntries]);
        setFloatingCallouts(newCallouts);
        audioRef.current?.playTumbleChime(tumbleStep);
        tumbleStep += 1;

        // Highlight winning clusters (scale 1.14x + gold-neon frame)
        workingGrid = workingGrid.map((cell) =>
          winningUidSet.has(cell.uid) ? { ...cell, isWinning: true } : cell
        );
        setGrid(workingGrid);
        await sleep(Math.round(360 * speedFactor));
        if (unmountedRef.current) break;

        // Shatter & Explode phase
        setPhase("EXPLODING");
        workingGrid = workingGrid.map((cell) =>
          winningUidSet.has(cell.uid)
            ? { ...cell, isWinning: false, isExploding: true }
            : cell
        );
        setGrid(workingGrid);

        for (const cell of workingGrid) {
          if (winningUidSet.has(cell.uid)) {
            spawnCellShatterParticles(cell.col, cell.row, cell.symbol);
          }
        }
        await sleep(Math.round(250 * speedFactor));
        if (unmountedRef.current) break;

        // Gravity Collapse & Refill (CASCADING)
        setPhase("CASCADING");
        setFloatingCallouts([]);

        const collapsedGrid: CellData[] = new Array(COLS * ROWS);
        let existingScatters = workingGrid.filter(
          (c) => !winningUidSet.has(c.uid) && c.symbol === "scatter_lollipop"
        ).length;

        for (let c = 0; c < COLS; c++) {
          const survivingCol = workingGrid
            .filter((cell) => cell.col === c && !winningUidSet.has(cell.uid))
            .sort((a, b) => a.row - b.row);

          const missingCount = ROWS - survivingCol.length;

          // Refill top empty rows with brand-new dropping symbols
          for (let r = 0; r < missingCount; r++) {
            const rolled = rollCellSymbol(opts.rng, {
              inFreeSpins: opts.inFreeSpins,
              superMode: opts.superMode,
              anteDoubleChance: doubleChance,
              allowScatter: existingScatters < 6,
              allowBomb: opts.inFreeSpins,
            });
            if (rolled.symbol === "scatter_lollipop") existingScatters += 1;

            collapsedGrid[r * COLS + c] = {
              uid: nextUid("refill"),
              symbol: rolled.symbol,
              bombValue: rolled.bombValue,
              col: c,
              row: r,
              animType: "cascade",
              fallRows: missingCount + 1,
            };
          }

          // Slide surviving symbols downward (including Scatters & sticky Bombs!)
          for (let i = 0; i < survivingCol.length; i++) {
            const targetRow = missingCount + i;
            const survivor = survivingCol[i];
            const deltaRows = targetRow - survivor.row;
            collapsedGrid[targetRow * COLS + c] = {
              ...survivor,
              row: targetRow,
              isWinning: false,
              isExploding: false,
              animType: deltaRows > 0 ? "cascade" : "none",
              fallRows: deltaRows > 0 ? deltaRows : 0,
            };
          }
        }

        workingGrid = collapsedGrid;
        setGrid(workingGrid);
        await sleep(Math.round(300 * speedFactor));
        if (unmountedRef.current) break;

        workingGrid = workingGrid.map((c) => ({ ...c, animType: "none", fallRows: 0 }));
      }

      // 4. Multiplier Bomb Detonation Sequence (Free Spins only, when tumble win > 0)
      let finalSpinWinUSD = spinTumbleAccumUSD;
      const bombsOnBoard = workingGrid.filter(
        (c) => c.symbol === "bomb_multiplier" && (c.bombValue || 0) > 0
      );

      if (opts.inFreeSpins && spinTumbleAccumUSD > 0 && bombsOnBoard.length > 0) {
        setPhase("BOMB_MULTIPLYING");
        await sleep(350);

        let runningMultSum = 0;
        for (const bomb of bombsOnBoard) {
          if (unmountedRef.current) break;
          const val = bomb.bombValue || 2;
          runningMultSum += val;
          setBombMultiplierSum(runningMultSum);
          audioRef.current?.playBombBlast(val);
          spawnBombLaser(bomb.col, bomb.row, val);

          workingGrid = workingGrid.map((c) =>
            c.uid === bomb.uid ? { ...c, isBombDetonating: true } : c
          );
          setGrid(workingGrid);
          await sleep(220);
        }

        finalSpinWinUSD =
          Math.round(spinTumbleAccumUSD * runningMultSum * 100) / 100;
        setMultipliedFinalWinUSD(finalSpinWinUSD);
        await sleep(850);
      }

      // 5. Evaluate Scatters on final settled board
      const finalScatters = workingGrid.filter(
        (c) => c.symbol === "scatter_lollipop"
      );
      const scattersLanded = finalScatters.length;
      let scatterWinUSD = 0;
      if (scattersLanded >= 4) {
        const mult = SCATTER_PAYOUTS[Math.min(6, scattersLanded)] || 3.0;
        scatterWinUSD = Math.round(opts.betBaseUSD * mult * 100) / 100;
        workingGrid = workingGrid.map((c) =>
          c.symbol === "scatter_lollipop" ? { ...c, isScatterHit: true } : c
        );
        setGrid(workingGrid);
        audioRef.current?.playBonusFanfare();
        await sleep(450);
      } else if (opts.inFreeSpins && scattersLanded >= 3) {
        workingGrid = workingGrid.map((c) =>
          c.symbol === "scatter_lollipop" ? { ...c, isScatterHit: true } : c
        );
        setGrid(workingGrid);
        audioRef.current?.playBonusFanfare();
        await sleep(400);
      }

      setPhase("SPIN_COMPLETE");
      return {
        spinTotalWinUSD: finalSpinWinUSD,
        scattersLanded,
        scatterWinUSD,
      };
    },
    [
      doubleChance,
      nextUid,
      pickRegularSymbol,
      rollCellSymbol,
      sleep,
      spawnBombLaser,
      spawnCellShatterParticles,
      turboSpin,
    ]
  );

  /* ==========================================================================
   * 11. FREE SPINS LOOP & BASE SPIN ORCHESTRATOR
   * ======================================================================== */

  const runSpin = useCallback(
    async (buyConfig?: { superMode: boolean; costMultiplier: number }) => {
      if (isSpinningRef.current) return;
      audioRef.current?.unlock();

      const fsActive = freeSpinsStateRef.current.active;
      const isBuy = Boolean(buyConfig);

      // Calculate upfront wager cost
      let wagerUSD = 0;
      let spinBetBaseUSD = baseBetUSD;

      if (fsActive) {
        spinBetBaseUSD = freeSpinsStateRef.current.wagerBase;
        wagerUSD = 0; // Already paid on trigger or bonus buy
      } else if (isBuy && buyConfig) {
        wagerUSD = Math.round(baseBetUSD * buyConfig.costMultiplier * 100) / 100;
        if (balanceRef.current < wagerUSD) {
          setAutoplayRemaining(0);
          return;
        }
        updateBalance(balanceRef.current - wagerUSD);
      } else {
        wagerUSD = effectiveSpinCostUSD;
        if (balanceRef.current < wagerUSD) {
          setAutoplayRemaining(0);
          return;
        }
        updateBalance(balanceRef.current - wagerUSD);
      }

      isSpinningRef.current = true;
      setShowBetModal(false);
      setShowAutoplayMenu(false);
      setTumbleWinUSD(0);
      setBombMultiplierSum(null);
      setMultipliedFinalWinUSD(null);
      setTumbleHistory([]);
      setFloatingCallouts([]);

      const currentNonce = nonce;
      setNonce((n) => n + 1);
      const proofHash = await sha256Hex(
        `${serverSeed}:${clientSeed}:${currentNonce}`
      );
      const rng = new DeterministicSpinRng(proofHash);

      // Update Free Spin counter when stepping through bonus
      if (fsActive) {
        freeSpinsStateRef.current.remaining -= 1;
        freeSpinsStateRef.current.currentNum += 1;
        setFreeSpinsRemaining(freeSpinsStateRef.current.remaining);
        setCurrentFreeSpinNum(freeSpinsStateRef.current.currentNum);
      }

      const result = await executeSingleDropAndTumbles({
        rng,
        betBaseUSD: spinBetBaseUSD,
        inFreeSpins: fsActive,
        superMode: fsActive ? freeSpinsStateRef.current.superMode : false,
        forcedScatters: isBuy ? 4 : undefined,
      });

      if (unmountedRef.current) {
        isSpinningRef.current = false;
        return;
      }

      const maxCapUSD = Math.round(spinBetBaseUSD * MAX_WIN_MULTIPLIER * 100) / 100;

      if (!fsActive) {
        // --- Base Game / Bonus Buy Trigger Resolution ---
        const totalBaseSpinWin =
          Math.round((result.spinTotalWinUSD + result.scatterWinUSD) * 100) / 100;

        if (isBuy || result.scattersLanded >= 4) {
          // Enter 10 Free Spins Bonus Mode!
          setAutoplayRemaining(0);
          const startWin = Math.min(maxCapUSD, totalBaseSpinWin);
          const superMode = buyConfig?.superMode ?? false;

          freeSpinsStateRef.current = {
            active: true,
            superMode,
            remaining: 10,
            awarded: 10,
            currentNum: 0,
            cumulativeWin: startWin,
            wagerBase: spinBetBaseUSD,
            totalCost: isBuy ? wagerUSD : effectiveSpinCostUSD,
          };

          setIsFreeSpins(true);
          setIsSuperBonus(superMode);
          setFreeSpinsRemaining(10);
          setTotalFreeSpinsAwarded(10);
          setCurrentFreeSpinNum(0);
          setBonusCumulativeWinUSD(startWin);
          setBonusNoticeBanner(
            superMode
              ? "SUPER FREE SPINS ACTIVATED — 10 SPINS (20x–1000x BOMBS!)"
              : "10 FREE SPINS WON!"
          );
          await sleep(1400);
          setBonusNoticeBanner(null);

          isSpinningRef.current = false;
          // Auto-start first Free Spin cleanly
          if (!unmountedRef.current) {
            void runSpin();
          }
          return;
        }

        // Regular Base Spin Settlement
        const cappedWin = Math.min(maxCapUSD, totalBaseSpinWin);
        const hitMaxWin = totalBaseSpinWin >= maxCapUSD;
        if (cappedWin > 0) {
          updateBalance(balanceRef.current + cappedWin);
        }

        recordSpinSettlement({
          wagerUSD,
          payoutUSD: cappedWin,
          baseBetForMult: spinBetBaseUSD,
          proofHash,
          usedNonce: currentNonce,
        });

        if (cappedWin >= spinBetBaseUSD * 15 || hitMaxWin) {
          await triggerCelebration(cappedWin, spinBetBaseUSD, hitMaxWin);
        }

        setPhase("IDLE");
        isSpinningRef.current = false;

        // Continue Autoplay if active
        if (autoplayRef.current > 0 && !unmountedRef.current) {
          const nextAuto = autoplayRef.current - 1;
          setAutoplayRemaining(nextAuto);
          if (balanceRef.current >= effectiveSpinCostUSD) {
            setTimeout(() => {
              if (!isSpinningRef.current && !unmountedRef.current) {
                void runSpin();
              }
            }, turboSpin ? 220 : 420);
          } else {
            setAutoplayRemaining(0);
          }
        }
      } else {
        // --- Inside Active Free Spins Round ---
        let nextCumulative =
          Math.round(
            (freeSpinsStateRef.current.cumulativeWin +
              result.spinTotalWinUSD +
              result.scatterWinUSD) *
              100
          ) / 100;

        let hitMaxWin = false;
        if (nextCumulative >= maxCapUSD) {
          nextCumulative = maxCapUSD;
          hitMaxWin = true;
          freeSpinsStateRef.current.remaining = 0;
          setFreeSpinsRemaining(0);
        }

        freeSpinsStateRef.current.cumulativeWin = nextCumulative;
        setBonusCumulativeWinUSD(nextCumulative);

        // Retrigger check: 3+ Scatters during Free Spins => +5 Extra Free Spins!
        if (!hitMaxWin && result.scattersLanded >= 3) {
          freeSpinsStateRef.current.remaining += 5;
          freeSpinsStateRef.current.awarded += 5;
          setFreeSpinsRemaining(freeSpinsStateRef.current.remaining);
          setTotalFreeSpinsAwarded(freeSpinsStateRef.current.awarded);
          setBonusNoticeBanner("+5 EXTRA FREE SPINS RETRIGGERED!");
          await sleep(1250);
          setBonusNoticeBanner(null);
        }

        if (freeSpinsStateRef.current.remaining > 0 && !hitMaxWin) {
          // Pause briefly on huge bomb spins, then advance to next Free Spin
          if (result.spinTotalWinUSD >= spinBetBaseUSD * 25) {
            await sleep(750);
          } else {
            await sleep(turboSpin ? 280 : 520);
          }
          isSpinningRef.current = false;
          if (!unmountedRef.current) {
            void runSpin();
          }
          return;
        }

        // --- Free Spins Bonus Round Complete! ---
        const totalBonusPayout = freeSpinsStateRef.current.cumulativeWin;
        const totalSpinsPlayed = freeSpinsStateRef.current.currentNum;
        const roundWager = freeSpinsStateRef.current.totalCost;

        if (totalBonusPayout > 0) {
          updateBalance(balanceRef.current + totalBonusPayout);
        }

        recordSpinSettlement({
          wagerUSD: roundWager,
          payoutUSD: totalBonusPayout,
          baseBetForMult: spinBetBaseUSD,
          proofHash,
          usedNonce: currentNonce,
        });

        if (totalBonusPayout >= spinBetBaseUSD * 15 || hitMaxWin) {
          await triggerCelebration(totalBonusPayout, spinBetBaseUSD, hitMaxWin);
        }

        setBonusSummaryModal({
          open: true,
          totalWinUSD: totalBonusPayout,
          spinsPlayed: totalSpinsPlayed,
          isMaxWin: hitMaxWin,
        });

        freeSpinsStateRef.current.active = false;
        setIsFreeSpins(false);
        setIsSuperBonus(false);
        setPhase("IDLE");
        isSpinningRef.current = false;
      }
    },
    [
      baseBetUSD,
      clientSeed,
      effectiveSpinCostUSD,
      executeSingleDropAndTumbles,
      nonce,
      recordSpinSettlement,
      serverSeed,
      sleep,
      triggerCelebration,
      turboSpin,
      updateBalance,
    ]
  );

  // --- Spacebar Shortcut (Spin / Skip Celebration) ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      e.preventDefault();
      if (celebration.active) {
        celebrationSkipRef.current = true;
        return;
      }
      if (bonusSummaryModal.open) {
        setBonusSummaryModal((s) => ({ ...s, open: false }));
        return;
      }
      if (
        !showBetModal &&
        !showInfoModal &&
        !showFairnessModal &&
        !buyConfirmModal.open &&
        !isSpinningRef.current
      ) {
        void runSpin();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    bonusSummaryModal.open,
    buyConfirmModal.open,
    celebration.active,
    runSpin,
    showBetModal,
    showFairnessModal,
    showInfoModal,
  ]);

  /* ==========================================================================
   * 12. INTERACTION HANDLERS
   * ======================================================================== */

  const adjustBetStep = useCallback(
    (dir: -1 | 1) => {
      if (isSpinningRef.current || isFreeSpins) return;
      audioRef.current?.playClick(dir > 0 ? 740 : 580);
      const idx = BET_PRESETS.findIndex((v) => v >= baseBetUSD - 0.001);
      const safeIdx = idx === -1 ? 0 : idx;
      const nextIdx = Math.max(0, Math.min(BET_PRESETS.length - 1, safeIdx + dir));
      setBaseBetUSD(BET_PRESETS[nextIdx]);
    },
    [baseBetUSD, isFreeSpins]
  );

  const handleConfirmBonusBuy = useCallback(() => {
    const superMode = buyConfirmModal.superMode;
    setBuyConfirmModal({ open: false, superMode: false });
    void runSpin({
      superMode,
      costMultiplier: superMode ? 500 : 100,
    });
  }, [buyConfirmModal.superMode, runSpin]);

  const handleStartAutoplay = useCallback(
    (count: number) => {
      setShowAutoplayMenu(false);
      setAutoplayRemaining(count);
      if (!isSpinningRef.current && !isFreeSpins) {
        void runSpin();
      }
    },
    [isFreeSpins, runSpin]
  );

  const handleRotateServerSeed = useCallback(() => {
    const oldSeed = serverSeed;
    setFairnessHistory((prev) =>
      prev.map((item) =>
        item.serverSeedHash === serverSeedHash
          ? { ...item, revealedServerSeed: oldSeed }
          : item
      )
    );
    setServerSeed(generateRandomHex(32));
    setNonce(1);
    audioRef.current?.playClick(820);
  }, [serverSeed, serverSeedHash]);

  const copyToClipboard = useCallback((text: string) => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 1500);
  }, []);

  const isBusy = phase !== "IDLE" || isFreeSpins;
  const buy100Cost = Math.round(baseBetUSD * 100 * 100) / 100;
  const buy500Cost = Math.round(baseBetUSD * 500 * 100) / 100;

  /* ==========================================================================
   * 13. RENDER
   * ======================================================================== */

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      style={{
        backgroundImage: `url(${SWEET_1000_CUSTOM_ASSETS.STAGE_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      className="relative min-h-screen w-full overflow-hidden bg-[#080714]"
    >
      {/* Subtle Dark Vignette & Free Spins Supernova Tint Over Stage BG */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-all duration-700 ${
          isFreeSpins
            ? "bg-[radial-gradient(ellipse_at_center,rgba(76,5,25,0.55)_0%,rgba(12,4,16,0.86)_100%)]"
            : "bg-[radial-gradient(ellipse_at_center,rgba(14,10,36,0.52)_0%,rgba(6,4,15,0.88)_100%)]"
        }`}
      />

      {/* Dynamic Stage Ambient Glow */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-40 left-1/2 h-[540px] w-[960px] -translate-x-1/2 rounded-full blur-[130px] transition-all duration-700 ${
          isFreeSpins
            ? "bg-gradient-to-r from-amber-500/25 via-rose-500/30 to-yellow-500/25"
            : "bg-gradient-to-r from-fuchsia-600/20 via-indigo-500/20 to-cyan-500/15"
        }`}
      />

      {/* Main Content Container (Desktop Baseline max-w 1220px) */}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1220px] flex-col justify-between px-2.5 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4">
        {/* ====================================================================
         * TOP STAGE HEADER: ZYAN.GG BRANDING & SWEET 1000 EMBLEM
         * ================================================================== */}
        <header className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2.5 sm:mb-3">
          {/* Top-Left Official ZYAN.GG Wordmark Logo */}
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
                Player: <strong className="text-white">{username}</strong>
              </span>
            )}
          </div>

          {/* Center Title Emblem: ZYAN.GG SWEET 1000 + MAX WIN 25,000x */}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <h1 className="font-display bg-gradient-to-r from-amber-200 via-yellow-400 to-pink-500 bg-clip-text text-lg font-black uppercase tracking-tight text-transparent drop-shadow-[0_2px_10px_rgba(245,158,11,0.35)] sm:text-2xl lg:text-[26px]">
              ZYAN.GG SWEET 1000
            </h1>
            <span className="font-display inline-flex items-center gap-1 rounded-md border border-amber-400/60 bg-gradient-to-r from-amber-500/20 to-pink-500/20 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.35)]">
              <Trophy className="h-3 w-3 text-amber-300" />
              MAX WIN 25,000x
            </span>
          </div>

          {/* Top-Right Compact Utility Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                audioRef.current?.playClick();
                setShowFairnessModal(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:border-emerald-400/50 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="whitespace-nowrap">Fairness</span>
            </button>
            <button
              type="button"
              onClick={() => {
                audioRef.current?.playClick();
                setShowInfoModal(true);
              }}
              aria-label="Paytable and Game Rules"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:border-pink-400/50 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <Info className="h-3.5 w-3.5 text-pink-400" />
              <span className="hidden whitespace-nowrap sm:inline">Paytable</span>
            </button>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute Audio" : "Mute Audio"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-rose-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-amber-300" />
              )}
            </button>
          </div>
        </header>

        {/* ====================================================================
         * MOBILE TOP FEATURE BUY BAR (< 768px)
         * ================================================================== */}
        <div className="mb-2 grid grid-cols-2 gap-2 md:hidden">
          <button
            type="button"
            disabled={isBusy || balanceUSD < buy100Cost}
            onClick={() => {
              audioRef.current?.playClick();
              setBuyConfirmModal({ open: true, superMode: false });
            }}
            className="flex min-h-[44px] flex-col items-center justify-center rounded-xl border-[1.5px] border-pink-500 bg-gradient-to-r from-emerald-950/90 via-slate-900/90 to-pink-950/90 px-2 py-1.5 text-center transition active:scale-[0.98] disabled:opacity-45"
          >
            <span className="font-display text-[10px] font-black uppercase tracking-wider text-pink-300">
              BUY FREE SPINS (100x)
            </span>
            <span className="font-ui text-xs font-extrabold text-white">
              {formatUSD(buy100Cost)}
            </span>
          </button>
          <button
            type="button"
            disabled={isBusy || balanceUSD < buy500Cost}
            onClick={() => {
              audioRef.current?.playClick();
              setBuyConfirmModal({ open: true, superMode: true });
            }}
            className="flex min-h-[44px] flex-col items-center justify-center rounded-xl border-[1.5px] border-amber-500 bg-gradient-to-r from-amber-950/90 via-rose-950/90 to-amber-900/80 px-2 py-1.5 text-center shadow-[0_0_20px_rgba(245,158,11,0.22)] transition active:scale-[0.98] disabled:opacity-45"
          >
            <span className="font-display text-[10px] font-black uppercase tracking-wider text-amber-300">
              SUPER FREE SPINS (500x)
            </span>
            <span className="font-ui text-xs font-extrabold text-white">
              {formatUSD(buy500Cost)}
            </span>
          </button>
        </div>

        {/* ====================================================================
         * MAIN STAGE: LEFT FEATURE BUY COLUMN + CENTER 6x5 REELS
         * ================================================================== */}
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-stretch lg:gap-4">
          {/* Desktop Left Column (240px): Bonus Buys, Double Chance & Tumble History */}
          <aside className="hidden w-[240px] shrink-0 flex-col gap-2.5 md:flex">
            {/* Card 1: BUY FREE SPINS (100x Base Bet) */}
            <button
              type="button"
              disabled={isBusy || balanceUSD < buy100Cost}
              onClick={() => {
                audioRef.current?.playClick();
                setBuyConfirmModal({ open: true, superMode: false });
              }}
              className="group relative overflow-hidden rounded-xl border-[1.5px] border-[#EC4899] bg-gradient-to-br from-emerald-950/95 via-[#181030] to-pink-950/90 p-3 text-left shadow-lg transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-[11px] font-black uppercase tracking-wider text-pink-300">
                  BUY FREE SPINS
                </span>
                <span className="font-display rounded bg-pink-500/20 px-1.5 py-0.5 text-[10px] font-black text-pink-200">
                  100x
                </span>
              </div>
              <div className="font-ui mt-1 text-xl font-extrabold tracking-tight text-white">
                {formatUSD(buy100Cost)}
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-emerald-300/90">
                4+ Scatters · 10 Free Spins
              </p>
            </button>

            {/* Card 2: BUY SUPER FREE SPINS (500x Base Bet) */}
            <button
              type="button"
              disabled={isBusy || balanceUSD < buy500Cost}
              onClick={() => {
                audioRef.current?.playClick();
                setBuyConfirmModal({ open: true, superMode: true });
              }}
              style={{ boxShadow: "0 0 25px rgba(245, 158, 11, 0.25)" }}
              className="group relative overflow-hidden rounded-xl border-[1.5px] border-[#F59E0B] bg-gradient-to-br from-amber-950/95 via-rose-950/90 to-[#240914] p-3 text-left transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-amber-200/15 to-transparent"
                style={{ animation: "zyanShimmerSweep 3.8s infinite linear" }}
              />
              <div className="flex items-center justify-between">
                <span className="font-display inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-amber-300">
                  <Flame className="h-3.5 w-3.5 text-amber-400" />
                  SUPER FREE SPINS
                </span>
                <span className="font-display rounded bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-black text-amber-200">
                  500x
                </span>
              </div>
              <div className="font-ui mt-1 text-xl font-extrabold tracking-tight text-amber-100">
                {formatUSD(buy500Cost)}
              </div>
              <p className="mt-0.5 text-[11px] font-semibold text-amber-300/95">
                All Bombs Guaranteed 20x–1000x
              </p>
            </button>

            {/* Card 3: DOUBLE CHANCE TO WIN FEATURE (1.25x Total Bet) */}
            <div className="rounded-xl border border-white/15 bg-slate-900/75 p-3 backdrop-blur-md">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-display text-[11px] font-black uppercase tracking-wide text-slate-200">
                    DOUBLE CHANCE
                  </div>
                  <div className="font-ui text-xs font-bold text-cyan-300">
                    Bet {formatUSD(Math.round(baseBetUSD * 1.25 * 100) / 100)} (1.25x)
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={doubleChance}
                  disabled={isBusy}
                  onClick={() => {
                    audioRef.current?.playClick(doubleChance ? 520 : 760);
                    setDoubleChance((d) => !d);
                  }}
                  className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-lg border px-1 font-display text-[11px] font-black transition-colors disabled:opacity-50 ${
                    doubleChance
                      ? "border-emerald-400 bg-emerald-500 text-slate-950"
                      : "border-white/20 bg-slate-800 text-slate-300"
                  }`}
                >
                  <span className="w-full text-center">
                    {doubleChance ? "ON" : "OFF"}
                  </span>
                </button>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
                2x natural chance to land Swirl Scatters
              </p>
            </div>

            {/* Card 4: Live Tumble History Box */}
            <div className="flex flex-1 flex-col rounded-xl border border-white/12 bg-slate-950/75 p-3 backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="font-display text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
                  TUMBLE HISTORY
                </span>
                <span className="font-ui text-[11px] font-semibold text-amber-300">
                  {tumbleHistory.length} {tumbleHistory.length === 1 ? "Cluster" : "Clusters"}
                </span>
              </div>
              {tumbleHistory.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-4 text-center text-xs text-slate-500">
                  <span>Match 8+ symbols anywhere</span>
                  <span className="mt-0.5 text-[11px] text-slate-600">
                    Cascading wins appear here
                  </span>
                </div>
              ) : (
                <div className="flex max-h-[210px] flex-col gap-1.5 overflow-y-auto pr-1">
                  {tumbleHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 shrink-0">
                          <SlotSymbol3D id={item.symbol} />
                        </div>
                        <span className="font-ui text-xs font-bold text-slate-200">
                          ×{item.count}
                        </span>
                      </div>
                      <span className="font-ui text-xs font-extrabold text-emerald-400">
                        +{formatUSD(item.winUSD)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Center Stage: Top Tumble / Free Spins Banner + 6x5 3D Glass Grid */}
          <main ref={mainStageRef} className="relative flex min-w-0 flex-1 flex-col">
            {/* Free Spins Arena Header OR Base Tumble Win Banner */}
            <div
              ref={bannerRef}
              className={`mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 backdrop-blur-md transition-all duration-500 sm:px-4 ${
                isFreeSpins
                  ? "border-amber-400/60 bg-gradient-to-r from-rose-950/90 via-amber-950/85 to-rose-950/90 shadow-[0_0_24px_rgba(245,158,11,0.3)]"
                  : "border-white/15 bg-slate-950/75"
              }`}
            >
              {isFreeSpins ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <span className="font-display rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-black uppercase text-slate-950">
                      {isSuperBonus ? "SUPER BONUS · 20x+" : "FREE SPINS"}
                    </span>
                    <span className="font-display text-xs font-black uppercase tracking-wide text-amber-200 sm:text-sm">
                      FREE SPINS: {currentFreeSpinNum} OF {totalFreeSpinsAwarded}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300/80">
                        BONUS TOTAL WIN
                      </div>
                      <div className="font-ui text-base font-black text-amber-300 sm:text-lg">
                        {formatUSD(bonusCumulativeWinUSD)}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex w-full items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    <span className="font-display text-xs font-extrabold uppercase tracking-wider text-slate-300">
                      8+ ANYWHERE PAYS · CASCADING TUMBLE
                    </span>
                  </div>
                  <div className="text-right">
                    {tumbleWinUSD > 0 ? (
                      <span className="font-display text-sm font-black uppercase tracking-wide text-emerald-400 sm:text-base">
                        TUMBLE WIN: {formatUSD(tumbleWinUSD)}
                      </span>
                    ) : (
                      <span className="font-ui text-xs font-semibold text-slate-400">
                        GOOD LUCK
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Iconic Tumble Win x Bomb Multiplier Transformation Line */}
              {isFreeSpins && tumbleWinUSD > 0 && (
                <div className="flex w-full items-center justify-center border-t border-amber-400/20 pt-1.5 text-center">
                  {bombMultiplierSum !== null && multipliedFinalWinUSD !== null ? (
                    <div className="font-display animate-pulse text-sm font-black uppercase tracking-wide text-yellow-300 sm:text-lg">
                      {formatUSD(tumbleWinUSD)} × {bombMultiplierSum}X ={" "}
                      <span className="text-emerald-300">
                        {formatUSD(multipliedFinalWinUSD)}
                      </span>
                    </div>
                  ) : bombMultiplierSum !== null ? (
                    <div className="font-display text-sm font-black uppercase tracking-wide text-amber-200 sm:text-base">
                      TUMBLE WIN: {formatUSD(tumbleWinUSD)} × {bombMultiplierSum}X...
                    </div>
                  ) : (
                    <div className="font-display text-sm font-black uppercase tracking-wide text-emerald-300 sm:text-base">
                      TUMBLE WIN: {formatUSD(tumbleWinUSD)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mobile Horizontal Tumble Win Strip (< 768px) */}
            {tumbleHistory.length > 0 && (
              <div className="mb-2 flex items-center gap-1.5 overflow-x-auto rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 md:hidden">
                {tumbleHistory.map((h) => (
                  <div
                    key={h.id}
                    className="flex shrink-0 items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5"
                  >
                    <div className="h-4 w-4">
                      <SlotSymbol3D id={h.symbol} />
                    </div>
                    <span className="font-ui text-[10px] font-bold text-emerald-400">
                      +{formatUSD(h.winUSD)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ================================================================
             * 6x5 3D GLASS SLOT MACHINE GRID (30 CELLS)
             * ============================================================== */}
            <div
              className={`relative flex-1 rounded-2xl border-2 p-1.5 shadow-2xl transition-all duration-700 sm:p-2.5 lg:p-3 ${
                isFreeSpins
                  ? "border-amber-400/75 bg-gradient-to-b from-rose-950/65 via-[#1c081a]/80 to-amber-950/65 shadow-[0_0_50px_rgba(245,158,11,0.28)]"
                  : "border-pink-400/45 bg-gradient-to-b from-indigo-950/65 via-[#120d2d]/80 to-purple-950/65 shadow-[0_0_50px_rgba(236,72,153,0.2)]"
              } backdrop-blur-xl`}
            >
              {/* Subtle Stage ZYAN.GG Watermark Behind Glass Grid */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.045]"
              >
                <span className="font-display text-5xl font-black tracking-widest text-white sm:text-7xl">
                  ZYAN.GG
                </span>
              </div>

              {/* 6x5 CSS Grid + Canvas Particles/Lasers + Floating Callouts */}
              <div
                ref={gridContainerRef}
                className="relative grid h-full min-h-[290px] w-full grid-cols-6 grid-rows-5 gap-1 overflow-hidden rounded-xl bg-black/30 p-1 sm:min-h-[420px] sm:gap-2 sm:p-2"
              >
                {grid.map((cell) => {
                  const animStyle: React.CSSProperties = {};
                  if (cell.animType === "drop-out") {
                    animStyle.animation = `zyanReelDropOut ${turboSpin ? "100ms" : "180ms"} ease-in forwards`;
                  } else if (cell.animType === "drop-in") {
                    animStyle.animation = `zyanReelDropIn ${turboSpin ? "220ms" : "340ms"} cubic-bezier(0.22, 1.28, 0.36, 1) ${cell.dropDelayMs || 0}ms both`;
                  } else if (cell.animType === "cascade" && (cell.fallRows || 0) > 0) {
                    (animStyle as Record<string, string | number>)["--zyan-fall-from"] = `-${(cell.fallRows || 1) * 108}%`;
                    animStyle.animation = `zyanCascadeFall ${turboSpin ? "160ms" : "260ms"} cubic-bezier(0.22, 1.2, 0.36, 1) both`;
                  } else if (cell.isWinning) {
                    animStyle.animation = "zyanSymbolWinPulse 0.34s ease-out forwards";
                  } else if (cell.isExploding) {
                    animStyle.animation = "zyanSymbolExplode 0.24s ease-in forwards";
                  } else if (cell.isBombDetonating) {
                    animStyle.animation = "zyanBombDetonate 0.45s ease-out forwards";
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
                          : cell.isBombDetonating
                            ? "z-10 border-2 border-yellow-300 bg-amber-500/30 shadow-[0_0_25px_rgba(253,224,71,0.9)]"
                            : cell.isScatterHit
                              ? "z-10 border-2 border-pink-400 bg-pink-500/25 shadow-[0_0_20px_rgba(236,72,153,0.8)]"
                              : "border border-white/5 bg-white/[0.03]"
                      }`}
                    >
                      <SlotSymbol3D
                        id={cell.symbol}
                        bombValue={cell.bombValue}
                        className="h-full w-full select-none"
                      />
                    </div>
                  );
                })}

                {/* Floating +$XX.XX Cluster Win Callouts */}
                {floatingCallouts.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      left: `${c.xPercent}%`,
                      top: `${c.yPercent}%`,
                      animation: "zyanFloatCallout 0.9s ease-out forwards",
                    }}
                    className="pointer-events-none absolute z-30 rounded-lg border border-amber-300/80 bg-slate-950/90 px-2.5 py-1 shadow-[0_4px_20px_rgba(0,0,0,0.85)]"
                  >
                    <span className="font-display text-sm font-black tracking-tight text-amber-300 sm:text-lg">
                      +{formatUSD(c.amountUSD)}
                    </span>
                  </div>
                ))}

                {/* Bonus Activation / Retrigger Notice Overlay */}
                {bonusNoticeBanner && (
                  <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                    <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-rose-900 via-amber-800 to-rose-900 px-6 py-4 text-center shadow-[0_0_50px_rgba(245,158,11,0.65)]">
                      <div className="font-display text-lg font-black uppercase tracking-wide text-amber-200 sm:text-2xl">
                        {bonusNoticeBanner}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* HTML5 Canvas for 20-Particle Shatter & Bomb Laser Beams (Unclipped across Stage & Banner) */}
            <canvas
              ref={gridCanvasRef}
              className="pointer-events-none absolute inset-0 z-20 h-full w-full"
            />
          </main>
        </div>

        {/* ====================================================================
         * BOTTOM PRAGMATIC CONTROL BAR (DESKTOP & MOBILE)
         * ================================================================== */}
        <footer className="relative mt-2.5 rounded-2xl border border-white/15 bg-slate-950/85 px-3 py-2.5 shadow-xl backdrop-blur-md sm:mt-3 sm:px-5 sm:py-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
            {/* Left Cluster: Info, Turbo, Double Chance (mobile), Credit & Bet */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <button
                type="button"
                onClick={() => {
                  audioRef.current?.playClick();
                  setShowInfoModal(true);
                }}
                aria-label="Open Paytable & Info"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/5 text-slate-200 transition hover:border-amber-400 hover:text-amber-300"
              >
                <Info className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  audioRef.current?.playClick(turboSpin ? 540 : 780);
                  setTurboSpin((t) => !t);
                }}
                className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition ${
                  turboSpin
                    ? "border-amber-400 bg-amber-400/20 text-amber-300"
                    : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">TURBO</span>
              </button>

              {/* Mobile Double Chance Quick Toggle */}
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  audioRef.current?.playClick();
                  setDoubleChance((d) => !d);
                }}
                className={`inline-flex h-10 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold transition disabled:opacity-45 md:hidden ${
                  doubleChance
                    ? "border-emerald-400 bg-emerald-500/25 text-emerald-300"
                    : "border-white/15 bg-white/5 text-slate-300"
                }`}
              >
                <span>2X CHANCE: {doubleChance ? "ON" : "OFF"}</span>
              </button>

              {/* CREDIT ($ USD) */}
              <div className="min-w-[100px]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  CREDIT
                </div>
                <div className="font-ui text-base font-extrabold text-white sm:text-lg">
                  {formatUSD(balanceUSD)}
                </div>
              </div>

              {/* BET ($ USD) with - / + and Bet Customizer Popover trigger */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isBusy || baseBetUSD <= BET_PRESETS[0]}
                  onClick={() => adjustBetStep(-1)}
                  aria-label="Decrease Bet"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white transition hover:bg-white/15 disabled:opacity-35"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    audioRef.current?.playClick();
                    setShowBetModal((s) => !s);
                  }}
                  className="min-w-[92px] rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-left transition hover:border-amber-400/60 disabled:opacity-60"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    BET {doubleChance ? "(1.25x)" : ""}
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
                  onClick={() => adjustBetStep(1)}
                  aria-label="Increase Bet"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white transition hover:bg-white/15 disabled:opacity-35"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Right Cluster: Autoplay + Large Circular Animated SPIN Button */}
            <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
              {/* Autoplay Control */}
              <div className="relative">
                {autoplayRemaining > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAutoplayRemaining(0)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-rose-400 bg-rose-500/20 px-3 text-xs font-extrabold text-rose-200 transition hover:bg-rose-500/30"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span className="font-ui">STOP ({autoplayRemaining})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      audioRef.current?.playClick();
                      setShowAutoplayMenu((s) => !s);
                    }}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3 text-xs font-bold text-slate-200 transition hover:border-amber-400/50 hover:bg-white/10 disabled:opacity-45"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>AUTOPLAY</span>
                  </button>
                )}

                {showAutoplayMenu && (
                  <div className="absolute right-0 bottom-14 z-40 w-44 rounded-xl border border-white/20 bg-slate-900 p-2 shadow-2xl">
                    <div className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Select Auto Spins
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[10, 25, 50, 100].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => handleStartAutoplay(cnt)}
                          className="font-ui rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-extrabold text-white transition hover:border-amber-400 hover:bg-amber-400/20"
                        >
                          {cnt} Spins
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Large Circular Animated SPIN Button */}
              <button
                type="button"
                disabled={isBusy || (!isFreeSpins && balanceUSD < effectiveSpinCostUSD)}
                onClick={() => void runSpin()}
                aria-label="Spin Reels"
                className={`group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 transition-transform duration-150 sm:h-16 sm:w-16 ${
                  isBusy
                    ? "cursor-not-allowed border-amber-400/40 bg-slate-800"
                    : "border-amber-300 bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-700 shadow-[0_0_28px_rgba(16,185,129,0.55)] hover:scale-105 active:scale-95"
                }`}
              >
                <RotateCw
                  className={`h-7 w-7 text-slate-950 transition-transform sm:h-8 sm:w-8 ${
                    isBusy ? "animate-spin text-amber-300" : "group-hover:rotate-45"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Bet Customizer Popover ($0.20 to $500.00) */}
          {showBetModal && (
            <div className="absolute bottom-20 left-2 z-40 w-[300px] rounded-2xl border border-white/20 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl sm:left-32">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-xs font-black uppercase tracking-wider text-amber-300">
                  SELECT BASE BET ($ USD)
                </span>
                <button
                  type="button"
                  onClick={() => setShowBetModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {BET_PRESETS.map((preset) => {
                  const active = Math.abs(baseBetUSD - preset) < 0.001;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        audioRef.current?.playClick(700);
                        setBaseBetUSD(preset);
                        setShowBetModal(false);
                      }}
                      className={`font-ui rounded-lg border py-2 text-xs font-bold transition ${
                        active
                          ? "border-amber-400 bg-amber-400 text-slate-950"
                          : "border-white/10 bg-white/5 text-slate-200 hover:border-white/30"
                      }`}
                    >
                      {formatUSD(preset)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </footer>
      </div>

      {/* ======================================================================
       * BONUS BUY CONFIRMATION MODAL (100x & 500x)
       * ==================================================================== */}
      {buyConfirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div
            className={`w-full max-w-md rounded-2xl border-2 p-6 shadow-2xl ${
              buyConfirmModal.superMode
                ? "border-amber-400 bg-gradient-to-b from-rose-950 to-slate-950"
                : "border-pink-500 bg-gradient-to-b from-[#1e1038] to-slate-950"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              {buyConfirmModal.superMode ? (
                <Flame className="h-5 w-5 text-amber-400" />
              ) : (
                <Sparkles className="h-5 w-5 text-pink-400" />
              )}
              <h2 className="font-display text-lg font-black uppercase text-white">
                {buyConfirmModal.superMode
                  ? "SUPER FREE SPINS (500x)"
                  : "BUY FREE SPINS (100x)"}
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-200">
              {buyConfirmModal.superMode
                ? `Buy 10 Super Free Spins on ZYAN.GG SWEET 1000 for ${formatUSD(buy500Cost)}? Every Multiplier Bomb that lands is guaranteed 20x–1000x!`
                : `Buy 10 Free Spins on ZYAN.GG SWEET 1000 for ${formatUSD(buy100Cost)}?`}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() =>
                  setBuyConfirmModal({ open: false, superMode: false })
                }
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-200 transition hover:bg-white/10"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmBonusBuy}
                className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg transition hover:brightness-110 ${
                  buyConfirmModal.superMode
                    ? "bg-gradient-to-r from-amber-300 to-yellow-500"
                    : "bg-gradient-to-r from-emerald-400 to-teal-400"
                }`}
              >
                <Check className="h-4 w-4" />
                YES, BUY BONUS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
       * END OF FREE SPINS BONUS SUMMARY MODAL
       * ==================================================================== */}
      {bonusSummaryModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border-2 border-amber-400 bg-gradient-to-b from-rose-950 via-[#1d0b24] to-slate-950 p-7 text-center shadow-[0_0_60px_rgba(245,158,11,0.45)]">
            <div className="font-display text-xs font-black uppercase tracking-widest text-amber-300">
              {bonusSummaryModal.isMaxWin
                ? "25,000x MAX WIN CAP REACHED"
                : "FREE SPINS COMPLETE"}
            </div>
            <h2 className="font-display mt-2 text-2xl font-black uppercase text-white">
              TOTAL BONUS WIN
            </h2>
            <div className="font-display my-4 bg-gradient-to-r from-amber-200 via-yellow-400 to-emerald-300 bg-clip-text text-4xl font-black text-transparent sm:text-5xl">
              {formatUSD(bonusSummaryModal.totalWinUSD)}
            </div>
            <p className="text-xs font-medium text-slate-300">
              Won across {bonusSummaryModal.spinsPlayed} Free Spins
            </p>
            <button
              type="button"
              onClick={() =>
                setBonusSummaryModal((s) => ({ ...s, open: false }))
              }
              className="font-display mt-6 w-full rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 py-3 text-sm font-black uppercase tracking-wider text-slate-950 transition hover:brightness-110"
            >
              COLLECT & CONTINUE
            </button>
          </div>
        </div>
      )}

      {/* ======================================================================
       * FULL-SCREEN WIN TIER CELEBRATION OVERLAY (15x+)
       * ==================================================================== */}
      {celebration.active && (
        <div
          onClick={() => {
            celebrationSkipRef.current = true;
          }}
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/80 backdrop-blur-sm"
        >
          <canvas
            ref={celebrationCanvasRef}
            className="pointer-events-none fixed inset-0 h-full w-full"
          />
          <div className="relative z-10 mx-4 max-w-xl text-center">
            <div
              style={{ color: celebration.tierAccent }}
              className="font-display text-3xl font-black uppercase tracking-tight drop-shadow-[0_4px_24px_rgba(245,158,11,0.75)] sm:text-5xl"
            >
              {celebration.tierLabel}
            </div>
            <div className="font-display mt-4 bg-gradient-to-b from-white via-amber-200 to-amber-500 bg-clip-text text-5xl font-black text-transparent drop-shadow-[0_6px_28px_rgba(245,158,11,0.55)] sm:text-7xl">
              {formatUSD(celebrationDisplayUSD)}
            </div>
            <div className="font-ui mt-3 text-sm font-bold text-slate-300">
              {celebration.multiplier.toFixed(2)}x Base Bet · Click or Press Space to Continue
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
       * PAYTABLE & GAME RULES MODAL (INFO)
       * ==================================================================== */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-black uppercase text-white">
                  ZYAN.GG SWEET 1000 — PAYTABLE & RULES
                </h2>
                <p className="text-xs text-slate-400">
                  6×5 Scatter-Pays Cascading Tumble Engine · Bet {formatUSD(baseBetUSD)}
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
              {/* Regular 9 Symbols Grid */}
              <h3 className="font-display mb-3 text-xs font-black uppercase tracking-wider text-amber-300">
                PAY ANYWHERE SYMBOLS (MULTIPLIED BY BASE BET)
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {REGULAR_SYMBOLS.map((sym) => {
                  const p = PAYTABLE[sym];
                  return (
                    <div
                      key={sym}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
                    >
                      <div className="h-14 w-14 shrink-0">
                        <SlotSymbol3D id={sym} />
                      </div>
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="font-display truncate font-bold text-white">
                          {SYMBOL_META[sym].name}
                        </div>
                        <div className="font-ui mt-1 space-y-0.5 text-slate-300">
                          <div className="flex justify-between">
                            <span className="text-slate-400">12+</span>
                            <span className="font-bold text-amber-300">
                              {formatUSD(baseBetUSD * p.tier12Plus)} ({p.tier12Plus.toFixed(2)}x)
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">10–11</span>
                            <span className="font-semibold text-white">
                              {formatUSD(baseBetUSD * p.tier10_11)} ({p.tier10_11.toFixed(2)}x)
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">8–9</span>
                            <span className="font-semibold text-slate-200">
                              {formatUSD(baseBetUSD * p.tier8_9)} ({p.tier8_9.toFixed(2)}x)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Scatter & Multiplier Bomb Section */}
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3 rounded-xl border border-pink-500/40 bg-pink-950/20 p-4">
                  <div className="h-16 w-16 shrink-0">
                    <SlotSymbol3D id="scatter_lollipop" />
                  </div>
                  <div className="text-xs text-slate-200">
                    <div className="font-display text-sm font-black uppercase text-pink-300">
                      SWIRL LOLLIPOP SCATTER
                    </div>
                    <p className="mt-1 text-slate-300">
                      4+ Scatters anywhere awards <strong>10 Free Spins</strong>.
                      During Free Spins, 3+ Scatters retriggers <strong>+5 Extra Free Spins</strong>!
                    </p>
                    <div className="font-ui mt-2 space-y-0.5">
                      <div>6 Scatters: <strong className="text-amber-300">100.00x ({formatUSD(baseBetUSD * 100)})</strong></div>
                      <div>5 Scatters: <strong className="text-white">5.00x ({formatUSD(baseBetUSD * 5)})</strong></div>
                      <div>4 Scatters: <strong className="text-white">3.00x ({formatUSD(baseBetUSD * 3)})</strong></div>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/20 p-4">
                  <div className="h-16 w-16 shrink-0">
                    <SlotSymbol3D id="bomb_multiplier" bombValue={1000} />
                  </div>
                  <div className="text-xs text-slate-200">
                    <div className="font-display text-sm font-black uppercase text-amber-300">
                      2x–1000x MULTIPLIER BOMBS
                    </div>
                    <p className="mt-1 text-slate-300">
                      Appears during Free Spins only with random values:{" "}
                      <strong>{BOMB_VALUES.map((v) => `${v}x`).join(", ")}</strong>.
                      All bombs on screen sum together and multiply the spin&apos;s total tumble win!
                    </p>
                    <p className="mt-1.5 font-semibold text-amber-200">
                      Max Win Cap: 25,000x Base Bet ({formatUSD(baseBetUSD * MAX_WIN_MULTIPLIER)}).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
       * PROVABLY FAIR SEED VERIFIER MODAL
       * ==================================================================== */}
      {showFairnessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-emerald-400/30 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
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
                  Active Server Seed Hash (SHA-256)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={serverSeedHash}
                    className="font-ui w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 font-mono text-[11px] text-emerald-300"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(serverSeedHash)}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 font-semibold text-white hover:bg-white/10"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedHash === serverSeedHash ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block font-bold uppercase tracking-wider text-slate-400">
                    Client Seed
                  </label>
                  <input
                    type="text"
                    value={clientSeed}
                    disabled={isBusy}
                    onChange={(e) => setClientSeed(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold uppercase tracking-wider text-slate-400">
                    Next Nonce
                  </label>
                  <div className="font-ui rounded-lg border border-white/15 bg-black/50 px-3 py-2 font-bold text-amber-300">
                    #{nonce}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-slate-300">
                  Rotate your Server Seed to reveal the previous unhashed seed for audit.
                </p>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleRotateServerSeed}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-45"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Rotate Seed
                </button>
              </div>

              <div>
                <h3 className="mb-2 font-bold uppercase tracking-wider text-slate-400">
                  Recent Verified Spins
                </h3>
                {fairnessHistory.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center text-slate-500">
                    Place a spin to record its cryptographic SHA-256 proof hash.
                  </div>
                ) : (
                  <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                    {fairnessHistory.map((h) => (
                      <div
                        key={`${h.nonce}-${h.proofHash}`}
                        className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-ui font-bold text-slate-200">
                            Nonce #{h.nonce} · Wager {formatUSD(h.wagerUSD)}
                          </span>
                          <span
                            className={`font-ui font-extrabold ${
                              h.payoutUSD > 0 ? "text-emerald-400" : "text-slate-400"
                            }`}
                          >
                            Payout {formatUSD(h.payoutUSD)} ({h.multiplier.toFixed(2)}x)
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-slate-400">
                          Proof: {h.proofHash}
                        </div>
                        {h.revealedServerSeed && (
                          <div className="mt-0.5 truncate font-mono text-[10px] text-emerald-400">
                            Revealed Seed: {h.revealedServerSeed}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZyanSweet1000Slot;
