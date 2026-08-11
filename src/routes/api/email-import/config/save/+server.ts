import { error } from '@sveltejs/kit';
import { actionResult, superValidate } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';

import type { RequestHandler } from './$types';

import { appConfig } from '$lib/server/utils/config';
import { emailImportConfigSchema } from '$lib/zod/config';

export const POST: RequestHandler = async ({ locals, request }) => {
  const form = await superValidate(request, zod(emailImportConfigSchema));
  if (!form.valid) return actionResult('failure', { form });

  const user = locals.user;
  if (!user || user.role === 'user') {
    return actionResult('error', 'Unauthorized', 401);
  }

  const currentConfig = (await appConfig.get())?.emailImport;
  const allowedSenders = form.data.allowedSenders
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');

  if (
    currentConfig &&
    allowedSenders !== currentConfig.allowedSenders &&
    appConfig.envConfigured?.emailImport?.allowedSenders
  ) {
    return error(500, {
      message:
        'This config field is controlled by the .env file and cannot be changed here.',
    });
  }

  const success = await appConfig.set({
    emailImport: { allowedSenders },
  });

  if (!success) {
    form.message = {
      type: 'error',
      text: 'Failed to update email import config',
    };
    return actionResult('failure', { form });
  }

  form.message = { type: 'success', text: 'Email import config updated' };
  return actionResult('success', { form });
};
