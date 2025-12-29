import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useState, useRef, useEffect } from "react";
import Player from '@vimeo/player';
import { isMobileDevice } from "@/lib/utils";
import { useSkipSegments, type SkipSegments } from "@/hooks/useSkipSegments";
import SkipControlOverlay from "./SkipControlOverlay";

interface IframeVideoPlayerProps {
  platform: 'youtube' | 'vimeo' | 'dailymotion' | 'tokyvideo' | 'okru';
  embedUrl: string;
  title: string;
  movieId?: string;
  initialTime?: number;
  skipSegments?: SkipSegments;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function IframeVideoPlayer({ 
  platform, 
  embedUrl, 
  title, 
  movieId,
  initialTime = 0, 
  skipSegments = {},
  onTimeUpdate,
  onDurationChange,
  onPlayingChange
}: IframeVideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isMobile] = useState(() => isMobileDevice());
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const userInitiatedPauseRef = useRef(false);

  const supportsEnhancedPlayer = platform === 'youtube' || platform === 'vimeo';
  
  const shouldInitializePlayer = !isMobile || hasUserInteracted;
  
  // Report state changes to parent component
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

  // Extract video ID for player initialization
  const getVideoId = () => {
    if (platform === 'youtube') {
      const match = embedUrl.match(/embed\/([a-zA-Z0-9_-]{11})/);
      return match ? match[1] : '';
    }
    if (platform === 'vimeo') {
      const match = embedUrl.match(/video\/(\d+)/);
      return match ? match[1] : '';
    }
    return '';
  };

  // Initialize YouTube Player
  useEffect(() => {
    if (platform !== 'youtube') return;
    if (!shouldInitializePlayer) return;

    const loadYouTubeAPI = () => {
      if (window.YT && window.YT.Player) {
        initYouTubePlayer();
        return;
      }

      if (!document.getElementById('youtube-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }

      window.onYouTubeIframeAPIReady = () => {
        initYouTubePlayer();
      };
    };

    const initYouTubePlayer = () => {
      if (!iframeRef.current) return;

      const videoId = getVideoId();
      if (!videoId) return;

      playerRef.current = new window.YT.Player(iframeRef.current, {
        videoId,
        playerVars: {
          rel: 0,
          enablejsapi: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: handleYouTubeReady,
          onStateChange: handleYouTubeStateChange,
          onError: handleYouTubeError
        }
      });
    };

    loadYouTubeAPI();

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [platform, shouldInitializePlayer]);

  // Initialize Vimeo Player
  useEffect(() => {
    if (platform !== 'vimeo' || !iframeRef.current) return;
    if (!shouldInitializePlayer) return;

    const player = new Player(iframeRef.current);
    playerRef.current = player;

    player.ready().then(async () => {
      setPlayerReady(true);
      
      player.getDuration().then(setDuration);
      
      if (initialTime > 0) {
        await player.setCurrentTime(initialTime);
        console.log(`[VIMEO] Resumed from ${initialTime}s`);
      }
      
      if (isMobile && hasUserInteracted) {
        await player.setVolume(0.1);
        setVolume(10);
        setIsMuted(false);
        await player.play().catch((err: any) => {
          console.error('[MOBILE DEBUG] Failed to auto-start Vimeo on mobile:', err);
        });
      }

      player.on('play', () => {
        setIsPlaying(true);
        setIsBuffering(false);
        retryCountRef.current = 0;
      });

      player.on('pause', async () => {
        setIsPlaying(false);
      });

      player.on('bufferstart', () => {
        setIsBuffering(true);
      });

      player.on('bufferend', () => {
        setIsBuffering(false);
      });

      player.on('timeupdate', (data: { seconds: number }) => {
        setCurrentTime(data.seconds);
        setIsBuffering(false);
      });

      player.on('ended', () => {
        setIsPlaying(false);
      });

      player.on('error', (error: any) => {
        console.error('Vimeo player error:', error);
        setIsBuffering(false);
        
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          setTimeout(() => {
            player.loadVideo(getVideoId()).catch((err: any) => {
              console.error('Retry failed:', err);
            });
          }, 1000 * retryCountRef.current);
        }
      });

      startTimeSync();
    });

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      player.destroy();
    };
  }, [platform, shouldInitializePlayer]);

  const handleYouTubeReady = () => {
    setPlayerReady(true);
    setDuration(playerRef.current.getDuration());
    retryCountRef.current = 0;
    startTimeSync();
    
    if (initialTime > 0 && playerRef.current) {
      playerRef.current.seekTo(initialTime, true);
      console.log(`[YOUTUBE] Resumed from ${initialTime}s`);
    }
    
    if (isMobile && hasUserInteracted && playerRef.current) {
      playerRef.current.setVolume(10);
      setVolume(10);
      setIsMuted(false);
      playerRef.current.playVideo();
    }
  };

  const handleYouTubeStateChange = (event: any) => {
    const state = event.data;
    
    if (state === window.YT.PlayerState.PLAYING) {
      setIsPlaying(true);
      setIsBuffering(false);
      retryCountRef.current = 0;
      userInitiatedPauseRef.current = false;
    } else if (state === window.YT.PlayerState.PAUSED) {
      setIsPlaying(false);
    } else if (state === window.YT.PlayerState.ENDED) {
      setIsPlaying(false);
    } else if (state === window.YT.PlayerState.BUFFERING) {
      setIsBuffering(true);
    }
  };

  const handleYouTubeError = (event: any) => {
    console.error('YouTube player error:', event.data);
    setIsBuffering(false);
    
    const errorCode = event.data;
    
    if (retryCountRef.current < maxRetries && (errorCode === 5 || errorCode === 2)) {
      retryCountRef.current++;
      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.loadVideoById(getVideoId());
        }
      }, 1000 * retryCountRef.current);
    }
  };

  const getCurrentPlayerTime = async (): Promise<number> => {
    if (!playerRef.current) return 0;

    if (platform === 'youtube') {
      return playerRef.current.getCurrentTime();
    } else if (platform === 'vimeo') {
      return await playerRef.current.getCurrentTime();
    }
    return 0;
  };

  const startTimeSync = () => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    syncIntervalRef.current = setInterval(async () => {
      const videoTime = await getCurrentPlayerTime();
      setCurrentTime(videoTime);
    }, 100);
  };

  const togglePlay = async () => {
    if (!playerRef.current || !playerReady) return;

    if (isPlaying) {
      userInitiatedPauseRef.current = true;
      
      if (platform === 'youtube') {
        playerRef.current.pauseVideo();
      } else if (platform === 'vimeo') {
        await playerRef.current.pause();
      }
    } else {
      userInitiatedPauseRef.current = false;
      
      if (platform === 'youtube') {
        playerRef.current.playVideo();
      } else if (platform === 'vimeo') {
        await playerRef.current.play();
      }
    }
  };

  const toggleMute = async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);

    if (platform === 'youtube' && playerRef.current) {
      if (newMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
    } else if (platform === 'vimeo' && playerRef.current) {
      await playerRef.current.setVolume(newMuted ? 0 : volume / 100);
    }
  };

  const handleVolumeChange = async (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);

    if (platform === 'youtube' && playerRef.current) {
      playerRef.current.setVolume(newVolume);
    } else if (platform === 'vimeo' && playerRef.current) {
      await playerRef.current.setVolume(newVolume / 100);
    }

    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
      
      if (platform === 'youtube' && playerRef.current) {
        playerRef.current.unMute();
      } else if (platform === 'vimeo' && playerRef.current) {
        await playerRef.current.setVolume(newVolume / 100);
      }
    }
  };

  const handleSeek = async (value: number[]) => {
    const newTime = value[0];
    setCurrentTime(newTime);

    if (platform === 'youtube' && playerRef.current) {
      playerRef.current.seekTo(newTime, true);
    } else if (platform === 'vimeo' && playerRef.current) {
      await playerRef.current.setCurrentTime(newTime);
    }
  };

  const handleSkipIntro = async () => {
    if (skipState.skipIntroTo === null) return;
    const newTime = skipState.skipIntroTo;
    setCurrentTime(newTime);

    if (platform === 'youtube' && playerRef.current) {
      playerRef.current.seekTo(newTime, true);
    } else if (platform === 'vimeo' && playerRef.current) {
      await playerRef.current.setCurrentTime(newTime);
    }
  };

  const handleSkipCredits = async () => {
    if (skipState.skipCreditsTo === null) return;
    const newTime = skipState.skipCreditsTo;
    setCurrentTime(newTime);

    if (platform === 'youtube' && playerRef.current) {
      playerRef.current.seekTo(newTime, true);
    } else if (platform === 'vimeo' && playerRef.current) {
      await playerRef.current.setCurrentTime(newTime);
    }
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

  // Track fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // For platforms without enhanced player support, show simple iframe
  if (!supportsEnhancedPlayer) {
    return (
      <div 
        ref={containerRef}
        className="relative bg-black rounded-md overflow-hidden aspect-video"
        data-testid="iframe-video-player"
      >
        <iframe
          ref={iframeRef}
          src={embedUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          title={title}
        />
        
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

  // Mobile gate - show play button overlay before initializing player
  if (isMobile && !hasUserInteracted) {
    return (
      <div 
        ref={containerRef}
        className="relative bg-black rounded-md overflow-hidden aspect-video flex items-center justify-center cursor-pointer"
        onClick={() => setHasUserInteracted(true)}
        data-testid="iframe-video-player"
      >
        <div className="text-center">
          <Button
            size="icon"
            variant="default"
            className="h-20 w-20 rounded-full"
            data-testid="button-play-initial"
          >
            <Play className="h-10 w-10" fill="currentColor" />
          </Button>
          <p className="text-white/70 mt-4 text-sm">Tap to play</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-md overflow-hidden aspect-video group"
      data-testid="iframe-video-player"
    >
      <div 
        ref={iframeRef}
        className="w-full h-full"
      />

      {/* Custom controls overlay for enhanced platforms */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onMouseMove={() => setShowControls(true)}
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
                disabled={!playerReady}
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

      {/* Play button overlay when paused */}
      {!isPlaying && playerReady && !isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Button
            size="icon"
            variant="default"
            onClick={togglePlay}
            className="h-16 w-16 rounded-full pointer-events-auto"
            data-testid="button-play-center"
          >
            <Play className="h-8 w-8" fill="currentColor" />
          </Button>
        </div>
      )}

      {/* Buffering indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <span className="text-white text-sm">Buffering...</span>
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
