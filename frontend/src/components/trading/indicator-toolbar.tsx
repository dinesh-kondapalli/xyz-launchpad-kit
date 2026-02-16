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
  { key: "sma7", label: "MA7", color: "#f59e0b" },
  { key: "sma25", label: "MA25", color: "#3b82f6" },
  { key: "sma99", label: "MA99", color: "#a855f7" },
  { key: "ema7", label: "EMA7", color: "#f97316" },
  { key: "ema25", label: "EMA25", color: "#06b6d4" },
  { key: "bollinger", label: "BOLL", color: "#ec4899" },
  { key: "rsi", label: "RSI", color: "#10b981" },
  { key: "macd", label: "MACD", color: "#8b5cf6" },
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
          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
            indicators[key]
              ? "text-white"
              : "text-muted-foreground bg-muted hover:bg-muted/80"
          }`}
          style={indicators[key] ? { backgroundColor: color } : undefined}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
