import {
  DEFAULT_SEA_LEVEL_SCENARIO_ID,
  SEA_LEVEL_SCENARIOS,
  type SeaLevelScenario,
  type SeaLevelScenarioId,
} from '../data/seaLevelScenarios'

export const MIN_YEAR = 2025
export const MAX_YEAR = 2200

export function getScenario(id: SeaLevelScenarioId): SeaLevelScenario {
  return SEA_LEVEL_SCENARIOS.find((scenario) => scenario.id === id) ?? SEA_LEVEL_SCENARIOS[0]
}

export function getDefaultScenario(): SeaLevelScenario {
  return getScenario(DEFAULT_SEA_LEVEL_SCENARIO_ID)
}

function easeBetweenAnchors(progress: number): number {
  return progress * progress * (3 - 2 * progress)
}

export function seaLevelForYear(year: number, scenarioId: SeaLevelScenarioId = DEFAULT_SEA_LEVEL_SCENARIO_ID): number {
  const scenario = getScenario(scenarioId)
  const anchors = scenario.anchors

  if (year <= anchors[0].year) return anchors[0].seaLevel

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const start = anchors[i]
    const end = anchors[i + 1]
    if (year >= start.year && year <= end.year) {
      const progress = (year - start.year) / (end.year - start.year)
      const eased = easeBetweenAnchors(progress)
      return start.seaLevel + (end.seaLevel - start.seaLevel) * eased
    }
  }

  return anchors[anchors.length - 1].seaLevel
}

export function formatSeaLevel(value: number): string {
  if (value < 0.1) return value.toFixed(2)
  if (value < 1) return value.toFixed(2)
  return value.toFixed(1)
}
