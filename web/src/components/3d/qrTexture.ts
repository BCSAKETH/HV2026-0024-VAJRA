import * as THREE from "three";

// Procedural "QR-like" decal — a real QR would need a data payload and a
// library; this only needs to *read* as a QR at a glance on a 3D box face,
// so we hand-draw finder squares + a noise grid onto a canvas texture.
// Zero external assets, zero network requests, fully theme-tintable.
export function createQrTexture(accent: string, ink: string, paper: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, size, size);

  const cell = size / 16;
  const drawFinder = (ox: number, oy: number) => {
    ctx.fillStyle = ink;
    ctx.fillRect(ox, oy, cell * 4, cell * 4);
    ctx.fillStyle = paper;
    ctx.fillRect(ox + cell, oy + cell, cell * 2, cell * 2);
    ctx.fillStyle = ink;
    ctx.fillRect(ox + cell * 1.5, oy + cell * 1.5, cell, cell);
  };
  drawFinder(cell, cell);
  drawFinder(size - cell * 5, cell);
  drawFinder(cell, size - cell * 5);

  // sparse noise grid for the rest — seeded, not random, so it's stable
  // across re-renders instead of flickering.
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const inFinder =
        (x < 4.5 && y < 4.5) || (x > 10.5 && y < 4.5) || (x < 4.5 && y > 10.5);
      if (inFinder) continue;
      if (rand() > 0.56) {
        ctx.fillStyle = rand() > 0.82 ? accent : ink;
        ctx.fillRect(x * cell, y * cell, cell * 0.92, cell * 0.92);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.anisotropy = 4;
  return texture;
}
