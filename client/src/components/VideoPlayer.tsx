import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, PictureInPicture, Gauge, Subtitles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useWatchProgress } from "@/hooks/use-watch-progress";
import { useSkipSegments, type SkipSegments } from "@/hooks/useSkipSegments";
import SkipControlOverlay from "./SkipControlOverlay";
import IframeVideoPlayer from "./IframeVideoPlayer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface VideoPlayerProps {
  videoUrl: string;
  title: string;
  subtitleUrl?: string | null;
  movieId?: string;
  initialTime?: number;
  skipSegments?: SkipSegments;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

type VideoPlatform = 'youtube' | 'vimeo' | 'dailymotion' | 'tokyvideo' | 'okru' | 'mp4';

interface VideoInfo {
  platform: VideoPlatform;
  embedUrl: string;
}

function detectVideoSource(url: string): VideoInfo {
  if (!url) {
    return { platform: 'mp4', embedUrl: url };
  }

  const youtubeRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const vimeoRegex = /vimeo\.com\/(?:video\/)?(\d+)/;
  const dailymotionRegex = /(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/;
  const tokyvideoRegex = /tokyvideo\.com\/((?:[a-z]{2}\/)?)video\/([\w-]+)/;
  const okruRegex = /ok\.ru\/(?:video|videoembed)\/(\d+)/;

  const youtubeMatch = url.match(youtubeRegex);
  if (youtubeMatch) {
    return {
      platform: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}?rel=0&playsinline=1&enablejsapi=1`
    };
  }

  const vimeoMatch = url.match(vimeoRegex);
  if (vimeoMatch) {
    return {
      platform: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`
    };
  }

  const dailymotionMatch = url.match(dailymotionRegex);
  if (dailymotionMatch) {
    return {
      platform: 'dailymotion',
      embedUrl: `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}`
    };
  }

  const tokyvideoMatch = url.match(tokyvideoRegex);
  if (tokyvideoMatch) {
    const locale = tokyvideoMatch[1];
    const videoId = tokyvideoMatch[2];
    return {
      platform: 'tokyvideo',
      embedUrl: `https://www.tokyvideo.com/${locale}embed/${videoId}`
    };
  }

  const okruMatch = url.match(okruRegex);
  if (okruMatch) {
    return {
      platform: 'okru',
      embedUrl: `https://ok.ru/videoembed/${okruMatch[1]}`
    };
  }

  return { platform: 'mp4', embedUrl: url };
}

export default function VideoPlayer({ 
  videoUrl, 
  title, 
  subtitleUrl, 
  movieId, 
  initialTime = 0, 
  skipSegments = {},
  onTimeUpdate,
  onDurationChange,
  onPlayingChange
}: VideoPlayerProps) {
  const { toast } = useToast();
  const videoInfo = detectVideoSource(videoUrl);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasSubtitles = !!subtitleUrl;

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const currentTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  
  // Track watch progress
  useWatchProgress(movieId || '', currentTime, duration, isPlaying);
  
  // Call parent callbacks when state changes
  useEffect(() => {
    onTimeUpdate?.(currentTime);
  }, [currentTime, onTimeUpdate]);
  
  useEffect(() => {
    onDurationChange?.(duration);
  }, [duration, onDurationChange]);
  
  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  // Skip segments hook (for intro/credits)
  const skipState = useSkipSegments({
    segments: skipSegments,
    currentTime,
    duration,
  });

  // Cleanup controls timeout on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Media event handlers with error recovery
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      currentTimeRef.current = video.currentTime;
      setCurrentTime(video.currentTime);
      setIsBuffering(false);
    };
    
    const handleDurationChange = () => setDuration(video.duration);
    
    const handleEnded = () => {
      setIsPlaying(false);
    };

    const handlePlay = () => {
      isPlayingRef.current = true;
      setIsPlaying(true);
      retryCountRef.current = 0;
    };
    
    const handlePause = () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handleCanPlay = () => {
      setIsBuffering(false);
      setPlaybackError(null);
      retryCountRef.current = 0;
    };

    const handleStalled = () => {
      console.log('Video stalled, attempting recovery...');
      setIsBuffering(true);
      
      setTimeout(() => {
        if (video.readyState < 3 && isPlayingRef.current) {
          const currentPos = currentTimeRef.current;
          video.load();
          
          const handleLoadedMetadata = () => {
            video.currentTime = currentPos;
            video.play().catch((err) => {
              console.error('Failed to resume after stall:', err);
            });
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
          };
          
          video.addEventListener('loadedmetadata', handleLoadedMetadata);
        }
      }, 2000);
    };

    const handleError = () => {
      const error = video.error;
      console.error('Video error:', error);
      
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        console.log(`Retrying playback (${retryCountRef.current}/${maxRetries})...`);
        
        setTimeout(() => {
          const currentPos = currentTimeRef.current;
          video.load();
          
          const handleLoadedMetadata = () => {
            video.currentTime = currentPos;
            
            if (isPlayingRef.current) {
              video.play().catch((err) => {
                console.error('Retry failed:', err);
              });
            }
            
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
          };
          
          video.addEventListener('loadedmetadata', handleLoadedMetadata);
        }, 1000 * retryCountRef.current);
      } else {
        setPlaybackError('Video playback failed. Please refresh the page.');
        toast({
          title: "Playback Error",
          description: "Unable to play video. Please try refreshing the page.",
          variant: "destructive"
        });
      }
    };

    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const duration = video.duration;
        if (duration > 0 && bufferedEnd >= duration * 0.95) {
          setIsBuffering(false);
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("canplaythrough", handleCanPlay);
    video.addEventListener("stalled", handleStalled);
    video.addEventListener("error", handleError);
    video.addEventListener("progress", handleProgress);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("canplaythrough", handleCanPlay);
      video.removeEventListener("stalled", handleStalled);
      video.removeEventListener("error", handleError);
      video.removeEventListener("progress", handleProgress);
    };
  }, [toast]);

  // Toggle subtitle visibility
  useEffect(() => {
    const video = videoRef.current;
    if (video && hasSubtitles) {
      const tracks = video.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = showSubtitles ? 'showing' : 'hidden';
      }
    }
  }, [showSubtitles, hasSubtitles]);

  // Load initial playback position from saved watch progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video || initialTime <= 0) return;

    const handleLoadedMetadata = () => {
      if (video.currentTime === 0) {
        video.currentTime = initialTime;
        console.log(`[VIDEO PLAYER] Resumed from ${initialTime}s`);
      }
    };

    if (video.readyState >= 1) {
      handleLoadedMetadata();
    } else {
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }
  }, [initialTime]);

  // Handle touch/mouse interactions for showing controls
  const showControlsTemporarily = () => {
    setShowControls(true);
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  const handleVideoClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    showControlsTemporarily();
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    const newVolume = value[0];
    setVolume(newVolume);
    video.volume = newVolume / 100;
    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };

  const handleSeek = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = value[0];
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!isFullscreen) {
      if (container.requestFullscreen) {
        container.requestFullscreen().catch((err) => {
          console.error('Error attempting to enable fullscreen:', err);
        });
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          console.error('Error attempting to exit fullscreen:', err);
        });
      }
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  };

  const changePlaybackSpeed = (speed: number) => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  };

  const handleSkipIntro = () => {
    const video = videoRef.current;
    if (video && skipState.skipIntroTo !== null) {
      video.currentTime = skipState.skipIntroTo;
      setCurrentTime(skipState.skipIntroTo);
    }
  };

  const handleSkipCredits = () => {
    const video = videoRef.current;
    if (video && skipState.skipCreditsTo !== null) {
      video.currentTime = skipState.skipCreditsTo;
      setCurrentTime(skipState.skipCreditsTo);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Track fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // For YouTube, Vimeo, Dailymotion, and Ok.ru, use iframe player
  if (videoInfo.platform === 'youtube' || videoInfo.platform === 'vimeo' || videoInfo.platform === 'dailymotion' || videoInfo.platform === 'okru') {
    return (
      <IframeVideoPlayer
        platform={videoInfo.platform}
        embedUrl={videoInfo.embedUrl}
        title={title}
        movieId={movieId}
        initialTime={initialTime}
        skipSegments={skipSegments}
        onTimeUpdate={setCurrentTime}
        onDurationChange={setDuration}
        onPlayingChange={setIsPlaying}
      />
    );
  }

  // If we get here, it's an MP4 video
  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-md overflow-hidden aspect-video group"
      onMouseMove={showControlsTemporarily}
      data-testid="video-player"
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        onClick={handleVideoClick}
        onTouchStart={handleVideoClick}
        data-testid="video-element"
        crossOrigin="anonymous"
        playsInline
      >
        <source src={videoUrl} type="video/mp4" />
        {hasSubtitles && subtitleUrl && (
          <track
            kind="subtitles"
            src={subtitleUrl}
            srcLang="en"
            label="English"
            default={showSubtitles}
          />
        )}
        Your browser does not support the video tag.
      </video>

      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            className="cursor-pointer"
            data-testid="slider-progress"
          />

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={togglePlay}
                className="text-white hover:text-primary"
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" fill="currentColor" />}
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={toggleMute}
                className="text-white hover:text-primary"
                data-testid="button-mute"
              >
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </Button>

              <div className="w-24 hidden sm:block">
                <Slider
                  value={[volume]}
                  max={100}
                  step={1}
                  onValueChange={handleVolumeChange}
                  className="cursor-pointer"
                  data-testid="slider-volume"
                />
              </div>

              <span className="text-white text-sm">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {hasSubtitles && (
                <Button
                  size="sm"
                  variant={showSubtitles ? "default" : "ghost"}
                  onClick={() => setShowSubtitles(!showSubtitles)}
                  className={showSubtitles ? "" : "text-white hover:text-primary"}
                  data-testid="button-subtitle-toggle"
                >
                  <Subtitles className="h-4 w-4 mr-1" />
                  <span className="text-xs hidden sm:inline">
                    {showSubtitles ? "On" : "Off"}
                  </span>
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white hover:text-primary"
                    data-testid="button-playback-speed"
                  >
                    <Gauge className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                    <DropdownMenuItem
                      key={speed}
                      onClick={() => changePlaybackSpeed(speed)}
                      className={playbackSpeed === speed ? "bg-accent" : ""}
                      data-testid={`menuitem-speed-${speed}`}
                    >
                      {speed}x {playbackSpeed === speed && "✓"}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                size="icon"
                variant="ghost"
                onClick={togglePiP}
                className="text-white hover:text-primary"
                data-testid="button-pip"
              >
                <PictureInPicture className="h-5 w-5" />
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={toggleFullscreen}
                className="text-white hover:text-primary"
                data-testid="button-fullscreen"
              >
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {!isPlaying && showControls && !isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Button
            size="icon"
            variant="default"
            onClick={togglePlay}
            className="h-16 w-16 rounded-full"
            data-testid="button-play-center"
          >
            <Play className="h-8 w-8" fill="currentColor" />
          </Button>
        </div>
      )}

      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <span className="text-white text-sm">Buffering...</span>
          </div>
        </div>
      )}

      {playbackError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white p-4">
            <p className="text-lg mb-2">Playback Error</p>
            <p className="text-sm text-white/70">{playbackError}</p>
          </div>
        </div>
      )}

      {/* Skip Intro/Credits Controls */}
      <SkipControlOverlay
        showSkipIntro={skipState.showSkipIntro}
        showSkipCredits={skipState.showSkipCredits}
        onSkipIntro={handleSkipIntro}
        onSkipCredits={handleSkipCredits}
      />
    </div>
  );
}
