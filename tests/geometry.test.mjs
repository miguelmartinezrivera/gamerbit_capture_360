import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaults } from '../src/types/capture.ts'
import { basis, coverage, direction, distance, dot, footprint, generateTargets, geometricOverlap, sphereSamples, wrap } from '../src/utils/geometry.ts'
import { cameraPose } from '../src/services/sensors.ts'

const pose = (yaw, pitch = 0, roll = 0) => ({ yaw, pitch, roll })
const approx = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, String(actual))
test('normalizes azimuth and handles poles and the seam', () => {
  assert.equal(wrap(540), -180)
  assert.equal(wrap(-181), 179)
  approx(distance(pose(179), pose(-179)), 2)
  approx(distance(pose(140, 90), pose(-70, 90)), 0)
  approx(distance(pose(0, 90), pose(0, -90)), 180)
})
test('uses the rear optical axis and device roll', () => {
  const sample = (alpha, beta, gamma = 0) => cameraPose({ alpha, beta, gamma }, 0)
  for (const value of Object.values(sample(0, 90))) approx(value, 0)
  approx(sample(270, 90).yaw, 90)
  approx(sample(0, 120).pitch, 30)
  approx(sample(0, 90, 20).yaw, -20)
  approx(cameraPose({ alpha: 0, beta: 90, gamma: 0 }, 90).roll, 90)
  assert.equal(cameraPose({ alpha: null, beta: 90, gamma: 0 }, 0), null)
})
test('each supported overlap covers the sphere with conservative target footprints', () => {
  const samples = sphereSamples(8192)
  for (const overlap of [30, 40, 50, 60]) {
    for (const [horizontal, vertical] of [[20, 20], [28, 78], [48, 64], [100, 24], [120, 120]]) {
      const settings = { ...defaults, overlap, horizontal, vertical }
      const targets = generateTargets(settings)
      const reduced = { horizontal: horizontal * (1 - overlap / 100), vertical: vertical * (1 - overlap / 100) }
      assert.equal(coverage(targets, reduced, samples), 100, JSON.stringify(settings))
      assert.equal(targets.filter(target => Math.abs(target.pitch) === 90).length, 2)
      assert.equal(new Set(targets.map(target => target.yaw + ',' + target.pitch)).size, targets.length)
      assert.deepEqual(targets[0], { id: 1, ...pose(0) })
    }
  }
})
test('target density increases with overlap and decreases with wider FOV', () => {
  assert.ok(generateTargets({ ...defaults, overlap: 60 }).length > generateTargets({ ...defaults, overlap: 30 }).length)
  assert.ok(generateTargets({ ...defaults, horizontal: 110, vertical: 100 }).length < generateTargets(defaults).length)
})
test('coverage measures union of rolled rectangular optical footprints', () => {
  const a = pose(0), b = pose(180), rolled = pose(0, 0, 90)
  approx(dot(basis(rolled).up, basis(rolled).forward), 0)
  assert.equal(coverage([], defaults), 0)
  assert.equal(coverage([a, a], defaults), coverage([a], defaults))
  approx(coverage([a, b], defaults), coverage([a], defaults) * 2, 0.2)
  assert.equal(geometricOverlap(a, a, defaults), 100)
  assert.equal(geometricOverlap(a, b, defaults), 0)
  assert.equal(footprint(a, defaults)(direction(28, 0)), false)
  assert.equal(footprint(rolled, defaults)(direction(28, 0)), true)
})
