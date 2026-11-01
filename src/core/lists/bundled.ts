import politiquesDroiteEd from '../../lists/politiques-droite-ed.json';
import { parseListFile, type ListFile } from './schema';

/**
 * Listes packagées avec l'extension, activées par défaut. Critères : docs/lists.md.
 * Seuls les politiques sont fournis : affiliations rendues publiques par les intéressés.
 * Les autres listes (`lists/`) s'importent depuis les options. Le mode `nolists`
 * (`pnpm zip:share`) produit une version sans aucune liste.
 */
const FILES = import.meta.env.MODE === 'nolists' ? [] : [politiquesDroiteEd];

export const BUNDLED_LISTS: readonly ListFile[] = FILES.map((raw, i) =>
  parseListFile(raw, `bundled[${i}]`),
);
