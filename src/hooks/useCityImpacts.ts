import { useMemo } from 'react'
import cityImpactStats from '../data/terrain/cityImpactStats.json'
import type { CityImpact, CityImpactStatsCity, CityImpactStatsData } from '../types/cityImpact'

const STATS = cityImpactStats as unknown as CityImpactStatsData
const MIN_FLOODED_RATIO = 1

function floodedAreaAtLevel(city: CityImpactStatsCity, seaLevel: number): number {
  const clampedLevel = Math.max(0, Math.min(STATS.maxLevel, seaLevel))
  const position = clampedLevel / STATS.levelStep
  const lowerIndex = Math.min(city.floodedAreaKm2.length - 1, Math.floor(position))
  const upperIndex = Math.min(city.floodedAreaKm2.length - 1, lowerIndex + 1)
  const progress = position - lowerIndex
  const lowerArea = city.floodedAreaKm2[lowerIndex]
  const upperArea = city.floodedAreaKm2[upperIndex]
  return lowerArea + (upperArea - lowerArea) * progress
}

export function useCityImpacts(seaLevel: number, selectedCityId: string | null = null) {
  return useMemo(() => {
    const rankedImpacts = STATS.cities
      .map<CityImpact>((city) => {
        const floodedAreaKm2 = floodedAreaAtLevel(city, seaLevel)
        const floodedRatio = Math.min(100, floodedAreaKm2 / city.totalAreaKm2 * 100)
        return {
          id: city.id,
          name: city.name,
          province: city.province,
          floodedAreaKm2,
          floodedRatio,
          rank: 0,
          qualifies: floodedRatio >= MIN_FLOODED_RATIO,
        }
      })
      .sort((first, second) => second.floodedRatio - first.floodedRatio)
      .map((city, index) => ({ ...city, rank: index + 1 }))

    const impacts = rankedImpacts.filter(
      (city) => city.qualifies || city.id === selectedCityId,
    )

    return {
      cities: impacts,
      totalCount: rankedImpacts.filter((city) => city.qualifies).length,
    }
  }, [seaLevel, selectedCityId])
}
