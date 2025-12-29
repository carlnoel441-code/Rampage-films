/**
 * Smart Rate Limiter for API calls
 * Tracks rate limit hits and automatically adjusts delays to prevent failures
 */

interface ServiceState {
  lastRateLimitHit: number;
  consecutiveFailures: number;
  baseDelay: number;
  isInCooldown: boolean;
  cooldownUntil: number;
}

const serviceStates: Record<string, ServiceState> = {};

const DEFAULT_STATE: ServiceState = {
  lastRateLimitHit: 0,
  consecutiveFailures: 0,
  baseDelay: 1000,
  isInCooldown: false,
  cooldownUntil: 0,
};

export type ServiceName = 'groq' | 'huggingface' | 'edge-tts' | 'google-translate';

function getState(service: ServiceName): ServiceState {
  if (!serviceStates[service]) {
    serviceStates[service] = { ...DEFAULT_STATE };
  }
  return serviceStates[service];
}

/**
 * Get current recommended delay before making a request
 */
export function getRecommendedDelay(service: ServiceName): number {
  const state = getState(service);
  const now = Date.now();
  
  if (state.isInCooldown && now < state.cooldownUntil) {
    return state.cooldownUntil - now;
  }
  
  if (state.consecutiveFailures === 0) {
    return state.baseDelay;
  }
  
  // Cap exponential backoff at 30 seconds (reduced from 120s) to prevent stuck jobs
  const exponentialDelay = state.baseDelay * Math.pow(2, Math.min(state.consecutiveFailures, 4));
  return Math.min(exponentialDelay, 30000);
}

/**
 * Wait for the recommended delay before making a request
 */
export async function waitBeforeRequest(service: ServiceName): Promise<void> {
  const delay = getRecommendedDelay(service);
  if (delay > 0) {
    console.log(`[RateLimiter] ${service}: waiting ${(delay / 1000).toFixed(1)}s before request`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * Report a successful request - reduces delays
 */
export function reportSuccess(service: ServiceName): void {
  const state = getState(service);
  state.consecutiveFailures = Math.max(0, state.consecutiveFailures - 1);
  state.isInCooldown = false;
  
  if (state.consecutiveFailures === 0) {
    state.baseDelay = getDefaultDelay(service);
  }
}

/**
 * Report a rate limit hit - increases delays
 */
export function reportRateLimit(service: ServiceName, retryAfterSeconds?: number): void {
  const state = getState(service);
  const now = Date.now();
  
  state.lastRateLimitHit = now;
  state.consecutiveFailures++;
  
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    state.isInCooldown = true;
    state.cooldownUntil = now + (retryAfterSeconds * 1000);
    console.log(`[RateLimiter] ${service}: entering cooldown for ${retryAfterSeconds}s`);
  } else {
    state.baseDelay = Math.min(state.baseDelay * 2, 60000);
    console.log(`[RateLimiter] ${service}: increasing base delay to ${state.baseDelay}ms`);
  }
}

/**
 * Report a general failure (not rate limit)
 */
export function reportFailure(service: ServiceName): void {
  const state = getState(service);
  state.consecutiveFailures++;
}

/**
 * Check if a service is currently in cooldown
 */
export function isInCooldown(service: ServiceName): boolean {
  const state = getState(service);
  const now = Date.now();
  
  if (state.isInCooldown && now >= state.cooldownUntil) {
    state.isInCooldown = false;
  }
  
  return state.isInCooldown;
}

/**
 * Get cooldown remaining time in seconds
 */
export function getCooldownRemaining(service: ServiceName): number {
  const state = getState(service);
  const now = Date.now();
  
  if (!state.isInCooldown || now >= state.cooldownUntil) {
    return 0;
  }
  
  return Math.ceil((state.cooldownUntil - now) / 1000);
}

/**
 * Reset a service's rate limit state
 */
export function resetService(service: ServiceName): void {
  serviceStates[service] = { ...DEFAULT_STATE, baseDelay: getDefaultDelay(service) };
}

/**
 * Get default delay for a service based on its known rate limits
 */
function getDefaultDelay(service: ServiceName): number {
  switch (service) {
    case 'groq':
      return 200; // Reduced from 500ms - Groq handles rapid requests well
    case 'huggingface':
      return 2000;
    case 'edge-tts':
      return 500; // Reduced from 1500ms - faster processing, still safe for rate limits
    case 'google-translate':
      return 50; // Reduced from 100ms
    default:
      return 500;
  }
}

/**
 * Get current status of all services
 */
export function getServiceStatus(): Record<ServiceName, { 
  delay: number; 
  failures: number; 
  inCooldown: boolean;
  cooldownSeconds: number;
}> {
  const services: ServiceName[] = ['groq', 'huggingface', 'edge-tts', 'google-translate'];
  
  return services.reduce((acc, service) => {
    acc[service] = {
      delay: getRecommendedDelay(service),
      failures: getState(service).consecutiveFailures,
      inCooldown: isInCooldown(service),
      cooldownSeconds: getCooldownRemaining(service),
    };
    return acc;
  }, {} as Record<ServiceName, any>);
}
