/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Minimal PostgREST client — fluent API compatible with @supabase/supabase-js.
 *
 * Based on supabase/postgrest-js patterns:
 * - select() strips ALL whitespace (PostgREST ignores spaces in select)
 * - URL built via string concat — no URLSearchParams (avoids encoding issues)
 * - .select() after mutation does NOT override HTTP method
 * - Prefer: return=representation set by mutations, not by select()
 *
 * Supports: select, insert, update, delete, upsert, rpc,
 *           eq, neq, gt, gte, lt, lte, in, is, not, or, ilike, like,
 *           order, limit, range, single, maybeSingle, abortSignal.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type FlexData = Record<string, any>[] & Record<string, any>;

export interface PostgrestResponse<T = FlexData> {
  data: T | null;
  error: PostgrestError | null;
  count: number | null;
  status: number;
  statusText: string;
}

export interface PostgrestError {
  message: string;
  details: string;
  hint: string;
  code: string;
}

export interface PostgrestClientOptions {
  auth?: { persistSession?: boolean };
  global?: { fetch?: typeof fetch };
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'HEAD';
type ReturnMode = 'many' | 'single' | 'maybeSingle';
type HeaderRecord = Record<string, string>;

/* ------------------------------------------------------------------ */
/*  Clean select columns — strip whitespace like supabase/postgrest-js */
/* ------------------------------------------------------------------ */

/** Remove all whitespace outside quoted identifiers. */
function cleanColumns(columns: string): string {
  let quoted = false;
  let result = '';
  for (const ch of columns) {
    if (/\s/.test(ch) && !quoted) continue;
    if (ch === '"') quoted = !quoted;
    result += ch;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Query Builder                                                      */
/* ------------------------------------------------------------------ */

export class PostgrestQueryBuilder<T = FlexData> {
  protected _url: string;
  protected _headers: HeaderRecord;
  protected _method: Method = 'GET';
  protected _body: unknown = undefined;
  protected _returnMode: ReturnMode = 'many';
  protected _signal?: AbortSignal;
  protected _countHeader: string | null = null;
  protected _fetch: typeof fetch;

  /**
   * Raw query params as [key, value] pairs.
   * We avoid URLSearchParams to prevent unwanted percent-encoding
   * of parentheses, commas, and dots that PostgREST uses in its syntax.
   */
  private _rawParams: [string, string][] = [];

  constructor(url: string, headers: HeaderRecord, customFetch?: typeof fetch) {
    this._url = url;
    this._headers = { ...headers };
    this._fetch = customFetch ?? globalThis.fetch.bind(globalThis);
  }

  /* --- CRUD verbs ------------------------------------------------- */

  select(columns = '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): this {
    // Only set GET/HEAD when select() is the first verb.
    // If chained after a mutation (insert/update/delete), keep the mutation method.
    if (this._method === 'GET') {
      this._method = opts?.head ? 'HEAD' : 'GET';
    }
    this._setParam('select', cleanColumns(columns));
    if (opts?.count) this._countHeader = opts.count;
    return this;
  }

  insert(rows: unknown, opts?: { onConflict?: string; count?: 'exact' }): this {
    this._method = 'POST';
    this._body = rows;
    this._headers['Prefer'] = 'return=representation';
    if (opts?.onConflict) {
      this._headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
      this._setParam('on_conflict', opts.onConflict);
    }
    if (opts?.count) this._countHeader = opts.count;
    return this;
  }

  upsert(rows: unknown, opts?: { onConflict?: string; count?: 'exact'; ignoreDuplicates?: boolean }): this {
    this._method = 'POST';
    this._body = rows;
    const resolution = opts?.ignoreDuplicates ? 'ignore-duplicates' : 'merge-duplicates';
    this._headers['Prefer'] = `return=representation,resolution=${resolution}`;
    if (opts?.onConflict) this._setParam('on_conflict', opts.onConflict);
    if (opts?.count) this._countHeader = opts.count;
    return this;
  }

  update(values: unknown, opts?: { count?: 'exact' }): this {
    this._method = 'PATCH';
    this._body = values;
    this._headers['Prefer'] = 'return=representation';
    if (opts?.count) this._countHeader = opts.count;
    return this;
  }

  delete(opts?: { count?: 'exact' }): this {
    this._method = 'DELETE';
    this._headers['Prefer'] = 'return=representation';
    if (opts?.count) this._countHeader = opts.count;
    return this;
  }

  /* --- Filters ---------------------------------------------------- */

  eq(column: string, value: unknown): this { return this._addParam(column, `eq.${value}`); }
  neq(column: string, value: unknown): this { return this._addParam(column, `neq.${value}`); }
  gt(column: string, value: unknown): this { return this._addParam(column, `gt.${value}`); }
  gte(column: string, value: unknown): this { return this._addParam(column, `gte.${value}`); }
  lt(column: string, value: unknown): this { return this._addParam(column, `lt.${value}`); }
  lte(column: string, value: unknown): this { return this._addParam(column, `lte.${value}`); }
  like(column: string, pattern: string): this { return this._addParam(column, `like.${pattern}`); }
  ilike(column: string, pattern: string): this { return this._addParam(column, `ilike.${pattern}`); }
  is(column: string, value: null | boolean): this { return this._addParam(column, `is.${value}`); }

  in(column: string, values: unknown[]): this {
    const formatted = `(${values.map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(',')})`;
    return this._addParam(column, `in.${formatted}`);
  }

  not(column: string, operator: string, value: unknown): this {
    const formatted = operator === 'in' && typeof value === 'string'
      ? value : String(value);
    return this._addParam(column, `not.${operator}.${formatted}`);
  }

  or(filters: string, opts?: { foreignTable?: string }): this {
    const key = opts?.foreignTable ? `${opts.foreignTable}.or` : 'or';
    return this._addParam(key, `(${filters})`);
  }

  filter(column: string, operator: string, value: unknown): this {
    return this._addParam(column, `${operator}.${value}`);
  }

  /* --- Modifiers -------------------------------------------------- */

  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string }): this {
    const dir = opts?.ascending === false ? 'desc' : 'asc';
    const nulls = opts?.nullsFirst != null ? (opts.nullsFirst ? '.nullsfirst' : '.nullslast') : '';
    const key = opts?.foreignTable ? `${opts.foreignTable}.order` : 'order';
    const val = `${column}.${dir}${nulls}`;
    // Append to existing order (multiple order columns)
    const idx = this._rawParams.findIndex(([k]) => k === key);
    if (idx >= 0) {
      this._rawParams[idx][1] += `,${val}`;
    } else {
      this._rawParams.push([key, val]);
    }
    return this;
  }

  limit(count: number, opts?: { foreignTable?: string }): this {
    const key = opts?.foreignTable ? `${opts.foreignTable}.limit` : 'limit';
    return this._setParam(key, String(count)) as this;
  }

  range(from: number, to: number, opts?: { foreignTable?: string }): this {
    const key = opts?.foreignTable ? `${opts.foreignTable}.offset` : 'offset';
    this._setParam(key, String(from));
    this.limit(to - from + 1, opts);
    this._headers['Range'] = `${from}-${to}`;
    this._headers['Range-Unit'] = 'items';
    return this;
  }

  single(): this {
    this._returnMode = 'single';
    this._headers['Accept'] = 'application/vnd.pgrst.object+json';
    return this;
  }

  maybeSingle(): this {
    this._returnMode = 'maybeSingle';
    this._headers['Accept'] = 'application/vnd.pgrst.object+json';
    return this;
  }

  /** Type-only cast — compat with supabase-js .returns<T>() */
  returns<U = any>(): PostgrestQueryBuilder<U> {
    return this as unknown as PostgrestQueryBuilder<U>;
  }

  abortSignal(signal: AbortSignal): this {
    this._signal = signal;
    return this;
  }

  /* --- Execute ---------------------------------------------------- */

  then(
    onfulfilled?: ((value: PostgrestResponse<T>) => any) | null,
    onrejected?: ((reason: any) => any) | null,
  ): Promise<any> {
    return this._execute().then(onfulfilled, onrejected);
  }

  private async _execute(): Promise<PostgrestResponse<T>> {
    // Build URL with raw query string (no URLSearchParams encoding)
    const qs = this._rawParams
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const url = qs ? `${this._url}?${qs}` : this._url;

    // Build headers
    const headers: HeaderRecord = {
      'Content-Type': 'application/json',
      ...this._headers,
    };
    if (this._countHeader) {
      const prefer = headers['Prefer'];
      headers['Prefer'] = prefer ? `${prefer},count=${this._countHeader}` : `count=${this._countHeader}`;
    }

    // Execute
    const init: RequestInit = {
      method: this._method,
      headers,
      signal: this._signal,
    };
    if (this._body !== undefined) {
      init.body = JSON.stringify(this._body);
    }

    let res: Response;
    try {
      res = await this._fetch(url, init);
    } catch (err: unknown) {
      return {
        data: null,
        error: { message: String(err), details: '', hint: '', code: 'FETCH_ERROR' },
        count: null,
        status: 0,
        statusText: 'Fetch Error',
      };
    }

    // Parse count from Content-Range header
    let count: number | null = null;
    const contentRange = res.headers.get('content-range');
    if (contentRange) {
      const match = contentRange.match(/\/(\d+|\*)/);
      if (match && match[1] !== '*') count = parseInt(match[1], 10);
    }

    // Handle empty responses (204 No Content, or empty body)
    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return { data: null, error: null, count, status: res.status, statusText: res.statusText };
    }

    // Parse body
    let body: unknown;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    // Error response
    if (!res.ok) {
      if (this._returnMode === 'maybeSingle' && res.status === 406) {
        return { data: null, error: null, count, status: 200, statusText: 'OK' };
      }
      const pgError = body as Record<string, string> | null;
      return {
        data: null,
        error: {
          message: pgError?.message ?? res.statusText,
          details: pgError?.details ?? '',
          hint: pgError?.hint ?? '',
          code: pgError?.code ?? String(res.status),
        },
        count,
        status: res.status,
        statusText: res.statusText,
      };
    }

    return { data: body as T, error: null, count, status: res.status, statusText: res.statusText };
  }

  /* --- Internal helpers ------------------------------------------- */

  /** Set param (replace if exists). */
  private _setParam(key: string, value: string): this {
    const idx = this._rawParams.findIndex(([k]) => k === key);
    if (idx >= 0) this._rawParams[idx] = [key, value];
    else this._rawParams.push([key, value]);
    return this;
  }

  /** Add param (append — PostgREST supports repeated keys for AND filters). */
  private _addParam(key: string, value: string): this {
    this._rawParams.push([key, value]);
    return this;
  }
}

/* ------------------------------------------------------------------ */
/*  RPC Builder                                                        */
/* ------------------------------------------------------------------ */

class PostgrestRpcBuilder<T = FlexData> extends PostgrestQueryBuilder<T> {
  constructor(url: string, headers: HeaderRecord, params: Record<string, unknown>, customFetch?: typeof fetch) {
    super(url, headers, customFetch);
    this._method = 'POST';
    this._body = params;
    this._headers = { ...headers, 'Content-Type': 'application/json' };
  }
}

/* ------------------------------------------------------------------ */
/*  Client                                                             */
/* ------------------------------------------------------------------ */

export class PostgrestClient {
  private _url: string;
  private _headers: HeaderRecord;
  private _customFetch?: typeof fetch;
  public rest: { headers: HeaderRecord };
  public headers: HeaderRecord;

  constructor(url: string, apiKey: string, options?: PostgrestClientOptions) {
    const base = url.replace(/\/$/, '');
    const isDirect = base.endsWith('/rest/v1') || process.env.POSTGREST_DIRECT === '1';
    this._url = isDirect ? base.replace(/\/rest\/v1$/, '') : `${base}/rest/v1`;
    this._headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    this._customFetch = options?.global?.fetch;
    this.rest = { headers: { ...this._headers } };
    this.headers = { ...this._headers };
  }

  from<T = FlexData>(table: string): PostgrestQueryBuilder<T> {
    return new PostgrestQueryBuilder<T>(
      `${this._url}/${table}`,
      this._currentHeaders(),
      this._customFetch,
    );
  }

  rpc<T = FlexData>(fn: string, params: Record<string, unknown> = {}): PostgrestRpcBuilder<T> {
    return new PostgrestRpcBuilder<T>(
      `${this._url}/rpc/${fn}`,
      this._currentHeaders(),
      params,
      this._customFetch,
    );
  }

  /** Compat stubs for supabase-js features (unused but referenced) */
  realtime = { setAuth: (_token?: string) => Promise.resolve() };
  functions = { setAuth: (_token: string) => { /* noop */ } };
  auth = { getUser: () => Promise.resolve({ data: { user: null }, error: null }) };

  private _currentHeaders(): HeaderRecord {
    return { ...this.rest.headers };
  }
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createPostgrestClient(
  url: string, apiKey: string, options?: PostgrestClientOptions,
): PostgrestClient {
  return new PostgrestClient(url, apiKey, options);
}

/* ------------------------------------------------------------------ */
/*  Backward-compat aliases                                            */
/* ------------------------------------------------------------------ */

export type SupabaseClient = PostgrestClient;
export const createClient = createPostgrestClient;
