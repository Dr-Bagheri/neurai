/**
 * Offline preview of the cosmos.
 *
 * Renders each formation from its own camera vantage, the way the GPU does,
 * with a software additive blend. Two reasons this exists:
 *
 *   1. The design is reviewable without a browser — useful in CI and anywhere a
 *      canvas can't composite.
 *   2. It produces `public/cosmos-fallback.webp`, the static background served
 *      to visitors without WebGL2 or with Save-Data on, generated from the real
 *      geometry so it can't drift from the live scene.
 *
 *   pnpm cosmos:preview
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import {
  buildFormations,
  FORMATION_CAMERA,
  FORMATION_NAMES,
  type FormationName,
} from '../src/components/cosmos/formations'
import { buildStarShell } from '../src/components/cosmos/stars'

const W = 880
const H = 560
/** Exposure. Lower = brighter. */
const KNEE = 46

type RGB = [number, number, number]

// Mirrors the palette in engine.ts.
const BLUE: RGB = [110, 139, 255]
const INDIGO: RGB = [139, 123, 255]
const VIOLET: RGB = [180, 120, 245]
const MAGENTA: RGB = [224, 107, 176]
const RED: RGB = [255, 107, 74]
const WARM: RGB = [255, 154, 90]
const STAR: RGB = [223, 228, 255]

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

/** Identical to the fragment shader's ramp. */
function rampColor(t: number): RGB {
  let c = mix(BLUE, INDIGO, smoothstep(0.0, 0.24, t))
  c = mix(c, VIOLET, smoothstep(0.24, 0.46, t))
  c = mix(c, MAGENTA, smoothstep(0.46, 0.66, t))
  c = mix(c, RED, smoothstep(0.66, 0.86, t))
  c = mix(c, WARM, smoothstep(0.86, 1.0, t))
  return c
}

const FOV = (58 * Math.PI) / 180
const focal = H / 2 / Math.tan(FOV / 2)

const cloud = buildFormations({ lines: 280, pointsPerLine: 180 })

function renderFormation(name: FormationName): Buffer {
  const cam = FORMATION_CAMERA[name]
  // camera.lookAt(0, look, 0) from (0, cam.y, cam.z) is a pure pitch about X.
  const pitch = Math.atan2(cam.y - cam.look, cam.z)

  const project = (x: number, y: number, z: number) => {
    const yc = y - cam.y
    const zc = z - cam.z
    const y2 = yc * Math.cos(pitch) - zc * Math.sin(pitch)
    const z2 = yc * Math.sin(pitch) + zc * Math.cos(pitch)
    const depth = -z2
    if (depth <= 0.5) return null
    return { px: W / 2 + (x * focal) / depth, py: H / 2 - (y2 * focal) / depth, depth, vx: x, vy: y2 }
  }

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

  // Starfield.
  for (const [count, radius, size] of [
    [2400, 200, 1.0],
    [1200, 140, 1.3],
  ] as const) {
    const shell = buildStarShell(count, radius)
    for (let i = 0; i < shell.count; i++) {
      const p = project(
        shell.positions[i * 3]!,
        shell.positions[i * 3 + 1]!,
        shell.positions[i * 3 + 2]!,
      )
      if (!p) continue
      addPoint(p.px, p.py, STAR, (0.25 + shell.seed[i]! * 0.75) * 0.4, size)
    }
  }

  // The formation.
  const pts = cloud.shapes[name]
  for (let i = 0; i < cloud.count; i++) {
    const p = project(pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!)
    if (!p) continue

    // View-space diagonal ramp, matching the vertex shader.
    const ramp = clamp01((p.vx * 0.55 + p.vy * 0.83) / 26 + 0.5)
    // Distance attenuation — this is what produces limb brightening on the shell.
    const atten = Math.min(1.9, Math.max(0.15, 22 / p.depth))
    const seed = cloud.seed[i]!

    addPoint(
      p.px,
      p.py,
      rampColor(ramp),
      atten * (0.32 + seed * 0.5) * 0.9,
      Math.max(0.55, (1.7 * 26) / p.depth / 9),
    )
  }

  // Hue-preserving Reinhard: compress luminance, scale channels by the same
  // factor. Per-channel tonemapping pulls bright pixels toward white and would
  // bleach the entire ramp out of the brightest regions.
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
for (const name of FORMATION_NAMES) {
  console.log(`rendering ${name} …`)
  const raw = renderFormation(name)
  tiles.push(
    await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toBuffer(),
  )

  // The hero formation stands in for the live scene when WebGL is unavailable.
  if (name === 'shell') {
    await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
      .webp({ quality: 82 })
      .toFile(path.join(outDir, 'cosmos-fallback.webp'))
  }
}

const cols = 2
const rows = Math.ceil(tiles.length / cols)
await sharp({
  create: { width: W * cols, height: H * rows, channels: 3, background: { r: 0, g: 0, b: 0 } },
})
  .composite(
    tiles.map((input, i) => ({
      input,
      left: (i % cols) * W,
      top: Math.floor(i / cols) * H,
    })),
  )
  .png()
  .toFile(path.join(outDir, 'cosmos-preview.png'))

console.log(`\n${cloud.count.toLocaleString()} particles × ${FORMATION_NAMES.length} formations`)
console.log('  public/cosmos-preview.png   (' + FORMATION_NAMES.join(' · ') + ')')
console.log('  public/cosmos-fallback.webp')
