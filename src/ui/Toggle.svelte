<script lang="ts">
  interface Props {
    checked: boolean;
    label: string;
    /** Masque le libellé visuellement (il reste lu par les lecteurs d'écran). */
    hideLabel?: boolean;
    onchange: (checked: boolean) => void;
  }

  let { checked, label, hideLabel = false, onchange }: Props = $props();
</script>

<button
  type="button"
  role="switch"
  class="toggle"
  aria-checked={checked}
  onclick={() => onchange(!checked)}
>
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  <span class:visually-hidden={hideLabel}>{label}</span>
</button>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border: none;
    background: none;
    padding: 0.15rem;
    text-align: left;
  }
  .track {
    flex: none;
    width: 2.2rem;
    height: 1.25rem;
    border-radius: 999px;
    background: var(--border);
    position: relative;
    transition: background 0.15s;
  }
  .thumb {
    position: absolute;
    top: 0.15rem;
    left: 0.15rem;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 50%;
    background: #ffffff;
    transition: transform 0.15s;
  }
  [aria-checked='true'] .track {
    background: var(--accent);
  }
  [aria-checked='true'] .thumb {
    transform: translateX(0.95rem);
  }
  @media (prefers-reduced-motion: reduce) {
    .track,
    .thumb {
      transition: none;
    }
  }
</style>
