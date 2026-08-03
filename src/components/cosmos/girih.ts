/**
 * گره — girih geometry, sampled into points and wrapped onto a torus.
 *
 * The ring at the centre of the cosmos is not a random particle torus. Its
 * points trace a periodic Persian «شمسه» (shamseh) lattice: ten-pointed star
 * rosettes on a regular grid, joined by straight straps, exactly as the
 * geometry appears in tilework. From a distance it reads as a glowing ring;
 * up close it resolves into Persian ornament.
 *
 * Everything is generated in normalised (u, v) ∈ [0,1)² lattice space and then
 * mapped onto the torus, so the pattern wraps seamlessly in both directions —
 * there is no visible seam where the ring closes.
 */

export type GirihOptions = {
  /** Rosettes around the major circumference. */
  cellsU: number
  /** Rosettes around the minor circumference. */
  cellsV: number
  /** Points of each star. 10 = decagonal, the canonical girih symmetry. */
  starPoints: number
  /** Star outer radius, in cell units (0.5 = touching the cell edge). */
  outerRadius: number
  /** Ratio of inner to outer radius. ~0.42 gives classic girih proportions. */
  innerRatio: number
  /** Sample density along each strapwork segment. */
  pointsPerSegment: number
  /** Torus major radius (world units). */
  majorRadius: number
  /** Torus tube radius (world units). */
  minorRadius: number
}

export const DEFAULT_GIRIH: GirihOptions = {
  cellsU: 24,
  cellsV: 5,
  starPoints: 10,
  outerRadius: 0.46,
  innerRatio: 0.42,
  pointsPerSegment: 5,
  // Sized so the ring fills the viewport at the hero camera distance, the way
  // the reference composition does — the ring is the subject, not an accent.
  majorRadius: 3.5,
  // A fat tube. The reference ring is thick and irregular; turbulence in the
  // shader then feathers its edges into wisps, which a thin tube cannot do.
  minorRadius: 0.78,
}

export type GirihPointCloud = {
  /** xyz triples on the torus surface. */
  positions: Float32Array
  /**
   * Per-point angle around the major circumference, 0..1.
   * Drives the ember → firouzeh colour ramp in the shader: hue is a function
   * of *where the point sits on the ring*, not of time, so the ring holds a
   * stable warm-top / cool-bottom gradient as it rotates.
   */
  ringAngle: Float32Array
  /** Per-point random 0..1, for de-synchronising twinkle and drift. */
  seed: Float32Array
  /**
   * Angle around the *tube* cross-section, 0..1.
   * Lets the shader make points near the tube's outer edge wispier than those
   * at its core, which is what turns a solid ring into a feathered plasma one.
   */
  tubeAngle: Float32Array
  count: number
}

type Vec2 = readonly [number, number]

/** Vertices of one star rosette, alternating outer and inner radius. */
function starVertices(points: number, outer: number, inner: number): Vec2[] {
  const verts: Vec2[] = []
  const steps = points * 2
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 === 0 ? outer : inner
    verts.push([Math.cos(angle) * r, Math.sin(angle) * r])
  }
  return verts
}

/**
 * Strapwork segments for a single lattice cell, in cell-local coordinates
 * spanning [0,1)². Returns the closed star outline plus the straps that run to
 * the neighbouring cells in +u and +v. Because each cell only ever emits its
 * "forward" straps, adjacent cells join up without drawing anything twice.
 */
function cellSegments(opts: GirihOptions): Array<[Vec2, Vec2]> {
  const { starPoints, outerRadius, innerRatio } = opts
  const verts = starVertices(starPoints, outerRadius, outerRadius * innerRatio)
  const segments: Array<[Vec2, Vec2]> = []

  // Star outline.
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!
    const b = verts[(i + 1) % verts.length]!
    segments.push([a, b])
  }

  // Straps to the next cell along each axis. They leave from the star tip
  // nearest that axis, which is what keeps the join looking like continuous
  // interlaced ribbon rather than a line bolted onto a star.
  const tipAt = (targetAngle: number): Vec2 => {
    let best = verts[0]!
    let bestDelta = Infinity
    for (let i = 0; i < verts.length; i += 2) {
      const v = verts[i]!
      const angle = Math.atan2(v[1], v[0])
      const delta = Math.abs(Math.atan2(Math.sin(angle - targetAngle), Math.cos(angle - targetAngle)))
      if (delta < bestDelta) {
        bestDelta = delta
        best = v
      }
    }
    return best
  }

  const tipU = tipAt(0)
  const tipV = tipAt(Math.PI / 2)

  // The neighbouring cell's centre sits one cell width away, at local x = 1
  // (or y = 1). Its tip pointing back toward us is that centre minus our own
  // tip offset — so the strap spans tip → (1 - tipOffset), closing the gap
  // between two adjacent rosettes.
  segments.push([tipU, [1 - tipU[0], tipU[1]]])
  segments.push([tipV, [tipV[0], 1 - tipV[1]]])

  return segments
}

export function buildGirihTorus(options: Partial<GirihOptions> = {}): GirihPointCloud {
  const opts: GirihOptions = { ...DEFAULT_GIRIH, ...options }
  const { cellsU, cellsV, pointsPerSegment, majorRadius, minorRadius } = opts

  const segments = cellSegments(opts)
  const total = cellsU * cellsV * segments.length * pointsPerSegment

  const positions = new Float32Array(total * 3)
  const ringAngle = new Float32Array(total)
  const seed = new Float32Array(total)
  const tubeAngle = new Float32Array(total)

  let n = 0
  for (let cu = 0; cu < cellsU; cu++) {
    for (let cv = 0; cv < cellsV; cv++) {
      for (const [a, b] of segments) {
        for (let s = 0; s < pointsPerSegment; s++) {
          const t = s / pointsPerSegment

          // Lattice space, wrapped.
          const lu = (cu + 0.5 + a[0] + (b[0] - a[0]) * t) / cellsU
          const lv = (cv + 0.5 + a[1] + (b[1] - a[1]) * t) / cellsV
          const u = lu - Math.floor(lu)
          const v = lv - Math.floor(lv)

          // Torus mapping. u wraps the major circumference, v the tube.
          const theta = u * Math.PI * 2
          const phi = v * Math.PI * 2
          const ringRadius = majorRadius + minorRadius * Math.cos(phi)

          positions[n * 3 + 0] = Math.cos(theta) * ringRadius
          positions[n * 3 + 1] = Math.sin(theta) * ringRadius
          positions[n * 3 + 2] = Math.sin(phi) * minorRadius

          ringAngle[n] = u
          tubeAngle[n] = v
          seed[n] = Math.random()
          n++
        }
      }
    }
  }

  return { positions, ringAngle, seed, tubeAngle, count: n }
}

/**
 * Alternative target positions for the same particles.
 *
 * The cosmos has three formations — ring, column, terrain — and scrolling
 * morphs between them. Rather than three separate particle systems that
 * cross-fade (which reads as one thing disappearing and another appearing),
 * every formation is a *destination* for the same points, blended in the vertex
 * shader. The ring genuinely unravels into the column and the column collapses
 * into the landscape, which is what makes the journey feel continuous.
 *
 * Each point keeps its identity across formations: its position in one is
 * derived from the same (ringAngle, tubeAngle, seed) triple as in the others,
 * so neighbours stay neighbours and the morph reads as flow, not as noise.
 */
export function buildFormations(cloud: GirihPointCloud) {
  const { count, ringAngle, tubeAngle, seed } = cloud

  const column = new Float32Array(count * 3)
  const terrain = new Float32Array(count * 3)

  const COLUMN_HEIGHT = 13
  const COLUMN_RADIUS = 1.5
  const TERRAIN_WIDTH = 26
  const TERRAIN_DEPTH = 20

  for (let i = 0; i < count; i++) {
    const u = ringAngle[i]!
    const v = tubeAngle[i]!
    const s = seed[i]!

    // ── Column ──────────────────────────────────────────────────────────────
    // A rising pillar. Height comes from the seed so points distribute along it
    // evenly; the angle is inherited from the ring so the lattice appears to
    // stretch vertically rather than scatter.
    const columnY = (s - 0.5) * COLUMN_HEIGHT
    // Waist: narrower at top and bottom, fullest in the middle, matching the
    // reference's plume silhouette.
    const waist = 1 - Math.abs(columnY / (COLUMN_HEIGHT * 0.5)) ** 2 * 0.55
    const columnAngle = u * Math.PI * 2 + v * 1.4
    const columnRadius = COLUMN_RADIUS * waist * (0.45 + v * 0.9)

    column[i * 3 + 0] = Math.cos(columnAngle) * columnRadius
    column[i * 3 + 1] = columnY
    column[i * 3 + 2] = Math.sin(columnAngle) * columnRadius

    // ── Terrain ─────────────────────────────────────────────────────────────
    // A wave landscape sitting below the camera and receding to the horizon.
    // Height is a sum of two incommensurable sine waves, which gives rolling
    // dunes without the visible tiling a single frequency produces.
    const tx = (u - 0.5) * TERRAIN_WIDTH
    const tz = (s - 0.5) * TERRAIN_DEPTH
    const ty =
      -3.6 +
      Math.sin(tx * 0.42 + tz * 0.21) * 0.5 +
      Math.sin(tx * 0.17 - tz * 0.33) * 0.75 +
      (v - 0.5) * 0.25

    terrain[i * 3 + 0] = tx
    terrain[i * 3 + 1] = ty
    terrain[i * 3 + 2] = tz
  }

  return { column, terrain }
}

/**
 * A spherical shell of stars around the camera. Points are distributed by the
 * Fibonacci sphere method rather than by rejection sampling so the density is
 * genuinely even — random spherical coordinates clump badly at the poles, and
 * on a starfield that clumping is very visible.
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
