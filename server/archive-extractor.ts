export interface ArchiveExtractionResult {
  success: boolean;
  directUrl?: string;
  quality?: string;
  availableQualities?: string[];
  error?: 'invalid-url' | 'not-found' | 'no-video' | 'timeout' | 'server-error';
  errorMessage?: string;
}

const urlCache = new Map<string, { urls: Record<string, string>; expires: number }>();
const CACHE_TTL = 3600000; // 1 hour (Archive.org URLs are stable)

function getCachedUrls(identifier: string): Record<string, string> | null {
  const cached = urlCache.get(identifier);
  if (cached && cached.expires > Date.now()) {
    return cached.urls;
  }
  if (cached) {
    urlCache.delete(identifier);
  }
  return null;
}

function cacheUrls(identifier: string, urls: Record<string, string>): void {
  urlCache.set(identifier, {
    urls,
    expires: Date.now() + CACHE_TTL
  });
}

export function isArchiveUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'archive.org' || parsedUrl.hostname === 'www.archive.org';
  } catch {
    return false;
  }
}

function extractIdentifier(url: string): string | null {
  const patterns = [
    /archive\.org\/details\/([^\/\?]+)/,
    /archive\.org\/download\/([^\/\?]+)/,
    /archive\.org\/embed\/([^\/\?]+)/
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
    if (urls['original']) {
      return { url: urls['original'], quality: 'original' };
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

export async function extractArchiveDirectUrl(archiveUrl: string, preferredQuality: string = 'best'): Promise<ArchiveExtractionResult> {
  try {
    if (!isArchiveUrl(archiveUrl)) {
      return {
        success: false,
        error: 'invalid-url',
        errorMessage: 'URL must be from archive.org domain'
      };
    }

    const identifier = extractIdentifier(archiveUrl);
    if (!identifier) {
      return {
        success: false,
        error: 'invalid-url',
        errorMessage: 'Could not extract item identifier from URL'
      };
    }

    console.log(`[Archive.org] Extracting identifier: ${identifier}`);

    const cachedUrls = getCachedUrls(identifier);
    if (cachedUrls) {
      console.log(`[Archive.org] Using cached URLs for ${identifier}`);
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const metadataUrl = `https://archive.org/metadata/${identifier}`;
      console.log(`[Archive.org] Fetching metadata from: ${metadataUrl}`);

      const response = await fetch(metadataUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: 'not-found',
            errorMessage: 'Item not found on Archive.org'
          };
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const metadata = await response.json();
      
      if (!metadata.files || !Array.isArray(metadata.files)) {
        return {
          success: false,
          error: 'no-video',
          errorMessage: 'No files found in this Archive.org item'
        };
      }

      const videoFormats = ['mp4', 'mpeg4', 'ogv', 'webm', 'avi', 'mkv', 'mov'];
      const derivativeFormats = ['h.264', 'mpeg4', '512kb'];
      
      const urls: Record<string, string> = {};
      
      for (const file of metadata.files) {
        const name = file.name?.toLowerCase() || '';
        const format = file.format?.toLowerCase() || '';
        
        const isVideo = videoFormats.some(fmt => name.endsWith(`.${fmt}`)) ||
                       derivativeFormats.some(fmt => format.includes(fmt));
        
        if (isVideo && file.name) {
          const directUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(file.name)}`;
          
          if (name.includes('1080') || format.includes('1080')) {
            urls['1080p'] = directUrl;
          } else if (name.includes('720') || format.includes('720')) {
            urls['720p'] = directUrl;
          } else if (name.includes('480') || format.includes('480') || format.includes('512kb')) {
            urls['480p'] = directUrl;
          } else if (name.includes('360') || format.includes('360')) {
            urls['360p'] = directUrl;
          } else if (name.includes('240') || format.includes('240')) {
            urls['240p'] = directUrl;
          } else if (file.source === 'original' || format.includes('mpeg4')) {
            urls['original'] = directUrl;
          } else if (!urls['other']) {
            urls['other'] = directUrl;
          }
        }
      }

      if (Object.keys(urls).length === 0) {
        return {
          success: false,
          error: 'no-video',
          errorMessage: 'No video files found in this Archive.org item'
        };
      }

      cacheUrls(identifier, urls);
      console.log(`[Archive.org] Found ${Object.keys(urls).length} video qualities: ${Object.keys(urls).join(', ')}`);

      const selected = selectQualityUrl(urls, preferredQuality);
      if (selected) {
        return { 
          success: true, 
          directUrl: selected.url,
          quality: selected.quality,
          availableQualities: Object.keys(urls)
        };
      }

      return {
        success: false,
        error: 'no-video',
        errorMessage: 'Could not select appropriate video quality'
      };

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return {
          success: false,
          error: 'timeout',
          errorMessage: 'Request timed out while fetching Archive.org metadata'
        };
      }
      throw fetchError;
    }

  } catch (error: any) {
    console.error('[Archive.org] Error extracting video URL:', error.message || error);
    return {
      success: false,
      error: 'server-error',
      errorMessage: error.message || 'Unknown error occurred'
    };
  }
}
