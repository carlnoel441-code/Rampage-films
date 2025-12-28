import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMovieSchema, updateMovieSchema, type InsertMovie, type UpdateMovie, type Movie } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, ArrowLeft, Trash2, LogOut, Pencil, Youtube, Languages, Loader2, CheckCircle2, XCircle, Download, CloudDownload, Send } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { YouTubeSearchPanel } from "@/features/admin/youtube-search/YouTubeSearchPanel";
import { VideoUrlHelper } from "@/components/VideoUrlHelper";

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthorized, isLoading, login, logout } = useAdminAuth();
  const [tempSecret, setTempSecret] = useState("");
  const [genres, setGenres] = useState<string[]>([""]);
  const [cast, setCast] = useState<string[]>([""]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [movieToDelete, setMovieToDelete] = useState<Movie | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingMovieId, setEditingMovieId] = useState<string | null>(null);
  const [bulkUrls, setBulkUrls] = useState("");
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [isYouTubeProcessing, setIsYouTubeProcessing] = useState(false);
  const [youtubeResults, setYoutubeResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [userPlaylists, setUserPlaylists] = useState<{ id: string; title: string; itemCount: number }[]>([]);
  const [posterSource, setPosterSource] = useState<"url" | "upload">("url");
  const [selectedPosterFile, setSelectedPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [isUploadingPoster, setIsUploadingPoster] = useState(false);
  const [movieSearchQuery, setMovieSearchQuery] = useState("");
  const [movieSearchResults, setMovieSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [syncingToProductionId, setSyncingToProductionId] = useState<string | null>(null);
  
  // Movie filter state
  const [filterText, setFilterText] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [filterDirector, setFilterDirector] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterGenre, setFilterGenre] = useState("");
  const [filterHostingStatus, setFilterHostingStatus] = useState("");
  const { data: allMovies, isLoading: isLoadingMovies } = useQuery<Movie[]>({
    queryKey: ["/api/movies"],
    enabled: isAuthorized,
  });

  // Derive editingMovie from query data (single source of truth)
  const editingMovie = editingMovieId && allMovies 
    ? allMovies.find(m => m.id === editingMovieId) || null
    : null;

  // Get unique years and genres for filter dropdowns
  const uniqueYears = allMovies ? [...new Set(allMovies.map(m => m.year).filter(Boolean))].sort((a, b) => Number(b) - Number(a)) : [];
  const uniqueGenres = allMovies ? [...new Set(allMovies.flatMap(m => m.genres || []))].sort() : [];

  // Filter movies based on search criteria
  const filteredMovies = allMovies?.filter(movie => {
    if (filterText && !movie.title.toLowerCase().includes(filterText.toLowerCase())) {
      return false;
    }
    if (filterActor) {
      const actorLower = filterActor.toLowerCase();
      const hasActor = movie.cast?.some(c => c.toLowerCase().includes(actorLower));
      if (!hasActor) return false;
    }
    if (filterDirector && !movie.director?.toLowerCase().includes(filterDirector.toLowerCase())) {
      return false;
    }
    if (filterYear && movie.year !== filterYear) {
      return false;
    }
    if (filterGenre) {
      const hasGenre = movie.genres?.some(g => g.toLowerCase() === filterGenre.toLowerCase());
      if (!hasGenre) return false;
    }
    if (filterHostingStatus) {
      if (filterHostingStatus === 'hosted' && !movie.hostedAssetKey) return false;
      if (filterHostingStatus === 'not-hosted' && (movie.hostedAssetKey || !movie.videoUrl)) return false;
      if (filterHostingStatus === 'no-video' && (movie.hostedAssetKey || movie.videoUrl)) return false;
    }
    return true;
  }) || [];

  const hasActiveFilters = filterText || filterActor || filterDirector || filterYear || filterGenre || filterHostingStatus;
  
  const clearAllFilters = () => {
    setFilterText("");
    setFilterActor("");
    setFilterDirector("");
    setFilterYear("");
    setFilterGenre("");
    setFilterHostingStatus("");
  };

  const form = useForm<InsertMovie>({
    resolver: zodResolver(insertMovieSchema),
    defaultValues: {
      title: "",
      description: "",
      year: "",
      rating: "PG-13",
      genres: [],
      poster: "",
      backdrop: "",
      videoUrl: "",
      mobileMp4Url: "",
      subtitleUrl: "",
      introEnd: undefined,
      creditsStart: undefined,
      duration: 0,
      director: "",
      cast: [],
    },
  });

  const createMovieMutation = useMutation({
    mutationFn: async (data: InsertMovie) => {
      const res = await fetch("/api/movies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create movie");
      }

      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      toast({
        title: "Success!",
        description: "Movie added successfully",
      });
      form.reset();
      setGenres([""]);
      setCast([""]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add movie",
        variant: "destructive",
      });
    },
  });

  const updateMovieMutation = useMutation({
    mutationFn: async (data: { id: string; movieData: InsertMovie }) => {
      const res = await fetch(`/api/movies/${data.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify(data.movieData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update movie");
      }

      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      toast({
        title: "Success!",
        description: "Movie updated successfully",
      });
      form.reset();
      setGenres([""]);
      setCast([""]);
      setEditingMovieId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update movie",
        variant: "destructive",
      });
    },
  });

  const deleteMovieMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/movies/${id}`, {
        method: "DELETE",
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete movie");
      }

      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      toast({
        title: "Success!",
        description: "Movie deleted successfully",
      });
      setDeleteDialogOpen(false);
      setMovieToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete movie",
        variant: "destructive",
      });
    },
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(tempSecret);
    if (success) {
      toast({
        title: "Authorized",
        description: "You can now add movies",
      });
      setTempSecret("");
    } else {
      toast({
        title: "Access Denied",
        description: "Invalid admin secret",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged out",
      description: "You have been logged out",
    });
  };

  const onSubmit = async (data: InsertMovie) => {
    const filteredGenres = genres.filter(g => g.trim() !== "");
    const filteredCast = cast.filter(c => c.trim() !== "");
    
    let posterUrl = data.poster;
    if (posterSource === "upload" && selectedPosterFile) {
      const uploadedUrl = await uploadPosterFile();
      if (!uploadedUrl) {
        toast({
          title: "Error",
          description: "Failed to upload poster image. Please try again.",
          variant: "destructive",
        });
        return;
      }
      posterUrl = uploadedUrl;
    }
    
    if (editingMovie) {
      updateMovieMutation.mutate({
        id: editingMovie.id,
        movieData: {
          ...data,
          poster: posterUrl,
          genres: filteredGenres,
          cast: filteredCast,
        },
      });
    } else {
      createMovieMutation.mutate({
        ...data,
        poster: posterUrl,
        genres: filteredGenres,
        cast: filteredCast,
      });
    }
  };

  const addGenre = () => setGenres([...genres, ""]);
  const removeGenre = (index: number) => setGenres(genres.filter((_, i) => i !== index));
  const updateGenre = (index: number, value: string) => {
    const newGenres = [...genres];
    newGenres[index] = value;
    setGenres(newGenres);
  };

  const addCast = () => setCast([...cast, ""]);
  const removeCast = (index: number) => setCast(cast.filter((_, i) => i !== index));
  const updateCast = (index: number, value: string) => {
    const newCast = [...cast];
    newCast[index] = value;
    setCast(newCast);
  };

  const handleDeleteClick = (movie: Movie) => {
    setMovieToDelete(movie);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (movieToDelete) {
      deleteMovieMutation.mutate(movieToDelete.id);
    }
  };

  const handleEditClick = (movie: Movie) => {
    setEditingMovieId(movie.id);
    form.reset({
      title: movie.title,
      description: movie.description,
      year: movie.year,
      rating: movie.rating,
      genres: movie.genres,
      poster: movie.poster,
      backdrop: movie.backdrop,
      videoUrl: movie.videoUrl,
      mobileMp4Url: movie.mobileMp4Url || "",
      subtitleUrl: movie.subtitleUrl || "",
      introEnd: movie.introEnd ?? undefined,
      creditsStart: movie.creditsStart ?? undefined,
      duration: movie.duration,
      director: movie.director,
      cast: movie.cast,
    });
    setGenres(movie.genres);
    setCast(movie.cast);
    setPosterPreview(null);
    setSelectedPosterFile(null);
    setPosterSource("url");
    
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingMovieId(null);
    form.reset();
    setGenres([""]);
    setCast([""]);
    setPosterPreview(null);
    setSelectedPosterFile(null);
    setPosterSource("url");
  };

  const handleDownloadVideo = async (movie: Movie) => {
    try {
      toast({
        title: "Preparing download...",
        description: "Getting video URL from storage",
      });

      const response = await fetch(`/api/movies/${movie.id}/hosted-video-url`);
      if (!response.ok) {
        throw new Error("Failed to get video URL");
      }

      const data = await response.json();
      const videoUrl = data.url;

      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = videoUrl;
      link.download = `${movie.title}.mp4`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Download started!",
        description: `Downloading "${movie.title}" to your computer`,
      });
    } catch (error) {
      console.error("Error downloading video:", error);
      toast({
        title: "Download failed",
        description: "Could not download the video. Please try again.",
        variant: "destructive",
      });
    }
  };

  const [isFixingHostingStatus, setIsFixingHostingStatus] = useState(false);
  const [downloadingToHostId, setDownloadingToHostId] = useState<string | null>(null);
  
  const handleDownloadAndHost = async (movie: Movie) => {
    if (!movie.videoUrl) {
      toast({
        title: "No video URL",
        description: "This movie doesn't have a video URL to download",
        variant: "destructive",
      });
      return;
    }
    
    setDownloadingToHostId(movie.id);
    try {
      const response = await fetch(`/api/movies/${movie.id}/download-and-host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start download');
      }
      
      toast({
        title: "Download started!",
        description: `"${movie.title}" is being downloaded. Check the Jobs tab for progress.`,
      });
      
      // Refresh jobs if on jobs page
      queryClient.invalidateQueries({ queryKey: ['/api/admin/jobs'] });
    } catch (error: any) {
      console.error("Error starting download:", error);
      toast({
        title: "Failed to start download",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setDownloadingToHostId(null);
    }
  };
  
  const handleFixHostingStatus = async () => {
    if (!editingMovie?.id) return;
    
    setIsFixingHostingStatus(true);
    try {
      const response = await fetch(`/api/movies/${editingMovie.id}/fix-hosting-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fix hosting status');
      }
      
      const result = await response.json();
      
      toast({
        title: "Hosting status fixed!",
        description: `"${editingMovie.title}" should now play correctly`,
      });
      
      // Refresh the movies list
      queryClient.invalidateQueries({ queryKey: ['/api/movies'] });
    } catch (error: any) {
      console.error("Error fixing hosting status:", error);
      toast({
        title: "Failed to fix status",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsFixingHostingStatus(false);
    }
  };

  const handleSyncToProduction = async (movieId: string, movieTitle: string) => {
    setSyncingToProductionId(movieId);
    try {
      const response = await fetch(`/api/admin/sync-to-production/${movieId}`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.details || data.error || "Sync failed");
      }
      
      toast({
        title: "Synced to Production!",
        description: `"${movieTitle}" is now available on your live site.`,
      });
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message || "Could not sync to production",
        variant: "destructive",
      });
    } finally {
      setSyncingToProductionId(null);
    }
  };

  const handlePosterFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "File size must be less than 5MB",
          variant: "destructive",
        });
        return;
      }

      setSelectedPosterFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPosterPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadPosterFile = async (): Promise<string | null> => {
    if (!selectedPosterFile) return null;

    setIsUploadingPoster(true);
    try {
      const formData = new FormData();
      formData.append('poster', selectedPosterFile);

      const res = await fetch("/api/upload/poster", {
        method: "POST",
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to upload poster");
      }

      const data = await res.json();
      return data.url;
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload poster image",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsUploadingPoster(false);
    }
  };

  const searchMovies = async () => {
    if (!movieSearchQuery.trim()) {
      toast({
        title: "Error",
        description: "Please enter a movie title to search",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch("/api/search-tmdb-multiple", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify({ title: movieSearchQuery }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to search movies");
      }

      const data = await res.json();
      setMovieSearchResults(data.results);
      
      if (data.results.length === 0) {
        toast({
          title: "No Results",
          description: `No movies found for "${movieSearchQuery}"`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Search Failed",
        description: error.message || "Failed to search movies",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const selectMovieFromSearch = async (tmdbId: number) => {
    try {
      const res = await fetch(`/api/tmdb-details/${tmdbId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch movie details");
      }

      const data = await res.json();
      
      form.setValue("title", data.title);
      form.setValue("description", data.description);
      form.setValue("year", data.year);
      form.setValue("rating", data.rating);
      form.setValue("duration", Number(data.duration));
      form.setValue("director", data.director);
      form.setValue("poster", data.poster);
      form.setValue("backdrop", data.backdrop);
      
      setGenres(data.genres);
      setCast(data.cast);
      setMovieSearchResults([]);
      setMovieSearchQuery("");

      toast({
        title: "Success!",
        description: `"${data.title}" info loaded. Add your video URL and submit!`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load movie details",
        variant: "destructive",
      });
    }
  };

  const isMP4Url = (url: string): boolean => {
    if (!url) return false;
    const normalizedUrl = url.toLowerCase();
    
    if (normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be')) {
      return false;
    }
    if (normalizedUrl.includes('vimeo.com')) {
      return false;
    }
    if (normalizedUrl.includes('ok.ru')) {
      return false;
    }
    
    return normalizedUrl.endsWith('.mp4') || 
           normalizedUrl.includes('.mp4?') ||
           normalizedUrl.includes('video/mp4');
  };

  const generateMovieInfo = async () => {
    const videoUrl = form.getValues("videoUrl");
    if (!videoUrl) {
      toast({
        title: "Error",
        description: "Please enter a video URL first",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate-movie-info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify({ videoUrl }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate movie info");
      }

      const data = await res.json();
      
      form.setValue("title", data.title);
      form.setValue("description", data.description);
      form.setValue("year", data.year);
      form.setValue("rating", data.rating);
      form.setValue("duration", Number(data.duration));
      form.setValue("director", data.director);
      form.setValue("poster", data.poster);
      form.setValue("backdrop", data.backdrop);
      
      setGenres(data.genres);
      setCast(data.cast);

      toast({
        title: "Success!",
        description: "Movie information generated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate movie info",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBulkImport = async () => {
    const titles = bulkUrls
      .split("\n")
      .map(title => title.trim())
      .filter(title => title.length > 0);

    if (titles.length === 0) {
      toast({
        title: "Error",
        description: "Please enter at least one movie title",
        variant: "destructive",
      });
      return;
    }

    setIsBulkProcessing(true);
    setBulkResults(null);

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const title of titles) {
      try {
        const searchRes = await fetch("/api/search-tmdb", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: 'include',
          body: JSON.stringify({ title }),
        });

        if (!searchRes.ok) {
          const error = await searchRes.json();
          throw new Error(error.error || `Failed to find "${title}" in TMDB`);
        }

        const movieData = await searchRes.json();

        const createRes = await fetch("/api/movies", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: 'include',
          body: JSON.stringify({
            ...movieData,
            videoUrl: "",
          }),
        });

        if (!createRes.ok) {
          throw new Error(`Failed to create movie "${title}"`);
        }

        successCount++;
      } catch (error: any) {
        failedCount++;
        errors.push(error.message);
      }
    }

    setBulkResults({ success: successCount, failed: failedCount, errors });
    setIsBulkProcessing(false);
    
    queryClient.invalidateQueries({ queryKey: ["/api/movies"] });

    if (successCount > 0) {
      toast({
        title: "TMDB Import Complete",
        description: `Successfully added ${successCount} movie(s)${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
      });
      
      if (failedCount === 0) {
        setBulkUrls("");
      }
    } else {
      toast({
        title: "Import Failed",
        description: "No movies were found. Check the errors below.",
        variant: "destructive",
      });
    }
  };

  const loadUserPlaylists = async () => {
    try {
      const res = await fetch("/api/youtube/playlists", {
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.error || "Failed to load playlists");
      }

      const { playlists } = await res.json();
      setUserPlaylists(playlists);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load YouTube playlists",
        variant: "destructive",
      });
    }
  };

  const handleSelectYouTubeVideo = (videoUrl: string, videoTitle: string) => {
    form.setValue('videoUrl', videoUrl);
    toast({
      title: "Video URL Added!",
      description: `"${videoTitle}" URL copied to the video URL field`,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUrlValidated = (url: string) => {
    form.setValue('videoUrl', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleYouTubeImport = async () => {
    if (!selectedPlaylistId.trim()) {
      toast({
        title: "Error",
        description: "Please select a playlist",
        variant: "destructive",
      });
      return;
    }

    setIsYouTubeProcessing(true);
    setYoutubeResults(null);

    try {
      toast({
        title: "Fetching Videos",
        description: "Getting videos from your YouTube playlist...",
      });

      const videosRes = await fetch("/api/youtube/fetch-videos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify({ playlistId: selectedPlaylistId }),
      });

      if (!videosRes.ok) {
        const error = await videosRes.json();
        throw new Error(error.details || error.error || "Failed to fetch videos");
      }

      const { videos } = await videosRes.json();

      if (!videos || videos.length === 0) {
        toast({
          title: "No Videos Found",
          description: "No videos found in this playlist",
          variant: "destructive",
        });
        setIsYouTubeProcessing(false);
        return;
      }

      toast({
        title: "Extracting Titles",
        description: `Found ${videos.length} videos. Extracting movie titles...`,
      });

      const titlesRes = await fetch("/api/youtube/extract-titles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify({ videos }),
      });

      if (!titlesRes.ok) {
        throw new Error("Failed to extract movie titles");
      }

      const { titles } = await titlesRes.json();

      toast({
        title: "Importing from TMDB",
        description: "Fetching movie data and creating entries...",
      });

      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const titleData = titles?.find((t: any) => t.index === i);
        const movieTitle = titleData?.title;

        if (!movieTitle) {
          failedCount++;
          errors.push(`Could not extract movie title from video: ${video.title.substring(0, 50)}...`);
          continue;
        }

        try {
          const tmdbRes = await fetch("/api/search-tmdb", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: 'include',
            body: JSON.stringify({ title: movieTitle }),
          });

          if (!tmdbRes.ok) {
            throw new Error(`Failed to find "${movieTitle}" in TMDB`);
          }

          const movieData = await tmdbRes.json();

          const createRes = await fetch("/api/movies", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: 'include',
            body: JSON.stringify({
              ...movieData,
              videoUrl: video.videoUrl,
            }),
          });

          if (!createRes.ok) {
            throw new Error(`Failed to create movie "${movieTitle}"`);
          }

          successCount++;
        } catch (error: any) {
          failedCount++;
          errors.push(`${movieTitle}: ${error.message}`);
        }
      }

      setYoutubeResults({ success: successCount, failed: failedCount, errors });
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });

      if (successCount > 0) {
        toast({
          title: "YouTube Import Complete!",
          description: `Successfully imported ${successCount} movie(s) from your playlist${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
        });
      } else {
        toast({
          title: "Import Failed",
          description: "No movies could be imported. Check the errors below.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to import from YouTube",
        variant: "destructive",
      });
      setYoutubeResults({ success: 0, failed: 0, errors: [error.message] });
    } finally {
      setIsYouTubeProcessing(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md p-8">
          <h1 className="text-2xl font-serif font-bold mb-6 text-center">Admin Login</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="secret" className="block text-sm font-medium mb-2">
                Admin Secret
              </label>
              <Input
                id="secret"
                type="password"
                value={tempSecret}
                onChange={(e) => setTempSecret(e.target.value)}
                placeholder="Enter admin secret"
                data-testid="input-admin-secret"
              />
              <p className="text-xs text-foreground/60 mt-2">
                Your admin secret: MakePeace69@
              </p>
            </div>
            <Button type="submit" className="w-full" data-testid="button-login">
              Login
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/")}
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-16">
        <div className="px-4 md:px-8 lg:px-12 max-w-4xl mx-auto py-8">
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              onClick={() => setLocation("/")}
              className="gap-2"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="gap-2"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>

          <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2">Analytics</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Track user signups, views, and platform growth metrics
              </p>
              <Button
                onClick={() => setLocation("/admin/analytics")}
                className="w-full"
                data-testid="button-go-to-analytics"
              >
                View Analytics
              </Button>
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2">Discover Movies</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Search TMDB catalog and import movies with complete metadata
              </p>
              <Button
                onClick={() => setLocation("/admin/discovery")}
                className="w-full"
                data-testid="button-go-to-discovery"
              >
                Open Discovery
              </Button>
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2">Review Queue</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add video URLs to imported movies
              </p>
              <Button
                onClick={() => setLocation("/admin/review-queue")}
                className="w-full"
                data-testid="button-go-to-review-queue"
              >
                Open Review Queue
              </Button>
            </Card>
            <Card className="p-6 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
              <h3 className="text-lg font-semibold mb-2">Video Management</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Download, host & FREE AI dub movies (16 languages)
              </p>
              <Button
                onClick={() => setLocation("/admin/videos")}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                data-testid="button-go-to-videos"
              >
                Open Video Management
              </Button>
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2">Background Jobs</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Monitor and manage video download and processing jobs
              </p>
              <Button
                onClick={() => setLocation("/admin/jobs")}
                className="w-full"
                data-testid="button-go-to-jobs"
              >
                View Jobs
              </Button>
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2">Curated Collections</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create themed movie collections for the homepage
              </p>
              <Button
                onClick={() => setLocation("/admin/collections")}
                className="w-full"
                data-testid="button-go-to-collections"
              >
                Manage Collections
              </Button>
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2">Storage Migration</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Migrate videos from Replit to Cloudflare R2 (free bandwidth)
              </p>
              <Button
                onClick={() => setLocation("/admin/storage")}
                className="w-full"
                data-testid="button-go-to-storage"
              >
                Manage Storage
              </Button>
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2">Sponsorship Management</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Manage sponsors and ad placements for revenue
              </p>
              <Button
                onClick={() => setLocation("/admin/sponsors")}
                className="w-full"
                data-testid="button-go-to-sponsors"
              >
                Manage Sponsors
              </Button>
            </Card>
            <Card className="p-6 border-2 border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Languages className="h-5 w-5 text-green-500" />
                AI Dubbing
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create dubbed audio tracks in 16+ languages with AI
              </p>
              <Button
                onClick={() => setLocation("/admin/dubbing")}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                data-testid="button-go-to-dubbing"
              >
                Manage Dubbing
              </Button>
            </Card>
            <Card className="p-6 border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
              <h3 className="text-lg font-semibold mb-2">Movie Identifier</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Identify recovered movies with unknown titles using TMDB
              </p>
              <Button
                onClick={() => setLocation("/admin/identify")}
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
                data-testid="button-go-to-identify"
              >
                Identify Movies
              </Button>
            </Card>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-serif font-bold mb-4">Manage Movies</h2>
            
            {/* Search/Filter Section */}
            <Card className="p-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <Input
                  placeholder="Search by title..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="bg-background"
                  data-testid="input-filter-title"
                />
                <Input
                  placeholder="Search by actor..."
                  value={filterActor}
                  onChange={(e) => setFilterActor(e.target.value)}
                  className="bg-background"
                  data-testid="input-filter-actor"
                />
                <Input
                  placeholder="Search by director..."
                  value={filterDirector}
                  onChange={(e) => setFilterDirector(e.target.value)}
                  className="bg-background"
                  data-testid="input-filter-director"
                />
                <Select value={filterYear} onValueChange={(v) => setFilterYear(v === "all" ? "" : v)}>
                  <SelectTrigger className="bg-background" data-testid="select-filter-year">
                    <SelectValue placeholder="Any year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any year</SelectItem>
                    {uniqueYears.map(year => (
                      <SelectItem key={year} value={year || ""}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterGenre} onValueChange={(v) => setFilterGenre(v === "all" ? "" : v)}>
                  <SelectTrigger className="bg-background" data-testid="select-filter-genre">
                    <SelectValue placeholder="Any genre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any genre</SelectItem>
                    {uniqueGenres.map(genre => (
                      <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterHostingStatus} onValueChange={(v) => setFilterHostingStatus(v === "all" ? "" : v)}>
                  <SelectTrigger className="bg-background" data-testid="select-filter-hosting">
                    <SelectValue placeholder="Hosting status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All videos</SelectItem>
                    <SelectItem value="hosted">Hosted (on cloud)</SelectItem>
                    <SelectItem value="not-hosted">Needs download</SelectItem>
                    <SelectItem value="no-video">No video source</SelectItem>
                  </SelectContent>
                </Select>
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearAllFilters} data-testid="button-clear-filters">
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
              </div>
              {hasActiveFilters && (
                <p className="text-sm text-muted-foreground mt-3">
                  Showing {filteredMovies.length} of {allMovies?.length || 0} movies
                </p>
              )}
            </Card>

            {isLoadingMovies ? (
              <div className="text-center py-8">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-foreground/70 mt-4">Loading movies...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMovies.length > 0 ? (
                  filteredMovies.map((movie) => (
                    <Card key={movie.id} className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <img
                            src={movie.poster}
                            alt={movie.title}
                            className="w-12 h-18 object-cover rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold truncate" data-testid={`text-movie-title-${movie.id}`}>
                                {movie.title}
                              </h3>
                              {movie.hostedAssetKey ? (
                                <Badge variant="default" className="bg-green-600 text-white shrink-0">Hosted</Badge>
                              ) : movie.videoUrl ? (
                                <Badge variant="outline" className="border-yellow-500 text-yellow-500 shrink-0">Needs Download</Badge>
                              ) : (
                                <Badge variant="outline" className="border-red-500 text-red-500 shrink-0">No Video</Badge>
                              )}
                            </div>
                            <p className="text-sm text-foreground/70 truncate">
                              {movie.year} • {movie.rating} • {movie.duration} min
                            </p>
                            <p className="text-xs text-foreground/60 truncate">
                              {movie.genres.join(", ")}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {/* Download & Host button - for movies with video URLs */}
                          {movie.videoUrl && (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDownloadAndHost(movie)}
                              disabled={downloadingToHostId === movie.id}
                              title={movie.hostedAssetKey ? "Re-download & Host video" : "Download & Host video to cloud"}
                              data-testid={`button-host-${movie.id}`}
                            >
                              {downloadingToHostId === movie.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CloudDownload className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {/* Download to computer button - for hosted movies */}
                          {movie.hostedAssetKey && (
                            <>
                              <Button
                                variant="default"
                                size="icon"
                                onClick={() => handleSyncToProduction(movie.id, movie.title)}
                                disabled={syncingToProductionId === movie.id}
                                title="Send to Production"
                                data-testid={`button-sync-prod-${movie.id}`}
                              >
                                {syncingToProductionId === movie.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleDownloadVideo(movie)}
                                title="Download video to computer"
                                data-testid={`button-download-${movie.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEditClick(movie)}
                            disabled={updateMovieMutation.isPending}
                            data-testid={`button-edit-${movie.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => handleDeleteClick(movie)}
                            disabled={deleteMovieMutation.isPending}
                            data-testid={`button-delete-${movie.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <p className="text-center text-foreground/70 py-8">
                    {hasActiveFilters 
                      ? "No movies match your filters. Try adjusting your search criteria."
                      : "No movies found. Add your first movie below!"}
                  </p>
                )}
              </div>
            )}
          </div>

          <YouTubeSearchPanel onSelectVideo={handleSelectYouTubeVideo} />

          <div className="mb-12">
            <VideoUrlHelper onUrlValidated={handleUrlValidated} />
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-serif font-bold mb-4 text-primary">
              <Youtube className="inline-block h-8 w-8 mr-2 mb-1" />
              Import from YouTube Playlist
            </h2>
            <Card className="p-6 border-primary/20">
              <p className="text-foreground/70 mb-4">
                Automatically import movies from your YouTube playlists. We'll fetch your videos, extract movie titles using AI, and import them with TMDB data.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Select Playlist
                  </label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedPlaylistId}
                      onValueChange={setSelectedPlaylistId}
                      disabled={isYouTubeProcessing}
                    >
                      <SelectTrigger className="flex-1" data-testid="select-youtube-playlist">
                        <SelectValue placeholder="Choose a playlist" />
                      </SelectTrigger>
                      <SelectContent>
                        {userPlaylists.length === 0 ? (
                          <SelectItem value="loading" disabled>
                            Click "Load Playlists" to see your playlists
                          </SelectItem>
                        ) : (
                          userPlaylists.map((playlist) => (
                            <SelectItem key={playlist.id} value={playlist.id}>
                              {playlist.title} ({playlist.itemCount} videos)
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={loadUserPlaylists}
                      disabled={isYouTubeProcessing}
                      data-testid="button-load-playlists"
                    >
                      Load Playlists
                    </Button>
                  </div>
                  <p className="text-xs text-foreground/60 mt-2">
                    YouTube authentication is already connected - just select a playlist to import!
                  </p>
                </div>

                <Button
                  onClick={handleYouTubeImport}
                  disabled={isYouTubeProcessing || !selectedPlaylistId.trim()}
                  className="w-full"
                  data-testid="button-youtube-import"
                >
                  {isYouTubeProcessing ? (
                    <>
                      <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin mr-2" />
                      Importing from YouTube...
                    </>
                  ) : (
                    <>
                      <Youtube className="h-4 w-4 mr-2" />
                      Import Movies from Playlist
                    </>
                  )}
                </Button>

                {youtubeResults && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-card rounded border border-primary/20">
                      <span className="text-sm font-medium">Results:</span>
                      <div className="flex gap-4">
                        <span className="text-sm text-green-500" data-testid="text-youtube-success">
                          ✓ {youtubeResults.success} successful
                        </span>
                        {youtubeResults.failed > 0 && (
                          <span className="text-sm text-red-500" data-testid="text-youtube-failed">
                            ✗ {youtubeResults.failed} failed
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {youtubeResults.errors.length > 0 && (
                      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded">
                        <p className="text-sm font-medium text-destructive mb-2">Errors:</p>
                        <ul className="text-xs text-destructive/80 space-y-1">
                          {youtubeResults.errors.map((error, idx) => (
                            <li key={idx} data-testid={`text-youtube-error-${idx}`}>• {error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 p-4 bg-card/50 rounded border">
                  <h3 className="text-sm font-semibold mb-3">How It Works:</h3>
                  <ol className="text-xs text-foreground/70 space-y-2">
                    <li>1. Click "Load Playlists" to see your YouTube playlists</li>
                    <li>2. Select the playlist containing your movie trailers or full movies</li>
                    <li>3. Click "Import Movies from Playlist"</li>
                    <li>4. AI will extract movie titles from video titles and descriptions</li>
                    <li>5. TMDB will fetch official posters, cast, directors, and metadata</li>
                    <li>6. Movies will be added to your collection with YouTube video links!</li>
                  </ol>
                  <p className="text-xs text-foreground/60 mt-3">
                    💡 Tip: Create a dedicated playlist of movie trailers or full movies for easy importing!
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-serif font-bold mb-4">Search and Import from TMDB</h2>
            <Card className="p-6">
              <p className="text-foreground/70 mb-4">
                Enter movie titles (one per line) to search TMDB and automatically import with accurate cast, director, and official posters.
              </p>
              
              <Textarea
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                placeholder="The Shawshank Redemption&#10;Pulp Fiction&#10;The Dark Knight&#10;Inception"
                rows={8}
                className="mb-4"
                disabled={isBulkProcessing}
                data-testid="input-tmdb-titles"
              />

              <Button
                onClick={handleBulkImport}
                disabled={isBulkProcessing || !bulkUrls.trim()}
                className="w-full mb-4"
                data-testid="button-tmdb-import"
              >
                {isBulkProcessing ? (
                  <>
                    <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin mr-2" />
                    Searching TMDB for {bulkUrls.split("\n").filter(u => u.trim()).length} titles...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Search and Import Movies
                  </>
                )}
              </Button>

              {bulkResults && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-card rounded border">
                    <span className="text-sm font-medium">Results:</span>
                    <div className="flex gap-4">
                      <span className="text-sm text-green-500" data-testid="text-bulk-success">
                        ✓ {bulkResults.success} successful
                      </span>
                      {bulkResults.failed > 0 && (
                        <span className="text-sm text-red-500" data-testid="text-bulk-failed">
                          ✗ {bulkResults.failed} failed
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {bulkResults.errors.length > 0 && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded">
                      <p className="text-sm font-medium text-destructive mb-2">Errors:</p>
                      <ul className="text-xs text-destructive/80 space-y-1">
                        {bulkResults.errors.map((error, idx) => (
                          <li key={idx} data-testid={`text-bulk-error-${idx}`}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl md:text-4xl font-serif font-bold">
              {editingMovie ? "Edit Movie" : "Add New Movie"}
            </h1>
            {editingMovie && (
              <Button
                variant="ghost"
                onClick={handleCancelEdit}
                data-testid="button-cancel-edit"
              >
                Cancel Edit
              </Button>
            )}
          </div>

          <Card className="p-6 mb-6 border-primary/30 bg-primary/5">
            <h3 className="text-lg font-semibold mb-4">🔍 Search TMDB Database</h3>
            <p className="text-sm text-foreground/70 mb-4">
              Search for your movie in the TMDB database to get accurate information instantly!
            </p>
            <div className="flex gap-2 mb-4">
              <Input
                value={movieSearchQuery}
                onChange={(e) => setMovieSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchMovies()}
                placeholder="Enter movie title (e.g., 'The Matrix')"
                data-testid="input-movie-search"
              />
              <Button
                type="button"
                onClick={searchMovies}
                disabled={isSearching}
                data-testid="button-search-movies"
              >
                {isSearching ? "Searching..." : "Search"}
              </Button>
            </div>

            {movieSearchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Found {movieSearchResults.length} results - click one to auto-fill:</p>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {movieSearchResults.map((movie) => (
                    <Card
                      key={movie.id}
                      className="p-3 cursor-pointer hover-elevate active-elevate-2"
                      onClick={() => selectMovieFromSearch(movie.id)}
                      data-testid={`movie-result-${movie.id}`}
                    >
                      <div className="flex gap-3">
                        {movie.poster_path && (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                            alt={movie.title}
                            className="w-12 h-18 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold truncate">{movie.title}</h4>
                          <p className="text-sm text-foreground/70">
                            {movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A'} • ⭐ {movie.vote_average.toFixed(1)}
                          </p>
                          <p className="text-xs text-foreground/60 line-clamp-2 mt-1">
                            {movie.overview || 'No description available'}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter movie title" data-testid="input-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Enter movie description"
                        rows={4}
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="1995" data-testid="input-year" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rating"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rating</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="PG-13" data-testid="input-rating" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (minutes)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          placeholder="120"
                          data-testid="input-duration"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div>
                <FormLabel>Genres</FormLabel>
                <div className="space-y-2 mt-2">
                  {genres.map((genre, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={genre}
                        onChange={(e) => updateGenre(index, e.target.value)}
                        placeholder="Thriller"
                        data-testid={`input-genre-${index}`}
                      />
                      {genres.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeGenre(index)}
                          data-testid={`button-remove-genre-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addGenre}
                    className="gap-2"
                    data-testid="button-add-genre"
                  >
                    <Plus className="h-4 w-4" />
                    Add Genre
                  </Button>
                </div>
              </div>

              <FormField
                control={form.control}
                name="director"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Director</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Director name" data-testid="input-director" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <FormLabel>Cast</FormLabel>
                <div className="space-y-2 mt-2">
                  {cast.map((actor, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={actor}
                        onChange={(e) => updateCast(index, e.target.value)}
                        placeholder="Actor name"
                        data-testid={`input-cast-${index}`}
                      />
                      {cast.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeCast(index)}
                          data-testid={`button-remove-cast-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCast}
                    className="gap-2"
                    data-testid="button-add-cast"
                  >
                    <Plus className="h-4 w-4" />
                    Add Cast Member
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <FormLabel>Poster Image</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <Button
                      type="button"
                      variant={posterSource === "url" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setPosterSource("url");
                        setSelectedPosterFile(null);
                        setPosterPreview(null);
                      }}
                      data-testid="button-poster-url"
                    >
                      URL
                    </Button>
                    <Button
                      type="button"
                      variant={posterSource === "upload" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPosterSource("upload")}
                      data-testid="button-poster-upload"
                    >
                      Upload File
                    </Button>
                  </div>
                </div>

                {posterSource === "url" ? (
                  <FormField
                    control={form.control}
                    name="poster"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...field} placeholder="https://..." data-testid="input-poster" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="space-y-3">
                    <Input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                      onChange={handlePosterFileChange}
                      data-testid="input-poster-file"
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-foreground/60">
                      Maximum file size: 5MB. Supported formats: JPEG, PNG, WebP, GIF
                    </p>
                    {posterPreview && (
                      <div className="relative w-32 h-48 rounded overflow-hidden border">
                        <img
                          src={posterPreview}
                          alt="Poster preview"
                          className="w-full h-full object-cover"
                          data-testid="img-poster-preview"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name="backdrop"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Backdrop URL</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="https://..." data-testid="input-backdrop" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="videoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Video URL</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="https://..." data-testid="input-video-url" />
                    </FormControl>
                    <FormMessage />
                    <p className="text-sm text-foreground/60 mt-2">
                      Paste your video URL above, then click "Generate Movie Info" to auto-fill all fields
                    </p>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mobileMp4Url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile MP4 URL (Optional - Fixes Mobile Playback)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="https://example.com/video.mp4" data-testid="input-mobile-mp4-url" />
                    </FormControl>
                    <FormMessage />
                    <p className="text-sm text-foreground/60 mt-2">
                      ✅ <strong>Recommended for mobile users:</strong> Add a direct MP4 URL here to prevent the 10-second pause issue on phones/tablets. Desktop users will still see YouTube/Vimeo.
                    </p>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subtitleUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subtitle URL (Optional - MP4 Only)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="https://example.com/subtitles.vtt" data-testid="input-subtitle-url" />
                    </FormControl>
                    <FormMessage />
                    <div className="mt-3 p-3 bg-muted/50 rounded-md border">
                      <p className="text-sm text-foreground/70">
                        <strong>MP4 Videos Only:</strong> Subtitles work with direct MP4 URLs. For YouTube/Vimeo videos, upload captions directly to those platforms instead.
                      </p>
                      <p className="text-xs text-foreground/60 mt-2">
                        <strong>Requirements:</strong> WebVTT (.vtt) format, publicly accessible URL with CORS enabled. 
                        Leave blank if not needed.
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="introEnd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Skip Intro Timestamp (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              field.onChange(null);
                              return;
                            }
                            const parsed = Number(val);
                            field.onChange(Number.isFinite(parsed) ? parsed : undefined);
                          }}
                          placeholder="e.g., 90"
                          data-testid="input-intro-end"
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-foreground/60 mt-2">
                        Seconds when intro ends. Clear to remove skip intro.
                      </p>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="creditsStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Skip Credits Timestamp (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              field.onChange(null);
                              return;
                            }
                            const parsed = Number(val);
                            field.onChange(Number.isFinite(parsed) ? parsed : undefined);
                          }}
                          placeholder="e.g., 5400"
                          data-testid="input-credits-start"
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-foreground/60 mt-2">
                        Seconds when credits begin. Clear to remove skip credits.
                      </p>
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={generateMovieInfo}
                disabled={isGenerating}
                data-testid="button-generate-info"
              >
                {isGenerating ? "Generating Movie Info..." : "✨ Generate Movie Info"}
              </Button>

              <Button
                type="submit"
                className="w-full"
                disabled={createMovieMutation.isPending || updateMovieMutation.isPending}
                data-testid="button-submit"
              >
                {editingMovie 
                  ? (updateMovieMutation.isPending ? "Updating Movie..." : "Update Movie")
                  : (createMovieMutation.isPending ? "Adding Movie..." : "Add Movie")
                }
              </Button>
            </form>
          </Form>
        </div>
        <Footer />
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-movie">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Movie</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{movieToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMovieMutation.isPending}
              className="bg-destructive text-destructive-foreground hover-elevate"
              data-testid="button-confirm-delete"
            >
              {deleteMovieMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
