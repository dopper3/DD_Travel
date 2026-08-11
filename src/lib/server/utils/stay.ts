import { db } from '$lib/db';
import type { StayFormValues } from '$lib/zod/stay';

/** Insert or update a stay for the given user. Returns the stay id. */
export const saveStay = async (
  userId: string,
  input: StayFormValues,
): Promise<number> => {
  const { id, ...values } = input;
  if (id === null) {
    const created = await db
      .insertInto('stay')
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
    .updateTable('stay')
    .set({ ...values, updatedAt: new Date() })
    .where('id', '=', id)
    .where('userId', '=', userId)
    .executeTakeFirstOrThrow();
  return id;
};
