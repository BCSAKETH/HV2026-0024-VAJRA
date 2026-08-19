import * as THREE from "three";

// A bump map, not a color map — this never changes what the box looks like
// from a distance (still flat PAPER-colored, same silhouette everyone has
// already seen), it only gives the surface actual relief up close: faint
// horizontal corrugated-cardboard fluting plus sparse fiber speckling, the
// same "procedural canvas texture, zero external assets" rule as
// qrTexture.ts's QR decal. Seeded, not Math.random(), so it's stable across
// re-renders instead of flickering every remount.
export function createCardboardBumpTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Neutral mid-gray base — meshStandardMaterial's bumpMap reads relative
  // lightness as relative height, so 50% gray is "flat", lighter is
  // "raised", darker is "recessed".
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);

  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // Corrugated fluting — thin alternating light/dark horizontal bands,
  // the actual visual signature of real cardboard under raking light.
  const bandHeight = 5;
  for (let y = 0; y < size; y += bandHeight) {
    const shade = 128 + (Math.floor(y / bandHeight) % 2 === 0 ? 14 : -14);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, size, bandHeight - 1);
  }

  // Sparse fiber speckling on top of the bands so it doesn't read as a
  // perfectly regular, artificial stripe pattern.
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const shade = 128 + (rand() - 0.5) * 50;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.5)`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
