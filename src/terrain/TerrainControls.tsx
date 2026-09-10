export type TerrainScale = {
  label: string
  value: number
}

interface TerrainControlsProps {
  scales: TerrainScale[]
  selectedScale: number
  onScaleChange: (scale: number) => void
}

export default function TerrainControls({
  scales,
  selectedScale,
  onScaleChange,
}: TerrainControlsProps) {
  return (
    <div className="flex items-center gap-5">
      <div>
        <div className="text-[10px] font-medium text-[#768492]">地形起伏</div>
        <div className="mt-0.5 text-xs font-semibold tabular-nums text-[#22312B]">
          {selectedScale.toFixed(1)}× 垂直比例
        </div>
      </div>
      <div className="flex rounded-full border border-white/80 bg-[#EDF2F0]/88 p-1 shadow-inner">
        {scales.map((scale) => {
          const isSelected = scale.value === selectedScale
          return (
            <button
              key={scale.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onScaleChange(scale.value)}
              className={`min-w-[58px] rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                isSelected
                  ? 'bg-white text-[#22312B] shadow-[0_2px_9px_rgba(42,62,53,0.12)]'
                  : 'text-[#77857E] hover:text-[#34463D]'
              }`}
            >
              {scale.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
