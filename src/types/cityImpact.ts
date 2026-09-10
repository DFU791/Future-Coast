export type CityImpactStatsCity = {
  id: string
  name: string
  fullName: string
  province: string
  center: [number, number]
  totalAreaKm2: number
  coverage: number
  floodedAreaKm2: number[]
}

export type CityImpactStatsData = {
  version: number
  maxLevel: number
  levelStep: number
  levels: number[]
  cities: CityImpactStatsCity[]
}

export type CityImpact = {
  id: string
  name: string
  province: string
  floodedAreaKm2: number
  floodedRatio: number
  rank: number
  qualifies: boolean
}
