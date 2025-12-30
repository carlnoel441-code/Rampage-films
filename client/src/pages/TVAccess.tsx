import { useLocation } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Tv, Smartphone, Monitor, Cast } from "lucide-react";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";

export default function TVAccess() {
  const [, setLocation] = useLocation();
  
  // Enable keyboard/D-pad navigation for TV users
  useKeyboardNavigation({
    enabled: true,
    onBack: () => setLocation("/"),
  });

  const tvBrands = [
    {
      name: "Samsung Smart TV",
      icon: Tv,
      steps: [
        "Press the 'Home' button on your remote",
        "Navigate to 'Internet' or 'Web Browser' app",
        "Enter the Rampage Films URL in the address bar",
        "Bookmark the page for easy access",
        "Tip: Use the arrow keys on your remote to navigate"
      ]
    },
    {
      name: "LG webOS TV",
      icon: Tv,
      steps: [
        "Press the 'Home' button on your Magic Remote",
        "Open the 'Web Browser' app",
        "Navigate to Rampage Films URL",
        "Add to favorites by clicking the star icon",
        "Pin to home screen for quick access"
      ]
    },
    {
      name: "Android TV / Google TV",
      icon: Tv,
      steps: [
        "Open the Google Play Store",
        "Search for 'Chrome' or use built-in browser",
        "Launch Chrome and navigate to our URL",
        "Sign in to sync with your account",
        "Use voice search: 'Open Rampage Films'"
      ]
    },
    {
      name: "Amazon Fire TV",
      icon: Tv,
      steps: [
        "Go to 'Apps & Channels' from home screen",
        "Search for 'Silk Browser' or 'Firefox'",
        "Open the browser and enter our URL",
        "Add bookmark to home screen",
        "Use Alexa: 'Open Rampage Films in browser'"
      ]
    },
    {
      name: "Apple TV",
      icon: Tv,
      steps: [
        "Note: Apple TV doesn't have a browser",
        "Use AirPlay from iPhone/iPad/Mac instead",
        "Open Rampage Films on your device",
        "Tap the AirPlay icon",
        "Select your Apple TV to cast"
      ]
    },
    {
      name: "Roku TV",
      icon: Tv,
      steps: [
        "Note: Roku has limited browser support",
        "Best option: Use screen mirroring",
        "Open Rampage Films on phone/tablet",
        "Enable screen mirroring on Roku",
        "Mirror your device screen to TV"
      ]
    }
  ];

  const castingOptions = [
    {
      name: "Chromecast",
      icon: Cast,
      description: "Built into most modern TVs and available as a device"
    },
    {
      name: "AirPlay",
      icon: Smartphone,
      description: "Cast from iPhone, iPad, or Mac to Apple TV"
    },
    {
      name: "Screen Mirroring",
      icon: Monitor,
      description: "Mirror your device screen wirelessly to your TV"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-16">
        <div className="px-4 md:px-8 lg:px-12 max-w-[1400px] mx-auto py-12">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="mb-6 gap-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>

          <div className="mb-12 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Tv className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4" data-testid="text-tv-access-title">
              Watch on Your Smart TV
            </h1>
            <p className="text-foreground/70 text-lg max-w-2xl mx-auto">
              Rampage Films is accessible on all major smart TV platforms through their web browsers.
              Follow the instructions below for your TV brand.
            </p>
          </div>

          {/* Quick URL Display */}
          <Card className="mb-12 max-w-2xl mx-auto bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-center">Your Access URL</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-background rounded-md p-4 text-center">
                <code className="text-lg md:text-xl font-mono text-primary" data-testid="text-app-url">
                  {window.location.origin}
                </code>
              </div>
              <p className="text-center text-sm text-foreground/60 mt-3">
                Enter this URL in your TV's web browser
              </p>
            </CardContent>
          </Card>

          {/* TV Brand Instructions */}
          <div className="mb-12">
            <h2 className="text-2xl font-serif font-bold mb-6">Setup Instructions by Brand</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {tvBrands.map((brand) => {
                const Icon = brand.icon;
                return (
                  <Card key={brand.name} data-testid={`card-tv-${brand.name.toLowerCase().replace(/\s+/g, '-')}`}>
                    <CardHeader>
                      <div className="flex items-center gap-3 mb-2">
                        <Icon className="h-6 w-6 text-primary" />
                        <CardTitle>{brand.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ol className="space-y-2">
                        {brand.steps.map((step, index) => (
                          <li key={index} className="flex gap-3">
                            <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                              {index + 1}
                            </span>
                            <span className="text-foreground/80 pt-0.5">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Casting Options */}
          <div className="mb-12">
            <h2 className="text-2xl font-serif font-bold mb-6">Alternative: Cast from Your Device</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {castingOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <Card key={option.name} data-testid={`card-cast-${option.name.toLowerCase().replace(/\s+/g, '-')}`}>
                    <CardHeader>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">{option.name}</CardTitle>
                      </div>
                      <CardDescription>{option.description}</CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Tips Section */}
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle>Tips for the Best TV Experience</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex gap-3">
                  <span className="text-primary">•</span>
                  <span className="text-foreground/80">
                    <strong>Bookmark the page</strong> on your TV browser for quick access
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary">•</span>
                  <span className="text-foreground/80">
                    <strong>Use arrow keys</strong> on your TV remote to navigate between movies
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary">•</span>
                  <span className="text-foreground/80">
                    <strong>Press OK/Enter</strong> on your remote to select movies and play videos
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary">•</span>
                  <span className="text-foreground/80">
                    <strong>Use Back button</strong> to return to the previous page
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary">•</span>
                  <span className="text-foreground/80">
                    <strong>Stable internet connection</strong> required (WiFi or Ethernet recommended)
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <div className="mt-12 text-center">
            <Button
              size="lg"
              onClick={() => setLocation("/")}
              className="gap-2"
              data-testid="button-start-watching"
            >
              <Tv className="h-5 w-5" />
              Start Watching Now
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
