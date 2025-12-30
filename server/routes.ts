import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMovieSchema, updateMovieSchema, insertProfileSchema } from "@shared/schema";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { fetchMovieFromTMDB, searchTMDBMultiple, getTMDBMovieDetails, discoverMovies, getTMDBGenres, convertTMDBResultToMovie } from "./tmdb";
import { fetchInstagramReels, extractMovieTitleFromCaption, type InstagramReel } from "./instagram";
import { fetchPlaylistVideos, fetchUserPlaylists, searchYouTubeVideos, type YouTubeVideo } from "./youtube";
import { extractOkRuDirectUrl } from "./okru-extractor";
import { ObjectStorageService } from "./objectStorage";
import { r2StorageService } from "./r2Storage";
import { jobQueue } from "./jobQueue";
import { getWorkerStatus } from "./jobWorker";
import { getPlatformInfo, shouldRetryBasedOnError } from "./platformDetector";
import { recoveredMovies } from "./recoveredMoviesData";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";
import { spawn } from "child_process";

declare module 'express-session' {
  interface SessionData {
    isAdmin: boolean;
    profileId?: string;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "..", "attached_assets", "movie_posters");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: multerStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'));
    }
  }
});

function isAdmin(req: any, res: any, next: any) {
  // Allow session-based auth
  if (req.session && req.session.isAdmin) {
    next();
    return;
  }
  // Also allow header-based auth for API testing
  const headerSecret = req.headers['x-admin-secret'];
  const adminSecret = process.env.ADMIN_SECRET;
  if (headerSecret && adminSecret && headerSecret === adminSecret) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized - Admin access required" });
}

// Serialize movie object from database to API response format (snake_case → camelCase)
function serializeMovie(movie: any) {
  return {
    id: movie.id,
    title: movie.title,
    description: movie.description,
    year: movie.year,
    rating: movie.rating,
    genres: movie.genres,
    poster: movie.poster,
    backdrop: movie.backdrop,
    videoUrl: movie.videoUrl || movie.video_url,
    mobileMp4Url: movie.mobileMp4Url || movie.mobile_mp4_url,
    trailerUrl: movie.trailerUrl || movie.trailer_url,
    duration: movie.duration,
    director: movie.director,
    cast: movie.cast,
    introStart: movie.introStart || movie.intro_start,
    introEnd: movie.introEnd || movie.intro_end,
    creditsStart: movie.creditsStart || movie.credits_start,
    subtitleUrl: movie.subtitleUrl || movie.subtitle_url,
    viewCount: movie.viewCount || movie.view_count,
    hostedAssetKey: movie.hostedAssetKey || movie.hosted_asset_key,
    transcodingStatus: movie.transcodingStatus || movie.transcoding_status,
    transcodingError: movie.transcodingError || movie.transcoding_error,
    transcodingUpdatedAt: movie.transcodingUpdatedAt || movie.transcoding_updated_at,
    originalEmbedUrl: movie.originalEmbedUrl || movie.original_embed_url,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);
  
  app.post('/api/admin/login', (req, res) => {
    const { secret } = req.body;
    const adminSecret = process.env.ADMIN_SECRET;

    console.log(`[Admin Login] Attempt with secret length: ${secret?.length || 0}, configured secret length: ${adminSecret?.length || 0}`);

    if (!adminSecret) {
      return res.status(500).json({ error: "Admin secret not configured" });
    }

    if (secret === adminSecret) {
      req.session.regenerate((err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to create admin session" });
        }
        
        req.session.isAdmin = true;
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            return res.status(500).json({ error: "Failed to save admin session" });
          }
          res.json({ success: true });
        });
      });
    } else {
      res.status(401).json({ error: "Invalid admin secret" });
    }
  });

  app.post('/api/admin/logout', (req, res) => {
    req.session.isAdmin = false;
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });

  app.get('/api/admin/session', (req, res) => {
    if (req.session && req.session.isAdmin) {
      res.json({ isAdmin: true });
    } else {
      res.json({ isAdmin: false });
    }
  });

  app.get('/api/admin/analytics', isAdmin, async (req, res) => {
    try {
      const analytics = await storage.getAnalytics();
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Phase 1: Profile CRUD API Routes
  app.get('/api/profiles', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profiles = await storage.getUserProfiles(userId);
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching profiles:", error);
      res.status(500).json({ error: "Failed to fetch profiles" });
    }
  });

  app.post('/api/profiles', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body with schema (userId MUST come last to prevent client override)
      const validation = insertProfileSchema.safeParse({
        ...req.body,
        name: (req.body.name || "").trim(), // Trim before validation
        userId, // Server-controlled, cannot be overridden by client
      });

      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors[0].message });
      }

      // Enforce max 5 profiles per user
      const existingProfiles = await storage.getUserProfiles(userId);
      if (existingProfiles.length >= 5) {
        return res.status(400).json({ error: "Maximum of 5 profiles per account" });
      }

      const profile = await storage.createProfile(validation.data);

      res.json(profile);
    } catch (error) {
      console.error("Error creating profile:", error);
      res.status(500).json({ error: "Failed to create profile" });
    }
  });

  app.delete('/api/profiles/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profileId = req.params.id;

      // Verify ownership
      const profile = await storage.getProfileById(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      if (profile.userId !== userId) {
        return res.status(403).json({ error: "You don't have permission to delete this profile" });
      }

      // Prevent deleting last profile
      const userProfiles = await storage.getUserProfiles(userId);
      if (userProfiles.length <= 1) {
        return res.status(400).json({ error: "Cannot delete your last profile" });
      }

      const success = await storage.deleteProfile(profileId);
      
      // Clear session profile if it was deleted
      if (req.session.profileId === profileId) {
        delete req.session.profileId;
      }

      res.json({ success });
    } catch (error) {
      console.error("Error deleting profile:", error);
      res.status(500).json({ error: "Failed to delete profile" });
    }
  });

  app.post('/api/profiles/:id/select', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profileId = req.params.id;

      // Verify ownership
      const profile = await storage.getProfileById(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      if (profile.userId !== userId) {
        return res.status(403).json({ error: "You don't have permission to select this profile" });
      }

      // Store selected profile in session
      req.session.profileId = profileId;

      res.json({ success: true, profileId });
    } catch (error) {
      console.error("Error selecting profile:", error);
      res.status(500).json({ error: "Failed to select profile" });
    }
  });

  app.get('/api/profiles/current', isAuthenticated, async (req: any, res) => {
    try {
      const profileId = req.session.profileId;
      
      if (!profileId) {
        return res.json({ profile: null });
      }

      const profile = await storage.getProfileById(profileId);
      res.json({ profile });
    } catch (error) {
      console.error("Error fetching current profile:", error);
      res.status(500).json({ error: "Failed to fetch current profile" });
    }
  });

  app.post("/api/upload/poster", isAdmin, (req, res, next) => {
    upload.single('poster')(req, res, (err) => {
      if (err) {
        console.error("Error uploading poster:", err);
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: "File size exceeds 5MB limit" });
          }
        }
        return res.status(400).json({ error: err.message || "Failed to upload file" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileUrl = `/api/posters/${req.file.filename}`;
      res.json({ url: fileUrl });
    });
  });

  app.get("/api/posters/:filename", (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(uploadDir, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Poster not found" });
      }
      
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving poster:", error);
      res.status(500).json({ error: "Failed to serve poster" });
    }
  });

  app.get("/api/admin/movies-export", isAdmin, (req, res) => {
    try {
      const exportPath = path.join(__dirname, "..", "attached_assets", "movies_export.json");
      
      if (!fs.existsSync(exportPath)) {
        return res.status(404).json({ error: "Export file not found" });
      }
      
      res.sendFile(exportPath);
    } catch (error) {
      console.error("Error serving export file:", error);
      res.status(500).json({ error: "Failed to serve export file" });
    }
  });

  app.get("/api/assets/:imageName", (req, res) => {
    const imageMap: Record<string, string> = {
      "vintage-thriller.png": "Vintage_thriller_movie_poster_177dcf87.png",
      "scifi-poster.png": "Retro_sci-fi_movie_poster_c3aa9067.png",
      "noir-poster.png": "Film_noir_movie_poster_f13dd592.png",
      "action-poster.png": "Action_thriller_movie_poster_af1ac279.png",
      "horror-poster.png": "Horror_movie_poster_1af41bb8.png",
      "western-poster.png": "Western_movie_poster_0797166e.png",
      "cyberpunk-backdrop.png": "Cyberpunk_city_hero_backdrop_d85b49aa.png",
      "stormy-backdrop.png": "Stormy_ocean_hero_backdrop_00b6c209.png",
      "thriller-generated.png": "Thriller_movie_poster_design_5caad861.png",
      "action-generated.png": "Action_adventure_poster_design_7418e3bb.png",
      "drama-generated.png": "Drama_movie_poster_design_3afd24ee.png",
      "scifi-generated.png": "Sci-fi_movie_poster_design_734c9182.png",
      "landscape-backdrop.png": "Cinematic_backdrop_landscape_6baa9fdb.png",
      "urban-backdrop.png": "Urban_cityscape_backdrop_f949f61d.png",
      "desert-backdrop.png": "Desert_sunset_backdrop_0f0b18e2.png",
      "forest-backdrop.png": "Misty_forest_backdrop_3f90f334.png"
    };

    const { imageName } = req.params;
    const actualImageName = imageMap[imageName];
    
    if (!actualImageName) {
      return res.status(404).json({ error: "Image not found" });
    }

    const imagePath = path.join(__dirname, "..", "attached_assets", "generated_images", actualImageName);
    res.sendFile(imagePath);
  });

  app.get("/api/movies", async (req, res) => {
    try {
      const movies = await storage.getAllMovies();
      res.json(movies.map(serializeMovie));
    } catch (error) {
      console.error("Error fetching movies:", error);
      res.status(500).json({ error: "Failed to fetch movies" });
    }
  });

  app.get("/api/movies/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }
      const movies = await storage.searchMovies(query);
      res.json(movies.map(serializeMovie));
    } catch (error) {
      console.error("Error searching movies:", error);
      res.status(500).json({ error: "Failed to search movies" });
    }
  });

  app.get("/api/movies/genre/:genre", async (req, res) => {
    try {
      const { genre } = req.params;
      const movies = await storage.getMoviesByGenre(genre);
      res.json(movies.map(serializeMovie));
    } catch (error) {
      console.error("Error fetching movies by genre:", error);
      res.status(500).json({ error: "Failed to fetch movies by genre" });
    }
  });

  app.get("/api/genres", async (req, res) => {
    try {
      const genres = await storage.getGenresWithCounts();
      res.json(genres);
    } catch (error) {
      console.error("Error getting genres:", error);
      res.status(500).json({ error: "Failed to get genres" });
    }
  });

  app.get("/api/recommendations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const watchHistory = await storage.getWatchHistory(userId);
      const allMovies = await storage.getAllMovies();
      
      if (watchHistory.length === 0) {
        const trending = await storage.getTrendingMovies(limit);
        return res.json(trending.map(serializeMovie));
      }
      
      const watchedMovieIds = new Set(watchHistory.map(w => w.movieId));
      const watchedGenres = new Map<string, number>();
      const watchedDirectors = new Map<string, number>();
      
      for (const watch of watchHistory) {
        const movie = allMovies.find(m => m.id === watch.movieId);
        if (movie) {
          if (movie.genres) {
            for (const genre of movie.genres) {
              watchedGenres.set(genre, (watchedGenres.get(genre) || 0) + 1);
            }
          }
          if (movie.director) {
            watchedDirectors.set(movie.director, (watchedDirectors.get(movie.director) || 0) + 1);
          }
        }
      }
      
      const scoredCandidates = allMovies
        .filter(movie => !watchedMovieIds.has(movie.id))
        .map(movie => {
          let score = 0;
          
          // Genre-based scoring (10 points per shared genre)
          if (movie.genres) {
            for (const genre of movie.genres) {
              const genreCount = watchedGenres.get(genre) || 0;
              score += genreCount * 10;
            }
          }
          
          // Director-based scoring (20 points per director match - weighted higher than genres)
          if (movie.director && watchedDirectors.has(movie.director)) {
            const directorCount = watchedDirectors.get(movie.director) || 0;
            score += directorCount * 20;
          }
          
          // Popularity bonus (0.1 points per view)
          score += (movie.viewCount || 0) * 0.1;
          
          return { movie, score };
        });
      
      // Check if we have any matches before filtering
      const hasMatches = scoredCandidates.some(({ score }) => score > 0);
      
      let scoredMovies;
      if (hasMatches) {
        scoredMovies = scoredCandidates
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(({ movie }) => movie);
      } else {
        // Fallback to trending if no genre-based matches
        scoredMovies = await storage.getTrendingMovies(limit);
      }
      
      res.json(scoredMovies.map(serializeMovie));
    } catch (error) {
      console.error("Error getting recommendations:", error);
      res.status(500).json({ error: "Failed to get recommendations" });
    }
  });

  app.post("/api/extract-okru-url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ 
          success: false,
          error: "invalid-url",
          errorMessage: "URL is required" 
        });
      }

      const result = await extractOkRuDirectUrl(url);
      
      if (!result.success) {
        const statusCode = result.error === 'invalid-url' ? 400 : 
                          result.error === 'not-found' ? 404 :
                          result.error === 'timeout' ? 504 : 500;
        
        return res.status(statusCode).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error extracting Ok.ru URL:", error);
      res.status(500).json({ 
        success: false,
        error: "server-error",
        errorMessage: error.message || "Failed to extract Ok.ru video URL" 
      });
    }
  });

  app.get("/api/movies/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const movie = await storage.getMovieById(id);
      if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
      }
      res.json(serializeMovie(movie));
    } catch (error) {
      console.error("Error fetching movie:", error);
      res.status(500).json({ error: "Failed to fetch movie" });
    }
  });

  app.post("/api/movies", isAdmin, async (req, res) => {
    try {
      const validationResult = insertMovieSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed",
          details: validationResult.error.errors
        });
      }

      const newMovie = await storage.createMovie(validationResult.data);
      
      // AUTO-DOWNLOAD DISABLED: Videos will use embeds (YouTube/Vimeo) directly
      // Manual download available via: POST /api/movies/:id/download-and-host
      // This saves compute costs and prevents failed retries
      
      res.status(201).json(serializeMovie(newMovie));
    } catch (error: any) {
      console.error("Error creating movie:", error);
      res.status(400).json({ 
        error: "Failed to create movie",
        details: error.message 
      });
    }
  });

  app.patch("/api/movies/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const validationResult = updateMovieSchema.safeParse({ ...req.body, id });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed",
          details: validationResult.error.errors
        });
      }

      const updatedMovie = await storage.updateMovie(validationResult.data);
      
      if (!updatedMovie) {
        return res.status(404).json({ error: "Movie not found" });
      }

      // AUTO-DOWNLOAD DISABLED: Videos will use embeds (YouTube/Vimeo) directly
      // Manual download available via: POST /api/movies/:id/download-and-host
      // This saves compute costs and prevents failed retries

      res.json(serializeMovie(updatedMovie));
    } catch (error: any) {
      console.error("Error updating movie:", error);
      res.status(400).json({ 
        error: "Failed to update movie",
        details: error.message 
      });
    }
  });

  app.delete("/api/movies/:id", isAdmin, async (req, res) => {
    try {
      const { id} = req.params;
      const deleted = await storage.deleteMovie(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Movie not found" });
      }

      res.json({ success: true, message: "Movie deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting movie:", error);
      res.status(500).json({ 
        error: "Failed to delete movie",
        details: error.message 
      });
    }
  });

  app.post("/api/admin/bulk-import", isAdmin, async (req, res) => {
    try {
      const { movies } = req.body;
      
      if (!Array.isArray(movies)) {
        return res.status(400).json({ error: "Movies must be an array" });
      }

      const validatedMovies = [];
      const errors = [];

      for (let i = 0; i < movies.length; i++) {
        const movie = movies[i];
        const movieData = {
          ...movie,
          videoUrl: movie.videoUrl || movie.video_url,
        };
        delete movieData.video_url;
        delete movieData.id;

        const validationResult = insertMovieSchema.safeParse(movieData);
        if (validationResult.success) {
          validatedMovies.push(validationResult.data);
        } else {
          errors.push({
            index: i,
            title: movie.title || 'Unknown',
            errors: validationResult.error.errors
          });
        }
      }

      if (validatedMovies.length === 0) {
        return res.status(400).json({ 
          error: "No valid movies to import",
          validationErrors: errors
        });
      }

      const result = await storage.bulkImportMovies(validatedMovies);
      
      // AUTO-DOWNLOAD DISABLED: Videos will use embeds (YouTube/Vimeo) directly
      // Manual download available via: POST /api/movies/:id/download-and-host
      // This saves compute costs and prevents failed retries
      
      res.json({
        success: true,
        imported: result.imported,
        updated: result.updated,
        total: validatedMovies.length,
        skipped: errors.length,
        validationErrors: errors.length > 0 ? errors : undefined
      });
    } catch (error: any) {
      console.error("Error bulk importing movies:", error);
      res.status(500).json({ 
        error: "Failed to bulk import movies",
        details: error.message 
      });
    }
  });

  app.post("/api/search-tmdb", isAdmin, async (req, res) => {
    try {
      const { title } = req.body;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: "Movie title is required" });
      }

      const movieData = await fetchMovieFromTMDB(title);
      
      if (!movieData) {
        return res.status(404).json({ error: "Movie not found in TMDB" });
      }

      console.log(`[TMDB] Fetched "${title}":`, {
        title: movieData.title,
        year: movieData.year,
        director: movieData.director,
        castCount: movieData.cast.length
      });

      res.json(movieData);
    } catch (error: any) {
      console.error("Error searching TMDB:", error);
      res.status(500).json({ 
        error: "Failed to search TMDB",
        details: error.message 
      });
    }
  });

  app.post("/api/search-tmdb-multiple", isAdmin, async (req, res) => {
    try {
      const { title } = req.body;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: "Movie title is required" });
      }

      const results = await searchTMDBMultiple(title);
      
      console.log(`[TMDB] Found ${results.length} results for "${title}"`);

      res.json({ results, count: results.length });
    } catch (error: any) {
      console.error("Error searching TMDB:", error);
      res.status(500).json({ 
        error: "Failed to search TMDB",
        details: error.message 
      });
    }
  });

  app.post("/api/tmdb-details/:id", isAdmin, async (req, res) => {
    try {
      const tmdbId = parseInt(req.params.id);
      if (isNaN(tmdbId)) {
        return res.status(400).json({ error: "Invalid TMDB ID" });
      }

      const { details, credits } = await getTMDBMovieDetails(tmdbId);
      
      const director = credits.crew.find(person => person.job === 'Director')?.name || 'Unknown';
      const cast = credits.cast.slice(0, 10).map(person => person.name);
      
      const year = details.release_date 
        ? String(new Date(details.release_date).getFullYear()) 
        : String(new Date().getFullYear());
      
      const voteAverage = details.vote_average || 7.0;
      let rating = 'PG-13';
      if (voteAverage >= 8.5) rating = 'R';
      else if (voteAverage >= 7.0) rating = 'PG-13';
      else if (voteAverage >= 5.0) rating = 'PG';
      else rating = 'G';
      
      const duration = details.runtime || 120;
      const genres = details.genres.map(g => g.name);
      
      const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
      const poster = details.poster_path 
        ? `${TMDB_IMAGE_BASE}/w500${details.poster_path}`
        : '/api/assets/thriller-generated.png';
        
      const backdrop = details.backdrop_path
        ? `${TMDB_IMAGE_BASE}/w1280${details.backdrop_path}`
        : '/api/assets/cyberpunk-backdrop.png';
      
      res.json({
        title: details.title,
        description: details.overview || 'No description available.',
        year,
        rating,
        genres,
        poster,
        backdrop,
        duration,
        director,
        cast,
        videoUrl: ''
      });
    } catch (error: any) {
      console.error("Error fetching TMDB details:", error);
      res.status(500).json({ 
        error: "Failed to fetch TMDB details",
        details: error.message 
      });
    }
  });

  app.get("/api/tmdb/search", isAdmin, async (req, res) => {
    try {
      const query = req.query.query as string;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }
      const results = await searchTMDBMultiple(query);
      res.json({ results });
    } catch (error: any) {
      console.error("Error searching TMDB:", error);
      res.status(500).json({ 
        error: "Failed to search TMDB",
        details: error.message 
      });
    }
  });

  app.get("/api/tmdb/genres", isAdmin, async (req, res) => {
    try {
      const genres = await getTMDBGenres();
      res.json({ genres });
    } catch (error: any) {
      console.error("Error fetching TMDB genres:", error);
      res.status(500).json({ 
        error: "Failed to fetch genres",
        details: error.message 
      });
    }
  });

  // Web search for movies using OpenAI
  app.post("/api/search-movie-web", isAdmin, async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: "Search query is required" });
      }

      console.log(`[Web Search] Searching for: "${query}"`);

      // Use OpenAI to search for movie info
      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a movie database expert. Search your knowledge for information about the movie the user is looking for. Return a JSON array with up to 5 movies that match the query. Each movie should have: title, year, description (2-3 sentences), director, genres (array of strings), rating (G, PG, PG-13, R, or NR), and cast (array of up to 5 actor names). If you can't find any movies, return an empty array. Only return the JSON array, nothing else.`
          },
          {
            role: "user",
            content: `Find movies matching: "${query}"`
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0]?.message?.content || "{}";
      let results: any[] = [];
      
      try {
        const parsed = JSON.parse(content);
        results = parsed.movies || parsed.results || (Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        console.error("[Web Search] Failed to parse OpenAI response:", content);
      }

      console.log(`[Web Search] Found ${results.length} results`);
      res.json({ results });
    } catch (error: any) {
      console.error("Error in web search:", error);
      res.status(500).json({ 
        error: "Web search failed",
        details: error.message 
      });
    }
  });

  app.post("/api/tmdb/discover", isAdmin, async (req, res) => {
    try {
      const { genreIds, yearFrom, yearTo, minRating, sortBy, page } = req.body;
      
      const results = await discoverMovies({
        genreIds,
        yearFrom,
        yearTo,
        minRating,
        sortBy,
        page: page || 1
      });
      
      console.log(`[TMDB Discovery] Found ${results.length} movies`);
      
      res.json({ results, count: results.length });
    } catch (error: any) {
      console.error("Error discovering movies from TMDB:", error);
      res.status(500).json({ 
        error: "Failed to discover movies",
        details: error.message 
      });
    }
  });

  app.post("/api/tmdb/import-movie", isAdmin, async (req, res) => {
    try {
      const { tmdbId } = req.body;
      if (!tmdbId || typeof tmdbId !== 'number') {
        return res.status(400).json({ error: "TMDB ID is required" });
      }

      const { details, credits } = await getTMDBMovieDetails(tmdbId);
      
      const movieData = await convertTMDBResultToMovie({ 
        id: tmdbId,
        title: details.title,
        overview: details.overview,
        poster_path: details.poster_path,
        backdrop_path: details.backdrop_path,
        release_date: details.release_date,
        vote_average: details.vote_average
      });

      const validationResult = insertMovieSchema.omit({ videoUrl: true }).safeParse(movieData);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Movie data validation failed",
          details: validationResult.error.errors 
        });
      }

      const existingMovie = await storage.getMovieByTitleAndYear(movieData.title, movieData.year);
      
      if (existingMovie) {
        return res.status(409).json({ 
          error: "Movie already exists",
          movieId: existingMovie.id 
        });
      }

      const newMovie = await storage.createMovie(movieData);
      
      console.log(`[TMDB Import] Imported "${newMovie.title}" (${newMovie.year})`);
      
      res.json({ 
        success: true, 
        movie: serializeMovie(newMovie),
        needsVideo: !newMovie.videoUrl
      });
    } catch (error: any) {
      console.error("Error importing movie from TMDB:", error);
      res.status(500).json({ 
        error: "Failed to import movie",
        details: error.message 
      });
    }
  });

  const objectStorageService = new ObjectStorageService();

  // YouTube Cookies Management
  // These endpoints allow admins to upload/manage YouTube cookies for authenticated downloads
  const YOUTUBE_COOKIES_PATH = '/tmp/youtube-cookies.txt';
  
  // Check if cookies are configured
  app.get("/api/admin/youtube-cookies/status", isAdmin, async (req, res) => {
    try {
      const exists = fs.existsSync(YOUTUBE_COOKIES_PATH);
      let size = 0;
      let modified = null;
      
      if (exists) {
        const stats = fs.statSync(YOUTUBE_COOKIES_PATH);
        size = stats.size;
        modified = stats.mtime.toISOString();
      }
      
      res.json({
        configured: exists && size > 100,
        size,
        modified,
        message: exists 
          ? `YouTube cookies configured (${Math.round(size / 1024)}KB)` 
          : 'No YouTube cookies configured. Upload cookies.txt to enable YouTube downloads.'
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Upload YouTube cookies (accepts cookies.txt content)
  app.post("/api/admin/youtube-cookies", isAdmin, async (req, res) => {
    try {
      const { cookies } = req.body;
      
      if (!cookies || typeof cookies !== 'string') {
        return res.status(400).json({ error: 'Cookies content is required (paste your cookies.txt file content)' });
      }
      
      // Validate cookies format (Netscape format)
      const lines = cookies.split('\n').filter((line: string) => line.trim() && !line.startsWith('#'));
      if (lines.length < 3) {
        return res.status(400).json({ 
          error: 'Invalid cookies format. Please export cookies in Netscape/Mozilla format (cookies.txt)' 
        });
      }
      
      // Check for YouTube cookies specifically
      const hasYouTubeCookies = cookies.toLowerCase().includes('youtube.com') || 
                                 cookies.toLowerCase().includes('.google.com');
      if (!hasYouTubeCookies) {
        return res.status(400).json({ 
          error: 'No YouTube/Google cookies found. Make sure you export cookies while logged into YouTube.' 
        });
      }
      
      // Write cookies to file
      fs.writeFileSync(YOUTUBE_COOKIES_PATH, cookies, 'utf-8');
      
      const stats = fs.statSync(YOUTUBE_COOKIES_PATH);
      console.log(`[Cookies] YouTube cookies saved (${Math.round(stats.size / 1024)}KB)`);
      
      res.json({ 
        success: true, 
        message: 'YouTube cookies saved successfully! YouTube downloads are now enabled.',
        size: stats.size
      });
    } catch (error: any) {
      console.error('[Cookies] Error saving cookies:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Delete YouTube cookies
  app.delete("/api/admin/youtube-cookies", isAdmin, async (req, res) => {
    try {
      if (fs.existsSync(YOUTUBE_COOKIES_PATH)) {
        fs.unlinkSync(YOUTUBE_COOKIES_PATH);
        console.log('[Cookies] YouTube cookies deleted');
      }
      res.json({ success: true, message: 'YouTube cookies deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/movies/:id/download-and-host", isAdmin, async (req, res) => {
    const { id: movieId } = req.params;
    const { quality = 'best' } = req.body;
    
    try {
      const movie = await storage.getMovieById(movieId);
      if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
      }

      if (!movie.videoUrl && !movie.mobileMp4Url) {
        return res.status(400).json({ error: "No video URL found for this movie" });
      }

      // Check if there's already a pending or processing job for this movie
      const existingJobs = await jobQueue.getJobs({
        movieId,
        limit: 1
      });
      
      const activeJob = existingJobs.find(j => 
        j.status === 'pending' || j.status === 'processing'
      );
      
      if (activeJob) {
        return res.status(409).json({ 
          error: "Download already in progress for this movie",
          jobId: activeJob.id
        });
      }

      const sourceUrl = movie.mobileMp4Url || movie.videoUrl;
      if (!sourceUrl) {
        return res.status(400).json({ error: "No valid video URL found" });
      }

      // URL validation
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(sourceUrl);
      } catch (err) {
        return res.status(400).json({ error: "Invalid video URL format" });
      }

      const allowedProtocols = ['https:', 'http:'];
      if (!allowedProtocols.includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: "Only HTTP(S) URLs are allowed" });
      }

      const supportedDomains = [
        'youtube.com', 'youtu.be',           // YouTube
        'ok.ru',                              // Ok.ru
        'vimeo.com',                          // Vimeo
        'dailymotion.com', 'dai.ly',          // Dailymotion
        'vk.com', 'vkvideo.ru', 'vk.ru',      // VK Video
        'tokyvideo.com', 'tokyo-video.com',   // TokyVideo
        'archive.org',                        // Archive.org
        'rumble.com'                          // Rumble
      ];
      const urlDomain = parsedUrl.hostname.toLowerCase();
      if (!supportedDomains.some(domain => urlDomain.includes(domain))) {
        return res.status(400).json({ 
          error: "Unsupported video source. Supported: YouTube, Ok.ru, Vimeo, Dailymotion, VK Video, TokyVideo, Archive.org, Rumble." 
        });
      }

      if (sourceUrl.includes(';') || sourceUrl.includes('`') || sourceUrl.includes('$')) {
        return res.status(400).json({ error: "Invalid characters in URL" });
      }

      // Validate quality parameter
      const validQualities = ['best', '720p', '480p'];
      const selectedQuality = validQualities.includes(quality) ? quality : 'best';

      // Create download job with quality preference
      const job = await jobQueue.createJob(
        'video-download',
        movieId,
        { sourceUrl, targetFormat: 'mp4', quality: selectedQuality },
        { priority: 0 }
      );

      // Update movie record to preserve original embed URL
      await storage.updateMovie({
        id: movieId,
        originalEmbedUrl: movie.originalEmbedUrl || sourceUrl,
      });

      console.log(`[API] Created video download job ${job.id} for movie "${movie.title}"`);

      res.status(202).json({ 
        message: "Download job created successfully",
        jobId: job.id,
        status: job.status
      });

    } catch (error: any) {
      console.error("Error creating download job:", error);
      res.status(500).json({ 
        error: "Failed to create download job",
        details: error.message 
      });
    }
  });

  app.get("/api/movies/:id/transcoding-status", async (req, res) => {
    try {
      const { id: movieId } = req.params;
      
      const movie = await storage.getMovieById(movieId);
      if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
      }

      // Check for active job first
      const jobs = await jobQueue.getJobs({
        movieId,
        limit: 1
      });

      const activeJob = jobs.find(j => 
        j.status === 'pending' || j.status === 'processing'
      );

      if (activeJob) {
        // Return job-based status
        return res.json({
          status: activeJob.status === 'pending' ? 'pending' : 'downloading',
          error: activeJob.error,
          updatedAt: activeJob.updatedAt,
          hostedAssetKey: movie.hostedAssetKey,
          progress: activeJob.progress,
          progressDetail: activeJob.progressDetail,
          jobId: activeJob.id,
        });
      }

      // No active job - return movie status (backward compatibility)
      res.json({
        status: movie.transcodingStatus || "idle",
        error: movie.transcodingError,
        updatedAt: movie.transcodingUpdatedAt,
        hostedAssetKey: movie.hostedAssetKey,
        progress: movie.transcodingStatus === 'completed' ? 100 : 0,
      });
    } catch (error: any) {
      console.error("Error fetching transcoding status:", error);
      res.status(500).json({ 
        error: "Failed to fetch transcoding status",
        details: error.message 
      });
    }
  });

  // Job Management API Endpoints
  
  app.get("/api/admin/jobs", isAdmin, async (req, res) => {
    try {
      const { status, type, movieId, limit = '50', offset = '0' } = req.query;
      
      const filters: any = {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      };

      // Handle status parameter - supports both comma-delimited string and repeated params
      if (status) {
        if (Array.isArray(status)) {
          // Repeated query params: ?status=pending&status=failed
          filters.status = status;
        } else if (typeof status === 'string') {
          // Comma-delimited: ?status=pending,failed
          filters.status = status.includes(',') ? status.split(',') : status;
        }
      }
      
      if (type && typeof type === 'string') {
        filters.type = type;
      }
      if (movieId && typeof movieId === 'string') {
        filters.movieId = movieId;
      }

      const jobs = await jobQueue.getJobs(filters);
      
      // Prevent browser/proxy caching
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      
      res.json({ jobs, count: jobs.length });
    } catch (error: any) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ 
        error: "Failed to fetch jobs",
        details: error.message 
      });
    }
  });

  app.get("/api/admin/jobs/stats", isAdmin, async (req, res) => {
    try {
      // Prevent browser/proxy caching
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      
      const stats = await jobQueue.getStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching job stats:", error);
      res.status(500).json({ 
        error: "Failed to fetch job statistics",
        details: error.message 
      });
    }
  });

  app.get("/api/admin/worker/status", isAdmin, async (req, res) => {
    try {
      const workerStatus = getWorkerStatus();
      const stats = await jobQueue.getStats();
      const pendingJobs = await jobQueue.getJobs({ status: 'pending', limit: 10 });
      
      res.json({
        worker: workerStatus || { isRunning: false, workerId: null },
        stats,
        pendingJobs: pendingJobs.map(j => ({
          id: j.id,
          type: j.type,
          status: j.status,
          createdAt: j.createdAt,
          runAt: j.runAt,
          lockedBy: j.lockedBy,
          lockedAt: j.lockedAt
        })),
        serverTime: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error: any) {
      console.error("Error fetching worker status:", error);
      res.status(500).json({ 
        error: "Failed to fetch worker status",
        details: error.message 
      });
    }
  });

  app.get("/api/admin/jobs/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const job = await jobQueue.getJob(id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error: any) {
      console.error("Error fetching job:", error);
      res.status(500).json({ 
        error: "Failed to fetch job",
        details: error.message 
      });
    }
  });

  app.post("/api/admin/jobs/:id/retry", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const job = await jobQueue.getJob(id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Allow retrying failed, cancelled, AND stuck processing jobs
      const allowedStatuses = ['failed', 'cancelled', 'processing'];
      if (!allowedStatuses.includes(job.status)) {
        return res.status(400).json({ 
          error: "Only failed, cancelled, or stuck processing jobs can be retried" 
        });
      }

      const updatedJob = await jobQueue.retryJob(id);
      
      console.log(`[API] Manually retried job ${id} (was ${job.status})`);
      res.json({ 
        message: job.status === 'processing' ? "Stuck job reset and queued for retry" : "Job queued for retry",
        job: updatedJob 
      });
    } catch (error: any) {
      console.error("Error retrying job:", error);
      res.status(500).json({ 
        error: "Failed to retry job",
        details: error.message 
      });
    }
  });

  // Timeout long-running jobs (mark as failed for manual retry)
  app.post("/api/admin/jobs/bulk/timeout-stuck", isAdmin, async (req, res) => {
    try {
      const { maxMinutes = 30 } = req.body;
      const result = await jobQueue.timeoutLongRunningJobs(maxMinutes);
      res.json({ 
        message: `Timed out ${result.count} stuck job(s)`,
        ...result
      });
    } catch (error: any) {
      console.error("Error timing out stuck jobs:", error);
      res.status(500).json({ 
        error: "Failed to timeout stuck jobs",
        details: error.message 
      });
    }
  });

  app.post("/api/admin/jobs/:id/cancel", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const job = await jobQueue.getJob(id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status === 'completed') {
        return res.status(400).json({ 
          error: "Cannot cancel a completed job" 
        });
      }

      if (job.status === 'cancelled') {
        return res.status(400).json({ 
          error: "Job is already cancelled" 
        });
      }

      const updatedJob = await jobQueue.cancelJob(id);
      
      console.log(`[API] Cancelled job ${id}`);
      res.json({ 
        message: "Job cancelled successfully",
        job: updatedJob 
      });
    } catch (error: any) {
      console.error("Error cancelling job:", error);
      res.status(500).json({ 
        error: "Failed to cancel job",
        details: error.message 
      });
    }
  });

  // Get smart retry analysis for failed downloads
  app.get("/api/admin/jobs/failed/analysis", isAdmin, async (req, res) => {
    try {
      const failedJobs = await jobQueue.getJobs({ status: 'failed' });
      
      const analysis = failedJobs.map((job: any) => {
        const sourceUrl = (job.metadata as any)?.sourceUrl || '';
        const platformInfo = getPlatformInfo(sourceUrl);
        const retryAnalysis = shouldRetryBasedOnError(job.error, sourceUrl);
        
        return {
          jobId: job.id,
          type: job.type,
          sourceUrl,
          platform: platformInfo.platform,
          retryable: retryAnalysis.shouldRetry,
          reason: retryAnalysis.reason,
          recommendation: platformInfo.recommendation,
          error: job.error,
          retryCount: job.retryCount,
          createdAt: job.createdAt
        };
      });
      
      // Categorize by fixability
      const fixable = analysis.filter((a: any) => a.retryable);
      const unfixable = analysis.filter((a: any) => !a.retryable);
      
      res.json({
        total: analysis.length,
        fixable: fixable.length,
        unfixable: unfixable.length,
        jobs: {
          fixable,
          unfixable
        },
        summary: {
          okru: fixable.filter((j: any) => j.platform === 'okru').length,
          dailymotion: fixable.filter((j: any) => j.platform === 'dailymotion').length,
          youtube: unfixable.filter((j: any) => j.platform === 'youtube').length,
          vimeo: unfixable.filter((j: any) => j.platform === 'vimeo').length
        }
      });
    } catch (error: any) {
      console.error("Error analyzing failed jobs:", error);
      res.status(500).json({ 
        error: "Failed to analyze jobs",
        details: error.message 
      });
    }
  });

  // Bulk retry fixable downloads
  app.post("/api/admin/jobs/failed/retry-fixable", isAdmin, async (req, res) => {
    try {
      const failedJobs = await jobQueue.getJobs({ status: 'failed' });
      
      const retriedJobs: any[] = [];
      const skippedJobs: any[] = [];
      
      for (const job of failedJobs) {
        // Double-check job status to prevent duplicate retries
        // (status may have changed between query and processing)
        const currentJob = await jobQueue.getJob(job.id);
        if (!currentJob || currentJob.status !== 'failed') {
          skippedJobs.push({
            jobId: job.id,
            sourceUrl: (job.metadata as any)?.sourceUrl || 'N/A',
            reason: 'Job status changed (already retried or completed)'
          });
          continue;
        }
        
        // Skip jobs with malformed metadata
        if (!job.metadata || typeof job.metadata !== 'object') {
          skippedJobs.push({
            jobId: job.id,
            sourceUrl: 'N/A',
            reason: 'Invalid metadata - cannot analyze'
          });
          continue;
        }
        
        const sourceUrl = (job.metadata as any)?.sourceUrl || '';
        
        // Skip jobs without sourceUrl (not video downloads)
        if (!sourceUrl) {
          skippedJobs.push({
            jobId: job.id,
            sourceUrl: 'N/A',
            reason: 'Not a video download job'
          });
          continue;
        }
        
        // Skip jobs that have reached max retries
        if (job.retryCount >= (job.maxRetries || 3)) {
          skippedJobs.push({
            jobId: job.id,
            sourceUrl,
            reason: 'Max retries reached'
          });
          continue;
        }
        
        const retryAnalysis = shouldRetryBasedOnError(job.error, sourceUrl);
        
        if (retryAnalysis.shouldRetry) {
          try {
            const updated = await jobQueue.retryJob(job.id);
            retriedJobs.push({
              jobId: job.id,
              sourceUrl,
              reason: retryAnalysis.reason
            });
          } catch (retryError: any) {
            skippedJobs.push({
              jobId: job.id,
              sourceUrl,
              reason: `Retry failed: ${retryError.message}`
            });
          }
        } else {
          skippedJobs.push({
            jobId: job.id,
            sourceUrl,
            reason: retryAnalysis.reason
          });
        }
      }
      
      console.log(`[API] Bulk retry: ${retriedJobs.length} retried, ${skippedJobs.length} skipped`);
      
      res.json({
        message: `Retried ${retriedJobs.length} fixable downloads`,
        retried: retriedJobs.length,
        skipped: skippedJobs.length,
        details: {
          retriedJobs,
          skippedJobs
        }
      });
    } catch (error: any) {
      console.error("Error bulk retrying jobs:", error);
      res.status(500).json({ 
        error: "Failed to bulk retry jobs",
        details: error.message 
      });
    }
  });

  // Bulk operations for better job management
  app.post("/api/admin/jobs/bulk/delete-completed", isAdmin, async (req, res) => {
    try {
      const result = await jobQueue.deleteCompletedJobs();
      console.log(`[API] Deleted ${result.count} completed jobs`);
      res.json({ 
        message: `Successfully deleted ${result.count} completed jobs`,
        count: result.count 
      });
    } catch (error: any) {
      console.error("Error deleting completed jobs:", error);
      res.status(500).json({ 
        error: "Failed to delete completed jobs",
        details: error.message 
      });
    }
  });

  app.post("/api/admin/jobs/bulk/delete-failed", isAdmin, async (req, res) => {
    try {
      const result = await jobQueue.deleteFailedJobs();
      console.log(`[API] Deleted ${result.count} failed jobs`);
      res.json({ 
        message: `Successfully deleted ${result.count} failed jobs`,
        count: result.count 
      });
    } catch (error: any) {
      console.error("Error deleting failed jobs:", error);
      res.status(500).json({ 
        error: "Failed to delete failed jobs",
        details: error.message 
      });
    }
  });

  app.post("/api/admin/jobs/bulk/delete-cancelled", isAdmin, async (req, res) => {
    try {
      const result = await jobQueue.deleteCancelledJobs();
      console.log(`[API] Deleted ${result.count} cancelled jobs`);
      res.json({ 
        message: `Successfully deleted ${result.count} cancelled jobs`,
        count: result.count 
      });
    } catch (error: any) {
      console.error("Error deleting cancelled jobs:", error);
      res.status(500).json({ 
        error: "Failed to delete cancelled jobs",
        details: error.message 
      });
    }
  });

  app.post("/api/admin/jobs/bulk/delete-all", isAdmin, async (req, res) => {
    try {
      const result = await jobQueue.deleteAllJobs();
      console.log(`[API] Deleted ALL ${result.count} jobs (full reset)`);
      res.json({ 
        message: `Successfully deleted ALL ${result.count} jobs`,
        count: result.count 
      });
    } catch (error: any) {
      console.error("Error deleting all jobs:", error);
      res.status(500).json({ 
        error: "Failed to delete all jobs",
        details: error.message 
      });
    }
  });

  app.post("/api/admin/jobs/bulk/cancel-pending", isAdmin, async (req, res) => {
    try {
      const result = await jobQueue.cancelAllPending();
      console.log(`[API] Cancelled ${result.count} pending jobs`);
      res.json({ 
        message: `Successfully cancelled ${result.count} pending jobs`,
        count: result.count 
      });
    } catch (error: any) {
      console.error("Error cancelling pending jobs:", error);
      res.status(500).json({ 
        error: "Failed to cancel pending jobs",
        details: error.message 
      });
    }
  });

  // Release ALL stuck processing jobs (regardless of which worker locked them)
  app.post("/api/admin/jobs/bulk/release-stuck", isAdmin, async (req, res) => {
    try {
      const result = await jobQueue.releaseAllStuckJobs();
      console.log(`[API] Released ${result.count} stuck processing jobs`);
      res.json({ 
        message: `Successfully released ${result.count} stuck jobs back to pending`,
        count: result.count 
      });
    } catch (error: any) {
      console.error("Error releasing stuck jobs:", error);
      res.status(500).json({ 
        error: "Failed to release stuck jobs",
        details: error.message 
      });
    }
  });

  // Video streaming proxy - streams from R2 through our server to avoid CORS issues
  app.get("/api/stream/:movieId", async (req, res) => {
    try {
      const { movieId } = req.params;
      
      const movie = await storage.getMovieById(movieId);
      if (!movie) {
        return res.status(404).send("Movie not found");
      }

      if (!movie.hostedAssetKey) {
        return res.status(404).send("No hosted video available");
      }

      // Only stream R2 videos
      if (!movie.hostedAssetKey.startsWith('videos/') || !r2StorageService.isConfigured()) {
        return res.status(400).send("Video not available for streaming");
      }

      // Get the file metadata first
      const metadata = await r2StorageService.getObjectMetadata(movie.hostedAssetKey);
      if (!metadata) {
        return res.status(404).send("Video file not found in storage");
      }

      const fileSize = metadata.size;
      const range = req.headers.range;

      if (range) {
        // Handle range request for video seeking
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 10 * 1024 * 1024, fileSize - 1); // 10MB chunks

        const result = await r2StorageService.streamObjectRange(movie.hostedAssetKey, start, end);
        if (!result) {
          return res.status(500).send("Failed to stream video");
        }

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': result.contentLength,
          'Content-Type': 'video/mp4',
          'Cache-Control': 'public, max-age=86400',
        });

        (result.stream as any).pipe(res);
      } else {
        // No range - send full file (usually initial request)
        const result = await r2StorageService.streamObject(movie.hostedAssetKey);
        if (!result) {
          return res.status(500).send("Failed to stream video");
        }

        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400',
        });

        (result.stream as any).pipe(res);
      }
    } catch (error: any) {
      console.error("[VideoStream] Error:", error.message);
      res.status(500).send("Failed to stream video");
    }
  });

  app.get("/api/movies/:id/hosted-video-url", async (req, res) => {
    try {
      const { id: movieId } = req.params;
      
      const movie = await storage.getMovieById(movieId);
      if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
      }

      if (!movie.hostedAssetKey) {
        return res.status(404).json({ error: "No hosted video available for this movie" });
      }

      let videoUrl: string;
      let storageType: string;

      // Check if R2 is configured and try R2 first for videos/ prefixed keys
      if (r2StorageService.isConfigured() && movie.hostedAssetKey.startsWith('videos/')) {
        try {
          // Try R2 first for videos stored there
          const exists = await r2StorageService.objectExists(movie.hostedAssetKey);
          if (exists) {
            // Use streaming proxy URL instead of signed URL to avoid CORS issues
            videoUrl = `/api/stream/${movieId}`;
            storageType = 'r2-proxy';
          } else {
            // Fall back to Replit storage
            videoUrl = await objectStorageService.getPublicVideoURL(movie.hostedAssetKey);
            storageType = 'replit';
          }
        } catch (r2Error) {
          console.log(`[VideoURL] R2 lookup failed for ${movie.hostedAssetKey}, trying Replit storage`);
          videoUrl = await objectStorageService.getPublicVideoURL(movie.hostedAssetKey);
          storageType = 'replit';
        }
      } else {
        // Use Replit storage for non-R2 keys
        videoUrl = await objectStorageService.getPublicVideoURL(movie.hostedAssetKey);
        storageType = 'replit';
      }

      console.log(`[VideoURL] Serving ${movie.title} from ${storageType}: ${movie.hostedAssetKey}`);
      
      res.json({
        url: videoUrl,
        expiresIn: 86400,
        storageType,
      });
    } catch (error: any) {
      console.error("Error getting hosted video URL:", error);
      res.status(500).json({ 
        error: "Failed to get hosted video URL",
        details: error.message 
      });
    }
  });

  // Fix hosting status for movies with hosted files but wrong status
  app.post("/api/movies/:id/fix-hosting-status", isAdmin, async (req, res) => {
    try {
      const { id: movieId } = req.params;
      
      const movie = await storage.getMovieById(movieId);
      if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
      }

      if (!movie.hostedAssetKey) {
        return res.status(400).json({ error: "Movie has no hosted video file" });
      }

      // Verify the file actually exists in object storage
      try {
        const signedUrl = await objectStorageService.getPublicVideoURL(movie.hostedAssetKey);
        if (!signedUrl) {
          return res.status(400).json({ error: "Hosted video file not found in storage" });
        }
      } catch (storageError: any) {
        return res.status(400).json({ 
          error: "Could not verify hosted video file",
          details: storageError.message 
        });
      }

      // Update the transcoding status to completed
      await storage.updateMovie({
        id: movieId,
        transcodingStatus: 'completed',
        transcodingError: null,
        transcodingUpdatedAt: new Date(),
      });

      console.log(`[Fix Hosting] Fixed status for movie ${movieId} (${movie.title})`);
      
      res.json({ 
        success: true, 
        message: "Hosting status fixed to 'completed'",
        movie: {
          id: movieId,
          title: movie.title,
          hostedAssetKey: movie.hostedAssetKey,
          transcodingStatus: 'completed'
        }
      });
    } catch (error: any) {
      console.error("Error fixing hosting status:", error);
      res.status(500).json({ 
        error: "Failed to fix hosting status",
        details: error.message 
      });
    }
  });

  // Test R2 connectivity with detailed diagnostics
  app.get("/api/admin/storage/test-r2", isAdmin, async (req, res) => {
    try {
      console.log(`[R2 Test] Starting R2 connectivity test...`);
      
      // Check env vars (not values, just presence)
      const envCheck = {
        R2_ACCOUNT_ID: !!process.env.R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID: !!process.env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: !!process.env.R2_SECRET_ACCESS_KEY,
        R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || "(using default: rampage-films)"
      };
      console.log(`[R2 Test] Env vars:`, envCheck);
      
      if (!r2StorageService.isConfigured()) {
        return res.status(400).json({ 
          success: false,
          error: "R2 storage not configured",
          envCheck,
          details: "Missing one or more R2 credentials" 
        });
      }
      
      const bucketName = r2StorageService.getBucketName();
      console.log(`[R2 Test] Bucket name: ${bucketName}`);
      
      // Try a simple operation - list objects (HeadObject on a test key)
      console.log(`[R2 Test] Testing object existence check...`);
      try {
        const testExists = await r2StorageService.objectExists("test-connectivity-check");
        console.log(`[R2 Test] Object existence check succeeded: ${testExists}`);
        
        return res.json({
          success: true,
          envCheck,
          bucketName,
          message: "R2 connectivity verified successfully",
          objectCheckResult: testExists ? "test object exists" : "test object does not exist (expected)"
        });
      } catch (r2Error: any) {
        console.error(`[R2 Test] R2 operation failed:`, r2Error);
        return res.status(500).json({
          success: false,
          envCheck,
          bucketName,
          error: "R2 operation failed",
          r2Error: r2Error.message,
          r2Code: r2Error.Code || r2Error.name,
          details: r2Error.$metadata || {}
        });
      }
    } catch (error: any) {
      console.error(`[R2 Test] Unexpected error:`, error);
      return res.status(500).json({ 
        success: false,
        error: "Unexpected error testing R2",
        details: error.message 
      });
    }
  });

  // ==================== PRODUCTION TO DEVELOPMENT SYNC ====================
  
  // Export all movies as JSON (for syncing to another environment)
  app.get("/api/admin/movies/export", isAdmin, async (req, res) => {
    try {
      const allMovies = await storage.getAllMovies();
      console.log(`[Export] Exporting ${allMovies.length} movies`);
      
      res.json({
        exportedAt: new Date().toISOString(),
        count: allMovies.length,
        movies: allMovies
      });
    } catch (error: any) {
      console.error("Error exporting movies:", error);
      res.status(500).json({ error: "Failed to export movies", details: error.message });
    }
  });
  
  // Import movies from JSON (upsert - updates existing, adds new)
  app.post("/api/admin/movies/import", isAdmin, async (req, res) => {
    try {
      const { movies } = req.body;
      
      if (!movies || !Array.isArray(movies)) {
        return res.status(400).json({ error: "Request body must contain 'movies' array" });
      }
      
      console.log(`[Import] Importing ${movies.length} movies...`);
      
      const results = {
        total: movies.length,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [] as { title: string; error: string }[]
      };
      
      for (const movie of movies) {
        try {
          // Check if movie already exists by ID
          const existing = await storage.getMovieById(movie.id);
          
          if (existing) {
            // Update existing movie
            await storage.updateMovie({
              id: movie.id,
              title: movie.title,
              description: movie.description,
              year: movie.year,
              rating: movie.rating,
              genres: movie.genres,
              poster: movie.poster,
              backdrop: movie.backdrop,
              videoUrl: movie.videoUrl,
              mobileMp4Url: movie.mobileMp4Url,
              trailerUrl: movie.trailerUrl,
              duration: movie.duration,
              director: movie.director,
              cast: movie.cast,
              introStart: movie.introStart,
              introEnd: movie.introEnd,
              creditsStart: movie.creditsStart,
              subtitleUrl: movie.subtitleUrl,
              hostedAssetKey: movie.hostedAssetKey,
              transcodingStatus: movie.transcodingStatus,
              transcodingError: movie.transcodingError,
              originalEmbedUrl: movie.originalEmbedUrl,
            });
            results.updated++;
          } else {
            // Create new movie with the same ID
            await storage.createMovieWithId(movie.id, {
              title: movie.title,
              description: movie.description,
              year: movie.year,
              rating: movie.rating,
              genres: movie.genres || [],
              poster: movie.poster,
              backdrop: movie.backdrop,
              videoUrl: movie.videoUrl,
              mobileMp4Url: movie.mobileMp4Url,
              trailerUrl: movie.trailerUrl,
              duration: movie.duration || 0,
              director: movie.director,
              cast: movie.cast || [],
              sourceLanguage: movie.sourceLanguage,
              introStart: movie.introStart,
              introEnd: movie.introEnd,
              creditsStart: movie.creditsStart,
              subtitleUrl: movie.subtitleUrl,
              hostedAssetKey: movie.hostedAssetKey,
              transcodingStatus: movie.transcodingStatus,
              transcodingError: movie.transcodingError,
              originalEmbedUrl: movie.originalEmbedUrl,
            });
            results.created++;
          }
        } catch (movieError: any) {
          console.error(`[Import] Error importing "${movie.title}":`, movieError.message);
          results.errors.push({ title: movie.title, error: movieError.message });
        }
      }
      
      console.log(`[Import] Complete: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`);
      
      res.json({
        success: true,
        results
      });
    } catch (error: any) {
      console.error("Error importing movies:", error);
      res.status(500).json({ error: "Failed to import movies", details: error.message });
    }
  });

  // Load recovered movies - GET version for easy access from phone/browser
  // Uses secret key instead of session auth for mobile access
  app.get("/api/admin/load-recovered-movies", async (req, res) => {
    const secretKey = req.query.key;
    const validKey = process.env.ADMIN_SECRET;
    
    if (!validKey || secretKey !== validKey) {
      return res.status(401).send("<h1>Unauthorized</h1><p>Add ?key=YOUR_ADMIN_SECRET to the URL</p>");
    }
    try {
      const moviesToImport = recoveredMovies;
      
      const existingMovies = await storage.getAllMovies();
      const existingIds = new Set(existingMovies.map(m => m.id));
      
      let created = 0, skipped = 0;
      
      for (const movie of moviesToImport) {
        if (existingIds.has(movie.id)) {
          skipped++;
          continue;
        }
        
        try {
          await storage.createMovieWithId(movie.id, {
            title: movie.title,
            description: movie.description,
            year: movie.year,
            rating: movie.rating,
            genres: (movie.genres || []) as string[],
            poster: movie.poster,
            backdrop: movie.backdrop,
            videoUrl: movie.videoUrl,
            mobileMp4Url: movie.mobileMp4Url,
            trailerUrl: movie.trailerUrl,
            duration: movie.duration || 0,
            director: movie.director,
            cast: (movie.cast || []) as string[],
            sourceLanguage: movie.sourceLanguage,
            introStart: movie.introStart,
            introEnd: movie.introEnd,
            creditsStart: movie.creditsStart,
            subtitleUrl: movie.subtitleUrl,
            hostedAssetKey: movie.hostedAssetKey,
          });
          created++;
        } catch (e) {
          // Skip errors
        }
      }
      
      res.send(`<h1>Movies Loaded!</h1><p>Created: ${created} movies</p><p>Skipped: ${skipped} (already existed)</p><p><a href="/">Go to homepage</a></p>`);
    } catch (error: any) {
      res.send(`<h1>Error</h1><p>${error.message}</p>`);
    }
  });

  // Load recovered movies from bundled export file (for production sync)
  app.post("/api/admin/load-recovered-movies", isAdmin, async (req, res) => {
    try {
      const moviesToImport = recoveredMovies;
      
      console.log(`[Load Recovered] Loading ${moviesToImport.length} movies from export file`);
      
      const existingMovies = await storage.getAllMovies();
      const existingIds = new Set(existingMovies.map(m => m.id));
      
      const results = {
        total: moviesToImport.length,
        created: 0,
        skipped: 0,
        errors: [] as { title: string; error: string }[]
      };
      
      for (const movie of moviesToImport) {
        if (existingIds.has(movie.id)) {
          results.skipped++;
          continue;
        }
        
        try {
          await storage.createMovieWithId(movie.id, {
            title: movie.title,
            description: movie.description,
            year: movie.year,
            rating: movie.rating,
            genres: movie.genres || [],
            poster: movie.poster,
            backdrop: movie.backdrop,
            videoUrl: movie.videoUrl,
            mobileMp4Url: movie.mobileMp4Url,
            trailerUrl: movie.trailerUrl,
            duration: movie.duration || 0,
            director: movie.director,
            cast: movie.cast || [],
            sourceLanguage: movie.sourceLanguage,
            introStart: movie.introStart,
            introEnd: movie.introEnd,
            creditsStart: movie.creditsStart,
            subtitleUrl: movie.subtitleUrl,
            hostedAssetKey: movie.hostedAssetKey,
          });
          results.created++;
        } catch (error: any) {
          results.errors.push({ title: movie.title, error: error.message });
        }
      }
      
      console.log(`[Load Recovered] Complete: ${results.created} created, ${results.skipped} skipped`);
      
      res.json({
        success: true,
        message: `Loaded ${results.created} recovered movies`,
        results
      });
    } catch (error: any) {
      console.error("Error loading recovered movies:", error);
      res.status(500).json({ error: "Failed to load recovered movies", details: error.message });
    }
  });

  // Recover movies from R2 storage - creates placeholder entries for orphaned videos
  app.post("/api/admin/r2/recover-movies", isAdmin, async (req, res) => {
    try {
      if (!r2StorageService.isConfigured()) {
        return res.status(400).json({ 
          error: "R2 storage not configured",
          hint: "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
        });
      }
      
      console.log('[Recovery] Starting movie recovery from R2...');
      
      // Get all videos from R2
      const objects = await r2StorageService.listAllObjects("videos/");
      console.log(`[Recovery] Found ${objects.length} video files in R2`);
      
      // Extract unique movie IDs and find the largest file for each (best quality)
      const movieFiles = new Map<string, { key: string; size: number; lastModified: Date | undefined }>();
      
      for (const obj of objects) {
        const key = obj.key;
        if (!key.startsWith('videos/') || !key.endsWith('.mp4')) continue;
        
        // Extract movie ID (UUID before the timestamp)
        // Format: videos/UUID-TIMESTAMP.mp4
        const filename = key.slice(7, -4); // Remove 'videos/' and '.mp4'
        
        // UUID is 36 characters (8-4-4-4-12 with dashes)
        if (filename.length >= 36) {
          const movieId = filename.substring(0, 36);
          
          // Keep the largest file for each movie (best quality)
          const existing = movieFiles.get(movieId);
          if (!existing || obj.size > existing.size) {
            movieFiles.set(movieId, { key, size: obj.size, lastModified: obj.lastModified });
          }
        }
      }
      
      console.log(`[Recovery] Found ${movieFiles.size} unique movies`);
      
      // Get existing movies to avoid duplicates
      const existingMovies = await storage.getAllMovies();
      const existingIds = new Set(existingMovies.map(m => m.id));
      
      const results = {
        total: movieFiles.size,
        created: 0,
        skipped: 0,
        errors: [] as { id: string; error: string }[]
      };
      
      let counter = 1;
      for (const [movieId, fileInfo] of movieFiles) {
        // Skip if movie already exists
        if (existingIds.has(movieId)) {
          results.skipped++;
          continue;
        }
        
        try {
          // Create placeholder movie entry
          const sizeMB = (fileInfo.size / (1024 * 1024)).toFixed(0);
          const dateStr = fileInfo.lastModified ? new Date(fileInfo.lastModified).toLocaleDateString() : 'Unknown';
          
          await storage.createMovieWithId(movieId, {
            title: `Recovered Movie #${counter}`,
            description: `This movie was recovered from R2 storage. Video file: ${sizeMB}MB, uploaded: ${dateStr}. Please update the title and description using TMDB search.`,
            year: new Date().getFullYear().toString(),
            rating: "NR",
            genres: ["Uncategorized"],
            poster: "/api/assets/vintage-thriller.png",
            backdrop: "/api/assets/stormy-backdrop.png",
            duration: 90,
            director: "Unknown",
            cast: ["Unknown"],
            hostedAssetKey: fileInfo.key,
          });
          
          results.created++;
          counter++;
          console.log(`[Recovery] Created movie #${counter - 1}: ${movieId}`);
        } catch (error: any) {
          results.errors.push({ id: movieId, error: error.message });
          console.error(`[Recovery] Error creating ${movieId}:`, error.message);
        }
      }
      
      console.log(`[Recovery] Complete: ${results.created} created, ${results.skipped} skipped, ${results.errors.length} errors`);
      
      res.json({
        success: true,
        message: `Recovered ${results.created} movies from R2 storage`,
        results
      });
    } catch (error: any) {
      console.error("Error recovering movies:", error);
      res.status(500).json({ error: "Failed to recover movies", details: error.message });
    }
  });

  // Bulk update recovered movies with TMDB data by providing titles
  app.post("/api/admin/bulk-tmdb-update", isAdmin, async (req, res) => {
    try {
      const { titles } = req.body;
      
      if (!titles || !Array.isArray(titles) || titles.length === 0) {
        return res.status(400).json({ 
          error: "Request body must contain 'titles' array of movie titles" 
        });
      }
      
      const TMDB_API_KEY = process.env.TMDB_API_KEY;
      if (!TMDB_API_KEY) {
        return res.status(400).json({ error: "TMDB API key not configured" });
      }
      
      // Get all recovered movies (those with placeholder titles)
      const recoveredMovies = await storage.getAllMovies();
      const placeholderMovies = recoveredMovies.filter(m => m.title.startsWith('Recovered Movie #'));
      
      console.log(`[Bulk Update] ${titles.length} titles to process, ${placeholderMovies.length} placeholder movies available`);
      
      const results = {
        total: titles.length,
        updated: 0,
        notFound: [] as string[],
        noSlots: 0,
        errors: [] as { title: string; error: string }[]
      };
      
      let slotIndex = 0;
      
      for (const title of titles) {
        if (slotIndex >= placeholderMovies.length) {
          results.noSlots++;
          continue;
        }
        
        try {
          // Search TMDB for this title
          const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
          const searchRes = await fetch(searchUrl);
          const searchData = await searchRes.json();
          
          if (!searchData.results || searchData.results.length === 0) {
            results.notFound.push(title);
            continue;
          }
          
          const tmdbMovie = searchData.results[0];
          
          // Get detailed info including credits
          const detailsUrl = `https://api.themoviedb.org/3/movie/${tmdbMovie.id}?api_key=${TMDB_API_KEY}&append_to_response=credits`;
          const detailsRes = await fetch(detailsUrl);
          const details = await detailsRes.json();
          
          // Extract director and cast
          const director = details.credits?.crew?.find((c: any) => c.job === 'Director')?.name || 'Unknown';
          const cast = details.credits?.cast?.slice(0, 10).map((c: any) => c.name) || ['Unknown'];
          const genres = details.genres?.map((g: any) => g.name) || ['Uncategorized'];
          
          // Update the placeholder movie
          const movieToUpdate = placeholderMovies[slotIndex];
          await storage.updateMovie({
            id: movieToUpdate.id,
            title: details.title || title,
            description: details.overview || 'No description available',
            year: details.release_date?.substring(0, 4) || new Date().getFullYear().toString(),
            rating: details.adult ? 'R' : 'PG-13',
            genres: genres,
            poster: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : movieToUpdate.poster,
            backdrop: details.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` : movieToUpdate.backdrop,
            duration: details.runtime || 90,
            director: director,
            cast: cast,
          });
          
          results.updated++;
          slotIndex++;
          console.log(`[Bulk Update] Updated: ${details.title}`);
          
        } catch (error: any) {
          results.errors.push({ title, error: error.message });
        }
      }
      
      res.json({
        success: true,
        message: `Updated ${results.updated} movies with TMDB data`,
        results
      });
      
    } catch (error: any) {
      console.error("Error in bulk TMDB update:", error);
      res.status(500).json({ error: "Failed to bulk update", details: error.message });
    }
  });

  // List all files in R2 storage (for recovery)
  app.get("/api/admin/r2/list", isAdmin, async (req, res) => {
    try {
      if (!r2StorageService.isConfigured()) {
        return res.status(400).json({ 
          error: "R2 storage not configured",
          hint: "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
        });
      }
      
      const prefix = req.query.prefix as string | undefined;
      const objects = await r2StorageService.listAllObjects(prefix || "videos/");
      
      // Calculate total size
      const totalSizeBytes = objects.reduce((sum, obj) => sum + obj.size, 0);
      const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
      const totalSizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
      
      res.json({
        success: true,
        bucket: r2StorageService.getBucketName(),
        prefix: prefix || "videos/",
        count: objects.length,
        totalSize: `${totalSizeGB} GB (${totalSizeMB} MB)`,
        objects: objects.map(obj => ({
          key: obj.key,
          sizeMB: (obj.size / (1024 * 1024)).toFixed(2),
          lastModified: obj.lastModified
        }))
      });
    } catch (error: any) {
      console.error("Error listing R2 objects:", error);
      res.status(500).json({ error: "Failed to list R2 objects", details: error.message });
    }
  });

  // Storage migration: Check status of all hosted videos (Replit vs R2)
  app.get("/api/admin/storage/status", isAdmin, async (req, res) => {
    try {
      if (!r2StorageService.isConfigured()) {
        return res.status(400).json({ 
          error: "R2 storage not configured",
          details: "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY" 
        });
      }

      const allMovies = await storage.getAllMovies();
      const hostedMovies = allMovies.filter(m => m.hostedAssetKey);
      
      const statusResults = await Promise.all(
        hostedMovies.map(async (movie) => {
          try {
            const existsInR2 = await r2StorageService.objectExists(movie.hostedAssetKey!);
            let existsInReplit = false;
            
            if (!existsInR2) {
              try {
                await objectStorageService.getVideoFile(movie.hostedAssetKey!);
                existsInReplit = true;
              } catch {
                existsInReplit = false;
              }
            }
            
            return {
              id: movie.id,
              title: movie.title,
              hostedAssetKey: movie.hostedAssetKey,
              storageLocation: existsInR2 ? 'r2' : existsInReplit ? 'replit' : 'missing',
              needsMigration: existsInReplit && !existsInR2
            };
          } catch (error: any) {
            return {
              id: movie.id,
              title: movie.title,
              hostedAssetKey: movie.hostedAssetKey,
              storageLocation: 'error',
              error: error.message,
              needsMigration: false
            };
          }
        })
      );

      const summary = {
        total: hostedMovies.length,
        onR2: statusResults.filter(r => r.storageLocation === 'r2').length,
        onReplit: statusResults.filter(r => r.storageLocation === 'replit').length,
        missing: statusResults.filter(r => r.storageLocation === 'missing').length,
        errors: statusResults.filter(r => r.storageLocation === 'error').length,
        needsMigration: statusResults.filter(r => r.needsMigration).length
      };

      res.json({ summary, movies: statusResults });
    } catch (error: any) {
      console.error("Error checking storage status:", error);
      res.status(500).json({ error: "Failed to check storage status", details: error.message });
    }
  });

  // Migrate a single movie from Replit storage to R2
  app.post("/api/admin/storage/migrate/:id", isAdmin, async (req, res) => {
    try {
      console.log(`[Migration] Step 1: Checking R2 configuration...`);
      if (!r2StorageService.isConfigured()) {
        return res.status(400).json({ 
          error: "R2 storage not configured",
          details: "Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY"
        });
      }
      console.log(`[Migration] R2 is configured with bucket: ${r2StorageService.getBucketName()}`);

      const { id: movieId } = req.params;
      console.log(`[Migration] Step 2: Fetching movie ${movieId}...`);
      const movie = await storage.getMovieById(movieId);
      
      if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
      }
      console.log(`[Migration] Found movie: ${movie.title}`);
      
      if (!movie.hostedAssetKey) {
        return res.status(400).json({ error: "Movie has no hosted video" });
      }
      console.log(`[Migration] Hosted asset key: ${movie.hostedAssetKey}`);

      // Check if already on R2
      console.log(`[Migration] Step 3: Checking if already on R2...`);
      const existsInR2 = await r2StorageService.objectExists(movie.hostedAssetKey);
      if (existsInR2) {
        return res.json({ 
          success: true, 
          message: "Video already on R2",
          migrated: false 
        });
      }
      console.log(`[Migration] Not on R2, proceeding with migration...`);

      // Get from Replit storage
      console.log(`[Migration] Step 4: Fetching from Replit Object Storage...`);
      console.log(`[Migration] PRIVATE_OBJECT_DIR: ${process.env.PRIVATE_OBJECT_DIR}`);
      
      let file;
      try {
        file = await objectStorageService.getVideoFile(movie.hostedAssetKey);
        console.log(`[Migration] Got file reference: ${file.name}`);
      } catch (fileError: any) {
        console.error(`[Migration] Failed to get file from Replit storage:`, fileError);
        return res.status(404).json({
          error: "Video file not found",
          details: "The video file doesn't exist in Replit storage. It may have been deleted.",
          errorType: "file_not_found"
        });
      }
      
      // Get file metadata to know the size
      let fileSize: number | undefined;
      try {
        const [metadata] = await file.getMetadata();
        fileSize = metadata.size ? Number(metadata.size) : undefined;
        console.log(`[Migration] File size: ${fileSize ? (fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'unknown'}`);
      } catch (metaError) {
        console.log(`[Migration] Could not get file metadata, continuing anyway...`);
      }
      
      // Stream directly to R2 using multipart upload with retry logic
      console.log(`[Migration] Step 5: Starting streaming upload to R2...`);
      const keyWithoutPrefix = movie.hostedAssetKey.replace(/^videos\//, '').replace(/\.mp4$/, '');
      
      const MAX_RETRIES = 3;
      let lastError: any;
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[Migration] Upload attempt ${attempt}/${MAX_RETRIES}...`);
          const readStream = file.createReadStream();
          await r2StorageService.uploadVideoMultipart(readStream, keyWithoutPrefix, fileSize);
          console.log(`[Migration] Successfully migrated ${movie.title} to R2`);
          
          return res.json({ 
            success: true, 
            message: `Migrated "${movie.title}" to Cloudflare R2`,
            migrated: true,
            size: fileSize ? `${(fileSize / 1024 / 1024).toFixed(2)} MB` : 'unknown',
            attempts: attempt
          });
        } catch (uploadError: any) {
          lastError = uploadError;
          console.error(`[Migration] Attempt ${attempt} failed:`, uploadError.message);
          
          if (attempt < MAX_RETRIES) {
            const waitTime = attempt * 2000; // Wait longer between retries
            console.log(`[Migration] Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      
      // All retries failed
      throw lastError;
    } catch (error: any) {
      console.error("[Migration] Error:", error);
      console.error("[Migration] Stack:", error.stack);
      
      // Provide specific error messages
      let errorType = "unknown";
      let userMessage = error.message;
      
      if (error.message?.includes("not found") || error.message?.includes("NoSuchKey")) {
        errorType = "file_not_found";
        userMessage = "Video file not found in Replit storage - it may have been deleted";
      } else if (error.message?.includes("timeout") || error.message?.includes("ETIMEDOUT")) {
        errorType = "timeout";
        userMessage = "Upload timed out - the file may be too large. Try again.";
      } else if (error.message?.includes("network") || error.message?.includes("ECONNRESET")) {
        errorType = "network";
        userMessage = "Network error during upload - please try again";
      } else if (error.message?.includes("AccessDenied")) {
        errorType = "permission";
        userMessage = "R2 access denied - check your R2 credentials";
      }
      
      res.status(500).json({ 
        error: "Failed to migrate video", 
        errorType,
        details: userMessage,
        technicalDetails: error.message
      });
    }
  });

  // Migrate all videos from Replit storage to R2
  app.post("/api/admin/storage/migrate-all", isAdmin, async (req, res) => {
    try {
      if (!r2StorageService.isConfigured()) {
        return res.status(400).json({ error: "R2 storage not configured" });
      }

      const allMovies = await storage.getAllMovies();
      const hostedMovies = allMovies.filter(m => m.hostedAssetKey);
      
      const results: Array<{ id: string; title: string; status: string; error?: string }> = [];
      
      for (const movie of hostedMovies) {
        try {
          // Check if already on R2
          const existsInR2 = await r2StorageService.objectExists(movie.hostedAssetKey!);
          if (existsInR2) {
            results.push({ id: movie.id, title: movie.title, status: 'already_on_r2' });
            continue;
          }
          
          // Check if exists in Replit
          let file;
          try {
            file = await objectStorageService.getVideoFile(movie.hostedAssetKey!);
          } catch {
            results.push({ id: movie.id, title: movie.title, status: 'not_found_in_replit' });
            continue;
          }
          
          // Stream upload to R2 (avoids memory issues with large files)
          console.log(`[Migration] Migrating ${movie.title}...`);
          const [metadata] = await file.getMetadata();
          const fileSize = metadata.size ? Number(metadata.size) : undefined;
          const keyWithoutPrefix = movie.hostedAssetKey!.replace(/^videos\//, '').replace(/\.mp4$/, '');
          const readStream = file.createReadStream();
          await r2StorageService.uploadVideoMultipart(readStream, keyWithoutPrefix, fileSize);
          
          results.push({ 
            id: movie.id, 
            title: movie.title, 
            status: 'migrated',
          });
          console.log(`[Migration] Migrated ${movie.title} (${fileSize ? (fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'unknown'})`);
        } catch (error: any) {
          results.push({ 
            id: movie.id, 
            title: movie.title, 
            status: 'error',
            error: error.message 
          });
        }
      }
      
      const summary = {
        total: hostedMovies.length,
        migrated: results.filter(r => r.status === 'migrated').length,
        alreadyOnR2: results.filter(r => r.status === 'already_on_r2').length,
        notFound: results.filter(r => r.status === 'not_found_in_replit').length,
        errors: results.filter(r => r.status === 'error').length
      };
      
      console.log(`[Migration] Complete: ${summary.migrated} migrated, ${summary.alreadyOnR2} already on R2, ${summary.errors} errors`);
      
      res.json({ summary, results });
    } catch (error: any) {
      console.error("Error in bulk migration:", error);
      res.status(500).json({ error: "Failed to migrate videos", details: error.message });
    }
  });

  // Sync a movie to production (development only)
  app.post("/api/admin/sync-to-production/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const productionUrl = process.env.PRODUCTION_URL;
      const adminSecret = process.env.ADMIN_SECRET;
      
      if (!productionUrl) {
        return res.status(400).json({ 
          error: "Production URL not configured",
          details: "Set PRODUCTION_URL environment variable (e.g., https://rampagefilms.net)"
        });
      }
      
      if (!adminSecret) {
        return res.status(400).json({ 
          error: "Admin secret not configured",
          details: "Set ADMIN_SECRET environment variable"
        });
      }
      
      // Get the movie from development database
      const movie = await storage.getMovieById(id);
      if (!movie) {
        return res.status(404).json({ error: "Movie not found in development" });
      }
      
      if (!movie.hostedAssetKey) {
        return res.status(400).json({ 
          error: "Movie has no hosted video",
          details: "Download the video first before syncing to production"
        });
      }
      
      console.log(`[ProductionSync] Syncing movie "${movie.title}" to production...`);
      
      // Prepare movie data for production (without id, let production generate its own)
      const movieData = {
        title: movie.title,
        year: movie.year,
        rating: movie.rating,
        duration: movie.duration,
        genre: movie.genre,
        genres: movie.genres || [], // Required array field
        description: movie.description,
        poster: movie.poster,
        backdrop: movie.backdrop,
        trailerUrl: movie.trailerUrl,
        videoUrl: movie.videoUrl,
        hostedAssetKey: movie.hostedAssetKey,
        transcodingStatus: "completed",
        storageLocation: movie.storageLocation,
        cast: movie.cast,
        director: movie.director,
        language: movie.language,
        tmdbId: movie.tmdbId,
      };
      
      // Try to find existing movie in production by TMDB ID or title+year
      let productionMovieId = null;
      
      // First, try to search for the movie in production
      try {
        const searchResponse = await fetch(`${productionUrl}/api/movies`, {
          headers: { 'x-admin-secret': adminSecret }
        });
        
        if (searchResponse.ok) {
          const allMovies = await searchResponse.json();
          const existingMovie = allMovies.find((m: any) => 
            (movie.tmdbId && m.tmdbId === movie.tmdbId) ||
            (m.title === movie.title && m.year === movie.year)
          );
          if (existingMovie) {
            productionMovieId = existingMovie.id;
            console.log(`[ProductionSync] Found existing movie in production: ${productionMovieId}`);
          }
        }
      } catch (searchError) {
        console.log(`[ProductionSync] Could not search production movies, will try to create new`);
      }
      
      let response;
      if (productionMovieId) {
        // Update existing movie
        response = await fetch(`${productionUrl}/api/movies/${productionMovieId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': adminSecret
          },
          body: JSON.stringify({
            hostedAssetKey: movie.hostedAssetKey,
            transcodingStatus: "completed",
            storageLocation: movie.storageLocation
          })
        });
      } else {
        // Create new movie
        response = await fetch(`${productionUrl}/api/movies`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': adminSecret
          },
          body: JSON.stringify(movieData)
        });
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ProductionSync] Failed:`, errorText);
        return res.status(response.status).json({ 
          error: "Failed to sync to production",
          details: errorText
        });
      }
      
      const result = await response.json();
      const finalProductionMovieId = result.id || productionMovieId;
      console.log(`[ProductionSync] Success! Movie synced to production:`, finalProductionMovieId);
      
      // Also sync any dubbed audio tracks
      let dubbedTracksCount = 0;
      try {
        const dubbedTracks = await storage.getDubbedTracksByMovie(id);
        const completedTracks = dubbedTracks.filter(t => t.status === 'completed' && t.audioKey);
        
        if (completedTracks.length > 0) {
          console.log(`[ProductionSync] Syncing ${completedTracks.length} dubbed audio tracks...`);
          
          for (const track of completedTracks) {
            try {
              // Create or update dubbed track in production
              const trackData = {
                movieId: finalProductionMovieId,
                languageCode: track.languageCode,
                languageName: track.languageName,
                audioKey: track.audioKey, // R2 key (storage is shared)
                voiceModel: track.voiceModel,
                duration: track.duration,
                status: 'completed'
              };
              
              const trackResponse = await fetch(`${productionUrl}/api/admin/dubbed-tracks/sync`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-admin-secret': adminSecret
                },
                body: JSON.stringify(trackData)
              });
              
              if (trackResponse.ok) {
                dubbedTracksCount++;
                console.log(`[ProductionSync] Synced dubbed track: ${track.languageName}`);
              } else {
                console.warn(`[ProductionSync] Failed to sync dubbed track ${track.languageName}:`, await trackResponse.text());
              }
            } catch (trackError: any) {
              console.warn(`[ProductionSync] Error syncing dubbed track ${track.languageName}:`, trackError.message);
            }
          }
        }
      } catch (dubError: any) {
        console.warn("[ProductionSync] Could not sync dubbed tracks:", dubError.message);
      }
      
      res.json({ 
        success: true, 
        message: productionMovieId ? "Movie updated in production" : "Movie created in production",
        productionMovieId: finalProductionMovieId,
        dubbedTracksSynced: dubbedTracksCount
      });
    } catch (error: any) {
      console.error("[ProductionSync] Error:", error);
      res.status(500).json({ 
        error: "Failed to sync to production",
        details: error.message
      });
    }
  });

  // Download and migrate ALL missing videos to R2
  app.post("/api/admin/storage/download-and-migrate-all", isAdmin, async (req, res) => {
    try {
      console.log(`[BulkDownload] Starting bulk download and migrate operation...`);
      
      if (!r2StorageService.isConfigured()) {
        return res.status(400).json({ error: "R2 storage not configured" });
      }

      const allMovies = await storage.getAllMovies();
      const hostedMovies = allMovies.filter(m => m.hostedAssetKey);
      console.log(`[BulkDownload] Found ${hostedMovies.length} movies with hosted asset keys`);
      
      const results: Array<{ id: string; title: string; status: string; jobId?: string; error?: string }> = [];
      let jobsCreated = 0;
      
      // Process in parallel batches for speed (5 at a time)
      const BATCH_SIZE = 5;
      for (let i = 0; i < hostedMovies.length; i += BATCH_SIZE) {
        const batch = hostedMovies.slice(i, i + BATCH_SIZE);
        console.log(`[BulkDownload] Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(hostedMovies.length/BATCH_SIZE)}`);
        
        const batchResults = await Promise.all(batch.map(async (movie) => {
          try {
            // Check if already on R2 (with timeout)
            const existsInR2 = await Promise.race([
              r2StorageService.objectExists(movie.hostedAssetKey!),
              new Promise<boolean>((_, reject) => 
                setTimeout(() => reject(new Error('R2 check timeout')), 10000)
              )
            ]).catch(() => false);
            
            if (existsInR2) {
              return { id: movie.id, title: movie.title, status: 'already_on_r2' };
            }
            
            // Skip inline migration - just queue download jobs for missing files
            // This keeps the endpoint fast and avoids timeouts
            
            // File is missing - need to download from source
            if (!movie.videoUrl) {
              return { id: movie.id, title: movie.title, status: 'no_source_url', error: 'No video URL to download from' };
            }
            
            // Check if there's already a pending/in-progress job for this movie
            const existingJobs = await jobQueue.getJobs({ 
              movieId: movie.id,
              status: ['pending', 'in_progress']
            });
            const activeJob = existingJobs.find((j: any) => j.type === 'video-download');
            
            if (activeJob) {
              return { id: movie.id, title: movie.title, status: 'already_queued', jobId: activeJob.id };
            }
            
            // Create download job
            const job = await jobQueue.createJob(
              'video-download',
              movie.id,
              {
                videoUrl: movie.videoUrl,
                movieTitle: movie.title,
              }
            );
            
            console.log(`[BulkDownload] Created job ${job.id} for "${movie.title}"`);
            return { id: movie.id, title: movie.title, status: 'download_queued', jobId: job.id };
            
          } catch (error: any) {
            console.error(`[BulkDownload] Error processing ${movie.title}:`, error.message);
            return { 
              id: movie.id, 
              title: movie.title, 
              status: 'error',
              error: error.message 
            };
          }
        }));
        
        results.push(...batchResults);
        jobsCreated += batchResults.filter(r => r.status === 'download_queued').length;
      }
      
      const summary = {
        total: hostedMovies.length,
        alreadyOnR2: results.filter(r => r.status === 'already_on_r2').length,
        migrated: results.filter(r => r.status === 'migrated').length,
        downloadQueued: results.filter(r => r.status === 'download_queued').length,
        alreadyQueued: results.filter(r => r.status === 'already_queued').length,
        noSourceUrl: results.filter(r => r.status === 'no_source_url').length,
        errors: results.filter(r => r.status === 'error').length,
        jobsCreated
      };
      
      console.log(`[BulkDownload] Complete: ${summary.alreadyOnR2} on R2, ${summary.migrated} migrated, ${summary.downloadQueued} downloads queued, ${summary.errors} errors`);
      
      res.json({ summary, results });
    } catch (error: any) {
      console.error("[BulkDownload] Error:", error);
      res.status(500).json({ error: "Failed to process bulk download", details: error.message });
    }
  });

  // Download ALL movies with video URLs to R2 (not just already-hosted ones)
  app.post("/api/admin/storage/download-all-to-r2", isAdmin, async (req, res) => {
    try {
      console.log(`[DownloadAllToR2] Starting bulk download of ALL movies with video URLs...`);
      
      if (!r2StorageService.isConfigured()) {
        return res.status(400).json({ error: "R2 storage not configured" });
      }

      const allMovies = await storage.getAllMovies();
      // Get movies that have a video URL (source to download from)
      const moviesWithUrls = allMovies.filter(m => m.videoUrl && m.videoUrl.trim() !== '');
      console.log(`[DownloadAllToR2] Found ${moviesWithUrls.length} movies with video URLs`);
      
      const results: Array<{ id: string; title: string; status: string; jobId?: string; error?: string; reason?: string }> = [];
      let jobsCreated = 0;
      
      for (const movie of moviesWithUrls) {
        try {
          // Check if already on R2
          if (movie.hostedAssetKey) {
            const existsInR2 = await r2StorageService.objectExists(movie.hostedAssetKey).catch(() => false);
            if (existsInR2) {
              results.push({ id: movie.id, title: movie.title, status: 'already_on_r2' });
              continue;
            }
          }
          
          // Check if there's already a pending/processing job for this movie
          const existingJobs = await jobQueue.getJobs({ 
            movieId: movie.id, 
            type: 'video-download',
            status: ['pending', 'processing']
          });
          const activeJob = existingJobs.length > 0 ? existingJobs[0] : null;
          
          if (activeJob) {
            results.push({ 
              id: movie.id, 
              title: movie.title, 
              status: 'already_queued',
              jobId: activeJob.id 
            });
            continue;
          }
          
          // Create download job
          const job = await jobQueue.createJob(
            'video-download',
            movie.id,
            {
              sourceUrl: movie.videoUrl,
              autoMigrateToR2: true,
              priority: 'normal'
            }
          );
          
          jobsCreated++;
          results.push({ 
            id: movie.id, 
            title: movie.title, 
            status: 'download_queued',
            jobId: job.id 
          });
          
        } catch (error: any) {
          console.error(`[DownloadAllToR2] Error processing ${movie.title}:`, error.message);
          results.push({ 
            id: movie.id, 
            title: movie.title, 
            status: 'error',
            error: error.message 
          });
        }
      }
      
      const summary = {
        total: moviesWithUrls.length,
        alreadyOnR2: results.filter(r => r.status === 'already_on_r2').length,
        downloadQueued: results.filter(r => r.status === 'download_queued').length,
        alreadyQueued: results.filter(r => r.status === 'already_queued').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        errors: results.filter(r => r.status === 'error').length,
        jobsCreated
      };
      
      console.log(`[DownloadAllToR2] Complete: ${summary.alreadyOnR2} already on R2, ${summary.downloadQueued} downloads queued, ${summary.skipped} skipped (YouTube/Vimeo), ${summary.errors} errors`);
      
      res.json({ summary, results });
    } catch (error: any) {
      console.error("[DownloadAllToR2] Error:", error);
      res.status(500).json({ error: "Failed to queue downloads", details: error.message });
    }
  });

  // Reset all hosting status - clean up false "hosted" entries
  app.post("/api/admin/storage/reset-hosting-status", isAdmin, async (req, res) => {
    try {
      const allMovies = await storage.getAllMovies();
      let resetCount = 0;
      const results: any[] = [];
      
      for (const movie of allMovies) {
        // Only reset if movie has a hostedAssetKey
        if (movie.hostedAssetKey) {
          await storage.updateMovie({
            id: movie.id,
            hostedAssetKey: null,
            transcodingStatus: null,
            transcodingError: null,
            transcodingUpdatedAt: null
          });
          resetCount++;
          results.push({ id: movie.id, title: movie.title, status: 'reset' });
        }
      }
      
      // Also cancel any pending/processing jobs
      const activeJobs = await jobQueue.getJobs({ 
        type: 'video-download',
        status: ['pending', 'processing']
      });
      
      for (const job of activeJobs) {
        await jobQueue.cancelJob(job.id);
      }
      
      console.log(`[ResetHostingStatus] Reset ${resetCount} movies, cancelled ${activeJobs.length} pending jobs`);
      
      res.json({ 
        success: true, 
        resetCount,
        cancelledJobs: activeJobs.length,
        results 
      });
    } catch (error: any) {
      console.error("[ResetHostingStatus] Error:", error);
      res.status(500).json({ error: "Failed to reset hosting status", details: error.message });
    }
  });

  // Download video and automatically migrate to R2 in one step
  app.post("/api/admin/storage/download-and-migrate/:id", isAdmin, async (req, res) => {
    try {
      if (!r2StorageService.isConfigured()) {
        return res.status(400).json({ error: "R2 storage not configured" });
      }

      const { id: movieId } = req.params;
      const movie = await storage.getMovieById(movieId);
      
      if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
      }

      if (!movie.videoUrl) {
        return res.status(400).json({ error: "Movie has no video URL to download" });
      }

      // Check if already on R2
      if (movie.hostedAssetKey) {
        const existsInR2 = await r2StorageService.objectExists(movie.hostedAssetKey);
        if (existsInR2) {
          return res.json({ 
            success: true, 
            message: "Video already on R2",
            status: "already_on_r2"
          });
        }
      }

      // Create a download job - R2 upload happens automatically if R2 is configured
      const job = await jobQueue.createJob(
        'video-download',
        movie.id,
        {
          videoUrl: movie.videoUrl,
          movieTitle: movie.title,
        }
      );

      console.log(`[Download+Migrate] Created job ${job.id} for "${movie.title}" with auto-migrate to R2`);

      res.json({ 
        success: true, 
        message: `Download started for "${movie.title}" - will auto-migrate to R2 when complete`,
        jobId: job.id,
        status: "downloading"
      });
    } catch (error: any) {
      console.error("[Download+Migrate] Error:", error);
      res.status(500).json({ error: "Failed to start download", details: error.message });
    }
  });

  app.post("/api/instagram/fetch-reels", isAdmin, async (req, res) => {
    try {
      const { accessToken } = req.body;
      if (!accessToken || typeof accessToken !== 'string') {
        return res.status(400).json({ error: "Instagram access token is required" });
      }

      const reels = await fetchInstagramReels(accessToken);
      
      console.log(`[Instagram] Fetched ${reels.length} reels`);
      
      res.json({ reels, count: reels.length });
    } catch (error: any) {
      console.error("Error fetching Instagram reels:", error);
      res.status(500).json({ 
        error: "Failed to fetch Instagram reels",
        details: error.message 
      });
    }
  });

  app.post("/api/instagram/extract-titles", isAdmin, async (req, res) => {
    try {
      const { captions } = req.body;
      if (!Array.isArray(captions)) {
        return res.status(400).json({ error: "Captions array is required" });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a movie title extraction expert. Given Instagram reel captions about movies, extract the movie titles.
Many captions will contain movie titles along with emojis, hashtags, and other text.
Extract ONLY the actual movie title, not hashtags or descriptions.
If a caption doesn't contain a clear movie title, return null for that caption.`
          },
          {
            role: "user",
            content: `Extract movie titles from these Instagram reel captions. Return ONLY valid JSON (no markdown, no code blocks):

${captions.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n\n')}

Return JSON array with this exact structure:
{
  "titles": [
    { "index": 0, "title": "Movie Title" },
    { "index": 1, "title": null },
    ...
  ]
}

For each caption, return the movie title if found, or null if no clear movie title exists.`
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const aiResponse = completion.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error("No response from AI");
      }

      let extractedTitles;
      try {
        extractedTitles = JSON.parse(aiResponse);
      } catch (parseError) {
        console.error("Failed to parse AI response:", aiResponse);
        throw new Error("Invalid JSON response from AI");
      }

      console.log(`[Instagram] Extracted ${extractedTitles.titles?.length || 0} titles from captions`);
      
      res.json(extractedTitles);
    } catch (error: any) {
      console.error("Error extracting titles:", error);
      res.status(500).json({ 
        error: "Failed to extract movie titles",
        details: error.message 
      });
    }
  });

  app.get("/api/youtube/playlists", isAdmin, async (req, res) => {
    try {
      const playlists = await fetchUserPlaylists();
      
      console.log(`[YouTube] Fetched ${playlists.length} playlists`);
      
      res.json({ playlists, count: playlists.length });
    } catch (error: any) {
      console.error("Error fetching YouTube playlists:", error);
      res.status(500).json({ 
        error: "Failed to fetch YouTube playlists",
        details: error.message 
      });
    }
  });

  app.post("/api/youtube/search", isAdmin, async (req, res) => {
    try {
      const { query, maxResults } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: "Search query is required" });
      }

      const videos = await searchYouTubeVideos(query, maxResults || 20);
      
      console.log(`[YouTube Search] Found ${videos.length} videos for query: "${query}"`);
      
      res.json({ videos, count: videos.length });
    } catch (error: any) {
      console.error("Error searching YouTube videos:", error);
      res.status(500).json({ 
        error: "Failed to search YouTube videos",
        details: error.message 
      });
    }
  });

  app.post("/api/youtube/fetch-videos", isAdmin, async (req, res) => {
    try {
      const { playlistId } = req.body;
      if (!playlistId || typeof playlistId !== 'string') {
        return res.status(400).json({ error: "Playlist ID is required" });
      }

      const videos = await fetchPlaylistVideos(playlistId);
      
      console.log(`[YouTube] Fetched ${videos.length} videos from playlist ${playlistId}`);
      
      res.json({ videos, count: videos.length });
    } catch (error: any) {
      console.error("Error fetching YouTube videos:", error);
      res.status(500).json({ 
        error: "Failed to fetch YouTube videos",
        details: error.message 
      });
    }
  });

  app.post("/api/youtube/extract-titles", isAdmin, async (req, res) => {
    try {
      const { videos } = req.body;
      if (!Array.isArray(videos)) {
        return res.status(400).json({ error: "Videos array is required" });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const videoDescriptions = videos.map((v: YouTubeVideo) => 
        `Title: ${v.title}\nDescription: ${v.description}`
      );

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a movie title extraction expert. Given YouTube video titles and descriptions about movies, extract the actual movie titles.
Many videos will have titles like "Movie Title (Year) | Trailer" or "Full Movie: Movie Title".
Extract ONLY the actual movie title, removing years, "trailer", "full movie", and other metadata.
If a video doesn't appear to be about a movie, return null for that video.`
          },
          {
            role: "user",
            content: `Extract movie titles from these YouTube videos. Return ONLY valid JSON (no markdown, no code blocks):

${videoDescriptions.map((desc: string, i: number) => `${i + 1}. ${desc}`).join('\n\n')}

Return JSON array with this exact structure:
{
  "titles": [
    { "index": 0, "title": "Movie Title" },
    { "index": 1, "title": null },
    ...
  ]
}

For each video, return the movie title if found, or null if it's not clearly about a movie.`
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const aiResponse = completion.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error("No response from AI");
      }

      let extractedTitles;
      try {
        extractedTitles = JSON.parse(aiResponse);
      } catch (parseError) {
        console.error("Failed to parse AI response:", aiResponse);
        throw new Error("Invalid JSON response from AI");
      }

      console.log(`[YouTube] Extracted ${extractedTitles.titles?.length || 0} titles from videos`);
      
      res.json(extractedTitles);
    } catch (error: any) {
      console.error("Error extracting titles:", error);
      res.status(500).json({ 
        error: "Failed to extract movie titles",
        details: error.message 
      });
    }
  });

  app.post("/api/generate-movie-info", isAdmin, async (req, res) => {
    try {
      const { videoUrl } = req.body;
      if (!videoUrl || typeof videoUrl !== 'string') {
        return res.status(400).json({ error: "Video URL is required" });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const extractVideoId = (url: string): string | null => {
        const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\s]+)/;
        const vimeoRegex = /vimeo\.com\/(\d+)/;
        const okRegex = /ok\.ru\/video\/(\d+)/;
        
        const youtubeMatch = url.match(youtubeRegex);
        if (youtubeMatch) return `YouTube: ${youtubeMatch[1]}`;
        
        const vimeoMatch = url.match(vimeoRegex);
        if (vimeoMatch) return `Vimeo: ${vimeoMatch[1]}`;
        
        const okMatch = url.match(okRegex);
        if (okMatch) return `OK.ru: ${okMatch[1]}`;
        
        return url;
      };

      const videoIdentifier = extractVideoId(videoUrl);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a movie database expert. Given a video URL or identifier, extract accurate movie information. 
If you can identify the movie from the URL pattern, title, or ID, provide real information about that movie.
If you cannot identify a specific movie, analyze the URL/title and make an educated guess based on keywords and patterns.
Always return valid JSON with the exact structure specified.`
          },
          {
            role: "user",
            content: `Extract movie information from this video: ${videoIdentifier}

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{
  "title": "Movie Title",
  "description": "Brief plot summary (2-3 sentences)",
  "year": "YYYY",
  "rating": "G, PG, PG-13, or R",
  "duration": 120,
  "director": "Director Name",
  "genres": ["Genre1", "Genre2"],
  "cast": ["Actor1", "Actor2", "Actor3"]
}

Be accurate if you know the movie. If uncertain, make reasonable guesses based on the URL/title context.`
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const aiResponse = completion.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error("No response from AI");
      }

      let movieData;
      try {
        movieData = JSON.parse(aiResponse);
      } catch (parseError) {
        console.error("Failed to parse AI response:", aiResponse);
        throw new Error("Invalid JSON response from AI");
      }

      const hashCode = (str: string): number => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        return Math.abs(hash);
      };

      const seed = hashCode(videoUrl);
      const seededRandom = (max: number): number => {
        const x = Math.sin(seed) * 10000;
        return Math.floor((x - Math.floor(x)) * max);
      };

      const seededItem = <T,>(arr: T[], offset: number = 0): T => {
        return arr[(seededRandom(arr.length * 1000) + offset) % arr.length];
      };

      const posters = [
        "/api/assets/thriller-generated.png",
        "/api/assets/action-generated.png",
        "/api/assets/drama-generated.png",
        "/api/assets/scifi-generated.png"
      ];

      const backdrops = [
        "/api/assets/landscape-backdrop.png",
        "/api/assets/urban-backdrop.png",
        "/api/assets/desert-backdrop.png",
        "/api/assets/forest-backdrop.png"
      ];

      const movieInfo = {
        title: movieData.title || "Unknown Movie",
        description: movieData.description || "No description available",
        year: String(movieData.year || "2024"),
        rating: movieData.rating || "PG-13",
        duration: Number(movieData.duration) || 120,
        director: movieData.director || "Unknown Director",
        genres: Array.isArray(movieData.genres) ? movieData.genres : ["Drama"],
        cast: Array.isArray(movieData.cast) ? movieData.cast : ["Unknown Cast"],
        poster: seededItem(posters, 3),
        backdrop: seededItem(backdrops, 4)
      };

      res.json(movieInfo);
    } catch (error: any) {
      console.error("Error generating movie info:", error);
      res.status(500).json({ 
        error: "Failed to generate movie info",
        details: error.message 
      });
    }
  });

  // Watchlist endpoints
  app.get('/api/watchlist', isAuthenticated, async (req: any, res) => {
    try {
      const movies = await storage.getWatchlist(req.user.id);
      res.json(movies.map(serializeMovie));
    } catch (error) {
      console.error("Error getting watchlist:", error);
      res.status(500).json({ error: "Failed to get watchlist" });
    }
  });

  app.post('/api/watchlist/:movieId', isAuthenticated, async (req: any, res) => {
    try {
      const result = await storage.addToWatchlist(req.user.id, req.params.movieId);
      res.json({ success: true, result });
    } catch (error) {
      console.error("Error adding to watchlist:", error);
      res.status(500).json({ error: "Failed to add to watchlist" });
    }
  });

  app.delete('/api/watchlist/:movieId', isAuthenticated, async (req: any, res) => {
    try {
      const success = await storage.removeFromWatchlist(req.user.id, req.params.movieId);
      res.json({ success });
    } catch (error) {
      console.error("Error removing from watchlist:", error);
      res.status(500).json({ error: "Failed to remove from watchlist" });
    }
  });

  app.get('/api/watchlist/check/:movieId', isAuthenticated, async (req: any, res) => {
    try {
      const isInList = await storage.isInWatchlist(req.user.id, req.params.movieId);
      res.json({ isInWatchlist: isInList });
    } catch (error) {
      console.error("Error checking watchlist:", error);
      res.status(500).json({ error: "Failed to check watchlist" });
    }
  });

  // Watch progress endpoints
  app.post('/api/progress/:movieId', isAuthenticated, async (req: any, res) => {
    try {
      const { progressSeconds, duration } = req.body;
      const result = await storage.saveWatchProgress(
        req.user.id, 
        req.params.movieId, 
        progressSeconds, 
        duration
      );
      res.json(result);
    } catch (error) {
      console.error("Error saving progress:", error);
      res.status(500).json({ error: "Failed to save progress" });
    }
  });

  app.get('/api/progress/:movieId', isAuthenticated, async (req: any, res) => {
    try {
      const progress = await storage.getWatchProgress(req.user.id, req.params.movieId);
      res.json(progress || null);
    } catch (error) {
      console.error("Error getting progress:", error);
      res.status(500).json({ error: "Failed to get progress" });
    }
  });

  app.get('/api/continue-watching', isAuthenticated, async (req: any, res) => {
    try {
      const continueWatching = await storage.getContinueWatching(req.user.id);
      res.json(continueWatching.map(item => ({
        ...item,
        movie: serializeMovie(item.movie)
      })));
    } catch (error) {
      console.error("Error getting continue watching:", error);
      res.status(500).json({ error: "Failed to get continue watching" });
    }
  });

  // Trending movies endpoint
  app.get('/api/trending', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const trending = await storage.getTrendingMovies(limit);
      res.json(trending.map(serializeMovie));
    } catch (error) {
      console.error("Error getting trending:", error);
      res.status(500).json({ error: "Failed to get trending movies" });
    }
  });

  // Increment view count
  app.post('/api/movies/:id/view', async (req, res) => {
    try {
      await storage.incrementViewCount(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error incrementing view count:", error);
      res.status(500).json({ error: "Failed to increment view count" });
    }
  });

  // Notifications endpoints
  app.get('/api/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const notifications = await storage.getUserNotifications(req.user.id);
      res.json(notifications);
    } catch (error) {
      console.error("Error getting notifications:", error);
      res.status(500).json({ error: "Failed to get notifications" });
    }
  });

  app.post('/api/notifications/:id/read', isAuthenticated, async (req, res) => {
    try {
      const success = await storage.markNotificationAsRead(req.params.id);
      res.json({ success });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.get('/api/notifications/unread/count', isAuthenticated, async (req: any, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.user.id);
      res.json({ count });
    } catch (error) {
      console.error("Error getting unread count:", error);
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });

  // Genre browsing endpoint
  app.get('/api/genres/:genre', async (req, res) => {
    try {
      const movies = await storage.getMoviesByGenre(req.params.genre);
      res.json(movies);
    } catch (error) {
      console.error("Error getting movies by genre:", error);
      res.status(500).json({ error: "Failed to get movies by genre" });
    }
  });

  // ==================== CURATED COLLECTIONS ====================
  
  // Get all active collections (public)
  app.get('/api/collections', async (req, res) => {
    try {
      const collections = await storage.getActiveCollections();
      res.json(collections);
    } catch (error) {
      console.error("Error getting collections:", error);
      res.status(500).json({ error: "Failed to get collections" });
    }
  });

  // Get collection by slug (public)
  app.get('/api/collections/slug/:slug', async (req, res) => {
    try {
      const collection = await storage.getCollectionBySlug(req.params.slug);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      const movies = await storage.getCollectionMovies(collection.id);
      res.json({ collection, movies: movies.map(serializeMovie) });
    } catch (error) {
      console.error("Error getting collection by slug:", error);
      res.status(500).json({ error: "Failed to get collection" });
    }
  });

  // Get collection movies (public)
  app.get('/api/collections/:id/movies', async (req, res) => {
    try {
      const movies = await storage.getCollectionMovies(req.params.id);
      res.json(movies.map(serializeMovie));
    } catch (error) {
      console.error("Error getting collection movies:", error);
      res.status(500).json({ error: "Failed to get collection movies" });
    }
  });

  // Admin: Get all collections (including inactive)
  app.get('/api/admin/collections', isAdmin, async (req, res) => {
    try {
      const collections = await storage.getAllCollections();
      res.json(collections);
    } catch (error) {
      console.error("Error getting all collections:", error);
      res.status(500).json({ error: "Failed to get collections" });
    }
  });

  // Admin: Create collection
  app.post('/api/admin/collections', isAdmin, async (req, res) => {
    try {
      const { title, slug, description, backdropUrl, movieIds, isActive, displayOrder } = req.body;
      
      if (!title || !slug) {
        return res.status(400).json({ error: "Title and slug are required" });
      }

      // Check if slug exists
      const existing = await storage.getCollectionBySlug(slug);
      if (existing) {
        return res.status(400).json({ error: "A collection with this slug already exists" });
      }

      const collection = await storage.createCollection({
        title,
        slug,
        description: description || null,
        backdropUrl: backdropUrl || null,
        movieIds: movieIds || [],
        isActive: isActive !== undefined ? isActive : 1,
        displayOrder: displayOrder || 0
      });
      res.json(collection);
    } catch (error) {
      console.error("Error creating collection:", error);
      res.status(500).json({ error: "Failed to create collection" });
    }
  });

  // Admin: Update collection
  app.patch('/api/admin/collections/:id', isAdmin, async (req, res) => {
    try {
      const { title, slug, description, backdropUrl, movieIds, isActive, displayOrder } = req.body;
      
      // Check for slug collision if slug is being updated
      if (slug) {
        const existing = await storage.getCollectionBySlug(slug);
        if (existing && existing.id !== req.params.id) {
          return res.status(400).json({ error: "A collection with this slug already exists" });
        }
      }

      const collection = await storage.updateCollection({
        id: req.params.id,
        ...(title !== undefined && { title }),
        ...(slug !== undefined && { slug }),
        ...(description !== undefined && { description }),
        ...(backdropUrl !== undefined && { backdropUrl }),
        ...(movieIds !== undefined && { movieIds }),
        ...(isActive !== undefined && { isActive }),
        ...(displayOrder !== undefined && { displayOrder })
      });

      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      res.json(collection);
    } catch (error) {
      console.error("Error updating collection:", error);
      res.status(500).json({ error: "Failed to update collection" });
    }
  });

  // Admin: Delete collection
  app.delete('/api/admin/collections/:id', isAdmin, async (req, res) => {
    try {
      const success = await storage.deleteCollection(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Collection not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting collection:", error);
      res.status(500).json({ error: "Failed to delete collection" });
    }
  });

  // ==================== USER REVIEWS & RATINGS ====================

  // Get movie reviews (public)
  app.get('/api/movies/:movieId/reviews', async (req, res) => {
    try {
      const reviews = await storage.getMovieReviews(req.params.movieId);
      res.json(reviews);
    } catch (error) {
      console.error("Error getting reviews:", error);
      res.status(500).json({ error: "Failed to get reviews" });
    }
  });

  // Get movie average rating (public)
  app.get('/api/movies/:movieId/rating', async (req, res) => {
    try {
      const rating = await storage.getMovieAverageRating(req.params.movieId);
      res.json(rating);
    } catch (error) {
      console.error("Error getting rating:", error);
      res.status(500).json({ error: "Failed to get rating" });
    }
  });

  // Get user's review for a movie
  app.get('/api/movies/:movieId/my-review', isAuthenticated, async (req: any, res) => {
    try {
      const review = await storage.getUserReview(req.user.id, req.params.movieId);
      res.json(review || null);
    } catch (error) {
      console.error("Error getting user review:", error);
      res.status(500).json({ error: "Failed to get review" });
    }
  });

  // Create or update review
  app.post('/api/movies/:movieId/reviews', isAuthenticated, async (req: any, res) => {
    try {
      const { rating, review: reviewText, profileId } = req.body;
      
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }

      if (reviewText && reviewText.length > 500) {
        return res.status(400).json({ error: "Review must be 500 characters or less" });
      }

      const newReview = await storage.createReview({
        userId: req.user.id,
        movieId: req.params.movieId,
        rating,
        review: reviewText || null,
        profileId: profileId || null
      });
      res.json(newReview);
    } catch (error) {
      console.error("Error creating review:", error);
      res.status(500).json({ error: "Failed to create review" });
    }
  });

  // Delete own review
  app.delete('/api/reviews/:id', isAuthenticated, async (req: any, res) => {
    try {
      // First verify the review belongs to the user
      const review = await storage.getUserReview(req.user.id, req.params.id);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }
      
      const success = await storage.deleteReview(req.params.id);
      res.json({ success });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({ error: "Failed to delete review" });
    }
  });

  // Flag a review (authenticated users can flag inappropriate reviews)
  app.post('/api/reviews/:id/flag', isAuthenticated, async (req, res) => {
    try {
      const success = await storage.flagReview(req.params.id);
      res.json({ success });
    } catch (error) {
      console.error("Error flagging review:", error);
      res.status(500).json({ error: "Failed to flag review" });
    }
  });

  // Admin: Get flagged reviews
  app.get('/api/admin/reviews/flagged', isAdmin, async (req, res) => {
    try {
      const reviews = await storage.getFlaggedReviews();
      res.json(reviews);
    } catch (error) {
      console.error("Error getting flagged reviews:", error);
      res.status(500).json({ error: "Failed to get flagged reviews" });
    }
  });

  // Admin: Approve a review
  app.post('/api/admin/reviews/:id/approve', isAdmin, async (req, res) => {
    try {
      const success = await storage.approveReview(req.params.id);
      res.json({ success });
    } catch (error) {
      console.error("Error approving review:", error);
      res.status(500).json({ error: "Failed to approve review" });
    }
  });

  // Admin: Delete a review
  app.delete('/api/admin/reviews/:id', isAdmin, async (req, res) => {
    try {
      const success = await storage.deleteReview(req.params.id);
      res.json({ success });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({ error: "Failed to delete review" });
    }
  });

  // Video playback diagnostic test page (admin only)
  app.get('/api/admin/video-test/:movieId', isAdmin, async (req, res) => {
    try {
      const { movieId } = req.params;
      const movie = await storage.getMovieById(movieId);
      
      if (!movie) {
        return res.status(404).send('Movie not found');
      }

      if (!movie.hostedAssetKey) {
        return res.status(400).send('Movie has no hosted video');
      }

      // Get signed URL
      let signedUrl: string;
      let storageType: string;

      if (r2StorageService.isConfigured() && movie.hostedAssetKey.startsWith('videos/')) {
        try {
          const exists = await r2StorageService.objectExists(movie.hostedAssetKey);
          if (exists) {
            signedUrl = await r2StorageService.getSignedUrl(movie.hostedAssetKey, 86400);
            storageType = 'R2';
          } else {
            const objectStorageService = new ObjectStorageService();
            signedUrl = await objectStorageService.getPublicVideoURL(movie.hostedAssetKey);
            storageType = 'Replit';
          }
        } catch (r2Error) {
          const objectStorageService = new ObjectStorageService();
          signedUrl = await objectStorageService.getPublicVideoURL(movie.hostedAssetKey);
          storageType = 'Replit';
        }
      } else {
        const objectStorageService = new ObjectStorageService();
        signedUrl = await objectStorageService.getPublicVideoURL(movie.hostedAssetKey);
        storageType = 'Replit';
      }

      // Return simple HTML test page
      res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Video Test - ${movie.title}</title>
  <style>
    body { font-family: system-ui; background: #1a1a1a; color: #fff; padding: 20px; }
    video { width: 100%; max-width: 800px; background: #000; }
    .info { background: #333; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .success { color: #4ade80; }
    .error { color: #f87171; }
    .warning { color: #fbbf24; }
    pre { background: #222; padding: 10px; overflow-x: auto; font-size: 12px; }
    h1 { color: #d4af37; }
  </style>
</head>
<body>
  <h1>Video Playback Test: ${movie.title}</h1>
  
  <div class="info">
    <strong>Storage Type:</strong> ${storageType}<br>
    <strong>Asset Key:</strong> ${movie.hostedAssetKey}<br>
    <strong>Transcoding Status:</strong> ${movie.transcodingStatus || 'N/A'}<br>
    <strong>URL Length:</strong> ${signedUrl.length} characters
  </div>

  <video id="testVideo" controls>
    <source src="${signedUrl}" type="video/mp4">
    Your browser does not support the video element.
  </video>

  <div id="status" class="info">
    <strong>Status:</strong> <span id="statusText">Loading...</span>
  </div>

  <div id="events" class="info">
    <strong>Events:</strong>
    <pre id="eventLog"></pre>
  </div>

  <script>
    const video = document.getElementById('testVideo');
    const statusText = document.getElementById('statusText');
    const eventLog = document.getElementById('eventLog');
    let events = [];

    function log(msg, type = 'info') {
      const time = new Date().toISOString().substr(11, 12);
      events.push('[' + time + '] ' + msg);
      eventLog.textContent = events.join('\\n');
      console.log('[VIDEO TEST]', msg);
    }

    video.addEventListener('loadstart', () => log('loadstart - Video loading started'));
    video.addEventListener('loadedmetadata', () => log('loadedmetadata - Duration: ' + video.duration + 's, Size: ' + video.videoWidth + 'x' + video.videoHeight));
    video.addEventListener('loadeddata', () => log('loadeddata - First frame ready'));
    video.addEventListener('canplay', () => {
      log('canplay - Ready to play!');
      statusText.textContent = 'Ready to play!';
      statusText.className = 'success';
    });
    video.addEventListener('canplaythrough', () => log('canplaythrough - Can play through'));
    video.addEventListener('playing', () => log('playing - Playback started'));
    video.addEventListener('waiting', () => log('waiting - Buffering...'));
    video.addEventListener('stalled', () => log('stalled - Download stalled', 'warning'));
    video.addEventListener('error', (e) => {
      const error = video.error;
      let errorMsg = 'Unknown error';
      if (error) {
        switch(error.code) {
          case 1: errorMsg = 'MEDIA_ERR_ABORTED: Playback aborted'; break;
          case 2: errorMsg = 'MEDIA_ERR_NETWORK: Network error'; break;
          case 3: errorMsg = 'MEDIA_ERR_DECODE: Decode error (codec issue?)'; break;
          case 4: errorMsg = 'MEDIA_ERR_SRC_NOT_SUPPORTED: Source not supported'; break;
        }
        if (error.message) errorMsg += ' - ' + error.message;
      }
      log('ERROR: ' + errorMsg, 'error');
      statusText.textContent = 'Error: ' + errorMsg;
      statusText.className = 'error';
    });

    log('Test page loaded, video element created');
    log('Browser: ' + navigator.userAgent.substr(0, 100));
  </script>
</body>
</html>
      `);
    } catch (error: any) {
      console.error("Error creating video test page:", error);
      res.status(500).send('Error: ' + error.message);
    }
  });

  // ============= MONETIZATION ROUTES =============

  // Public tip configuration - returns what tip options are available
  app.get('/api/tips/config', async (req, res) => {
    try {
      res.json({
        platformTipsEnabled: true,
        filmmakerTipsEnabled: true,
        suggestedAmounts: [3, 5, 10, 20, 50],
        currency: 'USD',
        platformSharePercent: 30,
        filmmakerSharePercent: 70,
        stripeConfigured: true
      });
    } catch (error) {
      console.error("Error fetching tip config:", error);
      res.status(500).json({ error: "Failed to fetch tip configuration" });
    }
  });

  // Get Stripe publishable key for frontend
  app.get('/api/stripe/publishable-key', async (req, res) => {
    try {
      const { getStripePublishableKey } = await import('./stripeClient');
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Error getting Stripe publishable key:", error);
      res.status(500).json({ error: "Failed to get Stripe configuration" });
    }
  });

  // Verify checkout session and update tip status
  app.get('/api/stripe/verify-session/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const tipTransactionId = session.metadata?.tipTransactionId;
      
      // Validate tip exists and is in valid state
      if (!tipTransactionId) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid session - no tip associated" 
        });
      }
      
      const tip = await storage.getTipById(tipTransactionId);
      if (!tip) {
        return res.status(404).json({ 
          success: false, 
          error: "Tip transaction not found" 
        });
      }
      
      // If already completed (possibly by webhook), return success
      if (tip.status === 'completed') {
        return res.json({
          success: true,
          status: 'paid',
          tipType: session.metadata?.tipType,
          amount: (session.amount_total || 0) / 100,
        });
      }
      
      if (session.payment_status === 'paid') {
        // Update tip to completed
        await storage.updateTipTransaction(tipTransactionId, {
          status: 'completed',
          stripePaymentIntentId: session.payment_intent as string,
        });
        
        res.json({
          success: true,
          status: 'paid',
          tipType: session.metadata?.tipType,
          amount: (session.amount_total || 0) / 100,
        });
      } else if (session.payment_status === 'unpaid') {
        res.json({
          success: false,
          status: 'pending',
          message: 'Payment not yet completed',
        });
      } else {
        res.json({
          success: false,
          status: session.payment_status,
        });
      }
    } catch (error) {
      console.error("Error verifying checkout session:", error);
      res.status(500).json({ error: "Failed to verify payment" });
    }
  });

  // Get recent tips (for social proof/wall of supporters)
  app.get('/api/tips/recent', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const tips = await storage.getRecentTips(Math.min(limit, 50));
      
      // Filter to only show public info (anonymize when requested)
      const publicTips = tips.map(tip => ({
        id: tip.id,
        tipType: tip.tipType,
        amount: tip.grossAmountCents / 100,
        currency: tip.currency,
        isAnonymous: tip.isAnonymous,
        tipperName: tip.isAnonymous ? 'Anonymous' : tip.tipperName,
        message: tip.message,
        createdAt: tip.createdAt
      }));
      
      res.json(publicTips);
    } catch (error) {
      console.error("Error fetching recent tips:", error);
      res.status(500).json({ error: "Failed to fetch recent tips" });
    }
  });

  // Create a new tip (platform support) with Stripe Checkout
  app.post('/api/tips/platform', async (req: any, res) => {
    try {
      const { amountCents, tipperName, tipperEmail, message, isAnonymous } = req.body;
      
      if (!amountCents || amountCents < 100) {
        return res.status(400).json({ error: "Minimum tip amount is $1.00" });
      }
      
      // Get user ID if authenticated
      let userId = null;
      if (req.user && req.user.claims) {
        userId = req.user.claims.sub;
      }
      
      const tip = await storage.createTip({
        tipType: 'platform_support',
        userId,
        tipperName: isAnonymous ? null : tipperName,
        tipperEmail,
        isAnonymous: isAnonymous ? 1 : 0,
        grossAmountCents: amountCents,
        currency: 'USD',
        processingFeeCents: 0,
        platformShareCents: amountCents,
        filmmakerShareCents: 0,
        status: 'pending',
        message
      });
      
      try {
        // Create Stripe Checkout session
        const { getUncachableStripeClient } = await import('./stripeClient');
        const stripe = await getUncachableStripeClient();
        
        const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
        
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          line_items: [{
            price_data: {
              currency: 'usd',
              unit_amount: amountCents,
              product_data: {
                name: 'Support Rampage Films',
                description: 'Platform tip to help keep the platform running',
              },
            },
            quantity: 1,
          }],
          metadata: {
            tipType: 'platform_support',
            tipTransactionId: tip.id,
            tipperName: tipperName || '',
            message: message || '',
          },
          customer_email: tipperEmail,
          success_url: `${baseUrl}/tip-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/tip-cancel`,
        });
        
        // Update tip with session ID
        await storage.updateTipTransaction(tip.id, {
          stripePaymentIntentId: session.id,
        });
        
        res.json({
          tipId: tip.id,
          amount: amountCents / 100,
          currency: 'USD',
          status: 'pending',
          checkoutUrl: session.url,
        });
      } catch (stripeError: any) {
        console.error("Stripe session creation failed:", stripeError);
        // Mark tip as failed if Stripe session creation fails
        await storage.updateTipTransaction(tip.id, { status: 'failed' });
        res.status(500).json({ error: "Failed to create payment session" });
      }
    } catch (error) {
      console.error("Error creating platform tip:", error);
      res.status(500).json({ error: "Failed to create tip" });
    }
  });

  // Create a tip for a specific filmmaker's movie with Stripe Checkout
  app.post('/api/tips/filmmaker/:movieId', async (req: any, res) => {
    try {
      const { movieId } = req.params;
      const { amountCents, tipperName, tipperEmail, message, isAnonymous } = req.body;
      
      if (!amountCents || amountCents < 100) {
        return res.status(400).json({ error: "Minimum tip amount is $1.00" });
      }
      
      // Verify movie exists and is filmmaker-uploaded
      const movie = await storage.getMovieById(movieId);
      if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
      }
      
      if (!movie.filmmakerId || !movie.isFilmmakerUploaded) {
        return res.status(400).json({ error: "Tips are only available for filmmaker-uploaded content" });
      }
      
      if (!movie.monetizationEnabled) {
        return res.status(400).json({ error: "Monetization is not enabled for this movie" });
      }
      
      // Get filmmaker info
      const filmmaker = await storage.getFilmmakerById(movie.filmmakerId);
      
      // Calculate 70/30 split
      const platformShare = Math.floor(amountCents * 0.30);
      const filmmakerShare = amountCents - platformShare;
      
      // Get user ID if authenticated
      let userId = null;
      if (req.user && req.user.claims) {
        userId = req.user.claims.sub;
      }
      
      const tip = await storage.createTip({
        tipType: 'filmmaker_split',
        userId,
        tipperName: isAnonymous ? null : tipperName,
        tipperEmail,
        isAnonymous: isAnonymous ? 1 : 0,
        filmmakerId: movie.filmmakerId,
        movieId: movie.id,
        grossAmountCents: amountCents,
        currency: 'USD',
        processingFeeCents: 0,
        platformShareCents: platformShare,
        filmmakerShareCents: filmmakerShare,
        status: 'pending',
        message
      });
      
      try {
        // Create Stripe Checkout session
        const { getUncachableStripeClient } = await import('./stripeClient');
        const stripe = await getUncachableStripeClient();
        
        const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
        const filmmakerName = filmmaker?.displayName || 'Filmmaker';
        
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          line_items: [{
            price_data: {
              currency: 'usd',
              unit_amount: amountCents,
              product_data: {
                name: `Support ${filmmakerName}`,
                description: `Tip for "${movie.title}" - 70% goes directly to the filmmaker`,
              },
            },
            quantity: 1,
          }],
          metadata: {
            tipType: 'filmmaker_split',
            tipTransactionId: tip.id,
            filmmakerId: movie.filmmakerId,
            movieId: movie.id,
            tipperName: tipperName || '',
            message: message || '',
          },
          customer_email: tipperEmail,
          success_url: `${baseUrl}/tip-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/movie/${movie.id}`,
        });
        
        // Update tip with session ID
        await storage.updateTipTransaction(tip.id, {
          stripePaymentIntentId: session.id,
        });
        
        res.json({
          tipId: tip.id,
          amount: amountCents / 100,
          currency: 'USD',
          filmmakerShare: filmmakerShare / 100,
          platformShare: platformShare / 100,
          status: 'pending',
          checkoutUrl: session.url,
        });
      } catch (stripeError: any) {
        console.error("Stripe session creation failed:", stripeError);
        // Mark tip as failed if Stripe session creation fails
        await storage.updateTipTransaction(tip.id, { status: 'failed' });
        res.status(500).json({ error: "Failed to create payment session" });
      }
    } catch (error) {
      console.error("Error creating filmmaker tip:", error);
      res.status(500).json({ error: "Failed to create tip" });
    }
  });

  // Filmmaker registration/profile (authenticated users only)
  app.post('/api/filmmakers/register', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { displayName, bio, websiteUrl, profileImageUrl } = req.body;
      
      // Check if already registered
      const existing = await storage.getFilmmakerByUserId(userId);
      if (existing) {
        return res.status(400).json({ error: "Already registered as a filmmaker" });
      }
      
      const filmmaker = await storage.createFilmmaker({
        userId,
        displayName,
        bio,
        websiteUrl,
        profileImageUrl,
        status: 'pending'
      });
      
      res.json(filmmaker);
    } catch (error) {
      console.error("Error registering filmmaker:", error);
      res.status(500).json({ error: "Failed to register as filmmaker" });
    }
  });

  // Get current user's filmmaker profile
  app.get('/api/filmmakers/me', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const filmmaker = await storage.getFilmmakerByUserId(userId);
      
      if (!filmmaker) {
        return res.status(404).json({ error: "Not registered as filmmaker" });
      }
      
      res.json(filmmaker);
    } catch (error) {
      console.error("Error fetching filmmaker profile:", error);
      res.status(500).json({ error: "Failed to fetch filmmaker profile" });
    }
  });

  // Get filmmaker dashboard data
  app.get('/api/filmmakers/dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const filmmaker = await storage.getFilmmakerByUserId(userId);
      
      if (!filmmaker) {
        return res.status(404).json({ error: "Not registered as filmmaker" });
      }
      
      // Get earnings
      const earnings = await storage.getFilmmakerEarnings(filmmaker.id);
      
      // Get their tips
      const tips = await storage.getTipsByFilmmaker(filmmaker.id);
      
      // Get movies they own (would need to add this query)
      const allMovies = await storage.getAllMovies();
      const filmmakerMovies = allMovies.filter(m => m.filmmakerId === filmmaker.id);
      
      // Calculate total views
      const totalViews = filmmakerMovies.reduce((sum, m) => sum + (m.viewCount || 0), 0);
      
      res.json({
        filmmaker,
        earnings,
        totalMovies: filmmakerMovies.length,
        totalViews,
        recentTips: tips.slice(0, 20).map(t => ({
          id: t.id,
          amount: t.filmmakerShareCents / 100,
          grossAmount: t.grossAmountCents / 100,
          tipperName: t.isAnonymous ? 'Anonymous' : t.tipperName,
          message: t.message,
          movieId: t.movieId,
          status: t.status,
          createdAt: t.createdAt
        })),
        movies: filmmakerMovies.map(m => ({
          id: m.id,
          title: m.title,
          poster: m.poster,
          viewCount: m.viewCount,
          monetizationEnabled: m.monetizationEnabled
        }))
      });
    } catch (error) {
      console.error("Error fetching filmmaker dashboard:", error);
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  });

  // Update filmmaker profile
  app.patch('/api/filmmakers/me', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const filmmaker = await storage.getFilmmakerByUserId(userId);
      
      if (!filmmaker) {
        return res.status(404).json({ error: "Not registered as filmmaker" });
      }
      
      const { displayName, bio, websiteUrl, profileImageUrl } = req.body;
      
      const updated = await storage.updateFilmmaker(filmmaker.id, {
        displayName,
        bio,
        websiteUrl,
        profileImageUrl
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating filmmaker profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Filmmaker: Upgrade to Pro subscription
  app.post('/api/filmmakers/upgrade', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const filmmaker = await storage.getFilmmakerByUserId(userId);
      
      if (!filmmaker) {
        return res.status(404).json({ error: "Not registered as filmmaker" });
      }
      
      if (filmmaker.subscriptionTier === 'pro' && filmmaker.subscriptionStatus === 'active') {
        return res.status(400).json({ error: "Already subscribed to Pro" });
      }
      
      // Create Stripe checkout session for Pro subscription
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      
      // Get or create price for Pro tier ($14.99/month)
      const priceId = process.env.STRIPE_FILMMAKER_PRO_PRICE_ID;
      
      let finalPriceId = priceId;
      if (!finalPriceId) {
        // Create the price if it doesn't exist
        const product = await stripe.products.create({
          name: 'Rampage Films Pro - Filmmaker',
          description: 'Unlimited films, 80% revenue share, priority support',
        });
        
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: 1499, // $14.99
          currency: 'usd',
          recurring: { interval: 'month' },
        });
        
        finalPriceId = price.id;
        console.log(`[FilmmakerUpgrade] Created Pro price: ${finalPriceId}`);
      }
      
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: finalPriceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000'}/filmmaker/dashboard?upgrade=success`,
        cancel_url: `${process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000'}/filmmaker/dashboard?upgrade=cancelled`,
        metadata: {
          filmmakerId: filmmaker.id,
          userId: userId,
          type: 'filmmaker_pro_subscription',
        },
        customer_email: req.user.claims.email,
      });
      
      res.json({ checkoutUrl: session.url });
    } catch (error: any) {
      console.error("Error creating upgrade checkout:", error);
      res.status(500).json({ error: error.message || "Failed to start upgrade" });
    }
  });

  // Filmmaker: Submit a movie for review
  app.post('/api/filmmakers/submit-movie', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const filmmaker = await storage.getFilmmakerByUserId(userId);
      
      if (!filmmaker) {
        return res.status(404).json({ error: "Not registered as filmmaker" });
      }
      
      if (filmmaker.status !== 'approved') {
        return res.status(403).json({ error: "Your filmmaker account must be approved to submit films" });
      }
      
      const { title, description, year, duration, director, cast, genres, videoUrl, trailerUrl, posterUrl } = req.body;
      
      if (!title || !description || !videoUrl) {
        return res.status(400).json({ error: "Title, description, and video URL are required" });
      }
      
      // Create the movie with filmmaker attribution
      const movieData: any = {
        title,
        description,
        year: year || new Date().getFullYear(),
        duration: duration || null,
        director: director || filmmaker.displayName,
        cast: cast || [],
        genres: genres || [],
        originalEmbedUrl: videoUrl,
        trailerUrl: trailerUrl || null,
        poster: posterUrl || null,
        filmmakerId: filmmaker.id,
        isFilmmakerUploaded: 1,
        monetizationEnabled: 1,
        rating: null,
      };
      
      const movie = await storage.createMovie(movieData);
      
      // Queue a video download job for the movie
      if (videoUrl) {
        try {
          await jobQueue.createJob('video-download', movie.id, {
            sourceUrl: videoUrl,
            targetFormat: 'mp4',
            quality: 'best'
          }, { priority: 5 }); // Higher priority for filmmaker uploads
          
          console.log(`[FilmmakerUpload] Queued video download for "${title}" (${movie.id})`);
        } catch (jobError) {
          console.error("[FilmmakerUpload] Failed to queue download:", jobError);
        }
      }
      
      console.log(`[FilmmakerUpload] Filmmaker ${filmmaker.displayName} submitted "${title}"`);
      
      res.json({ 
        success: true, 
        movie: serializeMovie(movie),
        message: "Film submitted successfully! It will be processed and available soon."
      });
    } catch (error: any) {
      console.error("Error submitting filmmaker movie:", error);
      res.status(500).json({ error: "Failed to submit movie", details: error.message });
    }
  });

  // Public: Get filmmaker profile by ID
  app.get('/api/filmmakers/:id/profile', async (req, res) => {
    try {
      const { id } = req.params;
      const filmmaker = await storage.getFilmmakerById(id);
      
      if (!filmmaker || filmmaker.status !== 'approved') {
        return res.status(404).json({ error: "Filmmaker not found" });
      }
      
      // Get filmmaker's public movies
      const allMovies = await storage.getAllMovies();
      const filmmakerMovies = allMovies
        .filter(m => m.filmmakerId === id)
        .map(m => serializeMovie(m));
      
      res.json({
        id: filmmaker.id,
        displayName: filmmaker.displayName,
        bio: filmmaker.bio,
        websiteUrl: filmmaker.websiteUrl,
        profileImageUrl: filmmaker.profileImageUrl,
        totalMovies: filmmakerMovies.length,
        movies: filmmakerMovies
      });
    } catch (error) {
      console.error("Error fetching filmmaker profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // Admin: Get all filmmakers
  app.get('/api/admin/filmmakers', isAdmin, async (req, res) => {
    try {
      const filmmakers = await storage.getAllFilmmakers();
      res.json(filmmakers);
    } catch (error) {
      console.error("Error fetching filmmakers:", error);
      res.status(500).json({ error: "Failed to fetch filmmakers" });
    }
  });

  // Admin: Update filmmaker status (approve/suspend)
  app.patch('/api/admin/filmmakers/:id', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body; // 'pending', 'approved', 'suspended'
      
      const updated = await storage.updateFilmmaker(id, { status });
      if (!updated) {
        return res.status(404).json({ error: "Filmmaker not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating filmmaker:", error);
      res.status(500).json({ error: "Failed to update filmmaker" });
    }
  });

  // Admin: Platform earnings overview
  app.get('/api/admin/earnings', isAdmin, async (req, res) => {
    try {
      const platformEarnings = await storage.getPlatformEarningsTotal();
      const recentTips = await storage.getRecentTips(50);
      
      res.json({
        ...platformEarnings,
        recentTips: recentTips.map(t => ({
          id: t.id,
          tipType: t.tipType,
          grossAmount: t.grossAmountCents / 100,
          platformShare: t.platformShareCents / 100,
          tipperName: t.isAnonymous ? 'Anonymous' : t.tipperName,
          status: t.status,
          createdAt: t.createdAt
        }))
      });
    } catch (error) {
      console.error("Error fetching platform earnings:", error);
      res.status(500).json({ error: "Failed to fetch earnings" });
    }
  });

  // ============= SPONSOR MANAGEMENT (Admin) =============

  // Admin: Get all sponsors
  app.get('/api/admin/sponsors', isAdmin, async (req, res) => {
    try {
      const sponsors = await storage.getAllSponsors();
      res.json(sponsors);
    } catch (error) {
      console.error("Error fetching sponsors:", error);
      res.status(500).json({ error: "Failed to fetch sponsors" });
    }
  });

  // Admin: Create sponsor
  app.post('/api/admin/sponsors', isAdmin, async (req, res) => {
    try {
      const { name, logoUrl, websiteUrl, contactEmail, contactName, notes } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Sponsor name is required" });
      }
      
      const sponsor = await storage.createSponsor({
        name,
        logoUrl,
        websiteUrl,
        contactEmail,
        contactName,
        notes,
        isActive: 1
      });
      
      res.json(sponsor);
    } catch (error) {
      console.error("Error creating sponsor:", error);
      res.status(500).json({ error: "Failed to create sponsor" });
    }
  });

  // Admin: Update sponsor
  app.patch('/api/admin/sponsors/:id', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateSponsor(id, req.body);
      
      if (!updated) {
        return res.status(404).json({ error: "Sponsor not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating sponsor:", error);
      res.status(500).json({ error: "Failed to update sponsor" });
    }
  });

  // Admin: Delete sponsor
  app.delete('/api/admin/sponsors/:id', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteSponsor(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Sponsor not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting sponsor:", error);
      res.status(500).json({ error: "Failed to delete sponsor" });
    }
  });

  // Admin: Get all placements
  app.get('/api/admin/placements', isAdmin, async (req, res) => {
    try {
      const placements = await storage.getAllPlacements();
      res.json(placements);
    } catch (error) {
      console.error("Error fetching placements:", error);
      res.status(500).json({ error: "Failed to fetch placements" });
    }
  });

  // Admin: Create placement
  app.post('/api/admin/placements', isAdmin, async (req, res) => {
    try {
      const { 
        sponsorId, placementType, headline, description, 
        imageUrl, clickUrl, startDate, endDate, 
        collectionId, movieId, genreTarget, priority 
      } = req.body;
      
      if (!sponsorId || !placementType || !startDate) {
        return res.status(400).json({ error: "Sponsor, placement type, and start date are required" });
      }
      
      const placement = await storage.createPlacement({
        sponsorId,
        placementType,
        headline,
        description,
        imageUrl,
        clickUrl,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
        collectionId,
        movieId,
        genreTarget,
        priority: priority || 0,
        isActive: 1
      });
      
      res.json(placement);
    } catch (error) {
      console.error("Error creating placement:", error);
      res.status(500).json({ error: "Failed to create placement" });
    }
  });

  // Admin: Update placement
  app.patch('/api/admin/placements/:id', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };
      
      if (updateData.startDate) {
        updateData.startDate = new Date(updateData.startDate);
      }
      if (updateData.endDate) {
        updateData.endDate = new Date(updateData.endDate);
      }
      
      const updated = await storage.updatePlacement(id, updateData);
      
      if (!updated) {
        return res.status(404).json({ error: "Placement not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating placement:", error);
      res.status(500).json({ error: "Failed to update placement" });
    }
  });

  // Admin: Delete placement
  app.delete('/api/admin/placements/:id', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deletePlacement(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Placement not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting placement:", error);
      res.status(500).json({ error: "Failed to delete placement" });
    }
  });

  // ============= PUBLIC SPONSOR ROUTES =============

  // Get single active placement (for frontend components)
  app.get('/api/sponsors/placement', async (req, res) => {
    try {
      const { type, movieId, collectionId, genre } = req.query;
      
      if (!type || typeof type !== 'string') {
        return res.status(400).json({ error: "Missing placement type" });
      }
      
      const placements = await storage.getPlacementsByType(type);
      
      // Filter active placements that match criteria
      const now = new Date();
      const active = placements.filter(p => {
        if (!p.isActive) return false;
        if (new Date(p.startDate) > now) return false;
        if (p.endDate && new Date(p.endDate) < now) return false;
        
        // Match specific targeting if provided
        if (collectionId && p.collectionId && p.collectionId !== collectionId) return false;
        if (movieId && p.movieId && p.movieId !== movieId) return false;
        if (genre && p.genreTarget && p.genreTarget !== genre) return false;
        
        return true;
      });
      
      // Sort by priority and return highest
      active.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      
      if (active.length === 0) {
        return res.status(404).json({ error: "No active placement found" });
      }
      
      const placement = active[0];
      const sponsor = await storage.getSponsorById(placement.sponsorId);
      
      // Note: Impressions are tracked by the client calling /api/sponsors/placements/:id/impression
      // This allows for more accurate tracking when the placement is actually rendered
      
      res.json({
        ...placement,
        sponsor: sponsor ? {
          name: sponsor.name,
          logoUrl: sponsor.logoUrl,
          websiteUrl: sponsor.websiteUrl
        } : null
      });
    } catch (error) {
      console.error("Error fetching placement:", error);
      res.status(500).json({ error: "Failed to fetch placement" });
    }
  });

  // Get active placements by type (for displaying sponsor content)
  app.get('/api/sponsors/placements/:type', async (req, res) => {
    try {
      const { type } = req.params;
      const placements = await storage.getPlacementsByType(type);
      
      // Return with sponsor info joined
      const result = await Promise.all(placements.map(async (p) => {
        const sponsor = await storage.getSponsorById(p.sponsorId);
        return {
          ...p,
          sponsor: sponsor ? {
            name: sponsor.name,
            logoUrl: sponsor.logoUrl,
            websiteUrl: sponsor.websiteUrl
          } : null
        };
      }));
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching placements:", error);
      res.status(500).json({ error: "Failed to fetch placements" });
    }
  });

  // Track impression (called when sponsor content is displayed)
  app.post('/api/sponsors/placements/:id/impression', async (req, res) => {
    try {
      const { id } = req.params;
      await storage.incrementPlacementImpressions(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking impression:", error);
      res.status(500).json({ error: "Failed to track impression" });
    }
  });

  // Track click (called when user clicks on sponsor content)
  app.post('/api/sponsors/placements/:id/click', async (req, res) => {
    try {
      const { id } = req.params;
      await storage.incrementPlacementClicks(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking click:", error);
      res.status(500).json({ error: "Failed to track click" });
    }
  });

  // ============= REFERRAL SYSTEM =============

  // Generate unique referral code
  function generateReferralCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'RF';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Get or create referral code for filmmaker
  app.get('/api/referrals/my-code', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const filmmaker = await storage.getFilmmakerByUserId(userId);
      
      let ownerType = 'user';
      let ownerId = userId;
      
      if (filmmaker) {
        ownerType = 'filmmaker';
        ownerId = filmmaker.id;
      }
      
      let code = await storage.getReferralCodeByOwner(ownerType, ownerId);
      
      if (!code) {
        // Create a new referral code
        code = await storage.createReferralCode({
          code: generateReferralCode(),
          ownerType,
          ownerId,
          rewardType: filmmaker ? 'filmmaker_bonus' : 'standard',
          isActive: 1
        });
      }
      
      const stats = await storage.getReferralStats(ownerId, ownerType);
      
      res.json({
        code: code.code,
        shareUrl: `${process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000'}?ref=${code.code}`,
        stats
      });
    } catch (error) {
      console.error("Error getting referral code:", error);
      res.status(500).json({ error: "Failed to get referral code" });
    }
  });

  // Track referral signup (called when user signs up with ref code)
  app.post('/api/referrals/track', async (req, res) => {
    try {
      const { code, referredUserId, referredEmail } = req.body;
      
      if (!code || !referredUserId) {
        return res.status(400).json({ error: "Code and referred user ID required" });
      }
      
      const referralCode = await storage.getReferralCodeByCode(code);
      if (!referralCode || !referralCode.isActive) {
        return res.status(404).json({ error: "Invalid or inactive referral code" });
      }
      
      // Create referral record
      await storage.createReferral({
        referralCodeId: referralCode.id,
        referrerId: referralCode.ownerId,
        referrerType: referralCode.ownerType,
        referredId: referredUserId,
        referredType: 'user',
        referredEmail,
        status: 'pending',
        rewardAmountCents: 0
      });
      
      // Increment counter
      await storage.incrementReferralCount(referralCode.id);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking referral:", error);
      res.status(500).json({ error: "Failed to track referral" });
    }
  });

  // Get referral stats for filmmaker dashboard
  app.get('/api/referrals/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const filmmaker = await storage.getFilmmakerByUserId(userId);
      
      const ownerType = filmmaker ? 'filmmaker' : 'user';
      const ownerId = filmmaker ? filmmaker.id : userId;
      
      const stats = await storage.getReferralStats(ownerId, ownerType);
      const code = await storage.getReferralCodeByOwner(ownerType, ownerId);
      
      let referralList: any[] = [];
      if (code) {
        const referrals = await storage.getReferralsByCode(code.id);
        referralList = referrals.map(r => ({
          id: r.id,
          referredType: r.referredType,
          status: r.status,
          createdAt: r.createdAt
        }));
      }
      
      res.json({
        ...stats,
        referrals: referralList
      });
    } catch (error) {
      console.error("Error getting referral stats:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  // ============= NEWSLETTER SUBSCRIPTION =============

  // Subscribe to newsletter
  app.post('/api/newsletter/subscribe', async (req, res) => {
    try {
      const { email, genres, frequency } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const subscription = await storage.subscribeNewsletter({
        email,
        genres: genres || [],
        frequency: frequency || 'weekly',
        isActive: 1
      });
      
      res.json({ success: true, id: subscription.id });
    } catch (error) {
      console.error("Error subscribing to newsletter:", error);
      res.status(500).json({ error: "Failed to subscribe" });
    }
  });

  // Unsubscribe from newsletter
  app.post('/api/newsletter/unsubscribe', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      await storage.unsubscribeNewsletter(email);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unsubscribing:", error);
      res.status(500).json({ error: "Failed to unsubscribe" });
    }
  });

  // Admin: Get newsletter subscribers
  app.get('/api/admin/newsletter/subscribers', isAdmin, async (req, res) => {
    try {
      const subscribers = await storage.getActiveSubscribers();
      res.json(subscribers);
    } catch (error) {
      console.error("Error getting subscribers:", error);
      res.status(500).json({ error: "Failed to get subscribers" });
    }
  });

  // ============= SOCIAL SHARE CARDS =============

  // Get share cards for a movie
  app.get('/api/movies/:id/share-cards', async (req, res) => {
    try {
      const { id } = req.params;
      const movie = await storage.getMovieById(id);
      
      if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
      }
      
      let cards = await storage.getShareCardsByMovie(id);
      
      // If no cards exist, generate default ones
      if (cards.length === 0) {
        const defaultCards = [
          {
            movieId: id,
            cardType: 'poster',
            imageUrl: movie.poster,
            headline: movie.title,
            caption: `Watch "${movie.title}" (${movie.year}) now on Rampage Films - rare films you won't find anywhere else!`,
            hashtags: ['RampageFilms', 'RareFilms', ...movie.genres.slice(0, 2).map((g: string) => g.replace(/\s/g, ''))]
          }
        ];
        
        for (const cardData of defaultCards) {
          await storage.createShareCard(cardData);
        }
        
        cards = await storage.getShareCardsByMovie(id);
      }
      
      res.json(cards);
    } catch (error) {
      console.error("Error getting share cards:", error);
      res.status(500).json({ error: "Failed to get share cards" });
    }
  });

  // Track share
  app.post('/api/share-cards/:id/track', async (req, res) => {
    try {
      const { id } = req.params;
      await storage.incrementShareCount(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking share:", error);
      res.status(500).json({ error: "Failed to track share" });
    }
  });

  // ============= AI DUBBING =============

  // Get supported dubbing languages
  app.get('/api/dubbing/languages', (req, res) => {
    // Each language needs a voices array for the UI
    const defaultVoices = [
      { id: 'male', name: 'Male Voice', gender: 'male' },
      { id: 'female', name: 'Female Voice', gender: 'female' },
    ];
    const languages = [
      { code: 'en', name: 'English', voices: defaultVoices },
      { code: 'en-US', name: 'English (American)', voices: defaultVoices },
      { code: 'en-GB', name: 'English (British)', voices: defaultVoices },
      { code: 'es', name: 'Spanish', voices: defaultVoices },
      { code: 'es-MX', name: 'Spanish (Mexican)', voices: defaultVoices },
      { code: 'fr', name: 'French', voices: defaultVoices },
      { code: 'de', name: 'German', voices: defaultVoices },
      { code: 'it', name: 'Italian', voices: defaultVoices },
      { code: 'pt', name: 'Portuguese', voices: defaultVoices },
      { code: 'pt-BR', name: 'Portuguese (Brazilian)', voices: defaultVoices },
      { code: 'ru', name: 'Russian', voices: defaultVoices },
      { code: 'zh', name: 'Chinese (Mandarin)', voices: defaultVoices },
      { code: 'ja', name: 'Japanese', voices: defaultVoices },
      { code: 'ko', name: 'Korean', voices: defaultVoices },
      { code: 'ar', name: 'Arabic', voices: defaultVoices },
      { code: 'hi', name: 'Hindi', voices: defaultVoices },
      { code: 'nl', name: 'Dutch', voices: defaultVoices },
      { code: 'pl', name: 'Polish', voices: defaultVoices },
      { code: 'tr', name: 'Turkish', voices: defaultVoices },
      { code: 'sv', name: 'Swedish', voices: defaultVoices },
      { code: 'no', name: 'Norwegian', voices: defaultVoices },
      { code: 'da', name: 'Danish', voices: defaultVoices },
      { code: 'fi', name: 'Finnish', voices: defaultVoices },
      { code: 'el', name: 'Greek', voices: defaultVoices },
      { code: 'cs', name: 'Czech', voices: defaultVoices },
      { code: 'ro', name: 'Romanian', voices: defaultVoices },
      { code: 'hu', name: 'Hungarian', voices: defaultVoices },
      { code: 'th', name: 'Thai', voices: defaultVoices },
      { code: 'vi', name: 'Vietnamese', voices: defaultVoices },
      { code: 'id', name: 'Indonesian', voices: defaultVoices },
      { code: 'uk', name: 'Ukrainian', voices: defaultVoices },
      { code: 'he', name: 'Hebrew', voices: defaultVoices },
      { code: 'fil', name: 'Filipino', voices: defaultVoices },
    ];
    res.json(languages);
  });

  // Get dubbed audio tracks for a movie
  app.get('/api/movies/:id/dubbed-tracks', async (req, res) => {
    try {
      const { id } = req.params;
      const tracks = await storage.getDubbedTracksByMovie(id);
      
      // Generate signed URLs for completed tracks
      const tracksWithUrls = await Promise.all(tracks.map(async (track) => {
        if (track.status === 'completed' && track.audioKey) {
          try {
            const audioUrl = await r2StorageService.getSignedUrl(track.audioKey);
            return { ...track, audioUrl };
          } catch {
            return track;
          }
        }
        return track;
      }));
      
      res.json(tracksWithUrls);
    } catch (error) {
      console.error("Error getting dubbed tracks:", error);
      res.status(500).json({ error: "Failed to get dubbed tracks" });
    }
  });

  // Start dubbing job for a movie (Admin only)
  app.post('/api/admin/movies/:id/dub', (req, res, next) => {
    console.log('[Dubbing Route] Received POST request for movie:', req.params.id);
    console.log('[Dubbing Route] Session isAdmin:', req.session?.isAdmin);
    console.log('[Dubbing Route] Body:', JSON.stringify(req.body));
    next();
  }, isAdmin, async (req, res) => {
    try {
      console.log('[Dubbing] Passed isAdmin check, processing request...');
      const { id } = req.params;
      const { 
        targetLanguage, 
        sourceLanguage = 'en', 
        voiceGender = 'female', 
        speakerMode = 'single',
        speakers = [],
        keepBackground = true,
        outputFormat = 'aac',
        voiceQuality = 'standard' // 'standard' = Edge-TTS, 'premium' = ElevenLabs
      } = req.body;
      
      if (!targetLanguage) {
        return res.status(400).json({ error: "Target language is required" });
      }
      
      console.log('[Dubbing] Request body:', JSON.stringify(req.body));
      console.log('[Dubbing] Source language:', sourceLanguage, '-> Target language:', targetLanguage);
      
      const movie = await storage.getMovieById(id);
      if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
      }
      
      if (!movie.videoUrl && !movie.hostedAssetKey) {
        return res.status(400).json({ error: "Movie has no video source" });
      }
      
      // Check if dubbing already exists or is in progress
      const existingTracks = await storage.getDubbedTracksByMovie(id);
      const existingTrack = existingTracks.find(t => t.languageCode === targetLanguage);
      
      if (existingTrack?.status === 'processing') {
        return res.status(400).json({ error: "Dubbing already in progress for this language" });
      }
      
      // Create job - signature: createJob(type, movieId, metadata, options)
      const job = await jobQueue.createJob(
        'ai-dubbing',
        id,
        {
          movieId: id,
          targetLanguage,
          sourceLanguage,
          voiceGender,
          speakerMode,
          speakers,
          keepBackground,
          outputFormat,
          voiceQuality,
          dubbedTrackId: existingTrack?.id,
          movieTitle: movie.title
        },
        { priority: 5, maxRetries: 3 }
      );
      
      res.json({ 
        success: true, 
        jobId: job.id,
        message: `Dubbing job started for ${targetLanguage}`
      });
    } catch (error) {
      console.error("Error starting dubbing job:", error);
      res.status(500).json({ error: "Failed to start dubbing job" });
    }
  });

  // Get dubbing job status
  app.get('/api/admin/dubbing/jobs', isAdmin, async (req, res) => {
    try {
      const jobs = await jobQueue.getJobs({ type: 'ai-dubbing' });
      res.json(jobs);
    } catch (error) {
      console.error("Error getting dubbing jobs:", error);
      res.status(500).json({ error: "Failed to get dubbing jobs" });
    }
  });

  // Sync dubbed track from development to production (Admin only, called via admin secret)
  app.post('/api/admin/dubbed-tracks/sync', isAdmin, async (req, res) => {
    try {
      const { movieId, languageCode, languageName, audioKey, voiceModel, duration, status } = req.body;
      
      if (!movieId || !languageCode || !languageName || !audioKey) {
        return res.status(400).json({ error: "Missing required fields: movieId, languageCode, languageName, audioKey" });
      }
      
      // Check if movie exists
      const movie = await storage.getMovieById(movieId);
      if (!movie) {
        return res.status(404).json({ error: "Movie not found in production database" });
      }
      
      // Check if track already exists for this movie+language
      const existingTrack = await storage.getDubbedTrackByMovieAndLanguage(movieId, languageCode);
      
      if (existingTrack) {
        // Update existing track
        await storage.updateDubbedTrack(existingTrack.id, {
          audioKey,
          voiceModel,
          duration,
          status: status || 'completed'
        });
        console.log(`[DubbedTrackSync] Updated existing track for ${movie.title} - ${languageName}`);
        res.json({ success: true, action: 'updated', trackId: existingTrack.id });
      } else {
        // Create new track
        const newTrack = await storage.createDubbedTrack({
          movieId,
          languageCode,
          languageName,
          audioKey,
          voiceModel,
          duration,
          status: status || 'completed',
          progress: 100
        });
        console.log(`[DubbedTrackSync] Created new track for ${movie.title} - ${languageName}`);
        res.json({ success: true, action: 'created', trackId: newTrack.id });
      }
    } catch (error: any) {
      console.error("[DubbedTrackSync] Error:", error);
      res.status(500).json({ error: "Failed to sync dubbed track", details: error.message });
    }
  });

  // Delete dubbed track (Admin only)
  app.delete('/api/admin/dubbed-tracks/:id', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const track = await storage.getDubbedTrack(id);
      
      if (!track) {
        return res.status(404).json({ error: "Dubbed track not found" });
      }
      
      // Delete from R2 if exists
      if (track.audioKey) {
        try {
          await r2StorageService.deleteFile(track.audioKey);
        } catch (e) {
          console.warn("Failed to delete audio from R2:", e);
        }
      }
      
      await storage.deleteDubbedTrack(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting dubbed track:", error);
      res.status(500).json({ error: "Failed to delete dubbed track" });
    }
  });

  // Rate dubbed audio quality (Authenticated users)
  app.post('/api/dubbed-tracks/:id/rate', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { rating, feedback, issueType } = req.body;
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }
      
      const track = await storage.getDubbedTrack(id);
      if (!track) {
        return res.status(404).json({ error: "Dubbed track not found" });
      }
      
      // Create or update rating
      const ratingRecord = await storage.rateDubbedAudioTrack({
        dubbedTrackId: id,
        userId,
        rating,
        feedback,
        issueType
      });
      
      res.json({ success: true, rating: ratingRecord });
    } catch (error) {
      console.error("Error rating dubbed track:", error);
      res.status(500).json({ error: "Failed to rate dubbed track" });
    }
  });

  // Get ratings for a dubbed track
  app.get('/api/dubbed-tracks/:id/ratings', async (req, res) => {
    try {
      const { id } = req.params;
      const ratings = await storage.getDubbingRatingsByTrack(id);
      res.json(ratings);
    } catch (error) {
      console.error("Error getting ratings:", error);
      res.status(500).json({ error: "Failed to get ratings" });
    }
  });

  // Increment download count for dubbed track
  app.post('/api/dubbed-tracks/:id/download', async (req, res) => {
    try {
      const { id } = req.params;
      await storage.incrementDubbedTrackDownload(id);
      
      // Also get and return the signed URL for download
      const track = await storage.getDubbedTrack(id);
      if (track?.audioKey) {
        const url = await r2StorageService.getSignedUrl(track.audioKey, 86400);
        res.json({ success: true, url });
      } else {
        res.json({ success: true });
      }
    } catch (error) {
      console.error("Error tracking download:", error);
      res.status(500).json({ error: "Failed to track download" });
    }
  });

  // Stream dubbed audio track (get signed URL for playback)
  app.get('/api/dubbed-tracks/:id/stream', async (req, res) => {
    try {
      const { id } = req.params;
      const track = await storage.getDubbedTrack(id);
      
      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }
      
      if (track.status !== 'completed') {
        return res.status(400).json({ error: "Track not ready" });
      }
      
      if (!track.audioKey) {
        return res.status(400).json({ error: "No audio file available" });
      }
      
      // Get signed URL for streaming (24 hours)
      const url = await r2StorageService.getSignedUrl(track.audioKey, 86400);
      res.json({ url, languageName: track.languageName, languageCode: track.languageCode });
    } catch (error) {
      console.error("Error streaming dubbed track:", error);
      res.status(500).json({ error: "Failed to get audio stream" });
    }
  });

  // Proxy endpoint for dubbed audio - bypasses CORS issues with direct R2 URLs
  // Uses https module for proper streaming without loading entire file into memory
  app.get('/api/stream-audio/:trackId', async (req, res) => {
    const https = await import('https');
    const http = await import('http');
    
    try {
      const { trackId } = req.params;
      const track = await storage.getDubbedTrack(trackId);
      
      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }
      
      if (track.status !== 'completed' || !track.audioKey) {
        return res.status(400).json({ error: "Audio not available" });
      }
      
      // Get signed URL from R2
      const signedUrl = await r2StorageService.getSignedUrl(track.audioKey, 3600);
      const url = new URL(signedUrl);
      
      // Build request headers
      const requestHeaders: Record<string, string> = {};
      const rangeHeader = req.headers.range;
      if (rangeHeader) {
        requestHeaders['Range'] = rangeHeader;
      }
      
      // Use https or http based on protocol
      const httpModule = url.protocol === 'https:' ? https : http;
      
      const proxyReq = httpModule.get(signedUrl, { headers: requestHeaders }, (proxyRes) => {
        // Forward status and headers
        res.status(proxyRes.statusCode || 200);
        
        const contentType = proxyRes.headers['content-type'] || 'audio/mpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        if (proxyRes.headers['content-length']) {
          res.setHeader('Content-Length', proxyRes.headers['content-length']);
        }
        
        if (proxyRes.headers['content-range']) {
          res.setHeader('Content-Range', proxyRes.headers['content-range']);
        }
        
        // Stream directly to response (no buffering)
        proxyRes.pipe(res);
      });
      
      proxyReq.on('error', (err) => {
        console.error('[AudioProxy] Request error:', err);
        if (!res.headersSent) {
          res.status(502).json({ error: "Failed to fetch audio from storage" });
        }
      });
      
      // Handle client disconnect
      req.on('close', () => {
        proxyReq.destroy();
      });
      
    } catch (error) {
      console.error("[AudioProxy] Error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Audio streaming failed" });
      }
    }
  });

  // Get quality metrics for a dubbed track
  app.get('/api/dubbed-tracks/:id/quality-metrics', async (req, res) => {
    try {
      const { id } = req.params;
      const metrics = await storage.getAudioQualityMetrics(id);
      if (!metrics) {
        return res.status(404).json({ error: "No quality metrics found" });
      }
      res.json(metrics);
    } catch (error) {
      console.error("Error getting quality metrics:", error);
      res.status(500).json({ error: "Failed to get quality metrics" });
    }
  });

  // Get user dubbing preferences
  app.get('/api/users/:userId/dubbing-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      if (req.user.id !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const prefs = await storage.getUserDubbingPreferences(userId);
      res.json(prefs || { userId, preferredLanguages: [], totalDubbedWatched: 0 });
    } catch (error) {
      console.error("Error getting user dubbing preferences:", error);
      res.status(500).json({ error: "Failed to get preferences" });
    }
  });

  // Update user dubbing preferences
  app.put('/api/users/:userId/dubbing-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      if (req.user.id !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      
      const existing = await storage.getUserDubbingPreferences(userId);
      if (existing) {
        const updated = await storage.updateUserDubbingPreferences(userId, req.body);
        res.json(updated);
      } else {
        const created = await storage.createUserDubbingPreferences({ userId, ...req.body });
        res.json(created);
      }
    } catch (error) {
      console.error("Error updating user dubbing preferences:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  // Record dubbing watch history
  app.post('/api/dubbing-watch-history', isAuthenticated, async (req: any, res) => {
    try {
      const { dubbedTrackId, movieId, watchDuration, totalMovieDuration, switchedToOriginal, switchTime, downloadedTrack } = req.body;
      const userId = req.user.id;
      
      const completionPercent = totalMovieDuration > 0 
        ? ((watchDuration / totalMovieDuration) * 100).toFixed(2)
        : '0.00';
      
      // Calculate implied satisfaction (0-5 scale based on behavior)
      let impliedSatisfaction = (parseFloat(completionPercent) / 100) * 4;
      if (switchedToOriginal) {
        impliedSatisfaction *= 0.7;
      }
      if (downloadedTrack) {
        impliedSatisfaction = Math.min(5, impliedSatisfaction + 0.5);
      }
      
      const result = await storage.createDubbingWatchHistory({
        userId,
        dubbedTrackId,
        movieId,
        watchDuration,
        totalMovieDuration,
        completionPercent,
        switchedToOriginal: switchedToOriginal ? 1 : 0,
        switchTime,
        downloadedTrack: downloadedTrack ? 1 : 0,
        impliedSatisfaction: impliedSatisfaction.toFixed(2)
      });
      
      // Update user preferences based on watch history
      const existing = await storage.getUserDubbingPreferences(userId);
      if (existing) {
        await storage.updateUserDubbingPreferences(userId, {
          totalDubbedWatched: existing.totalDubbedWatched + 1
        });
      } else {
        await storage.createUserDubbingPreferences({
          userId,
          totalDubbedWatched: 1
        });
      }
      
      res.json({ success: true, id: result.id });
    } catch (error) {
      console.error("Error recording dubbing watch history:", error);
      res.status(500).json({ error: "Failed to record watch history" });
    }
  });

  // Get user's dubbing watch history
  app.get('/api/users/:userId/dubbing-history', isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      if (req.user.id !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const history = await storage.getDubbingWatchHistory(userId);
      res.json(history);
    } catch (error) {
      console.error("Error getting dubbing history:", error);
      res.status(500).json({ error: "Failed to get history" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
