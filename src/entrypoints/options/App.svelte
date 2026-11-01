<script lang="ts">
  import { onMount } from 'svelte';
  import type { HideOptions, OverlayStyle } from '../../core/platform';
  import {
    DEFAULT_SETTINGS,
    getSettings,
    updateSettings,
    watchSettings,
  } from '../../core/settings';
  import Toggle from '../../ui/Toggle.svelte';
  import Transfer from './Transfer.svelte';
  import '../../ui/theme.css';

  let hide = $state<HideOptions>({ ...DEFAULT_SETTINGS.hide });
  let discreet = $state(DEFAULT_SETTINGS.discreet);

  async function load() {
    ({ hide, discreet } = await getSettings());
  }

  onMount(() => {
    void load();
    return watchSettings(load);
  });

  function set<K extends keyof HideOptions>(key: K, value: HideOptions[K]) {
    void updateSettings({ hide: { [key]: value } });
  }

  const toggles: { key: Exclude<keyof HideOptions, 'style'>; label: string; help: string }[] = [
    {
      key: 'reposts',
      label: 'Masquer les reposts faits par les comptes listés',
      help: "Le repost d'un post d'un compte listé est toujours masqué.",
    },
    {
      key: 'quotes',
      label: 'Masquer les posts cités des comptes listés',
      help: 'Seul le bloc cité est masqué, le post qui le cite reste visible.',
    },
    {
      key: 'replies',
      label: 'Masquer aussi dans les conversations',
      help: "Désactivé, rien n'est masqué quand vous ouvrez une conversation.",
    },
    {
      key: 'onTargetProfile',
      label: 'Masquer aussi sur le profil du compte',
      help: 'Désactivé, les posts restent visibles quand vous ouvrez le profil d’un compte listé.',
    },
    {
      key: 'showLabel',
      label: 'Afficher le nom du compte dans l’encart',
      help: 'Par défaut, l’encart reste neutre : « Post masqué par Blindspot ».',
    },
  ];

  const styles: { value: OverlayStyle; label: string; help: string }[] = [
    {
      value: 'faithful',
      label: 'Fidèle',
      help: "L'encart garde la hauteur du post. Recommandé : X le compte bien comme vu.",
    },
    {
      value: 'compact',
      label: 'Compact',
      help: 'Encart réduit, plus confortable. Mais X ne compte plus le post comme vu : le signal « affiché sans engagement » est perdu.',
    },
  ];
</script>

<main>
  <h1>Options de Blindspot</h1>

  <fieldset>
    <legend>Encart</legend>
    {#each styles as option (option.value)}
      <label class="radio">
        <input
          type="radio"
          name="style"
          value={option.value}
          checked={hide.style === option.value}
          onchange={() => set('style', option.value)}
        />
        <span>
          <strong>{option.label}</strong>
          <span class="muted help">{option.help}</span>
        </span>
      </label>
    {/each}
  </fieldset>

  <fieldset>
    <legend>Ce qui est masqué</legend>
    {#each toggles as option (option.key)}
      <div class="option">
        <Toggle
          checked={hide[option.key]}
          label={option.label}
          onchange={(value) => set(option.key, value)}
        />
        <p class="muted help">{option.help}</p>
      </div>
    {/each}
  </fieldset>

  <fieldset>
    <legend>Boutons dans la page</legend>
    <div class="option">
      <Toggle
        checked={discreet}
        label="Mode discret"
        onchange={(value) => void updateSettings({ discreet: value })}
      />
      <p class="muted help">
        Retire les boutons « Ajouter à Blindspot » (à côté des posts, menu « … » d'un post, profil).
        L'extension n'ajoute alors plus aucun élément dans la page de X et n'y laisse aucun marqueur
        lisible. Le masquage reste visible : une page qui insère des posts de test peut encore
        repérer ceux qui sont masqués. L'ajout reste possible par clic droit sur un nom et depuis la
        popup.
      </p>
    </div>
  </fieldset>

  <h2>Listes</h2>
  <Transfer />
</main>

<style>
  main {
    max-width: 640px;
    margin: 2rem auto;
    padding: 0 1rem;
  }
  h1 {
    font-size: 1.4rem;
  }
  h2 {
    font-size: 1.1rem;
    margin: 1.5rem 0 0.75rem;
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin: 0 0 1rem;
  }
  legend {
    font-weight: 600;
    padding: 0 0.3rem;
  }
  .radio {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    padding: 0.4rem 0;
  }
  .radio > span {
    display: grid;
  }
  .option {
    padding: 0.4rem 0;
  }
  .help {
    margin: 0.1rem 0 0 2.75rem;
    font-size: 0.9em;
  }
  .radio .help {
    margin: 0;
  }
</style>
