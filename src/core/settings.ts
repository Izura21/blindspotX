import { storage } from 'wxt/utils/storage';
import { DEFAULT_HIDE_OPTIONS, type HideOptions } from './platform';

export interface Settings {
  /** Interrupteur global. */
  enabled: boolean;
  /** Mode discret : aucun bouton dans la page, zéro empreinte DOM. */
  discreet: boolean;
  hide: HideOptions;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  discreet: false,
  hide: DEFAULT_HIDE_OPTIONS,
};

export const settingsItem = storage.defineItem<Partial<Settings>>('local:settings', {
  fallback: {},
  version: 1,
});

/** Réglages complétés par les valeurs par défaut (les nouvelles options s'ajoutent sans migration). */
export async function getSettings(): Promise<Settings> {
  const stored = await settingsItem.getValue();
  return {
    enabled: stored.enabled ?? DEFAULT_SETTINGS.enabled,
    discreet: stored.discreet ?? DEFAULT_SETTINGS.discreet,
    hide: { ...DEFAULT_SETTINGS.hide, ...stored.hide },
  };
}

export async function updateSettings(patch: {
  enabled?: boolean;
  discreet?: boolean;
  hide?: Partial<HideOptions>;
}): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    enabled: patch.enabled ?? current.enabled,
    discreet: patch.discreet ?? current.discreet,
    hide: { ...current.hide, ...patch.hide },
  };
  await settingsItem.setValue(next);
  return next;
}

export function watchSettings(callback: () => void): () => void {
  return settingsItem.watch(callback);
}
