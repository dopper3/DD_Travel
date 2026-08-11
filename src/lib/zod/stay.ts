import { z } from 'zod';

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (expected YYYY-MM-DD)');

export const staySchema = z
  .object({
    id: z.number().int().positive().nullable().default(null),
    name: z.string().min(1, 'Name is required'),
    address: z.string().nullable().default(null),
    city: z.string().nullable().default(null),
    country: z.string().length(2).nullable().default(null),
    lat: z.number().min(-90).max(90).nullable().default(null),
    lon: z.number().min(-180).max(180).nullable().default(null),
    checkIn: dayString,
    checkOut: dayString,
    confirmationCode: z.string().nullable().default(null),
    note: z.string().nullable().default(null),
  })
  .superRefine((data, ctx) => {
    if (data.checkIn && data.checkOut && data.checkOut < data.checkIn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkOut'],
        message: 'Check-out must not be before check-in',
      });
    }
    if ((data.lat === null) !== (data.lon === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lat'],
        message: 'Set both coordinates or neither',
      });
    }
  });

export type StayFormValues = z.infer<typeof staySchema>;
