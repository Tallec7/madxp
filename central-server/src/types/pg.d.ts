declare module 'pg' {
  export interface PoolConfig {
    connectionString?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean };
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  }

  export type QueryResultRow = Record<string, unknown>;

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    rows: R[];
    rowCount: number;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<R extends QueryResultRow = QueryResultRow>(text: string, params?: any[]): Promise<QueryResult<R>>;
    connect(): Promise<any>;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'connect', listener: () => void): this;
    end(): Promise<void>;
  }
}
