import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { type Movie } from "@shared/schema";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MovieCard from "@/components/MovieCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function SearchResults() {
  const search = useSearch();
  const query = new URLSearchParams(search).get("q") || "";
  const [, setLocation] = useLocation();

  const { data: movies, isLoading } = useQuery<Movie[]>({
    queryKey: [`/api/movies/search?q=${query}`],
    enabled: !!query,
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-16">
        <div className="px-4 md:px-8 lg:px-12 max-w-[1920px] mx-auto py-8">
          <Button
            variant="ghost"
            onClick={() => window.history.back()}
            className="mb-6 gap-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <h1 className="text-3xl md:text-4xl font-serif font-bold mb-8">
            Search Results for "{query}"
          </h1>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && movies && movies.length === 0 && (
            <div className="text-center py-12">
              <p className="text-foreground/70 text-lg">
                No movies found for "{query}"
              </p>
              <Button
                onClick={() => setLocation("/")}
                className="mt-4"
                data-testid="button-browse"
              >
                Browse All Movies
              </Button>
            </div>
          )}

          {!isLoading && movies && movies.length > 0 && (
            <>
              <p className="text-foreground/70 mb-6">
                Found {movies.length} {movies.length === 1 ? "movie" : "movies"}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {movies.map((movie) => (
                  <MovieCard
                    key={movie.id}
                    id={movie.id}
                    title={movie.title}
                    year={movie.year}
                    rating={movie.rating}
                    poster={movie.poster}
                    genre={movie.genres[0]}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <Footer />
      </div>
    </div>
  );
}
