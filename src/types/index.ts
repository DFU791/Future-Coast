// 城市数据类型定义
export interface CityFloodData {
  name: string
  nameEn: string
  // GeoJSON Polygon - 淹没区域
  polygon: {
    type: 'Polygon'
    coordinates: number[][][]
  }
  // 开始淹没的年份
  startYear: number
  // 完全淹没的年份
  endYear: number
  // 城市坐标 [lng, lat]
  center: [number, number]
  // 描述
  description: string
}

// 全局应用状态
export interface AppState {
  currentYear: number
  seaLevel: number
}
