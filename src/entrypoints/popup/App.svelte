<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import {
    createList,
    getLists,
    ListError,
    setListEnabled,
    watchLists,
  } from '../../core/lists/repository';
  import { entryKey, type List } from '../../core/lists/types';
  import type { ProfileRef } from '../../core/platform';
  import { adapterForUrl } from '../../core/registry';
  import { getSettings, updateSettings, watchSettings } from '../../core/settings';
  import { getStats, watchStats, type Stats } from '../../core/stats';
  import ShareImport from '../../ui/ShareImport.svelte';
  import Toggle from '../../ui/Toggle.svelte';
  import '../../ui/theme.css';
  import ListView from './ListView.svelte';

  let lists = $state<List[]>([]);
  let enabled = $state(true);
  let openId = $state<string | null>(null);
  let currentProfile = $state<ProfileRef | null>(null);
  let newName = $state('');
  let error = $state('');
  let stats = $state<Stats>({ session: 0, total: 0 });

  async function load() {
    [lists, enabled] = await Promise.all([getLists(), getSettings().then((s) => s.enabled)]);
  }

  async function detectProfile() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    currentProfile = tab?.url
      ? (adapterForUrl(tab.url)?.extractProfileFromUrl(tab.url) ?? null)
      : null;
  }

  onMount(() => {
    void load();
    void detectProfile();
    const unwatchLists = watchLists(load);
    const unwatchSettings = watchSettings(load);
    const loadStats = async () => (stats = await getStats());
    void loadStats();
    const unwatchStats = watchStats(loadStats);
    return () => {
      unwatchLists();
      unwatchSettings();
      unwatchStats();
    };
  });

  const activeCount = (list: List) => {
    const excluded = new Set(list.excluded);
    return list.entries.filter((e) => !excluded.has(entryKey(e))).length;
  };

  async function create(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    try {
      openId = await createList(newName);
      newName = '';
    } catch (e) {
      if (!(e instanceof ListError)) throw e;
      error = e.message;
    }
  }
</script>

<main>
  <header>
    <h1><img src="/icon/32.png" alt="" width="22" height="22" />Blindspot</h1>
    <Toggle
      checked={enabled}
      label={enabled ? 'Activé' : 'Désactivé'}
      onchange={(value) => void updateSettings({ enabled: value })}
    />
  </header>

  {#if !enabled}
    <p class="muted notice">Le masquage est désactivé sur tous les onglets.</p>
  {/if}

  <p class="stats">
    <strong>{stats.session.toLocaleString('fr-FR')}</strong> posts ignorés depuis l'ouverture du
    navigateur · <strong>{stats.total.toLocaleString('fr-FR')}</strong> au total
  </p>

  <section aria-labelledby="lists-title">
    <h2 id="lists-title">Listes</h2>
    <ul class="lists">
      {#each lists as list (list.id)}
        <li>
          <div class="row">
            <Toggle
              checked={list.enabled}
              label="Activer « {list.name} »"
              hideLabel
              onchange={(value) => void setListEnabled(list.id, value)}
            />
            <button
              type="button"
              class="name"
              aria-expanded={openId === list.id}
              aria-controls="list-{list.id}"
              onclick={() => (openId = openId === list.id ? null : list.id)}
            >
              <span>{list.name}</span>
              <span class="muted count">{activeCount(list)}</span>
            </button>
          </div>
          {#if openId === list.id}
            <div id="list-{list.id}">
              <ListView {list} {currentProfile} />
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <form class="create" onsubmit={create}>
      <label class="visually-hidden" for="new-list">Nom de la nouvelle liste</label>
      <input id="new-list" type="text" placeholder="Nouvelle liste" bind:value={newName} />
      <button type="submit">Créer</button>
    </form>
    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <details class="paste">
      <summary>Coller un code de partage</summary>
      <ShareImport {lists} onimported={(id) => (openId = id)} />
    </details>
  </section>

  <footer>
    <button type="button" class="link" onclick={() => void browser.runtime.openOptionsPage()}>
      Options
    </button>
  </footer>
</main>

<style>
  main {
    width: 360px;
    padding: 0.75rem 1rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 1.1rem;
  }
  h2 {
    margin: 0.75rem 0 0.25rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .stats {
    margin: 0.5rem 0 0;
    color: var(--muted);
  }
  .stats strong {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .notice {
    margin: 0.5rem 0 0;
  }
  .lists {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .lists > li {
    border-bottom: 1px solid var(--border);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .name {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    border: none;
    background: none;
    padding: 0.55rem 0.25rem;
    text-align: left;
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
  .create {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.75rem;
  }
  .paste {
    margin-top: 0.75rem;
  }
  .paste summary {
    cursor: pointer;
    color: var(--accent);
    margin-bottom: 0.4rem;
  }
  footer {
    margin-top: 0.75rem;
    text-align: right;
  }
</style>
