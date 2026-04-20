## What this changes

<!-- 1-3 sentences. What does this PR do? -->

## Why

<!-- Link issue, quote user feedback, or state the hypothesis -->

## Money-flow impact

<!-- Check all that apply; delete the rest -->
- [ ] Touches mint/sponsor/hyphal/tip finalize (atomic-claim preserved?)
- [ ] Introduces a new on-chain transfer (memo-scoped idempotency?)
- [ ] Changes pulse distribution math
- [ ] Changes a signed-message action (replay-guard preserved?)
- [ ] No money flow changed

## Testing

<!-- Minimum: `node --check hooks/*.js` passes. If you can, test against staging. -->

## Screenshots (if UI)

<!-- Before / after if you changed any surface -->

## Checklist

- [ ] Syntax valid on all touched files
- [ ] No secrets committed
- [ ] No new `require()` of a file outside the repo
- [ ] README / docs updated if the API or env vars changed

---

For larger / experimental changes, tag the issue with `experiment` and ship behind a feature flag where possible.
