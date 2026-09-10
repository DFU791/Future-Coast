import { SEA_LEVEL_SCENARIOS, type SeaLevelScenarioId } from '../data/seaLevelScenarios'
import { formatSeaLevel } from '../utils/seaLevelScenario'

interface ScenarioYearSliderProps {
  year: number
  minYear: number
  maxYear: number
  seaLevel: number
  scenarioId: SeaLevelScenarioId
  isPlaying: boolean
  onYearChange: (year: number) => void
  onScenarioChange: (scenarioId: SeaLevelScenarioId) => void
  onTogglePlay: () => void
}

export default function ScenarioYearSlider({
  year,
  minYear,
  maxYear,
  seaLevel,
  scenarioId,
  isPlaying,
  onYearChange,
  onScenarioChange,
  onTogglePlay,
}: ScenarioYearSliderProps) {
  const progress = ((year - minYear) / (maxYear - minYear)) * 100
  const activeScenario = SEA_LEVEL_SCENARIOS.find((scenario) => scenario.id === scenarioId)

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-[#7E8AA0]">未来变化程度</span>
          <div className="flex rounded-full border border-[#DDE6F1] bg-[#F8FAFD] p-1">
            {SEA_LEVEL_SCENARIOS.map((scenario) => {
              const active = scenario.id === scenarioId
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => onScenarioChange(scenario.id)}
                  className={[
                    'rounded-full px-3.5 py-1.5 text-xs font-medium transition',
                    active
                      ? 'bg-white text-[#0F172A] shadow-[0_6px_18px_rgba(15,23,42,0.10)]'
                      : 'text-[#718096] hover:text-[#0F172A]',
                  ].join(' ')}
                >
                  {scenario.shortLabel}
                </button>
              )
            })}
          </div>
        </div>

        <div className="max-w-[360px] text-right">
          <p className="text-[11px] font-medium leading-4 text-[#7E8AA0]">
            {activeScenario?.description}
          </p>
          <p className="text-[10px] leading-4 text-[#A0AABA]">IPCC AR6 / NASA projection dataset</p>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={onTogglePlay}
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#111827] shadow-[0_10px_28px_rgba(15,23,42,0.14)] ring-1 ring-[#DDE5EF] transition hover:bg-[#F8FAFC]"
          aria-label={isPlaying ? '暂停播放' : '播放'}
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="3.2" y="2.2" width="3.4" height="11.6" rx="0.9" />
              <rect x="9.4" y="2.2" width="3.4" height="11.6" rx="0.9" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M4.2 2.7v10.6c0 .55.6.9 1.08.62l8.35-5.3a.74.74 0 0 0 0-1.24L5.28 2.08A.72.72 0 0 0 4.2 2.7z" />
            </svg>
          )}
        </button>

        <div className="flex h-12 min-w-28 items-center justify-center rounded-2xl bg-[#111827] px-5 text-base font-semibold tabular-nums text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
          {year}
        </div>

        <div className="relative flex-1">
          <div className="relative h-1.5 rounded-full bg-[#D7DCE4]">
            <div
              className="absolute h-full rounded-full bg-[#2488FF]"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="mt-3 flex justify-between text-[11px] text-[#7E8AA0]">
            <span>2025</span>
            <span>2050</span>
            <span>2100</span>
            <span>2150</span>
            <span>2200</span>
          </div>

          <input
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={year}
            onChange={(event) => onYearChange(Number(event.target.value))}
            className="absolute -top-3 inset-x-0 h-7 w-full cursor-pointer opacity-0"
            aria-label="年份"
          />

          <div
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-white bg-[#2488FF] shadow-[0_8px_20px_rgba(36,136,255,0.36)]"
            style={{ left: `${progress}%`, top: '-7px' }}
          />
        </div>

        <div className="min-w-24 text-right">
          <div className="text-sm font-semibold tabular-nums text-[#111827]">
            +{formatSeaLevel(seaLevel)}m
          </div>
          <div className="text-[11px] text-[#7E8AA0]">海平面上升</div>
        </div>
      </div>
    </div>
  )
}
