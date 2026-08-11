import { actionResult, superValidate } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';

import type { RequestHandler } from './$types';

import { saveStay } from '$lib/server/utils/stay';
import { staySchema } from '$lib/zod/stay';

export const POST: RequestHandler = async ({ locals, request }) => {
  const formData = await request.formData();
  const form = await superValidate(formData, zod(staySchema));
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
    await saveStay(user.id, form.data);
  } catch {
    form.message = {
      type: 'error',
      text: isEdit ? 'Failed to update stay' : 'Failed to add stay',
    };
    return actionResult('failure', { form });
  }

  form.message = {
    type: 'success',
    text: isEdit ? 'Stay updated' : 'Stay added',
  };
  return actionResult('success', { form });
};
