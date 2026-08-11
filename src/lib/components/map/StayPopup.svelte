<script lang="ts">
  import type { StayPoint } from '$lib/map/stay-layer-data';

  let { data, clickable }: { data: StayPoint; clickable: boolean } = $props();
</script>

<div class="w-72 max-w-[calc(100vw-2rem)]">
  <div class="px-4 pt-3 pb-2.5">
    <h3 class="text-xs font-medium text-muted-foreground">Stay</h3>
    <div class="mt-2">
      <div class="flex items-center gap-2 py-1">
        {#if data.country}
          <img
            src="https://flagcdn.com/{data.country.toLowerCase()}.svg"
            alt={data.country}
            class="h-4 w-6 shrink-0 rounded-sm object-cover ring-1 ring-black/10 dark:ring-white/15"
          />
        {/if}
        <span
          class="min-w-0 flex-1 truncate text-lg leading-tight font-semibold tracking-tight"
        >
          {data.name}
        </span>
      </div>
      <div class="py-1 text-xs text-muted-foreground tabular-nums">
        {#if data.city}
          <span>{data.city}</span>
          <span aria-hidden="true">·</span>
        {/if}
        <span>{data.checkIn} → {data.checkOut}</span>
      </div>
    </div>
  </div>

  {#if clickable}
    <div class="border-t border-border/50 px-4 py-2">
      <p class="text-center text-xs text-muted-foreground">
        Click for stay details
      </p>
    </div>
  {/if}
</div>
