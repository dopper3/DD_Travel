import { db } from '$lib/db';
import type { EventFormValues } from '$lib/zod/event';

/**
 * Insert or update a calendar event. Returns the event id.
 * Updates are intentionally not scoped by userId: the calendar is shared
 * household-wide, so either user may edit any event.
 */
export const saveEvent = async (
  userId: string,
  input: EventFormValues,
): Promise<number> => {
  const { id, ...values } = input;
  if (id === null) {
    const created = await db
      .insertInto('event')
      .values({
        ...values,
        source: 'manual',
        userId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return created.id;
  }

  await db
    .updateTable('event')
    .set({ ...values, updatedAt: new Date() })
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  return id;
};
