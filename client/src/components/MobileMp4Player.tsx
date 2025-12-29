import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Subtitles } from "lucide-react";
import { useSkipSegments, type SkipSegments } from "@/hooks/useSkipSegments";
import SkipControlOverlay from "./SkipControlOverlay";
import AudioLanguageSelector from "./AudioLanguageSelector";
import DubbingRatingDialog from "./DubbingRatingDialog";
import { type DubbedAudioTrack } from "@shared/schema";

interface MobileMp4PlayerProps {
  mp4Url: string;
  title: string;
  subtitleUrl?: string | null;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onError?: (error: string) => void;
  initialTime?: number;
  skipSegments?: SkipSegments;
  movieId?: string;
}

export default function MobileMp4Player({
  mp4Url,
  title,
  subtitleUrl,
  onTimeUpdate,
  onDurationChange,
  onPlayingChange,
  onError,
  initialTime = 0,
  skipSegments = {},
  movieId,
}: MobileMp4PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dubbedAudioRef = useRef<HTMLAudioElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDubbedTrack, setSelectedDubbedTrack] = useState<DubbedAudioTrack | null>(null);
  const [dubbedAudioUrl, setDubbedAudioUrl] = useState<string | null>(null);
  const [dubbedAudioLoading, setDubbedAudioLoading] = useState(false);
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false);
  const [trackToRate, setTrackToRate] = useState<DubbedAudioTrack | null>(null);

  const hasSubtitles = !!subtitleUrl;

  const handleRateTrack = (track: DubbedAudioTrack) => {
    setTrackToRate(track);
    setRatingDialogOpen(true);
  };

  // Skip segments hook (for intro/credits)
  const skipState = useSkipSegments({
    segments: skipSegments,
    currentTime,
    duration,
  });

  // Set initial playback time
  useEffect(() => {
    if (videoRef.current && initialTime > 0) {
      videoRef.current.currentTime = initialTime;
    }
  }, [initialTime]);

  // Handle dubbed track selection - fetch the audio URL
  useEffect(() => {
    if (!selectedDubbedTrack) {
      setDubbedAudioUrl(null);
      return;
    }

    const fetchAudioUrl = async () => {
      setDubbedAudioLoading(true);
      try {
        const res = await fetch(`/api/dubbed-tracks/${selectedDubbedTrack.id}/stream`);
        if (res.ok) {
          const data = await res.json();
          setDubbedAudioUrl(data.url);
          console.log('[DUBBED AUDIO] Loaded audio URL for:', selectedDubbedTrack.languageName);
        } else {
          console.error('[DUBBED AUDIO] Failed to fetch audio URL');
          setDubbedAudioUrl(null);
        }
      } catch (error) {
        console.error('[DUBBED AUDIO] Error fetching audio URL:', error);
        setDubbedAudioUrl(null);
      } finally {
        setDubbedAudioLoading(false);
      }
    };

    fetchAudioUrl();
  }, [selectedDubbedTrack]);

  // Sync dubbed audio with video playback
  useEffect(() => {
    const video = videoRef.current;
    const audio = dubbedAudioRef.current;
    if (!video || !audio || !dubbedAudioUrl) return;

    const syncAudioToVideo = () => {
      if (Math.abs(audio.currentTime - video.currentTime) > 0.3) {
        audio.currentTime = video.currentTime;
      }
    };

    const handleVideoPlay = () => {
      audio.play().catch(e => console.warn('[DUBBED AUDIO] Autoplay blocked:', e));
    };

    const handleVideoPause = () => {
      audio.pause();
    };

    const handleVideoSeeking = () => {
      audio.currentTime = video.currentTime;
    };

    const handleVideoRateChange = () => {
      audio.playbackRate = video.playbackRate;
    };

    video.addEventListener('play', handleVideoPlay);
    video.addEventListener('pause', handleVideoPause);
    video.addEventListener('seeking', handleVideoSeeking);
    video.addEventListener('ratechange', handleVideoRateChange);
    video.addEventListener('timeupdate', syncAudioToVideo);

    // Initial sync
    audio.currentTime = video.currentTime;
    audio.playbackRate = video.playbackRate;
    if (!video.paused) {
      audio.play().catch(e => console.warn('[DUBBED AUDIO] Autoplay blocked:', e));
    }

    // When dubbed audio is active, reduce original video volume
    video.volume = 0.15;

    return () => {
      video.removeEventListener('play', handleVideoPlay);
      video.removeEventListener('pause', handleVideoPause);
      video.removeEventListener('seeking', handleVideoSeeking);
      video.removeEventListener('ratechange', handleVideoRateChange);
      video.removeEventListener('timeupdate', syncAudioToVideo);
      // Restore original volume when dubbed audio is disabled
      video.volume = 1.0;
    };
  }, [dubbedAudioUrl]);

  // Handle dubbed track change
  const handleSelectDubbedTrack = (track: DubbedAudioTrack | null) => {
    setSelectedDubbedTrack(track);
    if (!track && videoRef.current) {
      videoRef.current.volume = 1.0;
    }
  };

  // Sync events with parent component
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    };

    const handleDurationChange = () => {
      const dur = video.duration;
      setDuration(dur);
      onDurationChange?.(dur);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlayingChange?.(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPlayingChange?.(false);
    };

    const handleError = (e: Event) => {
      const videoEl = e.target as HTMLVideoElement;
      const error = videoEl.error;
      let errorMessage = 'Unknown video error';
      let errorCode = 0;
      
      if (error) {
        errorCode = error.code;
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = 'Video loading was aborted';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = 'Network error while loading video';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = 'Video file is corrupted or unsupported format';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Video format not supported or file not found';
            break;
        }
        // Include additional error details if available
        if (error.message) {
          errorMessage += ` - ${error.message}`;
        }
      }
      
      console.error('[VIDEO ERROR]', `Code: ${errorCode}`, errorMessage, error);
      console.error('[VIDEO ERROR] Source URL:', mp4Url?.substring(0, 150));
      console.error('[VIDEO ERROR] Network state:', videoEl.networkState, '| Ready state:', videoEl.readyState);
      setVideoError(errorMessage);
      setIsLoading(false);
      
      // Notify parent to potentially fallback to another player
      onError?.(errorMessage);
    };

    const handleCanPlay = () => {
      console.log('[VIDEO] Ready to play');
      setIsLoading(false);
      setVideoError(null);
    };

    const handleLoadStart = () => {
      console.log('[VIDEO] Loading started for:', mp4Url?.substring(0, 100));
      setIsLoading(true);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadstart', handleLoadStart);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadstart', handleLoadStart);
    };
  }, [onTimeUpdate, onDurationChange, onPlayingChange, mp4Url]);

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

  // Show error overlay if video failed to load
  if (videoError) {
    return (
      <div 
        className="relative bg-black rounded-md overflow-hidden aspect-video flex items-center justify-center"
        data-testid="mobile-mp4-player-error"
      >
        <div className="text-center p-6 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-white text-lg font-medium">Video Playback Error</p>
            <p className="text-white/60 text-sm mt-2">{videoError}</p>
          </div>
          <button
            onClick={() => {
              setVideoError(null);
              setIsLoading(true);
              // Force reload by updating the video src
              if (videoRef.current) {
                videoRef.current.load();
              }
            }}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            data-testid="button-retry-video"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-black rounded-md overflow-hidden aspect-video" data-testid="mobile-mp4-player">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-white/60 mt-4 text-sm">Loading video...</p>
          </div>
        </div>
      )}
      
      <video
        ref={videoRef}
        src={mp4Url}
        className="w-full h-full"
        controls
        playsInline
        data-testid="video-element"
        title={title}
      >
        {hasSubtitles && subtitleUrl && (
          <track
            kind="subtitles"
            src={subtitleUrl}
            srcLang="en"
            label="English"
            default={showSubtitles}
          />
        )}
      </video>

      {/* Dubbed audio element (hidden, synced with video) */}
      {dubbedAudioUrl && (
        <audio
          ref={dubbedAudioRef}
          src={dubbedAudioUrl}
          preload="auto"
          data-testid="dubbed-audio-element"
        />
      )}

      {/* Control buttons - top right */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {/* Audio language selector */}
        {movieId && (
          <AudioLanguageSelector
            movieId={movieId}
            selectedTrackId={selectedDubbedTrack?.id || null}
            onSelectTrack={handleSelectDubbedTrack}
            onRateTrack={handleRateTrack}
          />
        )}
        
        {/* Subtitle toggle button */}
        {hasSubtitles && (
          <Button
            size="icon"
            variant={showSubtitles ? "default" : "secondary"}
            onClick={() => setShowSubtitles(!showSubtitles)}
            className="bg-black/70 hover:bg-black/90 backdrop-blur-sm"
            data-testid="button-toggle-subtitles"
            title={showSubtitles ? "Hide Subtitles" : "Show Subtitles"}
          >
            <Subtitles className="w-5 h-5" />
          </Button>
        )}
      </div>
      
      {/* Dubbed audio loading indicator */}
      {dubbedAudioLoading && (
        <div className="absolute top-16 right-4 z-10 bg-black/70 backdrop-blur-sm rounded-md px-3 py-2 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-white text-xs">Loading audio...</span>
        </div>
      )}
      
      {/* Current dubbed language indicator */}
      {selectedDubbedTrack && !dubbedAudioLoading && (
        <div className="absolute top-16 right-4 z-10 bg-primary/80 backdrop-blur-sm rounded-md px-3 py-1">
          <span className="text-white text-xs font-medium">
            {selectedDubbedTrack.languageName}
          </span>
        </div>
      )}

      {/* Mobile-optimized overlay (title) */}
      <div className="absolute bottom-16 left-4 right-4 pointer-events-none">
        <h3 className="text-white text-lg font-semibold drop-shadow-lg">
          {title}
        </h3>
      </div>

      {/* Skip Intro/Credits Controls */}
      <SkipControlOverlay
        showSkipIntro={skipState.showSkipIntro}
        showSkipCredits={skipState.showSkipCredits}
        onSkipIntro={handleSkipIntro}
        onSkipCredits={handleSkipCredits}
      />

      {/* Dubbing Rating Dialog */}
      {movieId && (
        <DubbingRatingDialog
          track={trackToRate}
          open={ratingDialogOpen}
          onOpenChange={setRatingDialogOpen}
          movieId={movieId}
        />
      )}
    </div>
  );
}
