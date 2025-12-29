import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type DubbedAudioTrack } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Languages, Check, Download, Loader2, Star, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AudioLanguageSelectorProps {
  movieId: string;
  selectedTrackId: string | null;
  onSelectTrack: (track: DubbedAudioTrack | null) => void;
  onRateTrack?: (track: DubbedAudioTrack) => void;
  className?: string;
}

export default function AudioLanguageSelector({
  movieId,
  selectedTrackId,
  onSelectTrack,
  onRateTrack,
  className = "",
}: AudioLanguageSelectorProps) {
  const { toast } = useToast();
  const [downloadingTrackId, setDownloadingTrackId] = useState<string | null>(null);

  const { data: dubbedTracks, isLoading, isError } = useQuery<DubbedAudioTrack[]>({
    queryKey: ['/api/movies', movieId, 'dubbed-tracks'],
    queryFn: async () => {
      const res = await fetch(`/api/movies/${movieId}/dubbed-tracks`);
      if (!res.ok) {
        throw new Error('Failed to load dubbed audio tracks');
      }
      return res.json();
    },
    enabled: !!movieId,
    staleTime: 30000,
    retry: 2,
  });

  const downloadMutation = useMutation({
    mutationFn: async (trackId: string) => {
      setDownloadingTrackId(trackId);
      const res = await fetch(`/api/dubbed-tracks/${trackId}/download`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to get download URL');
      }
      return res.json();
    },
    onSuccess: (data, trackId) => {
      const track = dubbedTracks?.find(t => t.id === trackId);
      if (data.url) {
        const link = document.createElement('a');
        link.href = data.url;
        link.download = `${track?.languageName || 'dubbed'}_audio.mp3`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({
          title: "Download Started",
          description: `Downloading ${track?.languageName || 'dubbed'} audio track`,
        });
      }
      setDownloadingTrackId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Download Failed",
        description: error.message,
        variant: "destructive",
      });
      setDownloadingTrackId(null);
    },
  });

  const completedTracks = dubbedTracks?.filter(t => t.status === 'completed') || [];

  if (isLoading) {
    return (
      <Button
        size="icon"
        variant="secondary"
        className={`bg-black/70 hover:bg-black/90 backdrop-blur-sm ${className}`}
        disabled
        data-testid="button-audio-language-loading"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
      </Button>
    );
  }

  if (isError) {
    return (
      <Button
        size="icon"
        variant="secondary"
        className={`bg-black/70 hover:bg-black/90 backdrop-blur-sm ${className}`}
        disabled
        title="Failed to load audio languages"
        data-testid="button-audio-language-error"
      >
        <AlertCircle className="w-5 h-5 text-destructive" />
      </Button>
    );
  }

  if (completedTracks.length === 0) {
    return null;
  }

  const formatRating = (rating: number | string | null) => {
    if (!rating) return null;
    const numRating = typeof rating === 'string' ? parseFloat(rating) : rating;
    return isNaN(numRating) ? null : numRating.toFixed(1);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant={selectedTrackId ? "default" : "secondary"}
          className={`bg-black/70 hover:bg-black/90 backdrop-blur-sm ${className}`}
          data-testid="button-audio-language"
          title="Audio Language"
        >
          <Languages className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onClick={() => onSelectTrack(null)}
          className="flex items-center justify-between"
          data-testid="menu-item-original-audio"
        >
          <span>Original Audio</span>
          {!selectedTrackId && <Check className="w-4 h-4 text-primary" />}
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        {completedTracks.map(track => (
          <div key={track.id} className="relative">
            <DropdownMenuItem
              onClick={() => onSelectTrack(track)}
              className="flex items-center justify-between pr-16"
              data-testid={`menu-item-audio-${track.languageCode}`}
            >
              <div className="flex items-center gap-2">
                <span>{track.languageName}</span>
                {track.averageRating && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Star className="w-3 h-3 fill-primary text-primary" />
                    {formatRating(track.averageRating)}
                  </span>
                )}
              </div>
              {selectedTrackId === track.id && <Check className="w-4 h-4 text-primary" />}
            </DropdownMenuItem>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {onRateTrack && selectedTrackId === track.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRateTrack(track);
                  }}
                  className="p-1 rounded hover:bg-accent"
                  title="Rate audio quality"
                  data-testid={`button-rate-audio-${track.languageCode}`}
                >
                  <Star className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  downloadMutation.mutate(track.id);
                }}
                disabled={downloadingTrackId === track.id}
                className="p-1 rounded hover:bg-accent"
                title="Download audio"
                data-testid={`button-download-audio-${track.languageCode}`}
              >
                {downloadingTrackId === track.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
