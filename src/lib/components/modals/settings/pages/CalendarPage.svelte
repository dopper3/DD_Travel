<script lang="ts">
  import { Copy, RefreshCw } from '@o7/icon/lucide';
  import { toast } from 'svelte-sonner';

  import { PageHeader } from '.';

  import { confirmation } from '$lib/components/helpers';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { api, trpc } from '$lib/trpc';

  const feedUrlResult = trpc.calendar.feedUrl.query();
  const feedUrl = $derived($feedUrlResult.data ?? '');

  const copyUrl = async () => {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    toast.success('Feed URL copied');
  };

  let regenerating = $state(false);
  const regenerate = async () => {
    const confirmed = await confirmation.show({
      title: 'Regenerate Feed URL',
      description:
        'The current URL will stop working and every subscribed phone or calendar app must be re-subscribed with the new one. Continue?',
    });
    if (!confirmed) return;

    regenerating = true;
    try {
      await api.calendar.regenerateFeedToken.mutate();
      await trpc.calendar.feedUrl.utils.invalidate();
      toast.success('Feed URL regenerated');
    } catch {
      toast.error('Failed to regenerate feed URL');
    } finally {
      regenerating = false;
    }
  };
</script>

<PageHeader
  title="Calendar"
  subtitle="Subscribe to your travel calendar from your phone's calendar app."
>
  <div class="space-y-4">
    <div class="space-y-2">
      <p class="text-sm leading-none font-medium">Subscription URL</p>
      <p class="text-sm text-muted-foreground">
        This private link contains all flights, stays, and events for everyone
        on this instance. Anyone with the link can read the calendar, so share
        it only with your household.
      </p>
      <div class="flex gap-2">
        <Input readonly value={feedUrl} class="font-mono text-xs" />
        <Button
          variant="outline"
          size="icon"
          class="shrink-0"
          onclick={copyUrl}
          disabled={!feedUrl}
        >
          <Copy size={16} />
        </Button>
      </div>
    </div>

    <div class="space-y-1 text-sm text-muted-foreground">
      <p class="font-medium text-foreground">How to subscribe</p>
      <p>
        <b>Google Calendar</b>: Settings → Add calendar → From URL → paste the
        link.
      </p>
      <p>
        <b>iPhone</b>: Settings → Apps → Calendar → Calendar Accounts → Add
        Account → Other → Add Subscribed Calendar → paste the link.
      </p>
      <p>
        Calendar apps refresh subscribed feeds on their own schedule — new
        trips can take a few hours to appear on your phone.
      </p>
    </div>

    <Button variant="outline" disabled={regenerating} onclick={regenerate}>
      <RefreshCw size={16} class="shrink-0" />
      Regenerate URL
    </Button>
  </div>
</PageHeader>
