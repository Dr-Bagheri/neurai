/**
 * Offline preview of the cosmos hero.
 *
 * Renders the same girih point cloud and colour ramp the GPU uses, with a
 * software additive blend, straight to a PNG. Two reasons this exists:
 *
 *   1. It makes the design reviewable without a browser — useful in CI and in
 *      environments where the canvas can't composite.
 *   2. It produces `public/cosmos-fallback.webp`, the static hero served to
 *      visitors without WebGL2 or with Save-Data enabled. Generating it from
 *      the real geometry means the fallback can never drift from the live
 *      scene the way a hand-made screenshot would.
 *
 *   pnpm tsx scripts/preview-cosmos.ts
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { buildGalaxy } from '../src/components/cosmos/galaxy'
import { buildGirihTorus, buildStarShell, DEFAULT_GIRIH } from '../src/components/cosmos/girih'

const WIDTH = 1440
const HEIGHT = 900

// Mirrors the palette in src/styles/globals.css and engine.ts.
const EMBER: RGB = [255, 122, 61]
const EMBER_HOT: RGB = [255, 217, 168]
const LAPIS: RGB = [47, 91, 208]
const CYAN: RGB = [143, 227, 255]
const STAR_WARM: RGB = [240, 220, 196]
const STAR_COOL: RGB = [188, 214, 232]

type RGB = [number, number, number]

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

// Float accumulation buffer — additive blending needs headroom above 255 so
// that overlapping points bloom instead of clipping early.
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

      // Same soft falloff as the fragment shader's sprite.
      const falloff = smoothstep(radius, 0, dist)
      const weight = falloff * intensity
      const index = (y * WIDTH + x) * 3
      buffer[index]! += color[0] * weight
      buffer[index + 1]! += color[1] * weight
      buffer[index + 2]! += color[2] * weight
    }
  }
}

/* ── Camera ──────────────────────────────────────────────────────────────── */

/** Must match SCENE_STATE.home.cameraZ in engine.ts. */
const CAMERA_Z = 8.7
const FOV = (52 * Math.PI) / 180
const focal = HEIGHT / 2 / Math.tan(FOV / 2)
/** Must match RING_TILT in engine.ts, or this preview stops predicting the real scene. */
const TILT = 0.16

function project(x: number, y: number, z: number) {
  // Rotate about X so the ring is seen as a tilted disc.
  const cy = y * Math.cos(TILT) - z * Math.sin(TILT)
  const cz = y * Math.sin(TILT) + z * Math.cos(TILT)
  const depth = CAMERA_Z - cz
  if (depth <= 0.1) return null
  return {
    px: WIDTH / 2 + (x * focal) / depth,
    py: HEIGHT / 2 - (cy * focal) / depth,
    depth,
  }
}

/* ── Scene ───────────────────────────────────────────────────────────────── */

// Ambient nebula: two off-canvas light sources, warm upper-right, cool
// lower-left — the "two light sources, never more" rule from the design system.
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const nx = x / WIDTH
    const ny = y / HEIGHT
    // Lifts the corners, not the middle — haze inside the ring's centre is what
    // separates "cinematic" from "muddy".
    const warm = Math.exp(-(Math.hypot(nx - 0.82, ny - 0.02) ** 2) * 7.0) * 0.3
    const cool = Math.exp(-(Math.hypot(nx - 0.14, ny - 0.96) ** 2) * 6.0) * 0.34
    const index = (y * WIDTH + x) * 3
    buffer[index]! += EMBER[0] * warm + LAPIS[0] * cool
    buffer[index + 1]! += EMBER[1] * warm + LAPIS[1] * cool
    buffer[index + 2]! += EMBER[2] * warm + LAPIS[2] * cool
  }
}

// The spiral galaxy, well behind the ring. Rendered with its own transform so
// this preview reflects the real composition rather than the ring in isolation.
{
  const galaxy = buildGalaxy({ count: 26000 })
  // Must match this.galaxy.position / .rotation in engine.ts.
  const GX = -19
  const GY = 7.5
  const GZ = -30
  const [rx, ry, rz] = [0.86, 0.24, 0.58]

  const CORE: RGB = [255, 242, 214]

  for (let i = 0; i < galaxy.count; i++) {
    const r = galaxy.radius[i]!
    const a = galaxy.angle[i]!
    let x = Math.cos(a) * r
    let y = galaxy.height[i]!
    let z = Math.sin(a) * r

    // Euler XYZ, matching THREE.Object3D default order.
    let t = y * Math.cos(rx) - z * Math.sin(rx)
    z = y * Math.sin(rx) + z * Math.cos(rx)
    y = t
    t = x * Math.cos(ry) + z * Math.sin(ry)
    z = -x * Math.sin(ry) + z * Math.cos(ry)
    x = t
    t = x * Math.cos(rz) - y * Math.sin(rz)
    y = x * Math.sin(rz) + y * Math.cos(rz)
    x = t

    const projected = project(x + GX, y + GY, z + GZ)
    if (!projected) continue

    const radial = clamp01(r / 26)
    let color = mix(CORE, EMBER, smoothstep(0, 0.34, radial))
    color = mix(color, LAPIS, smoothstep(0.34, 0.78, radial))
    color = mix(color, CYAN, smoothstep(0.78, 1, radial) * 0.55)

    const falloff = 1 + (0.05 - 1) * smoothstep(0, 0.68, radial)
    const seed = galaxy.seed[i]!
    const coreBoost = 1 + (1 - radial) * 2.2

    addPoint(
      projected.px,
      projected.py,
      color,
      falloff * (0.5 + seed * 0.5) * 0.85,
      Math.max(0.6, (1.35 * coreBoost * 26) / projected.depth / 9),
    )
  }
}

// Starfield.
for (const [count, radius, size] of [
  [1800, 46, 0.9],
  [900, 30, 1.2],
  [420, 19, 1.6],
] as const) {
  const shell = buildStarShell(count, radius)
  for (let i = 0; i < shell.count; i++) {
    const projected = project(
      shell.positions[i * 3]!,
      shell.positions[i * 3 + 1]!,
      shell.positions[i * 3 + 2]!,
    )
    if (!projected) continue
    const seed = shell.seed[i]!
    addPoint(
      projected.px,
      projected.py,
      mix(STAR_COOL, STAR_WARM, seed),
      (0.35 + seed * 0.65) * 0.55,
      size,
    )
  }
}

/* Value noise + fbm, matching NOISE_GLSL and fbm3() in engine.ts. The preview
   is only useful if it applies the same displacement the GPU does. */
const hash = (x: number, y: number, z: number) => {
  let px = (x * 0.3183099 + 0.71) % 1
  let py = (y * 0.3183099 + 0.113) % 1
  let pz = (z * 0.3183099 + 0.419) % 1
  px = (px < 0 ? px + 1 : px) * 17
  py = (py < 0 ? py + 1 : py) * 17
  pz = (pz < 0 ? pz + 1 : pz) * 17
  const v = px * py * pz * (px + py + pz)
  return v - Math.floor(v)
}

const noise3 = (x: number, y: number, z: number) => {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  let fx = x - ix
  let fy = y - iy
  let fz = z - iz
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  fz = fz * fz * (3 - 2 * fz)

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz)

  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  )
}

const fbm3 = (x: number, y: number, z: number) => {
  let total = 0
  let amplitude = 0.5
  for (let i = 0; i < 3; i++) {
    total += noise3(x, y, z) * amplitude
    x *= 2.07
    y *= 2.07
    z *= 2.07
    amplitude *= 0.5
  }
  return total
}

/** Must match uTurbulence in engine.ts. */
const TURBULENCE = 1.35

// The girih ring, at the `high` tier budget — this preview stands in for what a
// desktop visitor actually sees, and doubles as the static fallback image.
const cloud = buildGirihTorus({ cellsU: 28, cellsV: 6, pointsPerSegment: 11 })
/** Must match uRingHalfHeight in engine.ts. */
const ringHalfHeight = DEFAULT_GIRIH.majorRadius + DEFAULT_GIRIH.minorRadius

for (let i = 0; i < cloud.count; i++) {
  let x = cloud.positions[i * 3]!
  let y = cloud.positions[i * 3 + 1]!
  let z = cloud.positions[i * 3 + 2]!

  // Same turbulence the vertex shader applies: displace outward from the tube
  // centreline, hardest at the tube's outer edge, plus a tangential swirl.
  const axisLen = Math.hypot(x, y) || 1e-4
  const ax = (x / axisLen) * DEFAULT_GIRIH.majorRadius
  const ay = (y / axisLen) * DEFAULT_GIRIH.majorRadius
  const ox = x - ax
  const oy = y - ay
  const oz = z
  const oLen = Math.hypot(ox, oy, oz) || 1e-4

  const tubeAngle = cloud.tubeAngle[i]!
  const edge = Math.abs(Math.sin(tubeAngle * Math.PI))

  const fx = x * 0.75
  const fy = y * 0.75
  const fz = cloud.ringAngle[i]! * 6
  const turbulence = fbm3(fx, fy, fz) - 0.5
  const swirl = fbm3(fx + 11.3, fy + 7.1, fz + 3.7) - 0.5

  const push = turbulence * TURBULENCE * (0.55 + edge * 1.45)
  x += (ox / oLen) * push - y * 0.08 * swirl * TURBULENCE
  y += (oy / oLen) * push + x * 0.08 * swirl * TURBULENCE
  z += (oz / oLen) * push + swirl * TURBULENCE * 0.5

  const projected = project(x, y, z)
  if (!projected) continue

  const wisp = edge

  // Diagonal hue axis, exactly as the fragment shader does: ember toward the
  // upper-right, firouzeh toward the lower-left.
  const axisX = 0.42 / Math.hypot(0.42, 1)
  const axisY = 1 / Math.hypot(0.42, 1)
  const t = clamp01(((x * axisX + y * axisY) / ringHalfHeight) * 0.5 + 0.5)

  const warm = mix(EMBER, EMBER_HOT, smoothstep(0.62, 1.0, t))
  const cool = mix(LAPIS, CYAN, smoothstep(0.42, 0.0, t))
  const color = mix(cool, warm, smoothstep(0.06, 0.94, t))

  const seed = cloud.seed[i]!
  // Matches the fragment shader's per-point alpha: low energy, high density,
  // with edge wisps dimmer than the tube's core.
  const density = 1 - wisp * 0.58
  const intensity = (0.34 + seed * 0.3) * density * 1.9
  // Nearer points are larger, as in the vertex shader's 1/-z sizing.
  const size = Math.max(0.7, (2.15 * 14) / projected.depth / 7)

  addPoint(projected.px, projected.py, color, intensity, size)
}

/* ── Tonemap and write ───────────────────────────────────────────────────── */

const pixels = Buffer.allocUnsafe(WIDTH * HEIGHT * 3)
const KNEE = 74

for (let p = 0; p < WIDTH * HEIGHT; p++) {
  const r = buffer[p * 3]!
  const g = buffer[p * 3 + 1]!
  const b = buffer[p * 3 + 2]!

  // Hue-preserving Reinhard: compress *luminance* and scale the channels by the
  // same factor. Tonemapping each channel independently pulls bright pixels
  // toward white — which is exactly what was bleaching the ember and firouzeh
  // poles into tan and pale grey where strands overlap.
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const scale = luminance > 0 ? (luminance / (luminance + KNEE)) / luminance : 0

  pixels[p * 3] = Math.round(255 * clamp01(r * scale))
  pixels[p * 3 + 1] = Math.round(255 * clamp01(g * scale))
  pixels[p * 3 + 2] = Math.round(255 * clamp01(b * scale))
}

const outDir = path.resolve(process.cwd(), 'public')
await mkdir(outDir, { recursive: true })

const image = sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })

await image.clone().png().toFile(path.join(outDir, 'cosmos-preview.png'))
await image.clone().webp({ quality: 82 }).toFile(path.join(outDir, 'cosmos-fallback.webp'))

console.log(`Rendered ${cloud.count.toLocaleString()} girih points + starfield`)
console.log(`  public/cosmos-preview.png   (review)`)
console.log(`  public/cosmos-fallback.webp (served when WebGL2 is unavailable)`)
