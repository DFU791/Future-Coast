import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import chinaGeo from '../data/china-geo.json'
import worldLand from '../data/world-land.json'

const TERRAIN_TILE_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'
const PROVINCE_LABEL_MIN_ZOOM = 4.15
const PROVINCE_LABEL_FULL_ZOOM = 4.65

export type TerrainStatus = 'loading' | 'ready' | 'error'

export type TerrainReadout = {
  longitude: number
  latitude: number
  elevation: number
}

interface TerrainMapProps {
  exaggeration: number
  onStatusChange: (status: TerrainStatus) => void
  onReadoutChange: (readout: TerrainReadout | null) => void
}

const WORLD_LAND_EXCLUDING_CHINA: GeoJSON.FeatureCollection = {
  ...worldLand,
  features: worldLand.features.filter((feature) => feature.properties?.name !== 'China'),
} as GeoJSON.FeatureCollection

const PROVINCE_LABELS = chinaGeo.features.flatMap((feature) => {
  const properties = feature.properties
  const coordinates = properties.centroid ?? properties.center
  if (!properties.name || !coordinates) return []

  return [{
    coordinates: coordinates as [number, number],
    name: properties.name
      .replace('特别行政区', '')
      .replace('维吾尔自治区', '')
      .replace('壮族自治区', '')
      .replace('回族自治区', '')
      .replace('自治区', '')
      .replace('省', '')
      .replace('市', ''),
  }]
})

export default function TerrainMap({
  exaggeration,
  onStatusChange,
  onReadoutChange,
}: TerrainMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const terrainMap = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          terrain: {
            type: 'raster-dem',
            tiles: [TERRAIN_TILE_URL],
            tileSize: 512,
            minzoom: 0,
            maxzoom: 12,
            encoding: 'terrarium',
            attribution: '© Mapterhorn · Copernicus DEM',
          },
          'world-land': {
            type: 'geojson',
            data: WORLD_LAND_EXCLUDING_CHINA,
          },
          china: {
            type: 'geojson',
            data: chinaGeo as GeoJSON.FeatureCollection,
          },
        },
        layers: [
          {
            id: 'ocean',
            type: 'background',
            paint: { 'background-color': '#DCEBF0' },
          },
          {
            id: 'world-land-fill',
            type: 'fill',
            source: 'world-land',
            paint: {
              'fill-color': '#DDE3D5',
              'fill-opacity': 0.9,
            },
          },
          {
            id: 'china-land-fill',
            type: 'fill',
            source: 'china',
            paint: {
              'fill-color': '#D3DEBF',
              'fill-opacity': 0.92,
            },
          },
          {
            id: 'terrain-shading',
            type: 'hillshade',
            source: 'terrain',
            paint: {
              'hillshade-exaggeration': 0.72,
              'hillshade-illumination-anchor': 'viewport',
              'hillshade-illumination-direction': 315,
              'hillshade-highlight-color': '#FBF8EC',
              'hillshade-shadow-color': '#2E4538',
              'hillshade-accent-color': '#71806B',
            },
          },
          {
            id: 'world-land-outline',
            type: 'line',
            source: 'world-land',
            paint: {
              'line-color': '#87968F',
              'line-width': 0.45,
              'line-opacity': 0.38,
            },
          },
          {
            id: 'province-border',
            type: 'line',
            source: 'china',
            paint: {
              'line-color': '#72827B',
              'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.45, 6, 0.9],
              'line-opacity': 0.62,
            },
          },
        ],
      },
      center: [104.5, 34.2],
      zoom: 3.2,
      pitch: 42,
      bearing: -8,
      minZoom: 1.4,
      maxZoom: 11,
      maxPitch: 72,
      renderWorldCopies: false,
      attributionControl: false,
    })

    map.current = terrainMap
    terrainMap.addControl(
      new maplibregl.NavigationControl({ showCompass: true, showZoom: true, visualizePitch: true }),
      'top-right',
    )
    terrainMap.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    const labels = PROVINCE_LABELS.map(({ coordinates, name }) => {
      const element = document.createElement('div')
      element.className = 'terrain-province-label'
      element.textContent = name
      element.setAttribute('aria-hidden', 'true')
      const marker = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat(coordinates)
        .addTo(terrainMap)
      return { element, marker }
    })

    const updateLabels = () => {
      const zoom = terrainMap.getZoom()
      const progress = Math.max(
        0,
        Math.min(1, (zoom - PROVINCE_LABEL_MIN_ZOOM) / (PROVINCE_LABEL_FULL_ZOOM - PROVINCE_LABEL_MIN_ZOOM)),
      )
      labels.forEach(({ element }) => {
        element.style.opacity = String(progress)
        element.style.visibility = progress > 0 ? 'visible' : 'hidden'
      })
    }

    const updateReadout = (event: maplibregl.MapMouseEvent) => {
      const elevation = terrainMap.queryTerrainElevation(event.lngLat)
      if (elevation === null) {
        onReadoutChange(null)
        return
      }
      onReadoutChange({
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
        elevation,
      })
    }

    terrainMap.on('style.load', () => {
      terrainMap.setTerrain({ source: 'terrain', exaggeration })
    })
    terrainMap.on('idle', () => {
      if (terrainMap.isSourceLoaded('terrain')) onStatusChange('ready')
    })
    terrainMap.on('error', (event) => {
      if ('sourceId' in event && event.sourceId === 'terrain') onStatusChange('error')
    })
    terrainMap.on('zoom', updateLabels)
    terrainMap.on('mousemove', updateReadout)
    terrainMap.on('mouseout', () => onReadoutChange(null))
    updateLabels()

    return () => {
      labels.forEach(({ marker }) => marker.remove())
      terrainMap.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    if (!map.current?.loaded()) return
    map.current.setTerrain({ source: 'terrain', exaggeration })
  }, [exaggeration])

  return <div ref={mapContainer} className="absolute inset-0 h-full w-full" />
}
