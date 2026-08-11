// The project's TS setup does not load @cloudflare/workers-types' ambient
// declaration for the "cloudflare:email" runtime module; declare it locally.
declare module 'cloudflare:email' {
  import type { EmailMessage as EmailMessageInstance } from '@cloudflare/workers-types';

  export const EmailMessage: {
    prototype: EmailMessageInstance;
    new (
      from: string,
      to: string,
      raw: ReadableStream | string,
    ): EmailMessageInstance;
  };
}
