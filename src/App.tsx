import { useEffect, useRef, useState } from 'react'
import CityImpactPanel from './components/CityImpactPanel'
import InteractionGuide from './components/InteractionGuide'
import MapView from './components/MapView'
import ScenarioYearSlider from './components/ScenarioYearSlider'
import { DEFAULT_SEA_LEVEL_SCENARIO_ID, type SeaLevelScenarioId } from './data/seaLevelScenarios'
import {
  formatSeaLevel,
  getScenario,
  MAX_YEAR,
  MIN_YEAR,
  seaLevelForYear,
} from './utils/seaLevelScenario'

function App() {
  const [year, setYear] = useState(2100)
  const [scenarioId, setScenarioId] = useState<SeaLevelScenarioId>(DEFAULT_SEA_LEVEL_SCENARIO_ID)
  const [isPlaying, setIsPlaying] = useState(false)
  const yearRef = useRef(year)
  const seaLevel = seaLevelForYear(year, scenarioId)
  const scenario = getScenario(scenarioId)

  useEffect(() => {
    yearRef.current = year
  }, [year])

  useEffect(() => {
    if (!isPlaying) return

    const timer = window.setInterval(() => {
      setYear((currentYear) => {
        if (currentYear >= MAX_YEAR) {
          window.clearInterval(timer)
          setIsPlaying(false)
          return MAX_YEAR
        }
        return currentYear + 1
      })
    }, 70)

    return () => window.clearInterval(timer)
  }, [isPlaying])

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false)
      return
    }

    if (yearRef.current >= MAX_YEAR) {
      setYear(MIN_YEAR)
    }
    setIsPlaying(true)
  }

  return (
    <div className="h-full w-full overflow-hidden bg-[#F1F4F8] p-4">
      <main className="relative h-full w-full overflow-hidden rounded-[30px] border border-white/80 bg-[#F7F8FA] shadow-[0_24px_80px_rgba(15,23,42,0.13)]">
        <div className="absolute inset-0 z-10">
          <MapView seaLevel={seaLevel} />
        </div>

        <div
          className="pointer-events-none absolute inset-0 z-[15]"
          style={{
            background:
              'radial-gradient(ellipse 74% 68% at 50% 48%, transparent 40%, rgba(247,248,250,0.38) 72%, rgba(247,248,250,0.96) 100%)',
          }}
        />

        <div
          className="pointer-events-none absolute inset-0 z-[15]"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.60) 0%, transparent 16%, transparent 76%, rgba(255,255,255,0.52) 100%)',
          }}
        />

        <div className="pointer-events-none absolute left-0 top-0 z-20 pl-9 pt-7">
          <h1 className="text-2xl font-semibold tracking-normal text-[#111827]">
            Future Coast
          </h1>
          <p className="mt-1 text-sm text-[#7E8AA0]">
            全球变暖，海平面上升后的中国沿海情景
          </p>
        </div>

        <CityImpactPanel seaLevel={seaLevel} />
        <InteractionGuide />

        <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 pt-5">
          <div className="text-6xl font-bold leading-none tracking-normal text-[#111827] tabular-nums">
            {year}
          </div>
          <p className="mt-2 text-center text-sm font-medium text-[#7E8AA0]">
            +{formatSeaLevel(seaLevel)}m 海平面上升
          </p>
          <p className="mt-1 text-center text-[11px] text-[#9AA6B6]">
            {scenario.label}
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-[#F7F8FA]/90 via-[#F7F8FA]/42 to-transparent px-8 pb-8 pt-10">
          <div className="mx-auto max-w-6xl rounded-[28px] border border-white/70 bg-white/76 px-7 py-5 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
            <ScenarioYearSlider
              year={year}
              minYear={MIN_YEAR}
              maxYear={MAX_YEAR}
              seaLevel={seaLevel}
              scenarioId={scenarioId}
              isPlaying={isPlaying}
              onYearChange={setYear}
              onScenarioChange={setScenarioId}
              onTogglePlay={togglePlay}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
