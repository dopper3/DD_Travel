/// <reference types="vite-plugin-pwa/client" />

declare global {
  namespace App {
    interface Locals {
      user: import('lucia').User | null;
      session: import('lucia').Session | null;
    }

    interface PageData {
      user: import('$lib/db/types').PageUser | null;
      users: import('$lib/db/types').PublicUser[];
    }

    namespace Superforms {
      type Message = { type: 'success' | 'error'; text: string; id?: number };
    }

    interface Platform {
      env: {
        DB: import('@cloudflare/workers-types').D1Database;
        UPLOADS: import('@cloudflare/workers-types').R2Bucket;
        ORIGIN?: string;
        [key: string]: unknown;
      };
      ctx: { waitUntil(promise: Promise<unknown>): void };
    }
  }
}

export {};
