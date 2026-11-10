import { ApiError } from '../data/api';

export type BatchResult =
  | { status: 'completed'; succeeded: number }
  | { status: 'rate-limited'; succeeded: number; retryAt: number; error: unknown }
  | { status: 'uncertain'; succeeded: number; error: unknown };

export async function sendBatch<T>(
  items: readonly T[],
  succeeded: number,
  send: (item: T) => Promise<unknown>,
  onSuccess: (count: number) => void,
): Promise<BatchResult> {
  for (const item of items.slice(succeeded)) {
    try {
      await send(item);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        return { status: 'rate-limited', succeeded, retryAt: error.retryAt ?? Date.now() + 60000, error };
      }
      // A lost response or provider error does not prove non-delivery.
      return { status: 'uncertain', succeeded, error };
    }
    succeeded += 1;
    onSuccess(succeeded);
  }
  return { status: 'completed', succeeded };
}
