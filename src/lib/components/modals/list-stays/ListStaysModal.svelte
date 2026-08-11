<script lang="ts">
  import {
    BedDouble,
    Mail,
    MapPin,
    Pencil,
    Plus,
    Trash,
  } from '@o7/icon/lucide';

  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import {
    Modal,
    ModalBody,
    ModalBreadcrumbHeader,
  } from '$lib/components/ui/modal';
  import type { StayListItem } from '$lib/db/types';
  import { openStayDetails } from '$lib/state.svelte';

  let {
    open = $bindable(false),
    stays,
    onAdd,
    onEdit,
    onDelete,
  }: {
    open?: boolean;
    stays: StayListItem[];
    onAdd: () => void;
    onEdit: (stay: StayListItem) => void;
    onDelete: (stay: StayListItem) => void;
  } = $props();

  const showOnMap = (stay: StayListItem) => {
    if (stay.lat === null || stay.lon === null) return;
    open = false;
    openStayDetails(stay.id);
  };
</script>

<Modal bind:open class="max-w-2xl">
  <ModalBreadcrumbHeader section="Stays" title="Your stays" icon={BedDouble} />
  <ModalBody>
    <div class="mb-3 flex justify-end">
      <Button variant="outline" size="sm" onclick={onAdd}>
        <Plus size={16} class="shrink-0" />
        Add stay
      </Button>
    </div>
    {#if stays.length === 0}
      <div class="py-10 text-center text-sm text-muted-foreground">
        <BedDouble size={28} class="mx-auto mb-2 opacity-60" />
        <p>No stays yet.</p>
        <p class="mt-1">
          Add one manually or forward a hotel confirmation email.
        </p>
      </div>
    {:else}
      <ul class="divide-y divide-border/60">
        {#each stays as stay (stay.id)}
          <li class="flex items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="min-w-0 truncate font-medium">{stay.name}</span>
                {#if stay.source === 'email'}
                  <Badge variant="secondary" class="shrink-0 gap-1">
                    <Mail size={11} />
                    Email
                  </Badge>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground tabular-nums">
                {[stay.city, stay.country].filter(Boolean).join(', ')}
                {#if stay.city || stay.country}
                  <span aria-hidden="true">·</span>
                {/if}
                {stay.checkIn} → {stay.checkOut}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                title={stay.lat === null ? 'No location set' : 'Show on map'}
                disabled={stay.lat === null}
                onclick={() => showOnMap(stay)}
              >
                <MapPin size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                title="Edit stay"
                onclick={() => onEdit(stay)}
              >
                <Pencil size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-8 text-destructive hover:text-destructive"
                title="Delete stay"
                onclick={() => onDelete(stay)}
              >
                <Trash size={15} />
              </Button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </ModalBody>
</Modal>
