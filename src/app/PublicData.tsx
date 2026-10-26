import snapshot from '../data/public.snapshot.json'

// The build's copy of the public Firestore content (scripts/sync-data.mjs), baked into the
// page as JSON for lib/dataCache: a first-time visitor's sections draw with it at once,
// before Firebase has loaded. A server component, so none of it ships as JavaScript.

type Snapshot = { at: number; docs: Record<string, unknown>; collections: Record<string, unknown> }

/** Carries every path by default; a page that needs fewer names its `docs` (and no collections). */
export default function PublicData({ docs }: { docs?: string[] }) {
  const all = snapshot as Snapshot
  const data: Snapshot = docs
    ? { at: all.at, docs: Object.fromEntries(docs.map((p) => [p, all.docs[p] ?? null])), collections: {} }
    : all
  // `<` escaped, so no text in the data can close the script tag.
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script id="public-data" type="application/json" dangerouslySetInnerHTML={{ __html: json }} />
}
