// Video URL validation utilities for different platforms

export interface VideoUrlValidation {
  isValid: boolean;
  platform: 'youtube' | 'vimeo' | 'okru' | 'dailymotion' | 'tokyvideo' | 'flixhq' | 'direct' | 'unknown';
  message?: string;
  extractedId?: string;
}

/**
 * Validates FlixHQ video URLs
 * FlixHQ uses rotating domains, so we check broadly for "flixhq" in hostname
 */
export function validateFlixHQUrl(url: string): VideoUrlValidation {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // FlixHQ uses many rotating domains - check broadly
    const isFlixHQ = hostname.includes('flixhq');
    
    if (!isFlixHQ) {
      return {
        isValid: false,
        platform: 'unknown',
        message: 'URL does not appear to be from FlixHQ (hostname should contain "flixhq")'
      };
    }

    // FlixHQ URLs typically have content paths, but be lenient
    const hasContentPath = urlObj.pathname.length > 1; // Not just "/"
    
    if (!hasContentPath) {
      return {
        isValid: true,
        platform: 'flixhq',
        message: 'FlixHQ domain detected. Note: URL appears to be homepage, not a specific video page'
      };
    }

    return {
      isValid: true,
      platform: 'flixhq',
      message: 'Valid FlixHQ URL format'
    };
  } catch (error) {
    return {
      isValid: false,
      platform: 'unknown',
      message: 'Invalid URL format'
    };
  }
}

/**
 * Validates Ok.ru (Odnoklassniki) video URLs
 * Accepts various formats: /video/..., /videoembed/..., and query-based URLs
 */
export function validateOkRuUrl(url: string): VideoUrlValidation {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Ok.ru domains (including mobile)
    const isOkRu = hostname.includes('ok.ru') || hostname.includes('odnoklassniki');
    
    if (!isOkRu) {
      return {
        isValid: false,
        platform: 'unknown',
        message: 'URL does not appear to be from Ok.ru or Odnoklassniki'
      };
    }

    // Check for video-related paths or parameters (be lenient)
    const hasVideoPath = urlObj.pathname.includes('/video') || 
                        urlObj.pathname.includes('/embed') ||
                        urlObj.searchParams.has('st.mvId');
    
    if (!hasVideoPath) {
      return {
        isValid: true,
        platform: 'okru',
        message: 'Ok.ru domain detected. Note: URL might not be a video page'
      };
    }

    // Try to extract video ID from various formats
    let extractedId: string | undefined;
    
    // Format 1: /video/12345 or /videoembed/12345
    const pathIdMatch = urlObj.pathname.match(/\/video(?:embed)?\/(\d+)/);
    if (pathIdMatch) {
      extractedId = pathIdMatch[1];
    }
    
    // Format 2: Query parameter st.mvId
    if (!extractedId && urlObj.searchParams.has('st.mvId')) {
      extractedId = urlObj.searchParams.get('st.mvId') || undefined;
    }

    return {
      isValid: true,
      platform: 'okru',
      message: 'Valid Ok.ru video URL format',
      extractedId
    };
  } catch (error) {
    return {
      isValid: false,
      platform: 'unknown',
      message: 'Invalid URL format'
    };
  }
}

/**
 * Validates YouTube URLs
 */
export function validateYouTubeUrl(url: string): VideoUrlValidation {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    const isYouTube = hostname === 'youtube.com' || 
                     hostname === 'www.youtube.com' || 
                     hostname === 'youtu.be' || 
                     hostname === 'm.youtube.com';
    
    if (!isYouTube) {
      return {
        isValid: false,
        platform: 'unknown',
        message: 'URL does not appear to be from YouTube'
      };
    }

    // Extract video ID
    let videoId: string | undefined;
    if (hostname === 'youtu.be') {
      videoId = urlObj.pathname.slice(1);
    } else {
      videoId = urlObj.searchParams.get('v') || undefined;
    }

    if (!videoId) {
      return {
        isValid: false,
        platform: 'youtube',
        message: 'YouTube URL must contain a video ID'
      };
    }

    return {
      isValid: true,
      platform: 'youtube',
      message: 'Valid YouTube URL format',
      extractedId: videoId
    };
  } catch (error) {
    return {
      isValid: false,
      platform: 'unknown',
      message: 'Invalid URL format'
    };
  }
}

/**
 * Validates Vimeo URLs
 */
export function validateVimeoUrl(url: string): VideoUrlValidation {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    const isVimeo = hostname === 'vimeo.com' || hostname === 'www.vimeo.com';
    
    if (!isVimeo) {
      return {
        isValid: false,
        platform: 'unknown',
        message: 'URL does not appear to be from Vimeo'
      };
    }

    const videoIdMatch = urlObj.pathname.match(/\/(\d+)/);
    const extractedId = videoIdMatch ? videoIdMatch[1] : undefined;

    if (!extractedId) {
      return {
        isValid: false,
        platform: 'vimeo',
        message: 'Vimeo URL must contain a video ID'
      };
    }

    return {
      isValid: true,
      platform: 'vimeo',
      message: 'Valid Vimeo URL format',
      extractedId
    };
  } catch (error) {
    return {
      isValid: false,
      platform: 'unknown',
      message: 'Invalid URL format'
    };
  }
}

/**
 * Validates Dailymotion URLs
 */
export function validateDailymotionUrl(url: string): VideoUrlValidation {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    const isDailymotion = hostname === 'dailymotion.com' || 
                         hostname === 'www.dailymotion.com' ||
                         hostname === 'dai.ly';
    
    if (!isDailymotion) {
      return {
        isValid: false,
        platform: 'unknown',
        message: 'URL does not appear to be from Dailymotion'
      };
    }

    // Extract video ID - Dailymotion uses format: /video/x8abc123 or dai.ly/x8abc123
    let videoId: string | undefined;
    if (hostname === 'dai.ly') {
      videoId = urlObj.pathname.slice(1); // Remove leading /
    } else {
      const videoIdMatch = urlObj.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
      videoId = videoIdMatch ? videoIdMatch[1] : undefined;
    }

    if (!videoId) {
      return {
        isValid: false,
        platform: 'dailymotion',
        message: 'Dailymotion URL must contain a video ID'
      };
    }

    return {
      isValid: true,
      platform: 'dailymotion',
      message: 'Valid Dailymotion URL format',
      extractedId: videoId
    };
  } catch (error) {
    return {
      isValid: false,
      platform: 'unknown',
      message: 'Invalid URL format'
    };
  }
}

/**
 * Validates Tokyvideo URLs
 * Tokyvideo uses locale-prefixed paths: /es/video/slug, /en/video/slug, etc.
 */
export function validateTokyvideoUrl(url: string): VideoUrlValidation {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    const isTokyvideo = hostname === 'tokyvideo.com' || 
                        hostname === 'www.tokyvideo.com';
    
    if (!isTokyvideo) {
      return {
        isValid: false,
        platform: 'unknown',
        message: 'URL does not appear to be from Tokyvideo'
      };
    }

    // Extract video ID with optional locale prefix - Tokyvideo uses format: /video/VIDEO_ID or /es/video/VIDEO_ID
    const videoIdMatch = urlObj.pathname.match(/\/(?:[a-z]{2}\/)?video\/([\w-]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : undefined;

    if (!videoId) {
      return {
        isValid: false,
        platform: 'tokyvideo',
        message: 'Tokyvideo URL must contain a video ID'
      };
    }

    return {
      isValid: true,
      platform: 'tokyvideo',
      message: 'Valid Tokyvideo URL format',
      extractedId: videoId
    };
  } catch (error) {
    return {
      isValid: false,
      platform: 'unknown',
      message: 'Invalid URL format'
    };
  }
}

/**
 * Validates direct MP4 URLs
 */
export function validateDirectVideoUrl(url: string): VideoUrlValidation {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.m3u8'];
    const isDirect = videoExtensions.some(ext => pathname.endsWith(ext));
    
    if (!isDirect) {
      return {
        isValid: false,
        platform: 'unknown',
        message: 'URL does not appear to be a direct video link (.mp4, .webm, .ogg, .m3u8)'
      };
    }

    return {
      isValid: true,
      platform: 'direct',
      message: 'Valid direct video URL format'
    };
  } catch (error) {
    return {
      isValid: false,
      platform: 'unknown',
      message: 'Invalid URL format'
    };
  }
}

/**
 * Main validation function that detects platform and validates accordingly
 */
export function validateVideoUrl(url: string): VideoUrlValidation {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return {
      isValid: false,
      platform: 'unknown',
      message: 'URL is required'
    };
  }

  const trimmedUrl = url.trim();

  // First, ensure it's a valid URL format
  try {
    const urlObj = new URL(trimmedUrl);
    
    // Ensure it's http or https
    if (!urlObj.protocol.startsWith('http')) {
      return {
        isValid: false,
        platform: 'unknown',
        message: 'URL must use HTTP or HTTPS protocol'
      };
    }
  } catch (error) {
    return {
      isValid: false,
      platform: 'unknown',
      message: 'Invalid URL format - please enter a complete URL (e.g., https://example.com/video)'
    };
  }

  // Try to detect platform from URL
  if (trimmedUrl.includes('youtube.com') || trimmedUrl.includes('youtu.be')) {
    return validateYouTubeUrl(trimmedUrl);
  }
  
  if (trimmedUrl.includes('vimeo.com')) {
    return validateVimeoUrl(trimmedUrl);
  }
  
  if (trimmedUrl.includes('dailymotion.com') || trimmedUrl.includes('dai.ly')) {
    return validateDailymotionUrl(trimmedUrl);
  }
  
  if (trimmedUrl.includes('tokyvideo.com')) {
    return validateTokyvideoUrl(trimmedUrl);
  }
  
  if (trimmedUrl.includes('ok.ru') || trimmedUrl.includes('odnoklassniki')) {
    return validateOkRuUrl(trimmedUrl);
  }
  
  if (trimmedUrl.includes('flixhq')) {
    return validateFlixHQUrl(trimmedUrl);
  }

  // Check if it's a direct video URL
  const directValidation = validateDirectVideoUrl(trimmedUrl);
  if (directValidation.isValid) {
    return directValidation;
  }

  // If none match but URL is valid, accept it (might be a platform we don't recognize)
  return {
    isValid: true,
    platform: 'unknown',
    message: 'URL format is valid but platform not recognized - will be saved as-is'
  };
}

/**
 * Get URL format examples for each platform
 */
export function getUrlExamples() {
  return {
    youtube: [
      'https://www.youtube.com/watch?v=VIDEO_ID',
      'https://youtu.be/VIDEO_ID'
    ],
    vimeo: [
      'https://vimeo.com/123456789'
    ],
    dailymotion: [
      'https://www.dailymotion.com/video/x8abc123',
      'https://dai.ly/x8abc123'
    ],
    tokyvideo: [
      'https://www.tokyvideo.com/es/video/video-name',
      'https://www.tokyvideo.com/video/video-name'
    ],
    okru: [
      'https://ok.ru/video/1234567890123',
      'https://odnoklassniki.ru/video/1234567890123'
    ],
    flixhq: [
      'https://flixhq.to/watch-movie/movie-name-12345',
      'https://flixhq.to/tv/series-name-67890'
    ],
    direct: [
      'https://example.com/video.mp4',
      'https://cdn.example.com/stream.m3u8'
    ]
  };
}
