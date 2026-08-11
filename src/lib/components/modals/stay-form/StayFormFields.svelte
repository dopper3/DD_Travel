<script lang="ts">
  import { MapPin, Search } from '@o7/icon/lucide';
  import maplibregl, { type LngLatLike } from 'maplibre-gl';
  import { mode } from 'mode-watcher';
  import { onDestroy } from 'svelte';
  import {
    AttributionControl,
    MapLibre,
    Marker,
    type MarkerClickInfo,
    NavigationControl,
  } from 'svelte-maplibre';
  import { toast } from 'svelte-sonner';
  import type { Infer, SuperForm } from 'sveltekit-superforms';

  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import * as Select from '$lib/components/ui/select';
  import DateField from '$lib/components/form-fields/DateField.svelte';
  import { COUNTRIES } from '$lib/data/countries';
  import {
    getAppMapImages,
    getConfiguredAppMapStyleUrl,
  } from '$lib/map/app-style';
  import { registerPmtilesProtocol } from '$lib/map/pmtiles';
  import { appConfig } from '$lib/state.svelte';
  import { api } from '$lib/trpc';
  import { countryFromAlpha2 } from '$lib/utils/data/countries';
  import type { staySchema } from '$lib/zod/stay';

  const { form }: { form: SuperForm<Infer<typeof staySchema>> } = $props();

  const { form: formData, errors } = form;
  const unregisterPmtiles = browser ? registerPmtilesProtocol() : null;

  onDestroy(() => unregisterPmtiles?.());

  let map: maplibregl.Map | undefined = $state(undefined);
  const style = $derived(
    getConfiguredAppMapStyleUrl(mode.current, appConfig.config?.map),
  );
  const images = $derived(getAppMapImages(base, mode.current));

  let marker: LngLatLike | null = $state(
    $formData.lon === null || $formData.lat === null
      ? null
      : { lng: $formData.lon, lat: $formData.lat },
  );

  const setLocation = (lng: number, lat: number) => {
    marker = { lng, lat };
    $formData.lon = lng;
    $formData.lat = lat;
  };

  const markLocation = (e: maplibregl.MapMouseEvent) => {
    setLocation(e.lngLat.lng, e.lngLat.lat);
  };

  const onDrag = (e: MarkerClickInfo) => {
    const [lng, lat] = e.lngLat;
    setLocation(lng, lat);
  };

  let geocoding = $state(false);
  const findOnMap = async () => {
    const query = [
      $formData.name,
      $formData.address,
      $formData.city,
      $formData.country
        ? (countryFromAlpha2($formData.country)?.name ?? null)
        : null,
    ]
      .filter(Boolean)
      .join(', ');
    if (query.length < 3) {
      toast.error('Enter a name or address first');
      return;
    }

    geocoding = true;
    try {
      const result = await api.stay.geocode.mutate({ query });
      if (!result) {
        toast.error('Address not found — click the map to place it');
        return;
      }
      setLocation(result.lon, result.lat);
      map?.flyTo({ center: [result.lon, result.lat], zoom: 13 });
      if (!$formData.city && result.city) $formData.city = result.city;
      if (!$formData.country && result.countryCode) {
        $formData.country = result.countryCode;
      }
    } finally {
      geocoding = false;
    }
  };
</script>

<Form.Field {form} name="name">
  <Form.Control>
    {#snippet children({ props })}
      <Form.Label>Name *</Form.Label>
      <Input
        bind:value={$formData.name}
        {...props}
        placeholder="e.g. Hilton Garden Inn Downtown"
      />
    {/snippet}
  </Form.Control>
  <Form.FieldErrors />
</Form.Field>

<section class="grid grid-cols-1 gap-2 sm:grid-cols-2">
  <DateField {form} name="checkIn" label="Check-in" required />
  <DateField {form} name="checkOut" label="Check-out" required />
</section>

<Form.Field {form} name="address">
  <Form.Control>
    {#snippet children({ props })}
      <Form.Label>Address</Form.Label>
      <Input
        bind:value={$formData.address}
        {...props}
        placeholder="Street address"
      />
    {/snippet}
  </Form.Control>
  <Form.FieldErrors />
</Form.Field>

<section class="grid grid-cols-1 gap-2 sm:grid-cols-2">
  <Form.Field {form} name="city">
    <Form.Control>
      {#snippet children({ props })}
        <Form.Label>City</Form.Label>
        <Input bind:value={$formData.city} {...props} placeholder="City" />
      {/snippet}
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>
  <Form.Field {form} name="country">
    <Form.Control>
      {#snippet children({ props })}
        <Form.Label>Country</Form.Label>
        <Select.Root
          bind:value={
            () => $formData.country ?? undefined,
            (value) => ($formData.country = value ?? null)
          }
          name={props.name}
          type="single"
        >
          <Select.Trigger {...props}>
            {$formData.country
              ? countryFromAlpha2($formData.country)?.name
              : 'Select a country'}
          </Select.Trigger>
          <Select.Content>
            {#each COUNTRIES as country (country.alpha2)}
              <Select.Item value={country.alpha2} label={country.name} />
            {/each}
          </Select.Content>
        </Select.Root>
      {/snippet}
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>
</section>

<div class="flex items-center justify-between">
  <span class="text-sm leading-none font-medium">Location</span>
  <Button
    type="button"
    variant="outline"
    size="sm"
    disabled={geocoding}
    onclick={findOnMap}
  >
    <Search size={14} class="shrink-0" />
    {geocoding ? 'Searching…' : 'Find on map'}
  </Button>
</div>
<MapLibre
  bind:map
  onclick={markLocation}
  {style}
  {images}
  diffStyleUpdates
  cooperativeGestures
  class="relative aspect-video max-h-[40vh] w-full"
  attributionControl={false}
>
  {#if marker}
    <Marker ondrag={onDrag} lngLat={marker} draggable>
      <MapPin class="text-primary" size={42} />
    </Marker>
  {/if}

  <AttributionControl compact={true} />
  <NavigationControl />
</MapLibre>
<div class="text-sm text-muted-foreground">
  Use "Find on map" to look up the address, or click the map to set the location
  yourself. Drag the marker to adjust.
</div>
{#if $errors.lat || $errors.lon}
  <div class="text-sm font-medium text-destructive">
    Please set both coordinates (or clear the location).
  </div>
{/if}

<section class="grid grid-cols-1 gap-2 sm:grid-cols-2">
  <Form.Field {form} name="confirmationCode">
    <Form.Control>
      {#snippet children({ props })}
        <Form.Label>Confirmation code</Form.Label>
        <Input
          bind:value={$formData.confirmationCode}
          {...props}
          placeholder="Booking reference"
        />
      {/snippet}
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>
  <Form.Field {form} name="note">
    <Form.Control>
      {#snippet children({ props })}
        <Form.Label>Note</Form.Label>
        <Input bind:value={$formData.note} {...props} placeholder="Note" />
      {/snippet}
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>
</section>
