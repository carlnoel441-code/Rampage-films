import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MovieCard from "@/components/MovieCard";
import { useWatchlist } from "@/hooks/use-watchlist";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Heart } from "lucide-react";

export default function MyList() {
  const { user } = useAuth();
  const { watchlist, isLoading: watchlistLoading } = useWatchlist();
  const [, setLocation] = useLocation();

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-16 flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <Heart className="h-16 w-16 mx-auto text-foreground/30" />
            <h2 className="text-2xl font-serif font-bold">Sign In to See Your List</h2>
            <p className="text-foreground/70">Create a watchlist of your favorite movies</p>
            <Button onClick={() => setLocation("/")} data-testid="button-home">
              Browse Movies
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (watchlistLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-16 flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-foreground/70">Loading your list...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-16">
        <div className="px-4 md:px-8 lg:px-12 max-w-[1920px] mx-auto py-12">
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-serif font-bold mb-2" data-testid="text-page-title">
              My List
            </h1>
            <p className="text-foreground/70 text-lg">
              {watchlist.length} {watchlist.length === 1 ? 'movie' : 'movies'} in your watchlist
            </p>
          </div>

          {watchlist.length === 0 ? (
            <div className="text-center py-20 space-y-4">
              <Heart className="h-20 w-20 mx-auto text-foreground/20" />
              <h2 className="text-2xl font-serif font-bold text-foreground/70">Your List is Empty</h2>
              <p className="text-foreground/60">
                Add movies to your list by clicking the heart icon on any movie
              </p>
              <Button onClick={() => setLocation("/")} data-testid="button-browse">
                Browse Movies
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {watchlist.map((movie) => (
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
          )}
        </div>
        <Footer />
      </div>
    </div>
  );
}
