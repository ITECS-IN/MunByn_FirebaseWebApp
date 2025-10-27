import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type OrderByDirection,
  type QueryConstraint,
} from "firebase/firestore";

type ExactOp = "==" | "in" | "!=" | "array-contains" | "array-contains-any" | "not-in";
/** Special pseudo-op for prefix search, e.g. startsWith("abc") */
type SpecialOp = "startsWith";
/** Supported filter ops */
type Op = ExactOp | SpecialOp;

export type SearchFilter = {
  field: string;
  op: Op;
  value: any;
};

type Options = {
  pageSize?: number;
  /** If omitted, we’ll use documentId(); overridden when a range filter requires orderBy on its field. */
  orderByField?: string;
  direction?: OrderByDirection; // "asc" | "desc"
  withTotalCount?: boolean;     // default true
  /** Add filters like { field: 'tracking', op: '==', value: '123' } or { field:'carrier', op:'startsWith', value:'Fed' } */
  filters?: SearchFilter[];
};

type Result<T> = {
  data: T[];
  loading: boolean;
  error: string | null;

  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  totalCount?: number;
  totalPages?: number;

  /** Navigation */
  nextPage: () => Promise<void>;
  prevPage: () => Promise<void>;
  goToPage: (p: number) => Promise<void>;
  reset: () => void;
};

/** Build the upper bound for a Firestore prefix search */
function nextString(str: string) {
  if (!str) return "\uf8ff"; // max unicode char range
  const last = str.slice(-1);
  const prefix = str.slice(0, -1);
  const bumped = String.fromCharCode(last.charCodeAt(0) + 1);
  return prefix + bumped;
}

export function useFirestoreSearchWithServerSidePagination<T = DocumentData>(
  db: Firestore,
  collectionPath: string,
  {
    pageSize = 10,
    //orderByField,
    //direction = "asc",
    orderByField = "timestamp",
    direction = "desc",
    withTotalCount = true,
    filters = [],
  }: Options = {}
): Result<T> {
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  // Cursor (last doc) for each visited page; index 0 = before page 1
  const cursorsRef = useRef<Array<DocumentSnapshot | null>>([null]);

  /** Build QueryConstraints from filters + ordering.
   * Firestore rule: if any range filter (>=, <) exists on field F, then F must be the first orderBy.
   * We emulate prefix search with >= value and < nextString(value).
   */
  const buildConstraints = useCallback((): {
    constraints: QueryConstraint[];
    effectiveOrderByField: string | null;
  } => {
    const constraints: QueryConstraint[] = [];

    let rangeField: string | null = null;
    const equalityConstraints: QueryConstraint[] = [];

    for (const f of filters) {
      if (f.op === "startsWith") {
        // turns into: where(field, ">=", value) & where(field, "<", nextString(value))
        const upper = nextString(String(f.value));
        constraints.push(where(f.field, ">=", f.value));
        constraints.push(where(f.field, "<", upper));
        // mark range field (first one wins)
        if (!rangeField) rangeField = f.field;
      } else {
        // exact/array ops
        equalityConstraints.push(where(f.field, f.op as any, f.value));
      }
    }

    // put equality constraints after we added range ones (order doesn't matter for where)
    constraints.push(...equalityConstraints);

    // Decide ordering:
    // 1) If a range field exists, Firestore requires orderBy(rangeField) first
    // 2) Else use provided orderByField or fallback to documentId()
    if (rangeField) {
      constraints.push(orderBy(rangeField as string, direction));
      return { constraints, effectiveOrderByField: rangeField };
    } else if (orderByField) {
      constraints.push(orderBy(orderByField, direction));
      return { constraints, effectiveOrderByField: orderByField };
    } else {
      constraints.push(orderBy(documentId(), direction));
      return { constraints, effectiveOrderByField: null }; // using documentId()
    }
  }, [JSON.stringify(filters), orderByField, direction]);

  const runPage = useCallback(
    async (pageIndex: number) => {
      setLoading(true);
      setError(null);
      try {
        const coll = collection(db, collectionPath);
        const { constraints } = buildConstraints();

        const take = limit(pageSize + 1); // +1 to detect next page
        const after = cursorsRef.current[pageIndex - 1]; // null on first page

        const q = after
          ? query(coll, ...constraints, startAfter(after), take)
          : query(coll, ...constraints, take);

        const snap = await getDocs(q);
        const docs = snap.docs;
        const moreThanPage = docs.length > pageSize;
        const pageDocs = moreThanPage ? docs.slice(0, pageSize) : docs;

        setData(pageDocs.map((d) => ({ id: d.id, ...(d.data() as T) })) as T[]);
        setHasNext(moreThanPage);

        cursorsRef.current[pageIndex] =
          pageDocs.length ? pageDocs[pageDocs.length - 1] : null;

        setPage(pageIndex);
      } catch (e: any) {
        setError(e?.message ?? "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    },
    [db, collectionPath, pageSize, buildConstraints]
  );

  const fetchCount = useCallback(async () => {
    if (!withTotalCount) {
      setTotalCount(undefined);
      return;
    }
    try {
      const coll = collection(db, collectionPath);
      const { constraints } = buildConstraints();
      const countSnap = await getCountFromServer(query(coll, ...constraints));
      setTotalCount(countSnap.data().count);
    } catch {
      setTotalCount(undefined);
    }
  }, [db, collectionPath, buildConstraints, withTotalCount]);

  // Reset & load when deps change
  useEffect(() => {
    cursorsRef.current = [null];
    setPage(1);
    setData([]);
    setHasNext(false);
    setError(null);
    runPage(1);
    fetchCount();
  }, [runPage, fetchCount]);

  const nextPage = useCallback(async () => {
    if (loading || !hasNext) return;
    await runPage(page + 1);
  }, [loading, hasNext, page, runPage]);

  const prevPage = useCallback(async () => {
    if (loading || page <= 1) return;
    await runPage(page - 1);
  }, [loading, page, runPage]);

  const goToPage = useCallback(
    async (target: number) => {
      if (target < 1) return;
      // Step forward to build cursors on demand
      while (cursorsRef.current.length <= target - 1) {
        const k = cursorsRef.current.length; // next page to build
        // eslint-disable-next-line no-await-in-loop
        await runPage(k);
      }
      await runPage(target);
    },
    [runPage]
  );

  const reset = useCallback(() => {
    cursorsRef.current = [null];
    setPage(1);
    setData([]);
    setHasNext(false);
    setError(null);
    runPage(1);
    fetchCount();
  }, [runPage, fetchCount]);

  const totalPages =
    totalCount !== undefined ? Math.max(1, Math.ceil(totalCount / pageSize)) : undefined;

  return {
    data,
    loading,
    error,
    page,
    hasPrev: page > 1,
    hasNext,
    totalCount,
    totalPages,
    nextPage,
    prevPage,
    goToPage,
    reset,
  };
}