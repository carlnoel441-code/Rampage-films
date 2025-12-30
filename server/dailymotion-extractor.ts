interface DailymotionQuality {
  type: string;
  url: string;
}

interface DailymotionMetadata {
  qualities?: {
    auto?: DailymotionQuality[];
    [key: string]: DailymotionQuality[] | undefined;
  };
}

export interface DailymotionExtractionResult {
  success: boolean;
  directUrl?: string;
  error?: 'invalid-url' | 'not-found' | 'geo-blocked' | 'private' | 'changed-structure' | 'timeout' | 'server-error';
  errorMessage?: string;
}

const urlCache = new Map<string, { url: string; expires: number }>();
const CACHE_TTL = 1800000; // 30 minutes (Dailymotion URLs expire faster than Ok.ru)

function getCachedUrl(videoId: string): string | null {
  const cached = urlCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }
  if (cached) {
    urlCache.delete(videoId);
  }
  return null;
}

function cacheUrl(videoId: string, url: string): void {
  urlCache.set(videoId, {
    url,
    expires: Date.now() + CACHE_TTL
  });
}

function isValidDailymotionUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.includes('dailymotion.com') || 
           parsedUrl.hostname.includes('dai.ly');
  } catch {
    return false;
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
    /dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/,
    /dai\.ly\/([a-zA-Z0-9]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

export async function extractDailymotionDirectUrl(dailymotionUrl: string): Promise<DailymotionExtractionResult> {
  try {
    if (!isValidDailymotionUrl(dailymotionUrl)) {
      return {
        success: false,
        error: 'invalid-url',
        errorMessage: 'URL must be from dailymotion.com or dai.ly domain'
      };
    }

    const videoId = extractVideoId(dailymotionUrl);
    if (!videoId) {
      return {
        success: false,
        error: 'invalid-url',
        errorMessage: 'Could not extract video ID from URL'
      };
    }

    console.log(`[Dailymotion] Extracting video ID: ${videoId}`);

    const cachedUrl = getCachedUrl(videoId);
    if (cachedUrl) {
      console.log(`[Dailymotion] Using cached URL for ${videoId}`);
      return { success: true, directUrl: cachedUrl };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const playerUrl = `https://www.dailymotion.com/player/metadata/video/${videoId}`;
      console.log(`[Dailymotion] Fetching player metadata from: ${playerUrl}`);

      const response = await fetch(playerUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.dailymotion.com/'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: 'not-found',
            errorMessage: 'Video not found on Dailymotion'
          };
        }
        if (response.status === 403) {
          return {
            success: false,
            error: 'geo-blocked',
            errorMessage: 'Video may be geo-blocked or private'
          };
        }
        return {
          success: false,
          error: 'server-error',
          errorMessage: `Dailymotion returned status ${response.status}`
        };
      }

      const data = await response.json();
      
      if (data.error) {
        console.log(`[Dailymotion] API error: ${data.error.title || data.error.message || JSON.stringify(data.error)}`);
        
        if (data.error.title?.includes('private') || data.error.code === 'DM007') {
          return {
            success: false,
            error: 'private',
            errorMessage: 'This video is private'
          };
        }
        if (data.error.title?.includes('geo') || data.error.code === 'DM005') {
          return {
            success: false,
            error: 'geo-blocked',
            errorMessage: 'This video is geo-blocked in your region'
          };
        }
        
        return {
          success: false,
          error: 'server-error',
          errorMessage: data.error.title || data.error.message || 'Unknown Dailymotion error'
        };
      }

      const directUrl = extractBestQualityUrl(data);
      
      if (!directUrl) {
        console.log(`[Dailymotion] Could not extract direct URL from metadata`);
        console.log(`[Dailymotion] Available qualities:`, Object.keys(data.qualities || {}));
        
        return await tryAlternativeExtraction(videoId, controller);
      }

      console.log(`[Dailymotion] Successfully extracted direct URL`);
      cacheUrl(videoId, directUrl);

      return { success: true, directUrl };

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return {
          success: false,
          error: 'timeout',
          errorMessage: 'Request to Dailymotion timed out'
        };
      }
      throw fetchError;
    }
  } catch (error: any) {
    console.error('[Dailymotion] Error extracting video URL:', error.message || error);
    return {
      success: false,
      error: 'server-error',
      errorMessage: error.message || 'Unknown error occurred'
    };
  }
}

function extractBestQualityUrl(data: any): string | null {
  const qualities = data.qualities;
  if (!qualities) {
    console.log(`[Dailymotion] No qualities object in response`);
    return null;
  }

  console.log(`[Dailymotion] Available quality keys:`, Object.keys(qualities));
  
  const qualityOrder = ['1080', '720', '480', '380', '240', '144', 'auto'];
  
  for (const quality of qualityOrder) {
    const qualityStreams = qualities[quality];
    if (qualityStreams && Array.isArray(qualityStreams)) {
      console.log(`[Dailymotion] Checking ${quality}p: ${qualityStreams.length} streams`);
      
      const mp4Stream = qualityStreams.find((s: any) => 
        s.type === 'video/mp4' || s.type?.includes('mp4') || 
        (s.url && s.url.includes('.mp4') && !s.url.includes('.m3u8'))
      );
      if (mp4Stream?.url) {
        console.log(`[Dailymotion] Found ${quality}p MP4 stream`);
        return mp4Stream.url;
      }
      
      const nonHlsStream = qualityStreams.find((s: any) => 
        s.url && !s.url.includes('.m3u8') && !s.url.includes('manifest')
      );
      if (nonHlsStream?.url) {
        console.log(`[Dailymotion] Found ${quality}p non-HLS stream`);
        return nonHlsStream.url;
      }
    }
  }

  console.log(`[Dailymotion] No direct MP4 streams found, checking for HLS...`);
  
  for (const quality of qualityOrder) {
    const qualityStreams = qualities[quality];
    if (qualityStreams && Array.isArray(qualityStreams)) {
      const hlsStream = qualityStreams.find((s: any) => 
        s.url && (s.url.includes('.m3u8') || s.type?.includes('mpegURL'))
      );
      if (hlsStream?.url) {
        console.log(`[Dailymotion] Found ${quality}p HLS stream - will need yt-dlp fallback`);
        return null;
      }
    }
  }

  console.log(`[Dailymotion] No suitable stream found in qualities`);
  return null;
}

async function tryAlternativeExtraction(videoId: string, controller: AbortController): Promise<DailymotionExtractionResult> {
  console.log(`[Dailymotion] Trying alternative extraction method...`);
  
  try {
    const embedUrl = `https://www.dailymotion.com/embed/video/${videoId}`;
    const response = await fetch(embedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return {
        success: false,
        error: 'not-found',
        errorMessage: 'Could not fetch embed page'
      };
    }

    const html = await response.text();

    const configPattern = /var\s+config\s*=\s*({[\s\S]*?});/;
    const configMatch = html.match(configPattern);
    if (configMatch) {
      try {
        const config = JSON.parse(configMatch[1]);
        if (config.metadata?.qualities) {
          const url = extractBestQualityUrl(config.metadata);
          if (url) {
            console.log(`[Dailymotion] Extracted URL from embed config`);
            cacheUrl(videoId, url);
            return { success: true, directUrl: url };
          }
        }
      } catch (e) {
        console.log(`[Dailymotion] Failed to parse embed config`);
      }
    }

    const mp4Pattern = /"url"\s*:\s*"(https?:[^"]+\.mp4[^"]*)"/g;
    let match;
    while ((match = mp4Pattern.exec(html)) !== null) {
      const url = match[1].replace(/\\/g, '');
      if (url.includes('cdn.dmcdn.net') || url.includes('dmcdn')) {
        console.log(`[Dailymotion] Found direct MP4 URL in embed page`);
        cacheUrl(videoId, url);
        return { success: true, directUrl: url };
      }
    }

    return {
      success: false,
      error: 'changed-structure',
      errorMessage: 'Could not extract video URL from Dailymotion (structure may have changed)'
    };

  } catch (error: any) {
    console.error(`[Dailymotion] Alternative extraction failed:`, error.message);
    return {
      success: false,
      error: 'server-error',
      errorMessage: 'Alternative extraction method failed'
    };
  }
}
