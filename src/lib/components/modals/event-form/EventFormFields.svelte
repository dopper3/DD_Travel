<script lang="ts">
  import { Time } from '@internationalized/date';
  import type { Infer, SuperForm } from 'sveltekit-superforms';

  import DateField from '$lib/components/form-fields/DateField.svelte';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import { TimeInput } from '$lib/components/ui/time-input';
  import type { eventSchema } from '$lib/zod/event';

  const { form }: { form: SuperForm<Infer<typeof eventSchema>> } = $props();

  const { form: formData } = form;

  const parseTime = (value: string | null): Time | undefined => {
    if (!value) return undefined;
    const [hour, minute] = value.split(':').map(Number);
    return new Time(hour, minute);
  };
  const formatTime = (value: Time | undefined): string | null =>
    value
      ? `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`
      : null;

  let startTime = $state(parseTime($formData.startTime));
  let endTime = $state(parseTime($formData.endTime));
</script>

<Form.Field {form} name="title">
  <Form.Control>
    {#snippet children({ props })}
      <Form.Label>Title *</Form.Label>
      <Input
        bind:value={$formData.title}
        {...props}
        placeholder="e.g. Dinner with the Smiths"
      />
    {/snippet}
  </Form.Control>
  <Form.FieldErrors />
</Form.Field>

<section class="grid grid-cols-1 gap-2 sm:grid-cols-2">
  <DateField {form} name="startDate" label="Date" required />
  <Form.Field {form} name="startTime">
    <Form.Control>
      {#snippet children()}
        <Form.Label>Start time</Form.Label>
        <TimeInput
          bind:value={startTime}
          onValueChange={(v) => ($formData.startTime = formatTime(v))}
          locale={navigator.language}
        />
        <Form.Description>Leave empty for an all-day event.</Form.Description>
      {/snippet}
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>
</section>

<section class="grid grid-cols-1 gap-2 sm:grid-cols-2">
  <DateField {form} name="endDate" label="End date" />
  <Form.Field {form} name="endTime">
    <Form.Control>
      {#snippet children()}
        <Form.Label>End time</Form.Label>
        <TimeInput
          bind:value={endTime}
          onValueChange={(v) => ($formData.endTime = formatTime(v))}
          locale={navigator.language}
        />
      {/snippet}
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>
</section>

<Form.Field {form} name="location">
  <Form.Control>
    {#snippet children({ props })}
      <Form.Label>Location</Form.Label>
      <Input
        bind:value={$formData.location}
        {...props}
        placeholder="Venue name or address"
      />
    {/snippet}
  </Form.Control>
  <Form.FieldErrors />
</Form.Field>

<Form.Field {form} name="description">
  <Form.Control>
    {#snippet children({ props })}
      <Form.Label>Notes</Form.Label>
      <Input
        bind:value={$formData.description}
        {...props}
        placeholder="Details, confirmation numbers, ..."
      />
    {/snippet}
  </Form.Control>
  <Form.FieldErrors />
</Form.Field>
