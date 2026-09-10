export type SeaLevelScenarioId = 'ssp126' | 'ssp245' | 'ssp585' | 'ssp585HighImpact'

export type SeaLevelAnchor = {
  year: number
  seaLevel: number
  note?: string
}

export type SeaLevelScenario = {
  id: SeaLevelScenarioId
  shortLabel: string
  label: string
  description: string
  confidence: string
  sourceLabel: string
  sourceUrl: string
  anchors: SeaLevelAnchor[]
}

const SOURCE_URL = 'https://www.ipcc.ch/report/ar6/wg1/'

/*
 * Values are metres of global mean sea-level rise relative to the app's 2025
 * starting point. IPCC AR6 SPM reports likely ranges relative to 1995-2014
 * for 2100 and 2150; this MVP uses the midpoint of each reported range and
 * subtracts an approximate 2025 offset of 0.06 m so the slider starts at 0.
 */
export const SEA_LEVEL_SCENARIOS: SeaLevelScenario[] = [
  {
    id: 'ssp126',
    shortLabel: '轻度',
    label: '轻度变化',
    description: '全球大幅节能减排',
    confidence: 'IPCC AR6 likely range midpoint',
    sourceLabel: 'IPCC AR6 WGI SPM B.5.3',
    sourceUrl: SOURCE_URL,
    anchors: [
      { year: 2025, seaLevel: 0 },
      { year: 2100, seaLevel: 0.41, note: '2100 likely range 0.32-0.62 m relative to 1995-2014' },
      { year: 2150, seaLevel: 0.67, note: '2150 likely range 0.46-0.99 m relative to 1995-2014' },
      { year: 2200, seaLevel: 0.93, note: 'visual extrapolation from the 2100-2150 trend' },
    ],
  },
  {
    id: 'ssp245',
    shortLabel: '中度',
    label: '中度变化',
    description: '减排行动逐步推进',
    confidence: 'IPCC AR6 likely range midpoint',
    sourceLabel: 'IPCC AR6 WGI SPM B.5.3',
    sourceUrl: SOURCE_URL,
    anchors: [
      { year: 2025, seaLevel: 0 },
      { year: 2100, seaLevel: 0.54, note: '2100 likely range 0.44-0.76 m relative to 1995-2014' },
      { year: 2150, seaLevel: 0.94, note: '2150 likely range 0.66-1.33 m relative to 1995-2014' },
      { year: 2200, seaLevel: 1.34, note: 'visual extrapolation from the 2100-2150 trend' },
    ],
  },
  {
    id: 'ssp585',
    shortLabel: '严重',
    label: '严重变化',
    description: '温室气体排放持续处于高位，全球变暖加剧',
    confidence: 'IPCC AR6 likely range midpoint',
    sourceLabel: 'IPCC AR6 WGI SPM B.5.3',
    sourceUrl: SOURCE_URL,
    anchors: [
      { year: 2025, seaLevel: 0 },
      { year: 2100, seaLevel: 0.76, note: '2100 likely range 0.63-1.01 m relative to 1995-2014' },
      { year: 2150, seaLevel: 1.37, note: '2150 likely range 0.98-1.88 m relative to 1995-2014' },
      { year: 2200, seaLevel: 1.98, note: 'visual extrapolation from the 2100-2150 trend' },
    ],
  },
  {
    id: 'ssp585HighImpact',
    shortLabel: '极端',
    label: '极端变化',
    description: '较坏情况下的海平面上升上限',
    confidence: 'low confidence, cannot be ruled out',
    sourceLabel: 'IPCC AR6 WGI SPM B.5.3',
    sourceUrl: SOURCE_URL,
    anchors: [
      { year: 2025, seaLevel: 0 },
      { year: 2100, seaLevel: 1.94, note: 'IPCC states approaching 2 m by 2100 cannot be ruled out' },
      { year: 2150, seaLevel: 4.94, note: 'IPCC states approaching 5 m by 2150 cannot be ruled out' },
      { year: 2200, seaLevel: 7.94, note: 'visual extrapolation from the 2100-2150 high-risk storyline' },
    ],
  },
]

export const DEFAULT_SEA_LEVEL_SCENARIO_ID: SeaLevelScenarioId = 'ssp585HighImpact'
