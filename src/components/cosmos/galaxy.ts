/**
 * کهکشان — the galaxy, and the three other galaxies it becomes.
 *
 * Scrolling does not fly into the galaxy; it *transforms* it. The disc runs
 * through the Hubble sequence — grand-design spiral → barred spiral →
 * elliptical → ring — with the same particles finding new positions each time.
 * Using real morphological classes rather than invented shapes means each stage
 * is recognisably a galaxy rather than a particle effect.
 *
 * Every shape is stored in *polar* form (radius, angle, height) and the shader
 * reconstructs Cartesian positions each frame. That is what makes differential
 * rotation possible — angular velocity falls with radius, so arms trail and
 * wind. It also means a morph blends radius and angle independently, so the
 * disc reorganises along its own geometry instead of points flying in straight
 * lines through the middle.
 *
 * The critical constraint: a particle's identity is fixed once. Its position in
 * every shape derives from the same (rank, arm, scatter, phase) values, so
 * neighbours stay neighbours across a morph and the transition reads as the
 * galaxy *reshaping* rather than dissolving and reforming.
 */

export type GalaxyOptions = {
  count: number
  /** Outer radius, world units. */
  radius: number
  /** Spiral arms. Two gives the classic grand-design look. */
  arms: number
  /** Arm winding: revolutions from core to rim. */
  spiral: number
  /** Angular scatter away from the arm centreline. */
  scatter: number
  /** Disc thickness at the core, falling off toward the rim. */
  thickness: number
  /** Share of particles in the central bulge. */
  coreFraction: number
  /** Share in the sparse outer halo. */
  haloFraction: number
}

export const DEFAULT_GALAXY: GalaxyOptions = {
  count: 40000,
  // Large from the first frame — the galaxy never grows, it only changes shape.
  radius: 46,
  arms: 2,
  spiral: 1.9,
  scatter: 0.34,
  thickness: 2.4,
  coreFraction: 0.16,
  haloFraction: 0.1,
}

/** The four morphologies, in scroll order. */
export const SHAPE_NAMES = ['spiral', 'barred', 'elliptical', 'ring'] as const
export type ShapeName = (typeof SHAPE_NAMES)[number]

export type GalaxyCloud = {
  /**
   * Four shapes × (radius, angle, height), interleaved as vec3 per shape.
   * Uploaded as four separate vertex attributes.
   */
  shapes: Record<ShapeName, Float32Array>
  seed: Float32Array
  /** 0 bulge · 1 disc · 2 halo. */
  kind: Float32Array
  /** Radial rank 0..1, stable across shapes — drives the colour ramp. */
  rank: Float32Array
  count: number
}

/** Box–Muller. Uniform scatter gives arms a hard edge; normal gives real falloff. */
function gaussian(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function buildGalaxy(options: Partial<GalaxyOptions> = {}): GalaxyCloud {
  const opts = { ...DEFAULT_GALAXY, ...options }
  const { count, radius, arms, spiral, scatter, thickness, coreFraction, haloFraction } = opts

  const shapes = {
    spiral: new Float32Array(count * 3),
    barred: new Float32Array(count * 3),
    elliptical: new Float32Array(count * 3),
    ring: new Float32Array(count * 3),
  }
  const seedArr = new Float32Array(count)
  const kindArr = new Float32Array(count)
  const rankArr = new Float32Array(count)

  const coreCount = Math.floor(count * coreFraction)
  const haloCount = Math.floor(count * haloFraction)

  /** Where the bar ends, as a fraction of the outer radius. */
  const BAR_END = 0.38

  for (let i = 0; i < count; i++) {
    // ── Fixed identity, shared by every shape ────────────────────────────
    const isCore = i < coreCount
    const isHalo = !isCore && i < coreCount + haloCount
    const kind = isCore ? 0 : isHalo ? 2 : 1

    // Radial rank. pow > 1 concentrates toward the centre; a uniform rank piles
    // particles at the rim, because area grows with r².
    const rank = isCore
      ? Math.pow(Math.random(), 2.4) * 0.18
      : isHalo
        ? 0.6 + Math.random() * 0.55
        : Math.pow(Math.random(), 1.85)

    const armIndex = Math.floor(Math.random() * arms)
    const armAngle = armIndex * ((Math.PI * 2) / arms)
    const g1 = gaussian()
    const g2 = gaussian()
    const phase = Math.random() * Math.PI * 2
    const seed = Math.random()

    const r = rank * radius
    const heightFalloff = isCore ? 0.9 : isHalo ? 2.4 : Math.max(0.1, 1 - rank)

    // ── 1 · Grand-design spiral ──────────────────────────────────────────
    {
      const wind = rank * spiral * Math.PI * 2
      const theta =
        isCore || isHalo ? phase : armAngle + wind + g1 * scatter * (1 - rank * 0.5)
      shapes.spiral[i * 3 + 0] = r
      shapes.spiral[i * 3 + 1] = theta
      shapes.spiral[i * 3 + 2] = g2 * thickness * heightFalloff * 0.5
    }

    // ── 2 · Barred spiral ────────────────────────────────────────────────
    // Inside the bar radius, particles collapse onto a straight bar through the
    // core; outside it, arms spring from the bar's ends. Modelling the bar as a
    // *straight* structure is what visually separates SB from S — a barred
    // spiral whose centre still curves just looks like a spiral.
    {
      const barAxis = armIndex % 2 === 0 ? 0 : Math.PI
      let theta: number
      let barRadius = r

      if (isCore || isHalo) {
        theta = phase
      } else if (rank < BAR_END) {
        // Along the bar. Width is specified in *world units* and converted to
        // an angle by dividing by radius — a constant angular scatter would
        // pinch the bar to a point at the centre and flare it at the ends,
        // which is the opposite of how a bar looks.
        const BAR_HALF_WIDTH = radius * 0.055
        barRadius = r * 1.2
        theta = barAxis + (g1 * BAR_HALF_WIDTH) / Math.max(barRadius, 2.5)
      } else {
        // Arms begin at the bar ends and wind outward from there.
        const t = (rank - BAR_END) / (1 - BAR_END)
        theta = barAxis + t * spiral * Math.PI * 1.5 + g1 * scatter * (1 - t * 0.5)
      }

      shapes.barred[i * 3 + 0] = barRadius
      shapes.barred[i * 3 + 1] = theta
      shapes.barred[i * 3 + 2] = g2 * thickness * heightFalloff * 0.45
    }

    // ── 3 · Elliptical ───────────────────────────────────────────────────
    // No arms, no disc: a smooth ellipsoid of old stars. An elliptical is a
    // *volume*, not a plate, so this distributes points over a sphere of the
    // particle's own radius and then flattens it — the E4 axis ratio.
    //
    // Height must scale with the particle's own radius, never with the galaxy
    // radius: doing the latter gives core particles (tiny radius) a full-galaxy
    // vertical spread and the whole thing renders as a spike through the middle.
    {
      const r3 = Math.pow(rank, 0.72) * radius * 0.62
      // acos of a uniform variable gives points spread evenly over the sphere;
      // a uniform polar angle would bunch them at the poles.
      const polar = Math.acos(1 - 2 * Math.random())
      const FLATTEN = 0.58

      shapes.elliptical[i * 3 + 0] = r3 * Math.sin(polar)
      shapes.elliptical[i * 3 + 1] = phase
      shapes.elliptical[i * 3 + 2] = r3 * Math.cos(polar) * FLATTEN
    }

    // ── 4 · Ring galaxy ──────────────────────────────────────────────────
    // A collisional ring: star formation swept into a narrow annulus, core
    // largely evacuated. The remapping pushes every rank into a tight band.
    {
      // 0.56 rather than 0.74: at the camera's pitch a wider ring runs off the
      // bottom of the frame and only its far arc stays visible, which reads as
      // a broken arc rather than a ring.
      const band = 0.56 + g1 * 0.045
      // The bulge keeps a small remnant nucleus rather than emptying entirely,
      // which is what real collisional ring galaxies look like.
      const ringRadius = isCore ? rank * radius * 0.4 : band * radius
      shapes.ring[i * 3 + 0] = ringRadius
      shapes.ring[i * 3 + 1] = phase
      shapes.ring[i * 3 + 2] = g2 * thickness * 0.4 * (isCore ? 1.6 : 0.5)
    }

    seedArr[i] = seed
    kindArr[i] = kind
    rankArr[i] = Math.min(1, rank)
  }

  return { shapes, seed: seedArr, kind: kindArr, rank: rankArr, count }
}

/**
 * A spherical shell of distant stars around the camera.
 *
 * Fibonacci distribution rather than random spherical coordinates — the latter
 * clumps badly at the poles, and on a starfield that clumping is very visible.
 */
export function buildStarShell(count: number, radius: number, spread = 0.35) {
  const positions = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  const golden = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    const jitter = 1 + (Math.random() - 0.5) * spread

    positions[i * 3 + 0] = Math.cos(theta) * r * radius * jitter
    positions[i * 3 + 1] = y * radius * jitter
    positions[i * 3 + 2] = Math.sin(theta) * r * radius * jitter
    seed[i] = Math.random()
  }

  return { positions, seed, count }
}

/**
 * Scroll progress → the four shape weights.
 *
 * Weights always sum to 1: they are interpolation coefficients, and if they are
 * allowed to under-sum every particle drifts toward the origin mid-transition
 * and the whole galaxy collapses inward.
 *
 * The plateaus matter as much as the transitions. Each morphology needs a
 * stretch where it is simply itself and the reader can look at it; without
 * them the page is one continuous unresolved morph.
 */
export const SHAPE_SCHEDULE = [
  { hold: 0.2, morphTo: 0.34 }, // spiral
  { hold: 0.48, morphTo: 0.62 }, // barred
  { hold: 0.76, morphTo: 0.88 }, // elliptical
] as const

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function shapeWeights(journey: number): [number, number, number, number] {
  const a = smoothstep(SHAPE_SCHEDULE[0].hold, SHAPE_SCHEDULE[0].morphTo, journey)
  const b = smoothstep(SHAPE_SCHEDULE[1].hold, SHAPE_SCHEDULE[1].morphTo, journey)
  const c = smoothstep(SHAPE_SCHEDULE[2].hold, SHAPE_SCHEDULE[2].morphTo, journey)

  return [1 - a, a * (1 - b), a * b * (1 - c), a * b * c]
}
