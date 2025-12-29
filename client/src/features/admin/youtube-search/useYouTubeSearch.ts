import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  publishedAt: string;
}

export function useYouTubeSearch() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeVideo[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({
        title: "Error",
        description: "Please enter a search query",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setResults([]);

    try {
      const res = await fetch("/api/youtube/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify({ query, maxResults: 12 }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.error || "Failed to search videos");
      }

      const { videos } = await res.json();
      setResults(videos);

      if (videos.length === 0) {
        toast({
          title: "No Results",
          description: "No videos found for this search query",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to search YouTube",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const clearResults = () => {
    setResults([]);
    setQuery("");
  };

  return {
    query,
    setQuery,
    results,
    isSearching,
    handleSearch,
    clearResults,
  };
}
