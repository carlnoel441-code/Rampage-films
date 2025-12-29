import { Search, Bell, User, Shield, LogOut, Heart, UserCircle, Film, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export default function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const { isAuthorized } = useAdminAuth();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { currentProfile } = useProfile({ enabled: isAuthenticated && !isLoading });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-primary/20">
      <div className="flex items-center justify-between h-16 px-4 md:px-8 lg:px-12 max-w-[1920px] mx-auto">
        <div className="flex items-center gap-8">
          <h1 
            className="text-2xl font-serif font-bold text-primary cursor-pointer"
            onClick={() => setLocation("/")}
          >
            RAMPAGE FILMS
          </h1>
          <nav className="hidden md:flex items-center gap-6">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} data-testid="button-home">
              Home
            </Button>
            {user && (
              <Button variant="ghost" size="sm" onClick={() => setLocation("/my-list")} data-testid="button-mylist" className="gap-1">
                <Heart className="h-4 w-4" />
                My List
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} data-testid="button-movies">
              Movies
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/genres")} data-testid="button-genres">
              Genres
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} data-testid="button-new">
              New Releases
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setLocation("/support")} 
              data-testid="button-support"
              className="gap-1 text-primary/80 hover:text-primary"
            >
              <Heart className="h-4 w-4" />
              Support
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setLocation("/ai-assistant")} 
              data-testid="button-ai-assistant"
              className="gap-1 text-primary/80 hover:text-primary"
            >
              <Bot className="h-4 w-4" />
              AI Assistant
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setLocation("/filmmaker/register")} 
              data-testid="button-filmmaker"
              className="gap-1 text-primary/80 hover:text-primary"
            >
              <Film className="h-4 w-4" />
              For Filmmakers
            </Button>
            {isAuthorized && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setLocation("/admin")} 
                data-testid="button-admin"
                className="gap-2 text-primary"
              >
                <Shield className="h-4 w-4" />
                Admin
              </Button>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <form onSubmit={handleSearch} className="hidden sm:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search movies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[200px] lg:w-[300px] bg-card border-primary/20 focus:border-primary"
                data-testid="input-search"
              />
            </div>
          </form>
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={() => {
              const query = prompt("Search for movies:");
              if (query?.trim()) {
                setLocation(`/search?q=${encodeURIComponent(query.trim())}`);
              }
            }}
            data-testid="button-search-mobile" 
            className="sm:hidden"
          >
            <Search className="h-5 w-5" />
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={() => setLocation("/filmmaker/register")}
            data-testid="button-filmmaker-mobile"
            className="md:hidden"
          >
            <Film className="h-5 w-5 text-primary" />
          </Button>
          <Button size="icon" variant="ghost" data-testid="button-notifications">
            <Bell className="h-5 w-5" />
          </Button>
          
          {user && (
            <div className="flex items-center gap-2">
              {currentProfile && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLocation("/profiles")}
                  data-testid="button-switch-profile"
                  className="gap-2 hidden sm:flex"
                >
                  <UserCircle className="h-4 w-4" />
                  <span>{currentProfile.name}</span>
                </Button>
              )}
              
              <Avatar 
                className="h-8 w-8 cursor-pointer hover-elevate" 
                data-testid="avatar-user"
                onClick={() => setLocation("/profiles")}
              >
                {user.profileImageUrl && (
                  <AvatarImage src={user.profileImageUrl} alt={user.email || "User"} style={{ objectFit: "cover" }} />
                )}
                <AvatarFallback>
                  {user.firstName?.[0]}{user.lastName?.[0] || user.email?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => window.location.href = "/api/logout"}
                data-testid="button-logout"
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden md:inline">Logout</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
