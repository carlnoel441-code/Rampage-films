import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import MovieCard from "./MovieCard";
import { useRef, useState, useEffect } from "react";
import { useIsTVMode } from "@/utils/tvDetection";

interface Movie {
  id: string;
  title: string;
  year: string;
  rating: string;
  poster: string;
  genre?: string;
}

interface MovieRowProps {
  title: string;
  movies: Movie[];
  autoFocus?: boolean;
}

export default function MovieRow({ title, movies, autoFocus = false }: MovieRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const isTV = useIsTVMode();

  // Auto-focus first card in TV mode
  useEffect(() => {
    if (isTV && autoFocus && scrollRef.current) {
      const firstFocusable = scrollRef.current.querySelector<HTMLElement>('[tabindex="0"]');
      if (firstFocusable) {
        // Small delay to ensure rendering is complete
        setTimeout(() => firstFocusable.focus(), 100);
      }
    }
  }, [isTV, autoFocus]);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
      setTimeout(checkScroll, 300);
    }
  };

  return (
    <div className="group relative mb-12" data-testid={`row-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <h2 className="text-xl md:text-2xl font-semibold mb-4 px-4 md:px-8 lg:px-12">
        {title}
      </h2>

      {canScrollLeft && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm ml-2"
          onClick={() => scroll("left")}
          data-testid="button-scroll-left"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
      )}

      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-4 overflow-x-auto scrollbar-hide px-4 md:px-8 lg:px-12 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        data-tv-nav
      >
        {movies.map((movie) => (
          <div key={movie.id} className="flex-none w-[150px] sm:w-[180px] md:w-[200px] snap-start">
            <MovieCard {...movie} />
          </div>
        ))}
      </div>

      {canScrollRight && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm mr-2"
          onClick={() => scroll("right")}
          data-testid="button-scroll-right"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}
