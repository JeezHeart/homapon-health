// shortcut: process-local quotas reset on restart; use shared atomic storage
// before running multiple backend instances or workers.
function createSmsRateLimit(now = () => Date.now()) {
  const attemptsByStaff = new Map();
  return function consume(staffId) {
    const time = now();
    const cutoff = time - 60000;
    for (const [id, attempts] of attemptsByStaff) {
      if (attempts[attempts.length - 1] <= cutoff) attemptsByStaff.delete(id);
    }
    const attempts = (attemptsByStaff.get(staffId) || []).filter(
      (timestamp) => timestamp > cutoff,
    );
    if (attempts.length >= 10)
      return Math.ceil((attempts[0] + 60000 - time) / 1000);
    // Consume before any await so concurrent requests share the same quota.
    attempts.push(time);
    attemptsByStaff.set(staffId, attempts);
    return 0;
  };
}

module.exports = { createSmsRateLimit };
