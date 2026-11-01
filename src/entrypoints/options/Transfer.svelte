<script lang="ts">
  import { onMount } from 'svelte';
  import { getLists, importList, ListError, watchLists } from '../../core/lists/repository';
  import type { ListFile } from '../../core/lists/schema';
  import { ListValidationError } from '../../core/lists/schema';
  import { exportCsv, exportJson, parseImport, previewImport } from '../../core/lists/transfer';
  import { isEditable, type List } from '../../core/lists/types';
  import ShareImport from '../../ui/ShareImport.svelte';

  let lists = $state<List[]>([]);
  let exportId = $state('all');
  let pending = $state<{ file: ListFile; target: string }[]>([]);
  let message = $state('');
  let error = $state('');

  const userLists = $derived(lists.filter(isEditable));

  async function load() {
    lists = await getLists();
  }

  onMount(() => {
    void load();
    return watchLists(load);
  });

  function download(content: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportAs(format: 'json' | 'csv') {
    const selected = exportId === 'all' ? lists : lists.filter((l) => l.id === exportId);
    const date = new Date().toISOString().slice(0, 10);
    const base = `blindspot-${exportId === 'all' ? 'listes' : (selected[0]?.name ?? 'liste')}-${date}`;
    if (format === 'json') download(exportJson(selected), `${base}.json`, 'application/json');
    else download(exportCsv(selected), `${base}.csv`, 'text/csv');
  }

  async function choose(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    message = '';
    error = '';
    pending = [];
    if (!file) return;
    try {
      pending = parseImport(await file.text(), file.name).map((f) => ({ file: f, target: 'new' }));
    } catch (e) {
      if (!(e instanceof ListValidationError)) throw e;
      error = e.message;
    }
    input.value = '';
  }

  function preview(item: { file: ListFile; target: string }) {
    return previewImport(
      item.file,
      lists.find((l) => l.id === item.target),
    );
  }

  async function apply() {
    error = '';
    try {
      let added = 0;
      for (const item of pending) {
        added += (await importList(item.file, item.target === 'new' ? undefined : item.target))
          .added;
      }
      message = `${added} compte(s) importé(s).`;
      pending = [];
    } catch (e) {
      if (!(e instanceof ListError)) throw e;
      error = e.message;
    }
  }
</script>

<fieldset>
  <legend>Exporter</legend>
  <div class="row">
    <label for="export-list">Liste</label>
    <select id="export-list" bind:value={exportId}>
      <option value="all">Toutes les listes</option>
      {#each lists as list (list.id)}
        <option value={list.id}>{list.name}</option>
      {/each}
    </select>
    <button type="button" onclick={() => exportAs('json')}>JSON</button>
    <button type="button" onclick={() => exportAs('csv')}>CSV</button>
  </div>
</fieldset>

<fieldset>
  <legend>Importer</legend>
  <label for="import-file">Fichier JSON ou CSV (5 Mo maximum)</label>
  <input
    id="import-file"
    type="file"
    accept=".json,.csv,application/json,text/csv"
    onchange={choose}
  />
  <p class="muted help">
    CSV : colonnes <code>platform</code>, <code>handle</code>, et en option <code>userId</code>,
    <code>note</code>, <code>list</code>.
  </p>

  {#if pending.length}
    <ul class="pending">
      {#each pending as item, i (i)}
        {@const counts = preview(item)}
        <li>
          <strong>{item.file.name}</strong> : {item.file.entries.length} compte(s)
          <div class="row">
            <label for="target-{i}">Importer dans</label>
            <select id="target-{i}" bind:value={item.target}>
              <option value="new">Une nouvelle liste « {item.file.name} »</option>
              {#each userLists as list (list.id)}
                <option value={list.id}>{list.name}</option>
              {/each}
            </select>
          </div>
          <p class="muted">
            {counts.added} nouveau(x){counts.duplicates
              ? `, ${counts.duplicates} déjà présent(s)`
              : ''}
          </p>
        </li>
      {/each}
    </ul>
    <div class="row">
      <button type="button" class="primary" onclick={apply}>Importer</button>
      <button type="button" onclick={() => (pending = [])}>Annuler</button>
    </div>
  {/if}

  {#if message}<p role="status">{message}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</fieldset>

<fieldset>
  <legend>Coller un code de partage</legend>
  <p class="muted help">
    Code <code>BLINDSPOT1:…</code> copié depuis la popup d’une autre personne (bouton « Copier le code
    de partage » d’une liste). Rien ne passe par un serveur.
  </p>
  <ShareImport {lists} />
</fieldset>

<style>
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
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0.4rem 0;
  }
  select {
    border: 1px solid var(--border);
    background: var(--bg);
    border-radius: 6px;
    padding: 0.3rem 0.4rem;
  }
  input[type='file'] {
    display: block;
    margin-top: 0.3rem;
  }
  .help {
    font-size: 0.9em;
  }
  .pending {
    list-style: none;
    padding: 0;
  }
  .pending li {
    border-top: 1px solid var(--border);
    padding: 0.5rem 0;
  }
  .pending p {
    margin: 0;
  }
</style>
