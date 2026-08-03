/**
 * Offline preview of the cosmos.
 *
 * Renders each of the four galaxy morphologies the way the GPU does, with a
 * software additive blend, straight to PNG. Two reasons this exists:
 *
 *   1. The design is reviewable without a browser — useful in CI and anywhere a
 *      canvas can't composite.
 *   2. It produces `public/cosmos-fallback.webp`, the static background served
 *      to visitors without WebGL2 or with Save-Data on. Generating it from the
 *      real geometry means the fallback can't drift from the live scene.
 *
 *   pnpm cosmos:preview
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import {
  buildGalaxy,
  buildStarShell,
  DEFAULT_GALAXY,
  SHAPE_NAMES,
  type ShapeName,
} from '../src/components/cosmos/galaxy'

const W = 900
const H = 640
/** Exposure. Lower = brighter. */
const KNEE = 62

type RGB = [number, number, number]

// Mirrors the stellar ramp in engine.ts.
const CORE_HOT: RGB = [255, 246, 216]
const YELLOW: RGB = [255, 209, 102]
const AMBER: RGB = [255, 154, 60]
const RED: RGB = [255, 94, 77]
const VIOLET: RGB = [167, 139, 250]
const BLUE: RGB = [126, 166, 255]
const ICE: RGB = [191, 212, 255]

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

/** The stellar ramp, identical to the fragment shader's. */
function stellarColor(rank: number): RGB {
  let c = mix(CORE_HOT, YELLOW, smoothstep(0.0, 0.16, rank))
  c = mix(c, AMBER, smoothstep(0.16, 0.34, rank))
  c = mix(c, RED, smoothstep(0.34, 0.52, rank))
  c = mix(c, VIOLET, smoothstep(0.52, 0.74, rank))
  c = mix(c, BLUE, smoothstep(0.74, 1.0, rank))
  return c
}

/* ── Camera — matches FLIGHT.start in engine.ts ──────────────────────────── */
const CAM_Y = 38
const CAM_Z = 46
const FOV = (55 * Math.PI) / 180
const focal = H / 2 / Math.tan(FOV / 2)
const PITCH = Math.atan2(CAM_Y, CAM_Z)

function project(x: number, y: number, z: number) {
  const yc = y - CAM_Y
  const zc = z - CAM_Z
  const y2 = yc * Math.cos(PITCH) - zc * Math.sin(PITCH)
  const z2 = yc * Math.sin(PITCH) + zc * Math.cos(PITCH)
  const depth = -z2
  if (depth <= 0.4) return null
  return { px: W / 2 + (x * focal) / depth, py: H / 2 - (y2 * focal) / depth, depth }
}

const galaxy = buildGalaxy()
const OUTER = DEFAULT_GALAXY.radius

function renderShape(shape: ShapeName): Buffer {
  const buffer = new Float32Array(W * H * 3)

  const addPoint = (px: number, py: number, color: RGB, intensity: number, radius: number) => {
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

  // Ambient nebula. Kept very low: 60% of the frame must stay unlit void, and
  // haze is the fastest way to spend that budget without noticing.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = x / W
      const ny = y / H
      const a = Math.exp(-(Math.hypot(nx - 0.78, ny - 0.16) ** 2) * 9) * 0.07
      const b = Math.exp(-(Math.hypot(nx - 0.2, ny - 0.84) ** 2) * 8) * 0.075
      const i = (y * W + x) * 3
      buffer[i]! += AMBER[0] * a + VIOLET[0] * b
      buffer[i + 1]! += AMBER[1] * a + VIOLET[1] * b
      buffer[i + 2]! += AMBER[2] * a + VIOLET[2] * b
    }
  }

  // Starfield.
  for (const [count, radius, size] of [
    [2200, 190, 1.0],
    [1100, 150, 1.3],
  ] as const) {
    const shell = buildStarShell(count, radius)
    for (let i = 0; i < shell.count; i++) {
      const p = project(
        shell.positions[i * 3]!,
        shell.positions[i * 3 + 1]!,
        shell.positions[i * 3 + 2]!,
      )
      if (!p) continue
      const seed = shell.seed[i]!
      addPoint(p.px, p.py, mix(ICE, YELLOW, seed), (0.3 + seed * 0.7) * 0.45, size)
    }
  }

  // The galaxy, in this morphology.
  const polar = galaxy.shapes[shape]
  for (let i = 0; i < galaxy.count; i++) {
    const r = polar[i * 3]!
    const theta = polar[i * 3 + 1]!
    const h = polar[i * 3 + 2]!

    const p = project(Math.cos(theta) * r, h, Math.sin(theta) * r)
    if (!p) continue

    const rank = clamp01(galaxy.rank[i]!)
    const kind = galaxy.kind[i]!
    const seed = galaxy.seed[i]!

    let falloff = 1 + (0.16 - 1) * smoothstep(0, 0.8, rank)
    if (kind > 1.5) falloff *= 0.4

    const coreness = 1 - smoothstep(0, 0.22, rank)
    const size = Math.max(0.62, (1.5 * (1 + coreness * 2.4) * 30) / p.depth / 9)

    addPoint(p.px, p.py, stellarColor(rank), falloff * (0.45 + seed * 0.55) * 1.25, size)
  }

  // Hue-preserving Reinhard: compress luminance, scale channels by the same
  // factor. Per-channel tonemapping pulls bright pixels toward white, which
  // would bleach the whole stellar ramp out of the core.
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

const outDir = path.resolve(process.cwd(), 'public')
await mkdir(outDir, { recursive: true })

const tiles: Buffer[] = []
for (const shape of SHAPE_NAMES) {
  console.log(`rendering ${shape} …`)
  const raw = renderShape(shape)
  tiles.push(
    await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toBuffer(),
  )

  // The first morphology is what a visitor sees before scrolling, so it is the
  // one that stands in for the live scene when WebGL is unavailable.
  if (shape === 'spiral') {
    await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
      .webp({ quality: 82 })
      .toFile(path.join(outDir, 'cosmos-fallback.webp'))
  }
}

// 2×2 contact sheet.
await sharp({
  create: { width: W * 2, height: H * 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
})
  .composite(
    tiles.map((input, i) => ({ input, left: (i % 2) * W, top: Math.floor(i / 2) * H })),
  )
  .png()
  .toFile(path.join(outDir, 'cosmos-preview.png'))

console.log(`\n${galaxy.count.toLocaleString()} particles × ${SHAPE_NAMES.length} morphologies`)
console.log('  public/cosmos-preview.png   (contact sheet: ' + SHAPE_NAMES.join(' · ') + ')')
console.log('  public/cosmos-fallback.webp (served when WebGL2 is unavailable)')
