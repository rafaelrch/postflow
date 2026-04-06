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
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <div className="flex justify-between">
          <span className="text-[10px] text-gray-900/40 dark:text-white/40 uppercase tracking-wider">{label}</span>
          <span className="text-[10px] text-gray-900/60 dark:text-white/60 font-mono">{value}{unit}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
