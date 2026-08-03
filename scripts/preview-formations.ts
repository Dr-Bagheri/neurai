/**
 * Renders the three cosmos formations side by side.
 *
 * The morph is driven by scroll, so a still of the hero proves nothing about
 * what the column and terrain look like — or whether the blend weights are
 * even correct. This renders the same point cloud at three scroll positions
 * using the same blend the vertex shader applies.
 *
 *   pnpm tsx scripts/preview-formations.ts
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { buildFormations, buildGirihTorus } from '../src/components/cosmos/girih'

const W = 620
const H = 620
const KNEE = 74

type RGB = [number, number, number]
const EMBER: RGB = [255, 122, 61]
const EMBER_HOT: RGB = [255, 217, 168]
const LAPIS: RGB = [47, 91, 208]
const CYAN: RGB = [143, 227, 255]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

// Must mirror FORMATION_SCHEDULE and COLOR_AXIS in engine.ts.
const SCHEDULE = { ringUntil: 0.26, columnFrom: 0.42, columnUntil: 0.6, terrainFrom: 0.78 }
const AXES = {
  ring: { axis: [0.42, 1] as const, scale: 4.28 },
  column: { axis: [0.15, 1] as const, scale: 7.0 },
  terrain: { axis: [1, 0.12] as const, scale: 13.0 },
}

function weights(journey: number): [number, number, number] {
  const toColumn = smoothstep(SCHEDULE.ringUntil, SCHEDULE.columnFrom, journey)
  const toTerrain = smoothstep(SCHEDULE.columnUntil, SCHEDULE.terrainFrom, journey)
  return [1 - toColumn, toColumn * (1 - toTerrain), toColumn * toTerrain]
}

const cloud = buildGirihTorus({ cellsU: 28, cellsV: 6, pointsPerSegment: 11 })
const { column, terrain } = buildFormations(cloud)

const RING_TILT = 0.16
const FOV = (52 * Math.PI) / 180
const focal = H / 2 / Math.tan(FOV / 2)

function renderFrame(journey: number, cameraZ: number): Buffer {
  const [wRing, wColumn, wTerrain] = weights(journey)
  const buffer = new Float32Array(W * H * 3)

  const camY = wTerrain * 1.9
  const lookY = -2.6 * wTerrain
  // Small-angle pitch toward the horizon; enough for a landscape to recede.
  const pitch = Math.atan2(camY - lookY, cameraZ)
  const tilt = RING_TILT * wRing

  const axisX =
    AXES.ring.axis[0] * wRing + AXES.column.axis[0] * wColumn + AXES.terrain.axis[0] * wTerrain
  const axisY =
    AXES.ring.axis[1] * wRing + AXES.column.axis[1] * wColumn + AXES.terrain.axis[1] * wTerrain
  const axisLen = Math.hypot(axisX, axisY) || 1
  const colorScale =
    AXES.ring.scale * wRing + AXES.column.scale * wColumn + AXES.terrain.scale * wTerrain

  const add = (px: number, py: number, color: RGB, intensity: number, radius: number) => {
    const r = Math.ceil(radius)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(px) + dx
        const y = Math.round(py) + dy
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        const dist = Math.hypot(dx, dy)
        if (dist > radius) continue
        const weight = smoothstep(radius, 0, dist) * intensity
        const i = (y * W + x) * 3
        buffer[i]! += color[0] * weight
        buffer[i + 1]! += color[1] * weight
        buffer[i + 2]! += color[2] * weight
      }
    }
  }

  for (let i = 0; i < cloud.count; i++) {
    // The shader's blend, exactly.
    const x =
      cloud.positions[i * 3]! * wRing + column[i * 3]! * wColumn + terrain[i * 3]! * wTerrain
    const y =
      cloud.positions[i * 3 + 1]! * wRing +
      column[i * 3 + 1]! * wColumn +
      terrain[i * 3 + 1]! * wTerrain
    const z =
      cloud.positions[i * 3 + 2]! * wRing +
      column[i * 3 + 2]! * wColumn +
      terrain[i * 3 + 2]! * wTerrain

    // Ring tilt, then camera pitch.
    const y1 = y * Math.cos(tilt) - z * Math.sin(tilt)
    const z1 = y * Math.sin(tilt) + z * Math.cos(tilt)

    const yc = y1 - camY
    const y2 = yc * Math.cos(pitch) + z1 * Math.sin(pitch)
    const z2 = -yc * Math.sin(pitch) + z1 * Math.cos(pitch)

    const depth = cameraZ - z2
    if (depth <= 0.15) continue

    const px = W / 2 + (x * focal) / depth
    const py = H / 2 - (y2 * focal) / depth

    const t = clamp01(((x * axisX + y * axisY) / axisLen / colorScale) * 0.5 + 0.5)
    const warm = mix(EMBER, EMBER_HOT, smoothstep(0.62, 1, t))
    const cool = mix(LAPIS, CYAN, smoothstep(0.42, 0, t))
    const color = mix(cool, warm, smoothstep(0.06, 0.94, t))

    const seed = cloud.seed[i]!
    const edge = Math.abs(Math.sin(cloud.tubeAngle[i]! * Math.PI))
    const intensity = (0.34 + seed * 0.3) * (1 - edge * 0.58) * 1.9
    add(px, py, color, intensity, Math.max(0.7, (2.15 * 14) / depth / 7))
  }

  const pixels = Buffer.allocUnsafe(W * H * 3)
  for (let p = 0; p < W * H; p++) {
    const r = buffer[p * 3]!
    const g = buffer[p * 3 + 1]!
    const b = buffer[p * 3 + 2]!
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const scale = lum > 0 ? lum / (lum + KNEE) / lum : 0
    pixels[p * 3] = Math.round(255 * clamp01(r * scale))
    pixels[p * 3 + 1] = Math.round(255 * clamp01(g * scale))
    pixels[p * 3 + 2] = Math.round(255 * clamp01(b * scale))
  }
  return pixels
}

const shots: Array<{ label: string; journey: number; cameraZ: number }> = [
  { label: 'ring (journey 0.0)', journey: 0, cameraZ: 8.7 },
  { label: 'column (journey 0.5)', journey: 0.5, cameraZ: 11.5 },
  { label: 'terrain (journey 1.0)', journey: 1, cameraZ: 12.5 },
]

const tiles = await Promise.all(
  shots.map(async (shot) => {
    const [r, c, t] = weights(shot.journey)
    console.log(
      `${shot.label.padEnd(22)} weights ring=${r.toFixed(2)} column=${c.toFixed(2)} terrain=${t.toFixed(2)}`,
    )
    return sharp(renderFrame(shot.journey, shot.cameraZ), {
      raw: { width: W, height: H, channels: 3 },
    })
      .png()
      .toBuffer()
  }),
)

const outDir = path.resolve(process.cwd(), 'public')
await mkdir(outDir, { recursive: true })

await sharp({
  create: { width: W * 3, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } },
})
  .composite(tiles.map((input, index) => ({ input, left: index * W, top: 0 })))
  .png()
  .toFile(path.join(outDir, 'cosmos-formations.png'))

console.log('\npublic/cosmos-formations.png')
