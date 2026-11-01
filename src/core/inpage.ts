import { compileLookup, type Lookup } from './lists/lookup';
import {
  addEntry,
  getIdentities,
  getLists,
  ListError,
  removeEntry,
  watchLists,
} from './lists/repository';
import { entryKey, type List } from './lists/types';
import type { ProfileRef } from './platform';

// Boutons « Ajouter à Blindspot » dans la page, sauf en mode discret.
//
// Un seul élément est ajouté au document, sous <html> et hors de l'arbre de la plateforme,
// avec un shadow DOM fermé : la page voit qu'il existe, pas ce qu'il contient. Les boutons
// sont posés par-dessus l'interface de la plateforme, jamais insérés dedans.

export type SlotStyle = 'menuitem' | 'chip' | 'icon';

export interface Slot {
  target: ProfileRef;
  /** Rectangle (viewport) de l'élément de la plateforme auquel le bouton s'accroche. */
  anchor: () => DOMRect | null;
  /** Position du bouton (viewport) à partir de l'ancre et de sa propre taille. */
  place: (anchor: DOMRect, size: { width: number; height: number }) => { x: number; y: number };
  style: SlotStyle;
  /** Largeur imposée (ex. celle du menu de la plateforme). */
  width?: (anchor: DOMRect) => number;
}

interface Mounted {
  slot: Slot;
  root: HTMLElement;
  button: HTMLButtonElement;
  picker: HTMLElement | null;
  hovered: boolean;
  lastRect: DOMRect | null;
  missingSince: number | null;
}

// Délai pendant lequel un bouton reste affiché après la disparition de son ancre
// (le menu ou la carte de survol se ferment quand la souris les quitte pour le bouton).
const GRACE_MS = 400;

const STYLE = `
  :host { all: initial; }
  .slot { position: fixed; pointer-events: auto; font: 15px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--fg); }
  button { font: inherit; color: inherit; cursor: pointer; border: none; background: none; margin: 0; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .main { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .menuitem .main { width: 100%; white-space: normal; text-align: left; padding: 12px 16px; font-weight: 700; background: var(--bg); border-radius: 12px; box-shadow: var(--shadow); }
  .menuitem .main:hover { background: var(--hover); }
  .chip .main { padding: 6px 12px; font-size: 13px; font-weight: 700; border: 1px solid var(--border); border-radius: 9999px; background: var(--bg); }
  .chip .main:hover { background: var(--hover); }
  .icon .main { justify-content: center; width: 26px; height: 26px; padding: 0; color: var(--muted); border-radius: 9999px; }
  .icon .main:hover { color: var(--accent); background: var(--hover); }
  .icon svg { width: 16px; height: 16px; }
  .icon .stroke { fill: none; stroke: currentColor; stroke-width: 2; }
  .icon .fill { fill: currentColor; }
  .icon .knock { fill: none; stroke: var(--bg); stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round; }
  .listed .main { color: var(--muted); }
  .picker { position: absolute; top: calc(100% + 4px); left: 0; min-width: 220px; max-width: 320px; padding: 4px 0; background: var(--bg); border-radius: 12px; box-shadow: var(--shadow); }
  .picker button { display: flex; justify-content: space-between; gap: 12px; width: 100%; padding: 10px 16px; text-align: left; }
  .picker button:hover { background: var(--hover); }
  .picker .title { padding: 8px 16px 4px; font-size: 13px; color: var(--muted); }
  .picker .check { color: var(--accent); }
  .picker .feedback { padding: 10px 16px; font-size: 14px; }
`;

// Icônes Blindspot : disque évidé ; plein avec une coche si le compte est déjà listé.
type Shape = [tag: 'circle' | 'path', attrs: Record<string, string>];
const ICON_HIDE: Shape[] = [
  ['circle', { cx: '12', cy: '12', r: '8.5', class: 'stroke' }],
  ['circle', { cx: '14.6', cy: '9.4', r: '2.8', class: 'fill' }],
];
const ICON_LISTED: Shape[] = [
  ['circle', { cx: '12', cy: '12', r: '9.6', class: 'fill' }],
  ['path', { d: 'M8.4 12.4 10.9 14.9 15.8 9.8', class: 'knock' }],
];

function theme(doc: Document): Record<string, string> {
  const color = getComputedStyle(doc.body ?? doc.documentElement).backgroundColor;
  const [r = 255, g = 255, b = 255] = color.match(/\d+/g)?.map(Number) ?? [];
  const dark = (r * 299 + g * 587 + b * 114) / 1000 < 128;
  return dark
    ? {
        bg: color,
        fg: '#e7e9ea',
        muted: '#8b98a5',
        border: '#536471',
        hover: 'rgba(231,233,234,0.1)',
        accent: '#c6f432',
        shadow: '0 0 15px rgba(255,255,255,0.2), 0 0 3px 1px rgba(255,255,255,0.15)',
      }
    : {
        bg: '#ffffff',
        fg: '#0f1419',
        muted: '#536471',
        border: '#cfd9de',
        hover: 'rgba(15,20,25,0.06)',
        accent: '#4b6b00',
        shadow: '0 0 15px rgba(101,119,134,0.2), 0 0 3px 1px rgba(101,119,134,0.15)',
      };
}

export interface InpageUi {
  show(id: string, slot: Slot): void;
  hide(id: string): void;
  destroy(): void;
}

export function createInpageUi(
  doc: Document = document,
  // Ouvert uniquement pour les tests.
  { shadowMode = 'closed' }: { shadowMode?: ShadowRootMode } = {},
): InpageUi {
  const host = doc.createElement('div');
  host.style.cssText =
    'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: shadowMode });
  const style = doc.createElement('style');
  style.textContent = STYLE;
  shadow.append(style);
  doc.documentElement.append(host);

  // Rien de ce qui se passe dans nos boutons ne doit atteindre les gestionnaires de la page.
  const stop = (event: Event) => event.stopPropagation();
  for (const type of [
    'click',
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointerup',
    'keydown',
    'keyup',
    'focusin',
    'wheel',
  ]) {
    shadow.addEventListener(type, stop);
  }

  const mounted = new Map<string, Mounted>();
  let lists: List[] = [];
  let lookup: Lookup = compileLookup([]);
  let frame = 0;

  const refresh = async () => {
    const [all, identities] = await Promise.all([getLists(), getIdentities()]);
    lists = all;
    lookup = compileLookup(all, identities);
    for (const m of mounted.values()) render(m);
  };
  void refresh();
  const unwatch = watchLists(() => void refresh());

  function listed(target: ProfileRef): boolean {
    return lookup.has(target.platform, target.handle);
  }

  function icon(shapes: Shape[]): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of shapes) {
      const shape = doc.createElementNS(ns, tag);
      for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, value);
      svg.append(shape);
    }
    return svg;
  }

  function render(m: Mounted) {
    const isListed = listed(m.slot.target);
    m.root.className = `slot ${m.slot.style}${isListed ? ' listed' : ''}`;
    const full = isListed
      ? `✓ @${m.slot.target.handle} est dans Blindspot (modifier)`
      : `Ajouter @${m.slot.target.handle} à Blindspot`;
    // Style « icon » : icône seule à côté du post, le libellé complet reste pour l'accessibilité.
    if (m.slot.style === 'icon') {
      m.button.replaceChildren(icon(isListed ? ICON_LISTED : ICON_HIDE));
      m.button.setAttribute('aria-label', full);
      m.button.title = full;
    } else m.button.textContent = full;
    m.button.setAttribute('aria-expanded', String(!!m.picker));
  }

  function closePicker(m: Mounted) {
    m.picker?.remove();
    m.picker = null;
    render(m);
  }

  function openPicker(m: Mounted) {
    const picker = doc.createElement('div');
    picker.className = 'picker';
    picker.setAttribute('role', 'group');
    const title = doc.createElement('div');
    title.className = 'title';
    title.textContent = 'Listes (cliquer pour ajouter ou retirer)';
    picker.append(title);
    const { target } = m.slot;
    for (const list of lists) {
      // Entrée active de ce compte dans la liste (une exclusion locale ne compte pas).
      const entry = list.entries.find(
        (e) =>
          e.platform === target.platform &&
          (e.handle === target.handle || (!!target.userId && e.userId === target.userId)) &&
          !list.excluded.includes(entryKey(e)),
      );
      const option = doc.createElement('button');
      option.type = 'button';
      option.setAttribute('aria-pressed', String(!!entry));
      const name = doc.createElement('span');
      name.textContent = list.name;
      option.append(name);
      if (entry) {
        const check = doc.createElement('span');
        check.className = 'check';
        check.textContent = '✓';
        option.append(check);
      }
      option.addEventListener('click', async () => {
        const feedback = doc.createElement('div');
        feedback.className = 'feedback';
        feedback.setAttribute('role', 'status');
        try {
          if (entry) {
            await removeEntry(list.id, entryKey(entry));
            feedback.textContent = `Retiré de « ${list.name} »`;
          } else {
            await addEntry(list.id, target);
            feedback.textContent = `Ajouté à « ${list.name} »`;
          }
        } catch (error) {
          if (!(error instanceof ListError)) throw error;
          feedback.textContent = error.message;
        }
        picker.replaceChildren(feedback);
        setTimeout(() => closePicker(m), 1500);
      });
      picker.append(option);
    }
    m.picker = picker;
    m.root.append(picker);
    render(m);
    picker.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  function mount(slot: Slot): Mounted {
    const root = doc.createElement('div');
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'main';
    root.append(button);
    shadow.append(root);
    const m: Mounted = {
      slot,
      root,
      button,
      picker: null,
      hovered: false,
      lastRect: null,
      missingSince: null,
    };
    root.addEventListener('mouseenter', () => (m.hovered = true));
    root.addEventListener('mouseleave', () => (m.hovered = false));
    button.addEventListener('click', () => (m.picker ? closePicker(m) : openPicker(m)));
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closePicker(m);
    });
    render(m);
    return m;
  }

  function position(m: Mounted, rect: DOMRect) {
    const vars = theme(doc);
    for (const [key, value] of Object.entries(vars)) m.root.style.setProperty(`--${key}`, value);
    if (m.slot.width) m.root.style.width = `${m.slot.width(rect)}px`;
    const size = { width: m.root.offsetWidth, height: m.root.offsetHeight };
    const { x, y } = m.slot.place(rect, size);
    m.root.style.left = `${Math.round(Math.max(4, Math.min(x, innerWidth - size.width - 4)))}px`;
    m.root.style.top = `${Math.round(Math.max(4, y))}px`;
  }

  function tick() {
    frame = 0;
    const now = performance.now();
    for (const [id, m] of mounted) {
      const rect = m.slot.anchor();
      if (rect && rect.width > 0) {
        m.lastRect = rect;
        m.missingSince = null;
        position(m, rect);
      } else if (m.hovered || m.picker) {
        // L'ancre a disparu mais l'utilisateur interagit avec le bouton : on le garde.
        m.missingSince = null;
      } else {
        m.missingSince ??= now;
        if (now - m.missingSince > GRACE_MS) {
          m.root.remove();
          mounted.delete(id);
        }
      }
    }
    if (mounted.size) frame = requestAnimationFrame(tick);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  return {
    show(id, slot) {
      const existing = mounted.get(id);
      if (existing && existing.slot.target.handle === slot.target.handle) {
        existing.slot = slot;
      } else {
        existing?.root.remove();
        mounted.set(id, mount(slot));
      }
      schedule();
    },
    hide(id) {
      const m = mounted.get(id);
      // Pas de retrait immédiat : `tick` applique le délai de grâce et garde un bouton utilisé.
      if (m) m.slot = { ...m.slot, anchor: () => null };
      schedule();
    },
    destroy() {
      cancelAnimationFrame(frame);
      unwatch();
      host.remove();
      mounted.clear();
    },
  };
}
