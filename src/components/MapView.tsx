import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import chinaGeo from '../data/china-geo.json'
import worldLand from '../data/world-land.json'
import nationalFloodTiles from '../data/terrain/nationalFloodTiles.json'
import { createFloodWaterLayer, type FloodWaterLayer } from '../utils/createFloodWaterLayer'

const OCEAN_COLOR = '#E3F2FA'
const WORLD_LAND_COLOR = '#F8FAFC'
const CHINA_LAND_COLOR = '#FFFFFF'
const WORLD_BORDER_COLOR = '#D2DCE9'
const BORDER_COLOR = '#BFCBDD'
const GLOW_ORIGIN: [number, number] = [105, 34]
const PROVINCE_LABEL_MIN_ZOOM = 4.1
const PROVINCE_LABEL_FULL_ZOOM = 4.5
const ANTARCTICA_DISPLAY_MIN_LATITUDE = -84.8
const SOUTH_CHINA_SEA_BOUNDARY_ADCODE = '100000_JD'

interface MapViewProps {
  seaLevel: number
}

type NationalFloodTile = {
  id: string
  coreBounds: [number, number, number, number]
  textureUrl: string
  maxLevel: number
}

const NATIONAL_FLOOD_TILES = (nationalFloodTiles as unknown as { tiles: NationalFloodTile[] }).tiles

function normalizeAntarctica(feature: GeoJSON.Feature): GeoJSON.Feature {
  if (feature.geometry?.type !== 'MultiPolygon') return feature

  const clampPolarPosition = (position: GeoJSON.Position): GeoJSON.Position => [
    position[0],
    Math.max(position[1], ANTARCTICA_DISPLAY_MIN_LATITUDE),
    ...position.slice(2),
  ]

  const polarPolygonIndex = feature.geometry.coordinates.findIndex((polygon) => (
    polygon.length >= 4
    && polygon[0].every((position) => position[1] < -89)
    && polygon[1].every((position) => position[1] < -89)
  ))
  if (polarPolygonIndex < 0) return feature

  const polarPolygon = feature.geometry.coordinates[polarPolygonIndex]
  const continentHalves = polarPolygon.slice(2).map((ring) => {
    const wrapJumpIndex = ring.findIndex((position, index) => (
      index > 0 && Math.abs(position[0] - ring[index - 1][0]) > 90
    ))
    const coastlineEnd = wrapJumpIndex > 0 ? wrapJumpIndex : ring.length - 1
    const coastline = ring.slice(0, coastlineEnd).map(clampPolarPosition)
    const first = coastline[0]
    const isEasternHalf = first[0] >= 0
    const polarEdge: GeoJSON.Position[] = isEasternHalf
      ? [[180, ANTARCTICA_DISPLAY_MIN_LATITUDE], [0, ANTARCTICA_DISPLAY_MIN_LATITUDE]]
      : [[0, ANTARCTICA_DISPLAY_MIN_LATITUDE], [-180, ANTARCTICA_DISPLAY_MIN_LATITUDE]]

    return [[...coastline, ...polarEdge, first]]
  })

  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: [
        ...feature.geometry.coordinates
          .filter((_, index) => index !== polarPolygonIndex)
          .map((polygon) => polygon.map((ring) => ring.map(clampPolarPosition))),
        ...continentHalves,
      ],
    },
  }
}

const CHINA_PROVINCES: GeoJSON.FeatureCollection = {
  ...(chinaGeo as unknown as GeoJSON.FeatureCollection),
  features: (chinaGeo as unknown as GeoJSON.FeatureCollection).features.filter(
    (feature) => feature.properties?.adcode !== SOUTH_CHINA_SEA_BOUNDARY_ADCODE,
  ),
}

// China is drawn from the higher-detail provincial source below. Excluding its
// coarse global-country polygon keeps the coastline and province boundaries crisp.
const WORLD_LAND_EXCLUDING_CHINA: GeoJSON.FeatureCollection = {
  ...(worldLand as unknown as GeoJSON.FeatureCollection),
  features: (worldLand as unknown as GeoJSON.FeatureCollection).features.flatMap((feature) => {
    if (feature.properties?.name === 'China') return []
    if (feature.properties?.name === 'Antarctica') return [normalizeAntarctica(feature)]
    return [feature]
  }),
}

const PROVINCE_LABELS = CHINA_PROVINCES.features.flatMap((feature) => {
  const properties = feature.properties
  if (!properties) return []
  const coordinates = properties.centroid ?? properties.center
  if (!properties.name || !coordinates) return []

  const name = properties.name
    .replace('特别行政区', '')
    .replace('维吾尔自治区', '')
    .replace('壮族自治区', '')
    .replace('回族自治区', '')
    .replace('自治区', '')
    .replace('省', '')
    .replace('市', '')

  return [{ coordinates: coordinates as [number, number], name }]
})

function coordinatesForBounds([west, south, east, north]: NationalFloodTile['coreBounds']) {
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ] as [[number, number], [number, number], [number, number], [number, number]]
}

export default function MapView({ seaLevel }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const oceanGlow = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const floodWaterLayers = useRef<FloodWaterLayer[]>([])

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'world-land': {
            type: 'geojson',
            data: WORLD_LAND_EXCLUDING_CHINA,
          },
          china: {
            type: 'geojson',
            data: CHINA_PROVINCES,
          },
        },
        layers: [
          {
            id: 'world-land-fill',
            type: 'fill',
            source: 'world-land',
            paint: {
              'fill-color': WORLD_LAND_COLOR,
              'fill-opacity': 0.9,
            },
          },
          {
            id: 'world-land-outline',
            type: 'line',
            source: 'world-land',
            paint: {
              'line-color': WORLD_BORDER_COLOR,
              'line-width': 0.5,
              'line-opacity': 0.24,
            },
          },
          {
            id: 'province-fill',
            type: 'fill',
            source: 'china',
            paint: {
              'fill-color': CHINA_LAND_COLOR,
              'fill-opacity': 1,
            },
          },
          {
            id: 'province-border',
            type: 'line',
            source: 'china',
            paint: {
              'line-color': BORDER_COLOR,
              'line-width': 0.48,
              'line-opacity': 0.56,
            },
          },
        ],
      },
      center: [105, 34],
      zoom: 3.15,
      minZoom: 1.1,
      maxZoom: 8,
      interactive: true,
      dragPan: true,
      scrollZoom: true,
      doubleClickZoom: true,
      keyboard: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
      touchPitch: false,
      renderWorldCopies: false,
      attributionControl: false,
    })

    map.current.touchZoomRotate.disableRotation()

    const provinceLabels = PROVINCE_LABELS.map(({ coordinates, name }) => {
      const element = document.createElement('div')
      element.className = 'province-map-label'
      element.textContent = name
      element.setAttribute('aria-hidden', 'true')
      const marker = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat(coordinates)
        .addTo(map.current!)
      return { element, marker }
    })

    const updateProvinceLabels = () => {
      const zoom = map.current?.getZoom() ?? 0
      const progress = Math.max(
        0,
        Math.min(1, (zoom - PROVINCE_LABEL_MIN_ZOOM) / (PROVINCE_LABEL_FULL_ZOOM - PROVINCE_LABEL_MIN_ZOOM)),
      )
      provinceLabels.forEach(({ element }) => {
        element.style.opacity = String(progress)
        element.style.visibility = progress > 0 ? 'visible' : 'hidden'
      })
    }
    map.current.on('zoom', updateProvinceLabels)

    const updateOceanGlow = () => {
      const position = map.current?.project(GLOW_ORIGIN)
      if (!position || !oceanGlow.current) return

      oceanGlow.current.style.setProperty('--glow-x', `${position.x}px`)
      oceanGlow.current.style.setProperty('--glow-y', `${position.y}px`)
    }
    map.current.on('move', updateOceanGlow)

    map.current.once('load', () => {
      floodWaterLayers.current = NATIONAL_FLOOD_TILES.map((tile) => createFloodWaterLayer({
        id: `national-flood-${tile.id}`,
        coordinates: coordinatesForBounds(tile.coreBounds),
        textureUrl: tile.textureUrl,
        maxLevel: tile.maxLevel,
        seaLevel,
      }))

      floodWaterLayers.current.forEach((layer) => {
        map.current?.addLayer(layer, 'province-border')
      })
    })

    map.current.fitBounds(
      [
        [73, 17],
        [135, 54],
      ],
      {
        padding: { top: 110, bottom: 170, left: 95, right: 95 },
        duration: 0,
      },
    )
    updateOceanGlow()
    updateProvinceLabels()

    return () => {
      map.current?.off('move', updateOceanGlow)
      map.current?.off('zoom', updateProvinceLabels)
      provinceLabels.forEach(({ marker }) => marker.remove())
      map.current?.remove()
      map.current = null
      floodWaterLayers.current = []
    }
  }, [])

  useEffect(() => {
    floodWaterLayers.current.forEach((layer) => layer.setSeaLevel(seaLevel))
  }, [seaLevel])

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: OCEAN_COLOR }}>
      <div
        ref={oceanGlow}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 78% 68% at var(--glow-x) var(--glow-y), rgba(38, 139, 255, 0.66) 0%, rgba(89, 171, 255, 0.38) 27%, rgba(168, 215, 251, 0.16) 54%, rgba(227, 242, 250, 0) 79%)',
        }}
      />
      <div ref={mapContainer} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
