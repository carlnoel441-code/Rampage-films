import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { queryClient } from "@/lib/queryClient";
import { type Movie, type DubbedAudioTrack, type Job } from "@shared/schema";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  Languages, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Trash2, 
  Play,
  Search,
  RefreshCw,
  Volume2,
  Download,
  Users,
  Plus,
  X
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SupportedLanguage = {
  code: string;
  name: string;
  voices: Array<{ id: string; name: string; gender: string }>;
};

type SpeakerMode = 'single' | 'alternating' | 'multi' | 'smart';

type Speaker = {
  id: number;
  name: string;
  gender: 'male' | 'female';
};

export default function AdminDubbing() {
  const { isAuthorized } = useAdminAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState<string>("auto");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [dubDialogOpen, setDubDialogOpen] = useState(false);
  const [speakerMode, setSpeakerMode] = useState<SpeakerMode>('single');
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female');
  const [voiceQuality, setVoiceQuality] = useState<'standard' | 'premium'>('standard');
  const [speakers, setSpeakers] = useState<Speaker[]>([
    { id: 1, name: 'Speaker 1', gender: 'male' },
    { id: 2, name: 'Speaker 2', gender: 'female' },
  ]);

  const { data: movies, isLoading: loadingMovies } = useQuery<Movie[]>({
    queryKey: ["/api/movies"],
    enabled: isAuthorized,
  });

  const { data: languages } = useQuery<SupportedLanguage[]>({
    queryKey: ["/api/dubbing/languages"],
    enabled: isAuthorized,
  });

  const { data: dubbingJobs, isLoading: loadingJobs } = useQuery<Job[]>({
    queryKey: ["/api/admin/dubbing/jobs"],
    enabled: isAuthorized,
    refetchInterval: 5000,
  });

  const startDubbingMutation = useMutation({
    mutationFn: async ({ 
      movieId, 
      languageCode,
      sourceLanguage: srcLang,
      speakerMode: mode,
      voiceGender: gender,
      speakers: speakerList,
      voiceQuality: quality
    }: { 
      movieId: string; 
      languageCode: string;
      sourceLanguage: string;
      speakerMode: SpeakerMode;
      voiceGender: 'male' | 'female';
      speakers: Speaker[];
      voiceQuality: 'standard' | 'premium';
    }) => {
      console.log('[Dubbing] Starting mutation with movieId:', movieId, 'languageCode:', languageCode, 'sourceLanguage:', srcLang, 'mode:', mode, 'quality:', quality);
      const url = `/api/admin/movies/${movieId}/dub`;
      console.log('[Dubbing] POST to:', url);
      
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ 
            targetLanguage: languageCode,
            sourceLanguage: srcLang === 'auto' ? undefined : srcLang,
            speakerMode: mode,
            voiceGender: gender,
            speakers: speakerList,
            voiceQuality: quality
          }),
        });
        console.log('[Dubbing] Response status:', res.status);
        console.log('[Dubbing] Response headers:', Object.fromEntries(res.headers.entries()));
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          console.error('[Dubbing] Non-JSON response:', text.substring(0, 500));
          throw new Error(`Server returned non-JSON response (${res.status}): ${text.substring(0, 100)}`);
        }
        
        if (!res.ok) {
          const error = await res.json();
          console.log('[Dubbing] Error response:', error);
          throw new Error(error.error || "Failed to start dubbing");
        }
        const data = await res.json();
        console.log('[Dubbing] Success response:', data);
        return data;
      } catch (err: any) {
        console.error('[Dubbing] Fetch error:', err);
        console.error('[Dubbing] Error name:', err.name);
        console.error('[Dubbing] Error message:', err.message);
        throw err;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dubbing/jobs"] });
      toast({
        title: "Dubbing Started",
        description: `Job created with ID: ${data.jobId}`,
      });
      setDubDialogOpen(false);
      setSelectedMovieId(null);
      setSourceLanguage("auto");
      setSelectedLanguage("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Start Dubbing",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteDubbedTrackMutation = useMutation({
    mutationFn: async (trackId: string) => {
      const res = await fetch(`/api/admin/dubbed-tracks/${trackId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete track");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dubbing/jobs"] });
      toast({
        title: "Track Deleted",
        description: "Dubbed audio track has been removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredMovies = movies?.filter(movie => 
    movie.title.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const selectedMovie = movies?.find(m => m.id === selectedMovieId);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case "processing":
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
      case "failed":
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case "pending":
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getJobProgress = (job: Job) => {
    if (job.status === 'completed') return 100;
    if (job.status === 'pending') return 0;
    const progressDetail = job.progressDetail as { percent?: number } | null;
    return progressDetail?.percent ?? job.progress ?? 0;
  };

  const getJobMessage = (job: Job) => {
    const progressDetail = job.progressDetail as { message?: string } | null;
    return progressDetail?.message || '';
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Unauthorized</CardTitle>
              <CardDescription>Please log in as admin to access dubbing controls</CardDescription>
            </CardHeader>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gold flex items-center gap-2">
              <Languages className="w-8 h-8" />
              AI Dubbing Manager
            </h1>
            <p className="text-muted-foreground">Generate dubbed audio tracks for movies in multiple languages</p>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/admin/dubbing/jobs"] });
              queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
            }}
            data-testid="button-refresh-dubbing"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Active Dubbing Jobs */}
        {dubbingJobs && dubbingJobs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Volume2 className="w-5 h-5" />
                Active Dubbing Jobs
              </CardTitle>
              <CardDescription>Monitor progress of dubbing jobs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dubbingJobs.map(job => {
                  const metadata = job.metadata as { targetLanguage?: string; languageName?: string; movieTitle?: string } | null;
                  const progress = getJobProgress(job);
                  const message = getJobMessage(job);
                  
                  return (
                    <div key={job.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium" data-testid={`text-job-movie-${job.id}`}>
                            {metadata?.movieTitle || `Movie ID: ${job.movieId}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Language: {metadata?.languageName || metadata?.targetLanguage || 'Unknown'}
                          </p>
                        </div>
                        {getStatusBadge(job.status)}
                      </div>
                      
                      {job.status === 'processing' && (
                        <>
                          <Progress value={progress} className="h-2" />
                          <p className="text-xs text-muted-foreground">{message || `${progress}% complete`}</p>
                        </>
                      )}
                      
                      {job.status === 'failed' && job.error && (
                        <p className="text-sm text-red-500">{job.error}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Movies List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Movies Library</CardTitle>
                <CardDescription>Select a movie to create dubbed versions</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search movies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-movies"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingMovies ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredMovies.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No movies found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Movie</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Dubbed Tracks</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovies.slice(0, 50).map(movie => (
                    <MovieRow 
                      key={movie.id} 
                      movie={movie}
                      onStartDubbing={() => {
                        setSelectedMovieId(movie.id);
                        setDubDialogOpen(true);
                      }}
                      onDeleteTrack={(trackId) => deleteDubbedTrackMutation.mutate(trackId)}
                      isDeleting={deleteDubbedTrackMutation.isPending}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Start Dubbing Dialog */}
        <Dialog open={dubDialogOpen} onOpenChange={setDubDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start AI Dubbing</DialogTitle>
              <DialogDescription>
                Generate a dubbed audio track for "{selectedMovie?.title}"
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Original Language (Source)</label>
                <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
                  <SelectTrigger data-testid="select-source-language">
                    <SelectValue placeholder="Select source language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="pl">Polish</SelectItem>
                    <SelectItem value="ru">Russian</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="it">Italian</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                    <SelectItem value="nl">Dutch</SelectItem>
                    <SelectItem value="tr">Turkish</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                    <SelectItem value="ko">Korean</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select the language spoken in the original movie for accurate transcription
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Target Language (Dub To)</label>
                <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <SelectTrigger data-testid="select-language">
                    <SelectValue placeholder="Select a language" />
                  </SelectTrigger>
                  <SelectContent>
                    {languages?.map(lang => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Voice Quality
                </label>
                <Select value={voiceQuality} onValueChange={(v) => setVoiceQuality(v as 'standard' | 'premium')}>
                  <SelectTrigger data-testid="select-voice-quality">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard (Edge TTS - Free)</SelectItem>
                    <SelectItem value="premium">Premium (ElevenLabs)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {voiceQuality === 'standard' && "Uses Microsoft Edge neural voices - free and unlimited"}
                  {voiceQuality === 'premium' && "Uses ElevenLabs premium voices - natural, emotional speech (requires API key)"}
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Speaker Mode
                </label>
                <Select value={speakerMode} onValueChange={(v) => setSpeakerMode(v as SpeakerMode)}>
                  <SelectTrigger data-testid="select-speaker-mode">
                    <SelectValue placeholder="Select speaker mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Voice</SelectItem>
                    <SelectItem value="alternating">Alternating (Male/Female)</SelectItem>
                    <SelectItem value="multi">Multiple Speakers</SelectItem>
                    <SelectItem value="smart">Smart Detection (AI)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {speakerMode === 'single' && "Uses one voice for all dialogue"}
                  {speakerMode === 'alternating' && "Alternates between male and female voices per paragraph"}
                  {speakerMode === 'multi' && "Cycles through configured speakers for each segment"}
                  {speakerMode === 'smart' && "AI detects speaker gender from original audio and assigns voices automatically"}
                </p>
              </div>
              
              {speakerMode === 'single' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Voice Gender</label>
                  <Select value={voiceGender} onValueChange={(v) => setVoiceGender(v as 'male' | 'female')}>
                    <SelectTrigger data-testid="select-voice-gender">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {speakerMode === 'smart' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Gender (Fallback)</label>
                  <Select value={voiceGender} onValueChange={(v) => setVoiceGender(v as 'male' | 'female')}>
                    <SelectTrigger data-testid="select-voice-gender-fallback">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Used when AI cannot determine gender for a segment
                  </p>
                </div>
              )}
              
              {speakerMode === 'multi' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Configure Speakers</label>
                  <div className="space-y-2">
                    {speakers.map((speaker, index) => (
                      <div key={speaker.id} className="flex items-center gap-2">
                        <Input
                          value={speaker.name}
                          onChange={(e) => {
                            const newSpeakers = [...speakers];
                            newSpeakers[index] = { ...speaker, name: e.target.value };
                            setSpeakers(newSpeakers);
                          }}
                          placeholder="Speaker name"
                          className="flex-1"
                          data-testid={`input-speaker-name-${index}`}
                        />
                        <Select 
                          value={speaker.gender} 
                          onValueChange={(v) => {
                            const newSpeakers = [...speakers];
                            newSpeakers[index] = { ...speaker, gender: v as 'male' | 'female' };
                            setSpeakers(newSpeakers);
                          }}
                        >
                          <SelectTrigger className="w-28" data-testid={`select-speaker-gender-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                        </Select>
                        {speakers.length > 2 && (
                          <Button 
                            size="icon" 
                            variant="ghost"
                            onClick={() => setSpeakers(speakers.filter((_, i) => i !== index))}
                            data-testid={`button-remove-speaker-${index}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {speakers.length < 6 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSpeakers([
                        ...speakers,
                        { id: speakers.length + 1, name: `Speaker ${speakers.length + 1}`, gender: speakers.length % 2 === 0 ? 'male' : 'female' }
                      ])}
                      data-testid="button-add-speaker"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Speaker
                    </Button>
                  )}
                </div>
              )}
              
              {selectedLanguage && languages && (
                <div className="text-sm text-muted-foreground">
                  <p>Available voices: {languages.find(l => l.code === selectedLanguage)?.voices.length || 0}</p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setDubDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  console.log('[Dubbing] Button clicked, selectedMovieId:', selectedMovieId, 'sourceLanguage:', sourceLanguage, 'selectedLanguage:', selectedLanguage, 'speakerMode:', speakerMode);
                  if (selectedMovieId && selectedLanguage) {
                    console.log('[Dubbing] Calling mutation...');
                    startDubbingMutation.mutate({ 
                      movieId: selectedMovieId, 
                      languageCode: selectedLanguage,
                      sourceLanguage,
                      speakerMode,
                      voiceGender,
                      speakers,
                      voiceQuality
                    });
                  } else {
                    console.log('[Dubbing] Missing movieId or language, not calling mutation');
                  }
                }}
                disabled={!selectedLanguage || startDubbingMutation.isPending}
                data-testid="button-start-dubbing"
              >
                {startDubbingMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Dubbing
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
      
      <Footer />
    </div>
  );
}

function MovieRow({ 
  movie, 
  onStartDubbing, 
  onDeleteTrack,
  isDeleting 
}: { 
  movie: Movie; 
  onStartDubbing: () => void;
  onDeleteTrack: (trackId: string) => void;
  isDeleting: boolean;
}) {
  const { isAuthorized } = useAdminAuth();
  
  const { data: dubbedTracks } = useQuery<DubbedAudioTrack[]>({
    queryKey: ['/api/movies', movie.id, 'dubbed-tracks'],
    queryFn: async () => {
      const res = await fetch(`/api/movies/${movie.id}/dubbed-tracks`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthorized,
    staleTime: 30000,
  });

  const completedTracks = dubbedTracks?.filter(t => t.status === 'completed') || [];
  const processingTracks = dubbedTracks?.filter(t => t.status === 'processing' || t.status === 'pending') || [];

  return (
    <TableRow data-testid={`row-movie-${movie.id}`}>
      <TableCell>
        <div className="flex items-center gap-3">
          {movie.poster && (
            <img 
              src={movie.poster} 
              alt={movie.title} 
              className="w-10 h-14 object-cover rounded"
            />
          )}
          <div>
            <p className="font-medium">{movie.title}</p>
            <p className="text-xs text-muted-foreground line-clamp-1">{movie.director}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>{movie.year}</TableCell>
      <TableCell>{movie.duration ? `${movie.duration} min` : 'N/A'}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {completedTracks.map(track => (
            <Badge 
              key={track.id} 
              variant="default" 
              className="text-xs flex items-center gap-1"
            >
              {track.languageName}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTrack(track.id);
                }}
                className="ml-1 hover:text-red-500"
                disabled={isDeleting}
                data-testid={`button-delete-track-${track.id}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {processingTracks.map(track => (
            <Badge key={track.id} variant="secondary" className="text-xs">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              {track.languageName}
            </Badge>
          ))}
          {(!dubbedTracks || dubbedTracks.length === 0) && (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Button 
          size="sm" 
          variant="outline"
          onClick={onStartDubbing}
          disabled={!movie.videoUrl}
          data-testid={`button-dub-movie-${movie.id}`}
        >
          <Languages className="w-4 h-4 mr-1" />
          Dub
        </Button>
      </TableCell>
    </TableRow>
  );
}
