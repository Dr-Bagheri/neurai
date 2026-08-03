/**
 * The five particle formations the background moves through.
 *
 * The single most important decision here is that particles are **not scattered
 * randomly**. Every particle has a fixed (u, v) address: `u` selects which
 * striation line it belongs to, `v` its position along that line. Each
 * formation maps (u, v) to a position.
 *
 * That is what produces the combed, striated look of the reference — fine
 * parallel curves rather than a cloud of dots — and it produces it in *every*
 * formation automatically, so the whole sequence shares one visual language.
 * A random point cloud can never look like this no matter how it is coloured.
 *
 * Because (u, v) is fixed per particle, a particle occupies the same position
 * *within the structure* in every formation. Striation 12 stays striation 12.
 * Morphing therefore reorganises coherent lines rather than shuffling dust.
 */

export type FormationName = 'shell' | 'column' | 'helix' | 'terrain' | 'blackhole'

export const FORMATION_NAMES: readonly FormationName[] = [
  'shell',
  'column',
  'helix',
  'terrain',
  'blackhole',
]

export type FormationOptions = {
  /** Number of striation lines. */
  lines: number
  /** Points sampled along each line. */
  pointsPerLine: number
}

export const DEFAULT_FORMATION: FormationOptions = {
  lines: 260,
  pointsPerLine: 170,
}

export type FormationCloud = {
  /** Cartesian xyz per formation. */
  shapes: Record<FormationName, Float32Array>
  /** Striation index, 0..1. */
  u: Float32Array
  /** Position along the striation, 0..1. */
  v: Float32Array
  seed: Float32Array
  count: number
}

/* ── Value noise, matching the shader's so CPU and GPU agree ─────────────── */
function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}

function noise3(x: number, y: number, z: number) {
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
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz)
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  )
}

function fbm(x: number, y: number, z: number, octaves = 3) {
  let total = 0
  let amp = 0.5
  for (let i = 0; i < octaves; i++) {
    total += noise3(x, y, z) * amp
    x *= 2.03
    y *= 2.03
    z *= 2.03
    amp *= 0.5
  }
  return total
}

const TAU = Math.PI * 2

export function buildFormations(options: Partial<FormationOptions> = {}): FormationCloud {
  const { lines, pointsPerLine } = { ...DEFAULT_FORMATION, ...options }
  const count = lines * pointsPerLine

  const shapes = {
    shell: new Float32Array(count * 3),
    column: new Float32Array(count * 3),
    helix: new Float32Array(count * 3),
    terrain: new Float32Array(count * 3),
    blackhole: new Float32Array(count * 3),
  }
  const uArr = new Float32Array(count)
  const vArr = new Float32Array(count)
  const seedArr = new Float32Array(count)

  let i = 0
  for (let line = 0; line < lines; line++) {
    const u = line / lines

    for (let p = 0; p < pointsPerLine; p++) {
      const v = p / (pointsPerLine - 1)

      // ── 1 · Shell — the hero ──────────────────────────────────────────
      // A thin spherical shell, heavily noise-displaced. Rendered additively,
      // the silhouette is far brighter than the middle: at the limb you look
      // along the shell rather than through it, so the path length through
      // emitting material is much longer. That limb brightening is exactly
      // what gives the reference its bright rim and dark hollow centre — it
      // is a physical consequence of the geometry, not a painted vignette.
      {
        const azimuth = u * TAU
        const polar = v * Math.PI
        const sinP = Math.sin(polar)

        // Displacement along the surface normal, so the shell stays a shell.
        const warp = fbm(Math.cos(azimuth) * 1.7, Math.sin(azimuth) * 1.7, v * 3.1) - 0.5
        const r = 15 * (1 + warp * 0.42)

        shapes.shell[i * 3 + 0] = Math.cos(azimuth) * sinP * r
        shapes.shell[i * 3 + 1] = Math.cos(polar) * r * 1.06
        shapes.shell[i * 3 + 2] = Math.sin(azimuth) * sinP * r
      }

      // ── 2 · Column — a rising plume ───────────────────────────────────
      {
        const azimuth = u * TAU
        const y = (v - 0.5) * 34
        // Waisted: narrow at both ends, fullest in the middle.
        const waist = 1 - Math.abs(v - 0.5) ** 1.7 * 1.5
        const warp = fbm(Math.cos(azimuth) * 2.2, v * 5.5, 11.3) - 0.5
        const r = Math.max(0.4, 5.2 * waist * (1 + warp * 0.7))

        shapes.column[i * 3 + 0] = Math.cos(azimuth) * r
        shapes.column[i * 3 + 1] = y
        shapes.column[i * 3 + 2] = Math.sin(azimuth) * r
      }

      // ── 3 · Helix — a DNA double strand ───────────────────────────────
      // Most striations follow one of the two backbones; a minority become the
      // rungs between them. Without the rungs it reads as two loose ribbons
      // rather than as a double helix.
      {
        const isRung = u > 0.86
        const y = (v - 0.5) * 36
        const twist = v * TAU * 2.6

        if (isRung) {
          // A rung is a short bar between the two strands at one height. Each
          // striation line becomes exactly one rung, so `across` (from v) is
          // the only thing that varies along it — otherwise the rung sweeps
          // through space and draws a diagonal across the whole structure.
          const t = (u - 0.82) / 0.18
          const rungPhase = Math.floor(t * 18) / 18
          const rungY = (rungPhase - 0.5) * 36
          const rungTwist = rungPhase * TAU * 2.6
          const across = (v * 2 - 1) * 5.4
          shapes.helix[i * 3 + 0] = Math.cos(rungTwist) * across
          shapes.helix[i * 3 + 1] = rungY
          shapes.helix[i * 3 + 2] = Math.sin(rungTwist) * across
        } else {
          // Two ribbons, not two curves. `u` has to drive a position *across*
          // the backbone — using it only to pick which strand leaves every line
          // tracing the identical helix, so all 240 of them pile onto one curve
          // and the structure reads as a single fuzzy rope.
          const onFirst = u < 0.43
          const strand = onFirst ? 0 : Math.PI
          const local = onFirst ? u / 0.43 : (u - 0.43) / 0.43
          // Cross-ribbon coordinate, -1..1.
          const across = local * 2 - 1

          const angle = twist + strand
          const radius = 5.4 + across * 1.5
          // Offsetting along Y as well as radially gives the ribbon a twist of
          // its own, so it reads as a band rather than a cylinder.
          shapes.helix[i * 3 + 0] = Math.cos(angle) * radius
          shapes.helix[i * 3 + 1] = y + across * 0.9
          shapes.helix[i * 3 + 2] = Math.sin(angle) * radius
        }
      }

      // ── 4 · Terrain — a wave landscape ────────────────────────────────
      // Striations become the rows of a wireframe running away to the horizon,
      // which is why the reference terrain reads as a surface rather than a
      // dust field.
      {
        const x = (v - 0.5) * 90
        const z = (u - 0.5) * 70
        const h =
          Math.sin(x * 0.12 + z * 0.07) * 1.5 +
          Math.sin(x * 0.05 - z * 0.11) * 2.4 +
          (fbm(x * 0.06, z * 0.06, 2.7) - 0.5) * 3.2

        shapes.terrain[i * 3 + 0] = x
        shapes.terrain[i * 3 + 1] = -11 + h
        shapes.terrain[i * 3 + 2] = z
      }

      // ── 5 · Black hole — an accretion disc, seen face-on ──────────────
      // Built in the XY plane rather than XZ so the camera looks *into* the
      // hole. In XZ it presents edge-on from the default vantage and reads as a
      // streak, which is not what a black hole shot looks like.
      //
      // The centre is genuinely evacuated rather than merely dark: particles
      // start at the photon-sphere radius. A dark overlay on a full disc reads
      // as a sticker; an actual hole reads as a hole.
      {
        const angle = u * TAU + v * 1.4
        const EVENT_HORIZON = 6.5
        const r = EVENT_HORIZON + Math.pow(v, 1.5) * 30
        const warp = fbm(Math.cos(angle) * 2, Math.sin(angle) * 2, v * 4) - 0.5
        // The disc thins with radius, as accretion discs do.
        const thickness = (1 - v * 0.8) * 2.4

        shapes.blackhole[i * 3 + 0] = Math.cos(angle) * r
        shapes.blackhole[i * 3 + 1] = Math.sin(angle) * r
        shapes.blackhole[i * 3 + 2] = warp * thickness
      }

      uArr[i] = u
      vArr[i] = v
      seedArr[i] = hash3(line * 1.7, p * 2.3, 9.1)
      i++
    }
  }

  return { shapes, u: uArr, v: vArr, seed: seedArr, count }
}

/**
 * Scroll progress → the five formation weights.
 *
 * Weights always sum to 1: they are interpolation coefficients, and if allowed
 * to under-sum every particle drifts toward the origin mid-transition and the
 * whole structure collapses inward.
 *
 * Each formation gets a plateau where it is simply itself. Without the
 * plateaus the page is one continuous unresolved morph and no single shape
 * ever registers.
 */
const STAGES = [
  { hold: 0.14, morph: 0.26 },
  { hold: 0.36, morph: 0.48 },
  { hold: 0.58, morph: 0.7 },
  { hold: 0.8, morph: 0.9 },
] as const

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export function formationWeights(journey: number): number[] {
  const s = STAGES.map((stage) => smoothstep(stage.hold, stage.morph, journey))
  return [
    1 - s[0]!,
    s[0]! * (1 - s[1]!),
    s[0]! * s[1]! * (1 - s[2]!),
    s[0]! * s[1]! * s[2]! * (1 - s[3]!),
    s[0]! * s[1]! * s[2]! * s[3]!,
  ]
}

/**
 * Camera per formation. Each shape needs a different vantage: the shell is seen
 * from inside its own radius so it fills the frame, the terrain from just above
 * the crests, the black hole face-on.
 */
export const FORMATION_CAMERA: Record<FormationName, { y: number; z: number; look: number }> = {
  // Just outside the shell's radius (15), close enough that its angular size
  // exceeds the field of view — so the silhouette runs off every edge and the
  // hollow centre frames the hero copy, exactly as the reference does. Inside
  // the radius you see the interior surface as a flat dotted grid instead.
  shell: { y: 0, z: 20.5, look: 0 },
  column: { y: 0, z: 34, look: 0 },
  helix: { y: 0, z: 30, look: 0 },
  // Low and looking down, so the crests sit in the lower third and the surface
  // recedes to a horizon rather than filling the frame.
  terrain: { y: 1.5, z: 34, look: -13 },
  blackhole: { y: 0, z: 62, look: 0 },
}
