/*
 * GABAY SA FILE: Per-Staff Live SMS Rate Limiter (backend/src/lib/smsRateLimit.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Dito naka-set yung sliding-window limit na max 10 live SMS send attempts lang
 *   per staff member kada 60 seconds, para hindi maubos agad yung SMS credits ng
 *   clinic kapag nag-double-click o nagwala yung script.
 *
 * Madalas na bugs o features na dapat silipin dito (pang-debug sa defense):
 *   - 429 "Too many SMS attempts" na response (tingnan yung Retry-After header kung ilang seconds maghihintay)
 *   - Sa memory lang ng Node process naka-save yung quota kaya nagre-reset 'to kapag ni-restart yung server
 */
// Note lang: process-local 'tong quota kaya reset siya pag restart ng server;
// kung magpapatakbo ng multiple backend instances o workers sa future, kailangan ng shared atomic storage (gaya ng Redis/DB).

// Factory function na gumagawa ng sariling per-staff sliding-window rate limiter.
// Input: now (optional clock function na nagbabalik ng ms timestamp; pwedeng i-inject sa tests).
// Output: consume(staffId) -> 0 kapag pasado/allowed, o retryAfterSeconds (> 0) kapag naabot na yung 10/min limit.
// Pang-debug tip: Synchronous 'to bago pa mag-await sa SMS gateway para kahit sabay-sabay yung requests ng isang staff, hindi sila makakalusot sa 10-per-minute cap.
function createSmsRateLimit(now = () => Date.now()) {
  const attemptsByStaff = new Map();
  return function consume(staffId) {
    const time = now();
    const cutoff = time - 60000;
    // Tinatanggal yung mga expired na staff entries para hindi lumobo nang lumobo yung Map sa memory.
    for (const [id, attempts] of attemptsByStaff) {
      if (attempts[attempts.length - 1] <= cutoff) attemptsByStaff.delete(id);
    }
    const attempts = (attemptsByStaff.get(staffId) || []).filter(
      (timestamp) => timestamp > cutoff,
    );
    // I-block kapag naka-10 attempts na 'tong staff member sa loob ng huling 60 seconds.
    if (attempts.length >= 10)
      return Math.ceil((attempts[0] + 60000 - time) / 1000);
    // Bawas agad sa quota bago mag-await para iisang quota lang gamit ng mga sabay-sabay na request.
    attempts.push(time);
    attemptsByStaff.set(staffId, attempts);
    return 0;
  };
}

module.exports = { createSmsRateLimit };
