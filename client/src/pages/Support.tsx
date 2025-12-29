import { Heart, Film, Globe, Users, Sparkles, Coffee, Gift, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TipJar, { RecentSupporters } from "@/components/TipJar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Support() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 pb-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/">
            <Button variant="ghost" className="mb-6 gap-2" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4" />
              Back to Movies
            </Button>
          </Link>

          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-4">
              <Heart className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              Support Rampage Films
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Rampage Films is and will always be <span className="text-foreground font-semibold">completely free</span> for everyone. 
              No subscriptions, no paywalls, no hidden fees.
            </p>
          </div>

          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background mb-8">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-2">This Is 100% Optional</h2>
                  <p className="text-muted-foreground">
                    We want to be crystal clear: <strong className="text-foreground">you never have to pay anything</strong> to use Rampage Films. 
                    Watch all movies, access all features, enjoy everything we offer - completely free, forever. 
                    If you choose to support us, that's wonderful, but please only do so if you genuinely want to and are able to. 
                    Your enjoyment of our platform matters most to us.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <Card className="border-card-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Film className="h-5 w-5 text-primary" />
                  Discover Rare Films
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Tips help us license and restore rare, forgotten, and hard-to-find movies that 
                  mainstream platforms ignore. Every contribution helps bring more hidden gems to light.
                </p>
              </CardContent>
            </Card>

            <Card className="border-card-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  Free AI Dubbing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  We offer movies dubbed in 16 languages using AI technology - completely free. 
                  Support helps us cover the costs of processing and storage for these audio tracks.
                </p>
              </CardContent>
            </Card>

            <Card className="border-card-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Support Filmmakers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  When filmmakers upload their work, 70% of any tips go directly to them. 
                  You're supporting independent creators and helping them continue making films.
                </p>
              </CardContent>
            </Card>

            <Card className="border-card-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coffee className="h-5 w-5 text-primary" />
                  Keep It Running
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Server costs, storage, bandwidth - these add up quickly. Your optional support 
                  helps keep the lights on so we can continue offering everything for free.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div className="space-y-6">
              <div className="text-center md:text-left">
                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 justify-center md:justify-start">
                  <Gift className="h-6 w-6 text-primary" />
                  Leave a Tip
                </h2>
                <p className="text-muted-foreground mb-4">
                  If you enjoy Rampage Films and want to help out, you can leave a tip of any amount. 
                  Every little bit helps, but again - only if you want to!
                </p>
              </div>
              
              <div className="flex justify-center md:justify-start">
                <TipJar 
                  variant="button" 
                  buttonText="Support the Platform" 
                  className="text-lg px-8 py-6"
                />
              </div>

              <p className="text-xs text-muted-foreground text-center md:text-left">
                Secure payments powered by Stripe. We never store your payment details.
              </p>
            </div>

            <div>
              <RecentSupporters limit={5} />
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-card-border text-center">
            <p className="text-muted-foreground">
              Thank you for being part of our community. Whether you tip or not, 
              we're grateful you're here enjoying rare cinema with us.
            </p>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
