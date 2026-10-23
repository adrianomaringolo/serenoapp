// Texturas e materiais compartilhados por todos os modelos. Gerados uma vez
// (initKit) e reaproveitados: cem pedras usam o mesmo material de pedra.
import * as THREE from 'three';
import {
  groundTextures, stoneDetailTexture, sandTexture, woodTextures, barkTextures,
  mapleLeafTexture, bambooLeafTexture, smallLeafTexture, willowStrandTexture, dragonflyWingTexture, washiTexture, waterNormalTexture, softBlobTexture, toTexture,
} from '../core/textures.js';
import { triplanarMaterial } from '../core/materials.js';

let kit = null;

export function initKit() {
  if (kit) return kit;
  const ground = groundTextures(512);
  const stoneDetail = stoneDetailTexture(512);
  const wood = woodTextures(512);
  const bark = barkTextures(512, 256);

  // detalhe do musgo para triplanar: a altura do chão, em tons de cinza
  const mossCanvas = document.createElement('canvas');
  mossCanvas.width = mossCanvas.height = 256;
  {
    const ctx = mossCanvas.getContext('2d');
    const img = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const v = ground.heights[(y * 2) * 512 + x * 2];
        const g = Math.max(0, Math.min(255, (0.35 + v * 0.7) * 255));
        const i = (y * 256 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const mossDetail = toTexture(mossCanvas);

  kit = {
    ground,
    sand: sandTexture(512),
    wood,
    bark,
    stoneDetail,
    mossDetail,
    mapleLeaf: mapleLeafTexture(256),
    bambooLeaf: bambooLeafTexture(64, 512),
    smallLeaf: smallLeafTexture(128),
    willowStrand: willowStrandTexture(64, 512),
    dragonflyWing: dragonflyWingTexture(256, 64),
    washi: washiTexture(256),
    waterNormal: waterNormalTexture(256),
    blob: softBlobTexture(256),

    stone: triplanarMaterial(stoneDetail, { scale: 1.6, contrast: 1.3, roughness: 0.88 }),
    stoneFine: triplanarMaterial(stoneDetail, { scale: 3.2, contrast: 1.0, roughness: 0.8 }),
    moss: new THREE.MeshStandardMaterial({
      map: ground.map, normalMap: ground.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), vertexColors: true, roughness: 1,
    }),
    foliage: triplanarMaterial(mossDetail, { scale: 4.0, contrast: 1.8, roughness: 0.85, roughVar: 0.1 }),
    barkMat: new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95 }),
    woodMat: new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, roughness: 0.72 }),
    painted: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
  };
  return kit;
}

export const getKit = () => kit || initKit();
