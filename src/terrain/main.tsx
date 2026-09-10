import React from 'react'
import ReactDOM from 'react-dom/client'
import TerrainApp from './TerrainApp'
import '../index.css'
import './terrain.css'

ReactDOM.createRoot(document.getElementById('terrain-root')!).render(
  <React.StrictMode>
    <TerrainApp />
  </React.StrictMode>,
)
