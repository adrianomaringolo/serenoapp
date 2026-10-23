// Lista de ambientes. Para criar um novo: uma pasta em src/environments/<id>/
// cujo index.js exporte { id, name, description, build } (veja jardim-zen).
import jardimZen from './jardim-zen/index.js';
import lagoLotus from './lago-lotus/index.js';
import florestaMusgo from './floresta-musgo/index.js';
import cerejeiras from './cerejeiras/index.js';

export const ENVIRONMENTS = [jardimZen, lagoLotus, florestaMusgo, cerejeiras];
export const DEFAULT_ENVIRONMENT = 'jardim-zen';
