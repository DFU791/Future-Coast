import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

const GUIDE_ITEMS = [
  {
    title: '移动地图',
    description: '按住并拖动地图，查看不同沿海区域。',
  },
  {
    title: '缩放视野',
    description: '使用鼠标滚轮缩放地图，查看沿海地区细节。',
  },
  {
    title: '调整年份',
    description: '拖动时间轴，观察海平面和潜在受影响区域的连续变化。',
  },
  {
    title: '自动播放',
    description: '点击播放按钮，自动演示 2025—2200 年的变化过程。',
  },
  {
    title: '切换情景',
    description: '选择不同排放情景，对比未来海平面变化路径。',
  },
  {
    title: '跟踪城市',
    description: '点击城市条目进行跟踪，并查看实时排名和影响比例。',
  },
]

export default function InteractionGuide() {
  const [isOpen, setIsOpen] = useState(false)
  const guideRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!guideRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={guideRef} className="absolute bottom-8 right-8 z-30">
      <AnimatePresence>
        {isOpen && (
          <motion.section
            id="interaction-guide"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-14 right-0 w-[360px] overflow-hidden rounded-[22px] border border-white/80 bg-white/88 shadow-[0_18px_60px_rgba(15,23,42,0.14)] backdrop-blur-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#E8EDF4] px-5 py-4">
              <div>
                <h2 className="text-[17px] font-semibold tracking-normal text-[#111827]">
                  探索 Future Coast
                </h2>
                <p className="mt-1 text-xs text-[#8A97AA]">建议使用电脑端浏览器查看</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-[#7E8AA0] transition-colors hover:bg-[#EEF3FA] hover:text-[#111827] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4385F5]/45"
                aria-label="关闭操作说明"
                title="关闭"
              >
                ×
              </button>
            </header>

            <div className="space-y-3.5 px-5 py-4">
              {GUIDE_ITEMS.map((item) => (
                <div key={item.title} className="grid grid-cols-[6px_1fr] gap-3">
                  <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[#4385F5]" />
                  <div>
                    <h3 className="text-[13px] font-semibold tracking-normal text-[#243147]">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 text-xs leading-5 text-[#7E8AA0]">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="border-t border-[#E8EDF4] bg-[#F8FAFD]/80 px-5 py-3 text-[10px] leading-4 text-[#96A2B3]">
              本项目为概念可视化，展示基于高程和海洋连通性的潜在影响，不代表实际灾害预测。
            </p>
          </motion.section>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`flex h-11 items-center justify-center gap-2 rounded-full border px-4 shadow-[0_10px_28px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4385F5]/45 ${
          isOpen
            ? 'border-[#4385F5]/30 bg-[#4385F5] text-white'
            : 'border-white/80 bg-white/84 text-[#66758C] hover:bg-white hover:text-[#4385F5]'
        }`}
        aria-expanded={isOpen}
        aria-controls="interaction-guide"
        aria-label="打开操作说明"
        title="操作说明"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current font-serif text-[13px] font-semibold leading-none">
          i
        </span>
        <span className="text-[13px] font-medium tracking-normal">操作说明</span>
      </button>
    </div>
  )
}
