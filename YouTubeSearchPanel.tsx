import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, ExternalLink, Lightbulb } from "lucide-react";
import { useYouTubeSearch } from "./useYouTubeSearch";

interface YouTubeSearchPanelProps {
  onSelectVideo: (videoUrl: string, videoTitle: string) => void;
}

export function YouTubeSearchPanel({ onSelectVideo }: YouTubeSearchPanelProps) {
  const { query, setQuery, results, isSearching, handleSearch, clearResults } = useYouTubeSearch();

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="mb-12">
      <h2 className="text-2xl md:text-3xl font-serif font-bold mb-4 text-primary">
        <Search className="inline-block h-8 w-8 mr-2 mb-1" />
        Search YouTube Videos
      </h2>
      <Card className="p-6 border-primary/20">
        <p className="text-foreground/70 mb-4">
          Search for videos on YouTube and click to add the video URL to your movie form instantly.
        </p>

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Search for movie trailers or full movies..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isSearching}
            data-testid="input-youtube-search"
            className="flex-1"
          />
          <Button
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
            data-testid="button-youtube-search"
          >
            {isSearching ? (
              <>
                <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin mr-2" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search
              </>
            )}
          </Button>
          {results.length > 0 && (
            <Button
              variant="outline"
              onClick={clearResults}
              data-testid="button-clear-results"
            >
              Clear
            </Button>
          )}
        </div>

        {results.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-medium mb-3">
              Found {results.length} video{results.length !== 1 ? 's' : ''} - click to use:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((video) => (
                <Card
                  key={video.id}
                  className="overflow-hidden hover-elevate active-elevate-2 cursor-pointer transition-all"
                  onClick={() => onSelectVideo(video.videoUrl, video.title)}
                  data-testid={`youtube-result-${video.id}`}
                >
                  <div className="relative aspect-video">
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2">
                      <ExternalLink className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 
                      className="font-medium text-sm line-clamp-2 mb-1" 
                      title={video.title}
                      data-testid={`youtube-video-title-${video.id}`}
                    >
                      {video.title}
                    </h3>
                    <p 
                      className="text-xs text-foreground/60"
                      data-testid={`youtube-video-date-${video.id}`}
                    >
                      {new Date(video.publishedAt).toLocaleDateString()}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {!isSearching && results.length === 0 && query && (
          <p className="text-center text-foreground/60 py-4 text-sm">
            No videos found. Try a different search query.
          </p>
        )}

        <div className="mt-6 p-4 bg-card/50 rounded border">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Quick Tip:
          </h3>
          <p className="text-xs text-foreground/70">
            Search for movie titles, trailers, or full movies. Click any result to automatically
            add its YouTube URL to the video URL field above. The URL will be ready to use when
            you create or edit a movie!
          </p>
        </div>
      </Card>
    </div>
  );
}
