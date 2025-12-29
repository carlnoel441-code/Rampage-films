export interface RumbleExtractionResult {
  success: boolean;
  directUrl?: string;
  quality?: string;
  availableQualities?: string[];
  error?: 'invalid-url' | 'not-found' | 'private' | 'timeout' | 'server-error' | 'changed-structure';
  errorMessage?: string;
}

const urlCache = new Map<string, { urls: Record<string, string>; expires: number }>();
const CACHE_TTL = 1800000; // 30 minutes

function getCachedUrls(videoId: string): Record<string, string> | null {
  const cached = urlCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    return cached.urls;
  }
  if (cached) {
    urlCache.delete(videoId);
  }
  return null;
}

function cacheUrls(videoId: string, urls: Record<string, string>): void {
  urlCache.set(videoId, {
    urls,
    expires: Date.now() + CACHE_TTL
  });
}

export function isRumbleUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'rumble.com' || parsedUrl.hostname === 'www.rumble.com';
  } catch {
    return false;
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /rumble\.com\/embed\/([a-zA-Z0-9]+)/,
    /rumble\.com\/([a-zA-Z0-9]+-[^\/]+)\.html/,
    /rumble\.com\/v([a-zA-Z0-9]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function selectQualityUrl(urls: Record<string, string>, preferredQuality: string = 'best'): { url: string; quality: string } | null {
  const qualityPriority = ['1080p', '720p', '480p', '360p', '240p'];
  
  if (preferredQuality === 'best') {
    for (const quality of qualityPriority) {
      if (urls[quality]) {
        return { url: urls[quality], quality };
      }
    }
  } else if (preferredQuality === '720p') {
    const prefer720 = ['720p', '480p', '360p', '1080p'];
    for (const quality of prefer720) {
      if (urls[quality]) {
        return { url: urls[quality], quality };
      }
    }
  } else if (preferredQuality === '480p') {
    const prefer480 = ['480p', '360p', '720p', '240p'];
    for (const quality of prefer480) {
      if (urls[quality]) {
        return { url: urls[quality], quality };
      }
    }
  }
  
  const anyUrl = Object.entries(urls)[0];
  if (anyUrl) {
    return { url: anyUrl[1], quality: anyUrl[0] };
  }
  return null;
}

export async function extractRumbleDirectUrl(rumbleUrl: string, preferredQuality: string = 'best'): Promise<RumbleExtractionResult> {
  try {
    if (!isRumbleUrl(rumbleUrl)) {
      return {
        success: false,
        error: 'invalid-url',
        errorMessage: 'URL must be from rumble.com domain'
      };
    }

    const videoId = extractVideoId(rumbleUrl);
    if (!videoId) {
      return {
        success: false,
        error: 'invalid-url',
        errorMessage: 'Could not extract video ID from URL'
      };
    }

    console.log(`[Rumble] Extracting video ID: ${videoId}`);

    const cachedUrls = getCachedUrls(videoId);
    if (cachedUrls) {
      console.log(`[Rumble] Using cached URLs for ${videoId}`);
      const selected = selectQualityUrl(cachedUrls, preferredQuality);
      if (selected) {
        return { 
          success: true, 
          directUrl: selected.url,
          quality: selected.quality,
          availableQualities: Object.keys(cachedUrls)
        };
      }
    }

    const methods = [
      () => tryEmbedApi(videoId),
      () => tryVideoPage(rumbleUrl),
    ];

    for (let i = 0; i < methods.length; i++) {
      try {
        console.log(`[Rumble] Trying extraction method ${i + 1}/${methods.length}`);
        const urls = await methods[i]();
        if (urls && Object.keys(urls).length > 0) {
          cacheUrls(videoId, urls);
          console.log(`[Rumble] Found ${Object.keys(urls).length} qualities: ${Object.keys(urls).join(', ')}`);
          
          const selected = selectQualityUrl(urls, preferredQuality);
          if (selected) {
            return { 
              success: true, 
              directUrl: selected.url,
              quality: selected.quality,
              availableQualities: Object.keys(urls)
            };
          }
        }
      } catch (e: any) {
        console.log(`[Rumble] Method ${i + 1} failed:`, e.message);
      }
    }

    return {
      success: false,
      error: 'changed-structure',
      errorMessage: 'All extraction methods failed - Rumble may have changed their structure'
    };

  } catch (error: any) {
    console.error('[Rumble] Error extracting video URL:', error.message || error);
    return {
      success: false,
      error: 'server-error',
      errorMessage: error.message || 'Unknown error occurred'
    };
  }
}

async function tryEmbedApi(videoId: string): Promise<Record<string, string> | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const embedUrl = `https://rumble.com/embed/${videoId}/`;
    console.log(`[Rumble] Fetching embed page: ${embedUrl}`);

    const response = await fetch(embedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': 'https://rumble.com/'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return parseRumbleHtml(html);

  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function tryVideoPage(rumbleUrl: string): Promise<Record<string, string> | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    console.log(`[Rumble] Fetching video page: ${rumbleUrl}`);

    const response = await fetch(rumbleUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return parseRumbleHtml(html);

  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function parseRumbleHtml(html: string): Record<string, string> | null {
  const urls: Record<string, string> = {};

  const patterns = [
    /"mp4":\s*\{[^}]*"url":\s*"([^"]+)"[^}]*"res":\s*(\d+)/g,
    /"(\d+)":\s*\{[^}]*"url":\s*"([^"]+\.mp4[^"]*)"/g,
    /src=["']?(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
  ];

  const jsonMatch = html.match(/Rumble\s*\(\s*"play"\s*,\s*(\{[\s\S]*?\})\s*\)/);
  if (jsonMatch) {
    try {
      const fixedJson = jsonMatch[1]
        .replace(/'/g, '"')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      
      const data = JSON.parse(fixedJson);
      
      if (data.ua && typeof data.ua === 'object') {
        for (const [quality, info] of Object.entries(data.ua)) {
          if (info && typeof info === 'object' && 'url' in info) {
            const qualityLabel = quality === 'mp4' ? '720p' : `${quality}p`;
            urls[qualityLabel] = (info as any).url;
          }
        }
      }
      
      if (data.u && data.u.mp4) {
        if (data.u.mp4.url) {
          urls['720p'] = data.u.mp4.url;
        }
      }
    } catch (e) {
      console.log('[Rumble] Failed to parse JSON config:', e);
    }
  }

  const mp4Regex = /"url":\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/g;
  let mp4Match;
  while ((mp4Match = mp4Regex.exec(html)) !== null) {
    const url = mp4Match[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
    if (url.includes('sp.rmbl.ws') || url.includes('rumble.com')) {
      if (url.includes('1080')) {
        urls['1080p'] = url;
      } else if (url.includes('720') || !urls['720p']) {
        urls['720p'] = url;
      } else if (url.includes('480')) {
        urls['480p'] = url;
      } else if (url.includes('360')) {
        urls['360p'] = url;
      }
    }
  }

  return Object.keys(urls).length > 0 ? urls : null;
}
