interface OkRuVideoMetadata {
  videos?: Array<{
    name: string;
    url: string;
  }>;
}

export interface OkRuExtractionResult {
  success: boolean;
  directUrl?: string;
  error?: 'invalid-url' | 'not-found' | 'changed-structure' | 'timeout' | 'server-error' | 'private' | 'deleted';
  errorMessage?: string;
}

// Simple in-memory cache with TTL
const urlCache = new Map<string, { url: string; expires: number }>();
const CACHE_TTL = 1800000; // 30 minutes (shorter for freshness)

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

function isValidOkRuUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'ok.ru' || parsedUrl.hostname === 'www.ok.ru';
  } catch {
    return false;
  }
}

function extractVideoId(url: string): string | null {
  // Support multiple URL formats:
  // https://ok.ru/video/1234567890
  // https://ok.ru/videoembed/1234567890
  // https://ok.ru/live/1234567890
  // https://ok.ru/dk?st.cmd=movieLayer&st.mvId=1234567890
  const patterns = [
    /ok\.ru\/(?:video|videoembed|live)\/(\d+)/,
    /st\.mvId=(\d+)/,
    /movieId=(\d+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function extractOkRuDirectUrl(okRuUrl: string): Promise<OkRuExtractionResult> {
  try {
    if (!isValidOkRuUrl(okRuUrl)) {
      return {
        success: false,
        error: 'invalid-url',
        errorMessage: 'URL must be from ok.ru domain'
      };
    }

    const videoId = extractVideoId(okRuUrl);
    if (!videoId) {
      return {
        success: false,
        error: 'invalid-url',
        errorMessage: 'Could not extract video ID from URL'
      };
    }

    console.log(`[OkRu] Extracting video ID: ${videoId}`);
    
    // Check cache first
    const cachedUrl = getCachedUrl(videoId);
    if (cachedUrl) {
      console.log(`[OkRu] Using cached URL for ${videoId}`);
      return { success: true, directUrl: cachedUrl };
    }

    // Try multiple extraction methods
    const methods = [
      () => tryMobileApi(videoId),
      () => tryEmbedPage(videoId),
      () => tryVideoPage(videoId),
      () => tryPlayerApi(videoId),
    ];

    for (let i = 0; i < methods.length; i++) {
      try {
        console.log(`[OkRu] Trying extraction method ${i + 1}/${methods.length}`);
        const result = await methods[i]();
        if (result) {
          cacheUrl(videoId, result);
          console.log(`[OkRu] Successfully extracted URL using method ${i + 1}`);
          return { success: true, directUrl: result };
        }
      } catch (e: any) {
        console.log(`[OkRu] Method ${i + 1} failed:`, e.message);
      }
    }

    return {
      success: false,
      error: 'changed-structure',
      errorMessage: 'All extraction methods failed - Ok.ru may have changed their structure'
    };

  } catch (error: any) {
    console.error('[OkRu] Error extracting video URL:', error.message || error);
    return {
      success: false,
      error: 'server-error',
      errorMessage: error.message || 'Unknown error occurred'
    };
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Method 1: Try Ok.ru's mobile API endpoint
async function tryMobileApi(videoId: string): Promise<string | null> {
  console.log(`[OkRu] Trying mobile API for ${videoId}`);
  
  try {
    const apiUrl = `https://m.ok.ru/dk?st.cmd=movieLayer&st.mvId=${videoId}&_prevCmd=videoPlayer&tkn=1`;
    const response = await fetchWithTimeout(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    });

    if (!response.ok) {
      console.log(`[OkRu] Mobile API returned ${response.status}`);
      return null;
    }

    const html = await response.text();
    return extractFromHtml(html, 'mobile API');
  } catch (e: any) {
    console.log(`[OkRu] Mobile API error:`, e.message);
    return null;
  }
}

// Method 2: Try embed page
async function tryEmbedPage(videoId: string): Promise<string | null> {
  console.log(`[OkRu] Trying embed page for ${videoId}`);
  
  try {
    const embedUrl = `https://ok.ru/videoembed/${videoId}`;
    const response = await fetchWithTimeout(embedUrl);

    if (!response.ok) {
      console.log(`[OkRu] Embed page returned ${response.status}`);
      return null;
    }

    const html = await response.text();
    return extractFromHtml(html, 'embed page');
  } catch (e: any) {
    console.log(`[OkRu] Embed page error:`, e.message);
    return null;
  }
}

// Method 3: Try regular video page
async function tryVideoPage(videoId: string): Promise<string | null> {
  console.log(`[OkRu] Trying video page for ${videoId}`);
  
  try {
    const videoUrl = `https://ok.ru/video/${videoId}`;
    const response = await fetchWithTimeout(videoUrl);

    if (!response.ok) {
      console.log(`[OkRu] Video page returned ${response.status}`);
      return null;
    }

    const html = await response.text();
    return extractFromHtml(html, 'video page');
  } catch (e: any) {
    console.log(`[OkRu] Video page error:`, e.message);
    return null;
  }
}

// Method 4: Try player API directly
async function tryPlayerApi(videoId: string): Promise<string | null> {
  console.log(`[OkRu] Trying player API for ${videoId}`);
  
  try {
    // Try the REST API endpoint
    const apiUrl = `https://ok.ru/dk?st.cmd=movieLayer&st.mvId=${videoId}&_prevCmd=videoPlayer`;
    const response = await fetchWithTimeout(apiUrl);

    if (!response.ok) {
      console.log(`[OkRu] Player API returned ${response.status}`);
      return null;
    }

    const html = await response.text();
    return extractFromHtml(html, 'player API');
  } catch (e: any) {
    console.log(`[OkRu] Player API error:`, e.message);
    return null;
  }
}

function extractFromHtml(html: string, source: string): string | null {
  console.log(`[OkRu] Extracting from ${source} (${html.length} chars)`);

  // Check for error conditions first
  if (html.includes('Video not found') || html.includes('Видео не найдено')) {
    console.log(`[OkRu] Video marked as not found`);
    return null;
  }
  if (html.includes('video is private') || html.includes('приватное видео')) {
    console.log(`[OkRu] Video is private`);
    return null;
  }

  // Pattern 1: Look for data-options JSON (most common)
  const dataOptionsPatterns = [
    /data-options="([^"]+)"/,
    /data-options='([^']+)'/,
    /data-module="OKVideo"[^>]*data-options="([^"]+)"/,
    /data-module="OKVideo"[^>]*data-options='([^']+)'/,
  ];

  for (const pattern of dataOptionsPatterns) {
    const match = html.match(pattern);
    if (match) {
      const url = parseDataOptions(match[1]);
      if (url) {
        console.log(`[OkRu] Found URL via data-options`);
        return url;
      }
    }
  }

  // Pattern 2: Look for flashvars in script tags
  const flashvarsPatterns = [
    /flashvars['"]\s*:\s*\{([^}]+)\}/,
    /"flashvars"\s*:\s*\{([^}]+)\}/,
    /'flashvars'\s*:\s*\{([^}]+)\}/,
  ];

  for (const pattern of flashvarsPatterns) {
    const match = html.match(pattern);
    if (match) {
      const metadataMatch = match[1].match(/metadata['"]\s*:\s*['"]([^'"]+)['"]/);
      if (metadataMatch) {
        const url = parseMetadataString(metadataMatch[1]);
        if (url) {
          console.log(`[OkRu] Found URL via flashvars.metadata`);
          return url;
        }
      }
    }
  }

  // Pattern 3: Look for metadata directly
  const metadataPatterns = [
    /"metadata"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    /'metadata'\s*:\s*'((?:[^'\\]|\\.)*)'/,
    /metadata:\s*'((?:[^'\\]|\\.)*)'/,
    /metadata:\s*"((?:[^"\\]|\\.)*)"/,
  ];

  for (const pattern of metadataPatterns) {
    const match = html.match(pattern);
    if (match) {
      const url = parseMetadataString(match[1]);
      if (url) {
        console.log(`[OkRu] Found URL via metadata pattern`);
        return url;
      }
    }
  }

  // Pattern 4: Look for videos array directly
  const videosPatterns = [
    /"videos"\s*:\s*(\[[^\]]+\])/,
    /'videos'\s*:\s*(\[[^\]]+\])/,
    /videos:\s*(\[[^\]]+\])/,
  ];

  for (const pattern of videosPatterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        const videos = JSON.parse(match[1]);
        const url = extractBestQualityFromArray(videos);
        if (url) {
          console.log(`[OkRu] Found URL via videos array`);
          return url;
        }
      } catch (e) {
        // Continue to next pattern
      }
    }
  }

  // Pattern 5: Look for direct MP4 URLs
  const mp4Pattern = /https?:\/\/[^"'\s]+\.mp4(?:\?[^"'\s]*)?/g;
  const mp4Matches = html.match(mp4Pattern);
  if (mp4Matches) {
    // Filter for ok.ru CDN URLs
    const okruMp4s = mp4Matches.filter(url => 
      url.includes('vd') || url.includes('mycdn') || url.includes('okcdn')
    );
    if (okruMp4s.length > 0) {
      // Try to find highest quality
      const sorted = okruMp4s.sort((a, b) => {
        const getQuality = (url: string) => {
          if (url.includes('1080')) return 1080;
          if (url.includes('720')) return 720;
          if (url.includes('480')) return 480;
          if (url.includes('360')) return 360;
          if (url.includes('240')) return 240;
          return 0;
        };
        return getQuality(b) - getQuality(a);
      });
      console.log(`[OkRu] Found URL via direct MP4 pattern`);
      return sorted[0];
    }
  }

  // Pattern 6: Look for videoSrc or src attributes
  const srcPatterns = [
    /videoSrc['"]\s*:\s*['"]([^'"]+)['"]/,
    /video_src['"]\s*:\s*['"]([^'"]+)['"]/,
    /"src"\s*:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/,
  ];

  for (const pattern of srcPatterns) {
    const match = html.match(pattern);
    if (match && match[1].includes('mp4')) {
      console.log(`[OkRu] Found URL via src pattern`);
      return decodeURIComponent(match[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => 
        String.fromCharCode(parseInt(code, 16))
      ));
    }
  }

  // Pattern 7: Look for hlsManifestUrl or hlsMasterPlaylistUrl (HLS fallback)
  const hlsPattern = /(?:hlsManifestUrl|hlsMasterPlaylistUrl)['"]\s*:\s*['"]([^'"]+)['"]/;
  const hlsMatch = html.match(hlsPattern);
  if (hlsMatch) {
    console.log(`[OkRu] Found HLS URL (note: may need conversion)`);
    return decodeURIComponent(hlsMatch[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => 
      String.fromCharCode(parseInt(code, 16))
    ));
  }

  console.log(`[OkRu] No URL found in ${source}`);
  return null;
}

function parseDataOptions(optionsStr: string): string | null {
  try {
    const jsonStr = optionsStr
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'");

    const data = JSON.parse(jsonStr);
    
    // Try flashvars.metadata first
    if (data.flashvars?.metadata) {
      const url = extractBestQuality(data.flashvars.metadata);
      if (url) return url;
    }

    // Try flashvars.videos
    if (data.flashvars?.videos) {
      const url = extractBestQualityFromArray(data.flashvars.videos);
      if (url) return url;
    }

    // Try direct metadata
    if (data.metadata) {
      const url = extractBestQuality(data.metadata);
      if (url) return url;
    }

    // Try direct videos
    if (data.videos) {
      const url = extractBestQualityFromArray(data.videos);
      if (url) return url;
    }
  } catch (e) {
    // Parsing failed
  }
  return null;
}

function parseMetadataString(metadataStr: string): string | null {
  try {
    // Handle various escape sequences
    const cleaned = metadataStr
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
    
    const metadata = JSON.parse(cleaned);
    return extractBestQuality(metadata);
  } catch (e) {
    // Try URL decoding
    try {
      const decoded = decodeURIComponent(metadataStr);
      const metadata = JSON.parse(decoded);
      return extractBestQuality(metadata);
    } catch {
      return null;
    }
  }
}

function extractBestQuality(metadata: string | OkRuVideoMetadata): string | null {
  try {
    let videoData: OkRuVideoMetadata;
    
    if (typeof metadata === 'string') {
      videoData = JSON.parse(metadata);
    } else {
      videoData = metadata;
    }

    return extractBestQualityFromArray(videoData.videos);
  } catch (error) {
    return null;
  }
}

/**
 * Decode common HTML entities in URLs
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function extractBestQualityFromArray(videos: any[] | undefined): string | null {
  if (!videos || videos.length === 0) {
    return null;
  }

  // Validate that videos have required fields
  const validVideos = videos.filter(v => v && v.url && typeof v.url === 'string');
  if (validVideos.length === 0) {
    return null;
  }

  // Sort by quality preference: 1080, 720, 480, 360, 240
  const qualityOrder = ['1080', 'hd', '720', '480', 'sd', '360', '240', 'mobile', 'lowest'];
  
  for (const quality of qualityOrder) {
    const video = validVideos.find(v => {
      const name = (v.name || '').toLowerCase();
      return name.includes(quality);
    });
    if (video) {
      // Decode HTML entities in the URL
      return decodeHtmlEntities(video.url);
    }
  }

  // If no specific quality found, return the first available video
  return decodeHtmlEntities(validVideos[0].url);
}

// Export helper to check if a URL is Ok.ru
export function isOkRuUrl(url: string): boolean {
  return isValidOkRuUrl(url);
}
