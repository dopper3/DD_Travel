<script lang="ts">
  import { Pencil, Trash } from '@o7/icon/lucide';

  import DetailsActionButton from './DetailsActionButton.svelte';
  import MapDetailsFrame from './MapDetailsFrame.svelte';

  import type { StayListItem } from '$lib/db/types';
  import { closeMapDetails, mapDetailsState } from '$lib/state.svelte';

  let {
    stays,
    onEdit,
    onDelete,
  }: {
    stays: StayListItem[];
    onEdit: (stay: StayListItem) => void;
    onDelete: (stay: StayListItem) => void;
  } = $props();

  const stay = $derived.by(() => {
    const selection = mapDetailsState.selection;
    if (selection?.type !== 'stay') return null;
    return stays.find((s) => s.id === selection.stayId) ?? null;
  });
</script>

{#snippet header()}
  {#if stay}
    <div class="px-4 pt-3 pb-2.5">
      <h3 class="text-xs font-medium text-muted-foreground">Stay</h3>
      <div class="mt-1 flex items-center gap-2">
        {#if stay.country}
          <img
            src="https://flagcdn.com/{stay.country.toLowerCase()}.svg"
            alt={stay.country}
            class="h-4 w-6 shrink-0 rounded-sm object-cover ring-1 ring-black/10 dark:ring-white/15"
          />
        {/if}
        <span
          class="min-w-0 flex-1 truncate text-lg leading-tight font-semibold tracking-tight"
        >
          {stay.name}
        </span>
      </div>
      <p class="mt-1 text-xs text-muted-foreground tabular-nums">
        {stay.checkIn} → {stay.checkOut}
      </p>
    </div>
  {/if}
{/snippet}

{#snippet actions()}
  {#if stay}
    <DetailsActionButton
      label="Edit stay"
      shortLabel="Edit"
      icon={Pencil}
      onclick={() => stay && onEdit(stay)}
    />
    <DetailsActionButton
      label="Delete stay"
      shortLabel="Delete"
      icon={Trash}
      onclick={() => stay && onDelete(stay)}
    />
  {/if}
{/snippet}

<MapDetailsFrame
  open={!!stay}
  {header}
  {actions}
  onOpenChange={(v) => {
    if (!v && mapDetailsState.selection?.type === 'stay') {
      closeMapDetails();
    }
  }}
>
  {#if stay}
    <div class="space-y-3 px-4 py-3 text-sm">
      {#if stay.address || stay.city || stay.country}
        <div>
          <p class="text-xs font-medium text-muted-foreground">Location</p>
          <p class="mt-0.5">
            {[stay.address, stay.city, stay.country].filter(Boolean).join(', ')}
          </p>
        </div>
      {/if}
      {#if stay.confirmationCode}
        <div>
          <p class="text-xs font-medium text-muted-foreground">Confirmation</p>
          <p class="mt-0.5 tabular-nums">{stay.confirmationCode}</p>
        </div>
      {/if}
      {#if stay.note}
        <div>
          <p class="text-xs font-medium text-muted-foreground">Note</p>
          <p class="mt-0.5 whitespace-pre-wrap">{stay.note}</p>
        </div>
      {/if}
      {#if stay.lat === null}
        <p class="text-xs text-amber-600 dark:text-amber-500">
          No location set — edit this stay to place it on the map.
        </p>
      {/if}
    </div>
  {/if}
</MapDetailsFrame>
