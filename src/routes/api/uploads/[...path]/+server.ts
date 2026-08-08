import type { RequestHandler } from './$types';

import { uploadManager } from '$lib/server/utils/uploads';

export const GET: RequestHandler = async ({ params }) => {
  const relativePath = params.path;

  if (!relativePath || !uploadManager.isReady) {
    return new Response('Not found', { status: 404 });
  }

  // Security: reject path traversal segments outright (R2 keys are flat, but
  // never store or serve a key containing "..").
  if (relativePath.split('/').includes('..')) {
    return new Response('Forbidden', { status: 403 });
  }

  const file = await uploadManager.getFile(relativePath);
  if (!file) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(file.body, {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
