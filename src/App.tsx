import { useState } from "react";
import { ZyanSweet1000Slot } from "./components/ZyanSweet1000Slot";
import { ZyanPartySlot } from "./components/ZyanPartySlot";
import { ZyanHunter10000Slot } from "./components/ZyanHunter10000Slot";
import { ZyanWantedSlot } from "./components/ZyanWantedSlot";
import { ZyanOlympus1000Slot } from "./components/ZyanOlympus1000Slot";
import { ZyanLeBanditSlot } from "./components/ZyanLeBanditSlot";
import { ZyanSugarRush1000Slot } from "./components/ZyanSugarRush1000Slot";
import { ZyanSanQuentinSlot } from "./components/ZyanSanQuentinSlot";

type ActiveGame =
  | "sweet_1000"
  | "zyan_party"
  | "hunter_10000"
  | "wanted"
  | "olympus_1000"
  | "le_bandit"
  | "sugar_rush_1000"
  | "san_quentin";

export function App() {
  const [activeGame, setActiveGame] = useState<ActiveGame>("san_quentin");
  const [sharedBalanceUSD, setSharedBalanceUSD] = useState<number>(1000.0);

  return (
    <div className="min-h-screen bg-[#06040f]">
      {/* Slim Flagship Game Switcher */}
      <nav className="relative z-40 flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950/95 px-3 py-2 backdrop-blur-md sm:px-6">
        <span className="font-display whitespace-nowrap text-xs font-black uppercase tracking-wider text-slate-300">
          ZYAN.GG Originals
        </span>
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setActiveGame("sweet_1000")}
            className={`font-display whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black uppercase transition ${
              activeGame === "sweet_1000"
                ? "bg-gradient-to-r from-amber-400 to-pink-500 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Sweet 1000
          </button>
          <button
            type="button"
            onClick={() => setActiveGame("zyan_party")}
            className={`font-display whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black uppercase transition ${
              activeGame === "zyan_party"
                ? "bg-gradient-to-r from-emerald-400 to-amber-400 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Zyan Party
          </button>
          <button
            type="button"
            onClick={() => setActiveGame("hunter_10000")}
            className={`font-display whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black uppercase transition ${
              activeGame === "hunter_10000"
                ? "bg-gradient-to-r from-amber-400 via-orange-500 to-red-600 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Hunter 10,000x
          </button>
          <button
            type="button"
            onClick={() => setActiveGame("wanted")}
            className={`font-display whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black uppercase transition ${
              activeGame === "wanted"
                ? "bg-gradient-to-r from-red-500 via-amber-400 to-yellow-300 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Wanted 12,500x
          </button>
          <button
            type="button"
            onClick={() => setActiveGame("olympus_1000")}
            className={`font-display whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black uppercase transition ${
              activeGame === "olympus_1000"
                ? "bg-gradient-to-r from-amber-300 via-yellow-400 to-cyan-400 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Olympus 1000
          </button>
          <button
            type="button"
            onClick={() => setActiveGame("le_bandit")}
            className={`font-display whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black uppercase transition ${
              activeGame === "le_bandit"
                ? "bg-gradient-to-r from-amber-300 via-yellow-400 to-emerald-400 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Le Bandit
          </button>
          <button
            type="button"
            onClick={() => setActiveGame("sugar_rush_1000")}
            className={`font-display whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black uppercase transition ${
              activeGame === "sugar_rush_1000"
                ? "bg-gradient-to-r from-pink-500 via-fuchsia-500 to-amber-400 text-white shadow-sm"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Sugar Rush 1000
          </button>
          <button
            type="button"
            onClick={() => setActiveGame("san_quentin")}
            className={`font-display whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black uppercase transition ${
              activeGame === "san_quentin"
                ? "bg-gradient-to-r from-amber-400 via-orange-500 to-red-600 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white"
            }`}
          >
            San Quentin xWays
          </button>
        </div>
        <div className="font-ui hidden whitespace-nowrap text-xs font-bold text-emerald-300 sm:block">
          Wallet: ${sharedBalanceUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </nav>

      {activeGame === "sweet_1000" ? (
        <ZyanSweet1000Slot
          externalBalanceUSD={sharedBalanceUSD}
          onBalanceChange={setSharedBalanceUSD}
        />
      ) : activeGame === "zyan_party" ? (
        <ZyanPartySlot
          externalBalanceUSD={sharedBalanceUSD}
          onBalanceChange={setSharedBalanceUSD}
        />
      ) : activeGame === "hunter_10000" ? (
        <ZyanHunter10000Slot
          externalBalanceUSD={sharedBalanceUSD}
          onBalanceChange={setSharedBalanceUSD}
        />
      ) : activeGame === "wanted" ? (
        <ZyanWantedSlot
          externalBalanceUSD={sharedBalanceUSD}
          onBalanceChange={setSharedBalanceUSD}
        />
      ) : activeGame === "olympus_1000" ? (
        <ZyanOlympus1000Slot
          externalBalanceUSD={sharedBalanceUSD}
          onBalanceChange={setSharedBalanceUSD}
        />
      ) : activeGame === "le_bandit" ? (
        <ZyanLeBanditSlot
          externalBalanceUSD={sharedBalanceUSD}
          onBalanceChange={setSharedBalanceUSD}
        />
      ) : activeGame === "sugar_rush_1000" ? (
        <ZyanSugarRush1000Slot
          externalBalanceUSD={sharedBalanceUSD}
          onBalanceChange={setSharedBalanceUSD}
        />
      ) : (
        <ZyanSanQuentinSlot
          externalBalanceUSD={sharedBalanceUSD}
          onBalanceChange={setSharedBalanceUSD}
        />
      )}
    </div>
  );
}

export default App;
