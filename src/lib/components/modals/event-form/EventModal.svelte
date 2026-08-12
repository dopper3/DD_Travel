<script lang="ts">
  import { CalendarPlus, Pencil } from '@o7/icon/lucide';
  import { toast } from 'svelte-sonner';
  import { defaults, type Infer, superForm } from 'sveltekit-superforms';
  import { zod4 as zod } from 'sveltekit-superforms/adapters';

  import EventFormFields from './EventFormFields.svelte';

  import { confirmation } from '$lib/components/helpers';
  import { Button } from '$lib/components/ui/button';
  import * as Form from '$lib/components/ui/form';
  import {
    Modal,
    ModalBody,
    ModalBreadcrumbHeader,
    ModalFooter,
  } from '$lib/components/ui/modal';
  import type { EventListItem } from '$lib/db/types';
  import { api } from '$lib/trpc';
  import { eventSchema } from '$lib/zod/event';

  let {
    open = $bindable(false),
    event = null,
    prefillDate = null,
    onSaved,
  }: {
    open?: boolean;
    event?: EventListItem | null;
    prefillDate?: string | null;
    onSaved?: () => void;
  } = $props();

  const isEdit = $derived(event !== null);

  const form = superForm(
    defaults<Infer<typeof eventSchema>>(zod(eventSchema)),
    {
      dataType: 'json',
      validators: zod(eventSchema),
      onUpdated({ form }) {
        if (form.message) {
          if (form.message.type === 'success') {
            open = false;
            onSaved?.();
            return void toast.success(form.message.text);
          }
          toast.error(form.message.text);
        }
      },
    },
  );
  const { enhance, reset } = form;

  // Re-seed the form each time the modal opens, for the targeted event (edit)
  // or with blank defaults, optionally prefilled with a clicked date (add).
  $effect(() => {
    if (!open) return;
    const target = event;
    reset({
      data: target
        ? {
            id: target.id,
            title: target.title,
            description: target.description,
            location: target.location,
            lat: target.lat,
            lon: target.lon,
            startDate: target.startDate,
            startTime: target.startTime,
            endDate: target.endDate,
            endTime: target.endTime,
          }
        : prefillDate
          ? { startDate: prefillDate }
          : undefined,
    });
  });

  let deleting = $state(false);
  const deleteEvent = async () => {
    const target = event;
    if (!target) return;
    const confirmed = await confirmation.show({
      title: 'Delete Event',
      description: `Are you sure you want to delete "${target.title}"?`,
    });
    if (!confirmed) return;

    deleting = true;
    try {
      const success = await api.event.delete.mutate(target.id);
      if (success) {
        open = false;
        onSaved?.();
        toast.success('Event deleted');
      } else {
        toast.error('Failed to delete event');
      }
    } finally {
      deleting = false;
    }
  };
</script>

<Modal bind:open>
  <ModalBreadcrumbHeader
    section="Calendar"
    title={isEdit ? 'Edit event' : 'Add event'}
    icon={isEdit ? Pencil : CalendarPlus}
  />
  <form method="POST" action="/api/event/save/form" use:enhance>
    <ModalBody>
      <div class="grid gap-4">
        {#key open && (event?.id ?? 'new')}
          <EventFormFields {form} />
        {/key}
      </div>
    </ModalBody>
    <ModalFooter>
      {#if isEdit}
        <Button
          type="button"
          variant="destructive"
          disabled={deleting}
          onclick={deleteEvent}
        >
          Delete
        </Button>
      {/if}
      <Form.Button>{isEdit ? 'Save' : 'Add'}</Form.Button>
    </ModalFooter>
  </form>
</Modal>
