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
  Crown,
  Trophy,
  Copy,
  RefreshCw,
} from "lucide-react";

import { ZYAN_SLOTS_ASSETS } from "../constants/slotAssets";

/* ============================================================================
 * 0. CUSTOMIZABLE ASSET SLOTS & ANTI-COPY <ProtectedArt />
 * ========================================================================== */

export const ZYAN_PARTY_CUSTOM_ASSETS = {
  STAGE_BG: ZYAN_SLOTS_ASSETS.ZYAN_PARTY.STAGE_BG,
  SCATTER_GOLD_PEACH: ZYAN_SLOTS_ASSETS.ZYAN_PARTY.SCATTER_GOLD_PEACH,
  WILD_MULTIPLIER_CROWN: ZYAN_SLOTS_ASSETS.ZYAN_PARTY.WILD_CROWN_MULT,
};

export const ZYAN_PARTY_ASSETS: Partial<Record<PartySymbolId | "STAGE_BG", string>> = {
  STAGE_BG: ZYAN_PARTY_CUSTOM_ASSETS.STAGE_BG,
  scatter_gold_fruit: ZYAN_PARTY_CUSTOM_ASSETS.SCATTER_GOLD_PEACH,
  wild_multiplier: ZYAN_PARTY_CUSTOM_ASSETS.WILD_MULTIPLIER_CROWN,
};

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
          ...style,
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

export interface ZyanPartyBetRecord {
  gameKey: "ZYAN_PARTY";
  gameName: "Zyan Party";
  wagerUSD: number;
  multiplier: number;
  payoutUSD: number;
  isWin: boolean;
  proofHash: string;
}

export interface ZyanPartyProps {
  externalBalanceUSD?: number;
  onBalanceChange?: (newBalanceUSD: number) => void;
  onRecordBet?: (bet: ZyanPartyBetRecord) => void;
  activeRtpPercent?: number; // Default 96.5% (controlled silently by Admin Panel)
  username?: string;
}

export type PartySymbolId =
  | "strawberry"
  | "orange"
  | "apple"
  | "grapes"
  | "plum"
  | "star_candy"
  | "heart_berry"
  | "scatter_gold_fruit"
  | "wild_multiplier";

type RegularFruitId = Exclude<
  PartySymbolId,
  "scatter_gold_fruit" | "wild_multiplier"
>;

type PartySpinPhase =
  | "IDLE"
  | "DROPPING"
  | "EVALUATING"
  | "MERGING_MULTIPLIERS"
  | "EXPLODING"
  | "CASCADING"
  | "SPIN_COMPLETE";

interface PartyCell {
  uid: string;
  symbol: PartySymbolId;
  row: number;
  col: number;
  multiplier: number; // 1 = none, 2/4 on fruits, 2..256 on wild_multiplier
  isWinning?: boolean;
  isExploding?: boolean;
  isScatterHit?: boolean;
  isWildSpawn?: boolean;
  animType: "none" | "drop-out" | "drop-in" | "cascade";
  fallRows?: number;
  dropDelayMs?: number;
}

interface FoundCluster {
  id: string;
  symbol: RegularFruitId;
  cells: PartyCell[];
  baseMult: number;
  combinedMult: number; // Multiplicative product capped at 256x
  baseWinUSD: number;
  finalWinUSD: number;
  centerCol: number;
  centerRow: number;
  multiplierCells: { col: number; row: number; value: number }[];
}

interface ClusterMergeOverlay {
  id: string;
  xPercent: number;
  yPercent: number;
  combinedMult: number;
  finalWinUSD: number;
}

interface PartyHistoryItem {
  id: string;
  symbol: RegularFruitId;
  count: number;
  combinedMult: number;
  winUSD: number;
}

interface FairnessLog {
  nonce: number;
  serverSeedHash: string;
  revealedServerSeed?: string;
  clientSeed: string;
  proofHash: string;
  wagerUSD: number;
  payoutUSD: number;
  multiplier: number;
}

interface SplashParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  shape: "drop" | "spark";
}

interface MergeOrbAnim {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number;
  color: string;
  label: string;
}

/* ============================================================================
 * 2. 7x7 CLUSTER-PAYS PAYTABLE & CONSTANTS
 * ========================================================================== */

const GRID_SIZE = 7; // 7x7 = 49 cells
const MAX_CLUSTER_MULT = 256;
const MAX_WIN_MULT = 5000;
const ZYAN_LOGO_URL =
  "https://i.ibb.co.com/20Dxw97d/Esports-wordmark-logo-ZYAN-GG-3d5c4c15-2-K.jpg";

const BET_PRESETS: number[] = [
  0.2, 0.4, 0.6, 0.8, 1.0, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0, 250.0, 500.0,
];

const REGULAR_FRUITS: RegularFruitId[] = [
  "strawberry",
  "orange",
  "apple",
  "grapes",
  "plum",
  "star_candy",
  "heart_berry",
];

// Paytable indices correspond to cluster sizes: 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15+
const PARTY_PAYTABLE: Record<RegularFruitId, number[]> = {
  strawberry: [1.0, 1.5, 1.75, 2.0, 2.5, 4.0, 6.0, 10.0, 20.0, 40.0, 150.0],
  orange: [0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 5.0, 8.0, 15.0, 30.0, 100.0],
  apple: [0.6, 0.85, 1.1, 1.35, 1.75, 2.5, 4.5, 7.5, 14.0, 25.0, 90.0],
  grapes: [0.5, 0.75, 1.0, 1.25, 1.6, 2.25, 4.0, 6.5, 12.0, 22.0, 80.0],
  plum: [0.4, 0.6, 0.85, 1.1, 1.4, 2.0, 3.5, 5.5, 10.0, 18.0, 60.0],
  star_candy: [0.3, 0.5, 0.7, 0.9, 1.2, 1.6, 2.5, 4.0, 7.5, 12.0, 40.0],
  heart_berry: [0.2, 0.35, 0.5, 0.7, 0.9, 1.25, 1.8, 2.8, 4.5, 8.0, 20.0],
};

const FRUIT_META: Record<
  PartySymbolId,
  { name: string; splashColors: string[] }
> = {
  strawberry: {
    name: "Ruby Strawberry",
    splashColors: ["#FB7185", "#E11D48", "#4ADE80", "#FFFFFF"],
  },
  orange: {
    name: "Juicy Tangerine",
    splashColors: ["#FB923C", "#EA580C", "#FDE047", "#FFFFFF"],
  },
  apple: {
    name: "Crisp Green Apple",
    splashColors: ["#4ADE80", "#16A34A", "#BBF7D0", "#FFFFFF"],
  },
  grapes: {
    name: "Royal Grapes",
    splashColors: ["#C084FC", "#7E22CE", "#E9D5FF", "#FFFFFF"],
  },
  plum: {
    name: "Violet Plum",
    splashColors: ["#A78BFA", "#5B21B6", "#DDD6FE", "#FFFFFF"],
  },
  star_candy: {
    name: "Golden Star Fruit",
    splashColors: ["#FACC15", "#CA8A04", "#FEF08A", "#FFFFFF"],
  },
  heart_berry: {
    name: "Teal Heart Berry",
    splashColors: ["#2DD4BF", "#0D9488", "#99F6E4", "#FFFFFF"],
  },
  scatter_gold_fruit: {
    name: "Golden Peach Scatter",
    splashColors: ["#FDE047", "#F59E0B", "#FB7185", "#FFFFFF"],
  },
  wild_multiplier: {
    name: "Crown Multiplier Wild",
    splashColors: ["#FDE047", "#F59E0B", "#FFFFFF", "#EC4899"],
  },
};

function getPartyClusterBaseMult(symbol: RegularFruitId, size: number): number {
  if (size < 5) return 0;
  const row = PARTY_PAYTABLE[symbol];
  const idx = Math.min(row.length - 1, size - 5);
  return row[idx];
}

function getScatterAward(count: number): { spins: number; mult: number } {
  if (count >= 7) return { spins: 14, mult: 100 };
  if (count === 6) return { spins: 13, mult: 50 };
  if (count === 5) return { spins: 12, mult: 20 };
  if (count === 4) return { spins: 11, mult: 10 };
  if (count === 3) return { spins: 10, mult: 0 };
  return { spins: 0, mult: 0 };
}

function formatUSD(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return `$${safe.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ============================================================================
 * 3. PROVABLY FAIR HMAC-SHA256 CRYPTOGRAPHIC RNG
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

async function sha256Hex(msg: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(msg);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
  }
  let h = 2166136261;
  for (let i = 0; i < msg.length; i++) {
    h ^= msg.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0").repeat(8);
}

async function hmacSha256Hex(keyHex: string, message: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const enc = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(keyHex),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
      return Array.from(new Uint8Array(sig), (b) =>
        b.toString(16).padStart(2, "0")
      ).join("");
    } catch {
      return sha256Hex(`${keyHex}:${message}`);
    }
  }
  return sha256Hex(`${keyHex}:${message}`);
}

class HmacPrngStream {
  private values: number[] = [];
  private cursor = 0;

  constructor(hashHex: string) {
    for (let b = 0; b < 4; b++) {
      let state =
        parseInt(hashHex.slice(b * 8, b * 8 + 8), 16) ^ (b * 0x85ebca6b);
      if (!Number.isFinite(state) || state === 0) state = 0x12345678;
      for (let i = 0; i < 64; i++) {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        this.values.push(((t ^ (t >>> 14)) >>> 0) / 4294967296);
      }
    }
  }

  nextFloat(): number {
    if (this.cursor >= this.values.length) {
      // Extend deterministically
      const prev = this.values[this.cursor - 1] || 0.5;
      let s = Math.floor(prev * 4294967296) | 0;
      for (let i = 0; i < 64; i++) {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        this.values.push(((t ^ (t >>> 14)) >>> 0) / 4294967296);
      }
    }
    return this.values[this.cursor++];
  }
}

/* ============================================================================
 * 4. TROPICAL MARIMBA & ELECTRIC MULTIPLIER WEB AUDIO SYNTHESIZER
 * ========================================================================== */

class PartyAudioSynth {
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

  public playClick(freq = 640): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.78, now + 0.05);
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

  // Juicy marimba / steel-drum tropical pop on 7-column drops
  public playTropicalDropPop(col: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const marimbaNotes = [392.0, 440.0, 493.88, 523.25, 587.33, 659.25, 783.99];
      const base = marimbaNotes[col % marimbaNotes.length];

      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      overtone.type = "triangle";
      osc.frequency.setValueAtTime(base * 0.85, now);
      osc.frequency.exponentialRampToValueAtTime(base, now + 0.025);
      overtone.frequency.setValueAtTime(base * 2, now);

      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      overtone.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      overtone.start(now);
      osc.stop(now + 0.15);
      overtone.stop(now + 0.15);
    } catch {
      // Ignore
    }
  }

  // Ascending harmonic chord on each consecutive tumble: C5 -> E5 -> G5 -> B5 -> D6
  public playTumbleChord(tumbleStep: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const roots = [523.25, 659.25, 783.99, 987.77, 1174.66, 1318.51];
      const root = roots[Math.min(tumbleStep, roots.length - 1)];

      [1, 1.25, 1.5].forEach((ratio, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(root * ratio, now + idx * 0.025);
        gain.gain.setValueAtTime(0.1, now + idx * 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.025);
        osc.stop(now + 0.38);
      });
    } catch {
      // Ignore
    }
  }

  // Electric laser swell when 2x x 4x multipliers combine (16x / 64x / 256x)
  public playMultiplierMergeSwell(combinedMult: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      const targetFreq = Math.min(2000, 480 + combinedMult * 5.5);
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(targetFreq, now + 0.28);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(700, now);
      filter.frequency.exponentialRampToValueAtTime(3400, now + 0.28);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    } catch {
      // Ignore
    }
  }

  public playScatterChime(ordinal: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const f = 587.33 + ordinal * 110;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // Ignore
    }
  }

  public playBonusTrigger(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 987.77, 1174.66].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, now + idx * 0.075);
        gain.gain.setValueAtTime(0.13, now + idx * 0.075);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.075 + 0.42);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.075);
        osc.stop(now + idx * 0.075 + 0.45);
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
      osc.frequency.setValueAtTime(1040 + Math.random() * 200, now);
      gain.gain.setValueAtTime(0.04, now);
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
 * 5. ORTHOGONAL BFS CLUSTER DETECTOR FOR 7x7 GRID
 * ========================================================================== */

function findConnectedClusters7x7(
  grid: PartyCell[],
  betBaseUSD: number
): FoundCluster[] {
  if (grid.length !== GRID_SIZE * GRID_SIZE) return [];

  const cellAt = (r: number, c: number): PartyCell | undefined => {
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return undefined;
    return grid[r * GRID_SIZE + c];
  };

  const clusters: FoundCluster[] = [];
  let clusterIdx = 0;

  for (const fruit of REGULAR_FRUITS) {
    const visited = new Set<number>();

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const key = r * GRID_SIZE + c;
        if (visited.has(key)) continue;

        const startCell = cellAt(r, c);
        if (!startCell || startCell.symbol !== fruit) continue;

        // BFS orthogonal flood-fill (touching up, down, left, right)
        const queue: PartyCell[] = [startCell];
        const component: PartyCell[] = [];
        visited.add(key);

        while (queue.length > 0) {
          const cur = queue.shift()!;
          component.push(cur);

          const dirs = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ];
          for (const [dr, dc] of dirs) {
            const nr = cur.row + dr;
            const nc = cur.col + dc;
            if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
            const nKey = nr * GRID_SIZE + nc;
            if (visited.has(nKey)) continue;

            const neighbor = cellAt(nr, nc);
            if (
              neighbor &&
              (neighbor.symbol === fruit || neighbor.symbol === "wild_multiplier")
            ) {
              visited.add(nKey);
              queue.push(neighbor);
            }
          }
        }

        if (component.length >= 5) {
          const baseMult = getPartyClusterBaseMult(fruit, component.length);
          const multCells = component
            .filter((cell) => cell.multiplier > 1)
            .map((cell) => ({
              col: cell.col,
              row: cell.row,
              value: cell.multiplier,
            }));

          // CRITICAL FRUIT PARTY MATH: Multiply all multipliers together, capped at 256x!
          const rawProduct = multCells.reduce((acc, m) => acc * m.value, 1);
          const combinedMult = Math.min(MAX_CLUSTER_MULT, rawProduct);

          const baseWinUSD = Math.round(betBaseUSD * baseMult * 100) / 100;
          const finalWinUSD = Math.round(baseWinUSD * combinedMult * 100) / 100;

          let sumCol = 0;
          let sumRow = 0;
          for (const cell of component) {
            sumCol += cell.col;
            sumRow += cell.row;
          }

          clusterIdx += 1;
          clusters.push({
            id: `cluster-${fruit}-${clusterIdx}-${component[0].uid}`,
            symbol: fruit,
            cells: component,
            baseMult,
            combinedMult,
            baseWinUSD,
            finalWinUSD,
            centerCol: sumCol / component.length,
            centerRow: sumRow / component.length,
            multiplierCells: multCells,
          });
        }
      }
    }
  }

  return clusters;
}

/* ============================================================================
 * 6. GLOSSY 3D SVG FRUIT, SCATTER & CROWN WILD SYMBOLS
 * ========================================================================== */

interface PartySymbol3DProps {
  id: PartySymbolId;
  multiplier?: number;
  className?: string;
}

const PartySymbol3D: React.FC<PartySymbol3DProps> = React.memo(
  ({ id, multiplier = 1, className = "w-full h-full" }) => {
    const uid = useId().replace(/:/g, "");
    const customUrl = ZYAN_PARTY_ASSETS[id];

    const renderSvg = () => {
      switch (id) {
        case "strawberry":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Ruby Strawberry">
              <defs>
                <radialGradient id={`sb-body-${uid}`} cx="36%" cy="34%" r="68%">
                  <stop offset="0%" stopColor="#FDA4AF" />
                  <stop offset="32%" stopColor="#F43F5E" />
                  <stop offset="78%" stopColor="#BE123C" />
                  <stop offset="100%" stopColor="#7F1D1D" />
                </radialGradient>
                <linearGradient id={`sb-leaf-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#86EFAC" />
                  <stop offset="100%" stopColor="#15803D" />
                </linearGradient>
              </defs>
              {/* Berry body */}
              <path
                d="M50 88 C30 85 16 58 18 39 C20 25 34 22 50 23 C66 22 80 25 82 39 C84 58 70 85 50 88 Z"
                fill={`url(#sb-body-${uid})`}
              />
              {/* Seeds */}
              {[
                [34, 42],
                [50, 40],
                [66, 42],
                [41, 56],
                [59, 56],
                [50, 71],
              ].map(([sx, sy], i) => (
                <ellipse key={i} cx={sx} cy={sy} rx="2" ry="3.2" fill="#FEF08A" />
              ))}
              {/* Crown leaves */}
              <path
                d="M27 25 Q39 14 50 22 Q61 14 73 25 Q58 31 50 26 Q42 31 27 25 Z"
                fill={`url(#sb-leaf-${uid})`}
              />
              <path d="M50 11 L50 23" stroke="#166534" strokeWidth="4.5" strokeLinecap="round" />
              <ellipse
                cx="33"
                cy="36"
                rx="8"
                ry="12"
                transform="rotate(-16 33 36)"
                fill="#FFFFFF"
                fillOpacity="0.55"
              />
            </svg>
          );

        case "orange":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Juicy Tangerine">
              <defs>
                <radialGradient id={`or-body-${uid}`} cx="35%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#FEF08A" />
                  <stop offset="35%" stopColor="#FB923C" />
                  <stop offset="80%" stopColor="#EA580C" />
                  <stop offset="100%" stopColor="#9A3412" />
                </radialGradient>
              </defs>
              <path d="M52 21 C57 12 69 11 73 18 C64 23 56 23 52 21 Z" fill="#22C55E" />
              <circle cx="50" cy="54" r="34" fill={`url(#or-body-${uid})`} />
              <ellipse
                cx="35"
                cy="39"
                rx="11"
                ry="6"
                transform="rotate(-25 35 39)"
                fill="#FFFFFF"
                fillOpacity="0.62"
              />
            </svg>
          );

        case "apple":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Crisp Green Apple">
              <defs>
                <radialGradient id={`ap-body-${uid}`} cx="35%" cy="32%" r="68%">
                  <stop offset="0%" stopColor="#DCFCE7" />
                  <stop offset="30%" stopColor="#4ADE80" />
                  <stop offset="78%" stopColor="#16A34A" />
                  <stop offset="100%" stopColor="#14532D" />
                </radialGradient>
              </defs>
              <path d="M50 26 C50 16 54 11 59 9" fill="none" stroke="#78350F" strokeWidth="4.5" strokeLinecap="round" />
              <path
                d="M50 27 C36 22 18 28 16 49 C14 70 30 88 43 87 C47 87 49 85 50 84 C51 85 53 87 57 87 C70 88 86 70 84 49 C82 28 64 22 50 27 Z"
                fill={`url(#ap-body-${uid})`}
              />
              <ellipse cx="33" cy="42" rx="8.5" ry="13" transform="rotate(-14 33 42)" fill="#FFFFFF" fillOpacity="0.6" />
            </svg>
          );

        case "grapes":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Royal Grapes">
              <defs>
                <radialGradient id={`gr-orb-${uid}`} cx="35%" cy="30%" r="68%">
                  <stop offset="0%" stopColor="#F3E8FF" />
                  <stop offset="32%" stopColor="#A855F7" />
                  <stop offset="80%" stopColor="#6D28D9" />
                  <stop offset="100%" stopColor="#2E1065" />
                </radialGradient>
              </defs>
              <path d="M50 25 C50 15 56 10 62 9" fill="none" stroke="#4ADE80" strokeWidth="4.5" strokeLinecap="round" />
              {[
                [34, 38],
                [50, 36],
                [66, 38],
                [40, 53],
                [59, 53],
                [49, 69],
                [50, 81],
              ].map(([cx, cy], idx) => (
                <g key={idx}>
                  <circle cx={cx} cy={cy} r="13" fill={`url(#gr-orb-${uid})`} />
                  <circle cx={cx - 4} cy={cy - 4.5} r="3.4" fill="#FFFFFF" fillOpacity="0.65" />
                </g>
              ))}
            </svg>
          );

        case "plum":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Violet Plum">
              <defs>
                <radialGradient id={`pl-body-${uid}`} cx="35%" cy="30%" r="72%">
                  <stop offset="0%" stopColor="#E0E7FF" />
                  <stop offset="32%" stopColor="#818CF8" />
                  <stop offset="78%" stopColor="#4338CA" />
                  <stop offset="100%" stopColor="#1E1B4B" />
                </radialGradient>
              </defs>
              <path d="M51 19 C58 11 69 12 71 19 C63 23 55 22 51 19 Z" fill="#22C55E" />
              <ellipse cx="50" cy="55" rx="32" ry="33" fill={`url(#pl-body-${uid})`} />
              <path d="M52 24 C45 41 45 68 52 85" fill="none" stroke="#1E1B4B" strokeOpacity="0.4" strokeWidth="3" strokeLinecap="round" />
              <ellipse cx="35" cy="40" rx="8" ry="12" transform="rotate(-18 35 40)" fill="#FFFFFF" fillOpacity="0.58" />
            </svg>
          );

        case "star_candy":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Golden Star Fruit">
              <defs>
                <radialGradient id={`st-body-${uid}`} cx="40%" cy="35%" r="68%">
                  <stop offset="0%" stopColor="#FEF9C3" />
                  <stop offset="40%" stopColor="#FACC15" />
                  <stop offset="85%" stopColor="#D97706" />
                  <stop offset="100%" stopColor="#78350F" />
                </radialGradient>
              </defs>
              <polygon
                points="50,10 61,36 89,38 67,56 74,84 50,69 26,84 33,56 11,38 39,36"
                fill={`url(#st-body-${uid})`}
                stroke="#FEF08A"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <ellipse cx="43" cy="36" rx="10" ry="4.5" transform="rotate(-20 43 36)" fill="#FFFFFF" fillOpacity="0.65" />
            </svg>
          );

        case "heart_berry":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Teal Heart Berry">
              <defs>
                <radialGradient id={`hb-body-${uid}`} cx="35%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#CCFBF1" />
                  <stop offset="35%" stopColor="#2DD4BF" />
                  <stop offset="80%" stopColor="#0F766E" />
                  <stop offset="100%" stopColor="#134E4A" />
                </radialGradient>
              </defs>
              <path
                d="M50 84 C21 65 11 47 11 32 C11 19 22 11 34 11 C42 11 47 16 50 22 C53 16 58 11 66 11 C78 11 89 19 89 32 C89 47 79 65 50 84 Z"
                fill={`url(#hb-body-${uid})`}
                stroke="#99F6E4"
                strokeWidth="2"
              />
              <ellipse cx="31" cy="28" rx="9" ry="5" transform="rotate(-26 31 28)" fill="#FFFFFF" fillOpacity="0.68" />
            </svg>
          );

        case "scatter_gold_fruit":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Golden Peach Scatter">
              <defs>
                <radialGradient id={`sg-body-${uid}`} cx="35%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#FFFBEB" />
                  <stop offset="35%" stopColor="#FDE047" />
                  <stop offset="75%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="#92400E" />
                </radialGradient>
              </defs>
              <circle cx="50" cy="50" r="41" fill="none" stroke="#FDE047" strokeOpacity="0.55" strokeWidth="2.5" strokeDasharray="5 4" />
              <path d="M51 20 C58 11 71 12 73 19 C64 24 55 23 51 20 Z" fill="#4ADE80" />
              <ellipse cx="50" cy="52" rx="32" ry="31" fill={`url(#sg-body-${uid})`} stroke="#FEF08A" strokeWidth="2" />
              <ellipse cx="35" cy="36" rx="10" ry="5" transform="rotate(-24 35 36)" fill="#FFFFFF" fillOpacity="0.72" />
              <rect x="20" y="67" width="60" height="14" rx="7" fill="#78350F" stroke="#FDE047" strokeWidth="1.5" />
              <text
                x="50"
                y="77"
                textAnchor="middle"
                fill="#FEF08A"
                fontSize="8.5"
                fontWeight="900"
                fontFamily="Montserrat, sans-serif"
                letterSpacing="0.5"
              >
                SCATTER
              </text>
            </svg>
          );

        case "wild_multiplier":
          return (
            <svg viewBox="0 0 100 100" className={className} aria-label="Golden Crown Wild">
              <defs>
                <linearGradient id={`wc-gold-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FEF9C3" />
                  <stop offset="45%" stopColor="#FACC15" />
                  <stop offset="100%" stopColor="#B45309" />
                </linearGradient>
                <radialGradient id={`wc-bg-${uid}`} cx="50%" cy="45%" r="55%">
                  <stop offset="0%" stopColor="#4C1D95" />
                  <stop offset="100%" stopColor="#1E1B4B" />
                </radialGradient>
              </defs>
              <circle cx="50" cy="50" r="42" fill={`url(#wc-bg-${uid})`} stroke="#FDE047" strokeWidth="3" />
              <path
                d="M22 65 L18 33 L37 47 L50 24 L63 47 L82 33 L78 65 Z"
                fill={`url(#wc-gold-${uid})`}
                stroke="#FFFBEB"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <circle cx="18" cy="30" r="4" fill="#F43F5E" />
              <circle cx="50" cy="21" r="5" fill="#38BDF8" />
              <circle cx="82" cy="30" r="4" fill="#10B981" />
              <text
                x="50"
                y="82"
                textAnchor="middle"
                fill="#FDE047"
                fontSize="11"
                fontWeight="900"
                fontFamily="Montserrat, sans-serif"
                letterSpacing="0.8"
              >
                WILD
              </text>
            </svg>
          );
      }
    };

    if (id === "scatter_gold_fruit") {
      const scatterSrc =
        ZYAN_PARTY_ASSETS.scatter_gold_fruit ||
        ZYAN_PARTY_CUSTOM_ASSETS.SCATTER_GOLD_PEACH;
      return (
        <div
          className={`relative flex items-center justify-center overflow-hidden ${className}`}
        >
          <ProtectedArt
            src={scatterSrc}
            alt="Golden Peach Scatter"
            className="h-full w-full scale-110 rounded-xl object-contain mix-blend-lighten drop-shadow-[0_0_12px_rgba(251,191,36,0.75)]"
            fallback={renderSvg()}
          />
        </div>
      );
    }

    if (id === "wild_multiplier") {
      const crownSrc =
        ZYAN_PARTY_ASSETS.wild_multiplier ||
        ZYAN_PARTY_CUSTOM_ASSETS.WILD_MULTIPLIER_CROWN;
      const multLabel = `${Math.max(2, multiplier)}x`;
      return (
        <div
          className={`relative flex items-center justify-center overflow-hidden ${className}`}
        >
          <ProtectedArt
            src={crownSrc}
            alt={`${multLabel} Golden Wild Multiplier Crown`}
            className="h-full w-full scale-115 rounded-xl object-contain mix-blend-lighten drop-shadow-[0_0_14px_rgba(253,224,71,0.85)]"
            fallback={renderSvg()}
          />
          {/* Live Multiplier Stamped Dead-Center Over Crown */}
          <span
            style={{
              WebkitTextStroke: "1.5px #140726",
              textShadow:
                "0 2px 6px rgba(0,0,0,0.95), 0 0 12px rgba(245,158,11,0.9)",
            }}
            className={`font-display pointer-events-none absolute inset-0 z-20 flex items-center justify-center font-black leading-none tracking-tight text-white ${
              multiplier >= 100
                ? "text-xs sm:text-base"
                : multiplier >= 16
                  ? "text-sm sm:text-lg"
                  : "text-base sm:text-xl"
            }`}
          >
            {multLabel}
          </span>
        </div>
      );
    }

    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        {customUrl ? (
          <ProtectedArt
            src={customUrl}
            alt={FRUIT_META[id].name}
            className="h-full w-full rounded-xl object-contain mix-blend-lighten"
            fallback={renderSvg()}
          />
        ) : (
          renderSvg()
        )}

        {/* 3D Golden Crown Multiplier Corner Badge (2x / 4x) */}
        {multiplier > 1 && (
          <div className="pointer-events-none absolute -top-0.5 -right-0.5 z-20 flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg sm:h-7 sm:w-7">
            <ProtectedArt
              src={ZYAN_PARTY_CUSTOM_ASSETS.WILD_MULTIPLIER_CROWN}
              alt={`${multiplier}x Multiplier`}
              className="h-full w-full scale-115 rounded-xl object-contain mix-blend-lighten drop-shadow-[0_0_6px_rgba(253,224,71,0.9)]"
              fallback={
                <div className="h-full w-full rounded-md border border-amber-200 bg-gradient-to-r from-amber-400 to-rose-500" />
              }
            />
            <span
              style={{
                WebkitTextStroke: "1px #140726",
                textShadow: "0 1px 4px rgba(0,0,0,0.95)",
              }}
              className="font-display absolute inset-0 z-20 flex items-center justify-center text-[10px] font-black leading-none text-white sm:text-xs"
            >
              {multiplier}x
            </span>
          </div>
        )}
      </div>
    );
  }
);
PartySymbol3D.displayName = "PartySymbol3D";

/* ============================================================================
 * 7. MAIN FLAGSHIP COMPONENT: ZyanPartySlot
 * ========================================================================== */

export const ZyanPartySlot: React.FC<ZyanPartyProps> = ({
  externalBalanceUSD,
  onBalanceChange,
  onRecordBet,
  activeRtpPercent = 96.5,
  username,
}) => {
  // --- Wallet / Bridge State ---
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
  const [baseBetUSD, setBaseBetUSD] = useState<number>(2.0);
  const [turboSpin, setTurboSpin] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<boolean>(false);

  // --- Engine State ---
  const [grid, setGrid] = useState<PartyCell[]>([]);
  const [phase, setPhase] = useState<PartySpinPhase>("IDLE");
  const [tumbleWinUSD, setTumbleWinUSD] = useState<number>(0);
  const [clusterOverlays, setClusterOverlays] = useState<ClusterMergeOverlay[]>([]);
  const [historyItems, setHistoryItems] = useState<PartyHistoryItem[]>([]);

  // --- Free Spins State ---
  const [isFreeSpins, setIsFreeSpins] = useState<boolean>(false);
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [freeSpinsTotal, setFreeSpinsTotal] = useState<number>(0);
  const [freeSpinNum, setFreeSpinNum] = useState<number>(0);
  const [bonusCumulativeWinUSD, setBonusCumulativeWinUSD] = useState<number>(0);
  const [bonusNotice, setBonusNotice] = useState<string | null>(null);
  const [bonusSummary, setBonusSummary] = useState<{
    open: boolean;
    totalWinUSD: number;
    spinsPlayed: number;
  }>({ open: false, totalWinUSD: 0, spinsPlayed: 0 });

  // --- Modals & Autoplay ---
  const [autoplayLeft, setAutoplayLeft] = useState<number>(0);
  const [showAutoMenu, setShowAutoMenu] = useState<boolean>(false);
  const [showBetModal, setShowBetModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [showFairnessModal, setShowFairnessModal] = useState<boolean>(false);
  const [buyConfirmOpen, setBuyConfirmOpen] = useState<boolean>(false);

  // --- Win Celebration ---
  const [celebration, setCelebration] = useState<{
    active: boolean;
    label: string;
    accent: string;
    targetUSD: number;
    mult: number;
  }>({ active: false, label: "", accent: "#10B981", targetUSD: 0, mult: 0 });
  const [celebDisplayUSD, setCelebDisplayUSD] = useState<number>(0);
  const celebSkipRef = useRef<boolean>(false);

  // --- Provably Fair HMAC-SHA256 ---
  const [serverSeed, setServerSeed] = useState<string>(() => randomHex(32));
  const [serverSeedHash, setServerSeedHash] = useState<string>("");
  const [clientSeed, setClientSeed] = useState<string>("zyan-party-7x7-seed");
  const [nonce, setNonce] = useState<number>(1);
  const [fairnessLogs, setFairnessLogs] = useState<FairnessLog[]>([]);
  const [copiedStr, setCopiedStr] = useState<string | null>(null);

  // --- Refs ---
  const isSpinningRef = useRef<boolean>(false);
  const autoplayRef = useRef<number>(0);
  autoplayRef.current = autoplayLeft;
  const fsRef = useRef({
    active: false,
    left: 0,
    total: 0,
    num: 0,
    cumulativeWin: 0,
    wagerBase: 2.0,
    totalCost: 2.0,
  });

  const synthRef = useRef<PartyAudioSynth | null>(null);
  if (!synthRef.current) synthRef.current = new PartyAudioSynth();
  useEffect(() => {
    if (synthRef.current) synthRef.current.muted = muted;
  }, [muted]);

  const gridBoxRef = useRef<HTMLDivElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const celebCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<SplashParticle[]>([]);
  const mergeOrbsRef = useRef<MergeOrbAnim[]>([]);
  const uidRef = useRef<number>(1);
  const unmountedRef = useRef<boolean>(false);

  const nextUid = useCallback((p = "p") => {
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
   * 8. SYMBOL & MULTIPLIER GENERATION (SILENT activeRtpPercent CALIBRATION)
   * ======================================================================== */

  const pickFruitSymbol = useCallback(
    (rng: HmacPrngStream): RegularFruitId => {
      const rtpBoost = (activeRtpPercent - 96.5) / 100;
      const weights: [RegularFruitId, number][] = [
        ["strawberry", Math.max(4, 6.2 + rtpBoost * 4)],
        ["orange", Math.max(5, 7.6 + rtpBoost * 3)],
        ["apple", 9.0],
        ["grapes", 10.5],
        ["plum", 12.0],
        ["star_candy", 13.8],
        ["heart_berry", 15.5],
      ];
      const total = weights.reduce((s, w) => s + w[1], 0);
      let roll = rng.nextFloat() * total;
      for (const [sym, w] of weights) {
        roll -= w;
        if (roll <= 0) return sym;
      }
      return "heart_berry";
    },
    [activeRtpPercent]
  );

  const rollPartyCell = useCallback(
    (
      rng: HmacPrngStream,
      row: number,
      col: number,
      opts: {
        inFreeSpins: boolean;
        allowScatter: boolean;
        animType: PartyCell["animType"];
        fallRows?: number;
        dropDelayMs?: number;
      }
    ): PartyCell => {
      const rtpScale = Math.max(0.65, Math.min(1.4, activeRtpPercent / 96.5));

      if (opts.allowScatter) {
        const scatterProb = (opts.inFreeSpins ? 0.015 : 0.016) * rtpScale;
        if (rng.nextFloat() < scatterProb) {
          return {
            uid: nextUid("sc"),
            symbol: "scatter_gold_fruit",
            row,
            col,
            multiplier: 1,
            animType: opts.animType,
            fallRows: opts.fallRows,
            dropDelayMs: opts.dropDelayMs,
          };
        }
      }

      const fruit = pickFruitSymbol(rng);
      // 2x / 4x multiplier badge probability (boosted 3x higher in Free Spins!)
      const multChance = (opts.inFreeSpins ? 0.165 : 0.055) * rtpScale;
      let multiplier = 1;
      if (rng.nextFloat() < multChance) {
        if (opts.inFreeSpins) {
          multiplier = rng.nextFloat() < 0.36 ? 4 : 2;
        } else {
          multiplier = 2;
        }
      }

      return {
        uid: nextUid("fr"),
        symbol: fruit,
        row,
        col,
        multiplier,
        animType: opts.animType,
        fallRows: opts.fallRows,
        dropDelayMs: opts.dropDelayMs,
      };
    },
    [activeRtpPercent, nextUid, pickFruitSymbol]
  );

  // Initial 7x7 board
  useEffect(() => {
    const rng = new HmacPrngStream(randomHex(32));
    const initial: PartyCell[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        initial.push(
          rollPartyCell(rng, r, c, {
            inFreeSpins: false,
            allowScatter: false,
            animType: "none",
          })
        );
      }
    }
    initial[17] = {
      ...initial[17],
      symbol: "wild_multiplier",
      multiplier: 2,
    };
    initial[24] = {
      ...initial[24],
      symbol: "scatter_gold_fruit",
      multiplier: 1,
    };
    setGrid(initial);
  }, [rollPartyCell]);

  /* ==========================================================================
   * 9. CANVAS FRUIT-SPLASH PARTICLES & MULTIPLIER MERGE ANIMATIONS
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

          // Fruit Splash Particles
          const keepParticles: SplashParticle[] = [];
          for (const p of particlesRef.current) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.25;
            p.alpha -= p.decay;
            if (p.alpha > 0.02) {
              keepParticles.push(p);
              ctx.save();
              ctx.globalAlpha = Math.max(0, p.alpha);
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
          particlesRef.current = keepParticles;

          // Multiplier Merge Orbs flying to Cluster Center
          const keepOrbs: MergeOrbAnim[] = [];
          for (const orb of mergeOrbsRef.current) {
            orb.progress = Math.min(1, orb.progress + 0.065);
            if (orb.progress < 1) {
              keepOrbs.push(orb);
              const e = 1 - Math.pow(1 - orb.progress, 3);
              const cx = orb.startX + (orb.endX - orb.startX) * e;
              const cy = orb.startY + (orb.endY - orb.startY) * e;

              ctx.save();
              ctx.shadowBlur = 16;
              ctx.shadowColor = orb.color;
              ctx.strokeStyle = orb.color;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(orb.startX, orb.startY);
              ctx.lineTo(cx, cy);
              ctx.stroke();

              ctx.fillStyle = "#FDE047";
              ctx.beginPath();
              ctx.arc(cx, cy, 13, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = "#0F172A";
              ctx.font = "900 10px Montserrat, sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(orb.label, cx, cy);
              ctx.restore();
            }
          }
          mergeOrbsRef.current = keepOrbs;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const spawnFruitSplash = useCallback(
    (col: number, row: number, sym: PartySymbolId) => {
      const box = gridBoxRef.current;
      if (!box) return;
      const cellW = box.clientWidth / GRID_SIZE;
      const cellH = box.clientHeight / GRID_SIZE;
      const cx = (col + 0.5) * cellW;
      const cy = (row + 0.5) * cellH;
      const palette = FRUIT_META[sym].splashColors;

      for (let i = 0; i < 16; i++) {
        const ang = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.4;
        const spd = 2 + Math.random() * 4.8;
        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 1.8,
          size: 4 + Math.random() * 5,
          color: palette[i % palette.length],
          alpha: 1,
          decay: 0.026 + Math.random() * 0.014,
          shape: i % 2 === 0 ? "drop" : "spark",
        });
      }
    },
    []
  );

  const spawnMergeOrbsForCluster = useCallback((cluster: FoundCluster) => {
    const box = gridBoxRef.current;
    if (!box || cluster.multiplierCells.length === 0) return;
    const cellW = box.clientWidth / GRID_SIZE;
    const cellH = box.clientHeight / GRID_SIZE;
    const endX = (cluster.centerCol + 0.5) * cellW;
    const endY = (cluster.centerRow + 0.5) * cellH;

    for (const mc of cluster.multiplierCells) {
      mergeOrbsRef.current.push({
        startX: (mc.col + 0.5) * cellW,
        startY: (mc.row + 0.5) * cellH,
        endX,
        endY,
        progress: 0,
        color: mc.value >= 4 ? "#EC4899" : "#F59E0B",
        label: `${mc.value}x`,
      });
    }
  }, []);

  /* ==========================================================================
   * 10. CELEBRATION FOUNTAIN OVERLAY
   * ======================================================================== */

  const triggerCelebration = useCallback(
    (winUSD: number, wagerBase: number): Promise<void> => {
      const mult = wagerBase > 0 ? winUSD / wagerBase : 0;
      if (mult < 15) return Promise.resolve();

      let label = "BIG WIN!";
      let accent = "#10B981";
      if (mult >= 256) {
        label = "256x SENSATIONAL WIN!";
        accent = "#FDE047";
      } else if (mult >= 100) {
        label = "SUPERB WIN!";
        accent = "#EC4899";
      } else if (mult >= 35) {
        label = "MEGA WIN!";
        accent = "#F59E0B";
      }

      celebSkipRef.current = false;
      setCelebDisplayUSD(0);
      setCelebration({ active: true, label, accent, targetUSD: winUSD, mult });

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

          if (now - lastTick > 80 && t < 0.96) {
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
    const coins: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      tilt: number;
      color: string;
    }[] = [];
    const palette = ["#FDE047", "#10B981", "#FB7185", "#FB923C", "#A855F7"];

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
        if (coins.length < 110) {
          coins.push({
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
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.35;
        c.tilt += 0.12;
        if (c.y > canvas.height + 50 && c.vy > 0) {
          coins.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(Math.max(0.2, Math.abs(Math.cos(c.tilt))), 1);
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(0, 0, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [celebration.active]);

  /* ==========================================================================
   * 11. 7x7 CLUSTER TUMBLE LOOP & PROGRESSIVE WILD MULTIPLIER ENGINE
   * ======================================================================== */

  const executeDropAndTumbles = useCallback(
    async (opts: {
      rng: HmacPrngStream;
      betBaseUSD: number;
      inFreeSpins: boolean;
      forcedScatterCount?: number;
    }): Promise<{
      totalWinUSD: number;
      scattersLanded: number;
      scatterWinUSD: number;
    }> => {
      const spd = turboSpin ? 0.55 : 1;

      // 1. Drop old 49 symbols out
      setPhase("DROPPING");
      setGrid((prev) =>
        prev.map((c) => ({
          ...c,
          isWinning: false,
          isExploding: false,
          isScatterHit: false,
          isWildSpawn: false,
          animType: "drop-out",
        }))
      );
      await sleep(Math.round(170 * spd));
      if (unmountedRef.current)
        return { totalWinUSD: 0, scattersLanded: 0, scatterWinUSD: 0 };

      // 2. Drop 7 columns x 7 rows with 40ms stagger
      const nextGrid: PartyCell[] = [];
      let scatterCount = 0;
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const cell = rollPartyCell(opts.rng, r, c, {
            inFreeSpins: opts.inFreeSpins,
            allowScatter: scatterCount < 7,
            animType: "drop-in",
            dropDelayMs: c * Math.round(40 * spd),
          });
          if (cell.symbol === "scatter_gold_fruit") scatterCount += 1;
          nextGrid.push(cell);
        }
      }

      // Force 3-7 Golden Fruit Scatters on 100x Bonus Buy
      if (opts.forcedScatterCount && opts.forcedScatterCount > 0) {
        const targetCount = Math.min(7, Math.max(3, opts.forcedScatterCount));
        const chosen = new Set<number>();
        while (chosen.size < targetCount) {
          chosen.add(Math.floor(opts.rng.nextFloat() * 49));
        }
        for (let i = 0; i < nextGrid.length; i++) {
          if (chosen.has(i)) {
            nextGrid[i] = {
              ...nextGrid[i],
              symbol: "scatter_gold_fruit",
              multiplier: 1,
              isScatterHit: true,
            };
          } else if (nextGrid[i].symbol === "scatter_gold_fruit") {
            nextGrid[i] = {
              ...nextGrid[i],
              symbol: pickFruitSymbol(opts.rng),
            };
          }
        }
      }

      setGrid(nextGrid);

      // Tropical marimba drop sounds across 7 columns
      let scOrd = 0;
      for (let c = 0; c < GRID_SIZE; c++) {
        setTimeout(() => {
          if (unmountedRef.current) return;
          synthRef.current?.playTropicalDropPop(c);
          const colScatters = nextGrid.filter(
            (cell) => cell.col === c && cell.symbol === "scatter_gold_fruit"
          ).length;
          if (colScatters > 0) {
            scOrd += colScatters;
            synthRef.current?.playScatterChime(scOrd);
          }
        }, Math.round((c * 40 + 120) * spd));
      }

      await sleep(Math.round(500 * spd));
      if (unmountedRef.current)
        return { totalWinUSD: 0, scattersLanded: 0, scatterWinUSD: 0 };

      // 3. Cascading Cluster Tumble Loop
      let workingGrid = nextGrid.map((c) => ({
        ...c,
        animType: "none" as PartyCell["animType"],
      }));
      let spinWinUSD = 0;
      let tumbleStep = 0;

      while (true) {
        setPhase("EVALUATING");
        const clusters = findConnectedClusters7x7(workingGrid, opts.betBaseUSD);
        if (clusters.length === 0) break;

        // Collect all winning coordinates & wild respawn targets
        const winningCellUids = new Set<string>();
        const clusterMergeBadges: ClusterMergeOverlay[] = [];
        const newHist: PartyHistoryItem[] = [];
        let hasMultipliersToMerge = false;
        let stepWin = 0;

        // Track progressive wilds & potential wild spawn cell per cluster
        const wildRespawns = new Map<string, number>(); // key "r,c" -> doubled multiplier
        const newWildCandidates = new Set<string>();

        for (const cl of clusters) {
          stepWin += cl.finalWinUSD;
          for (const cell of cl.cells) {
            winningCellUids.add(cell.uid);
            if (cell.symbol === "wild_multiplier") {
              const doubled = Math.min(MAX_CLUSTER_MULT, Math.max(2, cell.multiplier * 2));
              wildRespawns.set(`${cell.row},${cell.col}`, doubled);
            }
          }

          // Chance to spawn a progressive 2x Wild Multiplier in an empty slot left behind!
          const hadWild = cl.cells.some((c) => c.symbol === "wild_multiplier");
          if (!hadWild) {
            const wildSpawnChance = opts.inFreeSpins ? 0.38 : 0.24;
            if (opts.rng.nextFloat() < wildSpawnChance) {
              const pickCell =
                cl.cells[Math.floor(opts.rng.nextFloat() * cl.cells.length)];
              newWildCandidates.add(`${pickCell.row},${pickCell.col}`);
            }
          }

          if (cl.combinedMult > 1) {
            hasMultipliersToMerge = true;
            spawnMergeOrbsForCluster(cl);
          }

          clusterMergeBadges.push({
            id: cl.id,
            xPercent: ((cl.centerCol + 0.5) / GRID_SIZE) * 100,
            yPercent: ((cl.centerRow + 0.5) / GRID_SIZE) * 100,
            combinedMult: cl.combinedMult,
            finalWinUSD: cl.finalWinUSD,
          });

          newHist.push({
            id: nextUid("ph"),
            symbol: cl.symbol,
            count: cl.cells.length,
            combinedMult: cl.combinedMult,
            winUSD: cl.finalWinUSD,
          });
        }

        // Mark winning cells
        workingGrid = workingGrid.map((cell) =>
          winningCellUids.has(cell.uid) ? { ...cell, isWinning: true } : cell
        );
        setGrid(workingGrid);
        synthRef.current?.playTumbleChord(tumbleStep);
        tumbleStep += 1;

        if (hasMultipliersToMerge) {
          setPhase("MERGING_MULTIPLIERS");
          const maxMult = Math.max(...clusters.map((c) => c.combinedMult));
          synthRef.current?.playMultiplierMergeSwell(maxMult);
          setClusterOverlays(clusterMergeBadges);
          await sleep(Math.round(520 * spd));
        } else {
          setClusterOverlays(clusterMergeBadges);
          await sleep(Math.round(350 * spd));
        }
        if (unmountedRef.current) break;

        spinWinUSD = Math.round((spinWinUSD + stepWin) * 100) / 100;
        setTumbleWinUSD(spinWinUSD);
        setHistoryItems((prev) => [...prev, ...newHist]);

        // Explode winning clusters with fruit splash particles
        setPhase("EXPLODING");
        workingGrid = workingGrid.map((cell) =>
          winningCellUids.has(cell.uid)
            ? { ...cell, isWinning: false, isExploding: true }
            : cell
        );
        setGrid(workingGrid);

        for (const cell of workingGrid) {
          if (winningCellUids.has(cell.uid)) {
            spawnFruitSplash(cell.col, cell.row, cell.symbol);
          }
        }
        await sleep(Math.round(240 * spd));
        if (unmountedRef.current) break;

        // Progressive Wild Respawns + Gravity Collapse + Top Refill
        setPhase("CASCADING");
        setClusterOverlays([]);

        // Step A: Keep non-winning cells; replace winning slots where progressive Wilds respawn!
        const nextWorking: PartyCell[] = new Array(GRID_SIZE * GRID_SIZE);
        let existingScatters = workingGrid.filter(
          (c) => !winningCellUids.has(c.uid) && c.symbol === "scatter_gold_fruit"
        ).length;

        for (let c = 0; c < GRID_SIZE; c++) {
          const survivingOrWildCol: PartyCell[] = [];
          for (let r = 0; r < GRID_SIZE; r++) {
            const cell = workingGrid[r * GRID_SIZE + c];
            const coordKey = `${r},${c}`;
            if (!winningCellUids.has(cell.uid)) {
              survivingOrWildCol.push(cell);
            } else if (wildRespawns.has(coordKey)) {
              // Respawn Wild Multiplier doubled! (2x -> 4x -> ... -> 256x)
              survivingOrWildCol.push({
                uid: nextUid("wild"),
                symbol: "wild_multiplier",
                row: r,
                col: c,
                multiplier: wildRespawns.get(coordKey) || 2,
                isWildSpawn: true,
                animType: "none",
              });
            } else if (newWildCandidates.has(coordKey)) {
              // Spawn fresh 2x Wild Multiplier in empty cluster cell
              survivingOrWildCol.push({
                uid: nextUid("wild"),
                symbol: "wild_multiplier",
                row: r,
                col: c,
                multiplier: 2,
                isWildSpawn: true,
                animType: "none",
              });
            }
          }

          const missing = GRID_SIZE - survivingOrWildCol.length;

          // Refill top rows
          for (let r = 0; r < missing; r++) {
            const rolled = rollPartyCell(opts.rng, r, c, {
              inFreeSpins: opts.inFreeSpins,
              allowScatter: existingScatters < 7,
              animType: "cascade",
              fallRows: missing + 1,
            });
            if (rolled.symbol === "scatter_gold_fruit") existingScatters += 1;
            nextWorking[r * GRID_SIZE + c] = rolled;
          }

          // Slide surviving symbols & spawned wilds downward
          for (let i = 0; i < survivingOrWildCol.length; i++) {
            const targetRow = missing + i;
            const s = survivingOrWildCol[i];
            const delta = targetRow - s.row;
            nextWorking[targetRow * GRID_SIZE + c] = {
              ...s,
              row: targetRow,
              isWinning: false,
              isExploding: false,
              animType: delta > 0 ? "cascade" : "none",
              fallRows: delta > 0 ? delta : 0,
            };
          }
        }

        workingGrid = nextWorking;
        setGrid(workingGrid);
        await sleep(Math.round(290 * spd));
        if (unmountedRef.current) break;

        workingGrid = workingGrid.map((c) => ({
          ...c,
          animType: "none",
          fallRows: 0,
          isWildSpawn: false,
        }));
      }

      // 4. Scatters on settled board
      const finalScatters = workingGrid.filter(
        (c) => c.symbol === "scatter_gold_fruit"
      );
      const scatterAward = getScatterAward(finalScatters.length);
      const scatterWinUSD =
        Math.round(opts.betBaseUSD * scatterAward.mult * 100) / 100;

      if (finalScatters.length >= 3) {
        workingGrid = workingGrid.map((c) =>
          c.symbol === "scatter_gold_fruit" ? { ...c, isScatterHit: true } : c
        );
        setGrid(workingGrid);
        synthRef.current?.playBonusTrigger();
        await sleep(450);
      }

      setPhase("SPIN_COMPLETE");
      return {
        totalWinUSD: spinWinUSD,
        scattersLanded: finalScatters.length,
        scatterWinUSD,
      };
    },
    [
      nextUid,
      pickFruitSymbol,
      rollPartyCell,
      sleep,
      spawnFruitSplash,
      spawnMergeOrbsForCluster,
      turboSpin,
    ]
  );

  /* ==========================================================================
   * 12. SPIN & FREE SPINS ORCHESTRATOR
   * ======================================================================== */

  const runSpin = useCallback(
    async (isBonusBuy = false) => {
      if (isSpinningRef.current) return;
      synthRef.current?.unlock();

      const fsActive = fsRef.current.active;
      let wagerUSD = 0;
      let spinBaseBet = baseBetUSD;

      if (fsActive) {
        spinBaseBet = fsRef.current.wagerBase;
        wagerUSD = 0;
      } else if (isBonusBuy) {
        wagerUSD = Math.round(baseBetUSD * 100 * 100) / 100;
        if (balanceRef.current < wagerUSD) {
          setAutoplayLeft(0);
          return;
        }
        updateBalance(balanceRef.current - wagerUSD);
      } else {
        wagerUSD = baseBetUSD;
        if (balanceRef.current < wagerUSD) {
          setAutoplayLeft(0);
          return;
        }
        updateBalance(balanceRef.current - wagerUSD);
      }

      isSpinningRef.current = true;
      setShowBetModal(false);
      setShowAutoMenu(false);
      setTumbleWinUSD(0);
      setClusterOverlays([]);
      setHistoryItems([]);

      const usedNonce = nonce;
      setNonce((n) => n + 1);
      const proofHash = await hmacSha256Hex(
        serverSeed,
        `${clientSeed}:${usedNonce}`
      );
      const rng = new HmacPrngStream(proofHash);

      if (fsActive) {
        fsRef.current.left -= 1;
        fsRef.current.num += 1;
        setFreeSpinsLeft(fsRef.current.left);
        setFreeSpinNum(fsRef.current.num);
      }

      // For 100x Bonus Buy, roll 3..7 Scatters weighted naturally (mostly 3-4, occasionally 5-7)
      let forcedScatters: number | undefined = undefined;
      if (isBonusBuy) {
        const r = rng.nextFloat();
        forcedScatters = r < 0.72 ? 3 : r < 0.92 ? 4 : r < 0.97 ? 5 : r < 0.992 ? 6 : 7;
      }

      const res = await executeDropAndTumbles({
        rng,
        betBaseUSD: spinBaseBet,
        inFreeSpins: fsActive,
        forcedScatterCount: forcedScatters,
      });

      if (unmountedRef.current) {
        isSpinningRef.current = false;
        return;
      }

      const maxCapUSD = Math.round(spinBaseBet * MAX_WIN_MULT * 100) / 100;

      if (!fsActive) {
        const baseSpinTotal =
          Math.round((res.totalWinUSD + res.scatterWinUSD) * 100) / 100;

        if (isBonusBuy || res.scattersLanded >= 3) {
          setAutoplayLeft(0);
          const scatterSpins = getScatterAward(
            Math.max(3, res.scattersLanded)
          ).spins;
          const startWin = Math.min(maxCapUSD, baseSpinTotal);

          fsRef.current = {
            active: true,
            left: scatterSpins,
            total: scatterSpins,
            num: 0,
            cumulativeWin: startWin,
            wagerBase: spinBaseBet,
            totalCost: isBonusBuy ? wagerUSD : spinBaseBet,
          };

          setIsFreeSpins(true);
          setFreeSpinsLeft(scatterSpins);
          setFreeSpinsTotal(scatterSpins);
          setFreeSpinNum(0);
          setBonusCumulativeWinUSD(startWin);
          setBonusNotice(`${scatterSpins} FREE SPINS ACTIVATED!`);
          await sleep(1300);
          setBonusNotice(null);

          isSpinningRef.current = false;
          if (!unmountedRef.current) void runSpin(false);
          return;
        }

        // Regular Base Spin Settlement
        const capped = Math.min(maxCapUSD, baseSpinTotal);
        if (capped > 0) updateBalance(balanceRef.current + capped);

        const mult =
          spinBaseBet > 0 ? Math.round((capped / spinBaseBet) * 100) / 100 : 0;
        const record: ZyanPartyBetRecord = {
          gameKey: "ZYAN_PARTY",
          gameName: "Zyan Party",
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

        if (capped >= spinBaseBet * 15) {
          await triggerCelebration(capped, spinBaseBet);
        }

        setPhase("IDLE");
        isSpinningRef.current = false;

        if (autoplayRef.current > 0 && !unmountedRef.current) {
          setAutoplayLeft((a) => a - 1);
          if (balanceRef.current >= baseBetUSD) {
            setTimeout(() => {
              if (!isSpinningRef.current && !unmountedRef.current) {
                void runSpin(false);
              }
            }, turboSpin ? 220 : 400);
          } else {
            setAutoplayLeft(0);
          }
        }
      } else {
        // Inside Free Spins
        const nextCum = Math.min(
          maxCapUSD,
          Math.round(
            (fsRef.current.cumulativeWin + res.totalWinUSD + res.scatterWinUSD) *
              100
          ) / 100
        );
        fsRef.current.cumulativeWin = nextCum;
        setBonusCumulativeWinUSD(nextCum);

        if (res.scattersLanded >= 3 && nextCum < maxCapUSD) {
          const extra = 5;
          fsRef.current.left += extra;
          fsRef.current.total += extra;
          setFreeSpinsLeft(fsRef.current.left);
          setFreeSpinsTotal(fsRef.current.total);
          setBonusNotice("+5 EXTRA FREE SPINS!");
          await sleep(1100);
          setBonusNotice(null);
        }

        if (fsRef.current.left > 0 && nextCum < maxCapUSD) {
          await sleep(turboSpin ? 260 : 480);
          isSpinningRef.current = false;
          if (!unmountedRef.current) void runSpin(false);
          return;
        }

        // Complete Bonus
        const finalBonusPayout = fsRef.current.cumulativeWin;
        const played = fsRef.current.num;
        const cost = fsRef.current.totalCost;

        if (finalBonusPayout > 0) {
          updateBalance(balanceRef.current + finalBonusPayout);
        }

        const mult =
          spinBaseBet > 0
            ? Math.round((finalBonusPayout / spinBaseBet) * 100) / 100
            : 0;
        const record: ZyanPartyBetRecord = {
          gameKey: "ZYAN_PARTY",
          gameName: "Zyan Party",
          wagerUSD: cost,
          multiplier: mult,
          payoutUSD: finalBonusPayout,
          isWin: finalBonusPayout > 0,
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
            payoutUSD: finalBonusPayout,
            multiplier: mult,
          },
          ...prev.slice(0, 24),
        ]);

        if (finalBonusPayout >= spinBaseBet * 15) {
          await triggerCelebration(finalBonusPayout, spinBaseBet);
        }

        setBonusSummary({
          open: true,
          totalWinUSD: finalBonusPayout,
          spinsPlayed: played,
        });

        fsRef.current.active = false;
        setIsFreeSpins(false);
        setPhase("IDLE");
        isSpinningRef.current = false;
      }
    },
    [
      baseBetUSD,
      clientSeed,
      executeDropAndTumbles,
      nonce,
      onRecordBet,
      serverSeed,
      serverSeedHash,
      sleep,
      triggerCelebration,
      turboSpin,
      updateBalance,
    ]
  );

  // Spacebar spin/skip
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
        !buyConfirmOpen &&
        !isSpinningRef.current
      ) {
        void runSpin(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    bonusSummary.open,
    buyConfirmOpen,
    celebration.active,
    runSpin,
    showBetModal,
    showFairnessModal,
    showInfoModal,
  ]);

  const adjustBet = useCallback(
    (dir: -1 | 1) => {
      if (isSpinningRef.current || isFreeSpins) return;
      synthRef.current?.playClick(dir > 0 ? 720 : 560);
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
    synthRef.current?.playClick(820);
  }, [serverSeed, serverSeedHash]);

  const isBusy = phase !== "IDLE" || isFreeSpins;
  const buy100Cost = Math.round(baseBetUSD * 100 * 100) / 100;

  /* ==========================================================================
   * 13. RENDER
   * ======================================================================== */

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      style={{
        backgroundImage: `url(${
          ZYAN_PARTY_ASSETS.STAGE_BG || ZYAN_PARTY_CUSTOM_ASSETS.STAGE_BG
        })`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      className="relative min-h-screen w-full overflow-hidden bg-[#050711]"
    >
      {/* Subtle Dark Vignette & Free Spins Bioluminescent Tint Over Stage BG */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-all duration-700 ${
          isFreeSpins
            ? "bg-[radial-gradient(ellipse_at_center,rgba(6,78,59,0.5)_0%,rgba(7,5,16,0.88)_100%)]"
            : "bg-[radial-gradient(ellipse_at_center,rgba(11,16,36,0.48)_0%,rgba(5,7,17,0.88)_100%)]"
        }`}
      />

      {/* Ambient Emerald-Gold Aura */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-36 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full blur-[125px] ${
          isFreeSpins
            ? "bg-gradient-to-r from-amber-400/25 via-emerald-400/25 to-lime-400/20"
            : "bg-gradient-to-r from-emerald-500/20 via-teal-400/15 to-amber-500/15"
        }`}
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1220px] flex-col justify-between px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4">
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
                Player: <strong className="text-white">{username}</strong>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <h1 className="font-display bg-gradient-to-r from-emerald-300 via-lime-300 to-amber-400 bg-clip-text text-xl font-black uppercase tracking-tight text-transparent drop-shadow-[0_2px_10px_rgba(16,185,129,0.35)] sm:text-2xl lg:text-[28px]">
              ZYAN PARTY
            </h1>
            <span className="font-display inline-flex items-center gap-1 rounded-md border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300 sm:text-[11px]">
              <Crown className="h-3 w-3 text-amber-300" />
              7×7 CLUSTER PAYS • UP TO 256x MULTIPLIERS
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                synthRef.current?.playClick();
                setShowFairnessModal(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:border-emerald-400/50 hover:bg-white/10"
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
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:border-amber-400/50 hover:bg-white/10"
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
                <Volume2 className="h-4 w-4 text-emerald-300" />
              )}
            </button>
          </div>
        </header>

        {/* Mobile Feature Buy Button (< 768px) */}
        <div className="mb-2 md:hidden">
          <button
            type="button"
            disabled={isBusy || balanceUSD < buy100Cost}
            onClick={() => {
              synthRef.current?.playClick();
              setBuyConfirmOpen(true);
            }}
            className="flex min-h-[44px] w-full items-center justify-between rounded-xl border-[1.5px] border-emerald-400 bg-gradient-to-r from-emerald-950/90 via-teal-950/90 to-amber-950/90 px-4 py-2 transition active:scale-[0.99] disabled:opacity-45"
          >
            <span className="font-display text-xs font-black uppercase tracking-wider text-emerald-300">
              BUY FREE SPINS (100x)
            </span>
            <span className="font-ui text-sm font-extrabold text-amber-300">
              {formatUSD(buy100Cost)}
            </span>
          </button>
        </div>

        {/* MAIN STAGE: LEFT FEATURE BUY + 7x7 CLUSTER GRID */}
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-stretch lg:gap-4">
          {/* Desktop Left Column (240px) */}
          <aside className="hidden w-[240px] shrink-0 flex-col gap-2.5 md:flex">
            {/* Buy Free Spins — 100x Base Bet */}
            <button
              type="button"
              disabled={isBusy || balanceUSD < buy100Cost}
              onClick={() => {
                synthRef.current?.playClick();
                setBuyConfirmOpen(true);
              }}
              style={{ boxShadow: "0 0 24px rgba(16, 185, 129, 0.2)" }}
              className="rounded-xl border-[1.5px] border-emerald-400 bg-gradient-to-br from-emerald-950/95 via-slate-900 to-amber-950/90 p-3.5 text-left transition-transform duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-[11px] font-black uppercase tracking-wider text-emerald-300">
                  BUY FREE SPINS
                </span>
                <span className="font-display rounded bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-black text-emerald-200">
                  100x
                </span>
              </div>
              <div className="font-ui mt-1 text-xl font-extrabold text-white">
                {formatUSD(buy100Cost)}
              </div>
              <p className="mt-1 text-[11px] font-medium text-amber-300/90">
                3–7 Scatters · 3x Multiplier Boost
              </p>
            </button>

            {/* Combining Multipliers Info Card */}
            <div className="rounded-xl border border-white/15 bg-slate-900/75 p-3 backdrop-blur-md">
              <div className="font-display flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-300">
                <Sparkles className="h-3.5 w-3.5" />
                COMBINING 2x/4x UP TO 256x
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                Multipliers inside the same 5+ cluster{" "}
                <strong className="text-white">multiply together</strong> (2×2×4
                = 16x, up to <strong className="text-amber-300">256x</strong>)!
                Winning Wilds respawn doubled!
              </p>
            </div>

            {/* Live Cluster History */}
            <div className="flex flex-1 flex-col rounded-xl border border-white/12 bg-slate-950/75 p-3 backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="font-display text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
                  CLUSTER WINS
                </span>
                <span className="font-ui text-[11px] font-semibold text-emerald-300">
                  {historyItems.length}
                </span>
              </div>
              {historyItems.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-4 text-center text-xs text-slate-500">
                  <span>Connect 5+ touching fruits</span>
                  <span className="mt-0.5 text-[11px] text-slate-600">
                    Horizontally or vertically
                  </span>
                </div>
              ) : (
                <div className="flex max-h-[240px] flex-col gap-1.5 overflow-y-auto pr-1">
                  {historyItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="h-6 w-6 shrink-0">
                          <PartySymbol3D id={item.symbol} />
                        </div>
                        <span className="font-ui text-xs font-bold text-slate-200">
                          ×{item.count}
                        </span>
                        {item.combinedMult > 1 && (
                          <span className="font-display rounded bg-amber-400/25 px-1 py-0.5 text-[10px] font-black text-amber-300">
                            {item.combinedMult}X
                          </span>
                        )}
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

          {/* Center Stage: Top Banner + 7x7 Grid */}
          <main className="flex min-w-0 flex-1 flex-col">
            <div
              className={`mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 backdrop-blur-md transition-all sm:px-4 ${
                isFreeSpins
                  ? "border-amber-400/65 bg-gradient-to-r from-emerald-950/90 via-amber-950/80 to-emerald-950/90 shadow-[0_0_24px_rgba(245,158,11,0.28)]"
                  : "border-white/15 bg-slate-950/75"
              }`}
            >
              {isFreeSpins ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-display rounded bg-emerald-400 px-2 py-0.5 text-[11px] font-black uppercase text-slate-950">
                      FREE SPINS
                    </span>
                    <span className="font-display text-xs font-black uppercase text-amber-200 sm:text-sm">
                      SPIN {freeSpinNum} OF {freeSpinsTotal} ({freeSpinsLeft} LEFT)
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/80">
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
                    5+ ORTHOGONAL CLUSTER PAYS · WILD DOUBLES UP TO 256x
                  </span>
                  <span
                    className={`font-display text-sm font-black uppercase sm:text-base ${
                      tumbleWinUSD > 0 ? "text-emerald-400" : "text-slate-400"
                    }`}
                  >
                    {tumbleWinUSD > 0
                      ? `TUMBLE WIN: ${formatUSD(tumbleWinUSD)}`
                      : "READY TO SPIN"}
                  </span>
                </div>
              )}
            </div>

            {/* 7x7 3D Glass Grid Container (49 Cells, Fits 360px Mobile Cleanly!) */}
            <div
              className={`relative mx-auto flex w-full max-w-[660px] flex-1 items-center justify-center rounded-2xl border-2 p-1.5 shadow-2xl transition-all duration-500 sm:p-2.5 ${
                isFreeSpins
                  ? "border-amber-400/75 bg-gradient-to-b from-emerald-950/70 via-[#0e1929]/85 to-amber-950/70 shadow-[0_0_45px_rgba(245,158,11,0.28)]"
                  : "border-emerald-400/45 bg-gradient-to-b from-teal-950/65 via-[#0b1324]/85 to-indigo-950/65 shadow-[0_0_45px_rgba(16,185,129,0.2)]"
              } backdrop-blur-xl`}
            >
              <div
                ref={gridBoxRef}
                className="relative grid aspect-square w-full grid-cols-7 grid-rows-7 gap-1 overflow-hidden rounded-xl bg-black/35 p-1 sm:gap-2 sm:p-2"
              >
                {grid.map((cell) => {
                  const animStyle: React.CSSProperties = {};
                  if (cell.animType === "drop-out") {
                    animStyle.animation = `zyanReelDropOut ${turboSpin ? "95ms" : "170ms"} ease-in forwards`;
                  } else if (cell.animType === "drop-in") {
                    animStyle.animation = `zyanReelDropIn ${turboSpin ? "210ms" : "330ms"} cubic-bezier(0.22, 1.28, 0.36, 1) ${cell.dropDelayMs || 0}ms both`;
                  } else if (cell.animType === "cascade" && (cell.fallRows || 0) > 0) {
                    (animStyle as Record<string, string | number>)["--zyan-fall-from"] = `-${(cell.fallRows || 1) * 108}%`;
                    animStyle.animation = `zyanCascadeFall ${turboSpin ? "155ms" : "250ms"} cubic-bezier(0.22, 1.2, 0.36, 1) both`;
                  } else if (cell.isWinning) {
                    animStyle.animation = "zyanSymbolWinPulse 0.35s ease-out forwards";
                  } else if (cell.isExploding) {
                    animStyle.animation = "zyanSymbolExplode 0.24s ease-in forwards";
                  } else if (cell.isScatterHit) {
                    animStyle.animation = "zyanScatterLand 0.45s ease-out infinite";
                  }

                  return (
                    <div
                      key={cell.uid}
                      style={animStyle}
                      className={`relative flex aspect-square items-center justify-center rounded-lg p-0.5 transition-colors sm:rounded-xl sm:p-1 ${
                        cell.isWinning
                          ? "z-10 border-2 border-lime-300 bg-emerald-400/25 shadow-[0_0_16px_rgba(74,222,128,0.75)]"
                          : cell.isScatterHit
                            ? "z-10 border-2 border-amber-300 bg-amber-400/25 shadow-[0_0_18px_rgba(251,191,36,0.85)]"
                            : cell.isWildSpawn
                              ? "z-10 border-2 border-yellow-300 bg-amber-500/25 shadow-[0_0_18px_rgba(253,224,71,0.8)]"
                              : "border border-white/5 bg-white/[0.03]"
                      }`}
                    >
                      <PartySymbol3D
                        id={cell.symbol}
                        multiplier={cell.multiplier}
                        className="h-full w-full select-none"
                      />
                    </div>
                  );
                })}

                {/* Fruit Splash & Multiplier Convergence Canvas */}
                <canvas
                  ref={fxCanvasRef}
                  className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                />

                {/* Merged Cluster Multiplier Badges */}
                {clusterOverlays.map((ov) => (
                  <div
                    key={ov.id}
                    style={{
                      left: `${ov.xPercent}%`,
                      top: `${ov.yPercent}%`,
                      animation: "zyanFloatCallout 0.9s ease-out forwards",
                    }}
                    className="pointer-events-none absolute z-30 rounded-lg border border-amber-300 bg-slate-950/95 px-2 py-1 text-center shadow-[0_4px_18px_rgba(0,0,0,0.85)]"
                  >
                    {ov.combinedMult > 1 && (
                      <div className="font-display text-xs font-black text-amber-300 sm:text-sm">
                        {ov.combinedMult}X!
                      </div>
                    )}
                    <div className="font-display text-xs font-black text-emerald-300 sm:text-base">
                      +{formatUSD(ov.finalWinUSD)}
                    </div>
                  </div>
                ))}

                {/* Bonus Activation Notice */}
                {bonusNotice && (
                  <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                    <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-900 via-teal-800 to-amber-900 px-6 py-4 text-center shadow-2xl">
                      <div className="font-display text-lg font-black uppercase text-amber-200 sm:text-2xl">
                        {bonusNotice}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>

        {/* BOTTOM CONTROL BAR + ZYAN.GG WATERMARK */}
        <footer className="relative mt-2.5 rounded-2xl border border-white/15 bg-slate-950/85 px-3 py-2.5 shadow-xl backdrop-blur-md sm:mt-3 sm:px-5 sm:py-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <button
                type="button"
                onClick={() => {
                  synthRef.current?.playClick();
                  setShowInfoModal(true);
                }}
                aria-label="Paytable & Info"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/5 text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
              >
                <Info className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  synthRef.current?.playClick(turboSpin ? 520 : 760);
                  setTurboSpin((t) => !t);
                }}
                className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition ${
                  turboSpin
                    ? "border-emerald-400 bg-emerald-400/20 text-emerald-300"
                    : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">TURBO</span>
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white transition hover:bg-white/15 disabled:opacity-35"
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
                  className="min-w-[88px] rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-left transition hover:border-emerald-400/60 disabled:opacity-60"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    BET
                  </div>
                  <div className="font-ui text-sm font-extrabold text-emerald-300 sm:text-base">
                    {formatUSD(baseBetUSD)}
                  </div>
                </button>
                <button
                  type="button"
                  disabled={
                    isBusy || baseBetUSD >= BET_PRESETS[BET_PRESETS.length - 1]
                  }
                  onClick={() => adjustBet(1)}
                  aria-label="Increase Bet"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white transition hover:bg-white/15 disabled:opacity-35"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
              {/* Footer ZYAN.GG Watermark */}
              {!logoError && (
                <img
                  src={ZYAN_LOGO_URL}
                  alt="ZYAN.GG"
                  referrerPolicy="no-referrer"
                  style={{ mixBlendMode: "lighten" }}
                  className="hidden h-6 w-auto opacity-65 lg:block"
                />
              )}

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
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3 text-xs font-bold text-slate-200 transition hover:border-emerald-400/50 disabled:opacity-45"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>AUTOPLAY</span>
                  </button>
                )}

                {showAutoMenu && (
                  <div className="absolute right-0 bottom-14 z-40 w-44 rounded-xl border border-white/20 bg-slate-900 p-2 shadow-2xl">
                    <div className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Select Auto Spins
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
                              void runSpin(false);
                            }
                          }}
                          className="font-ui rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-extrabold text-white transition hover:border-emerald-400 hover:bg-emerald-400/20"
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
                disabled={isBusy || (!isFreeSpins && balanceUSD < baseBetUSD)}
                onClick={() => void runSpin(false)}
                aria-label="Spin Reels"
                className={`group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 transition-transform duration-150 sm:h-16 sm:w-16 ${
                  isBusy
                    ? "cursor-not-allowed border-emerald-400/40 bg-slate-800"
                    : "border-lime-300 bg-gradient-to-br from-emerald-400 via-teal-400 to-amber-400 shadow-[0_0_28px_rgba(16,185,129,0.55)] hover:scale-105 active:scale-95"
                }`}
              >
                <RotateCw
                  className={`h-7 w-7 text-slate-950 sm:h-8 sm:w-8 ${
                    isBusy ? "animate-spin text-emerald-300" : "group-hover:rotate-45"
                  }`}
                />
              </button>
            </div>
          </div>

          {showBetModal && (
            <div className="absolute bottom-20 left-2 z-40 w-[300px] rounded-2xl border border-white/20 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl sm:left-32">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-xs font-black uppercase tracking-wider text-emerald-300">
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
                {BET_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      synthRef.current?.playClick(700);
                      setBaseBetUSD(p);
                      setShowBetModal(false);
                    }}
                    className={`font-ui rounded-lg border py-2 text-xs font-bold transition ${
                      Math.abs(baseBetUSD - p) < 0.001
                        ? "border-emerald-400 bg-emerald-400 text-slate-950"
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

      {/* BONUS BUY CONFIRMATION DIALOG */}
      {buyConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border-2 border-emerald-400 bg-gradient-to-b from-emerald-950 to-slate-950 p-6 shadow-2xl">
            <h2 className="font-display text-lg font-black uppercase text-emerald-300">
              BUY FREE SPINS (100x)
            </h2>
            <p className="mt-2 text-sm text-slate-200">
              Buy Free Spins on ZYAN PARTY for{" "}
              <strong className="text-amber-300">{formatUSD(buy100Cost)}</strong>?
              Lands 3–7 Golden Scatters awarding 10–14 Free Spins with boosted 2x
              &amp; 4x multipliers!
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setBuyConfirmOpen(false)}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-bold uppercase text-slate-200 hover:bg-white/10"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => {
                  setBuyConfirmOpen(false);
                  void runSpin(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 px-5 py-2.5 text-xs font-black uppercase text-slate-950"
              >
                <Check className="h-4 w-4" />
                YES, BUY BONUS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* END OF BONUS SUMMARY */}
      {bonusSummary.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border-2 border-emerald-400 bg-gradient-to-b from-emerald-950 to-slate-950 p-7 text-center shadow-2xl">
            <div className="font-display text-xs font-black uppercase tracking-widest text-emerald-300">
              FREE SPINS COMPLETE
            </div>
            <h2 className="font-display mt-2 text-2xl font-black uppercase text-white">
              TOTAL PARTY WIN
            </h2>
            <div className="font-display my-4 bg-gradient-to-r from-emerald-300 via-lime-300 to-amber-300 bg-clip-text text-4xl font-black text-transparent sm:text-5xl">
              {formatUSD(bonusSummary.totalWinUSD)}
            </div>
            <p className="text-xs text-slate-300">
              Won across {bonusSummary.spinsPlayed} Free Spins
            </p>
            <button
              type="button"
              onClick={() => setBonusSummary((s) => ({ ...s, open: false }))}
              className="font-display mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-amber-400 py-3 text-sm font-black uppercase text-slate-950"
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
              className="font-display text-3xl font-black uppercase drop-shadow-[0_4px_24px_rgba(16,185,129,0.7)] sm:text-5xl"
            >
              {celebration.label}
            </div>
            <div className="font-display mt-4 bg-gradient-to-b from-white via-lime-200 to-amber-400 bg-clip-text text-5xl font-black text-transparent sm:text-7xl">
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
                  ZYAN PARTY — 7×7 CLUSTER PAYTABLE
                </h2>
                <p className="text-xs text-slate-400">
                  5+ Orthogonally Touching Symbols Pay · Bet {formatUSD(baseBetUSD)}
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
                {REGULAR_FRUITS.map((sym) => {
                  const row = PARTY_PAYTABLE[sym];
                  return (
                    <div
                      key={sym}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
                    >
                      <div className="h-14 w-14 shrink-0">
                        <PartySymbol3D id={sym} />
                      </div>
                      <div className="flex-1 text-xs">
                        <div className="font-display font-bold text-white">
                          {FRUIT_META[sym].name}
                        </div>
                        <div className="font-ui mt-1 space-y-0.5 text-slate-300">
                          <div className="flex justify-between">
                            <span className="text-slate-400">15+ Cluster</span>
                            <span className="font-bold text-amber-300">
                              {row[10].toFixed(2)}x ({formatUSD(baseBetUSD * row[10])})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">10 Cluster</span>
                            <span>{row[5].toFixed(2)}x</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">5 Cluster</span>
                            <span>{row[0].toFixed(2)}x</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-950/20 p-4">
                  <div className="h-14 w-14 shrink-0">
                    <PartySymbol3D id="scatter_gold_fruit" />
                  </div>
                  <div className="text-xs text-slate-200">
                    <div className="font-display font-black uppercase text-amber-300">
                      GOLDEN PEACH SCATTER
                    </div>
                    <p className="mt-1 text-slate-300">
                      3: 10 FS · 4: 10x + 11 FS · 5: 20x + 12 FS · 6: 50x + 13 FS · 7+: 100x + 14 FS
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-emerald-400/40 bg-emerald-950/20 p-4">
                  <div className="h-14 w-14 shrink-0">
                    <PartySymbol3D id="wild_multiplier" multiplier={16} />
                  </div>
                  <div className="text-xs text-slate-200">
                    <div className="font-display font-black uppercase text-emerald-300">
                      PROGRESSIVE CROWN WILD (2x → 256x)
                    </div>
                    <p className="mt-1 text-slate-300">
                      Substitutes for all fruits. Respawns doubled (2x → 4x → 8x → ... → 256x)
                      when part of a winning cluster!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROVABLY FAIR HMAC-SHA256 MODAL */}
      {showFairnessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-emerald-400/35 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-emerald-400" />
                <h2 className="font-display text-base font-black uppercase text-white">
                  PROVABLY FAIR HMAC-SHA256 VERIFIER
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
                  <div className="font-ui rounded-lg border border-white/15 bg-black/50 px-3 py-2 font-bold text-emerald-300">
                    #{nonce}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="text-slate-300">
                  Rotate Server Seed to reveal previous key for HMAC verification.
                </span>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={rotateServerSeed}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-2 font-bold text-slate-950 disabled:opacity-45"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Rotate
                </button>
              </div>

              <div className="max-h-52 space-y-2 overflow-y-auto">
                {fairnessLogs.length === 0 ? (
                  <div className="rounded-xl border border-white/10 p-4 text-center text-slate-500">
                    Spin to record HMAC-SHA256 spin proofs.
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
                        HMAC: {l.proofHash}
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

export default ZyanPartySlot;
