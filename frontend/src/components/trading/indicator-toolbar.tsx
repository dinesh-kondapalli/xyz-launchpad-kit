"use client";

export interface ActiveIndicators {
  sma7: boolean;
  sma25: boolean;
  sma99: boolean;
  ema7: boolean;
  ema25: boolean;
  bollinger: boolean;
  rsi: boolean;
  macd: boolean;
  volume: boolean;
}

export const DEFAULT_INDICATORS: ActiveIndicators = {
  sma7: false,
  sma25: false,
  sma99: false,
  ema7: false,
  ema25: false,
  bollinger: false,
  rsi: false,
  macd: false,
  volume: true,
};

interface IndicatorToolbarProps {
  indicators: ActiveIndicators;
  onChange: (indicators: ActiveIndicators) => void;
}

const INDICATOR_BUTTONS: { key: keyof ActiveIndicators; label: string; color: string }[] = [
  { key: "sma7", label: "MA7", color: "#be185d" },
  { key: "sma25", label: "MA25", color: "#9d174d" },
  { key: "sma99", label: "MA99", color: "#831843" },
  { key: "ema7", label: "EMA7", color: "#db2777" },
  { key: "ema25", label: "EMA25", color: "#e11d48" },
  { key: "bollinger", label: "BOLL", color: "#f43f5e" },
  { key: "rsi", label: "RSI", color: "#c026d3" },
  { key: "macd", label: "MACD", color: "#ec4899" },
  { key: "volume", label: "VOL", color: "#6b7280" },
];

export function IndicatorToolbar({ indicators, onChange }: IndicatorToolbarProps) {
  const toggle = (key: keyof ActiveIndicators) => {
    onChange({ ...indicators, [key]: !indicators[key] });
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {INDICATOR_BUTTONS.map(({ key, label, color }) => (
        <button
          key={key}
          type="button"
          onClick={() => toggle(key)}
          className={`rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
            indicators[key]
              ? "border-transparent text-white"
              : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-900"
          }`}
          style={indicators[key] ? { backgroundColor: color } : undefined}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
