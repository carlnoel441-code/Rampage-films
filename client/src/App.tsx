import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { useAuth } from "@/hooks/useAuth";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { IntroAnimation } from "@/components/IntroAnimation";
import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import MovieDetail from "@/pages/MovieDetail";
import SearchResults from "@/pages/SearchResults";
import MyList from "@/pages/MyList";
import GenrePage from "@/pages/GenrePage";
import AllGenres from "@/pages/AllGenres";
import TVAccess from "@/pages/TVAccess";
import Admin from "@/pages/Admin";
import Analytics from "@/pages/Analytics";
import BulkImport from "@/pages/BulkImport";
import Discovery from "@/pages/Discovery";
import ReviewQueue from "@/pages/ReviewQueue";
import JobsDashboard from "@/pages/JobsDashboard";
import AdminCollections from "@/pages/AdminCollections";
import AdminStorage from "@/pages/AdminStorage";
import VideoManagement from "@/pages/VideoManagement";
import FilmmakerDashboard from "@/pages/FilmmakerDashboard";
import FilmmakerRegister from "@/pages/FilmmakerRegister";
import FilmmakerUpload from "@/pages/FilmmakerUpload";
import FilmmakerProfile from "@/pages/FilmmakerProfile";
import AdminSponsors from "@/pages/AdminSponsors";
import AdminDubbing from "@/pages/AdminDubbing";
import MovieIdentifier from "@/pages/MovieIdentifier";
import TipSuccess from "@/pages/TipSuccess";
import Support from "@/pages/Support";
import NotFound from "@/pages/not-found";
import ProfileSelector from "@/pages/ProfileSelector";

function Router() {
  const { isAuthenticated } = useAuth();

  return (
    <Switch>
      <Route path="/admin" component={Admin} />
      <Route path="/admin/analytics" component={Analytics} />
      <Route path="/admin/bulk-import" component={BulkImport} />
      <Route path="/admin/discovery" component={Discovery} />
      <Route path="/admin/review-queue" component={ReviewQueue} />
      <Route path="/admin/jobs" component={JobsDashboard} />
      <Route path="/admin/collections" component={AdminCollections} />
      <Route path="/admin/storage" component={AdminStorage} />
      <Route path="/admin/videos" component={VideoManagement} />
      <Route path="/admin/sponsors" component={AdminSponsors} />
      <Route path="/admin/dubbing" component={AdminDubbing} />
      <Route path="/admin/identify" component={MovieIdentifier} />
      <Route path="/tip-success" component={TipSuccess} />
      <Route path="/support" component={Support} />
      <Route path="/filmmaker/register" component={FilmmakerRegister} />
      <Route path="/filmmaker/upload" component={FilmmakerUpload} />
      <Route path="/filmmaker/dashboard" component={FilmmakerDashboard} />
      <Route path="/filmmaker/:id" component={FilmmakerProfile} />
      {!isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/profiles" component={ProfileSelector} />
          <Route path="/" component={Home} />
          <Route path="/movie/:id" component={MovieDetail} />
          <Route path="/search" component={SearchResults} />
          <Route path="/my-list" component={MyList} />
          <Route path="/genres" component={AllGenres} />
          <Route path="/genre/:genre" component={GenrePage} />
          <Route path="/tv-access" component={TVAccess} />
          <Route path="/filmmaker" component={FilmmakerDashboard} />
          
        </>
      )}
      <Route path="/tv-access" component={TVAccess} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  // Skip intro for admin pages
  const isAdminPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
  
  // Initialize from sessionStorage to avoid blank frame flash
  const [showIntro, setShowIntro] = useState(() => {
    if (isAdminPage) return false; // Skip intro for admin
    try {
      return !sessionStorage.getItem('rampage-intro-seen');
    } catch {
      return true;
    }
  });
  const [introComplete, setIntroComplete] = useState(() => {
    if (isAdminPage) return true; // Admin pages ready immediately
    try {
      return !!sessionStorage.getItem('rampage-intro-seen');
    } catch {
      return false;
    }
  });

  const handleIntroComplete = () => {
    sessionStorage.setItem('rampage-intro-seen', 'true');
    setShowIntro(false);
    setIntroComplete(true);
  };

  return (
    <>
      {showIntro && <IntroAnimation onComplete={handleIntroComplete} />}
      {introComplete && (
        <>
          <Toaster />
          <PWAInstallPrompt />
          <Router />
        </>
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>
        <TooltipProvider>
          <AppContent />
        </TooltipProvider>
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
