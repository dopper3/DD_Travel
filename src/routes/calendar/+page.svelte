<script lang="ts">
  import { Calendar, DayGrid, Interaction, List } from '@event-calendar/core';
  import '@event-calendar/core/index.css';
  import { CalendarPlus } from '@o7/icon/lucide';

  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { EventModal } from '$lib/components/modals';
  import { Button } from '$lib/components/ui/button';
  import type { EventListItem } from '$lib/db/types';
  import { openFlightDetails, openStayDetails } from '$lib/state.svelte';
  import { trpc } from '$lib/trpc';
  import {
    mapToCalendarEvents,
    personColor,
  } from '$lib/utils/calendar/events';
  import { getPreferences, getWeekStartsOn } from '$lib/utils/preferences';

  const rawCalendar = trpc.calendar.list.query();
  const data = $derived($rawCalendar.data);
  const users = $derived(page.data.users ?? []);
  const prefs = $derived(getPreferences(page.data.user));

  let modalOpen = $state(false);
  let editedEvent = $state<EventListItem | null>(null);
  let prefillDate = $state<string | null>(null);

  const openAdd = (date: string | null = null) => {
    editedEvent = null;
    prefillDate = date;
    modalOpen = true;
  };

  const invalidate = () => trpc.calendar.list.utils.invalidate();

  const toDayString = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const options = $derived({
    view: 'dayGridMonth',
    headerToolbar: {
      start: 'title',
      center: '',
      end: 'dayGridMonth,listMonth today prev,next',
    },
    buttonText: {
      dayGridMonth: 'Month',
      listMonth: 'Agenda',
      today: 'Today',
    },
    firstDay: getWeekStartsOn(prefs),
    events: data ? mapToCalendarEvents(data, users) : [],
    dayMaxEvents: true,
    height: '100%',
    eventClick: ({ event }: { event: { extendedProps: unknown } }) => {
      const props = event.extendedProps as {
        type: 'flight' | 'stay' | 'event';
        id: number;
      };
      if (props.type === 'flight') {
        openFlightDetails(props.id);
        void goto('/');
      } else if (props.type === 'stay') {
        openStayDetails(props.id);
        void goto('/');
      } else {
        const target = data?.events.find((e) => e.id === props.id) ?? null;
        if (target) {
          editedEvent = target;
          prefillDate = null;
          modalOpen = true;
        }
      }
    },
    dateClick: ({ date }: { date: Date }) => {
      openAdd(toDayString(date));
    },
  });
</script>

<svelte:head>
  <title>Calendar • AirTrail</title>
</svelte:head>

<div class="flex h-full flex-col gap-3 p-4 pb-28 md:px-8">
  <div class="flex items-center justify-between gap-4">
    <div class="flex flex-wrap items-center gap-3">
      {#each users as user (user.id)}
        <span class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span
            class="size-2.5 rounded-full"
            style="background-color: {personColor(user.id, users)}"
          ></span>
          {user.displayName}
        </span>
      {/each}
      <span class="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span class="size-2.5 rounded-full" style="background-color: #8b5cf6"
        ></span>
        Together
      </span>
    </div>
    <Button size="sm" onclick={() => openAdd()}>
      <CalendarPlus size={16} class="shrink-0" />
      Add event
    </Button>
  </div>
  <div class="min-h-0 flex-1">
    <Calendar plugins={[DayGrid, List, Interaction]} {options} />
  </div>
</div>

<EventModal
  bind:open={modalOpen}
  event={editedEvent}
  {prefillDate}
  onSaved={invalidate}
/>
