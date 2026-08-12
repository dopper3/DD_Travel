import { actionResult, superValidate } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';

import type { RequestHandler } from './$types';

import { saveEvent } from '$lib/server/utils/event';
import { eventSchema } from '$lib/zod/event';

export const POST: RequestHandler = async ({ locals, request }) => {
  const formData = await request.formData();
  const form = await superValidate(formData, zod(eventSchema));
  if (!form.valid) {
    return actionResult('failure', { form });
  }

  const user = locals.user;
  if (!user) {
    form.message = { type: 'error', text: 'Not logged in' };
    return actionResult('failure', { form });
  }

  const isEdit = form.data.id !== null;
  try {
    await saveEvent(user.id, form.data);
  } catch {
    form.message = {
      type: 'error',
      text: isEdit ? 'Failed to update event' : 'Failed to add event',
    };
    return actionResult('failure', { form });
  }

  form.message = {
    type: 'success',
    text: isEdit ? 'Event updated' : 'Event added',
  };
  return actionResult('success', { form });
};
