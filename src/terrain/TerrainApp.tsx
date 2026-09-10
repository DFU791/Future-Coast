import { useState } from 'react'
import TerrainControls, { type TerrainScale } from './TerrainControls'
import TerrainMap, { type TerrainReadout, type TerrainStatus } from './TerrainMap'

const TERRAIN_SCALES: TerrainScale[] = [
  { label: '真实', value: 1 },
  { label: '清晰', value: 1.6 },
  { label: '强调', value: 2.2 },
]

function statusLabel(status: TerrainStatus) {
  if (status === 'ready') return '地形已加载'
  if (status === 'error') return '地形数据连接失败'
  return '正在载入地形'
}

export default function TerrainApp() {
  const [terrainScale, setTerrainScale] = useState(1.6)
  const [status, setStatus] = useState<TerrainStatus>('loading')
  const [readout, setReadout] = useState<TerrainReadout | null>(null)

  return (
    <div className="h-full w-full overflow-hidden bg-[#E8EEEF] p-4">
      <main className="relative h-full w-full overflow-hidden rounded-[30px] border border-white/80 bg-[#DCEBF0] shadow-[0_24px_80px_rgba(30,48,40,0.16)]">
        <TerrainMap
          exaggeration={terrainScale}
          onStatusChange={setStatus}
          onReadoutChange={setReadout}
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'radial-gradient(ellipse 78% 72% at 50% 48%, transparent 42%, rgba(241,245,241,0.10) 70%, rgba(241,245,241,0.55) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-white/55 to-transparent"
        />

        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-9 pt-7">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-[#18231E]">Future Coast</h1>
            <p className="mt-1 text-sm text-[#6F7F77]">中国地形高度视图</p>
          </div>

          <nav className="pointer-events-auto absolute left-1/2 top-6 -translate-x-1/2 rounded-full border border-white/80 bg-white/76 p-1 shadow-[0_10px_32px_rgba(49,67,58,0.13)] backdrop-blur-xl" aria-label="视图切换">
            <a
              href="/"
              className="inline-flex min-w-[78px] items-center justify-center rounded-full px-4 py-2 text-xs font-medium text-[#728078] transition-colors hover:text-[#26362D]"
            >
              海平面
            </a>
            <span className="inline-flex min-w-[78px] items-center justify-center rounded-full bg-[#20382C] px-4 py-2 text-xs font-semibold text-white shadow-[0_3px_12px_rgba(32,56,44,0.22)]">
              地形
            </span>
          </nav>

          <div className="rounded-full border border-white/80 bg-white/68 px-3.5 py-2 text-[11px] font-medium text-[#607168] shadow-[0_8px_26px_rgba(49,67,58,0.10)] backdrop-blur-xl">
            <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${status === 'error' ? 'bg-[#C87062]' : status === 'ready' ? 'bg-[#4C9A70]' : 'animate-pulse bg-[#8FA398]'}`} />
            {statusLabel(status)}
          </div>
        </header>

        <div className="pointer-events-none absolute bottom-8 left-8 z-20">
          <div className="rounded-lg border border-white/80 bg-white/72 px-4 py-3 shadow-[0_12px_34px_rgba(45,64,54,0.12)] backdrop-blur-xl">
            <div className="text-[10px] font-medium text-[#7D8B84]">指针位置</div>
            {readout ? (
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-lg font-semibold tabular-nums text-[#23332A]">
                  {Math.round(readout.elevation).toLocaleString('zh-CN')} m
                </span>
                <span className="text-[10px] tabular-nums text-[#87958E]">
                  {readout.longitude.toFixed(2)}°, {readout.latitude.toFixed(2)}°
                </span>
              </div>
            ) : (
              <div className="mt-1 text-xs text-[#87958E]">移动鼠标查看海拔</div>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-8 left-1/2 z-20 -translate-x-1/2">
          <div className="pointer-events-auto rounded-[22px] border border-white/80 bg-white/76 px-5 py-3.5 shadow-[0_14px_40px_rgba(45,64,54,0.13)] backdrop-blur-xl">
            <TerrainControls
              scales={TERRAIN_SCALES}
              selectedScale={terrainScale}
              onScaleChange={setTerrainScale}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
