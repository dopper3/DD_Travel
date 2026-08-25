<script lang="ts">
  import type { EcEvent } from '$lib/utils/calendar/events';
  import { bucketEventsByDay } from '$lib/utils/calendar/year';

  let {
    year,
    events,
    onDayClick,
  }: {
    year: number;
    events: EcEvent[];
    onDayClick?: (date: Date) => void;
  } = $props();

  const days = $derived(bucketEventsByDay(events, year));

  const months = Array.from({ length: 12 }, (_, m) => m);
  const monthLabel = (m: number) =>
    new Date(2000, m, 1).toLocaleString(undefined, { month: 'short' });
  const daysInMonth = (m: number) => new Date(year, m + 1, 0).getDate();

  const now = new Date();
  const todayStamp = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const stamp = (m: number, d: number) => Date.UTC(year, m, d);
  const isWeekend = (m: number, d: number) => {
    const dow = new Date(year, m, d).getDay();
    return dow === 0 || dow === 6;
  };

  // One color fills the box; several split it into diagonal bands.
  const fill = (colors: string[]): string => {
    if (colors.length === 1) return colors[0]!;
    const step = 100 / colors.length;
    const stops = colors
      .map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`)
      .join(', ');
    return `linear-gradient(135deg, ${stops})`;
  };
</script>

<div class="overflow-x-auto">
  <div
    class="grid min-w-[56rem] gap-y-1"
    style="grid-template-columns: 2.75rem repeat(31, minmax(0, 1fr));"
  >
    {#each months as m (m)}
      <span class="self-center pr-2 text-xs font-medium text-muted-foreground">
        {monthLabel(m)}
      </span>
      {#each Array.from({ length: daysInMonth(m) }, (_, i) => i + 1) as d (d)}
        {@const info = days.get(stamp(m, d))}
        <button
          type="button"
          class="m-px flex h-8 min-w-0 items-start justify-end rounded-sm border p-0.5 text-[10px] leading-none transition-shadow hover:ring-2 hover:ring-primary
            {info
            ? 'border-transparent text-white'
            : isWeekend(m, d)
              ? 'border-border/60 bg-muted/60 text-muted-foreground'
              : 'border-border/60 text-muted-foreground'}
            {stamp(m, d) === todayStamp
            ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
            : ''}"
          style={info ? `background: ${fill(info.colors)}` : ''}
          title={info ? info.titles.join('\n') : undefined}
          onclick={() => onDayClick?.(new Date(year, m, d))}
        >
          {d}
        </button>
      {/each}
      {#if daysInMonth(m) < 31}
        <span style="grid-column: span {31 - daysInMonth(m)}"></span>
      {/if}
    {/each}
  </div>
</div>
