import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import MovieCard from "./MovieCard";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Collection, Movie } from "@shared/schema";

interface CollectionWithMovies extends Collection {
  movies?: Movie[];
}

interface CollectionRowItemProps {
  collection: CollectionWithMovies;
  movies: Movie[];
}

function CollectionRowItem({ collection, movies }: CollectionRowItemProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

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

  if (movies.length === 0) {
    return null;
  }

  return (
    <div className="group relative mb-8" data-testid={`collection-${collection.slug}`}>
      <div className="px-4 md:px-8 lg:px-12 mb-3">
        <Link href={`/collection/${collection.slug}`}>
          <h3 className="text-lg font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer flex items-center gap-2" data-testid={`text-collection-${collection.id}`}>
            {collection.title}
            <ChevronRight className="h-4 w-4" />
          </h3>
        </Link>
        {collection.description && (
          <p className="text-sm text-foreground/60 mt-1">{collection.description}</p>
        )}
      </div>

      {canScrollLeft && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm ml-2"
          onClick={() => scroll("left")}
          data-testid={`button-scroll-left-${collection.id}`}
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
            <MovieCard
              id={movie.id}
              title={movie.title}
              year={movie.year}
              rating={movie.rating}
              poster={movie.poster}
              genre={movie.genres[0]}
            />
          </div>
        ))}
      </div>

      {canScrollRight && movies.length > 3 && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm mr-2"
          onClick={() => scroll("right")}
          data-testid={`button-scroll-right-${collection.id}`}
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}

export default function CollectionsRow() {
  const { data: featuredCollections } = useQuery<CollectionWithMovies[]>({
    queryKey: ["/api/collections/featured"],
  });

  const { data: allMovies } = useQuery<Movie[]>({
    queryKey: ["/api/movies"],
  });

  if (!featuredCollections || featuredCollections.length === 0) {
    return null;
  }

  const collectionsWithMovies = featuredCollections.map(collection => {
    const movies = collection.movieIds
      ?.map(id => allMovies?.find(m => m.id === id))
      .filter((m): m is Movie => !!m) || [];
    return { ...collection, movies };
  }).filter(c => c.movies.length > 0);

  if (collectionsWithMovies.length === 0) {
    return null;
  }

  return (
    <div className="mb-12">
      <div className="flex items-center gap-2 mb-4 px-4 md:px-8 lg:px-12">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-xl md:text-2xl font-semibold">Curated Collections</h2>
      </div>

      {collectionsWithMovies.map((collection) => (
        <CollectionRowItem
          key={collection.id}
          collection={collection}
          movies={collection.movies}
        />
      ))}
    </div>
  );
}
