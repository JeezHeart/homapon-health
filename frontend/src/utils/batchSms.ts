/**
 * Helper para sa isa-isang pag-send ng batch SMS reminders na may safe pause/resume tracking.
 *
 * Dito naka-handle yung loop na nagse-send ng reminders one by one, nagta-track kung ilan
 * na yung na-send nang maayos, at humihinto agad kapag na-rate-limit o nagka-uncertain error
 * para hindi ma-spam ng duplicate text yung mga magulang/guardian.
 *
 * Tinatawag ito ng: `BatchSmsDialog.tsx`.
 */
import { ApiError } from '../data/api';

/**
 * Resulta na binabalik ng `sendBatch`:
 * - `completed`: lahat ng natitirang items sa batch ay na-send na nang successful.
 * - `rate-limited`: nagbalik ng HTTP 429 yung server; may kasamang `retryAt` timestamp (ms)
 *   para alam ng UI kung kailan pwede mag-resume mula sa `succeeded`.
 * - `uncertain`: nagka-network o provider error; hindi sigurado kung nakalusot o hindi yung
 *   message, kaya titigil muna para ma-verify ng staff bago ulitin.
 */
export type BatchResult =
  | { status: 'completed'; succeeded: number }
  | { status: 'rate-limited'; succeeded: number; retryAt: number; error: unknown }
  | { status: 'uncertain'; succeeded: number; error: unknown };

/**
 * Nagse-send ng listahan ng SMS reminders nang isa-isa, at pwedeng mag-resume mula sa
 * bilang ng mga dati nang na-send.
 *
 * Inputs:
 * - `items`: buong listahan ng reminders na ise-send nang sunod-sunod.
 * - `succeeded`: ilan na yung na-send sa unang attempt (0 kapag bagong simula).
 * - `send`: async function na nagpapadala ng isang item.
 * - `onSuccess`: callback na tinatawag bawat successful send para ma-update yung progress count.
 *
 * Output: `BatchResult` na nagsasabi kung natapos lahat, na-rate-limit, o huminto dahil uncertain.
 *
 * Edge cases na hawak nito:
 * - Linalaktawan yung `items.slice(0, succeeded)` para hindi ma-resend yung mga nauna nang naipadala.
 * - Kapag walang `retryAt` sa HTTP 429 response, nagfa-fallback sa 60 seconds cooldown (`Date.now() + 60000`).
 * - Kapag ibang error (hindi 429), `uncertain` agad dahil hindi patunay ng lost connection na hindi natanggap yung text.
 */
export async function sendBatch<T>(
  items: readonly T[],
  succeeded: number,
  send: (item: T) => Promise<unknown>,
  onSuccess: (count: number) => void,
): Promise<BatchResult> {
  // Simulan lang sa unang hindi pa na-send para sure na walang duplicate SMS.
  for (const item of items.slice(succeeded)) {
    try {
      await send(item);
    } catch (error) {
      // HTTP 429 = pinapahinga muna ng server (rate limit); pause hanggang retryAt.
      if (error instanceof ApiError && error.status === 429) {
        return { status: 'rate-limited', succeeded, retryAt: error.retryAt ?? Date.now() + 60000, error };
      }
      // Hindi patunay yung lost response o provider error na hindi na-deliver yung SMS.
      return { status: 'uncertain', succeeded, error };
    }
    // Dagdagan lang yung bilang at i-update yung UI kapag confirm na pumasok sa server.
    succeeded += 1;
    onSuccess(succeeded);
  }
  return { status: 'completed', succeeded };
}
