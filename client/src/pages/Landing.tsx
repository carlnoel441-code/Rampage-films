import { Button } from "@/components/ui/button";
import { Film, Play, Sparkles } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold text-primary">Rampage Films</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-3xl text-center space-y-8">
          <div className="space-y-4">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                <Film className="w-24 h-24 text-primary relative" />
              </div>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-foreground">
              Welcome to <span className="text-primary">Rampage Films</span>
            </h1>
            
            <p className="text-xl text-foreground/70 max-w-2xl mx-auto">
              Discover rare and hard-to-find movies. Stream cult classics, indie gems, 
              and forgotten films in our premium collection.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg" 
              className="gap-2 min-w-[200px]"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-login"
            >
              <Play className="w-5 h-5" />
              Get Started
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12">
            <div className="space-y-2">
              <div className="bg-card border border-border rounded-md p-6 hover-elevate">
                <Film className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground">Rare Collection</h3>
                <p className="text-sm text-foreground/60">
                  Access movies you won't find anywhere else
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="bg-card border border-border rounded-md p-6 hover-elevate">
                <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground">Premium Quality</h3>
                <p className="text-sm text-foreground/60">
                  High-quality streaming with minimal ads
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="bg-card border border-border rounded-md p-6 hover-elevate">
                <Play className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-foreground">Easy Access</h3>
                <p className="text-sm text-foreground/60">
                  Sign in with Google, GitHub, or email
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-6">
        <div className="container mx-auto px-4 text-center text-sm text-foreground/60">
          <p>&copy; {new Date().getFullYear()} Rampage Films. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
