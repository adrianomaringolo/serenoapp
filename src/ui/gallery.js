// Galeria pessoal: grade de miniaturas e visualizador com navegação, data,
// ambiente e horário, e botões para baixar, compartilhar e apagar.
import { listPhotos, getPhoto, deletePhoto } from '../core/photoStore.js';

const fmtDate = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fileName = (p) => {
  const d = new Date(p.createdAt);
  const pad = (n) => String(n).padStart(2, '0');
  return `sereno-${p.envId}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
};

export class Gallery {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.root = $('gallery');
    this.grid = $('gal-grid');
    this.viewer = $('gal-viewer');
    this.urls = [];
    this.isOpen = false;
    $('gal-close').addEventListener('click', () => this.close());
    $('gal-v-close').addEventListener('click', () => this.closeViewer());
    $('gal-prev').addEventListener('click', () => this.step(-1));
    $('gal-next').addEventListener('click', () => this.step(1));
    $('gal-download').addEventListener('click', () => this.download());
    $('gal-share').addEventListener('click', () => this.share());
    $('gal-delete').addEventListener('click', () => this.remove());
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      e.stopPropagation();
      if (e.key === 'Escape') this.viewer.hidden ? this.close() : this.closeViewer();
      else if (!this.viewer.hidden && e.key === 'ArrowLeft') this.step(-1);
      else if (!this.viewer.hidden && e.key === 'ArrowRight') this.step(1);
    }, true);
    if (!(navigator.canShare && navigator.share)) $('gal-share').hidden = true;
  }

  async open() {
    this.isOpen = true;
    this.root.hidden = false;
    this.viewer.hidden = true;
    await this.render();
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
    this.closeViewer();
    this.revokeAll();
  }

  revokeAll() {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }

  async render() {
    this.revokeAll();
    this.list = await listPhotos();
    this.grid.innerHTML = '';
    this.$('gal-count').textContent = this.list.length ? `${this.list.length} foto${this.list.length > 1 ? 's' : ''}` : '';
    this.$('gal-empty').hidden = this.list.length > 0;
    this.list.forEach((p, i) => {
      const url = URL.createObjectURL(p.thumb);
      this.urls.push(url);
      const b = document.createElement('button');
      b.className = 'gal-item';
      b.style.backgroundImage = `url(${url})`;
      b.title = `${p.envName} · ${fmtDate(p.createdAt)}`;
      b.addEventListener('click', () => this.show(i));
      this.grid.appendChild(b);
    });
  }

  async show(i) {
    this.index = i;
    const meta = this.list[i];
    if (!meta) return;
    const full = await getPhoto(meta.id);
    if (this.fullUrl) URL.revokeObjectURL(this.fullUrl);
    this.fullUrl = URL.createObjectURL(full.blob);
    this.current = full;
    this.$('gal-img').src = this.fullUrl;
    const extra = [meta.timeLabel, meta.lens ? `${meta.lens} mm` : null, meta.fStop ? `f/${meta.fStop}` : null].filter(Boolean).join(' · ');
    this.$('gal-info').innerHTML = `<b>${meta.envName}</b><span>${fmtDate(meta.createdAt)}</span><span>${extra}</span>`;
    this.$('gal-prev').disabled = i <= 0;
    this.$('gal-next').disabled = i >= this.list.length - 1;
    this.$('gal-delete').textContent = 'Apagar';
    this.armedDelete = false;
    this.viewer.hidden = false;
  }

  closeViewer() {
    this.viewer.hidden = true;
    if (this.fullUrl) { URL.revokeObjectURL(this.fullUrl); this.fullUrl = null; }
  }

  step(d) {
    const i = this.index + d;
    if (i >= 0 && i < this.list.length) this.show(i);
  }

  download() {
    if (!this.current) return;
    const a = document.createElement('a');
    a.href = this.fullUrl;
    a.download = fileName(this.current);
    a.click();
  }

  async share() {
    if (!this.current) return;
    const file = new File([this.current.blob], fileName(this.current), { type: this.current.blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `Sereno — ${this.current.envName}` }); } catch { /* cancelado */ }
    } else {
      this.download();
    }
  }

  async remove() {
    if (!this.current) return;
    // dois toques para apagar: nada de foto perdida por engano
    if (!this.armedDelete) {
      this.armedDelete = true;
      this.$('gal-delete').textContent = 'Toque de novo para apagar';
      return;
    }
    await deletePhoto(this.current.id);
    const i = this.index;
    await this.render();
    if (this.list.length) this.show(Math.min(i, this.list.length - 1));
    else this.closeViewer();
  }
}
