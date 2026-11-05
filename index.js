/**
 * Host half of the USD token-cost bundle.
 *
 * The Host row only composes the bundle: every visible part is the Client
 * module in `./client.js`, which replaces the composer's `usage` statistics
 * control with one that also prices the session's token usage.
 */
export function apply() {}
