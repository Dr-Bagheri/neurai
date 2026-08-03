/**
 * Offline preview of the cosmos.
 *
 * Renders the same galaxy the GPU does, with a software additive blend,
 * straight to PNG. Two reasons this exists:
 *
 *   1. The design is reviewable without a browser — useful in CI and in any
 *      environment where a canvas can't composite.
 *   2. It produces `public/cosmos-fallback.webp`, the static background served
 *      to visitors without WebGL2 or with Save-Data on. Generating it from the
 *      real geometry means the fallback can't drift from the live scene the way
 *      a hand-taken screenshot would.
 *
 *   pnpm cosmos:preview
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { buildGalaxy, buildStarShell, DEFAULT_GALAXY } from '../src/components/cosmos/galaxy'

const WIDTH = 1440
const HEIGHT = 900
/** Exposure. Lower = brighter. */
const KNEE = 58

type RGB = [number, number, number]

// Mirrors the palette in engine.ts.
const CORE_HOT: RGB = [255, 246, 228]
const GOLD: RGB = [255, 180, 84]
const COPPER: RGB = [224, 123, 60]
const EMBER_DEEP: RGB = [143, 63, 20]
const STAR_WARM: RGB = [255, 230, 194]
const STAR_PALE: RGB = [246, 227, 203]

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

const buffer = new Float32Array(WIDTH * HEIGHT * 3)

function addPoint(px: number, py: number, color: RGB, intensity: number, radius: number) {
  const r = Math.ceil(radius)
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = Math.round(px) + dx
      const y = Math.round(py) + dy
      if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue
      const dist = Math.hypot(dx, dy)
      if (dist > radius) continue
      const weight = smoothstep(radius, 0, dist) * intensity
      const i = (y * WIDTH + x) * 3
      buffer[i]! += color[0] * weight
      buffer[i + 1]! += color[1] * weight
      buffer[i + 2]! += color[2] * weight
    }
  }
}

/* ── Camera ──────────────────────────────────────────────────────────────────
   FLIGHT.start in engine.ts: the home view, high above the disc looking down
   at the core. journey = 0. */
const CAM_Y = 30
const CAM_Z = 36
const FOV = (55 * Math.PI) / 180
const focal = HEIGHT / 2 / Math.tan(FOV / 2)
// camera.lookAt(0,0,0) from (0, CAM_Y, CAM_Z) is a pure pitch about X.
const PITCH = Math.atan2(CAM_Y, CAM_Z)

function project(x: number, y: number, z: number) {
  const yc = y - CAM_Y
  const zc = z - CAM_Z
  // Rotate the world by -PITCH about X to bring it into camera space.
  const y2 = yc * Math.cos(PITCH) - zc * Math.sin(PITCH)
  const z2 = yc * Math.sin(PITCH) + zc * Math.cos(PITCH)
  const depth = -z2
  if (depth <= 0.4) return null
  return { px: WIDTH / 2 + (x * focal) / depth, py: HEIGHT / 2 - (y2 * focal) / depth, depth }
}

/* ── Nebula ambience ─────────────────────────────────────────────────────── */
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const nx = x / WIDTH
    const ny = y / HEIGHT
    // Kept very low: 60% of the frame has to stay unlit void, and ambient haze
    // is the fastest way to spend that budget without noticing.
    const a = Math.exp(-(Math.hypot(nx - 0.78, ny - 0.14) ** 2) * 9.0) * 0.075
    const b = Math.exp(-(Math.hypot(nx - 0.2, ny - 0.85) ** 2) * 8.0) * 0.055
    const i = (y * WIDTH + x) * 3
    buffer[i]! += COPPER[0] * a + GOLD[0] * b
    buffer[i + 1]! += COPPER[1] * a + GOLD[1] * b
    buffer[i + 2]! += COPPER[2] * a + GOLD[2] * b
  }
}

/* ── Starfield ───────────────────────────────────────────────────────────── */
for (const [count, radius, size] of [
  [2600, 150, 1.0],
  [1400, 110, 1.4],
  [700, 80, 1.8],
] as const) {
  const shell = buildStarShell(count, radius)
  for (let i = 0; i < shell.count; i++) {
    const p = project(shell.positions[i * 3]!, shell.positions[i * 3 + 1]!, shell.positions[i * 3 + 2]!)
    if (!p) continue
    const seed = shell.seed[i]!
    addPoint(p.px, p.py, mix(STAR_PALE, STAR_WARM, seed), (0.3 + seed * 0.7) * 0.5, size)
  }
}

/* ── Galaxy ──────────────────────────────────────────────────────────────── */
const galaxy = buildGalaxy()
const OUTER = DEFAULT_GALAXY.radius

for (let i = 0; i < galaxy.count; i++) {
  const r = galaxy.radius[i]!
  const a = galaxy.angle[i]!
  const p = project(Math.cos(a) * r, galaxy.height[i]!, Math.sin(a) * r)
  if (!p) continue

  const radial = clamp01(r / OUTER)
  const kind = galaxy.kind[i]!
  const seed = galaxy.seed[i]!

  let color = mix(CORE_HOT, GOLD, smoothstep(0, 0.26, radial))
  color = mix(color, COPPER, smoothstep(0.26, 0.62, radial))
  color = mix(color, EMBER_DEEP, smoothstep(0.62, 1, radial))

  let falloff = 1 + (0.09 - 1) * smoothstep(0, 0.72, radial)
  if (kind > 1.5) falloff *= 0.35

  const coreness = 1 - smoothstep(0, 0.22, radial)
  const coreBoost = 1 + coreness * 2.4
  const size = Math.max(0.65, (1.5 * coreBoost * 30) / p.depth / 9)

  addPoint(p.px, p.py, color, falloff * (0.45 + seed * 0.55) * 1.15, size)
}

/* ── Tonemap and write ───────────────────────────────────────────────────── */
const pixels = Buffer.allocUnsafe(WIDTH * HEIGHT * 3)
for (let p = 0; p < WIDTH * HEIGHT; p++) {
  const r = buffer[p * 3]!
  const g = buffer[p * 3 + 1]!
  const b = buffer[p * 3 + 2]!
  // Hue-preserving Reinhard: compress luminance and scale channels by the same
  // factor. Per-channel tonemapping pulls bright pixels toward white, which
  // bleaches the core's gold into a flat disc.
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const scale = lum > 0 ? lum / (lum + KNEE) / lum : 0
  pixels[p * 3] = Math.round(255 * clamp01(r * scale))
  pixels[p * 3 + 1] = Math.round(255 * clamp01(g * scale))
  pixels[p * 3 + 2] = Math.round(255 * clamp01(b * scale))
}

const outDir = path.resolve(process.cwd(), 'public')
await mkdir(outDir, { recursive: true })

const image = sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
await image.clone().png().toFile(path.join(outDir, 'cosmos-preview.png'))
await image.clone().webp({ quality: 82 }).toFile(path.join(outDir, 'cosmos-fallback.webp'))

console.log(`Rendered ${galaxy.count.toLocaleString()} galaxy particles + starfield`)
console.log('  public/cosmos-preview.png   (review)')
console.log('  public/cosmos-fallback.webp (served when WebGL2 is unavailable)')
