import { Play, Plus, Heart, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useLocation } from "wouter";
import { useWatchlist } from "@/hooks/use-watchlist";
import { useAuth } from "@/hooks/useAuth";

interface MovieCardProps {
  id: string;
  title: string;
  year: string;
  rating: string;
  poster: string;
  genre?: string;
  onPlay?: () => void;
}

export default function MovieCard({
  id,
  title,
  year,
  rating,
  poster,
  genre,
  onPlay,
}: MovieCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toggleWatchlist, isInWatchlist: checkInWatchlist } = useWatchlist();
  const isInWatchlist = user ? checkInWatchlist(id) : false;

  const handleAddToWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (user) {
      toggleWatchlist(id, isInWatchlist);
    }
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPlay) {
      onPlay();
    } else {
      setLocation(`/movie/${id}`);
    }
    console.log('Playing:', title);
  };

  const handleCardClick = () => {
    setLocation(`/movie/${id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  return (
    <div
      className="group relative aspect-[2/3] rounded-md overflow-hidden hover-elevate active-elevate-2 cursor-pointer transition-transform hover:scale-105"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Play ${title}`}
      data-testid={`card-movie-${id}`}
    >
      <img
        src={poster}
        alt={title}
        className="w-full h-full object-cover"
      />
      
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
        isHovered ? 'opacity-0' : 'opacity-100'
      }`}>
        <div className="bg-primary/90 rounded-full p-3 shadow-lg">
          <Play className="h-6 w-6 text-primary-foreground" fill="currentColor" />
        </div>
      </div>
      
      {user && (
        <Button
          size="icon"
          variant="ghost"
          className={`absolute top-2 right-2 bg-background/80 backdrop-blur-sm transition-opacity ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={handleAddToWatchlist}
          data-testid={`button-watchlist-${id}`}
        >
          <Heart className={`h-4 w-4 ${isInWatchlist ? 'fill-primary text-primary' : ''}`} />
        </Button>
      )}

      <div
        className={`absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent transition-opacity ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
          <h3 className="font-semibold text-sm line-clamp-2" data-testid={`text-title-${id}`}>
            {title}
          </h3>
          <div className="flex items-center gap-2 text-xs text-foreground/70">
            <span>{year}</span>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-primary text-primary" />
              <span>{rating}</span>
            </div>
          </div>
          {genre && (
            <Badge variant="secondary" className="text-xs">
              {genre}
            </Badge>
          )}
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={handlePlay}
            data-testid={`button-play-${id}`}
          >
            <Play className="h-3 w-3" fill="currentColor" />
            Play
          </Button>
        </div>
      </div>
    </div>
  );
}
