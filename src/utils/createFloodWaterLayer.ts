import maplibregl from 'maplibre-gl'

type GlContext = WebGLRenderingContext | WebGL2RenderingContext

type FloodWaterLayerOptions = {
  id: string
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  textureUrl: string
  maxLevel: number
  seaLevel: number
}

export type FloodWaterLayer = maplibregl.CustomLayerInterface & {
  setSeaLevel: (seaLevel: number) => void
}

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_uv;
  uniform mat4 u_matrix;
  varying vec2 v_uv;

  void main() {
    gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
    v_uv = a_uv;
  }
`

const FRAGMENT_SHADER = `
  precision highp float;

  uniform sampler2D u_flood_data;
  uniform float u_sea_level;
  uniform float u_max_level;
  varying vec2 v_uv;

  void main() {
    vec4 data = texture2D(u_flood_data, v_uv);
    // Threshold channels are meaningful only for fully valid DEM pixels. With
    // linear sampling, transparent neighbours otherwise blend their zeroed
    // channels into the data and look like premature inundation.
    if (data.a < 0.995) discard;

    float high = floor(data.r * 255.0 + 0.5);
    float low = floor(data.g * 255.0 + 0.5);
    float threshold = (high * 256.0 + low) / 65535.0 * u_max_level;
    float elevation = data.b * u_max_level;

    float waterEdge = 0.07;
    // Build the soft edge only after water reaches this pixel's threshold.
    // A centred smoothstep made low terrain visible up to 7 cm too early.
    float submerged = smoothstep(threshold, threshold + waterEdge, u_sea_level);
    if (submerged < 0.004) discard;

    float depth = max(u_sea_level - elevation, 0.0);
    float depthMix = smoothstep(0.0, 5.0, depth);
    vec3 shallowWater = vec3(0.34, 0.69, 0.96);
    vec3 deepWater = vec3(0.05, 0.37, 0.78);
    vec3 waterColor = mix(shallowWater, deepWater, depthMix);
    float alpha = submerged * mix(0.52, 0.82, depthMix);

    // MapLibre expects premultiplied alpha from custom layers.
    gl_FragColor = vec4(waterColor * alpha, alpha);
  }
`

function compileShader(gl: GlContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create WebGL shader')

  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader error'
    gl.deleteShader(shader)
    throw new Error(message)
  }

  return shader
}

function createProgram(gl: GlContext): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create WebGL program')

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown WebGL program error'
    gl.deleteProgram(program)
    throw new Error(message)
  }

  return program
}

export function createFloodWaterLayer(options: FloodWaterLayerOptions): FloodWaterLayer {
  let map: maplibregl.Map | null = null
  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null
  let texture: WebGLTexture | null = null
  let seaLevel = options.seaLevel
  let textureReady = false

  const layer: FloodWaterLayer = {
    id: options.id,
    type: 'custom',
    renderingMode: '2d',

    onAdd(currentMap, gl) {
      map = currentMap
      program = createProgram(gl)
      buffer = gl.createBuffer()
      if (!buffer) throw new Error('Unable to create flood-water buffer')

      const [northWest, northEast, southEast, southWest] = options.coordinates
      const nw = maplibregl.MercatorCoordinate.fromLngLat(northWest)
      const ne = maplibregl.MercatorCoordinate.fromLngLat(northEast)
      const se = maplibregl.MercatorCoordinate.fromLngLat(southEast)
      const sw = maplibregl.MercatorCoordinate.fromLngLat(southWest)

      const vertices = new Float32Array([
        nw.x, nw.y, 0, 0,
        ne.x, ne.y, 1, 0,
        sw.x, sw.y, 0, 1,
        ne.x, ne.y, 1, 0,
        se.x, se.y, 1, 1,
        sw.x, sw.y, 0, 1,
      ])

      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)

      const image = new Image()
      image.onload = () => {
        texture = gl.createTexture()
        if (!texture) return

        gl.bindTexture(gl.TEXTURE_2D, texture)
        // The quad's UV coordinates already place the PNG's first row at north.
        // Flipping during upload would mirror the DEM across the east-west axis.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
        textureReady = true
        map?.triggerRepaint()
      }
      image.src = options.textureUrl
    },

    render(gl, matrix) {
      if (!program || !buffer || !texture || !textureReady) return

      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)

      const position = gl.getAttribLocation(program, 'a_position')
      const uv = gl.getAttribLocation(program, 'a_uv')
      gl.enableVertexAttribArray(position)
      gl.enableVertexAttribArray(uv)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0)
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(gl.getUniformLocation(program, 'u_flood_data'), 0)
      gl.uniform1f(gl.getUniformLocation(program, 'u_sea_level'), seaLevel)
      gl.uniform1f(gl.getUniformLocation(program, 'u_max_level'), options.maxLevel)
      gl.uniformMatrix4fv(
        gl.getUniformLocation(program, 'u_matrix'),
        false,
        new Float32Array(matrix),
      )

      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    },

    onRemove(_, gl) {
      if (texture) gl.deleteTexture(texture)
      if (buffer) gl.deleteBuffer(buffer)
      if (program) gl.deleteProgram(program)
      texture = null
      buffer = null
      program = null
      map = null
    },

    setSeaLevel(nextSeaLevel) {
      seaLevel = Math.max(0, Math.min(options.maxLevel, nextSeaLevel))
      map?.triggerRepaint()
    },
  }

  return layer
}
