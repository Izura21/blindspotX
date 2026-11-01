// svelte-check ne résout pas les imports `.svelte` depuis les fichiers `.ts` dans ce projet.
// Les composants eux-mêmes restent vérifiés par svelte-check.
declare module '*.svelte' {
  import type { Component } from 'svelte';
  const component: Component;
  export default component;
}
