import { z } from 'zod';

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (expected YYYY-MM-DD)');
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time (expected HH:MM)');
// Cleared date/time inputs post '' rather than null.
const emptyToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? null : v), schema.nullable().default(null));

export const eventSchema = z
  .object({
    id: z.number().int().positive().nullable().default(null),
    title: z.string().min(1, 'Title is required'),
    description: z.string().nullable().default(null),
    location: z.string().nullable().default(null),
    lat: z.number().min(-90).max(90).nullable().default(null),
    lon: z.number().min(-180).max(180).nullable().default(null),
    startDate: dayString,
    startTime: emptyToNull(timeString),
    endDate: emptyToNull(dayString),
    endTime: emptyToNull(timeString),
  })
  .superRefine((data, ctx) => {
    if (data.endDate !== null && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must not be before start date',
      });
    }
    if (data.endTime !== null && data.startTime === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'An end time requires a start time',
      });
    }
    if (
      data.startTime !== null &&
      data.endTime !== null &&
      (data.endDate === null || data.endDate === data.startDate) &&
      data.endTime <= data.startTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'End time must be after start time',
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

export type EventFormValues = z.infer<typeof eventSchema>;
