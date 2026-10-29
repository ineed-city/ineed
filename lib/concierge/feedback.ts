import { z } from 'zod';

// User-submitted report, not a trusted transcript. Photos and shared posts excluded.
export const FeedbackSchema = z.object({
  answerId: z.uuid(),
  rating: z.enum(['helpful', 'not_helpful']),
  comment: z.string().trim().max(1000),
  question: z.string().trim().min(2).max(2000),
  answer: z.string().trim().min(1).max(16000),
  language: z.enum(['en', 'ro']),
});
