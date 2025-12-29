import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Film, Upload, DollarSign, Users, CheckCircle, ArrowRight, Star, Zap, Check } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const PRICING_TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for getting started",
    features: [
      "Upload up to 2 films",
      "70% revenue share on tips",
      "AI dubbing to 16 languages",
      "Global streaming reach",
      "Filmmaker profile page",
    ],
    limitations: [
      "Limited to 2 films",
    ],
    recommended: false,
  },
  {
    name: "Pro",
    price: "$14.99",
    period: "/month",
    yearlyPrice: "$149",
    description: "For serious filmmakers",
    features: [
      "Unlimited film uploads",
      "80% revenue share on tips",
      "Priority AI dubbing",
      "Featured placement opportunities",
      "Advanced analytics",
      "Priority support",
    ],
    limitations: [],
    recommended: true,
  },
];

const BENEFITS = [
  {
    icon: Upload,
    title: "Free Hosting",
    description: "Upload your films at no cost. We handle storage, streaming, and AI dubbing to 16 languages."
  },
  {
    icon: DollarSign,
    title: "Up to 80% Revenue Share",
    description: "Keep up to 80% of all viewer tips on your content with our Pro plan."
  },
  {
    icon: Users,
    title: "Global Audience",
    description: "Reach viewers worldwide with our AI-powered dubbing and subtitle support."
  },
  {
    icon: Film,
    title: "Premium Showcase",
    description: "Your films featured alongside rare cult classics and indie gems on our curated platform."
  }
];

export default function FilmmakerRegister() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const { data: user, isLoading: userLoading } = useQuery<any>({
    queryKey: ['/api/auth/user'],
  });

  const { data: existingFilmmaker } = useQuery<any>({
    queryKey: ['/api/filmmakers/me'],
    enabled: !!user,
    retry: false,
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { displayName: string; bio?: string; websiteUrl?: string }) => {
      const response = await apiRequest('/api/filmmakers/register', 'POST', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Registration failed');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: "Registration Successful!", 
        description: "Welcome to Rampage Films. Your account is pending approval."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/filmmakers/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/filmmakers/dashboard'] });
      setLocation('/filmmaker/dashboard');
    },
    onError: (error: any) => {
      toast({ 
        title: "Registration Failed", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast({ 
        title: "Display name required", 
        description: "Please enter your filmmaker name.",
        variant: "destructive" 
      });
      return;
    }
    registerMutation.mutate({
      displayName: displayName.trim(),
      bio: bio.trim() || undefined,
      websiteUrl: websiteUrl.trim() || undefined
    });
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 flex items-center justify-center">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 px-4 max-w-xl mx-auto text-center">
          <Film className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-4">Join as a Filmmaker</h1>
          <p className="text-muted-foreground mb-6">
            Sign in with your Replit account to register as a filmmaker and start sharing your films.
          </p>
          <Button onClick={() => window.location.href = '/api/login'} data-testid="button-signin">
            Sign In to Continue
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  if (existingFilmmaker) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 px-4 max-w-xl mx-auto text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-4">Already Registered!</h1>
          <p className="text-muted-foreground mb-6">
            You're already registered as a filmmaker. Head to your dashboard to manage your films.
          </p>
          <Button onClick={() => setLocation('/filmmaker/dashboard')} data-testid="button-go-dashboard">
            Go to Dashboard <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 px-4 md:px-8 lg:px-12 max-w-[1200px] mx-auto py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" data-testid="text-page-title">
            Share Your Films with the World
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Join Rampage Films as a filmmaker. Upload your content for free, 
            reach a global audience, and earn from viewer support.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {BENEFITS.map((benefit) => (
            <Card key={benefit.title} className="border-primary/10 hover-elevate">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <benefit.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">{benefit.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pricing Tiers Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-center mb-8" data-testid="text-pricing-title">
            Choose Your Plan
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {PRICING_TIERS.map((tier) => (
              <Card 
                key={tier.name} 
                className={`relative ${tier.recommended ? 'border-primary border-2' : 'border-border'}`}
                data-testid={`card-tier-${tier.name.toLowerCase()}`}
              >
                {tier.recommended && (
                  <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground">
                    <Star className="h-3 w-3 mr-1" /> Recommended
                  </Badge>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-4xl font-bold">{tier.price}</span>
                    <span className="text-muted-foreground">{tier.period}</span>
                  </div>
                  {tier.yearlyPrice && (
                    <p className="text-sm text-muted-foreground mt-1">
                      or {tier.yearlyPrice}/year (save 17%)
                    </p>
                  )}
                  <CardDescription className="mt-2">{tier.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-6">
            Start with Free and upgrade anytime from your dashboard
          </p>
        </div>

        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Film className="h-5 w-5 text-primary" />
              Filmmaker Registration
            </CardTitle>
            <CardDescription>
              Fill in your details to create your filmmaker account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name *</Label>
                <Input 
                  id="displayName"
                  placeholder="Your filmmaker name or studio name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  data-testid="input-display-name"
                />
                <p className="text-xs text-muted-foreground">
                  This is how viewers will see you on the platform
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea 
                  id="bio"
                  placeholder="Tell viewers about yourself and your films..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  data-testid="input-bio"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Website (optional)</Label>
                <Input 
                  id="websiteUrl"
                  type="url"
                  placeholder="https://yourwebsite.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  data-testid="input-website"
                />
              </div>

              <div className="bg-primary/5 rounded-lg p-4 border border-primary/10">
                <h4 className="font-medium mb-2">What happens next?</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>1. You'll start on the <strong>Free plan</strong> (2 films, 70% revenue share)</li>
                  <li>2. Your account will be reviewed by our team</li>
                  <li>3. Once approved, start uploading and earning!</li>
                  <li>4. Upgrade to Pro anytime from your dashboard</li>
                </ul>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={registerMutation.isPending}
                data-testid="button-register"
              >
                {registerMutation.isPending ? (
                  <>
                    <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin mr-2" />
                    Registering...
                  </>
                ) : (
                  <>Register as Filmmaker</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            By registering, you agree to our terms of service and confirm you have 
            the rights to distribute the content you upload.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
