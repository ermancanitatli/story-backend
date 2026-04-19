import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

/**
 * Initialize Sentry if SENTRY_DSN env is present.
 * Must be called at the very top of bootstrap, BEFORE NestFactory.create,
 * so that Sentry's auto-instrumentation can hook into HTTP/Express and outgoing requests.
 *
 * No-op when SENTRY_DSN is unset — keeps local/dev boots clean.
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('ℹ️ Sentry disabled (no SENTRY_DSN)');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION || undefined,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.0'),
    integrations: [nodeProfilingIntegration()],
  });
  console.log(`✅ Sentry initialized (env=${process.env.APP_ENV || 'development'})`);
}
