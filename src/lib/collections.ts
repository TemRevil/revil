/**
 * Where the private records live: one Firestore document per contact message, meeting
 * and treasury entry, keyed by the id the entry always had. (They used to be maps inside
 * Settings/Canary and the Treasury/* documents, which capped them at 1 MiB, made every
 * writer race over the whole map and made every trigger diff the whole document.)
 *
 * The dashboard, Spark, the Cloud Functions and the MCP server all name them from here.
 * The functions build copies this file to functions/src/collections.ts
 * (functions/scripts/sync-shared.mjs): edit it here. firestore.rules spells the same
 * names out, since it can't import it.
 */
export const COLLECTIONS = {
    /** Contact-form messages. */
    messages: 'CanaryMessages',
    /** Booked calls: `start` is a UTC ISO instant, `timeZone`/`utcOffset` the owner's clock then. */
    meetings: 'CanaryMeetings',
    treasuryProjects: 'TreasuryProjects',
    treasuryIncome: 'TreasuryIncome',
    treasurySpendings: 'TreasurySpendings',
    treasuryAccounts: 'TreasuryAccounts',
    /** The log of receipts emailed from the dashboard or over MCP. */
    treasuryReceipts: 'TreasuryReceipts',
} as const;
