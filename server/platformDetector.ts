// Platform Detection & Retry Recommendations
// Categorizes video URLs by platform and determines if they're worth retrying

export type PlatformType = 
  | 'youtube'
  | 'vimeo'
  | 'okru'
  | 'dailymotion'
  | 'vk'
  | 'tokyvideo'
  | 'direct-mp4'
  | 'unknown';

export interface PlatformInfo {
  platform: PlatformType;
  retryable: boolean;
  reason: string;
  recommendation: string;
}

/**
 * Detect platform from URL
 */
export function detectPlatform(url: string): PlatformType {
  if (!url) return 'unknown';
  
  const lowerUrl = url.toLowerCase();
  
  // Check domain-based platforms first (including CDN/direct download hosts)
  
  // YouTube and its CDN domains (including regional/redirect hosts)
  if (lowerUrl.includes('youtube.com') || 
      lowerUrl.includes('youtu.be') ||
      lowerUrl.includes('googlevideo.com') ||  // Matches *.googlevideo.com
      lowerUrl.includes('ytimg.com')) {
    return 'youtube';
  }
  
  // Vimeo and its CDN domains
  if (lowerUrl.includes('vimeo.com') || 
      lowerUrl.includes('vimeocdn.com')) {
    return 'vimeo';
  }
  
  // Ok.ru (Odnoklassniki)
  if (lowerUrl.includes('ok.ru') || 
      lowerUrl.includes('odnoklassniki')) {
    return 'okru';
  }
  
  // Dailymotion
  if (lowerUrl.includes('dailymotion.com') || lowerUrl.includes('dai.ly')) {
    return 'dailymotion';
  }
  
  // VK (VKontakte) - multiple domains
  if (lowerUrl.includes('vk.com') || 
      lowerUrl.includes('vkvideo.ru') ||
      lowerUrl.includes('vk.ru')) {
    return 'vk';
  }
  
  // TokyVideo
  if (lowerUrl.includes('tokyvideo.com')) {
    return 'tokyvideo';
  }
  
  // Check for direct video URLs (handle query strings by looking at path)
  // Remove query string and check file extension
  const urlWithoutQuery = lowerUrl.split('?')[0];
  if (urlWithoutQuery.endsWith('.mp4') || 
      urlWithoutQuery.endsWith('.m3u8') || 
      urlWithoutQuery.endsWith('.mpd') ||
      urlWithoutQuery.endsWith('.webm') ||
      urlWithoutQuery.endsWith('.mov')) {
    return 'direct-mp4';
  }
  
  return 'unknown';
}

/**
 * Get platform information and retry recommendation
 */
export function getPlatformInfo(url: string): PlatformInfo {
  const platform = detectPlatform(url);
  
  switch (platform) {
    case 'youtube':
      return {
        platform: 'youtube',
        retryable: true,
        reason: 'YouTube downloads supported with cookie authentication',
        recommendation: 'Ensure YouTube cookies are uploaded in Admin Settings'
      };
      
    case 'vimeo':
      return {
        platform: 'vimeo',
        retryable: false,
        reason: 'Vimeo blocks automated downloads or video is private/deleted',
        recommendation: 'Use Vimeo embed instead - it\'s free and reliable'
      };
      
    case 'okru':
      return {
        platform: 'okru',
        retryable: true,
        reason: 'Ok.ru extraction improved with 7 new patterns',
        recommendation: 'Retry download - enhanced extractor should work now'
      };
      
    case 'dailymotion':
      return {
        platform: 'dailymotion',
        retryable: true,
        reason: 'Dailymotion usually allows downloads',
        recommendation: 'Retry download - should work with yt-dlp'
      };
      
    case 'vk':
      return {
        platform: 'vk',
        retryable: true,
        reason: 'VK has dedicated extractor with embed/page fallback',
        recommendation: 'Retry download - VK extractor handles most videos'
      };
      
    case 'tokyvideo':
      return {
        platform: 'tokyvideo',
        retryable: true,
        reason: 'TokyVideo has dedicated extractor with JWPlayer support',
        recommendation: 'Retry download - TokyVideo extractor should work'
      };
      
    case 'direct-mp4':
      return {
        platform: 'direct-mp4',
        retryable: true,
        reason: 'Direct MP4/M3U8 URLs usually work',
        recommendation: 'Retry download - direct URLs are reliable'
      };
      
    default:
      return {
        platform: 'unknown',
        retryable: true,
        reason: 'Unknown platform - worth trying',
        recommendation: 'Retry download or contact support'
      };
  }
}

/**
 * Check if a job failure is worth retrying based on error message and platform
 */
export function shouldRetryBasedOnError(error: string | null, url: string): {
  shouldRetry: boolean;
  reason: string;
} {
  if (!error) {
    return { shouldRetry: true, reason: 'No error message' };
  }
  
  const lowerError = error.toLowerCase();
  const platformInfo = getPlatformInfo(url);
  const platform = platformInfo.platform;
  
  // Fatal errors that apply to ALL platforms - DON'T retry
  const fatalErrors = [
    'file size exceeds',
    'too large',
    'size mismatch',
    'cannot resume download',
    'drm protected',
    'checksum mismatch',
    'disk quota exceeded',
    'permission denied'
  ];
  
  for (const fatalPattern of fatalErrors) {
    if (lowerError.includes(fatalPattern)) {
      return {
        shouldRetry: false,
        reason: `Fatal error: ${fatalPattern} - cannot be fixed by retrying`
      };
    }
  }
  
  // Platform-specific error handling (check platform BEFORE error patterns)
  
  // YouTube 403 errors - retry with cookies
  if (platform === 'youtube' && lowerError.includes('403') && lowerError.includes('forbidden')) {
    return {
      shouldRetry: true,
      reason: 'YouTube 403 error - retry with fresh cookies'
    };
  }
  
  // Vimeo 404 errors - DON'T retry
  if (platform === 'vimeo' && lowerError.includes('404')) {
    return {
      shouldRetry: false,
      reason: 'Video deleted or private - use embed if available'
    };
  }
  
  // Ok.ru extraction errors - RETRY with enhanced extractor
  // Ok.ru may return various errors (403, 429, extraction failures) that are often transient
  // or can be resolved with our enhanced 7-pattern extractor
  // Note: Fatal errors (file size, DRM, etc.) are already blocked above
  if (platform === 'okru') {
    return {
      shouldRetry: true,
      reason: 'Enhanced Ok.ru extractor with 7 patterns should fix this'
    };
  }
  
  // Dailymotion - usually retryable
  if (platform === 'dailymotion') {
    return {
      shouldRetry: true,
      reason: 'Dailymotion usually allows downloads - retry recommended'
    };
  }
  
  // VK - has dedicated extractor, retry is worthwhile
  if (platform === 'vk') {
    return {
      shouldRetry: true,
      reason: 'VK extractor with embed/page fallback should handle this'
    };
  }
  
  // TokyVideo - has dedicated extractor
  if (platform === 'tokyvideo') {
    return {
      shouldRetry: true,
      reason: 'TokyVideo extractor with JWPlayer support should work'
    };
  }
  
  // Network errors - RETRY for any platform
  if (lowerError.includes('timeout') || lowerError.includes('connection')) {
    return {
      shouldRetry: true,
      reason: 'Temporary network issue - retry may succeed'
    };
  }
  
  // Default: use platform's retry recommendation
  return {
    shouldRetry: platformInfo.retryable,
    reason: platformInfo.recommendation
  };
}
