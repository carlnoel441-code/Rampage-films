import https from 'https';
import http from 'http';

export interface TokyVideoExtractionResult {
  success: boolean;
  videoUrl?: string;
  quality?: string;
  error?: string;
  errorType?: 'deleted' | 'private' | 'geo_blocked' | 'not_found' | 'unknown';
  requiresYtdlp?: boolean;
}

const urlCache = new Map<string, { url: string; timestamp: number; quality: string }>();
const CACHE_TTL = 30 * 60 * 1000;

export function isTokyVideoUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(tokyvideo\.com|tokyo-video\.com)\//i.test(url);
}

export function extractTokyVideoId(url: string): string | null {
  const patterns = [
    /tokyvideo\.com\/video\/([a-zA-Z0-9_-]+)/i,
    /tokyo-video\.com\/video\/([a-zA-Z0-9_-]+)/i,
    /tokyvideo\.com\/embed\/([a-zA-Z0-9_-]+)/i,
    /tokyo-video\.com\/embed\/([a-zA-Z0-9_-]+)/i,
    /tokyvideo\.com\/v\/([a-zA-Z0-9_-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
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
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Referer': 'https://tokyvideo.com/',
        ...options.headers,
      },
      timeout: 15000,
    };

    const req = protocol.request(reqOptions, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        makeRequest(res.headers.location, options).then(resolve).catch(reject);
        return;
      }
      
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

async function tryPageExtraction(url: string): Promise<TokyVideoExtractionResult> {
  console.log(`[TokyVideo] Attempting page extraction for: ${url}`);
  
  try {
    const { data, statusCode } = await makeRequest(url);
    
    if (statusCode === 404) {
      return { 
        success: false, 
        error: 'Video not found',
        errorType: 'not_found'
      };
    }

    if (statusCode !== 200) {
      console.log(`[TokyVideo] Page returned status ${statusCode}`);
      return { 
        success: false, 
        error: `Server returned status ${statusCode}`,
        errorType: 'unknown',
        requiresYtdlp: true 
      };
    }

    if (data.includes('video has been removed') || 
        data.includes('video is no longer available') ||
        data.includes('This video has been deleted')) {
      return { 
        success: false, 
        error: 'Video has been deleted',
        errorType: 'deleted'
      };
    }

    if (data.includes('private video') || data.includes('This video is private')) {
      return { 
        success: false, 
        error: 'Video is private',
        errorType: 'private'
      };
    }

    const qualityOrder = ['1080', '720', '480', '360', '240'];
    
    const sourcePatterns = [
      /<source[^>]+src=["']([^"']+\.mp4[^"']*)["'][^>]*type=["']video\/mp4["']/gi,
      /file:\s*["']([^"']+\.mp4[^"']*)["']/gi,
      /source:\s*["']([^"']+\.mp4[^"']*)["']/gi,
      /["']file["']\s*:\s*["']([^"']+\.mp4[^"']*)["']/gi,
      /videoUrl\s*[=:]\s*["']([^"']+\.mp4[^"']*)["']/gi,
      /data-video-url=["']([^"']+\.mp4[^"']*)["']/gi,
      /src=["']([^"']+\.mp4[^"']*)["']/gi,
      /mp4:\s*["']([^"']+)["']/gi,
      /video_url\s*[=:]\s*["']([^"']+)["']/gi,
    ];

    const foundUrls: { url: string; quality: string }[] = [];
    
    for (const pattern of sourcePatterns) {
      let match;
      while ((match = pattern.exec(data)) !== null) {
        const videoUrl = match[1];
        if (videoUrl && !videoUrl.includes('thumbnail') && !videoUrl.includes('poster')) {
          let quality = 'unknown';
          for (const q of qualityOrder) {
            if (videoUrl.includes(q)) {
              quality = q + 'p';
              break;
            }
          }
          foundUrls.push({ url: videoUrl, quality });
        }
      }
    }

    const hlsPatterns = [
      /["']([^"']+\.m3u8[^"']*)["']/gi,
      /source:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
    ];
    
    for (const pattern of hlsPatterns) {
      let match;
      while ((match = pattern.exec(data)) !== null) {
        const hlsUrl = match[1];
        if (hlsUrl) {
          console.log(`[TokyVideo] Found HLS stream, will use yt-dlp for proper handling`);
          return { 
            success: false, 
            error: 'HLS stream detected, requires yt-dlp',
            requiresYtdlp: true 
          };
        }
      }
    }

    if (foundUrls.length > 0) {
      foundUrls.sort((a, b) => {
        const aQual = parseInt(a.quality) || 0;
        const bQual = parseInt(b.quality) || 0;
        return bQual - aQual;
      });
      
      const best = foundUrls[0];
      console.log(`[TokyVideo] Found ${foundUrls.length} video URLs, selecting: ${best.quality}`);
      return { 
        success: true, 
        videoUrl: best.url,
        quality: best.quality 
      };
    }

    const jwPlayerMatch = data.match(/jwplayer\([^)]+\)\.setup\(\{[\s\S]*?sources:\s*\[([\s\S]*?)\]/);
    if (jwPlayerMatch) {
      const sourcesStr = jwPlayerMatch[1];
      const fileMatch = sourcesStr.match(/file:\s*["']([^"']+)["']/);
      if (fileMatch) {
        console.log(`[TokyVideo] Found JWPlayer source`);
        return { 
          success: true, 
          videoUrl: fileMatch[1],
          quality: 'auto' 
        };
      }
    }

    const videoJsMatch = data.match(/videojs\([^,]+,\s*\{[\s\S]*?sources:\s*\[([\s\S]*?)\]/);
    if (videoJsMatch) {
      const sourcesStr = videoJsMatch[1];
      const srcMatch = sourcesStr.match(/src:\s*["']([^"']+)["']/);
      if (srcMatch) {
        console.log(`[TokyVideo] Found Video.js source`);
        return { 
          success: true, 
          videoUrl: srcMatch[1],
          quality: 'auto' 
        };
      }
    }

    console.log(`[TokyVideo] No direct video URL found in page, will try yt-dlp`);
    return { 
      success: false, 
      error: 'Could not find direct video URL',
      requiresYtdlp: true 
    };

  } catch (error: any) {
    console.error(`[TokyVideo] Page extraction error:`, error.message);
    return { 
      success: false, 
      error: `Extraction failed: ${error.message}`,
      errorType: 'unknown',
      requiresYtdlp: true 
    };
  }
}

async function tryEmbedExtraction(videoId: string): Promise<TokyVideoExtractionResult> {
  const embedUrls = [
    `https://tokyvideo.com/embed/${videoId}`,
    `https://www.tokyvideo.com/embed/${videoId}`,
  ];

  for (const embedUrl of embedUrls) {
    console.log(`[TokyVideo] Trying embed URL: ${embedUrl}`);
    
    try {
      const { data, statusCode } = await makeRequest(embedUrl);
      
      if (statusCode === 404) {
        continue;
      }
      
      if (statusCode !== 200) {
        console.log(`[TokyVideo] Embed returned status ${statusCode}`);
        continue;
      }

      const sourcePatterns = [
        /<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/gi,
        /file:\s*["']([^"']+\.mp4[^"']*)["']/gi,
        /source:\s*["']([^"']+\.mp4[^"']*)["']/gi,
        /["']file["']\s*:\s*["']([^"']+\.mp4[^"']*)["']/gi,
      ];

      for (const pattern of sourcePatterns) {
        const match = pattern.exec(data);
        if (match && match[1]) {
          let quality = 'unknown';
          const qualityMatch = match[1].match(/(\d+)p?/);
          if (qualityMatch) {
            quality = qualityMatch[1] + 'p';
          }
          
          console.log(`[TokyVideo] Found video in embed: ${quality}`);
          return { 
            success: true, 
            videoUrl: match[1],
            quality 
          };
        }
      }
    } catch (error: any) {
      console.log(`[TokyVideo] Embed extraction failed: ${error.message}`);
    }
  }

  return { 
    success: false, 
    error: 'Embed extraction failed',
    requiresYtdlp: true 
  };
}

export async function extractTokyVideoDirectUrl(url: string): Promise<TokyVideoExtractionResult> {
  console.log(`[TokyVideo] Starting extraction for: ${url}`);
  
  const cached = urlCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[TokyVideo] Using cached URL (${cached.quality})`);
    return { success: true, videoUrl: cached.url, quality: cached.quality };
  }

  const videoId = extractTokyVideoId(url);
  
  if (videoId) {
    console.log(`[TokyVideo] Extracted video ID: ${videoId}`);
    
    const embedResult = await tryEmbedExtraction(videoId);
    if (embedResult.success && embedResult.videoUrl) {
      urlCache.set(url, { 
        url: embedResult.videoUrl, 
        timestamp: Date.now(),
        quality: embedResult.quality || 'unknown'
      });
      return embedResult;
    }
    
    if (embedResult.errorType && embedResult.errorType !== 'unknown') {
      return embedResult;
    }
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
  
  return pageResult;
}

export function clearTokyVideoCache(): void {
  urlCache.clear();
  console.log('[TokyVideo] Cache cleared');
}
