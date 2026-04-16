/**
 * MongoDB URI builder — Muzayede referansından uyarlanmış.
 * Replica set, TLS, authSource desteği.
 */

type Env = 'prod' | 'dev';

export interface BuildMongoUriOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  tls?: boolean;
  replicaSet?: string;
  directConnection?: boolean;
  authSource?: string;
  retryWrites?: boolean;
  maxIdleTimeMS?: number;
  appName?: string;
}

export function resolveEnv(env?: string | null): Env {
  const normalized = (env || '').toLowerCase();
  if (normalized === 'production' || normalized === 'prod') return 'prod';
  return 'dev';
}

export function resolveDbName(
  env: string | undefined | null,
  dbNames: { prod: string; dev: string },
): string {
  const mode = resolveEnv(env);
  return mode === 'prod' ? dbNames.prod : dbNames.dev;
}

export function buildMongoUri(opts: BuildMongoUriOptions): string {
  const user = encodeURIComponent(opts.username);
  const pass = encodeURIComponent(opts.password);
  const { host, port } = opts;

  const queryParts: string[] = [];

  if (opts.tls) {
    queryParts.push('tls=true', 'ssl=true');
  }
  if (opts.replicaSet) {
    queryParts.push(`replicaSet=${encodeURIComponent(opts.replicaSet)}`);
  }
  if (typeof opts.directConnection === 'boolean') {
    queryParts.push(`directConnection=${opts.directConnection}`);
  }
  if (opts.authSource) {
    queryParts.push(`authSource=${encodeURIComponent(opts.authSource)}`);
  }
  if (typeof opts.retryWrites === 'boolean') {
    queryParts.push(`retryWrites=${opts.retryWrites}`);
  }
  if (typeof opts.maxIdleTimeMS === 'number') {
    queryParts.push(`maxIdleTimeMS=${opts.maxIdleTimeMS}`);
  }
  if (opts.appName) {
    queryParts.push(`appName=${encodeURIComponent(opts.appName)}`);
  }

  const query = queryParts.join('&');
  return query
    ? `mongodb://${user}:${pass}@${host}:${port}/?${query}`
    : `mongodb://${user}:${pass}@${host}:${port}/`;
}
