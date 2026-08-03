/**
 * کهکشان — the spiral galaxy that sits behind everything on the home page.
 *
 * Particles are stored in *polar* form (radius, angle, height) rather than as
 * Cartesian positions, and the shader reconstructs xyz each frame. That is what
 * makes differential rotation possible: real galaxies rotate faster near the
 * core, so the arms trail and wind over time. Baking Cartesian positions would
 * force the whole disc to rotate rigidly, which reads as a spinning image
 * rather than as a galaxy.
 */

export type GalaxyOptions = {
  count: number
  /** Number of spiral arms. Two or four; three looks unbalanced at rest. */
  arms: number
  /** Outer radius in world units. */
  radius: number
  /** How tightly the arms wind. Higher = more revolutions across the disc. */
  spiral: number
  /** Angular scatter of particles away from the arm centreline. */
  scatter: number
  /** Vertical thickness at the core. Falls off toward the rim. */
  thickness: number
  /** Fraction of particles placed in the central bulge rather than the arms. */
  coreFraction: number
}

export const DEFAULT_GALAXY: GalaxyOptions = {
  count: 20000,
  arms: 4,
  radius: 26,
  spiral: 2.4,
  scatter: 0.42,
  thickness: 1.5,
  coreFraction: 0.22,
}

export type GalaxyCloud = {
  /** Distance from the galactic centre, world units. */
  radius: Float32Array
  /** Starting angle, radians. */
  angle: Float32Array
  /** Height above the galactic plane. */
  height: Float32Array
  /** Per-particle random, for twinkle and colour variation. */
  seed: Float32Array
  count: number
}

/**
 * Box–Muller. Uniform random scattered around an arm produces a hard-edged
 * band; a normal distribution gives the soft falloff arms actually have.
 */
function gaussian(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function buildGalaxy(options: Partial<GalaxyOptions> = {}): GalaxyCloud {
  const opts = { ...DEFAULT_GALAXY, ...options }
  const { count, arms, radius, spiral, scatter, thickness, coreFraction } = opts

  const radiusArr = new Float32Array(count)
  const angleArr = new Float32Array(count)
  const heightArr = new Float32Array(count)
  const seedArr = new Float32Array(count)

  const coreCount = Math.floor(count * coreFraction)

  for (let i = 0; i < count; i++) {
    const inCore = i < coreCount
    let r: number
    let theta: number

    if (inCore) {
      // Central bulge: dense, roughly spherical, no arm structure.
      r = Math.pow(Math.random(), 2.2) * radius * 0.16
      theta = Math.random() * Math.PI * 2
    } else {
      // Disc: pow > 1 concentrates particles toward the centre, which is what
      // gives a galaxy its bright core and sparse rim. A uniform radius would
      // pile particles at the edge, since area grows with r².
      r = Math.pow(Math.random(), 2.1) * radius
      const arm = Math.floor(Math.random() * arms) * ((Math.PI * 2) / arms)
      // Logarithmic spiral: angle advances with radius.
      const wind = (r / radius) * spiral * Math.PI * 2
      // Scatter narrows with radius so arms stay defined far out instead of
      // dissolving into an even haze.
      theta = arm + wind + gaussian() * scatter * (1 - (r / radius) * 0.55)
    }

    // Thin disc, thick bulge.
    const heightFalloff = inCore ? 0.5 : Math.max(0.08, 1 - r / radius)
    radiusArr[i] = r
    angleArr[i] = theta
    heightArr[i] = gaussian() * thickness * heightFalloff * 0.5
    seedArr[i] = Math.random()
  }

  return { radius: radiusArr, angle: angleArr, height: heightArr, seed: seedArr, count }
}
