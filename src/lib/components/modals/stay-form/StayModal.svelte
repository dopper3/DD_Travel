<script lang="ts">
  import { BedDouble, Pencil } from '@o7/icon/lucide';
  import { toast } from 'svelte-sonner';
  import { defaults, type Infer, superForm } from 'sveltekit-superforms';
  import { zod4 as zod } from 'sveltekit-superforms/adapters';

  import StayFormFields from './StayFormFields.svelte';

  import * as Form from '$lib/components/ui/form';
  import {
    Modal,
    ModalBody,
    ModalBreadcrumbHeader,
    ModalFooter,
  } from '$lib/components/ui/modal';
  import type { StayListItem } from '$lib/db/types';
  import { staySchema } from '$lib/zod/stay';

  let {
    open = $bindable(false),
    stay = null,
    onSaved,
  }: {
    open?: boolean;
    stay?: StayListItem | null;
    onSaved?: () => void;
  } = $props();

  const isEdit = $derived(stay !== null);

  const form = superForm(defaults<Infer<typeof staySchema>>(zod(staySchema)), {
    dataType: 'json',
    validators: zod(staySchema),
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
  });
  const { enhance, reset } = form;

  // Re-seed the form each time the modal opens, for the targeted stay (edit)
  // or with blank defaults (add).
  $effect(() => {
    if (!open) return;
    const target = stay;
    reset({
      data: target
        ? {
            id: target.id,
            name: target.name,
            address: target.address,
            city: target.city,
            country: target.country,
            lat: target.lat,
            lon: target.lon,
            checkIn: target.checkIn,
            checkOut: target.checkOut,
            confirmationCode: target.confirmationCode,
            note: target.note,
          }
        : undefined,
    });
  });
</script>

<Modal bind:open>
  <ModalBreadcrumbHeader
    section="Stays"
    title={isEdit ? 'Edit stay' : 'Add stay'}
    icon={isEdit ? Pencil : BedDouble}
  />
  <form method="POST" action="/api/stay/save/form" use:enhance>
    <ModalBody>
      <div class="grid gap-4">
        {#key open && (stay?.id ?? 'new')}
          <StayFormFields {form} />
        {/key}
      </div>
    </ModalBody>
    <ModalFooter>
      <Form.Button>{isEdit ? 'Save' : 'Add'}</Form.Button>
    </ModalFooter>
  </form>
</Modal>
