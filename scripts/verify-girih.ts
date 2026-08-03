/**
 * Numeric sanity check for the girih torus generator.
 *
 * The geometry runs on the GPU where a mistake shows up as an invisible or
 * malformed ring with no error message, so it is worth asserting the maths
 * here in plain Node where failures are loud.
 *
 *   pnpm tsx scripts/verify-girih.ts
 */

import { buildGirihTorus, buildStarShell, DEFAULT_GIRIH } from '../src/components/cosmos/girih'

let failures = 0

function check(label: string, condition: boolean, detail = '') {
  const mark = condition ? 'PASS' : 'FAIL'
  if (!condition) failures++
  console.log(`${mark}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const cloud = buildGirihTorus()
const { majorRadius, minorRadius } = DEFAULT_GIRIH

check('produces points', cloud.count > 0, `${cloud.count.toLocaleString()} points`)
check('positions array matches count', cloud.positions.length === cloud.count * 3)
check('ringAngle array matches count', cloud.ringAngle.length === cloud.count)

let nan = 0
let minDist = Infinity
let maxDist = -Infinity
let minZ = Infinity
let maxZ = -Infinity

for (let i = 0; i < cloud.count; i++) {
  const x = cloud.positions[i * 3]!
  const y = cloud.positions[i * 3 + 1]!
  const z = cloud.positions[i * 3 + 2]!

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nan++

  // Distance from the torus axis must stay within [major - minor, major + minor].
  const radial = Math.hypot(x, y)
  minDist = Math.min(minDist, radial)
  maxDist = Math.max(maxDist, radial)
  minZ = Math.min(minZ, z)
  maxZ = Math.max(maxZ, z)
}

const epsilon = 1e-6
check('no NaN or Infinity in positions', nan === 0, `${nan} bad values`)
check(
  'points lie on the torus surface',
  minDist >= majorRadius - minorRadius - epsilon && maxDist <= majorRadius + minorRadius + epsilon,
  `radial ∈ [${minDist.toFixed(3)}, ${maxDist.toFixed(3)}], expected [${(majorRadius - minorRadius).toFixed(3)}, ${(majorRadius + minorRadius).toFixed(3)}]`,
)
check(
  'tube depth within minor radius',
  Math.abs(minZ) <= minorRadius + epsilon && Math.abs(maxZ) <= minorRadius + epsilon,
  `z ∈ [${minZ.toFixed(3)}, ${maxZ.toFixed(3)}]`,
)

// The ring must be populated all the way around: a gap would show as a dark
// wedge. Bucket by ring angle and require every bucket to be occupied.
const BUCKETS = 36
const histogram = new Array<number>(BUCKETS).fill(0)
for (let i = 0; i < cloud.count; i++) {
  const bucket = Math.min(BUCKETS - 1, Math.floor(cloud.ringAngle[i]! * BUCKETS))
  histogram[bucket] = (histogram[bucket] ?? 0) + 1
}
const emptyBuckets = histogram.filter((value) => value === 0).length
const minBucket = Math.min(...histogram)
const maxBucket = Math.max(...histogram)

check('ring has no empty wedges', emptyBuckets === 0, `${emptyBuckets}/${BUCKETS} empty`)
check(
  'ring density is even',
  maxBucket / Math.max(1, minBucket) < 2.5,
  `min ${minBucket}, max ${maxBucket}, ratio ${(maxBucket / Math.max(1, minBucket)).toFixed(2)}`,
)
check(
  'ringAngle stays normalised',
  cloud.ringAngle.every((value) => value >= 0 && value < 1),
)

// Star shell.
const shell = buildStarShell(2000, 40)
let shellNaN = 0
let shellMin = Infinity
let shellMax = -Infinity
for (let i = 0; i < shell.count; i++) {
  const x = shell.positions[i * 3]!
  const y = shell.positions[i * 3 + 1]!
  const z = shell.positions[i * 3 + 2]!
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) shellNaN++
  const r = Math.hypot(x, y, z)
  shellMin = Math.min(shellMin, r)
  shellMax = Math.max(shellMax, r)
}
check('star shell has no NaN', shellNaN === 0)
check(
  'star shell radius is bounded',
  shellMin > 40 * 0.8 && shellMax < 40 * 1.2,
  `r ∈ [${shellMin.toFixed(1)}, ${shellMax.toFixed(1)}]`,
)

console.log(
  `\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`,
)
process.exit(failures === 0 ? 0 : 1)
