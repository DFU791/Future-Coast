import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useCityImpacts } from '../hooks/useCityImpacts'
import { formatSeaLevel } from '../utils/seaLevelScenario'

interface CityImpactPanelProps {
  seaLevel: number
}

interface AnimatedNumberProps {
  value: number
}

const layoutTransition = {
  type: 'spring' as const,
  stiffness: 330,
  damping: 32,
  mass: 0.78,
}

function AnimatedNumber({ value }: AnimatedNumberProps) {
  const displayedValue = useRef(value)
  const animationFrame = useRef<number | null>(null)
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const startValue = displayedValue.current
    const startTime = performance.now()
    const duration = 380

    const tick = (time: number) => {
      const progress = Math.min(1, (time - startTime) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextValue = startValue + (value - startValue) * eased
      displayedValue.current = nextValue
      setDisplay(nextValue)
      if (progress < 1) animationFrame.current = requestAnimationFrame(tick)
    }

    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current)
    animationFrame.current = requestAnimationFrame(tick)
    return () => {
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current)
    }
  }, [value])

  return <>{display.toFixed(1)}%</>
}

export default function CityImpactPanel({ seaLevel }: CityImpactPanelProps) {
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLUListElement | null>(null)
  const itemRefs = useRef(new Map<string, HTMLLIElement>())
  const selectedViewportOffset = useRef<number | null>(null)
  const { cities, totalCount } = useCityImpacts(seaLevel, selectedCityId)

  const rememberSelectedPosition = () => {
    if (!selectedCityId || !scrollRef.current) return
    const item = itemRefs.current.get(selectedCityId)
    if (item) selectedViewportOffset.current = item.offsetTop - scrollRef.current.scrollTop
  }

  const selectCity = (cityId: string) => {
    if (selectedCityId === cityId) {
      selectedViewportOffset.current = null
      setSelectedCityId(null)
      return
    }

    const item = itemRefs.current.get(cityId)
    const scroller = scrollRef.current
    selectedViewportOffset.current = item && scroller
      ? item.offsetTop - scroller.scrollTop
      : null
    setSelectedCityId(cityId)
  }

  useLayoutEffect(() => {
    if (!selectedCityId || !scrollRef.current) return
    const item = itemRefs.current.get(selectedCityId)
    if (!item) return

    if (selectedViewportOffset.current !== null) {
      scrollRef.current.scrollTop = item.offsetTop - selectedViewportOffset.current
    }
    selectedViewportOffset.current = item.offsetTop - scrollRef.current.scrollTop
  }, [cities, selectedCityId])

  return (
    <aside className="pointer-events-none absolute bottom-[210px] left-8 top-32 z-20 hidden w-[300px] md:block">
      <motion.div
        layout
        transition={{ layout: layoutTransition }}
        className="pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-lg border border-white/80 bg-white/72 shadow-[0_18px_54px_rgba(61,82,112,0.14)] backdrop-blur-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#DFE7F1]/75 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[#1A2535]">受影响的沿海城市</h2>
            <p className="mt-1 max-w-[178px] text-[10px] leading-4 text-[#8190A5]">
              受影响陆地面积达 1% 以上（积水、淹没）
            </p>
          </div>
          <div className="pt-0.5 text-right">
            <div className="text-xs font-semibold tabular-nums text-[#247FF0]">
              +{formatSeaLevel(seaLevel)}m
            </div>
            <div className="mt-1 text-[10px] text-[#9AA7B8]">当前水位</div>
          </div>
        </div>

        <LayoutGroup>
          <motion.ul
            ref={scrollRef}
            layout
            onScroll={rememberSelectedPosition}
            className="city-impact-scroll relative min-h-0 flex-1 overflow-y-auto px-5"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {cities.map((city) => {
                const isSelected = city.id === selectedCityId
                return (
                <motion.li
                  layout
                  key={city.id}
                  ref={(node) => {
                    if (node) itemRefs.current.set(city.id, node)
                    else itemRefs.current.delete(city.id)
                  }}
                  initial={{ opacity: 0, y: 9, scale: 0.985, filter: 'blur(7px)' }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -5, scale: 0.985, filter: 'blur(5px)' }}
                  transition={{
                    layout: layoutTransition,
                    opacity: { duration: 0.24 },
                    filter: { duration: 0.3 },
                    scale: { duration: 0.3 },
                    y: layoutTransition,
                  }}
                  className={`border-b transition-colors last:border-b-0 ${
                    isSelected
                      ? 'rounded-md border-transparent bg-[#EDF5FF]/90 shadow-[inset_0_0_0_1px_rgba(50,138,244,0.16)]'
                      : 'border-[#E5EBF2]/80'
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    title={isSelected ? '取消跟踪这座城市' : '跟踪这座城市的实时排名'}
                    onClick={() => selectCity(city.id)}
                    className="w-full px-2 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#328AF4]/45"
                  >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 flex-none rounded-full ${
                        isSelected
                          ? 'shadow-[0_0_0_4px_rgba(36,136,255,0.2)]'
                          : 'shadow-[0_0_0_4px_rgba(36,136,255,0.08)]'
                      }`}
                      style={{
                        backgroundColor: `rgba(36, 127, 240, ${Math.min(1, 0.5 + city.floodedRatio / 100 * 0.5)})`,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="truncate text-sm font-semibold text-[#1D2939]">{city.name}</span>
                          {isSelected && (
                            <motion.span
                              key={city.rank}
                              initial={{ opacity: 0, y: 3 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex-none text-[9px] font-medium tabular-nums text-[#247FF0]"
                            >
                              第 {city.rank} 名
                            </motion.span>
                          )}
                        </span>
                        <span className="flex-none text-sm font-semibold tabular-nums text-[#247FF0]">
                          <AnimatedNumber value={city.floodedRatio} />
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-[#8A98AA]">
                        <span className="truncate">
                          {city.province}
                          {isSelected && !city.qualifies ? ' · 未达 1%' : ''}
                        </span>
                        <span className="flex-none tabular-nums">
                          约 {Math.round(city.floodedAreaKm2).toLocaleString('zh-CN')} km²
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-[22px] mt-2.5 h-1 overflow-hidden rounded-full bg-[#E9EFF6]">
                    <motion.div
                      className="h-full rounded-full bg-[#328AF4]"
                      animate={{ width: `${Math.max(1.5, city.floodedRatio)}%` }}
                      transition={layoutTransition}
                    />
                  </div>
                  </button>
                </motion.li>
                )
              })}
            </AnimatePresence>
          </motion.ul>
        </LayoutGroup>

        {cities.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-5 py-7 text-center text-xs text-[#8A98AA]"
          >
            暂无城市达到 1% 影响阈值
          </motion.div>
        ) : (
          <div className="border-t border-[#DFE7F1]/75 px-5 py-3 text-center text-[11px] text-[#7F8EA2]">
            共 {totalCount} 座城市达到 1% 以上
          </div>
        )}
      </motion.div>
    </aside>
  )
}
