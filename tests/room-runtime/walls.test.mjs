import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildWall, wallShape } from '../../packages/room-runtime/walls.ts';

const plain = { wall: new THREE.MeshBasicMaterial(), trim: new THREE.MeshBasicMaterial() };
const door = { kind: 'rect', u0: 0.7, u1: 1.5, v0: 0, v1: 1.7, casing: true };
const windowOpening = { kind: 'rect', u0: 3.5, u1: 4.5, v0: 0.8, v1: 1.7 };
function wall(overrides = {}) {
  return { name: 'fictional-gable', origin: new THREE.Vector3(), u: new THREE.Vector3(1, 0, 0),
    n: new THREE.Vector3(0, 0, 1), length: 6, thickness: 0.25, panels: [], crown: false, ext: [0, 0],
    openings: [], topProfile: [[0, 2], [3, 4], [6, 2]], ...overrides };
}
function rectangle(overrides = {}) {
  const { topProfile, ...definition } = wall();
  return { ...definition, height: 3, ...overrides };
}
function close(a, b, tolerance = 1e-5) { assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`); }
function area(points) {
  return Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;
}
function triangles(geometry) {
  const p = geometry.attributes.position, index = geometry.index;
  return Array.from({ length: (index?.count ?? p.count) / 3 }, (_, i) =>
    [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i * 3 + j) : i * 3 + j)));
}
function covers(geometry, x, y) {
  return triangles(geometry).some(triangle => {
    const signs = triangle.map((a, i) => {
      const b = triangle[(i + 1) % 3];
      return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    });
    return signs.every(s => s >= -1e-6) || signs.every(s => s <= 1e-6);
  });
}
// Independently clip each cap triangle to an opening; any positive area is filled-in glass/door space.
function intersectionArea(triangle, opening) {
  let polygon = triangle.map(p => [p.x, p.y]);
  for (const [axis, bound, sign] of [[0, opening.u0, 1], [0, opening.u1, -1],
    [1, opening.v0, 1], [1, opening.v1, -1]]) {
    const clipped = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = (a[axis] - bound) * sign, db = (b[axis] - bound) * sign;
      if (da >= 0) clipped.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        clipped.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    polygon = clipped;
  }
  return area(polygon);
}

test('rectangle area, extension, and arch hole behavior remain supported', () => {
  const shape = wallShape(rectangle({ ext: [0.2, 0.1], openings: [
    { kind: 'arch', u0: 2, u1: 4, v0: 0.5, spring: 1.5 },
  ] }));
  const points = shape.extractPoints(96);
  close(Math.abs(THREE.ShapeUtils.area(points.shape)), 6.3 * 3);
  assert.equal(shape.holes.length, 1);
  close(Math.abs(THREE.ShapeUtils.area(points.holes[0])), 2 + Math.PI / 2, 0.001);
});

test('gable slope and peak replace the rectangular top', () => {
  const shape = wallShape(wall());
  const geometry = new THREE.ShapeGeometry(shape);
  close(Math.abs(THREE.ShapeUtils.area(shape.getPoints())), 18);
  assert.equal(covers(geometry, 3, 3.8), true);
  assert.equal(covers(geometry, 0.5, 3.5), false);
  geometry.computeBoundingBox();
  close(geometry.boundingBox.max.y, 4);
});

test('asymmetric top retains its interior low point', () => {
  const shape = wallShape(wall({ topProfile: [[0, 2.6], [1, 3.5], [3, 1.5], [6, 2.4]] }));
  close(Math.abs(THREE.ShapeUtils.area(shape.getPoints())), 13.9);
  const geometry = new THREE.ShapeGeometry(shape);
  assert.equal(covers(geometry, 1, 3.3), true);
  assert.equal(covers(geometry, 3, 1.8), false);
});

test('door notches and window holes leave no filled cap triangles', () => {
  const shape = wallShape(wall({ openings: [windowOpening, door] }));
  assert.equal(shape.holes.length, 1);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false });
  let frontArea = 0;
  for (const triangle of triangles(geometry)) {
    assert.ok(triangle.every(p => [p.x, p.y, p.z].every(Number.isFinite)));
    assert.ok(new THREE.Vector3().subVectors(triangle[1], triangle[0])
      .cross(new THREE.Vector3().subVectors(triangle[2], triangle[0])).length() > 1e-8);
    if (!triangle.every(p => Math.abs(p.z - triangle[0].z) < 1e-6)) continue;
    for (const opening of [door, windowOpening]) close(intersectionArea(triangle, opening), 0);
    if (Math.abs(triangle[0].z) < 1e-6) frontArea += area(triangle.map(p => [p.x, p.y]));
  }
  close(frontArea, 18 - 0.8 * 1.7 - 1 * 0.9);
});

test('buildWall preserves transforms, thickness, painted ends, and trim reveals', () => {
  const definition = wall({ origin: new THREE.Vector3(1, 0.2, -3), u: new THREE.Vector3(0, 0, 1),
    n: new THREE.Vector3(-1, 0, 0), openings: [door, windowOpening] });
  const group = buildWall(definition, plain);
  const slab = group.getObjectByName('slab');
  const bounds = new THREE.Box3().setFromObject(slab);
  close(bounds.min.x, 1); close(bounds.max.x, 1.25);
  close(bounds.min.y, 0.2); close(bounds.max.y, 4.2);
  close(bounds.min.z, -3); close(bounds.max.z, 3);
  assert.deepEqual(slab.material, [plain.wall, plain.trim]);
  const geometry = slab.geometry, p = geometry.attributes.position, index = geometry.index;
  let ends = 0, reveals = 0;
  for (const materialGroup of geometry.groups) {
    for (let i = materialGroup.start; i < materialGroup.start + materialGroup.count; i += 3) {
      const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, index.getX(i + j)));
      if (points.every(v => Math.abs(v.x) < 1e-6) || points.every(v => Math.abs(v.x - 6) < 1e-6)) {
        assert.equal(materialGroup.materialIndex, 0); ends++;
      }
      if (points.every(v => Math.abs(v.x - door.u0) < 1e-6)) {
        assert.equal(materialGroup.materialIndex, 1); reveals++;
      }
    }
  }
  assert.ok(ends > 0 && reveals > 0);
  assert.equal(group.getObjectByName('crown'), undefined);
});

test('default rectangular crown still follows the supplied wall height', () => {
  const definition = rectangle({ crown: undefined, height: 3.7 });
  const crown = buildWall(definition, plain).getObjectByName('crown');
  assert.ok(crown);
  close(new THREE.Box3().setFromObject(crown).max.y, 3.7);
});

test('rectangle default height and extensions remain unchanged', () => {
  const points = wallShape(rectangle({ height: undefined, ext: undefined })).getPoints();
  close(Math.abs(THREE.ShapeUtils.area(points)), 6.6 * 3.24);
});

const invalid = {
  'empty profile': { topProfile: [] },
  'single point': { topProfile: [[0, 2]] },
  'repeated u': { topProfile: [[0, 2], [0, 3], [6, 2]] },
  'decreasing u': { topProfile: [[0, 2], [4, 3], [2, 3], [6, 2]] },
  'missing left endpoint': { topProfile: [[0.01, 2], [6, 2]] },
  'missing right endpoint': { topProfile: [[0, 2], [5.99, 2]] },
  'zero height': { topProfile: [[0, 0], [6, 2]] },
  'negative height': { topProfile: [[0, 2], [3, -1], [6, 2]] },
  'nonfinite point': { topProfile: [[0, 2], [3, NaN], [6, 2]] },
  'malformed point': { topProfile: [[0, 2, 3], [6, 2]] },
  'conflicting height': { height: 4 },
  'end extensions': { ext: [0.1, 0] },
  'missing extension choice': { ext: undefined },
  'crown': { crown: true },
  'implicit crown': { crown: undefined },
  'panels': { panels: [[1, 1, 2, 2]] },
  'arch': { openings: [{ kind: 'arch', u0: 2, u1: 3, v0: 0.5, spring: 1.5 }] },
  'nonfinite opening': { openings: [{ ...windowOpening, v1: Infinity }] },
  'side contact': { openings: [{ ...windowOpening, u0: 0 }] },
  'top contact': { openings: [{ kind: 'rect', u0: 2, u1: 4, v0: 1, v1: 10 / 3 }] },
  'negative bottom': { openings: [{ ...door, v0: -0.1 }] },
  'reversed opening': { openings: [{ ...windowOpening, u0: 5, u1: 4 }] },
  'overlap': { openings: [windowOpening, { ...windowOpening, u0: 4, u1: 5 }] },
  'touching holes': { openings: [windowOpening, { ...windowOpening, u0: 4.5, u1: 5 }] },
  'interior low point': { topProfile: [[0, 2.6], [1, 3.5], [3, 1.5], [6, 2.4]],
    openings: [{ kind: 'rect', u0: 1, u1: 5, v0: 0.5, v1: 1.6 }] },
  'casing under slope': { openings: [{ kind: 'rect', u0: 0.2, u1: 0.7, v0: 1, v1: 2.1, casing: true }] },
  'casing at side': { openings: [{ ...door, u0: 0.05 }] },
  'casing hits another opening': { openings: [{ ...windowOpening, casing: true },
    { ...windowOpening, u0: 4.6, u1: 5.1, casing: true }] },
};
for (const [label, overrides] of Object.entries(invalid)) {
  test(`profile rejects ${label} before building a wall`, () => {
    for (const build of [wallShape, w => buildWall(w, plain)]) {
      assert.throws(() => build(wall(overrides)), /fictional-gable.*(profile|opening|casing|height|crown|ext|panel)/i);
    }
  });
}

test('submillimeter endpoint rounding is accepted without mutating authored data', () => {
  const definition = wall({ topProfile: [[0.0004, 2], [3, 4], [6.0004, 2]] });
  const before = structuredClone(definition.topProfile);
  const shape = wallShape(definition);
  close(Math.abs(THREE.ShapeUtils.area(shape.getPoints())), 18);
  assert.deepEqual(definition.topProfile, before);
});
