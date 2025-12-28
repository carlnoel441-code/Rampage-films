import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import MovieRow from "@/components/MovieRow";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import TrendingRow from "@/components/TrendingRow";
import RecommendationsRow from "@/components/RecommendationsRow";
import CollectionsRow from "@/components/CollectionsRow";
import WelcomeBanner from "@/components/WelcomeBanner";
import AdBanner from "@/components/AdBanner";
import SupportBanner from "@/components/SupportBanner";
import Footer from "@/components/Footer";
import { useQuery } from "@tanstack/react-query";
import { type Movie } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  const { user } = useAuth();
  const { data: allMovies, isLoading } = useQuery<Movie[]>({
    queryKey: ["/api/movies"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-foreground/70">Loading movies...</p>
        </div>
      </div>
    );
  }

  if (!allMovies || allMovies.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-foreground/70">No movies available</p>
        </div>
      </div>
    );
  }

  const heroMovies = allMovies
    .filter(m => m.viewCount > 0 || m.poster)
    .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
    .slice(0, 5)
    .map(m => ({
      id: m.id,
      title: m.title,
      description: m.description || "Discover this rare gem in our exclusive collection.",
      year: m.year,
      rating: m.rating,
      genres: m.genres,
      backdrop: m.backdrop || m.poster
    }));

  const thrillerMovies = allMovies.filter(m => 
    m.genres.some(g => g.toLowerCase().includes("thriller") || g.toLowerCase().includes("mystery"))
  ).map(m => ({
    id: m.id,
    title: m.title,
    year: m.year,
    rating: m.rating,
    poster: m.poster,
    genre: m.genres[0]
  }));

  const horrorMovies = allMovies.filter(m => 
    m.genres.some(g => g.toLowerCase().includes("horror") || g.toLowerCase().includes("supernatural"))
  ).map(m => ({
    id: m.id,
    title: m.title,
    year: m.year,
    rating: m.rating,
    poster: m.poster,
    genre: m.genres[0]
  }));

  const sciFiMovies = allMovies.filter(m => 
    m.genres.some(g => g.toLowerCase().includes("sci-fi") || g.toLowerCase().includes("cyberpunk"))
  ).map(m => ({
    id: m.id,
    title: m.title,
    year: m.year,
    rating: m.rating,
    poster: m.poster,
    genre: m.genres[0]
  }));

  const actionMovies = allMovies.filter(m => 
    m.genres.some(g => g.toLowerCase().includes("action") || g.toLowerCase().includes("crime"))
  ).map(m => ({
    id: m.id,
    title: m.title,
    year: m.year,
    rating: m.rating,
    poster: m.poster,
    genre: m.genres[0]
  }));

  const staffPicks = allMovies
    .filter(m => m.poster && m.description)
    .slice(0, 6);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-16">
        {heroMovies.length > 0 && <HeroSection movies={heroMovies} />}
        
        <WelcomeBanner featuredMovies={staffPicks} />
        
        <SupportBanner />
        
        <div className="py-8 space-y-8">
          {user && <ContinueWatchingRow />}
          <CollectionsRow />
          <TrendingRow />
          {user && <RecommendationsRow />}
          {thrillerMovies.length > 0 && <MovieRow title="Thrillers & Mystery" movies={thrillerMovies} autoFocus={true} />}
          {sciFiMovies.length > 0 && <MovieRow title="Sci-Fi Classics" movies={sciFiMovies} />}
          <AdBanner />
          {horrorMovies.length > 0 && <MovieRow title="Horror & Supernatural" movies={horrorMovies} />}
          {actionMovies.length > 0 && <MovieRow title="Action & Crime" movies={actionMovies} />}
        </div>
        <Footer />
      </div>
    </div>
  );
}
