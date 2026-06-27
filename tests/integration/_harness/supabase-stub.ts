type TableName = "user_settings" | "ai_models" | "analyses" | "watched_companies";

interface Query {
  op: "select" | "insert" | "update";
  cols?: string;
  filters: Record<string, unknown>;
  insertRow?: unknown;
  updateRow?: unknown;
}

interface QueryResult {
  data: unknown;
  error: unknown;
}

export type TableHandler = (query: Query) => QueryResult;

export interface SupabaseStub {
  from(table: TableName): {
    select(cols: string): {
      eq(col: string, value: unknown): ReturnType<SupabaseStub["from"]>;
      single(): Promise<QueryResult>;
      maybeSingle(): Promise<QueryResult>;
    };
    eq(col: string, value: unknown): ReturnType<SupabaseStub["from"]>;
    insert(row: unknown): {
      select(cols: string): {
        single(): Promise<QueryResult>;
      };
    };
    update(row: unknown): ReturnType<SupabaseStub["from"]>;
    single(): Promise<QueryResult>;
    maybeSingle(): Promise<QueryResult>;
  };
  insertCalls: { table: string; row: unknown }[];
  updateCalls: { table: string; row: unknown; filters: Record<string, unknown> }[];
}

type HandlerMap = Partial<Record<TableName, TableHandler>>;

function createMissingHandler(table: TableName): TableHandler {
  return () => ({
    data: null,
    error: new Error(`missing_handler:${table}`),
  });
}

export function createSupabaseStub(responses: HandlerMap): SupabaseStub {
  const insertCalls: { table: string; row: unknown }[] = [];
  const updateCalls: { table: string; row: unknown; filters: Record<string, unknown> }[] = [];

  const from = (table: TableName) => {
    const handler = responses[table] ?? createMissingHandler(table);
    let cols: string | undefined;
    const filters: Record<string, unknown> = {};
    let insertRow: unknown;
    let updateRow: unknown;
    let op: Query["op"] = "select";

    const run = () => handler({ op, cols, filters: { ...filters }, insertRow, updateRow });

    const chain = {
      select(nextCols: string) {
        cols = nextCols;
        return chain;
      },
      eq(col: string, value: unknown) {
        filters[col] = value;
        return chain;
      },
      insert(row: unknown) {
        op = "insert";
        insertRow = row;
        insertCalls.push({ table, row });
        return {
          select(nextCols: string) {
            cols = nextCols;
            return {
              single() {
                return Promise.resolve(run());
              },
            };
          },
        };
      },
      update(row: unknown) {
        op = "update";
        updateRow = row;
        return chain;
      },
      single() {
        if (op === "update") updateCalls.push({ table, row: updateRow, filters: { ...filters } });
        return Promise.resolve(run());
      },
      maybeSingle() {
        if (op === "update") updateCalls.push({ table, row: updateRow, filters: { ...filters } });
        return Promise.resolve(run());
      },
    };

    return chain;
  };

  return { from, insertCalls, updateCalls };
}

export function createNullSupabaseStub(): null {
  return null;
}
