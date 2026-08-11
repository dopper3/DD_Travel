<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { defaults, type Infer, superForm } from 'sveltekit-superforms';
  import { zod4 as zod } from 'sveltekit-superforms/adapters';

  import { PageHeader } from '.';

  import { invalidateAll } from '$app/navigation';
  import { Locked } from '$lib/components/helpers';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import { appConfig } from '$lib/state.svelte';
  import { emailImportConfigSchema } from '$lib/zod/config';

  const form = superForm(
    defaults<Infer<typeof emailImportConfigSchema>>(
      { allowedSenders: '' },
      zod(emailImportConfigSchema),
    ),
    {
      resetForm: false,
      validators: zod(emailImportConfigSchema),
      onUpdated({ form }) {
        if (form.message) {
          if (form.message.type === 'success') {
            invalidateAll();
            savedSenders = $formData.allowedSenders;
            toast.success(form.message.text);
            return;
          }
          toast.error(form.message.text);
        }
      },
    },
  );
  const { form: formData, enhance } = form;

  let savedSenders: string = $state('');

  onMount(async () => {
    try {
      const res = await fetch('/api/email-import/config/get');
      if (res.ok) {
        const data = await res.json();
        savedSenders = data.allowedSenders ?? '';
        $formData.allowedSenders = savedSenders;
      }
    } catch (e) {
      // ignore
    }
  });

  const changes = $derived($formData.allowedSenders !== savedSenders);
</script>

<PageHeader
  title="Email Import"
  subtitle="Forward flight confirmation emails to have flights added automatically."
>
  <form
    method="POST"
    action="/api/email-import/config/save"
    autocomplete="off"
    class="space-y-4"
    use:enhance
  >
    <Locked
      locked={appConfig.envConfigured?.emailImport?.allowedSenders ?? false}
      tooltip={lockedTooltip}
    >
      <Form.Field {form} name="allowedSenders">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>Allowed senders</Form.Label>
            <Form.Description>
              Emails forwarded to the import address are only processed when
              they come from one of these senders. Separate entries with commas.
              Use a full address (e.g. me@example.com) or a whole domain by
              starting the entry with @ (e.g. @example.com). Leave empty to
              disable email import.
            </Form.Description>
            <Input
              bind:value={$formData.allowedSenders}
              {...props}
              placeholder="me@example.com, @example.com"
            />
          {/snippet}
        </Form.Control>
        <Form.FieldErrors />
      </Form.Field>
    </Locked>

    <Form.Button disabled={!changes}>Save</Form.Button>
  </form>
</PageHeader>

{#snippet lockedTooltip()}
  <p>
    This setting is locked because it is configured via environment variables.
  </p>
  <p>
    To change this setting, update or delete the environment variable and
    restart the server.
  </p>
{/snippet}
