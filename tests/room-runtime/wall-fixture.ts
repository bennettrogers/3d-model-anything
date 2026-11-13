import * as THREE from 'three';
import { buildWall, type WallDef } from '../../packages/room-runtime/walls';

// Local visual fixture only; no captured data, demo registration, or production build entry.
const scene = new THREE.Scene();
scene.background = new THREE.Color('#18202b');
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas')!, antialias: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.OrthographicCamera();
camera.position.set(5, 5, 20);
camera.lookAt(0, 1.4, 0);
scene.add(new THREE.HemisphereLight('#ffffff', '#6b7887', 2));
const sun = new THREE.DirectionalLight('#ffffff', 2.4);
sun.position.set(-4, 8, 10);
scene.add(sun);
const trim = new THREE.MeshStandardMaterial({ color: '#f3eee5', roughness: 0.8 });
const colors = ['#cbd4e0', '#b9d9c7', '#d3c1de'];
for (let i = 0; i < 3; i++) {
  const common = {
    name: ['rectangle', 'gable', 'asymmetric'][i], origin: new THREE.Vector3(-10 + 7 * i, 0, 0),
    u: new THREE.Vector3(1, 0, 0), n: new THREE.Vector3(0, 0, 1), length: 6, thickness: 0.25,
    openings: [
      { kind: 'rect' as const, u0: 0.7, u1: 1.6, v0: 0, v1: 1.7, casing: true },
      { kind: 'rect' as const, u0: 3.5, u1: 4.6, v0: 0.8, v1: 1.7, casing: true },
    ],
  };
  const wall: WallDef = i === 0
    ? { ...common, height: 2.8, panels: [], crown: false, ext: [0, 0] }
    : { ...common, topProfile: i === 1 ? [[0, 2], [3, 4], [6, 2]]
      : [[0, 2.4], [2, 3.6], [4, 2.1], [6, 2.8]], panels: [], crown: false, ext: [0, 0] };
  const paint = new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.85 });
  // All used material paths are explicitly supplied, so the fixture loads no texture assets.
  scene.add(buildWall(wall, { wall: paint, trim }));
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 9), new THREE.MeshStandardMaterial({ color: '#526071' }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
scene.add(floor);

function render() {
  const width = window.innerWidth, height = Math.max(380, window.innerHeight - document.querySelector('header')!.offsetHeight);
  renderer.setSize(width, height);
  const halfWidth = 11.6, halfHeight = halfWidth * height / width;
  camera.left = -halfWidth; camera.right = halfWidth;
  camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.near = 0.1; camera.far = 60;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  document.body.dataset.ready = '1';
}
window.addEventListener('resize', render);
render();
