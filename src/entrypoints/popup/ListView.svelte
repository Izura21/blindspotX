<script lang="ts">
  import type { ProfileRef } from '../../core/platform';
  import {
    addEntry,
    deleteList,
    ListError,
    removeEntry,
    renameList,
    restoreEntry,
  } from '../../core/lists/repository';
  import { encodeShareCode } from '../../core/lists/share';
  import { entryKey, isEditable, type Entry, type List } from '../../core/lists/types';

  interface Props {
    list: List;
    currentProfile: ProfileRef | null;
  }

  let { list, currentProfile }: Props = $props();

  // Au-delà, on demande d'affiner la recherche plutôt que de tout afficher.
  const MAX_SHOWN = 200;

  let query = $state('');
  let handle = $state('');
  let message = $state('');
  let renaming = $state(false);
  let newName = $state('');
  let confirmDelete = $state(false);
  let sort = $state<'alpha' | 'recent'>('alpha');
  let accountsOnly = $state(false);
  // Code affiché quand le presse-papiers est indisponible, pour une copie à la main.
  let shareCode = $state('');

  const editable = $derived(isEditable(list));
  const excluded = $derived(new Set(list.excluded));
  const localAdds = $derived(new Set(list.added ?? []));
  // Date d'ajout réelle : celle des comptes d'origine d'une liste par défaut n'a pas de sens,
  // ils passent donc après tous les ajouts perso.
  const addedAt = (e: Entry) => (editable || localAdds.has(entryKey(e)) ? e.addedAt : '');
  const sorted = $derived(
    [...list.entries].sort((a, b) =>
      sort === 'recent'
        ? addedAt(b).localeCompare(addedAt(a)) || a.handle.localeCompare(b.handle)
        : a.handle.localeCompare(b.handle),
    ),
  );
  const filtered = $derived.by(() => {
    const q = query.trim().replace(/^@/, '').toLowerCase();
    return q ? sorted.filter((e) => e.handle.includes(q)) : sorted;
  });
  const shown = $derived(filtered.slice(0, MAX_SHOWN));
  const alreadyListed = $derived(
    !!currentProfile &&
      list.entries.some(
        (e) => e.platform === currentProfile.platform && e.handle === currentProfile.handle,
      ),
  );

  async function run(task: () => Promise<unknown>, success = '') {
    message = '';
    try {
      await task();
      message = success;
    } catch (error) {
      if (!(error instanceof ListError)) throw error;
      message = error.message;
    }
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const value = handle;
    await run(async () => {
      const result = await addEntry(list.id, { platform: 'x', handle: value });
      if (result === 'duplicate') throw new ListError('Ce compte est déjà dans la liste');
      handle = '';
    });
  }

  async function addCurrent() {
    const profile = currentProfile;
    if (profile) await run(() => addEntry(list.id, profile), `@${profile.handle} ajouté`);
  }

  async function share() {
    message = '';
    shareCode = '';
    const code = await encodeShareCode(list, { accountsOnly });
    try {
      await navigator.clipboard.writeText(code);
      message = `Code de partage copié (${code.length.toLocaleString('fr-FR')} caractères).`;
    } catch {
      shareCode = code;
      message = 'Copie impossible : sélectionnez le code ci-dessous et copiez-le.';
    }
  }

  async function rename(event: SubmitEvent) {
    event.preventDefault();
    await run(async () => {
      await renameList(list.id, newName, list.description);
      renaming = false;
    });
  }
</script>

<div class="list-view">
  {#if list.description}
    <p class="muted description">{list.description}</p>
  {/if}

  {#if editable}
    <div class="actions">
      {#if renaming}
        <form onsubmit={rename} class="inline">
          <label class="visually-hidden" for="rename-{list.id}">Nouveau nom</label>
          <input id="rename-{list.id}" type="text" bind:value={newName} />
          <button type="submit">OK</button>
          <button type="button" onclick={() => (renaming = false)}>Annuler</button>
        </form>
      {:else}
        <button type="button" onclick={() => ((newName = list.name), (renaming = true))}>
          Renommer
        </button>
        {#if confirmDelete}
          <button type="button" class="danger" onclick={() => run(() => deleteList(list.id))}>
            Confirmer la suppression
          </button>
          <button type="button" onclick={() => (confirmDelete = false)}>Annuler</button>
        {:else}
          <button type="button" class="danger" onclick={() => (confirmDelete = true)}>
            Supprimer
          </button>
        {/if}
      {/if}
    </div>
  {/if}

  <form onsubmit={add} class="inline">
    <label class="visually-hidden" for="add-{list.id}">Compte à ajouter</label>
    <input id="add-{list.id}" type="text" placeholder="@compte ou lien x.com" bind:value={handle} />
    <button type="submit" class="primary">Ajouter</button>
  </form>
  <div class="share">
    <button type="button" onclick={share} disabled={list.entries.length === 0}>
      Copier le code de partage
    </button>
    <label>
      <input type="checkbox" bind:checked={accountsOnly} />
      Sans notes ni dates
    </label>
  </div>
  {#if shareCode}
    <label class="visually-hidden" for="share-{list.id}">Code de partage de « {list.name} »</label>
    <textarea
      id="share-{list.id}"
      class="share-code"
      rows="3"
      readonly
      value={shareCode}
      onfocus={(e) => e.currentTarget.select()}></textarea>
  {/if}

  {#if currentProfile && !alreadyListed}
    <button type="button" class="link" onclick={addCurrent}>
      Ajouter le profil ouvert (@{currentProfile.handle})
    </button>
  {/if}

  {#if message}
    <p class="message" role="status">{message}</p>
  {/if}

  {#if list.entries.length === 0}
    <p class="muted">Liste vide pour l'instant.</p>
  {:else}
    <div class="inline">
      {#if list.entries.length > 10}
        <label class="visually-hidden" for="search-{list.id}">Rechercher un compte</label>
        <input id="search-{list.id}" type="search" placeholder="Rechercher" bind:value={query} />
      {/if}
      <label class="visually-hidden" for="sort-{list.id}">Trier</label>
      <select id="sort-{list.id}" bind:value={sort}>
        <option value="alpha">A → Z</option>
        <option value="recent">Ajouts récents</option>
      </select>
    </div>
    <ul>
      {#each shown as entry (entryKey(entry))}
        {@const key = entryKey(entry)}
        {@const isExcluded = excluded.has(key)}
        {@const isLocal = !editable && localAdds.has(key)}
        <li class:excluded={isExcluded}>
          <span class="who">
            <span class="handle">@{entry.handle}</span>
            {#if entry.note || isLocal}
              <span class="muted note">{isLocal ? 'Ajout perso' : entry.note}</span>
            {/if}
          </span>
          {#if editable || isLocal}
            <button
              type="button"
              class="link"
              aria-label="Retirer @{entry.handle}"
              onclick={() => run(() => removeEntry(list.id, key))}>Retirer</button
            >
          {:else if isExcluded}
            <button
              type="button"
              class="link"
              aria-label="Masquer à nouveau @{entry.handle}"
              onclick={() => run(() => restoreEntry(list.id, key))}>Rétablir</button
            >
          {:else}
            <button
              type="button"
              class="link"
              aria-label="Ne plus masquer @{entry.handle} pour moi"
              onclick={() => run(() => removeEntry(list.id, key))}>Ne plus masquer</button
            >
          {/if}
        </li>
      {/each}
    </ul>
    {#if filtered.length > shown.length}
      <p class="muted">{filtered.length - shown.length} autres comptes : affinez la recherche.</p>
    {/if}
  {/if}
</div>

<style>
  .list-view {
    display: grid;
    gap: 0.5rem;
    padding: 0.25rem 0 0.75rem 2.8rem;
  }
  .description {
    margin: 0;
  }
  .actions,
  .inline {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .inline input[type='search'] {
    flex: 1;
    min-width: 0;
  }
  .message {
    margin: 0;
  }
  .share {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .share label {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }
  .share button:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .share-code {
    width: 100%;
    border: 1px solid var(--border);
    background: var(--bg);
    color: inherit;
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    font: 0.8em/1.4 var(--mono);
    word-break: break-all;
    resize: vertical;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 14rem;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .handle {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note {
    font-size: 0.85em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  li button {
    flex: none;
    white-space: nowrap;
  }
  .excluded .handle {
    text-decoration: line-through;
    color: var(--muted);
  }
</style>
