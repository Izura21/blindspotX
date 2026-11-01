<script lang="ts">
  import { importList, ListError } from '../core/lists/repository';
  import { dedupe, ListValidationError, type ListFile } from '../core/lists/schema';
  import { decodeShareCode } from '../core/lists/share';
  import { previewImport } from '../core/lists/transfer';
  import { entryKey, isEditable, type List } from '../core/lists/types';

  // Import d'une liste depuis un code de partage collé, dans la popup et les options.

  interface Props {
    lists: List[];
    /** Appelé avec l'id de la liste créée ou complétée. */
    onimported?: (listId: string) => void;
  }

  let { lists, onimported }: Props = $props();

  let code = $state('');
  let pending = $state<ListFile | null>(null);
  let target = $state('new');
  let message = $state('');
  let error = $state('');

  const userLists = $derived(lists.filter(isEditable));
  // Nouveaux : comptes qui ne figurent encore dans aucune liste (hors exclusions locales).
  const fresh = $derived.by(() => {
    if (!pending) return 0;
    const known = dedupe(
      lists.flatMap((l) => {
        const excluded = new Set(l.excluded);
        return l.entries.filter((e) => !excluded.has(entryKey(e)));
      }),
    );
    return dedupe([...known, ...pending.entries]).length - known.length;
  });
  const merge = $derived.by(() => {
    const list = lists.find((l) => l.id === target);
    return pending && list ? previewImport(pending, list) : null;
  });

  async function read(event: SubmitEvent) {
    event.preventDefault();
    message = '';
    error = '';
    pending = null;
    try {
      pending = await decodeShareCode(code);
      target = 'new';
    } catch (e) {
      if (!(e instanceof ListValidationError)) throw e;
      error = e.message;
    }
  }

  async function apply() {
    if (!pending) return;
    error = '';
    try {
      const name = target === 'new' ? pending.name : lists.find((l) => l.id === target)?.name;
      const { listId, added } = await importList(pending, target === 'new' ? undefined : target);
      message = `${added} compte(s) ajouté(s) à « ${name} ».`;
      pending = null;
      code = '';
      onimported?.(listId);
    } catch (e) {
      if (!(e instanceof ListError)) throw e;
      error = e.message;
    }
  }
</script>

<form class="share-import" onsubmit={read}>
  <label for="share-code">Code de partage</label>
  <textarea
    id="share-code"
    rows="3"
    spellcheck="false"
    autocomplete="off"
    placeholder="BLINDSPOT1:…"
    bind:value={code}></textarea>
  <div class="row">
    <button type="submit" disabled={!code.trim()}>Lire le code</button>
  </div>
</form>

{#if pending}
  <div class="pending">
    <p>
      <strong>{pending.name}</strong> : {pending.entries.length} compte(s), {fresh} nouveau(x)
    </p>
    <div class="row">
      <label for="share-target">Importer dans</label>
      <select id="share-target" bind:value={target}>
        <option value="new">Une nouvelle liste « {pending.name} »</option>
        {#each userLists as list (list.id)}
          <option value={list.id}>Fusionner dans « {list.name} »</option>
        {/each}
      </select>
    </div>
    {#if merge}
      <p class="muted">
        {merge.added} ajouté(s){merge.duplicates ? `, ${merge.duplicates} déjà présent(s)` : ''}
      </p>
    {/if}
    <div class="row">
      <button type="button" class="primary" onclick={apply}>Importer</button>
      <button type="button" onclick={() => (pending = null)}>Annuler</button>
    </div>
  </div>
{/if}

<div role="status">{message}</div>
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
  .share-import {
    display: grid;
    gap: 0.3rem;
  }
  textarea {
    width: 100%;
    border: 1px solid var(--border);
    background: var(--bg);
    color: inherit;
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    font: 0.85em/1.4 var(--mono);
    word-break: break-all;
    resize: vertical;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0.3rem 0;
  }
  select {
    min-width: 0;
    max-width: 100%;
    border: 1px solid var(--border);
    background: var(--bg);
    border-radius: 6px;
    padding: 0.3rem 0.4rem;
  }
  .pending p {
    margin: 0.4rem 0 0;
  }
  button:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .error {
    margin: 0.3rem 0 0;
  }
</style>
