'use client';

interface SliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
}

export default function Slider({ label, value, min, max, step = 1, onChange, unit }: SliderProps) {
  const percent = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const display = Number.isInteger(step) ? Math.round(value) : parseFloat(value.toFixed(2));

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-[9px] font-semibold text-gray-900/40 dark:text-white/35 uppercase tracking-[0.08em]">
            {label}
          </span>
          <span className="text-[10px] font-mono text-gray-900 dark:text-white bg-black/[0.06] dark:bg-white/[0.08] px-1.5 py-px rounded-md tabular-nums leading-relaxed">
            {display}{unit}
          </span>
        </div>
      )}

      {/* Visual track + invisible native input layered on top */}
      <div className="relative h-5 flex items-center">
        {/* Track background */}
        <div className="absolute left-0 right-0 h-[3px] rounded-full bg-black/[0.1] dark:bg-white/[0.1] overflow-hidden">
          <div
            className="h-full rounded-full bg-gray-900 dark:bg-white transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
        {/* Native range input — transparent, sits on top for interaction */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
          style={{ height: '20px' }}
        />
        {/* Thumb indicator */}
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-gray-900 dark:bg-white shadow-sm border-2 border-white dark:border-[#111] pointer-events-none transition-none"
          style={{ left: `calc(${percent}% - 7px)` }}
        />
      </div>
    </div>
  );
}
