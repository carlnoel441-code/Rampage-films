import { useState, useEffect } from "react";
import { isMobileDevice } from "@/lib/utils";
import MobileMp4Player from "./MobileMp4Player";
import VideoPlayer from "./VideoPlayer";
import { useToast } from "@/hooks/use-toast";
import { useWatchProgress } from "@/hooks/use-watch-progress";
import { type SkipSegments } from "@/hooks/useSkipSegments";
import { Info } from "lucide-react";

interface MovieVideoContainerProps {
  videoUrl: string | null;
  mobileMp4Url?: string | null;
  title: string;
  subtitleUrl?: string | null;
  movieId?: string;
  skipSegments?: SkipSegments;
  hostedAssetKey?: string | null;
  transcodingStatus?: string | null;
}

export default function MovieVideoContainer({
  videoUrl,
  mobileMp4Url,
  title,
  subtitleUrl,
  movieId,
  skipSegments = {},
  hostedAssetKey,
  transcodingStatus,
}: MovieVideoContainerProps) {
  const { toast } = useToast();
  const [isMobile] = useState(() => isMobileDevice());
  const [playerType, setPlayerType] = useState<"mobile-mp4" | "iframe" | null>(null);
  const [hostedVideoUrl, setHostedVideoUrl] = useState<string | null>(null);
  const [loadingHostedVideo, setLoadingHostedVideo] = useState(false);
  const [hostedVideoError, setHostedVideoError] = useState<string | null>(null);
  const [initialTime, setInitialTime] = useState(0);
  
  // Track playback state for mobile MP4 player watch progress
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Save watch progress for mobile MP4 player
  useWatchProgress(movieId || '', currentTime, duration, isPlaying);

  // Load saved watch progress on mount
  useEffect(() => {
    async function loadWatchProgress() {
      if (!movieId) return;

      try {
        const response = await fetch(`/api/progress/${movieId}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.progressSeconds > 0) {
            setInitialTime(data.progressSeconds);
            console.log(`[WATCH PROGRESS] Resuming from ${data.progressSeconds}s`);
          }
        }
      } catch (error) {
        console.error('[WATCH PROGRESS] Failed to load saved progress:', error);
      }
    }

    loadWatchProgress();
  }, [movieId]);

  const fetchHostedVideo = async () => {
    if (!hostedAssetKey || !movieId || transcodingStatus !== "completed") {
      return;
    }

    setLoadingHostedVideo(true);
    setHostedVideoError(null);
    try {
      const response = await fetch(`/api/movies/${movieId}/hosted-video-url`);
      if (response.ok) {
        const data = await response.json();
        setHostedVideoUrl(data.url);
        setHostedVideoError(null);
        console.log('[HOSTED VIDEO] Using self-hosted MP4');
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || `Failed to load video (${response.status})`;
        setHostedVideoError(errorMsg);
        console.warn('[HOSTED VIDEO] Failed to fetch hosted video URL:', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Network error loading video';
      setHostedVideoError(errorMsg);
      console.error('[HOSTED VIDEO] Error fetching hosted video:', error);
    } finally {
      setLoadingHostedVideo(false);
    }
  };

  useEffect(() => {
    setHostedVideoUrl(null);
    setLoadingHostedVideo(false);
    setHostedVideoError(null);
    fetchHostedVideo();
  }, [movieId, hostedAssetKey, transcodingStatus]);

  useEffect(() => {
    // Helper to detect if a URL is a direct MP4 file
    const isDirectMp4Url = (url: string | null): boolean => {
      if (!url) return false;
      const lowerUrl = url.toLowerCase();
      // Check for .mp4 extension or common MP4 hosting patterns
      return lowerUrl.includes('.mp4') || 
             lowerUrl.includes('cloudflare') ||
             lowerUrl.includes('r2.cloudflarestorage') ||
             lowerUrl.includes('googleapis.com') ||
             lowerUrl.includes('archive.org/download');
    };
    
    // Decision logic: Choose player based on availability and priority
    // Priority: hosted MP4 > direct MP4 URL > mobile MP4 > iframe embed
    if (hostedVideoUrl) {
      setPlayerType("mobile-mp4");
      console.log('[VIDEO] Using hosted MP4 player');
    } else if (isDirectMp4Url(videoUrl)) {
      // Direct MP4 URLs should use native player
      setPlayerType("mobile-mp4");
      console.log('[VIDEO] Using native MP4 player for direct MP4 URL');
    } else if (isMobile && mobileMp4Url) {
      setPlayerType("mobile-mp4");
      console.log('[VIDEO] Using mobile MP4 player');
    } else if (videoUrl) {
      setPlayerType("iframe");
      if (isMobile && !mobileMp4Url) {
        console.log('[VIDEO] Using iframe player (no MP4 available) - may experience 10s pause');
      }
    } else if (!loadingHostedVideo) {
      setPlayerType(null);
    }
  }, [isMobile, mobileMp4Url, videoUrl, hostedVideoUrl, loadingHostedVideo, toast]);

  // When hosted video fails to load, automatically fall back to embed if available
  // Don't block the user with an error screen - just use the alternative source
  useEffect(() => {
    if (hostedAssetKey && hostedVideoError && !hostedVideoUrl && videoUrl && !loadingHostedVideo) {
      console.log('[VIDEO FALLBACK] Hosted video failed, falling back to embed:', hostedVideoError);
      // Clear the hosted asset state to allow embed playback
      setPlayerType("iframe");
    }
  }, [hostedAssetKey, hostedVideoError, hostedVideoUrl, videoUrl, loadingHostedVideo]);

  // Only show error if hosted video failed AND there's no embed fallback
  if (hostedAssetKey && hostedVideoError && !hostedVideoUrl && !videoUrl) {
    return (
      <div 
        className="relative bg-black/90 rounded-md overflow-hidden aspect-video flex items-center justify-center"
        data-testid="hosted-video-error"
      >
        <div className="text-center p-8 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
            <Info className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <p className="text-white text-lg font-medium">Video Failed to Load</p>
            <p className="text-white/60 text-sm mt-2">{hostedVideoError}</p>
          </div>
          <button
            onClick={() => fetchHostedVideo()}
            disabled={loadingHostedVideo}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            data-testid="button-retry-video"
          >
            {loadingHostedVideo ? "Loading..." : "Retry"}
          </button>
        </div>
      </div>
    );
  }

  // Show loading state for hosted video
  if (hostedAssetKey && loadingHostedVideo && !hostedVideoUrl) {
    return (
      <div 
        className="relative bg-black/90 rounded-md overflow-hidden aspect-video flex items-center justify-center"
        data-testid="hosted-video-loading"
      >
        <div className="text-center p-8">
          <div className="w-12 h-12 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-white/60 mt-4">Loading video...</p>
        </div>
      </div>
    );
  }

  // Handle video playback error - fallback to iframe embed if available
  const handleVideoError = (error: string) => {
    console.warn('[VIDEO FALLBACK] MP4 playback failed:', error);
    
    // If we have an alternative video source (YouTube/Vimeo embed), fall back to it
    if (videoUrl) {
      console.log('[VIDEO FALLBACK] Falling back to iframe embed');
      setHostedVideoUrl(null); // Clear the failed hosted URL
      setPlayerType("iframe"); // Switch to iframe player
      toast({
        title: "Switched to Embedded Player",
        description: "Using alternative video source due to playback issue.",
      });
    }
  };

  // Debug logging
  console.log('[VIDEO CONTAINER] playerType:', playerType, 'hostedVideoUrl:', !!hostedVideoUrl);

  // Helper to detect if a URL is a direct MP4 file (duplicate for render logic)
  const isDirectMp4 = (url: string | null): boolean => {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('.mp4') || 
           lowerUrl.includes('cloudflare') ||
           lowerUrl.includes('r2.cloudflarestorage') ||
           lowerUrl.includes('googleapis.com') ||
           lowerUrl.includes('archive.org/download');
  };

  // MP4 Player (HTML5) - for hosted videos, mobile MP4s, or direct MP4 URLs
  if (playerType === "mobile-mp4") {
    const mp4Source = hostedVideoUrl || mobileMp4Url || (isDirectMp4(videoUrl) ? videoUrl : null);
    if (mp4Source) {
      return (
        <MobileMp4Player
          mp4Url={mp4Source}
          title={title}
          subtitleUrl={subtitleUrl}
          onTimeUpdate={setCurrentTime}
          onDurationChange={setDuration}
          onPlayingChange={setIsPlaying}
          onError={handleVideoError}
          initialTime={initialTime}
          skipSegments={skipSegments}
          movieId={movieId}
        />
      );
    }
  }

  // Desktop/Fallback Player (YouTube/Vimeo/Ok.ru iframes)
  if (playerType === "iframe" && videoUrl) {
    return (
      <div className="space-y-3">
        <VideoPlayer
          videoUrl={videoUrl}
          title={title}
          subtitleUrl={subtitleUrl}
          movieId={movieId}
          initialTime={initialTime}
          skipSegments={skipSegments}
        />
      </div>
    );
  }

  // No video source available
  return (
    <div 
      className="relative bg-black/90 rounded-md overflow-hidden aspect-video flex items-center justify-center"
      data-testid="no-video-placeholder"
    >
      <div className="text-center p-8">
        <p className="text-white/60 text-lg">No video source available</p>
        <p className="text-white/40 text-sm mt-2">
          Please contact the administrator to add a video URL
        </p>
      </div>
    </div>
  );
}
