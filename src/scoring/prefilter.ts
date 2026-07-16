import type { Job } from '../ats/types.js';
import { matchesAny } from './match.js';

/**
 * Cheap "could this possibly be a React role?" gate. Since React/React Native is a hard
 * requirement, a job with NO frontend signal at all is certainly not a fit — drop it for free
 * instead of spending an LLM call to reach the same conclusion. Deliberately permissive (keeps
 * anything frontend-ish) so real React roles still reach the LLM for the nuanced judgment.
 */
const FRONTEND_SIGNAL = [
  'react',
  'react native',
  'reactnative',
  'frontend',
  'front-end',
  'front end',
  'typescript',
  'javascript',
  'vue',
  'angular',
  'svelte',
  'next.js',
  'nextjs',
  'client-side',
  'client side',
  'full stack',
  'full-stack',
  'fullstack',
  'ui engineer',
  'ui developer',
  'ux engineer',
  'web developer',
  'web engineer',
  'mobile developer',
  'mobile engineer',
];

export function hasFrontendSignal(job: Job): boolean {
  const text = `${job.title} ${job.description ?? ''}`;
  return matchesAny(text, FRONTEND_SIGNAL);
}
