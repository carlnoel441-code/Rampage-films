import https from 'https';
import http from 'http';

export interface VKExtractionResult {
  success: boolean;
  videoUrl?: string;
  quality?: string;
  error?: string;
  errorType?: 'deleted' | 'private' | 'geo_blocked' | 'login_required' | 'not_found' | 'unknown';
  requiresYtdlp?: boolean;
}

const urlCache = new Map<string, { url: string; timestamp: number; quality: string }>();
const CACHE_TTL = 30 * 60 * 1000;

export function isVKUrl(url: string): boolean {
  // Match vk.com, vkvideo.ru, vk.ru with optional www. or m. subdomain
  return /^https?:\/\/(www\.|m\.)?(vk\.com|vkvideo\.ru|vk\.ru)\/(video|clip)/.test(url) ||
         /^https?:\/\/(www\.|m\.)?(vk\.com|vkvideo\.ru|vk\.ru)\/.*video-?\d+_\d+/.test(url);
}

export function extractVKVideoId(url: string): { oid: string; id: string } | null {
  const patterns = [
    /video(-?\d+)_(\d+)/,
    /clip(-?\d+)_(\d+)/,
    /oid=(-?\d+).*id=(\d+)/,
    /videos(-?\d+)\?.*z=video(-?\d+)_(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      if (pattern.source.includes('videos')) {
        return { oid: match[2], id: match[3] };
      }
      return { oid: match[1], id: match[2] };
    }
  }

  return null;
}

function makeRequest(url: string, options: any = {}): Promise<{ data: string; statusCode: number }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
        'Cache-Control': 'no-cache',
        ...options.headers,
      },
      timeout: 15000,
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ data, statusCode: res.statusCode || 0 }));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

export async function extractVKDirectUrl(url: string): Promise<VKExtractionResult> {
  console.log(`[VK] Attempting extraction for: ${url}`);
  
  const cached = urlCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[VK] Using cached URL (${cached.quality})`);
    return { success: true, videoUrl: cached.url, quality: cached.quality };
  }

  const videoId = extractVKVideoId(url);
  if (!videoId) {
    console.log(`[VK] Could not parse video ID from URL`);
    return { 
      success: false, 
      error: 'Invalid VK video URL format',
      errorType: 'unknown',
      requiresYtdlp: true 
    };
  }

  console.log(`[VK] Parsed video ID: oid=${videoId.oid}, id=${videoId.id}`);

  try {
    const result = await tryEmbedExtraction(videoId.oid, videoId.id);
    if (result.success && result.videoUrl) {
      urlCache.set(url, { 
        url: result.videoUrl, 
        timestamp: Date.now(),
        quality: result.quality || 'unknown'
      });
      return result;
    }
    
    if (result.errorType && result.errorType !== 'unknown') {
      return result;
    }

    const pageResult = await tryPageExtraction(url);
    if (pageResult.success && pageResult.videoUrl) {
      urlCache.set(url, { 
        url: pageResult.videoUrl, 
        timestamp: Date.now(),
        quality: pageResult.quality || 'unknown'
      });
      return pageResult;
    }
    
    if (pageResult.errorType && pageResult.errorType !== 'unknown') {
      return pageResult;
    }

    console.log(`[VK] Custom extraction failed, will use yt-dlp`);
    return { 
      success: false, 
      error: 'VK requires yt-dlp for this video',
      requiresYtdlp: true 
    };

  } catch (error: any) {
    console.log(`[VK] Extraction error: ${error.message}`);
    return { 
      success: false, 
      error: error.message,
      requiresYtdlp: true 
    };
  }
}

async function tryEmbedExtraction(oid: string, id: string): Promise<VKExtractionResult> {
  console.log(`[VK] Trying embed extraction...`);
  
  try {
    const embedUrl = `https://vk.com/video_ext.php?oid=${oid}&id=${id}&hd=2`;
    const response = await makeRequest(embedUrl);
    
    if (response.data.includes('Video not found') || response.data.includes('video_ext_msg')) {
      if (response.data.includes('deleted')) {
        return { success: false, error: 'Video has been deleted', errorType: 'deleted' };
      }
      if (response.data.includes('private') || response.data.includes('restricted')) {
        return { success: false, error: 'Video is private', errorType: 'private' };
      }
      return { success: false, error: 'Video not found', errorType: 'not_found' };
    }

    const urlPatterns = [
      /"url1080":"([^"]+)"/,
      /"url720":"([^"]+)"/,
      /"url480":"([^"]+)"/,
      /"url360":"([^"]+)"/,
      /"url240":"([^"]+)"/,
      /"cache1080":"([^"]+)"/,
      /"cache720":"([^"]+)"/,
      /"cache480":"([^"]+)"/,
      /url1080['"]\s*:\s*['"]([^'"]+)['"]/,
      /url720['"]\s*:\s*['"]([^'"]+)['"]/,
      /url480['"]\s*:\s*['"]([^'"]+)['"]/,
    ];

    const qualityNames = ['1080p', '720p', '480p', '360p', '240p', '1080p', '720p', '480p', '1080p', '720p', '480p'];

    for (let i = 0; i < urlPatterns.length; i++) {
      const match = response.data.match(urlPatterns[i]);
      if (match && match[1]) {
        let videoUrl = match[1].replace(/\\/g, '');
        if (!videoUrl.startsWith('http')) {
          videoUrl = 'https:' + videoUrl;
        }
        console.log(`[VK] Found ${qualityNames[i]} stream in embed`);
        return { success: true, videoUrl, quality: qualityNames[i] };
      }
    }

    const mp4Pattern = /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/gi;
    const mp4Matches = response.data.match(mp4Pattern);
    if (mp4Matches && mp4Matches.length > 0) {
      const cleanUrl = mp4Matches[0].replace(/\\/g, '');
      console.log(`[VK] Found MP4 URL in embed`);
      return { success: true, videoUrl: cleanUrl, quality: 'unknown' };
    }

    console.log(`[VK] No direct URLs found in embed response`);
    return { success: false, error: 'No direct URLs in embed', requiresYtdlp: true };

  } catch (error: any) {
    console.log(`[VK] Embed extraction error: ${error.message}`);
    return { success: false, error: error.message, requiresYtdlp: true };
  }
}

async function tryPageExtraction(url: string): Promise<VKExtractionResult> {
  console.log(`[VK] Trying page extraction...`);
  
  try {
    const response = await makeRequest(url);
    
    if (response.statusCode === 418) {
      console.log(`[VK] Got 418 (bot detection), will use yt-dlp`);
      return { success: false, error: 'Bot detection triggered', requiresYtdlp: true };
    }

    if (response.data.includes('Login required') || response.data.includes('log in to continue')) {
      return { success: false, error: 'Login required to view this video', errorType: 'login_required' };
    }

    if (response.data.includes('This video has been deleted')) {
      return { success: false, error: 'Video has been deleted', errorType: 'deleted' };
    }

    if (response.data.includes('Access denied') || response.data.includes('private video')) {
      return { success: false, error: 'Video is private', errorType: 'private' };
    }

    const qualityPatterns = [
      { pattern: /"url1080":"([^"]+)"/, quality: '1080p' },
      { pattern: /"url720":"([^"]+)"/, quality: '720p' },
      { pattern: /"url480":"([^"]+)"/, quality: '480p' },
      { pattern: /"url360":"([^"]+)"/, quality: '360p' },
      { pattern: /"url240":"([^"]+)"/, quality: '240p' },
      { pattern: /"mp4_1080":"([^"]+)"/, quality: '1080p' },
      { pattern: /"mp4_720":"([^"]+)"/, quality: '720p' },
      { pattern: /"mp4_480":"([^"]+)"/, quality: '480p' },
    ];

    for (const { pattern, quality } of qualityPatterns) {
      const match = response.data.match(pattern);
      if (match && match[1]) {
        let videoUrl = match[1].replace(/\\/g, '');
        if (!videoUrl.startsWith('http')) {
          videoUrl = 'https:' + videoUrl;
        }
        console.log(`[VK] Found ${quality} stream in page`);
        return { success: true, videoUrl, quality };
      }
    }

    const mp4Pattern = /https?:\/\/[a-z0-9\-\.]+vkuservideo[^"'\s]+\.mp4[^"'\s]*/gi;
    const mp4Matches = response.data.match(mp4Pattern);
    if (mp4Matches && mp4Matches.length > 0) {
      const cleanUrl = mp4Matches[0].replace(/\\/g, '');
      console.log(`[VK] Found VK video URL in page`);
      return { success: true, videoUrl: cleanUrl, quality: 'unknown' };
    }

    console.log(`[VK] No direct URLs found in page`);
    return { success: false, error: 'No direct URLs in page', requiresYtdlp: true };

  } catch (error: any) {
    console.log(`[VK] Page extraction error: ${error.message}`);
    return { success: false, error: error.message, requiresYtdlp: true };
  }
}

export function clearVKCache(): void {
  urlCache.clear();
  console.log(`[VK] Cache cleared`);
}

export function getVKCacheStats(): { size: number; oldestEntry: number | null } {
  let oldest: number | null = null;
  urlCache.forEach((value) => {
    if (oldest === null || value.timestamp < oldest) {
      oldest = value.timestamp;
    }
  });
  return { size: urlCache.size, oldestEntry: oldest };
}
