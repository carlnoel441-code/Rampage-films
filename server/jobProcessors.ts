// Job Processors - Execute different types of background jobs
// Each processor handles a specific job type (video download, AI dubbing, etc.)

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { finished } from 'stream/promises';
import { JobQueue, type VideoDownloadMetadata } from './jobQueue';
import { storage } from './storage';
import { ObjectStorageService } from './objectStorage';
import { r2StorageService } from './r2Storage';
import type { Job } from '@shared/schema';
import FormData from 'form-data';
import { extractOkRuDirectUrl } from './okru-extractor';
import { extractDailymotionDirectUrl } from './dailymotion-extractor';
import { extractVKDirectUrl, isVKUrl, extractVKVideoId } from './vk-extractor';
import { extractTokyVideoDirectUrl, isTokyVideoUrl } from './tokyvideo-extractor';
import { extractArchiveDirectUrl, isArchiveUrl } from './archive-extractor';
import { extractRumbleDirectUrl, isRumbleUrl } from './rumble-extractor';

// Bundled binary paths for production (Nix tools not available in deployed environment)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);
const BUNDLED_BIN_DIR = path.join(__dirnameLocal, 'bin');
const BUNDLED_YTDLP = path.join(BUNDLED_BIN_DIR, 'yt-dlp');
const BUNDLED_ARIA2C = path.join(BUNDLED_BIN_DIR, 'aria2c');

// Get the correct binary path - prefer bundled, fallback to system
function getYtDlpPath(): string {
  if (fs.existsSync(BUNDLED_YTDLP)) {
    return BUNDLED_YTDLP;
  }
  return 'yt-dlp'; // Fall back to system PATH
}

function getAria2cPath(): string {
  if (fs.existsSync(BUNDLED_ARIA2C)) {
    return BUNDLED_ARIA2C;
  }
  return 'aria2c'; // Fall back to system PATH
}

// Log binary availability at startup
console.log(`[JobProcessors] Bundled yt-dlp: ${fs.existsSync(BUNDLED_YTDLP) ? 'FOUND' : 'NOT FOUND'}`);
console.log(`[JobProcessors] Bundled aria2c: ${fs.existsSync(BUNDLED_ARIA2C) ? 'FOUND' : 'NOT FOUND'}`);

/**
 * Convert VK video URLs to mobile format for better yt-dlp compatibility
 * vkvideo.ru URLs fail with old yt-dlp, but m.vk.com works
 */
function convertVkToMobileUrl(url: string): string {
  if (!isVKUrl(url)) return url;
  
  const videoId = extractVKVideoId(url);
  if (!videoId) return url;
  
  // Convert to mobile VK URL format which works better with yt-dlp
  const mobileUrl = `https://m.vk.com/video${videoId.oid}_${videoId.id}`;
  console.log(`[VideoDownload] Converting VK URL to mobile format: ${url} -> ${mobileUrl}`);
  return mobileUrl;
}

const objectStorageService = new ObjectStorageService();

/**
 * Check video codec and remux if necessary for browser compatibility
 * Browsers support: H.264 (avc1), VP9, AAC, MP3, Opus, Vorbis
 * Browsers DON'T support: HEVC (h265), AV1 (limited), VP8 in MP4
 */
async function ensureBrowserCompatibleCodec(inputFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // First, probe the file to check codecs
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'csv=p=0',
      inputFile
    ]);
    
    let videoCodec = '';
    ffprobe.stdout.on('data', (data) => {
      videoCodec += data.toString().trim();
    });
    
    ffprobe.on('close', async (code) => {
      if (code !== 0) {
        console.log(`[VideoCodec] ffprobe failed, assuming file is compatible`);
        return resolve(inputFile);
      }
      
      // Clean up codec string (remove newlines, extra whitespace)
      videoCodec = videoCodec.split('\n')[0].trim().toLowerCase();
      console.log(`[VideoCodec] Detected video codec: ${videoCodec}`);
      
      // Browser-compatible codecs
      const compatibleCodecs = ['h264', 'avc1', 'vp9', 'vp8', 'mpeg4', 'msmpeg4v3'];
      
      if (compatibleCodecs.includes(videoCodec)) {
        console.log(`[VideoCodec] Codec ${videoCodec} is browser-compatible`);
        return resolve(inputFile);
      }
      
      // Need to re-encode for HEVC/H.265 or other incompatible codecs
      if (videoCodec === 'hevc' || videoCodec === 'h265' || videoCodec === 'av1') {
        console.log(`[VideoCodec] Codec ${videoCodec} is not browser-compatible, transcoding to H.264...`);
        
        const outputFile = inputFile.replace(/\.mp4$/, '_h264.mp4');
        
        const ffmpeg = spawn('ffmpeg', [
          '-i', inputFile,
          '-c:v', 'libx264',        // Re-encode video to H.264
          '-preset', 'fast',         // Faster encoding
          '-crf', '23',              // Quality (lower = better, 23 is default)
          '-c:a', 'aac',             // AAC audio
          '-b:a', '128k',            // Audio bitrate
          '-movflags', '+faststart', // Web-optimized
          '-y',                       // Overwrite
          outputFile
        ]);
        
        ffmpeg.stderr.on('data', (data) => {
          const line = data.toString();
          if (line.includes('frame=')) {
            process.stdout.write(`[VideoCodec] Transcoding: ${line.trim()}\r`);
          }
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log(`\n[VideoCodec] Transcoding complete: ${outputFile}`);
            // Replace original with transcoded version
            fs.unlink(inputFile, () => {
              fs.rename(outputFile, inputFile, (err) => {
                if (err) {
                  console.error(`[VideoCodec] Failed to replace original:`, err);
                  resolve(outputFile);
                } else {
                  console.log(`[VideoCodec] Replaced original with H.264 version`);
                  resolve(inputFile);
                }
              });
            });
          } else {
            console.error(`[VideoCodec] Transcoding failed with code ${code}`);
            resolve(inputFile); // Continue with original
          }
        });
        
        ffmpeg.on('error', (err) => {
          console.error(`[VideoCodec] ffmpeg error:`, err);
          resolve(inputFile); // Continue with original
        });
      } else {
        // Unknown codec, try to remux to ensure MP4 container is valid
        console.log(`[VideoCodec] Unknown codec ${videoCodec}, remuxing to ensure valid MP4...`);
        
        const outputFile = inputFile.replace(/\.mp4$/, '_remux.mp4');
        
        const ffmpeg = spawn('ffmpeg', [
          '-i', inputFile,
          '-c', 'copy',              // Copy without re-encoding
          '-movflags', '+faststart', // Web-optimized
          '-y',
          outputFile
        ]);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log(`[VideoCodec] Remux complete`);
            fs.unlink(inputFile, () => {
              fs.rename(outputFile, inputFile, (err) => {
                resolve(err ? outputFile : inputFile);
              });
            });
          } else {
            resolve(inputFile);
          }
        });
        
        ffmpeg.on('error', () => resolve(inputFile));
      }
    });
    
    ffprobe.on('error', () => resolve(inputFile));
  });
}

// Configuration
const MAX_FILE_SIZE_MB = 4096; // 4GB limit for external sources
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const TRUSTED_MAX_FILE_SIZE_MB = 10240; // 10GB limit for R2/trusted sources (dubbing)
const TRUSTED_MAX_FILE_SIZE_BYTES = TRUSTED_MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Decode HTML entities in URLs - Ok.ru and other platforms often return URLs with encoded ampersands
 */
function decodeHtmlEntities(url: string): string {
  return url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Check if URL is a direct video file based on extension or known video CDN hosts
 * This determines whether to use aria2c (direct) or yt-dlp (platform)
 */
function isDirectVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v', '.flv'];
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check for video file extension
    if (videoExtensions.some(ext => pathname.endsWith(ext))) {
      return true;
    }
    
    // Archive.org CDN hosts (iaNNNN.us.archive.org) serve direct video files
    if (hostname.includes('archive.org') && pathname.includes('/download/')) {
      return true;
    }
    
    // Ok.ru CDN hosts - these are direct video streams without file extensions
    // Patterns: vdXX.mycdn.me, cdnXX.okcdn.ru, st.okcdn.ru
    if (hostname.includes('.mycdn.me') || hostname.includes('.okcdn.ru')) {
      console.log(`[DubbingDownload] Detected Ok.ru CDN URL: ${hostname}`);
      return true;
    }
    
    // VK CDN hosts - direct video streams
    // Patterns: psv*.vkuservideo.net, vkvd*.vk-cdn.net, vk.com/video_...
    if (hostname.includes('vkuservideo.net') || hostname.includes('vk-cdn.net')) {
      console.log(`[DubbingDownload] Detected VK CDN URL: ${hostname}`);
      return true;
    }
    
    // Dailymotion CDN hosts
    if (hostname.includes('dmcdn.net')) {
      console.log(`[DubbingDownload] Detected Dailymotion CDN URL: ${hostname}`);
      return true;
    }
    
    // Rumble CDN hosts
    if (hostname.includes('rumble.com') && pathname.includes('/video/')) {
      console.log(`[DubbingDownload] Detected Rumble CDN URL: ${hostname}`);
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if URL is from Archive.org (needs special redirect handling)
 */
function isArchiveCdnUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return hostname.includes('archive.org');
  } catch {
    return false;
  }
}

/**
 * Get file size from URL using HEAD request with redirect limit
 */
async function getFileSizeFromUrl(url: string, maxRedirects: number = 5): Promise<number | null> {
  return new Promise((resolve) => {
    // Prevent infinite redirect loops
    if (maxRedirects <= 0) {
      console.log(`[VideoDownload] Max redirects reached for HEAD request`);
      return resolve(null);
    }
    
    const client = url.startsWith('https') ? https : http;
    
    const urlObj = new URL(url);
    const options = {
      method: 'HEAD',
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RampageFilms/1.0)'
      }
    };
    
    const request = client.request(options, (response) => {
      // Handle all redirect status codes (3xx)
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        const redirectLocation = response.headers.location;
        if (redirectLocation) {
          try {
            // Handle both absolute and relative redirects
            const redirectUrl = new URL(redirectLocation, url).toString();
            return getFileSizeFromUrl(redirectUrl, maxRedirects - 1).then(resolve);
          } catch (err) {
            // Malformed redirect URL - treat as no size available
            return resolve(null);
          }
        }
      }
      
      const contentLength = response.headers['content-length'];
      if (contentLength) {
        resolve(parseInt(contentLength, 10));
      } else {
        resolve(null);
      }
    });
    
    request.on('error', () => resolve(null));
    request.setTimeout(10000, () => {
      request.destroy();
      resolve(null);
    });
    request.end();
  });
}

/**
 * Format bytes per second to human readable speed
 */
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
  } else if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
  }
  return `${bytesPerSecond.toFixed(0)} B/s`;
}

/**
 * Format seconds to human readable ETA
 */
function formatETA(seconds: number): string {
  if (seconds < 60) {
    return `${Math.ceil(seconds)}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}

/**
 * Progress callback with speed and ETA info
 */
type ProgressCallback = (
  percent: number, 
  downloaded: number, 
  total: number | null,
  speed?: number,      // bytes per second
  eta?: number         // seconds remaining
) => void;

/**
 * Download file from URL using Node.js http/https module with progress tracking
 * More reliable than fetch for server-side downloads
 * @param trustedSource - If true, uses higher file size limit (10GB vs 4GB) for R2/internal sources
 */
async function downloadFile(
  url: string, 
  destinationPath: string,
  onProgress?: ProgressCallback,
  trustedSource: boolean = false
): Promise<void> {
  const maxSizeBytes = trustedSource ? TRUSTED_MAX_FILE_SIZE_BYTES : MAX_FILE_SIZE_BYTES;
  const maxSizeMB = trustedSource ? TRUSTED_MAX_FILE_SIZE_MB : MAX_FILE_SIZE_MB;
  
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (response) => {
      // Handle all redirect status codes (3xx)
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        const redirectLocation = response.headers.location;
        if (!redirectLocation) {
          return reject(new Error('Redirect without location header'));
        }
        try {
          // Handle both absolute and relative redirects
          const redirectUrl = new URL(redirectLocation, url).toString();
          return downloadFile(redirectUrl, destinationPath, onProgress, trustedSource).then(resolve).catch(reject);
        } catch (err) {
          return reject(new Error(`Malformed redirect URL: ${redirectLocation}`));
        }
      }
      
      if (response.statusCode !== 200) {
        return reject(new Error(`Download failed with status ${response.statusCode}`));
      }
      
      const totalSize = response.headers['content-length'] 
        ? parseInt(response.headers['content-length'], 10) 
        : null;
      
      // Enforce size limit even after redirects
      if (totalSize && totalSize > maxSizeBytes) {
        const fileSizeMB = totalSize / 1024 / 1024;
        return reject(new Error(`File size (${fileSizeMB.toFixed(0)}MB) exceeds maximum allowed size (${maxSizeMB}MB)`));
      }
      
      let downloadedSize = 0;
      let lastReportedPercent = 0;
      let aborted = false;
      
      // Speed tracking
      let startTime = Date.now();
      let lastSpeedCheck = startTime;
      let lastDownloadedForSpeed = 0;
      let currentSpeed = 0;
      
      const fileStream = fs.createWriteStream(destinationPath);
      
      response.on('data', (chunk) => {
        if (aborted) return;
        
        downloadedSize += chunk.length;
        
        // Enforce size limit during streaming (catches chunked transfers without content-length)
        if (downloadedSize > maxSizeBytes) {
          aborted = true;
          const fileSizeMB = downloadedSize / 1024 / 1024;
          fileStream.destroy();
          response.destroy();
          fs.unlink(destinationPath, () => {}); // Clean up partial file
          return reject(new Error(`File size (${fileSizeMB.toFixed(0)}MB) exceeded maximum allowed size (${maxSizeMB}MB) during download`));
        }
        
        // Calculate speed every second
        const now = Date.now();
        const timeSinceLastCheck = (now - lastSpeedCheck) / 1000;
        if (timeSinceLastCheck >= 1) {
          const bytesSinceLastCheck = downloadedSize - lastDownloadedForSpeed;
          currentSpeed = bytesSinceLastCheck / timeSinceLastCheck;
          lastSpeedCheck = now;
          lastDownloadedForSpeed = downloadedSize;
        }
        
        if (onProgress && totalSize) {
          const percent = (downloadedSize / totalSize) * 100;
          // Report every 2% to avoid spam
          if (percent - lastReportedPercent >= 2 || percent === 100) {
            lastReportedPercent = Math.floor(percent);
            
            // Calculate ETA
            const remainingBytes = totalSize - downloadedSize;
            const eta = currentSpeed > 0 ? remainingBytes / currentSpeed : undefined;
            
            onProgress(percent, downloadedSize, totalSize, currentSpeed, eta);
          }
        }
      });
      
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        if (!aborted) {
          fileStream.close();
          resolve();
        }
      });
      
      fileStream.on('error', (err) => {
        if (!aborted) {
          fs.unlink(destinationPath, () => {}); // Clean up on error
          reject(err);
        }
      });
      
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Download file using aria2c for ultra-fast downloads
 * Uses 16 parallel connections (aria2c maximum) for 3-5x speed boost over single connection
 */
async function downloadFileWithAria2c(
  url: string,
  destinationPath: string,
  onProgress?: ProgressCallback
): Promise<void> {
  return new Promise((resolve, reject) => {
    const aria2c = spawn(getAria2cPath(), [
      // Connection optimizations (maximum parallelism)
      '--max-connection-per-server=16',   // Use 16 connections (aria2c maximum)
      '--split=16',                        // Split into 16 parts
      '--min-split-size=1M',               // Minimum 1MB per split (aria2c minimum)
      
      // Speed optimizations (safe enhancements)
      '--disk-cache=128M',                 // 128MB disk cache for faster writes
      '--file-allocation=none',            // Skip pre-allocation, start downloading immediately
      '--stream-piece-selector=inorder',   // Download pieces in order for faster playback start
      
      // Resume and reliability
      '--continue=true',                   // Resume support
      '--allow-overwrite=true',            // Overwrite existing files
      '--auto-file-renaming=false',        // Don't auto-rename
      '--max-file-not-found=5',            // Retry 5 times on 404
      '--max-tries=10',                    // More retry attempts for reliability
      '--retry-wait=3',                    // Wait 3s between retries
      '--timeout=120',                     // 2min timeout (allow slow connections)
      '--connect-timeout=30',              // 30s connect timeout
      
      // Output settings
      '--dir', path.dirname(destinationPath),  // Output directory
      '--out', path.basename(destinationPath), // Output filename
      url
    ]);

    let stderr = '';
    let lastProgress = 0;
    let aborted = false;

    // CRITICAL: Monitor actual file size on disk (format-independent, works for chunked transfers)
    // This catches oversized downloads even when aria2c reports "??" for unknown Content-Length
    const fileSizeMonitor = setInterval(async () => {
      if (aborted) {
        clearInterval(fileSizeMonitor);
        return;
      }
      
      try {
        // Check actual file size on disk (works even without Content-Length header)
        const stats = await fs.promises.stat(destinationPath);
        if (stats.size > MAX_FILE_SIZE_BYTES) {
          aborted = true;
          clearInterval(fileSizeMonitor);
          const fileSizeMB = stats.size / 1024 / 1024;
          console.error(`[aria2c] File size on disk (${fileSizeMB.toFixed(0)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE_MB}MB)`);
          aria2c.kill('SIGTERM');
          // Clean up partial file and aria2c control files
          fs.unlink(destinationPath, () => {});
          fs.unlink(`${destinationPath}.aria2`, () => {});
          reject(new Error(`File size (${fileSizeMB.toFixed(0)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE_MB}MB)`));
        }
      } catch (err) {
        // File doesn't exist yet, ignore
      }
    }, 1000); // Check every second

    aria2c.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[aria2c] ${output.trim()}`);

      // Parse progress from aria2c output for progress reporting
      // Format: [#abc123 1.2MiB/10.5MiB(11%) CN:16 DL:2.3MiB ETA:4s]
      const progressMatch = output.match(/\((\d+)%\)/);
      if (progressMatch && onProgress) {
        const percent = parseFloat(progressMatch[1]);
        
        // Extract downloaded/total from output (if available)
        const sizeMatch = output.match(/([\d.]+)(Ki|Mi|Gi)B\/([\d.]+)(Ki|Mi|Gi)B/);
        let downloaded = null;
        let total = null;
        
        if (sizeMatch) {
          const dlValue = parseFloat(sizeMatch[1]);
          const dlUnit = sizeMatch[2];
          const totalValue = parseFloat(sizeMatch[3]);
          const totalUnit = sizeMatch[4];
          
          // Convert to bytes
          const unitMultipliers: Record<string, number> = { Ki: 1024, Mi: 1024 * 1024, Gi: 1024 * 1024 * 1024 };
          downloaded = dlValue * unitMultipliers[dlUnit];
          total = totalValue * unitMultipliers[totalUnit];
          
          // Secondary check: If total size is known and exceeds limit, abort immediately
          if (total && total > MAX_FILE_SIZE_BYTES && !aborted) {
            aborted = true;
            clearInterval(fileSizeMonitor);
            const fileSizeMB = total / 1024 / 1024;
            console.error(`[aria2c] Reported total size (${fileSizeMB.toFixed(0)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE_MB}MB)`);
            aria2c.kill('SIGTERM');
            fs.unlink(destinationPath, () => {});
            fs.unlink(`${destinationPath}.aria2`, () => {});
            reject(new Error(`File size (${fileSizeMB.toFixed(0)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE_MB}MB)`));
            return;
          }
        }
        
        // Extract download speed (DL:2.3MiB or DL:500KiB)
        let speed: number | undefined;
        const speedMatch = output.match(/DL:([\d.]+)(Ki|Mi|Gi)?B/);
        if (speedMatch) {
          const speedValue = parseFloat(speedMatch[1]);
          const speedUnit = speedMatch[2] || '';
          const unitMultipliers: Record<string, number> = { '': 1, Ki: 1024, Mi: 1024 * 1024, Gi: 1024 * 1024 * 1024 };
          speed = speedValue * (unitMultipliers[speedUnit] || 1);
        }
        
        // Extract ETA (ETA:4s or ETA:1m30s or ETA:1h2m)
        let eta: number | undefined;
        const etaMatch = output.match(/ETA:((?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?)/);
        if (etaMatch) {
          const hours = parseInt(etaMatch[2] || '0', 10);
          const mins = parseInt(etaMatch[3] || '0', 10);
          const secs = parseInt(etaMatch[4] || '0', 10);
          eta = hours * 3600 + mins * 60 + secs;
        }
        
        // Report progress to callback
        if (percent > lastProgress + 1) {
          lastProgress = Math.floor(percent);
          onProgress(percent, downloaded || 0, total || null, speed, eta);
        }
      }
    });

    aria2c.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    aria2c.on('close', async (code) => {
      clearInterval(fileSizeMonitor); // Stop monitoring
      
      if (aborted) return; // Already handled abort
      
      if (code === 0) {
        // POST-DOWNLOAD SIZE CHECK: Final safeguard against oversize files
        try {
          const stats = await fs.promises.stat(destinationPath);
          if (stats.size > MAX_FILE_SIZE_BYTES) {
            const fileSizeMB = stats.size / 1024 / 1024;
            console.error(`[aria2c] Downloaded file size (${fileSizeMB.toFixed(0)}MB) exceeds limit`);
            await fs.promises.unlink(destinationPath);
            return reject(new Error(`File size (${fileSizeMB.toFixed(0)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE_MB}MB)`));
          }
        } catch (err: any) {
          return reject(new Error(`Failed to verify downloaded file: ${err.message}`));
        }
        
        console.log(`[aria2c] Download completed successfully`);
        resolve();
      } else {
        console.error(`[aria2c] Download failed with code ${code}`);
        console.error(`[aria2c] stderr: ${stderr}`);
        
        // Enhanced error detection - preserve original stderr and add helpful hints
        let errorMessage = stderr || 'Unknown error';
        if (stderr) {
          if (stderr.includes('max-connection-per-server') && stderr.includes('must be between 1 and 16')) {
            errorMessage += '\n→ Hint: aria2c connection limit exceeded (bug in code - should be fixed!)';
          } else if (stderr.includes('400') || stderr.includes('Bad Request')) {
            errorMessage += '\n→ Hint: Temporary download URL expired (will retry with fresh URL)';
          } else if (stderr.includes('403') || stderr.includes('Forbidden')) {
            errorMessage += '\n→ Hint: Download blocked by server (403 Forbidden)';
          } else if (stderr.includes('404') || stderr.includes('Not Found')) {
            errorMessage += '\n→ Hint: File not found (404)';
          }
        }
        
        // Clean up partial files
        fs.unlink(destinationPath, () => {});
        fs.unlink(`${destinationPath}.aria2`, () => {});
        reject(new Error(`aria2c exited with code ${code}: ${errorMessage}`));
      }
    });

    aria2c.on('error', (err) => {
      clearInterval(fileSizeMonitor);
      if (!aborted) {
        reject(err);
      }
    });
  });
}

/**
 * Download a video file with automatic fallback between methods
 * Tries: aria2c → Node HTTP → yt-dlp (in order of speed/reliability)
 * Each method is tried once; if all fail, throws the last error
 */
async function downloadWithFallback(
  url: string,
  destinationPath: string,
  onProgress?: ProgressCallback,
  logPrefix: string = '[Download]'
): Promise<{ method: string }> {
  const errors: { method: string; error: string }[] = [];
  
  // Method 1: Try aria2c (fastest with 16 parallel connections)
  console.log(`${logPrefix} Trying aria2c...`);
  try {
    await downloadFileWithAria2c(url, destinationPath, onProgress);
    return { method: 'aria2c' };
  } catch (err: any) {
    const errorMsg = err.message || 'Unknown error';
    console.warn(`${logPrefix} aria2c failed: ${errorMsg}`);
    errors.push({ method: 'aria2c', error: errorMsg });
    
    // Clean up any partial files
    try {
      await fs.promises.unlink(destinationPath).catch(() => {});
      await fs.promises.unlink(`${destinationPath}.aria2`).catch(() => {});
    } catch {}
  }
  
  // Method 2: Try basic Node HTTP download (simpler, more reliable for some servers)
  console.log(`${logPrefix} Trying Node HTTP download...`);
  try {
    await downloadFile(url, destinationPath, onProgress);
    return { method: 'node-http' };
  } catch (err: any) {
    const errorMsg = err.message || 'Unknown error';
    console.warn(`${logPrefix} Node HTTP failed: ${errorMsg}`);
    errors.push({ method: 'node-http', error: errorMsg });
    
    // Clean up any partial files
    try {
      await fs.promises.unlink(destinationPath).catch(() => {});
    } catch {}
  }
  
  // All methods failed - throw aggregated error
  const errorSummary = errors.map(e => `${e.method}: ${e.error}`).join(' | ');
  throw new Error(`All download methods failed: ${errorSummary}`);
}

/**
 * Download using yt-dlp with full fallback chain
 * Returns the path to the downloaded file
 */
async function downloadWithYtdlpFallback(
  url: string,
  destinationPath: string,
  jobQueue: JobQueue,
  jobId: string,
  logPrefix: string = '[Download]'
): Promise<{ method: string }> {
  return new Promise((resolve, reject) => {
    console.log(`${logPrefix} Using yt-dlp with aria2c...`);
    
    // Build yt-dlp arguments (OPTIMIZED for speed - safe settings)
    const ytDlpArgs = [
      '-f', 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
      '--merge-output-format', 'mp4',
      '--continue',
      '--no-mtime',
      '--min-sleep-interval', '1',          // Minimal sleep to avoid bot detection
      '--max-sleep-interval', '3',          // Normal backoff
      '--sleep-interval', '1',              // Light sleep between requests
      '--concurrent-fragments', '16',       // Download 16 fragments at once
      '--external-downloader', 'aria2c',
      '--external-downloader-args', '-x 16 -s 16 -k 1M --disk-cache=128M --file-allocation=none --max-tries=10 --retry-wait=3 --timeout=120 --stream-piece-selector=inorder',
      '--buffer-size', '128K',              // Larger buffer for speed
      '--http-chunk-size', '10M',           // Standard chunk size
      '--retries', '10',
      '--fragment-retries', '10',
    ];
    
    // Add cookies if available (for YouTube)
    const cookiesPath = '/tmp/youtube-cookies.txt';
    if (fs.existsSync(cookiesPath)) {
      console.log(`${logPrefix} Using YouTube cookies for authentication`);
      ytDlpArgs.push('--cookies', cookiesPath);
    }
    
    ytDlpArgs.push('-o', destinationPath, url);
    
    const ytDlp = spawn(getYtDlpPath(), ytDlpArgs);

    let stderr = '';
    let stdout = '';
    let lastProgress = 5;

    ytDlp.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(`${logPrefix} ${output.trim()}`);

      const progressMatch = output.match(/\[download\]\s+(\d+\.\d+)%/);
      if (progressMatch) {
        const downloadPercent = parseFloat(progressMatch[1]);
        const jobProgress = 5 + Math.floor(downloadPercent * 0.45);
        
        if (jobProgress > lastProgress + 2) {
          lastProgress = jobProgress;
          void jobQueue.updateProgress(jobId, jobProgress, {
            phase: 'downloading',
            downloadPercent,
            message: `Downloading: ${downloadPercent.toFixed(1)}%`
          }).catch(() => {});
        }
      }
    });

    ytDlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytDlp.on('close', (code) => {
      if (code === 0) {
        resolve({ method: 'yt-dlp' });
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr || stdout}`));
      }
    });

    ytDlp.on('error', (err) => {
      reject(err);
    });
  });
}


// Video Download Checkpoint System for resume support
type VideoDownloadPhase = 'download' | 'processing' | 'uploading' | 'completed';

interface VideoDownloadCheckpoint {
  completedPhases: VideoDownloadPhase[];
  lastPhase: VideoDownloadPhase;
  artifacts: {
    downloadedFileKey?: string;  // R2 key for downloaded video
    processedFileKey?: string;   // R2 key for codec-converted video
  };
}

function getVideoDownloadCheckpoint(job: Job): VideoDownloadCheckpoint | null {
  const detail = job.progressDetail as any;
  if (detail?.videoCheckpoint?.completedPhases) {
    return detail.videoCheckpoint as VideoDownloadCheckpoint;
  }
  return null;
}

function shouldSkipVideoPhase(phase: VideoDownloadPhase, checkpoint: VideoDownloadCheckpoint | null): boolean {
  if (!checkpoint) return false;
  return checkpoint.completedPhases.includes(phase);
}

async function saveVideoDownloadCheckpoint(jobId: string, checkpoint: VideoDownloadCheckpoint, jobQueue: JobQueue): Promise<void> {
  const phaseProgress: Record<VideoDownloadPhase, number> = {
    'download': 52,
    'processing': 55,
    'uploading': 85,
    'completed': 100
  };
  const progress = phaseProgress[checkpoint.lastPhase] || 0;
  await jobQueue.updateProgress(jobId, progress, { 
    phase: checkpoint.lastPhase, 
    videoCheckpoint: checkpoint,
    resumable: true 
  });
  console.log(`[VideoDownload] Checkpoint saved: ${checkpoint.lastPhase} (${progress}%)`);
}

/**
 * Process a video download job
 * Downloads video using yt-dlp and uploads to object storage
 * SUPPORTS CHECKPOINTING: Jobs can resume after restart from last completed phase
 */
export async function processVideoDownloadJob(
  job: Job,
  jobQueue: JobQueue
): Promise<void> {
  const metadata = job.metadata as VideoDownloadMetadata;
  // Support both sourceUrl (old) and videoUrl (new) for backwards compatibility
  const sourceUrl = metadata.sourceUrl || (metadata as any).videoUrl;

  if (!job.movieId) {
    throw new Error('Video download job requires movieId');
  }

  if (!sourceUrl) {
    throw new Error('Video download job requires a source URL (sourceUrl or videoUrl in metadata)');
  }

  // Check for existing checkpoint
  const existingCheckpoint = getVideoDownloadCheckpoint(job);
  if (existingCheckpoint) {
    console.log(`[VideoDownload] RESUMING job from checkpoint: ${existingCheckpoint.lastPhase} (completed: ${existingCheckpoint.completedPhases.join(', ')})`);
  } else {
    console.log(`[VideoDownload] Starting NEW job ${job.id} for movie ${job.movieId}`);
  }
  console.log(`[VideoDownload] Source: ${sourceUrl}`);
  
  // Check if R2 is configured for checkpointing
  if (!r2StorageService.isConfigured()) {
    console.warn(`[VideoDownload] WARNING: R2 not configured - checkpoints disabled. Downloads will restart from scratch if interrupted.`);
  }
  
  const checkpoint: VideoDownloadCheckpoint = existingCheckpoint || {
    completedPhases: [],
    lastPhase: 'download',
    artifacts: {}
  };

  // Immediately show progress with initial ETA estimate (will be refined later)
  await jobQueue.updateProgress(job.id, 1, { 
    phase: 'starting', 
    message: 'Preparing download - Estimated time: 2-5 minutes for typical movies'
  });

  // Check for YouTube/Vimeo URLs
  const isYouTubeUrl = sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be');
  const isVimeoUrl = sourceUrl.includes('vimeo.com');
  
  // Check if YouTube cookies are available
  const cookiesPath = '/tmp/youtube-cookies.txt';
  const hasCookies = isYouTubeUrl && fs.existsSync(cookiesPath);
  
  // Log YouTube status
  if (isYouTubeUrl) {
    if (hasCookies) {
      console.log(`[VideoDownload] YouTube URL detected with cookies available`);
      console.log(`[VideoDownload] Will attempt authenticated download using cookies...`);
    } else {
      console.log(`[VideoDownload] YouTube URL detected - attempting download without cookies`);
      console.log(`[VideoDownload] Note: Upload YouTube cookies in Admin Settings for better success rates`);
    }
  }
  
  // For Vimeo, log but still attempt
  if (isVimeoUrl) {
    console.log(`[VideoDownload] Vimeo URL detected - attempting download...`);
  }

  // Use /tmp for downloads - it has a separate, larger quota than workspace
  const downloadsBase = '/tmp/video-downloads';
  const tmpDir = `${downloadsBase}/job-${job.id}`;
  let tmpFile = path.join(tmpDir, `${job.movieId}.mp4`);

  // ROBUST DIRECTORY SETUP: Clean up ALL old downloads to maximize disk space
  try {
    // Step 1: Clean up old downloads from BOTH locations to free all disk space
    const cleanupLocations = ['/tmp/video-downloads', '/home/runner/workspace/.downloads'];
    for (const location of cleanupLocations) {
      if (fs.existsSync(location)) {
        try {
          const dirs = fs.readdirSync(location);
          for (const dir of dirs) {
            const dirPath = path.join(location, dir);
            try {
              fs.rmSync(dirPath, { recursive: true, force: true });
              console.log(`[VideoDownload] Cleaned up: ${dirPath}`);
            } catch {}
          }
        } catch {}
      }
    }
    
    // Step 2: Ensure base directory exists
    if (!fs.existsSync(downloadsBase)) {
      fs.mkdirSync(downloadsBase, { recursive: true });
    }
    
    // Step 3: Create fresh job directory
    fs.mkdirSync(tmpDir, { recursive: true });
    console.log(`[VideoDownload] Created job directory: ${tmpDir}`);
    
  } catch (dirError: any) {
    console.error(`[VideoDownload] Directory setup failed:`, dirError);
    throw new Error(`Failed to set up download directory: ${dirError.message}`);
  }

  try {
    // CHECKPOINT RESUME: Check if we can skip download/processing phases
    // Only use checkpoints if R2 is configured (needed to store/restore checkpoint artifacts)
    const canUseCheckpoints = r2StorageService.isConfigured();
    let resumedFromCheckpoint = false;
    let resumedFromDownloadCheckpoint = false;
    
    // Try to resume from processing checkpoint first (most progress saved)
    if (canUseCheckpoints && shouldSkipVideoPhase('processing', checkpoint) && checkpoint.artifacts.processedFileKey) {
      console.log(`[VideoDownload] RESUMING from processing checkpoint`);
      await jobQueue.updateProgress(job.id, 52, { phase: 'resuming', message: 'Resuming from checkpoint...' });
      
      const restored = await r2StorageService.downloadCheckpoint(checkpoint.artifacts.processedFileKey, tmpFile);
      if (restored && fs.existsSync(tmpFile)) {
        const fileStats = await fs.promises.stat(tmpFile);
        if (fileStats.size > 0) {
          console.log(`[VideoDownload] Restored processed video from checkpoint (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`);
          resumedFromCheckpoint = true;
        }
      }
    }
    
    // If processing checkpoint failed or doesn't exist, try download checkpoint
    if (!resumedFromCheckpoint && canUseCheckpoints && shouldSkipVideoPhase('download', checkpoint) && checkpoint.artifacts.downloadedFileKey) {
      console.log(`[VideoDownload] RESUMING from download checkpoint`);
      await jobQueue.updateProgress(job.id, 50, { phase: 'resuming', message: 'Resuming from download checkpoint...' });
      
      const restored = await r2StorageService.downloadCheckpoint(checkpoint.artifacts.downloadedFileKey, tmpFile);
      if (restored && fs.existsSync(tmpFile)) {
        const fileStats = await fs.promises.stat(tmpFile);
        if (fileStats.size > 0) {
          console.log(`[VideoDownload] Restored downloaded video from checkpoint (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`);
          resumedFromDownloadCheckpoint = true;
          
          // Still need to run processing phase
          await jobQueue.updateProgress(job.id, 52, { phase: 'processing', message: 'Checking video format...' });
          tmpFile = await ensureBrowserCompatibleCodec(tmpFile);
          
          const processedStats = await fs.promises.stat(tmpFile);
          console.log(`[VideoDownload] Final file size: ${(processedStats.size / 1024 / 1024).toFixed(2)} MB`);
          
          // Save processing checkpoint
          checkpoint.completedPhases = ['download', 'processing'];
          checkpoint.lastPhase = 'processing';
          checkpoint.artifacts.processedFileKey = await r2StorageService.uploadCheckpoint(job.id, 'processed_video.mp4', tmpFile);
          await saveVideoDownloadCheckpoint(job.id, checkpoint, jobQueue);
          console.log(`[VideoDownload] Processing checkpoint saved`);
          
          resumedFromCheckpoint = true; // Ready for upload
        }
      }
    }
    
    if (!resumedFromCheckpoint && !resumedFromDownloadCheckpoint && (checkpoint.artifacts.processedFileKey || checkpoint.artifacts.downloadedFileKey)) {
      console.log(`[VideoDownload] Failed to restore from checkpoint, restarting from scratch`);
      checkpoint.completedPhases = [];
      checkpoint.artifacts = {};
    }
    
    // Only run download/processing if not resumed from checkpoint
    if (!resumedFromCheckpoint) {
    
    // Step 0: Pre-download validation
    await jobQueue.updateProgress(job.id, 2, { phase: 'validating', message: 'Validating source...' });
    
    // Check if this is a supported platform URL and extract direct link
    let downloadUrl = sourceUrl;
    let platformExtracted = false;
    let platformName = '';
    
    // Check for Ok.ru
    if (sourceUrl.includes('ok.ru')) {
      platformName = 'Ok.ru';
      console.log(`[VideoDownload] Detected Ok.ru URL, extracting direct video link...`);
      await jobQueue.updateProgress(job.id, 3, { phase: 'validating', message: 'Extracting Ok.ru direct link...' });
      
      const extraction = await extractOkRuDirectUrl(sourceUrl);
      
      if (extraction.success && extraction.directUrl) {
        downloadUrl = extraction.directUrl;
        platformExtracted = true;
        console.log(`[VideoDownload] Successfully extracted Ok.ru direct URL`);
      } else {
        console.warn(`[VideoDownload] Ok.ru extraction failed: ${extraction.errorMessage}`);
        console.warn(`[VideoDownload] Falling back to yt-dlp for Ok.ru download`);
      }
    }
    // Check for Dailymotion
    else if (sourceUrl.includes('dailymotion.com') || sourceUrl.includes('dai.ly')) {
      platformName = 'Dailymotion';
      console.log(`[VideoDownload] Detected Dailymotion URL, extracting direct video link...`);
      await jobQueue.updateProgress(job.id, 3, { phase: 'validating', message: 'Extracting Dailymotion direct link...' });
      
      const extraction = await extractDailymotionDirectUrl(sourceUrl);
      
      if (extraction.success && extraction.directUrl) {
        downloadUrl = extraction.directUrl;
        platformExtracted = true;
        console.log(`[VideoDownload] Successfully extracted Dailymotion direct URL`);
      } else {
        console.warn(`[VideoDownload] Dailymotion extraction failed: ${extraction.errorMessage}`);
        
        // For Dailymotion, provide more specific error info
        if (extraction.error === 'geo-blocked') {
          throw new Error(`Dailymotion video is geo-blocked in this region. Try a different video or use an embedded player.`);
        }
        if (extraction.error === 'private') {
          throw new Error(`Dailymotion video is private. Only public videos can be downloaded.`);
        }
        if (extraction.error === 'not-found') {
          throw new Error(`Dailymotion video not found. The video may have been deleted.`);
        }
        
        console.warn(`[VideoDownload] Falling back to yt-dlp for Dailymotion download`);
      }
    }
    // Check for VK Video
    else if (isVKUrl(sourceUrl)) {
      platformName = 'VK';
      console.log(`[VideoDownload] Detected VK Video URL, extracting direct video link...`);
      await jobQueue.updateProgress(job.id, 3, { phase: 'validating', message: 'Extracting VK direct link...' });
      
      const extraction = await extractVKDirectUrl(sourceUrl);
      
      if (extraction.success && extraction.videoUrl) {
        downloadUrl = extraction.videoUrl;
        platformExtracted = true;
        console.log(`[VideoDownload] Successfully extracted VK direct URL (${extraction.quality || 'unknown quality'})`);
      } else {
        console.warn(`[VideoDownload] VK extraction failed: ${extraction.error}`);
        
        // For VK, provide more specific error info
        if (extraction.errorType === 'deleted') {
          throw new Error(`VK video has been deleted. The video is no longer available.`);
        }
        if (extraction.errorType === 'private') {
          throw new Error(`VK video is private. Only public videos can be downloaded.`);
        }
        if (extraction.errorType === 'login_required') {
          throw new Error(`VK video requires login. Only publicly accessible videos can be downloaded.`);
        }
        if (extraction.errorType === 'not_found') {
          throw new Error(`VK video not found. The video may have been deleted or the URL is invalid.`);
        }
        
        if (extraction.requiresYtdlp) {
          console.warn(`[VideoDownload] Falling back to yt-dlp for VK download`);
        }
      }
    }
    // Check for TokyVideo
    else if (isTokyVideoUrl(sourceUrl)) {
      platformName = 'TokyVideo';
      console.log(`[VideoDownload] Detected TokyVideo URL, extracting direct video link...`);
      await jobQueue.updateProgress(job.id, 3, { phase: 'validating', message: 'Extracting TokyVideo direct link...' });
      
      const extraction = await extractTokyVideoDirectUrl(sourceUrl);
      
      if (extraction.success && extraction.videoUrl) {
        downloadUrl = extraction.videoUrl;
        platformExtracted = true;
        console.log(`[VideoDownload] Successfully extracted TokyVideo direct URL (${extraction.quality || 'unknown quality'})`);
      } else {
        console.warn(`[VideoDownload] TokyVideo extraction failed: ${extraction.error}`);
        
        if (extraction.errorType === 'deleted') {
          throw new Error(`TokyVideo video has been deleted. The video is no longer available.`);
        }
        if (extraction.errorType === 'private') {
          throw new Error(`TokyVideo video is private. Only public videos can be downloaded.`);
        }
        if (extraction.errorType === 'not_found') {
          throw new Error(`TokyVideo video not found. The video may have been deleted or the URL is invalid.`);
        }
        
        if (extraction.requiresYtdlp) {
          console.warn(`[VideoDownload] Falling back to yt-dlp for TokyVideo download`);
        }
      }
    }
    // Check for Archive.org
    else if (isArchiveUrl(sourceUrl)) {
      platformName = 'Archive.org';
      console.log(`[VideoDownload] Detected Archive.org URL, extracting direct video link...`);
      await jobQueue.updateProgress(job.id, 3, { phase: 'validating', message: 'Extracting Archive.org direct link...' });
      
      const qualityPref = metadata.quality || 'best';
      const extraction = await extractArchiveDirectUrl(sourceUrl, qualityPref);
      
      if (extraction.success && extraction.directUrl) {
        downloadUrl = extraction.directUrl;
        platformExtracted = true;
        console.log(`[VideoDownload] Successfully extracted Archive.org direct URL (${extraction.quality || 'unknown quality'})`);
        if (extraction.availableQualities) {
          console.log(`[VideoDownload] Available qualities: ${extraction.availableQualities.join(', ')}`);
        }
      } else {
        console.warn(`[VideoDownload] Archive.org extraction failed: ${extraction.errorMessage}`);
        
        if (extraction.error === 'not-found') {
          throw new Error(`Archive.org item not found. The item may have been removed or the URL is invalid.`);
        }
        if (extraction.error === 'no-video') {
          throw new Error(`No video files found in this Archive.org item. It may only contain other file types.`);
        }
        
        console.warn(`[VideoDownload] Falling back to yt-dlp for Archive.org download`);
      }
    }
    // Check for Rumble
    else if (isRumbleUrl(sourceUrl)) {
      platformName = 'Rumble';
      console.log(`[VideoDownload] Detected Rumble URL, extracting direct video link...`);
      await jobQueue.updateProgress(job.id, 3, { phase: 'validating', message: 'Extracting Rumble direct link...' });
      
      const qualityPref = metadata.quality || 'best';
      const extraction = await extractRumbleDirectUrl(sourceUrl, qualityPref);
      
      if (extraction.success && extraction.directUrl) {
        downloadUrl = extraction.directUrl;
        platformExtracted = true;
        console.log(`[VideoDownload] Successfully extracted Rumble direct URL (${extraction.quality || 'unknown quality'})`);
        if (extraction.availableQualities) {
          console.log(`[VideoDownload] Available qualities: ${extraction.availableQualities.join(', ')}`);
        }
      } else {
        console.warn(`[VideoDownload] Rumble extraction failed: ${extraction.errorMessage}`);
        
        if (extraction.error === 'not-found') {
          throw new Error(`Rumble video not found. The video may have been removed or is private.`);
        }
        if (extraction.error === 'private') {
          throw new Error(`Rumble video is private. Only public videos can be downloaded.`);
        }
        
        console.warn(`[VideoDownload] Falling back to yt-dlp for Rumble download`);
      }
    }
    
    // Check if URL is a direct video file
    // IMPORTANT: Ok.ru and VK CDN URLs are IP-restricted and will fail with aria2c/node-http
    // These must use yt-dlp with the original page URL, not the extracted CDN URL
    const isIpRestrictedCdn = downloadUrl.includes('.okcdn.ru') || 
                               downloadUrl.includes('.mycdn.me') ||
                               downloadUrl.includes('vkuservideo.net') ||
                               downloadUrl.includes('vk-cdn.net');
    
    if (isIpRestrictedCdn) {
      console.log(`[VideoDownload] Detected IP-restricted CDN URL - will use yt-dlp with original URL`);
      // Reset to use yt-dlp path with original sourceUrl
      platformExtracted = false;
    }
    
    const isDirect = isDirectVideoUrl(downloadUrl) && !isIpRestrictedCdn;
    console.log(`[VideoDownload] Source type: ${isDirect ? 'Direct HTTP' : 'yt-dlp'}`);
    
    // For direct videos, check file size to prevent overload
    let estimatedFileSize: number | null = null;
    if (isDirect) {
      console.log(`[VideoDownload] Checking file size for direct video...`);
      const fileSize = await getFileSizeFromUrl(downloadUrl);
      
      if (fileSize) {
        estimatedFileSize = fileSize;
        const fileSizeMB = fileSize / 1024 / 1024;
        console.log(`[VideoDownload] File size: ${fileSizeMB.toFixed(2)} MB`);
        
        if (fileSize > MAX_FILE_SIZE_BYTES) {
          throw new Error(`File size (${fileSizeMB.toFixed(0)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE_MB}MB). Please use a smaller video.`);
        }
      } else {
        console.log(`[VideoDownload] Could not determine file size, proceeding with download`);
      }
    }

    // Calculate initial ETA estimate based on file size (assume ~3 MB/s average speed)
    const ESTIMATED_SPEED_BYTES_PER_SEC = 3 * 1024 * 1024; // 3 MB/s conservative estimate
    let initialEtaMessage = 'Starting download...';
    let initialEtaSeconds: number | undefined;
    
    if (estimatedFileSize) {
      initialEtaSeconds = Math.ceil(estimatedFileSize / ESTIMATED_SPEED_BYTES_PER_SEC);
      const fileSizeMB = (estimatedFileSize / 1024 / 1024).toFixed(1);
      initialEtaMessage = `Starting download (${fileSizeMB}MB) - Estimated time: ${formatETA(initialEtaSeconds)}`;
      console.log(`[VideoDownload] Initial ETA estimate: ${formatETA(initialEtaSeconds)} for ${fileSizeMB}MB file`);
    }

    // Update progress: Starting download with initial ETA
    await jobQueue.updateProgress(job.id, 5, { 
      phase: 'downloading', 
      message: initialEtaMessage,
      eta: initialEtaSeconds,
      estimatedFileSize: estimatedFileSize
    });

    // Smart download with automatic fallback for direct videos
    if (isDirect) {
      // Path 1: Direct video download with fallback chain (aria2c → Node HTTP)
      const downloadSource = platformExtracted ? `${platformName} (extracted)` : 'Direct MP4';
      console.log(`[VideoDownload] Starting download for ${downloadSource} with automatic fallback...`);
      
      const { method } = await downloadWithFallback(downloadUrl, tmpFile, (percent, downloaded, total, speed, eta) => {
        const jobProgress = 5 + Math.floor(percent * 0.45);
        const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
        const totalMB = total ? (total / 1024 / 1024).toFixed(1) : '?';
        
        // Build message with speed and ETA
        let message = `Downloading ${downloadSource}: ${downloadedMB}MB / ${totalMB}MB (${percent.toFixed(1)}%)`;
        if (speed && speed > 0) {
          message += ` @ ${formatSpeed(speed)}`;
        }
        if (eta && eta > 0) {
          message += ` - ETA: ${formatETA(eta)}`;
        }
        
        void jobQueue.updateProgress(job.id, jobProgress, {
          phase: 'downloading',
          downloadPercent: percent,
          speed: speed,
          eta: eta,
          message
        }).catch(err => console.error('[VideoDownload] Failed to update progress:', err));
      }, '[VideoDownload]');
      
      console.log(`[VideoDownload] Download complete for job ${job.id} using ${method}`);
      
    } else {
      // Path 2: yt-dlp download (for YouTube, Vimeo, and complex sources including platform fallbacks)
      // NOTE: yt-dlp creates .part files during download and .part-Frag files for fragments
      // On retry, --continue will resume from these partial files if they exist
      // This allows recovery from network failures or worker crashes mid-download
      let sourceType = 'External';
      if (platformName && !platformExtracted) {
        sourceType = `${platformName} (yt-dlp fallback)`;
      } else if (sourceUrl.includes('youtube') || sourceUrl.includes('youtu.be')) {
        sourceType = 'YouTube';
      } else if (sourceUrl.includes('vimeo')) {
        sourceType = 'Vimeo';
      } else if (sourceUrl.includes('dailymotion') || sourceUrl.includes('dai.ly')) {
        sourceType = 'Dailymotion';
      } else if (isVKUrl(sourceUrl)) {
        sourceType = 'VK';
      } else if (isTokyVideoUrl(sourceUrl)) {
        sourceType = 'TokyVideo';
      } else if (isArchiveUrl(sourceUrl)) {
        sourceType = 'Archive.org';
      } else if (isRumbleUrl(sourceUrl)) {
        sourceType = 'Rumble';
      }
      console.log(`[VideoDownload] Using yt-dlp for ${sourceType}`);
      console.log(`[VideoDownload] Downloading to ${tmpFile}...`);
      
      // Convert VK URLs to mobile format for better yt-dlp compatibility
      const ytdlpUrl = isVKUrl(sourceUrl) ? convertVkToMobileUrl(sourceUrl) : sourceUrl;
      
      // Try to get video info for initial ETA estimate (quick info fetch)
      let ytdlpEstimatedSize: number | null = null;
      let ytdlpDuration: number | null = null;
      try {
        const infoResult = await new Promise<{filesize?: number, duration?: number}>((resolve) => {
          const infoProcess = spawn(getYtDlpPath(), [
            '--dump-json',
            '--no-download',
            '-f', 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
            ytdlpUrl
          ]);
          
          let jsonOutput = '';
          let infoTimeout = setTimeout(() => {
            infoProcess.kill();
            resolve({});
          }, 10000); // 10 second timeout for info fetch
          
          infoProcess.stdout.on('data', (data) => {
            jsonOutput += data.toString();
          });
          
          infoProcess.on('close', () => {
            clearTimeout(infoTimeout);
            try {
              const info = JSON.parse(jsonOutput);
              resolve({
                filesize: info.filesize || info.filesize_approx,
                duration: info.duration
              });
            } catch {
              resolve({});
            }
          });
          
          infoProcess.on('error', () => {
            clearTimeout(infoTimeout);
            resolve({});
          });
        });
        
        if (infoResult.filesize) {
          ytdlpEstimatedSize = infoResult.filesize;
        }
        if (infoResult.duration) {
          ytdlpDuration = infoResult.duration;
        }
      } catch (err) {
        console.log(`[VideoDownload] Could not get video info for ETA estimate`);
      }
      
      // Update with initial ETA for yt-dlp downloads
      if (ytdlpEstimatedSize) {
        const ytdlpEtaSeconds = Math.ceil(ytdlpEstimatedSize / ESTIMATED_SPEED_BYTES_PER_SEC);
        const fileSizeMB = (ytdlpEstimatedSize / 1024 / 1024).toFixed(1);
        const durationStr = ytdlpDuration ? ` (${Math.floor(ytdlpDuration / 60)}m ${Math.floor(ytdlpDuration % 60)}s video)` : '';
        const initialMsg = `Starting ${sourceType} download (${fileSizeMB}MB${durationStr}) - Estimated time: ${formatETA(ytdlpEtaSeconds)}`;
        console.log(`[VideoDownload] Initial ETA for ${sourceType}: ${formatETA(ytdlpEtaSeconds)}`);
        await jobQueue.updateProgress(job.id, 5, { 
          phase: 'downloading', 
          message: initialMsg,
          eta: ytdlpEtaSeconds,
          estimatedFileSize: ytdlpEstimatedSize,
          videoDuration: ytdlpDuration
        });
      } else {
        await jobQueue.updateProgress(job.id, 5, { 
          phase: 'downloading', 
          message: `Starting ${sourceType} download...`
        });
      }
      if (ytdlpUrl !== sourceUrl) {
        console.log(`[VideoDownload] Using converted URL for yt-dlp: ${ytdlpUrl}`);
      }
      
      // Build quality-aware format selection
      const qualityPref = metadata.quality || 'best';
      let formatString = 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best';
      if (qualityPref === '720p') {
        formatString = 'best[height<=720][ext=mp4]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best';
        console.log(`[VideoDownload] Using 720p quality preference`);
      } else if (qualityPref === '480p') {
        formatString = 'best[height<=480][ext=mp4]/bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]/best';
        console.log(`[VideoDownload] Using 480p quality preference`);
      } else {
        console.log(`[VideoDownload] Using best quality`);
      }
      
      // Detect if source uses HLS (Ok.ru, some others) - aria2c doesn't work well with HLS fragments
      const isHlsSource = sourceUrl.includes('ok.ru') || sourceUrl.includes('odnoklassniki');
      
      // Build yt-dlp arguments array
      const ytDlpArgs = [
        // Format selection - quality-aware, prefer combined formats
        '-f', formatString,
        '--merge-output-format', 'mp4',
        
        // Don't fail on post-processing errors (HLS FixupM3u8 can fail with ffmpeg)
        '--fixup', 'warn',
        
        // Resume and retry support (more resilient)
        '--continue',             // Resume partial downloads using .part files
        '--no-mtime',             // Don't preserve file modification time
        '--retries', '10',        // Retry failed downloads 10 times
        '--fragment-retries', '10', // Retry failed fragments 10 times
        '--file-access-retries', '5', // Retry file access errors
        
        // Anti-rate-limiting
        '--min-sleep-interval', '1',
        '--max-sleep-interval', '3',
        '--sleep-interval', '1',
      ];
      
      // Use aria2c for non-HLS sources (VK, YouTube direct), use native for HLS (Ok.ru)
      if (isHlsSource) {
        console.log(`[VideoDownload] Using native downloader for HLS source (aria2c incompatible)`);
        ytDlpArgs.push('--concurrent-fragments', '8');  // Native concurrent downloads
        ytDlpArgs.push('--hls-prefer-native');  // Use native HLS downloader
      } else {
        // Performance optimizations with resilient aria2c settings for non-HLS
        ytDlpArgs.push(
          '--concurrent-fragments', '16',
          '--external-downloader', 'aria2c',
          '--external-downloader-args', '-x 16 -s 16 -k 1M --disk-cache=64M --file-allocation=none --max-tries=10 --retry-wait=3 --timeout=120',
          '--buffer-size', '64K',
          '--http-chunk-size', '10M'
        );
      }
      
      // Add cookies if available (for YouTube)
      const cookiesPath = '/tmp/youtube-cookies.txt';
      if (fs.existsSync(cookiesPath)) {
        console.log(`[VideoDownload] Using YouTube cookies for authenticated download`);
        ytDlpArgs.push('--cookies', cookiesPath);
      }
      
      // Add output and URL
      ytDlpArgs.push('-o', tmpFile, ytdlpUrl);
      
      await new Promise<void>((resolve, reject) => {
        const ytDlp = spawn(getYtDlpPath(), ytDlpArgs);

        let stderr = '';
        let lastProgress = 5;

        let stdout = '';
        
        ytDlp.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;  // Capture for error logging
          console.log(`[VideoDownload] ${output.trim()}`);

          // Parse download progress from yt-dlp output
          // Format: [download]  45.2% of 123.45MiB at 1.23MiB/s ETA 00:30
          const progressMatch = output.match(/\[download\]\s+(\d+\.\d+)%/);
          if (progressMatch) {
            const downloadPercent = parseFloat(progressMatch[1]);
            // Map download progress to 5-50% of total job progress
            const jobProgress = 5 + Math.floor(downloadPercent * 0.45);
            
            // Extract speed from yt-dlp output (at 1.23MiB/s or at 500KiB/s)
            let speed: number | undefined;
            const speedMatch = output.match(/at\s+([\d.]+)(Ki|Mi|Gi)?B\/s/);
            if (speedMatch) {
              const speedValue = parseFloat(speedMatch[1]);
              const speedUnit = speedMatch[2] || '';
              const unitMultipliers: Record<string, number> = { '': 1, Ki: 1024, Mi: 1024 * 1024, Gi: 1024 * 1024 * 1024 };
              speed = speedValue * (unitMultipliers[speedUnit] || 1);
            }
            
            // Extract ETA from yt-dlp output (ETA 00:30 or ETA 01:23:45)
            let eta: number | undefined;
            const etaMatch = output.match(/ETA\s+(\d+):(\d+)(?::(\d+))?/);
            if (etaMatch) {
              if (etaMatch[3]) {
                // Format: HH:MM:SS
                const hours = parseInt(etaMatch[1], 10);
                const mins = parseInt(etaMatch[2], 10);
                const secs = parseInt(etaMatch[3], 10);
                eta = hours * 3600 + mins * 60 + secs;
              } else {
                // Format: MM:SS
                const mins = parseInt(etaMatch[1], 10);
                const secs = parseInt(etaMatch[2], 10);
                eta = mins * 60 + secs;
              }
            }
            
            if (jobProgress > lastProgress + 2) { // Update every 2% to avoid spam
              lastProgress = jobProgress;
              
              // Build message with speed and ETA
              let message = `Downloading: ${downloadPercent.toFixed(1)}%`;
              if (speed && speed > 0) {
                message += ` @ ${formatSpeed(speed)}`;
              }
              if (eta && eta > 0) {
                message += ` - ETA: ${formatETA(eta)}`;
              }
              
              void jobQueue.updateProgress(job.id, jobProgress, {
                phase: 'downloading',
                downloadPercent,
                speed,
                eta,
                message
              }).catch(err => console.error('[VideoDownload] Failed to update progress:', err));
            }
          }
        });

        ytDlp.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        ytDlp.on('close', (code) => {
          if (code === 0) {
            console.log(`[VideoDownload] yt-dlp completed successfully for job ${job.id}`);
            resolve();
          } else {
            console.error(`[VideoDownload] yt-dlp failed for job ${job.id} with code ${code}`);
            console.error(`[VideoDownload] Source URL: ${sourceUrl}`);
            console.error(`[VideoDownload] stdout: ${stdout}`);
            console.error(`[VideoDownload] stderr: ${stderr}`);
            
            // Enhanced error detection - preserve original stderr and add helpful hints
            let errorMessage = stderr || 'Unknown error';
            if (stderr) {
              if (stderr.includes('403') && stderr.includes('Forbidden')) {
                const platformHint = sourceUrl.includes('youtube') || sourceUrl.includes('youtu.be') 
                  ? 'YouTube 403 error - try refreshing cookies in Admin Settings.' 
                  : 'Platform may be blocking downloads.';
                errorMessage += `\n→ Hint: Download blocked (403 Forbidden). ${platformHint}`;
              } else if (stderr.includes('404') && stderr.includes('Not Found')) {
                errorMessage += '\n→ Hint: Video not found (404). Video may have been removed or is private.';
              } else if (stderr.includes('Unable to extract')) {
                errorMessage += '\n→ Hint: Failed to extract video URL. Platform structure may have changed.';
              } else if (stderr.includes('aria2c') && stderr.includes('max-connection-per-server')) {
                errorMessage += '\n→ Hint: aria2c configuration error (this should not happen - please report this bug)';
              }
            }
            
            reject(new Error(`yt-dlp exited with code ${code}: ${errorMessage}`));
          }
        });

        ytDlp.on('error', (err) => {
          reject(err);
        });
      });
    }

    console.log(`[VideoDownload] Download complete for job ${job.id}`);
    
    // CHECKPOINT: Save after download to enable resume before processing (only if R2 is configured)
    if (canUseCheckpoints) {
      checkpoint.completedPhases = ['download'];
      checkpoint.lastPhase = 'download';
      // Save downloaded file so we can resume from here if restart happens before processing completes
      checkpoint.artifacts.downloadedFileKey = await r2StorageService.uploadCheckpoint(job.id, 'downloaded_video.mp4', tmpFile);
      await saveVideoDownloadCheckpoint(job.id, checkpoint, jobQueue);
      console.log(`[VideoDownload] Download checkpoint saved`);
    }
    
    await jobQueue.updateProgress(job.id, 52, { phase: 'processing', message: 'Checking video format...' });

    // Check if file exists and has size
    let fileStats = await fs.promises.stat(tmpFile);
    if (fileStats.size === 0) {
      throw new Error('Downloaded file is empty');
    }
    console.log(`[VideoDownload] Downloaded file size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Ensure video codec is browser-compatible (H.264, VP9, etc)
    // This will transcode HEVC/H.265/AV1 to H.264 if needed
    await jobQueue.updateProgress(job.id, 53, { phase: 'processing', message: 'Verifying browser compatibility...' });
    tmpFile = await ensureBrowserCompatibleCodec(tmpFile);
    
    // Update file stats after potential transcoding
    fileStats = await fs.promises.stat(tmpFile);
    console.log(`[VideoDownload] Final file size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // CHECKPOINT: Save after processing to enable resume before upload (only if R2 is configured)
    if (canUseCheckpoints) {
      checkpoint.completedPhases.push('download', 'processing');
      checkpoint.lastPhase = 'processing';
      // Only save processed file (not downloaded) to reduce storage usage
      checkpoint.artifacts.processedFileKey = await r2StorageService.uploadCheckpoint(job.id, 'processed_video.mp4', tmpFile);
      await saveVideoDownloadCheckpoint(job.id, checkpoint, jobQueue);
      console.log(`[VideoDownload] Processing checkpoint saved - can resume from here`);
    }
    
    } // End of download/processing block (skipped if resuming from checkpoint)
    
    await jobQueue.updateProgress(job.id, 55, { phase: 'uploading', message: 'Preparing to upload...' });

    // Upload to object storage (prefer R2 for zero egress fees)
    const useR2 = r2StorageService.isConfigured();
    const storageType = useR2 ? 'Cloudflare R2' : 'Replit Object Storage';
    console.log(`[VideoDownload] Uploading to ${storageType}...`);
    await jobQueue.updateProgress(job.id, 60, { phase: 'uploading', message: `Uploading to ${storageType}...` });

    const sanitizedFileName = `${job.movieId}-${Date.now()}`;
    let objectKey: string;
    
    if (useR2) {
      // Use Cloudflare R2 (zero egress fees!) with progress tracking
      let lastUploadProgress = 60;
      
      objectKey = await r2StorageService.uploadVideoFromFile(tmpFile, sanitizedFileName, 
        (percent, uploaded, total, speed, eta) => {
          // Map upload progress from 60-85% of total job progress
          const uploadJobProgress = 60 + Math.floor(percent * 0.25);
          
          // Only update every 2% to avoid spam
          if (uploadJobProgress > lastUploadProgress + 2 || percent >= 100) {
            lastUploadProgress = uploadJobProgress;
            
            // Build message with speed and ETA
            let message = `Uploading to R2: ${percent.toFixed(1)}%`;
            if (speed && speed > 0) {
              message += ` @ ${formatSpeed(speed)}`;
            }
            if (eta !== null && eta > 0) {
              message += ` - ETA: ${formatETA(eta)}`;
            }
            
            void jobQueue.updateProgress(job.id, uploadJobProgress, {
              phase: 'uploading',
              uploadPercent: percent,
              speed,
              eta,
              message
            }).catch(err => console.error('[VideoDownload] Failed to update upload progress:', err));
          }
        }
      );
      console.log(`[VideoDownload] R2 upload complete: ${objectKey}`);
    } else {
      // Fallback to Replit Object Storage
      const readStream = fs.createReadStream(tmpFile);
      objectKey = await objectStorageService.storeVideoStream(readStream, sanitizedFileName);
      console.log(`[VideoDownload] Replit upload complete: ${objectKey}`);
    }

    console.log(`[VideoDownload] Upload complete, hosted at: ${objectKey}`);
    await jobQueue.updateProgress(job.id, 85, { phase: 'finalizing', message: 'Updating database...' });

    // Update movie record
    await storage.updateMovie({
      id: job.movieId,
      hostedAssetKey: objectKey,
      transcodingStatus: 'completed',
      transcodingError: null,
      transcodingUpdatedAt: new Date(),
    });

    console.log(`[VideoDownload] Updated movie ${job.movieId} with hosted asset`);
    await jobQueue.updateProgress(job.id, 95, { phase: 'cleanup', message: 'Cleaning up temporary files...' });

    // Cleanup temporary files
    try {
      await fs.promises.unlink(tmpFile);
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
      console.log(`[VideoDownload] Cleaned up temporary files for job ${job.id}`);
    } catch (cleanupError) {
      console.warn(`[VideoDownload] Non-critical cleanup error for job ${job.id}:`, cleanupError);
    }

    console.log(`[VideoDownload] Job ${job.id} completed successfully`);
    await jobQueue.updateProgress(job.id, 100, { phase: 'completed', message: 'Download and hosting complete!' });

  } catch (error: any) {
    console.error(`[VideoDownload] Error in job ${job.id}:`, error);
    console.error(`[VideoDownload] Error stack:`, error.stack);
    
    // IMPORTANT: Do NOT cleanup temp files here!
    // Preserve partial downloads across ALL retries (whether yt-dlp failed or upload failed)
    // The temp directory will be cleaned up by jobQueue.failJob() when retries are exhausted
    console.log(`[VideoDownload] Preserving temp directory ${tmpDir} for retry (--continue enabled)`);

    // Determine if this is a terminal failure (no more retries will happen)
    // Two cases: (1) max retries exhausted, (2) non-retryable error
    const hasExhaustedRetries = job.retryCount + 1 >= job.maxRetries;
    const isNonRetryableError = error.message && error.message.includes('not yet implemented');
    const isTerminalFailure = hasExhaustedRetries || isNonRetryableError;
    
    if (isTerminalFailure) {
      // This is a terminal failure - cleanup and mark as permanently failed
      console.log(`[VideoDownload] Terminal failure - cleaning up temp directory ${tmpDir}`);
      console.log(`[VideoDownload] Reason: ${hasExhaustedRetries ? 'max retries exhausted' : 'non-retryable error'}`);
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
        console.log(`[VideoDownload] Cleaned up temp directory for terminal failure`);
      } catch (cleanupError) {
        console.error(`[VideoDownload] Failed to cleanup temp directory:`, cleanupError);
      }
      
      if (job.movieId) {
        try {
          await storage.updateMovie({
            id: job.movieId,
            transcodingStatus: 'failed',
            transcodingError: error.message || 'Unknown error during download/upload',
            transcodingUpdatedAt: new Date(),
          });
          console.log(`[VideoDownload] Marked movie ${job.movieId} as permanently failed`);
        } catch (updateError) {
          console.error(`[VideoDownload] Failed to update movie error status:`, updateError);
        }
      }
    } else {
      console.log(`[VideoDownload] Will retry - preserving temp directory (attempt ${job.retryCount + 1}/${job.maxRetries})`);
    }

    throw error; // Re-throw so job queue can handle retry logic
  }
}

/**
 * Speaker configuration for multi-speaker dubbing
 */
interface SpeakerConfig {
  id: number;
  name: string;
  gender: 'male' | 'female';
}

/**
 * AI Dubbing metadata interface
 */
interface AIDubbingMetadata {
  movieId: string;
  targetLanguage: string;
  sourceLanguage?: string;
  voiceGender?: 'male' | 'female';
  speakerMode?: 'single' | 'alternating' | 'multi' | 'smart';
  speakers?: SpeakerConfig[];
  keepBackground?: boolean;
  outputFormat?: 'aac' | 'mp3';
  dubbedTrackId?: string;
  voiceQuality?: 'standard' | 'premium'; // standard = Edge-TTS (free), premium = ElevenLabs
}

/**
 * Run a Python script and return the result
 */
async function runPythonScript(scriptPath: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    // Use full path from PATH environment or fallback
    const pythonPath = process.env.PATH?.split(':').map(p => `${p}/python3`).find(p => {
      try { require('fs').accessSync(p, require('fs').constants.X_OK); return true; } catch { return false; }
    }) || 'python3';
    
    const proc = spawn(pythonPath, [scriptPath, ...args], {
      cwd: path.dirname(scriptPath),
      env: process.env
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log(`[Python] ${data.toString().trim()}`);
    });
    
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });
    
    proc.on('error', (err) => {
      resolve({ stdout, stderr: err.message, code: 1 });
    });
  });
}

// Checkpoint phases for dubbing pipeline
type DubbingPhase = 'download' | 'transcribe' | 'translate' | 'tts' | 'mix' | 'upload' | 'completed';
const PHASE_ORDER: DubbingPhase[] = ['download', 'transcribe', 'translate', 'tts', 'mix', 'upload', 'completed'];
const PHASE_PROGRESS: Record<DubbingPhase, number> = {
  download: 15, transcribe: 30, translate: 50, tts: 70, mix: 85, upload: 95, completed: 100
};

interface DubbingCheckpoint {
  completedPhases: DubbingPhase[];
  lastPhase: DubbingPhase;
  dubbedTrackId?: string;
  artifacts: {
    videoKey?: string;
    audioKey?: string;
    transcriptKey?: string;
    translatedKey?: string;
    ttsKey?: string;
    mixedKey?: string;
  };
}

async function saveCheckpoint(jobId: string, checkpoint: DubbingCheckpoint, jobQueue: JobQueue): Promise<void> {
  const progress = PHASE_PROGRESS[checkpoint.lastPhase] || 0;
  await jobQueue.updateProgress(jobId, progress, { 
    phase: checkpoint.lastPhase, 
    checkpoint,
    resumable: true 
  });
  console.log(`[AIDubbing] Checkpoint saved: ${checkpoint.lastPhase} (${progress}%)`);
}

async function uploadCheckpointArtifact(jobId: string, localPath: string, artifactName: string): Promise<string> {
  // Use dedicated R2 checkpoint method - stores in isolated _checkpoints/ namespace
  return await r2StorageService.uploadCheckpoint(jobId, artifactName, localPath);
}

async function downloadCheckpointArtifact(key: string, localPath: string): Promise<boolean> {
  // Use dedicated R2 checkpoint download method
  return await r2StorageService.downloadCheckpoint(key, localPath);
}

function getCheckpoint(job: Job): DubbingCheckpoint | null {
  const detail = job.progressDetail as any;
  if (detail?.checkpoint?.completedPhases) {
    return detail.checkpoint as DubbingCheckpoint;
  }
  return null;
}

function shouldSkipPhase(phase: DubbingPhase, checkpoint: DubbingCheckpoint | null): boolean {
  if (!checkpoint) return false;
  return checkpoint.completedPhases.includes(phase);
}

/**
 * Process AI Dubbing Job
 * Pipeline: Download video audio → Transcribe → Translate → TTS → Mix → Upload
 * SUPPORTS CHECKPOINTING: Jobs can resume after restart from last completed phase
 */
async function processAIDubbingJob(job: Job, jobQueue: JobQueue): Promise<void> {
  const metadata = job.metadata as AIDubbingMetadata;
  const { 
    movieId, 
    targetLanguage, 
    sourceLanguage = 'en', 
    voiceGender = 'female', 
    speakerMode = 'single',
    speakers = [],
    keepBackground = true,
    outputFormat = 'aac',
    voiceQuality = 'standard' // 'standard' = Edge-TTS, 'premium' = ElevenLabs
  } = metadata;
  
  // Check for existing checkpoint
  const existingCheckpoint = getCheckpoint(job);
  if (existingCheckpoint) {
    console.log(`[AIDubbing] RESUMING job from checkpoint: ${existingCheckpoint.lastPhase} (completed: ${existingCheckpoint.completedPhases.join(', ')})`);
  } else {
    console.log(`[AIDubbing] Starting NEW dubbing job for movie ${movieId} to ${targetLanguage}`);
  }
  
  const checkpoint: DubbingCheckpoint = existingCheckpoint || {
    completedPhases: [],
    lastPhase: 'download',
    dubbedTrackId: metadata.dubbedTrackId,
    artifacts: {}
  };
  
  // Use /tmp for dubbing (31GB quota) - workspace has ~1.5GB limit causing error -122
  const tmpDir = path.join('/tmp/dubbing', `dub_${job.id}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });
  
  try {
    // Get movie details
    const movie = await storage.getMovieById(movieId);
    if (!movie) {
      throw new Error(`Movie ${movieId} not found`);
    }
    
    // Check for video source - support hostedAssetKey (R2) or videoUrl
    const hostedKey = movie.hostedAssetKey;
    if (!movie.videoUrl && !hostedKey) {
      throw new Error(`Movie ${movieId} has no video source`);
    }
    
    await jobQueue.updateProgress(job.id, 5, { phase: 'initializing', message: 'Starting dubbing pipeline...' });
    
    // Create or update dubbed track record
    let dubbedTrackId = metadata.dubbedTrackId;
    if (!dubbedTrackId) {
      // Check if track already exists
      const existingTracks = await storage.getDubbedTracksByMovie(movieId);
      const existingTrack = existingTracks.find(t => t.languageCode === targetLanguage);
      
      if (existingTrack) {
        dubbedTrackId = existingTrack.id;
        await storage.updateDubbedTrack(dubbedTrackId, {
          status: 'processing',
          progress: 5,
          error: null
        });
      } else {
        // Create new track record
        const languageNames: Record<string, string> = {
          es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese',
          ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic',
          hi: 'Hindi', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', sv: 'Swedish'
        };
        
        const track = await storage.createDubbedTrack({
          movieId,
          languageCode: targetLanguage,
          languageName: languageNames[targetLanguage] || targetLanguage,
          status: 'processing',
          progress: 5
        });
        dubbedTrackId = track.id;
      }
    }
    
    // Phase 1: Download & Extract audio (checkpoint after audio extraction - audio is smaller than video)
    const extractedAudioPath = path.join(tmpDir, 'original_audio.mp3');
    const localVideoPath = path.join(tmpDir, 'source_video.mp4');
    const audioProcessorPath = path.join(__dirnameLocal, 'tts', 'audio_processor.py');
    
    if (shouldSkipPhase('download', existingCheckpoint)) {
      console.log(`[AIDubbing] SKIPPING download/extract phase (checkpoint)`);
      if (checkpoint.artifacts.audioKey) {
        await downloadCheckpointArtifact(checkpoint.artifacts.audioKey, extractedAudioPath);
        console.log(`[AIDubbing] Restored audio from checkpoint`);
      }
    } else {
      // Download video (re-download if workflow restarts - R2 to server is fast)
      await jobQueue.updateProgress(job.id, 8, { phase: 'downloading', message: 'Downloading video...' });
      
      const videoSource = hostedKey ? 
        await r2StorageService.getSignedUrl(hostedKey) : 
        movie.videoUrl!;
      
      const isR2Source = !!hostedKey;
      console.log(`[AIDubbing] Downloading video from ${videoSource.substring(0, 100)}... (trusted: ${isR2Source})`);
      
      await downloadFile(videoSource, localVideoPath, undefined, isR2Source);
      console.log(`[AIDubbing] Video downloaded successfully`);
      
      // Extract audio (FFmpeg)
      await jobQueue.updateProgress(job.id, 12, { phase: 'extracting', message: 'Extracting audio from video...' });
      
      const extractResult = await runPythonScript(audioProcessorPath, [
        'extract', localVideoPath, extractedAudioPath, 'mp3'
      ]);
      
      if (extractResult.code !== 0) {
        throw new Error(`Audio extraction failed: ${extractResult.stderr}`);
      }
      console.log(`[AIDubbing] Audio extracted successfully`);
      
      // CHECKPOINT: Save after audio extraction (audio file is smaller, uploads fast)
      checkpoint.artifacts.audioKey = await uploadCheckpointArtifact(job.id, extractedAudioPath, 'original_audio.mp3');
      checkpoint.completedPhases.push('download');
      checkpoint.lastPhase = 'download';
      await saveCheckpoint(job.id, checkpoint, jobQueue);
      console.log(`[AIDubbing] Checkpoint saved after download/extract phase`);
    }
    
    await storage.updateDubbedTrack(dubbedTrackId, { progress: 20 });
    
    // Phase 2: Transcribe audio with word-level timestamps (30%)
    const transcriptPath = path.join(tmpDir, 'transcript.txt');
    let transcript: string;
    
    if (shouldSkipPhase('transcribe', existingCheckpoint)) {
      console.log(`[AIDubbing] SKIPPING transcribe phase (checkpoint)`);
      if (checkpoint.artifacts.transcriptKey) {
        await downloadCheckpointArtifact(checkpoint.artifacts.transcriptKey, transcriptPath);
        transcript = await fs.promises.readFile(transcriptPath, 'utf-8');
        console.log(`[AIDubbing] Restored transcript from checkpoint`);
      } else {
        throw new Error('Transcript checkpoint missing');
      }
    } else {
      await jobQueue.updateProgress(job.id, 25, { phase: 'transcribing', message: 'Transcribing with faster-whisper (word timestamps)...' });
      
      let transcribeResult;
      
      // Always use faster-whisper first (FREE, local, word-level timestamps)
      const whisperPath = path.join(__dirnameLocal, 'tts', 'whisper_transcribe.py');
      console.log(`[AIDubbing] Using faster-whisper (FREE) for word-level timestamps`);
      transcribeResult = await runPythonScript(whisperPath, [
        extractedAudioPath, sourceLanguage, transcriptPath, 'base'
      ]);
      
      // Fallback to Google Speech if faster-whisper fails
      if (transcribeResult.code !== 0) {
        console.log(`[AIDubbing] faster-whisper failed, falling back to Google Speech...`);
        const transcribePath = path.join(__dirnameLocal, 'tts', 'transcribe.py');
        transcribeResult = await runPythonScript(transcribePath, [
          extractedAudioPath, sourceLanguage, transcriptPath
        ]);
      }
      
      const transcriptionEngine = transcribeResult.stdout?.includes('faster-whisper') ? 'faster-whisper' : 'Google Speech';
      
      if (transcribeResult.code !== 0) {
        throw new Error(`Transcription failed: ${transcribeResult.stderr}`);
      }
      
      transcript = await fs.promises.readFile(transcriptPath, 'utf-8');
      if (!transcript.trim()) {
        throw new Error('Transcription produced empty result');
      }
      console.log(`[AIDubbing] Transcription complete (${transcriptionEngine}): ${transcript.length} characters`);
      
      // Save checkpoint after transcribe phase
      checkpoint.artifacts.transcriptKey = await uploadCheckpointArtifact(job.id, transcriptPath, 'transcript.json');
      checkpoint.completedPhases.push('transcribe');
      checkpoint.lastPhase = 'transcribe';
      await saveCheckpoint(job.id, checkpoint, jobQueue);
    }
    
    await storage.updateDubbedTrack(dubbedTrackId, { progress: 40 });
    
    // Smart Speaker Detection Phase (only for 'smart' mode)
    let segmentAssignments: Array<{segment_id: number, speaker_id: number, gender: string}> = [];
    if (speakerMode === 'smart') {
      await jobQueue.updateProgress(job.id, 42, { phase: 'diarizing', message: 'Detecting speakers and genders...' });
      
      const diarizePath = path.join(__dirnameLocal, 'tts', 'smart_diarize.py');
      const diarizeOutputPath = path.join(tmpDir, 'diarization.json');
      
      const diarizeResult = await runPythonScript(diarizePath, [
        'analyze', extractedAudioPath, transcriptPath, diarizeOutputPath
      ]);
      
      if (diarizeResult.code === 0 && await fs.promises.access(diarizeOutputPath).then(() => true).catch(() => false)) {
        try {
          const diarizeData = JSON.parse(await fs.promises.readFile(diarizeOutputPath, 'utf-8'));
          if (diarizeData.success && diarizeData.segments) {
            segmentAssignments = diarizeData.segments.map((seg: any, idx: number) => ({
              segment_id: idx,
              speaker_id: seg.speaker_id || 0,
              gender: seg.detected_gender || 'unknown'
            }));
            const summary = diarizeData.summary || {};
            console.log(`[AIDubbing] Smart diarization: ${summary.male_segments || 0} male, ${summary.female_segments || 0} female segments (${Math.round((summary.average_confidence || 0) * 100)}% avg confidence)`);
          }
        } catch (e) {
          console.warn(`[AIDubbing] Diarization output parse error, falling back to alternating mode`);
        }
      } else {
        console.warn(`[AIDubbing] Diarization failed, falling back to alternating mode`);
      }
    }
    
    // Phase 3: Translate transcript with timing (50%)
    const translatedSegmentsPath = path.join(tmpDir, 'translated_segments.json');
    let translatedSegments: any[];
    let totalDuration: number;
    
    // Parse transcript JSON to get segments with timestamps
    const transcriptData = JSON.parse(transcript);
    const segments = transcriptData.segments || [];
    totalDuration = transcriptData.total_duration || segments[segments.length - 1]?.end || 0;
    
    if (shouldSkipPhase('translate', existingCheckpoint)) {
      console.log(`[AIDubbing] SKIPPING translate phase (checkpoint)`);
      if (checkpoint.artifacts.translatedKey) {
        await downloadCheckpointArtifact(checkpoint.artifacts.translatedKey, translatedSegmentsPath);
        translatedSegments = JSON.parse(await fs.promises.readFile(translatedSegmentsPath, 'utf-8'));
        console.log(`[AIDubbing] Restored translated segments from checkpoint`);
      } else {
        throw new Error('Translated segments checkpoint missing');
      }
    } else {
      await jobQueue.updateProgress(job.id, 45, { phase: 'translating', message: `Translating to ${targetLanguage}...` });
      
      // Apply smart diarization gender assignments to segments and persist to file
      if (speakerMode === 'smart' && segmentAssignments.length > 0) {
        for (let i = 0; i < segments.length && i < segmentAssignments.length; i++) {
          segments[i].gender = segmentAssignments[i].gender;
          segments[i].speaker_id = segmentAssignments[i].speaker_id;
        }
        // Update transcript file with enriched segments
        transcriptData.segments = segments;
        await fs.promises.writeFile(transcriptPath, JSON.stringify(transcriptData, null, 2));
        console.log(`[AIDubbing] Enriched ${segmentAssignments.length} segments with gender data`);
      }
      
      const translatePath = path.join(__dirnameLocal, 'tts', 'translate.py');
      
      // Use segment-by-segment translation to preserve timestamps (and gender from smart mode)
      const translateResult = await runPythonScript(translatePath, [
        'translate-timed', transcriptPath, sourceLanguage, targetLanguage, translatedSegmentsPath, 'movie dialogue'
      ]);
      
      if (translateResult.code !== 0) {
        throw new Error(`Translation failed: ${translateResult.stderr}`);
      }
      
      translatedSegments = JSON.parse(await fs.promises.readFile(translatedSegmentsPath, 'utf-8'));
      console.log(`[AIDubbing] Translation complete: ${translatedSegments.length} timed segments`);
      
      // Save checkpoint after translate phase
      checkpoint.artifacts.translatedKey = await uploadCheckpointArtifact(job.id, translatedSegmentsPath, 'translated_segments.json');
      checkpoint.completedPhases.push('translate');
      checkpoint.lastPhase = 'translate';
      await saveCheckpoint(job.id, checkpoint, jobQueue);
    }
    
    await storage.updateDubbedTrack(dubbedTrackId, { progress: 55 });
    
    // Phase 4: Generate TTS audio with segment timing (70%)
    const isPremium = voiceQuality === 'premium' && (process.env.ELEVEN_TTS_KEY || process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY);
    const ttsEngine = isPremium ? 'ElevenLabs' : 'Edge TTS';
    const ttsAudioPath = path.join(tmpDir, 'tts_audio.mp3');
    const audioExt = outputFormat === 'aac' ? 'm4a' : 'mp3';
    const finalAudioPath = path.join(tmpDir, `final_dubbed.${audioExt}`);
    
    // TTS Phase with checkpoint support
    if (shouldSkipPhase('tts', existingCheckpoint)) {
      console.log(`[AIDubbing] SKIPPING TTS phase (checkpoint)`);
      if (checkpoint.artifacts.ttsKey) {
        await downloadCheckpointArtifact(checkpoint.artifacts.ttsKey, ttsAudioPath);
        console.log(`[AIDubbing] Restored TTS audio from checkpoint`);
      } else {
        throw new Error('TTS audio checkpoint missing');
      }
    } else {
      await jobQueue.updateProgress(job.id, 60, { phase: 'generating', message: `Generating dubbed audio with ${ttsEngine} (segment-timed)...` });
      
      const ttsSegmentsDir = path.join(tmpDir, 'tts_segments');
      await fs.promises.mkdir(ttsSegmentsDir, { recursive: true });
      
      // Prepare speaker configuration for multi-speaker mode
      const speakerConfigPath = path.join(tmpDir, 'speaker_config.json');
      const speakerConfig: Record<string, any> = {
        mode: speakerMode,
        defaultGender: voiceGender,
        speakers: speakers.length > 0 ? speakers : [
          { id: 1, name: 'Speaker 1', gender: voiceGender },
          { id: 2, name: 'Speaker 2', gender: voiceGender === 'male' ? 'female' : 'male' }
        ]
      };
      
      // Add segment_assignments for smart mode voice selection
      if (speakerMode === 'smart' && segmentAssignments.length > 0) {
        speakerConfig.segment_assignments = segmentAssignments;
        console.log(`[AIDubbing] Smart mode: ${segmentAssignments.length} segment gender assignments in config`);
      }
      
      await fs.promises.writeFile(speakerConfigPath, JSON.stringify(speakerConfig));
      
      let ttsResult;
      if (isPremium) {
        // Use ElevenLabs for premium quality with segment timing
        const elevenLabsPath = path.join(__dirnameLocal, 'tts', 'elevenlabs_tts.py');
        console.log(`[AIDubbing] Using ElevenLabs premium voices with segment timing`);
        ttsResult = await runPythonScript(elevenLabsPath, [
          'generate-timed', translatedSegmentsPath, targetLanguage, ttsSegmentsDir, speakerConfigPath
        ]);
        
        if (ttsResult.code !== 0) {
          throw new Error(`TTS generation failed: ${ttsResult.stderr}`);
        }
      } else {
        // Edge TTS - use segment-based generation for proper timing sync
        const edgeTtsPath = path.join(__dirnameLocal, 'tts', 'edge_tts_dub.py');
        const segmentAssemblerPath = path.join(__dirnameLocal, 'tts', 'segment_assembler.py');
        
        console.log(`[AIDubbing] Using Edge TTS with segment-based timing sync`);
        
        // Step 1: Generate individual segment audio files
        ttsResult = await runPythonScript(edgeTtsPath, [
          'generate-segments', translatedSegmentsPath, targetLanguage, ttsSegmentsDir, voiceGender
        ]);
        
        if (ttsResult.code !== 0) {
          throw new Error(`TTS segment generation failed: ${ttsResult.stderr}`);
        }
        console.log(`[AIDubbing] Generated TTS segments, now assembling with timing...`);
        
        // Step 2: Assemble segments with proper timing using segment_assembler
        const assembleResult = await runPythonScript(segmentAssemblerPath, [
          'assemble', translatedSegmentsPath, ttsSegmentsDir, ttsAudioPath
        ]);
        
        if (assembleResult.code !== 0) {
          throw new Error(`Segment assembly failed: ${assembleResult.stderr}`);
        }
        console.log(`[AIDubbing] TTS audio assembled with timing sync (${ttsEngine}, ${speakerMode} speaker mode)`);
      }
      
      // Save checkpoint after TTS phase
      checkpoint.artifacts.ttsKey = await uploadCheckpointArtifact(job.id, ttsAudioPath, 'tts_audio.mp3');
      checkpoint.completedPhases.push('tts');
      checkpoint.lastPhase = 'tts';
      await saveCheckpoint(job.id, checkpoint, jobQueue);
    }
    
    await storage.updateDubbedTrack(dubbedTrackId, { progress: 75 });
    
    // Phase 5: Professional audio mixing with EBU R128 normalization (85%)
    if (shouldSkipPhase('mix', existingCheckpoint)) {
      console.log(`[AIDubbing] SKIPPING mix phase (checkpoint)`);
      if (checkpoint.artifacts.mixedKey) {
        await downloadCheckpointArtifact(checkpoint.artifacts.mixedKey, finalAudioPath);
        console.log(`[AIDubbing] Restored mixed audio from checkpoint`);
      } else {
        throw new Error('Mixed audio checkpoint missing');
      }
    } else {
      await jobQueue.updateProgress(job.id, 80, { phase: 'mixing', message: 'Professional audio mixing (EBU R128)...' });
      
      const professionalMixerPath = path.join(__dirnameLocal, 'tts', 'professional_mixer.py');
      
      // Use professional mixer with loudness normalization and reverb matching
      const mixCommand = keepBackground ? 'mix' : 'quick';
      const mixResult = await runPythonScript(professionalMixerPath, [
        mixCommand, extractedAudioPath, ttsAudioPath, finalAudioPath, outputFormat
      ]);
      
      if (mixResult.code !== 0) {
        throw new Error(`Audio mixing failed: ${mixResult.stderr}`);
      }
      console.log(`[AIDubbing] Audio mixed successfully`);
      
      // Save checkpoint after mix phase
      checkpoint.artifacts.mixedKey = await uploadCheckpointArtifact(job.id, finalAudioPath, `final_dubbed.${audioExt}`);
      checkpoint.completedPhases.push('mix');
      checkpoint.lastPhase = 'mix';
      await saveCheckpoint(job.id, checkpoint, jobQueue);
    }
    
    await storage.updateDubbedTrack(dubbedTrackId, { progress: 85 });
    
    // Phase 6: Upload to R2 (95%)
    await jobQueue.updateProgress(job.id, 90, { phase: 'uploading', message: 'Uploading dubbed audio...' });
    
    const audioFileName = `${movieId}_${targetLanguage}_${Date.now()}`;
    const audioKey = await r2StorageService.uploadAudioFromFile(finalAudioPath, audioFileName);
    console.log(`[AIDubbing] Uploaded dubbed audio to R2: ${audioKey}`);
    
    // Get audio duration
    const durationResult = await runPythonScript(audioProcessorPath, ['duration', finalAudioPath]);
    let duration = 0;
    try {
      const durationData = JSON.parse(durationResult.stdout);
      duration = Math.round(durationData.duration || 0);
    } catch {}
    
    // Update dubbed track with completed status
    const voiceModelName = isPremium 
      ? `elevenlabs-${targetLanguage}-${speakerMode === 'single' ? voiceGender : speakerMode}`
      : `edge-tts-${targetLanguage}-${speakerMode === 'single' ? voiceGender : speakerMode}`;
    await storage.updateDubbedTrack(dubbedTrackId, {
      status: 'completed',
      progress: 100,
      audioKey,
      duration,
      voiceModel: voiceModelName
    });
    
    // Mark job complete
    checkpoint.completedPhases.push('upload');
    checkpoint.lastPhase = 'completed';
    await jobQueue.updateProgress(job.id, 100, { phase: 'completed', message: 'Dubbing complete!', checkpoint });
    console.log(`[AIDubbing] Job ${job.id} completed successfully`);
    
    // Cleanup checkpoint files from R2 on successful completion
    try {
      await r2StorageService.cleanupJobCheckpoints(job.id);
    } catch (e) {
      console.log(`[AIDubbing] Checkpoint cleanup skipped: ${e}`);
    }
    
    // Cleanup temp files on success
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    
  } catch (error: any) {
    console.error(`[AIDubbing] Error in job ${job.id}:`, error);
    
    // Update dubbed track with error
    if (metadata.dubbedTrackId) {
      try {
        await storage.updateDubbedTrack(metadata.dubbedTrackId, {
          status: 'failed',
          error: error.message || 'Unknown error'
        });
      } catch {}
    }
    
    // Cleanup on error
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {}
    
    throw error;
  }
}

/**
 * Main job processor dispatcher
 * Routes jobs to the appropriate processor based on job type
 * 
 * Note: This function only processes the job and throws errors.
 * The worker is responsible for calling completeJob() or failJob().
 */
export async function processJob(job: Job, jobQueue: JobQueue): Promise<void> {
  console.log(`[JobProcessor] Processing job ${job.id} (type: ${job.type})`);

  switch (job.type) {
    case 'video-download':
    case 'video_download':
      await processVideoDownloadJob(job, jobQueue);
      break;
    
    case 'ai-dubbing':
    case 'ai_dubbing':
      await processAIDubbingJob(job, jobQueue);
      break;

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}
