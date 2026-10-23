// Galeria local: as fotos ficam no IndexedDB do navegador (o localStorage
// seria pequeno demais para imagens). Nada sai do aparelho.
const DB = 'sereno-fotos';
const STORE = 'fotos';

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('createdAt', 'createdAt');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
};

// photo: { blob, thumb, width, height, envId, envName, time, timeLabel }
export async function addPhoto(photo) {
  return tx('readwrite', (s) => s.add({ ...photo, createdAt: Date.now() }));
}

// lista sem as imagens grandes (só miniaturas), da mais nova para a mais antiga
export async function listPhotos() {
  const all = await tx('readonly', (s) => s.getAll());
  return all.map(({ blob, ...meta }) => meta).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getPhoto(id) {
  return tx('readonly', (s) => s.get(id));
}

export async function deletePhoto(id) {
  return tx('readwrite', (s) => s.delete(id));
}

export async function countPhotos() {
  return tx('readonly', (s) => s.count());
}
