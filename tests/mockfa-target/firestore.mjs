import * as base from "../mockfa-occ/firestore.mjs";
export const Timestamp = base.Timestamp, FieldValue = base.FieldValue, FieldPath = base.FieldPath;
const C = globalThis.__FB_ACCESS = globalThis.__FB_ACCESS || { inits: [], firestore: 0, collections: 0 };
export function getFirestore(...args) {
  C.firestore++;
  const db = base.getFirestore(...args);
  const collection = db.collection;
  return { ...db, collection: (...a) => { C.collections++; return collection(...a); } };
}
