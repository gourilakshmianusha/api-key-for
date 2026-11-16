# SerpForge Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **User Isolation & PII Protection**: `/users/{userId}` documents contain user email addresses and may only be read or written by the authenticated, email-verified user whose `request.auth.uid == userId`. Collection listing on `/users` is disabled.
2. **Key Ownership & Existence**: Every `/apiKeys/{keyId}` document must belong to an existing `/users/{ownerId}` document where `ownerId == request.auth.uid`, must start in `status == 'active'` with `requestCount == 0`, and must never change `id`, `ownerId`, `keyValue`, `keyPrefix`, `keyMasked`, or `createdAt` after creation.
3. **Terminal State Locking**: Once an API key's `status` transitions to `'revoked'`, it can never be reactivated or mutated back to `'active'`.
4. **Log Integrity & Parent Gate**: Every `/requestLogs/{logId}` document must reference an existing `/apiKeys/{keyId}` owned by `request.auth.uid`, enforce `createdAt == request.time`, and disallow post-creation tampering.
5. **Query Enforcer**: All `list` operations on `/apiKeys` and `/requestLogs` enforce `resource.data.ownerId == request.auth.uid` directly in the rule without `get()`/`exists()` calls.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated User Creation**: Unauthenticated client attempts `setDoc(/users/attacker, ...)`. Expected: `PERMISSION_DENIED`.
2. **Unverified Email Spoofing**: Authenticated user with `email_verified: false` attempts `setDoc(/apiKeys/key1, ...)`. Expected: `PERMISSION_DENIED`.
3. **Cross-User PII Read**: User A attempts `getDoc(/users/userB)`. Expected: `PERMISSION_DENIED`.
4. **Privilege / Plan Escalation**: User A attempts `setDoc(/users/userA, { ..., plan: "enterprise-admin" })`. Expected: `PERMISSION_DENIED`.
5. **Shadow Field Injection**: User A attempts `setDoc(/apiKeys/key1, { ..., isAdmin: true })`. Expected: `PERMISSION_DENIED`.
6. **Identity Spoofing on Key Create**: User A attempts `setDoc(/apiKeys/key1, { ..., ownerId: "userB" })`. Expected: `PERMISSION_DENIED`.
7. **Key Value Tampering on Update**: User A attempts `updateDoc(/apiKeys/key1, { keyValue: "sf_live_hijacked", updatedAt: serverTimestamp() })`. Expected: `PERMISSION_DENIED`.
8. **Revoked Key Resurrection**: User A attempts `updateDoc(/apiKeys/revokedKey, { status: "active", updatedAt: serverTimestamp() })`. Expected: `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: User A creates `/requestLogs/log1` with `createdAt: new Date("2020-01-01")`. Expected: `PERMISSION_DENIED`.
10. **Orphaned Log Creation**: User A creates `/requestLogs/log1` referencing non-existent `keyId: "missing_key"`. Expected: `PERMISSION_DENIED`.
11. **Resource Exhaustion / Oversized ID**: User A attempts `setDoc(/apiKeys/${"a".repeat(300)}, ...)`. Expected: `PERMISSION_DENIED`.
12. **Blanket Query Scraping**: User A runs `getDocs(collection(db, "apiKeys"))` without `where("ownerId", "==", userA.uid)`. Expected: `PERMISSION_DENIED`.
