import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Heart, Home, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SessionResult {
  success: boolean;
  status: string;
  tipType?: string;
  amount?: number;
}

export default function TipSuccess() {
  const [, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session_id');
    if (sid) {
      setSessionId(sid);
    }
  }, []);

  const { data: session, isLoading } = useQuery<SessionResult>({
    queryKey: ['/api/stripe/verify-session', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/stripe/verify-session/${sessionId}`);
      if (!response.ok) throw new Error('Failed to verify session');
      return response.json();
    },
    enabled: !!sessionId,
    retry: 3,
    retryDelay: 1000,
  });

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle>Invalid Session</CardTitle>
            <CardDescription>No payment session found.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-16 w-16 bg-primary/20 rounded-full" />
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-3 w-48 bg-muted rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session?.success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-destructive/20">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive">Payment Issue</CardTitle>
            <CardDescription>
              There was an issue processing your payment. Status: {session?.status || 'unknown'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-3">
            <Button variant="outline" asChild>
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-primary/20 bg-gradient-to-br from-background to-primary/5">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-2xl flex items-center justify-center gap-2">
            <Heart className="h-6 w-6 text-primary animate-pulse" />
            Thank You!
          </CardTitle>
          <CardDescription className="text-base">
            Your generous support means the world to us
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-4xl font-bold text-primary">
              ${session.amount?.toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground">
              {session.tipType === 'filmmaker_split' 
                ? '70% goes directly to the filmmaker'
                : 'Supporting Rampage Films platform'}
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Your support helps us discover, preserve, and share rare cinematic treasures 
              that might otherwise be lost to time.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild className="w-full gap-2">
              <Link href="/">
                <Film className="h-4 w-4" />
                Continue Watching
              </Link>
            </Button>
            <Button variant="outline" asChild className="w-full">
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Back to Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
