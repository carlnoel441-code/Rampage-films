import { 
  type User, 
  type UpsertUser,
  type Profile,
  type InsertProfile,
  type Movie, 
  type InsertMovie, 
  type UpdateMovie,
  type Watchlist,
  type InsertWatchlist,
  type WatchProgress,
  type InsertWatchProgress,
  type Notification,
  type InsertNotification,
  type GenreCount,
  type Collection,
  type InsertCollection,
  type UpdateCollection,
  type Review,
  type InsertReview,
  type UpdateReview,
  type FilmmakerAccount,
  type InsertFilmmakerAccount,
  type TipTransaction,
  type InsertTipTransaction,
  type Sponsor,
  type InsertSponsor,
  type SponsorshipPlacement,
  type InsertSponsorshipPlacement,
  type ReferralCode,
  type InsertReferralCode,
  type Referral,
  type InsertReferral,
  type NewsletterSubscription,
  type InsertNewsletterSubscription,
  type SocialShareCard,
  type InsertSocialShareCard,
  type DubbedAudioTrack,
  type InsertDubbedAudioTrack,
  type DubbingQualityRating,
  type InsertDubbingQualityRating,
  type AudioQualityMetrics,
  type InsertAudioQualityMetrics,
  type UserDubbingPreferences,
  type InsertUserDubbingPreferences
} from "@shared/schema";
import { db } from "@db";
import { 
  users, profiles, movies, watchlist, watchProgress, notifications, 
  collections, reviews, filmmakerAccounts, tipTransactions, sponsors, 
  sponsorshipPlacements, platformEarnings,
  referralCodes, referrals, newsletterSubscriptions, socialShareCards,
  dubbedAudioTracks, dubbingQualityRatings,
  audioQualityMetrics, userDubbingPreferences, dubbingWatchHistory
} from "@shared/schema";
import { eq, ilike, or, sql, desc, and, gt, asc, inArray, gte, lte } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  listUsers(): Promise<User[]>;
  
  getUserProfiles(userId: string): Promise<Profile[]>;
  getProfileById(profileId: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  deleteProfile(profileId: string): Promise<boolean>;
  createDefaultProfile(userId: string, userName: string): Promise<Profile>;
  
  getAllMovies(): Promise<Movie[]>;
  getMovieById(id: string): Promise<Movie | undefined>;
  getMovieByTitleAndYear(title: string, year: string): Promise<Movie | undefined>;
  getMoviesByGenre(genre: string): Promise<Movie[]>;
  getGenresWithCounts(): Promise<GenreCount[]>;
  searchMovies(query: string): Promise<Movie[]>;
  createMovie(movie: InsertMovie): Promise<Movie>;
  createMovieWithId(id: string, movie: InsertMovie): Promise<Movie>;
  updateMovie(movie: UpdateMovie): Promise<Movie | undefined>;
  deleteMovie(id: string): Promise<boolean>;
  seedMovies(movieList: InsertMovie[]): Promise<void>;
  bulkImportMovies(movieList: InsertMovie[]): Promise<{ imported: number; updated: number; movieIds: string[] }>;
  getTrendingMovies(limit?: number): Promise<Movie[]>;
  incrementViewCount(movieId: string): Promise<void>;
  
  addToWatchlist(userId: string, movieId: string): Promise<Watchlist>;
  removeFromWatchlist(userId: string, movieId: string): Promise<boolean>;
  getWatchlist(userId: string): Promise<Movie[]>;
  isInWatchlist(userId: string, movieId: string): Promise<boolean>;
  
  saveWatchProgress(userId: string, movieId: string, progressSeconds: number, duration: number): Promise<WatchProgress>;
  getWatchProgress(userId: string, movieId: string): Promise<WatchProgress | undefined>;
  getContinueWatching(userId: string, limit?: number): Promise<(WatchProgress & { movie: Movie })[]>;
  getWatchHistory(userId: string): Promise<WatchProgress[]>;
  
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string, limit?: number): Promise<Notification[]>;
  markNotificationAsRead(id: string): Promise<boolean>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  
  getAnalytics(): Promise<{
    totalUsers: number;
    newUsersToday: number;
    newUsersWeek: number;
    newUsersMonth: number;
    totalProfiles: number;
    totalMovies: number;
    totalViews: number;
    topMovies: Array<{ title: string; viewCount: number }>;
    userGrowth: Array<{ date: string; count: number }>;
    popularGenres: Array<{ genre: string; watchCount: number }>;
    peakViewingHours: Array<{ hour: number; watchCount: number }>;
    completionRate: number;
  }>;
  
  // Collections
  getAllCollections(): Promise<Collection[]>;
  getActiveCollections(): Promise<Collection[]>;
  getCollectionById(id: string): Promise<Collection | undefined>;
  getCollectionBySlug(slug: string): Promise<Collection | undefined>;
  createCollection(collection: InsertCollection): Promise<Collection>;
  updateCollection(collection: UpdateCollection): Promise<Collection | undefined>;
  deleteCollection(id: string): Promise<boolean>;
  getCollectionMovies(collectionId: string): Promise<Movie[]>;
  
  // Reviews
  getMovieReviews(movieId: string): Promise<(Review & { userName: string; profileName: string | null })[]>;
  getUserReview(userId: string, movieId: string): Promise<Review | undefined>;
  createReview(review: InsertReview): Promise<Review>;
  updateReview(review: UpdateReview): Promise<Review | undefined>;
  deleteReview(id: string): Promise<boolean>;
  getMovieAverageRating(movieId: string): Promise<{ average: number; count: number }>;
  flagReview(id: string): Promise<boolean>;
  approveReview(id: string): Promise<boolean>;
  getFlaggedReviews(): Promise<(Review & { userName: string; movieTitle: string })[]>;
  
  // Filmmaker Accounts
  getFilmmakerByUserId(userId: string): Promise<FilmmakerAccount | undefined>;
  getFilmmakerById(id: string): Promise<FilmmakerAccount | undefined>;
  getFilmmakerByStripeSubscriptionId(subscriptionId: string): Promise<FilmmakerAccount | undefined>;
  getAllFilmmakers(): Promise<FilmmakerAccount[]>;
  createFilmmaker(filmmaker: InsertFilmmakerAccount): Promise<FilmmakerAccount>;
  updateFilmmaker(id: string, data: Partial<InsertFilmmakerAccount>): Promise<FilmmakerAccount | undefined>;
  updateFilmmakerBalance(id: string, pendingAmount: number, totalAmount: number): Promise<void>;
  
  // Tip Transactions
  createTip(tip: InsertTipTransaction): Promise<TipTransaction>;
  getTipById(id: string): Promise<TipTransaction | undefined>;
  getTipsByFilmmaker(filmmakerId: string): Promise<TipTransaction[]>;
  getPlatformTips(): Promise<TipTransaction[]>;
  getRecentTips(limit?: number): Promise<TipTransaction[]>;
  updateTipStatus(id: string, status: string, chargeId?: string): Promise<TipTransaction | undefined>;
  updateTipTransaction(id: string, data: { status?: string; stripePaymentIntentId?: string }): Promise<TipTransaction | undefined>;
  getFilmmakerEarnings(filmmakerId: string): Promise<{ total: number; pending: number; paid: number }>;
  getPlatformEarningsTotal(): Promise<{ total: number; tips: number; sponsorShare: number }>;
  
  // Sponsors
  getAllSponsors(): Promise<Sponsor[]>;
  getActiveSponors(): Promise<Sponsor[]>;
  getSponsorById(id: string): Promise<Sponsor | undefined>;
  createSponsor(sponsor: InsertSponsor): Promise<Sponsor>;
  updateSponsor(id: string, data: Partial<InsertSponsor>): Promise<Sponsor | undefined>;
  deleteSponsor(id: string): Promise<boolean>;
  
  // Sponsorship Placements
  getAllPlacements(): Promise<SponsorshipPlacement[]>;
  getActivePlacements(): Promise<SponsorshipPlacement[]>;
  getPlacementsByType(placementType: string): Promise<SponsorshipPlacement[]>;
  getPlacementById(id: string): Promise<SponsorshipPlacement | undefined>;
  createPlacement(placement: InsertSponsorshipPlacement): Promise<SponsorshipPlacement>;
  updatePlacement(id: string, data: Partial<InsertSponsorshipPlacement>): Promise<SponsorshipPlacement | undefined>;
  deletePlacement(id: string): Promise<boolean>;
  incrementPlacementImpressions(id: string): Promise<void>;
  incrementPlacementClicks(id: string): Promise<void>;
  
  // Referral System
  getReferralCodeByOwner(ownerType: string, ownerId: string): Promise<ReferralCode | undefined>;
  getReferralCodeByCode(code: string): Promise<ReferralCode | undefined>;
  createReferralCode(data: InsertReferralCode): Promise<ReferralCode>;
  incrementReferralCount(codeId: string): Promise<void>;
  createReferral(data: InsertReferral): Promise<Referral>;
  getReferralsByCode(codeId: string): Promise<Referral[]>;
  getReferralStats(ownerId: string, ownerType: string): Promise<{ totalReferrals: number; qualifiedReferrals: number; totalEarned: number }>;
  
  // Newsletter
  subscribeNewsletter(data: InsertNewsletterSubscription): Promise<NewsletterSubscription>;
  unsubscribeNewsletter(email: string): Promise<boolean>;
  getNewsletterSubscription(email: string): Promise<NewsletterSubscription | undefined>;
  getActiveSubscribers(): Promise<NewsletterSubscription[]>;
  
  // Social Share Cards
  getShareCardsByMovie(movieId: string): Promise<SocialShareCard[]>;
  createShareCard(data: InsertSocialShareCard): Promise<SocialShareCard>;
  incrementShareCount(cardId: string): Promise<void>;
  
  // Dubbed Audio Tracks
  getDubbedTracksByMovie(movieId: string): Promise<DubbedAudioTrack[]>;
  getDubbedTrack(id: string): Promise<DubbedAudioTrack | undefined>;
  getDubbedTrackByMovieAndLanguage(movieId: string, languageCode: string): Promise<DubbedAudioTrack | undefined>;
  getAllDubbedTracks(): Promise<DubbedAudioTrack[]>;
  createDubbedTrack(track: InsertDubbedAudioTrack): Promise<DubbedAudioTrack>;
  updateDubbedTrack(id: string, data: Partial<InsertDubbedAudioTrack>): Promise<DubbedAudioTrack | undefined>;
  deleteDubbedTrack(id: string): Promise<boolean>;
  incrementDownloadCount(id: string): Promise<void>;
  
  // Dubbing Quality Ratings
  getDubbingRating(userId: string, trackId: string): Promise<DubbingQualityRating | undefined>;
  getDubbingRatingsByTrack(trackId: string): Promise<DubbingQualityRating[]>;
  createDubbingRating(rating: InsertDubbingQualityRating): Promise<DubbingQualityRating>;
  updateDubbingRating(id: string, data: Partial<InsertDubbingQualityRating>): Promise<DubbingQualityRating | undefined>;
  updateAverageRating(trackId: string): Promise<void>;
  
  // Audio Quality Metrics (automated testing)
  getAudioQualityMetrics(dubbedTrackId: string): Promise<AudioQualityMetrics | undefined>;
  createAudioQualityMetrics(metrics: InsertAudioQualityMetrics): Promise<AudioQualityMetrics>;
  
  // User Dubbing Preferences (ML learning)
  getUserDubbingPreferences(userId: string): Promise<UserDubbingPreferences | undefined>;
  createUserDubbingPreferences(prefs: InsertUserDubbingPreferences): Promise<UserDubbingPreferences>;
  updateUserDubbingPreferences(userId: string, data: Partial<InsertUserDubbingPreferences>): Promise<UserDubbingPreferences | undefined>;
  
  // Dubbing Watch History (tracking)
  getDubbingWatchHistory(userId: string): Promise<Array<{ id: string; dubbedTrackId: string; movieId: string; watchDuration: number | null; completionPercent: string | null; switchedToOriginal: number; watchedAt: Date }>>;
  createDubbingWatchHistory(data: { userId: string; dubbedTrackId: string; movieId: string; watchDuration?: number; totalMovieDuration?: number; completionPercent?: string; switchedToOriginal?: number; switchTime?: number; downloadedTrack?: number; impliedSatisfaction?: string }): Promise<{ id: string }>;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async listUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUserProfiles(userId: string): Promise<Profile[]> {
    return await db.select().from(profiles).where(eq(profiles.userId, userId));
  }

  async getProfileById(profileId: string): Promise<Profile | undefined> {
    const result = await db.select().from(profiles).where(eq(profiles.id, profileId));
    return result[0];
  }

  async createProfile(profileData: InsertProfile): Promise<Profile> {
    const result = await db.insert(profiles).values(profileData).returning();
    return result[0];
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    const result = await db.delete(profiles).where(eq(profiles.id, profileId)).returning();
    return result.length > 0;
  }

  async createDefaultProfile(userId: string, userName: string): Promise<Profile> {
    // Sanitize: trim, remove control/non-printable chars, fallback to default
    const sanitized = (userName || "")
      .trim()
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
      .trim() || "My Profile";
    
    // Truncate to 50 characters to match schema constraint
    const profileName = sanitized.slice(0, 50);
    return this.createProfile({
      userId,
      name: profileName,
      isKidsProfile: 0,
    });
  }

  async getAllMovies(): Promise<Movie[]> {
    return await db.select().from(movies);
  }

  async getMovieById(id: string): Promise<Movie | undefined> {
    const result = await db.select().from(movies).where(eq(movies.id, id));
    return result[0];
  }

  async getMovieByTitleAndYear(title: string, year: string): Promise<Movie | undefined> {
    const result = await db.select().from(movies).where(
      sql`${movies.title} = ${title} AND ${movies.year} = ${year}`
    );
    return result[0];
  }

  async getMoviesByGenre(genre: string): Promise<Movie[]> {
    return await db.select().from(movies).where(
      sql`${genre} = ANY(${movies.genres})`
    );
  }

  async getGenresWithCounts(): Promise<GenreCount[]> {
    const result = await db.execute<{ genre: string; count: number }>(sql`
      SELECT 
        genre, 
        COUNT(*) as count
      FROM 
        ${movies},
        UNNEST(${movies.genres}) as genre
      GROUP BY genre
      ORDER BY genre ASC
    `);
    
    return result.rows.map(row => ({
      name: row.genre,
      count: Number(row.count)
    }));
  }

  async searchMovies(query: string): Promise<Movie[]> {
    if (!query || !query.trim()) {
      return [];
    }
    
    const searchPattern = `%${query.trim()}%`;
    return await db.select().from(movies).where(
      or(
        ilike(movies.title, searchPattern),
        ilike(movies.description, searchPattern),
        ilike(movies.director, searchPattern),
        sql`EXISTS (SELECT 1 FROM UNNEST(${movies.genres}) g WHERE g ILIKE ${searchPattern})`,
        sql`EXISTS (SELECT 1 FROM UNNEST(${movies.cast}) c WHERE c ILIKE ${searchPattern})`
      )
    );
  }

  async createMovie(movie: InsertMovie): Promise<Movie> {
    const result = await db.insert(movies).values(movie).returning();
    return result[0];
  }

  async createMovieWithId(id: string, movie: InsertMovie): Promise<Movie> {
    const result = await db.insert(movies).values({ ...movie, id }).returning();
    return result[0];
  }

  async updateMovie(movie: UpdateMovie): Promise<Movie | undefined> {
    const { id, ...updateData } = movie;
    const result = await db.update(movies)
      .set(updateData)
      .where(eq(movies.id, id))
      .returning();
    return result[0];
  }

  async deleteMovie(id: string): Promise<boolean> {
    const result = await db.delete(movies).where(eq(movies.id, id)).returning();
    return result.length > 0;
  }

  async seedMovies(movieList: InsertMovie[]): Promise<void> {
    const existingMovies = await this.getAllMovies();
    if (existingMovies.length === 0) {
      await db.insert(movies).values(movieList);
    }
  }

  async bulkImportMovies(movieList: InsertMovie[]): Promise<{ imported: number; updated: number; movieIds: string[] }> {
    if (movieList.length === 0) {
      return { imported: 0, updated: 0, movieIds: [] };
    }

    const existingMoviesBeforeImport = await this.getAllMovies();
    const existingTitleYears = new Set(
      existingMoviesBeforeImport.map(m => `${m.title}|${m.year}`)
    );

    const result = await db.insert(movies)
      .values(movieList)
      .onConflictDoUpdate({
        target: [movies.title, movies.year],
        set: {
          description: sql`excluded.description`,
          rating: sql`excluded.rating`,
          genres: sql`excluded.genres`,
          poster: sql`excluded.poster`,
          backdrop: sql`excluded.backdrop`,
          videoUrl: sql`excluded.video_url`,
          duration: sql`excluded.duration`,
          director: sql`excluded.director`,
          cast: sql`excluded.cast`,
        },
      })
      .returning({ id: movies.id });

    const updatedCount = movieList.filter(m => 
      existingTitleYears.has(`${m.title}|${m.year}`)
    ).length;
    const importedCount = movieList.length - updatedCount;
    const movieIds = result.map(r => r.id);

    return { imported: importedCount, updated: updatedCount, movieIds };
  }

  async getTrendingMovies(limit: number = 10): Promise<Movie[]> {
    return await db
      .select()
      .from(movies)
      .orderBy(desc(movies.viewCount))
      .limit(limit);
  }

  async incrementViewCount(movieId: string): Promise<void> {
    await db
      .update(movies)
      .set({ viewCount: sql`${movies.viewCount} + 1` })
      .where(eq(movies.id, movieId));
  }

  async addToWatchlist(userId: string, movieId: string): Promise<Watchlist> {
    const [result] = await db
      .insert(watchlist)
      .values({ userId, movieId })
      .onConflictDoNothing()
      .returning();
    return result;
  }

  async removeFromWatchlist(userId: string, movieId: string): Promise<boolean> {
    const result = await db
      .delete(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.movieId, movieId)))
      .returning();
    return result.length > 0;
  }

  async getWatchlist(userId: string): Promise<Movie[]> {
    const results = await db
      .select({ movie: movies })
      .from(watchlist)
      .innerJoin(movies, eq(watchlist.movieId, movies.id))
      .where(eq(watchlist.userId, userId))
      .orderBy(desc(watchlist.addedAt));
    return results.map(r => r.movie);
  }

  async isInWatchlist(userId: string, movieId: string): Promise<boolean> {
    const result = await db
      .select()
      .from(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.movieId, movieId)))
      .limit(1);
    return result.length > 0;
  }

  async saveWatchProgress(
    userId: string, 
    movieId: string, 
    progressSeconds: number, 
    duration: number
  ): Promise<WatchProgress> {
    const completed = progressSeconds >= duration * 0.9 ? 1 : 0;
    
    const [result] = await db
      .insert(watchProgress)
      .values({ 
        userId, 
        movieId, 
        progressSeconds, 
        duration,
        completed,
        lastWatched: new Date()
      })
      .onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.movieId],
        set: {
          progressSeconds,
          duration,
          completed,
          lastWatched: new Date()
        }
      })
      .returning();
    return result;
  }

  async getWatchProgress(userId: string, movieId: string): Promise<WatchProgress | undefined> {
    const result = await db
      .select()
      .from(watchProgress)
      .where(and(eq(watchProgress.userId, userId), eq(watchProgress.movieId, movieId)))
      .limit(1);
    return result[0];
  }

  async getContinueWatching(userId: string, limit: number = 10): Promise<(WatchProgress & { movie: Movie })[]> {
    const results = await db
      .select()
      .from(watchProgress)
      .innerJoin(movies, eq(watchProgress.movieId, movies.id))
      .where(
        and(
          eq(watchProgress.userId, userId),
          eq(watchProgress.completed, 0),
          gt(watchProgress.progressSeconds, 30)
        )
      )
      .orderBy(desc(watchProgress.lastWatched))
      .limit(limit);

    return results.map(r => ({ ...r.watch_progress, movie: r.movies }));
  }

  async getWatchHistory(userId: string): Promise<WatchProgress[]> {
    return await db
      .select()
      .from(watchProgress)
      .where(eq(watchProgress.userId, userId))
      .orderBy(desc(watchProgress.lastWatched));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [result] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return result;
  }

  async getUserNotifications(userId: string, limit: number = 20): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async markNotificationAsRead(id: string): Promise<boolean> {
    const result = await db
      .update(notifications)
      .set({ read: 1 })
      .where(eq(notifications.id, id))
      .returning();
    return result.length > 0;
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, 0)));
    return Number(result[0]?.count || 0);
  }

  async getAnalytics() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    // Total counts
    const [totalUsersResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users);
    const totalUsers = Number(totalUsersResult?.count || 0);

    const [newUsersTodayResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(sql`${users.createdAt} >= ${today}`);
    const newUsersToday = Number(newUsersTodayResult?.count || 0);

    const [newUsersWeekResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(sql`${users.createdAt} >= ${weekAgo}`);
    const newUsersWeek = Number(newUsersWeekResult?.count || 0);

    const [newUsersMonthResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(sql`${users.createdAt} >= ${monthAgo}`);
    const newUsersMonth = Number(newUsersMonthResult?.count || 0);

    const [totalProfilesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(profiles);
    const totalProfiles = Number(totalProfilesResult?.count || 0);

    const [totalMoviesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(movies);
    const totalMovies = Number(totalMoviesResult?.count || 0);

    const [totalViewsResult] = await db
      .select({ total: sql<number>`sum(${movies.viewCount})` })
      .from(movies);
    const totalViews = Number(totalViewsResult?.total || 0);

    // Top 5 movies by views
    const topMoviesData = await db
      .select({ 
        title: movies.title, 
        viewCount: movies.viewCount 
      })
      .from(movies)
      .orderBy(desc(movies.viewCount))
      .limit(5);

    // User growth over last 30 days
    const userGrowthData = await db
      .select({
        date: sql<string>`date(${users.createdAt})`,
        count: sql<number>`count(*)`
      })
      .from(users)
      .where(sql`${users.createdAt} >= ${monthAgo}`)
      .groupBy(sql`date(${users.createdAt})`)
      .orderBy(sql`date(${users.createdAt})`);

    // Popular genres by watch count (SQL aggregation)
    const genreQuery = await db.execute(
      sql.raw(`
        SELECT unnest(m.genres) as genre, COUNT(*) as watch_count
        FROM movies m
        INNER JOIN watch_progress wp ON m.id = wp.movie_id
        GROUP BY genre
        ORDER BY watch_count DESC
        LIMIT 5
      `)
    );
    
    const popularGenres = (genreQuery.rows || []).map((row: any) => ({
      genre: row.genre || '',
      watchCount: Number(row.watch_count || 0)
    }));

    // Peak viewing hours (SQL aggregation)
    const hourQuery = await db.execute(
      sql.raw(`
        SELECT EXTRACT(HOUR FROM last_watched)::integer as hour, COUNT(*) as watch_count
        FROM watch_progress
        WHERE last_watched IS NOT NULL
        GROUP BY hour
        ORDER BY watch_count DESC
        LIMIT 5
      `)
    );
    
    const peakViewingHours = (hourQuery.rows || []).map((row: any) => ({
      hour: Number(row.hour || 0),
      watchCount: Number(row.watch_count || 0)
    }));

    // Completion rate
    const [completedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(watchProgress)
      .where(eq(watchProgress.completed, 1));
    
    const [totalWatches] = await db
      .select({ count: sql<number>`count(*)` })
      .from(watchProgress);
    
    const completionRate = totalWatches?.count ? 
      Math.round((Number(completedCount?.count || 0) / Number(totalWatches?.count)) * 100) : 0;

    return {
      totalUsers,
      newUsersToday,
      newUsersWeek,
      newUsersMonth,
      totalProfiles,
      totalMovies,
      totalViews,
      topMovies: topMoviesData.map(m => ({ 
        title: m.title, 
        viewCount: m.viewCount || 0 
      })),
      userGrowth: userGrowthData.map(g => ({ 
        date: g.date, 
        count: Number(g.count) 
      })),
      popularGenres,
      peakViewingHours,
      completionRate
    };
  }

  // Collections implementation
  async getAllCollections(): Promise<Collection[]> {
    return await db.select().from(collections).orderBy(asc(collections.displayOrder));
  }

  async getActiveCollections(): Promise<Collection[]> {
    return await db
      .select()
      .from(collections)
      .where(eq(collections.isActive, 1))
      .orderBy(asc(collections.displayOrder));
  }

  async getCollectionById(id: string): Promise<Collection | undefined> {
    const result = await db.select().from(collections).where(eq(collections.id, id));
    return result[0];
  }

  async getCollectionBySlug(slug: string): Promise<Collection | undefined> {
    const result = await db.select().from(collections).where(eq(collections.slug, slug));
    return result[0];
  }

  async createCollection(collection: InsertCollection): Promise<Collection> {
    const [result] = await db.insert(collections).values(collection).returning();
    return result;
  }

  async updateCollection(collection: UpdateCollection): Promise<Collection | undefined> {
    const { id, ...updateData } = collection;
    const [result] = await db
      .update(collections)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(collections.id, id))
      .returning();
    return result;
  }

  async deleteCollection(id: string): Promise<boolean> {
    const result = await db.delete(collections).where(eq(collections.id, id)).returning();
    return result.length > 0;
  }

  async getCollectionMovies(collectionId: string): Promise<Movie[]> {
    const collection = await this.getCollectionById(collectionId);
    if (!collection || !collection.movieIds || collection.movieIds.length === 0) {
      return [];
    }
    
    const movieResults = await db
      .select()
      .from(movies)
      .where(inArray(movies.id, collection.movieIds));
    
    // Preserve the order from movieIds array
    const movieMap = new Map(movieResults.map(m => [m.id, m]));
    return collection.movieIds
      .map(id => movieMap.get(id))
      .filter((m): m is Movie => m !== undefined);
  }

  // Reviews implementation
  async getMovieReviews(movieId: string): Promise<(Review & { userName: string; profileName: string | null })[]> {
    const results = await db
      .select({
        review: reviews,
        userName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, 'Anonymous')`,
        profileName: profiles.name
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .leftJoin(profiles, eq(reviews.profileId, profiles.id))
      .where(and(eq(reviews.movieId, movieId), eq(reviews.isApproved, 1)))
      .orderBy(desc(reviews.createdAt));
    
    return results.map(r => ({
      ...r.review,
      userName: r.userName || 'Anonymous',
      profileName: r.profileName
    }));
  }

  async getUserReview(userId: string, movieId: string): Promise<Review | undefined> {
    const result = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.movieId, movieId)));
    return result[0];
  }

  async createReview(review: InsertReview): Promise<Review> {
    const [result] = await db
      .insert(reviews)
      .values(review)
      .onConflictDoUpdate({
        target: [reviews.userId, reviews.movieId],
        set: {
          rating: review.rating,
          review: review.review,
          updatedAt: new Date()
        }
      })
      .returning();
    return result;
  }

  async updateReview(review: UpdateReview): Promise<Review | undefined> {
    const { id, ...updateData } = review;
    const [result] = await db
      .update(reviews)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(reviews.id, id))
      .returning();
    return result;
  }

  async deleteReview(id: string): Promise<boolean> {
    const result = await db.delete(reviews).where(eq(reviews.id, id)).returning();
    return result.length > 0;
  }

  async getMovieAverageRating(movieId: string): Promise<{ average: number; count: number }> {
    const result = await db
      .select({
        average: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`,
        count: sql<number>`COUNT(*)`
      })
      .from(reviews)
      .where(and(eq(reviews.movieId, movieId), eq(reviews.isApproved, 1)));
    
    return {
      average: Math.round((Number(result[0]?.average) || 0) * 10) / 10,
      count: Number(result[0]?.count) || 0
    };
  }

  async flagReview(id: string): Promise<boolean> {
    const result = await db
      .update(reviews)
      .set({ isFlagged: 1, updatedAt: new Date() })
      .where(eq(reviews.id, id))
      .returning();
    return result.length > 0;
  }

  async approveReview(id: string): Promise<boolean> {
    const result = await db
      .update(reviews)
      .set({ isApproved: 1, isFlagged: 0, updatedAt: new Date() })
      .where(eq(reviews.id, id))
      .returning();
    return result.length > 0;
  }

  async getFlaggedReviews(): Promise<(Review & { userName: string; movieTitle: string })[]> {
    const results = await db
      .select({
        review: reviews,
        userName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, 'Anonymous')`,
        movieTitle: movies.title
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .leftJoin(movies, eq(reviews.movieId, movies.id))
      .where(eq(reviews.isFlagged, 1))
      .orderBy(desc(reviews.updatedAt));
    
    return results.map(r => ({
      ...r.review,
      userName: r.userName || 'Anonymous',
      movieTitle: r.movieTitle || 'Unknown'
    }));
  }

  // Filmmaker Accounts
  async getFilmmakerByUserId(userId: string): Promise<FilmmakerAccount | undefined> {
    const result = await db.select().from(filmmakerAccounts).where(eq(filmmakerAccounts.userId, userId));
    return result[0];
  }

  async getFilmmakerById(id: string): Promise<FilmmakerAccount | undefined> {
    const result = await db.select().from(filmmakerAccounts).where(eq(filmmakerAccounts.id, id));
    return result[0];
  }

  async getFilmmakerByStripeSubscriptionId(subscriptionId: string): Promise<FilmmakerAccount | undefined> {
    const result = await db.select().from(filmmakerAccounts).where(eq(filmmakerAccounts.stripeSubscriptionId, subscriptionId));
    return result[0];
  }

  async getAllFilmmakers(): Promise<FilmmakerAccount[]> {
    return await db.select().from(filmmakerAccounts).orderBy(desc(filmmakerAccounts.createdAt));
  }

  async createFilmmaker(filmmaker: InsertFilmmakerAccount): Promise<FilmmakerAccount> {
    const [result] = await db.insert(filmmakerAccounts).values(filmmaker).returning();
    return result;
  }

  async updateFilmmaker(id: string, data: Partial<InsertFilmmakerAccount>): Promise<FilmmakerAccount | undefined> {
    const [result] = await db
      .update(filmmakerAccounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(filmmakerAccounts.id, id))
      .returning();
    return result;
  }

  async updateFilmmakerBalance(id: string, pendingAmount: number, totalAmount: number): Promise<void> {
    await db
      .update(filmmakerAccounts)
      .set({
        pendingBalance: sql`${filmmakerAccounts.pendingBalance} + ${pendingAmount.toFixed(2)}`,
        totalEarnings: sql`${filmmakerAccounts.totalEarnings} + ${totalAmount.toFixed(2)}`,
        updatedAt: new Date()
      })
      .where(eq(filmmakerAccounts.id, id));
  }

  // Tip Transactions
  async createTip(tip: InsertTipTransaction): Promise<TipTransaction> {
    const [result] = await db.insert(tipTransactions).values(tip).returning();
    return result;
  }

  async getTipById(id: string): Promise<TipTransaction | undefined> {
    const result = await db.select().from(tipTransactions).where(eq(tipTransactions.id, id));
    return result[0];
  }

  async getTipsByFilmmaker(filmmakerId: string): Promise<TipTransaction[]> {
    return await db
      .select()
      .from(tipTransactions)
      .where(eq(tipTransactions.filmmakerId, filmmakerId))
      .orderBy(desc(tipTransactions.createdAt));
  }

  async getPlatformTips(): Promise<TipTransaction[]> {
    return await db
      .select()
      .from(tipTransactions)
      .where(eq(tipTransactions.tipType, 'platform_support'))
      .orderBy(desc(tipTransactions.createdAt));
  }

  async getRecentTips(limit: number = 20): Promise<TipTransaction[]> {
    return await db
      .select()
      .from(tipTransactions)
      .where(eq(tipTransactions.status, 'completed'))
      .orderBy(desc(tipTransactions.createdAt))
      .limit(limit);
  }

  async updateTipStatus(id: string, status: string, chargeId?: string): Promise<TipTransaction | undefined> {
    const updateData: any = { status };
    if (chargeId) updateData.stripeChargeId = chargeId;
    if (status === 'completed') updateData.completedAt = new Date();
    
    const [result] = await db
      .update(tipTransactions)
      .set(updateData)
      .where(eq(tipTransactions.id, id))
      .returning();
    return result;
  }

  async updateTipTransaction(id: string, data: { status?: string; stripePaymentIntentId?: string }): Promise<TipTransaction | undefined> {
    const updateData: any = {};
    if (data.status) {
      updateData.status = data.status;
      if (data.status === 'completed') updateData.completedAt = new Date();
    }
    if (data.stripePaymentIntentId) {
      updateData.stripePaymentIntentId = data.stripePaymentIntentId;
    }
    
    const [result] = await db
      .update(tipTransactions)
      .set(updateData)
      .where(eq(tipTransactions.id, id))
      .returning();
    return result;
  }

  async getFilmmakerEarnings(filmmakerId: string): Promise<{ total: number; pending: number; paid: number }> {
    const filmmaker = await this.getFilmmakerById(filmmakerId);
    if (!filmmaker) return { total: 0, pending: 0, paid: 0 };
    
    const total = parseFloat(filmmaker.totalEarnings) || 0;
    const pending = parseFloat(filmmaker.pendingBalance) || 0;
    return { total, pending, paid: total - pending };
  }

  async getPlatformEarningsTotal(): Promise<{ total: number; tips: number; sponsorShare: number }> {
    const [platformTips] = await db
      .select({ sum: sql<number>`COALESCE(SUM(${tipTransactions.grossAmountCents}), 0)` })
      .from(tipTransactions)
      .where(and(
        eq(tipTransactions.tipType, 'platform_support'),
        eq(tipTransactions.status, 'completed')
      ));
    
    const [platformShare] = await db
      .select({ sum: sql<number>`COALESCE(SUM(${tipTransactions.platformShareCents}), 0)` })
      .from(tipTransactions)
      .where(and(
        eq(tipTransactions.tipType, 'filmmaker_split'),
        eq(tipTransactions.status, 'completed')
      ));
    
    const tips = Number(platformTips?.sum || 0) / 100;
    const sponsorShare = Number(platformShare?.sum || 0) / 100;
    return { total: tips + sponsorShare, tips, sponsorShare };
  }

  // Sponsors
  async getAllSponsors(): Promise<Sponsor[]> {
    return await db.select().from(sponsors).orderBy(desc(sponsors.createdAt));
  }

  async getActiveSponors(): Promise<Sponsor[]> {
    return await db.select().from(sponsors).where(eq(sponsors.isActive, 1)).orderBy(sponsors.name);
  }

  async getSponsorById(id: string): Promise<Sponsor | undefined> {
    const result = await db.select().from(sponsors).where(eq(sponsors.id, id));
    return result[0];
  }

  async createSponsor(sponsor: InsertSponsor): Promise<Sponsor> {
    const [result] = await db.insert(sponsors).values(sponsor).returning();
    return result;
  }

  async updateSponsor(id: string, data: Partial<InsertSponsor>): Promise<Sponsor | undefined> {
    const [result] = await db
      .update(sponsors)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sponsors.id, id))
      .returning();
    return result;
  }

  async deleteSponsor(id: string): Promise<boolean> {
    const result = await db.delete(sponsors).where(eq(sponsors.id, id)).returning();
    return result.length > 0;
  }

  // Sponsorship Placements
  async getAllPlacements(): Promise<SponsorshipPlacement[]> {
    return await db.select().from(sponsorshipPlacements).orderBy(desc(sponsorshipPlacements.createdAt));
  }

  async getActivePlacements(): Promise<SponsorshipPlacement[]> {
    const now = new Date();
    return await db
      .select()
      .from(sponsorshipPlacements)
      .where(and(
        eq(sponsorshipPlacements.isActive, 1),
        lte(sponsorshipPlacements.startDate, now),
        or(
          sql`${sponsorshipPlacements.endDate} IS NULL`,
          gte(sponsorshipPlacements.endDate, now)
        )
      ))
      .orderBy(desc(sponsorshipPlacements.priority));
  }

  async getPlacementsByType(placementType: string): Promise<SponsorshipPlacement[]> {
    const now = new Date();
    return await db
      .select()
      .from(sponsorshipPlacements)
      .where(and(
        eq(sponsorshipPlacements.placementType, placementType),
        eq(sponsorshipPlacements.isActive, 1),
        lte(sponsorshipPlacements.startDate, now),
        or(
          sql`${sponsorshipPlacements.endDate} IS NULL`,
          gte(sponsorshipPlacements.endDate, now)
        )
      ))
      .orderBy(desc(sponsorshipPlacements.priority));
  }

  async getPlacementById(id: string): Promise<SponsorshipPlacement | undefined> {
    const result = await db.select().from(sponsorshipPlacements).where(eq(sponsorshipPlacements.id, id));
    return result[0];
  }

  async createPlacement(placement: InsertSponsorshipPlacement): Promise<SponsorshipPlacement> {
    const [result] = await db.insert(sponsorshipPlacements).values(placement).returning();
    return result;
  }

  async updatePlacement(id: string, data: Partial<InsertSponsorshipPlacement>): Promise<SponsorshipPlacement | undefined> {
    const [result] = await db
      .update(sponsorshipPlacements)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sponsorshipPlacements.id, id))
      .returning();
    return result;
  }

  async deletePlacement(id: string): Promise<boolean> {
    const result = await db.delete(sponsorshipPlacements).where(eq(sponsorshipPlacements.id, id)).returning();
    return result.length > 0;
  }

  async incrementPlacementImpressions(id: string): Promise<void> {
    await db
      .update(sponsorshipPlacements)
      .set({ impressionCount: sql`${sponsorshipPlacements.impressionCount} + 1` })
      .where(eq(sponsorshipPlacements.id, id));
  }

  async incrementPlacementClicks(id: string): Promise<void> {
    await db
      .update(sponsorshipPlacements)
      .set({ clickCount: sql`${sponsorshipPlacements.clickCount} + 1` })
      .where(eq(sponsorshipPlacements.id, id));
  }

  // Referral System
  async getReferralCodeByOwner(ownerType: string, ownerId: string): Promise<ReferralCode | undefined> {
    const result = await db
      .select()
      .from(referralCodes)
      .where(and(
        eq(referralCodes.ownerType, ownerType),
        eq(referralCodes.ownerId, ownerId)
      ));
    return result[0];
  }

  async getReferralCodeByCode(code: string): Promise<ReferralCode | undefined> {
    const result = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.code, code.toUpperCase()));
    return result[0];
  }

  async createReferralCode(data: InsertReferralCode): Promise<ReferralCode> {
    const [result] = await db.insert(referralCodes).values({
      ...data,
      code: data.code.toUpperCase()
    }).returning();
    return result;
  }

  async incrementReferralCount(codeId: string): Promise<void> {
    await db
      .update(referralCodes)
      .set({ totalReferrals: sql`${referralCodes.totalReferrals} + 1` })
      .where(eq(referralCodes.id, codeId));
  }

  async createReferral(data: InsertReferral): Promise<Referral> {
    const [result] = await db.insert(referrals).values(data).returning();
    return result;
  }

  async getReferralsByCode(codeId: string): Promise<Referral[]> {
    return await db
      .select()
      .from(referrals)
      .where(eq(referrals.referralCodeId, codeId))
      .orderBy(desc(referrals.createdAt));
  }

  async getReferralStats(ownerId: string, ownerType: string): Promise<{ totalReferrals: number; qualifiedReferrals: number; totalEarned: number }> {
    const code = await this.getReferralCodeByOwner(ownerType, ownerId);
    if (!code) {
      return { totalReferrals: 0, qualifiedReferrals: 0, totalEarned: 0 };
    }
    
    const allReferrals = await this.getReferralsByCode(code.id);
    const qualified = allReferrals.filter(r => r.status === 'qualified' || r.status === 'rewarded');
    const totalEarned = allReferrals.reduce((sum, r) => sum + (r.rewardAmountCents || 0), 0);
    
    return {
      totalReferrals: allReferrals.length,
      qualifiedReferrals: qualified.length,
      totalEarned
    };
  }

  // Newsletter
  async subscribeNewsletter(data: InsertNewsletterSubscription): Promise<NewsletterSubscription> {
    const [result] = await db
      .insert(newsletterSubscriptions)
      .values(data)
      .onConflictDoUpdate({
        target: newsletterSubscriptions.email,
        set: {
          isActive: 1,
          genres: data.genres,
          frequency: data.frequency,
          unsubscribedAt: null
        }
      })
      .returning();
    return result;
  }

  async unsubscribeNewsletter(email: string): Promise<boolean> {
    const result = await db
      .update(newsletterSubscriptions)
      .set({ isActive: 0, unsubscribedAt: new Date() })
      .where(eq(newsletterSubscriptions.email, email))
      .returning();
    return result.length > 0;
  }

  async getNewsletterSubscription(email: string): Promise<NewsletterSubscription | undefined> {
    const result = await db
      .select()
      .from(newsletterSubscriptions)
      .where(eq(newsletterSubscriptions.email, email));
    return result[0];
  }

  async getActiveSubscribers(): Promise<NewsletterSubscription[]> {
    return await db
      .select()
      .from(newsletterSubscriptions)
      .where(eq(newsletterSubscriptions.isActive, 1));
  }

  // Social Share Cards
  async getShareCardsByMovie(movieId: string): Promise<SocialShareCard[]> {
    return await db
      .select()
      .from(socialShareCards)
      .where(eq(socialShareCards.movieId, movieId));
  }

  async createShareCard(data: InsertSocialShareCard): Promise<SocialShareCard> {
    const [result] = await db.insert(socialShareCards).values(data).returning();
    return result;
  }

  async incrementShareCount(cardId: string): Promise<void> {
    await db
      .update(socialShareCards)
      .set({ shareCount: sql`${socialShareCards.shareCount} + 1` })
      .where(eq(socialShareCards.id, cardId));
  }

  // Dubbed Audio Tracks
  async getDubbedTracksByMovie(movieId: string): Promise<DubbedAudioTrack[]> {
    return await db
      .select()
      .from(dubbedAudioTracks)
      .where(eq(dubbedAudioTracks.movieId, movieId))
      .orderBy(asc(dubbedAudioTracks.languageName));
  }

  async getDubbedTrack(id: string): Promise<DubbedAudioTrack | undefined> {
    const result = await db
      .select()
      .from(dubbedAudioTracks)
      .where(eq(dubbedAudioTracks.id, id));
    return result[0];
  }

  async getDubbedTrackByMovieAndLanguage(movieId: string, languageCode: string): Promise<DubbedAudioTrack | undefined> {
    const result = await db
      .select()
      .from(dubbedAudioTracks)
      .where(and(
        eq(dubbedAudioTracks.movieId, movieId),
        eq(dubbedAudioTracks.languageCode, languageCode)
      ));
    return result[0];
  }

  async getAllDubbedTracks(): Promise<DubbedAudioTrack[]> {
    return await db
      .select()
      .from(dubbedAudioTracks)
      .orderBy(desc(dubbedAudioTracks.createdAt));
  }

  async createDubbedTrack(track: InsertDubbedAudioTrack): Promise<DubbedAudioTrack> {
    const [result] = await db
      .insert(dubbedAudioTracks)
      .values(track)
      .returning();
    return result;
  }

  async updateDubbedTrack(id: string, data: Partial<InsertDubbedAudioTrack>): Promise<DubbedAudioTrack | undefined> {
    const [result] = await db
      .update(dubbedAudioTracks)
      .set(data)
      .where(eq(dubbedAudioTracks.id, id))
      .returning();
    return result;
  }

  async deleteDubbedTrack(id: string): Promise<boolean> {
    const result = await db
      .delete(dubbedAudioTracks)
      .where(eq(dubbedAudioTracks.id, id))
      .returning();
    return result.length > 0;
  }

  async incrementDownloadCount(id: string): Promise<void> {
    await db
      .update(dubbedAudioTracks)
      .set({ downloadCount: sql`${dubbedAudioTracks.downloadCount} + 1` })
      .where(eq(dubbedAudioTracks.id, id));
  }

  // Dubbing Quality Ratings
  async getDubbingRating(userId: string, trackId: string): Promise<DubbingQualityRating | undefined> {
    const result = await db
      .select()
      .from(dubbingQualityRatings)
      .where(and(
        eq(dubbingQualityRatings.userId, userId),
        eq(dubbingQualityRatings.dubbedTrackId, trackId)
      ));
    return result[0];
  }

  async getDubbingRatingsByTrack(trackId: string): Promise<DubbingQualityRating[]> {
    return await db
      .select()
      .from(dubbingQualityRatings)
      .where(eq(dubbingQualityRatings.dubbedTrackId, trackId))
      .orderBy(desc(dubbingQualityRatings.createdAt));
  }

  async createDubbingRating(rating: InsertDubbingQualityRating): Promise<DubbingQualityRating> {
    const [result] = await db
      .insert(dubbingQualityRatings)
      .values(rating)
      .onConflictDoUpdate({
        target: [dubbingQualityRatings.userId, dubbingQualityRatings.dubbedTrackId],
        set: {
          rating: rating.rating,
          feedback: rating.feedback,
          issueType: rating.issueType
        }
      })
      .returning();
    return result;
  }

  async updateDubbingRating(id: string, data: Partial<InsertDubbingQualityRating>): Promise<DubbingQualityRating | undefined> {
    const [result] = await db
      .update(dubbingQualityRatings)
      .set(data)
      .where(eq(dubbingQualityRatings.id, id))
      .returning();
    return result;
  }

  async updateAverageRating(trackId: string): Promise<void> {
    // Calculate average rating from all ratings for this track
    const ratings = await db
      .select({ rating: dubbingQualityRatings.rating })
      .from(dubbingQualityRatings)
      .where(eq(dubbingQualityRatings.dubbedTrackId, trackId));
    
    if (ratings.length === 0) {
      await db
        .update(dubbedAudioTracks)
        .set({ averageRating: '0.00', ratingCount: 0 })
        .where(eq(dubbedAudioTracks.id, trackId));
      return;
    }

    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    const average = (sum / ratings.length).toFixed(2);
    
    await db
      .update(dubbedAudioTracks)
      .set({ 
        averageRating: average,
        ratingCount: ratings.length 
      })
      .where(eq(dubbedAudioTracks.id, trackId));
  }

  // Audio Quality Metrics (automated testing)
  async getAudioQualityMetrics(dubbedTrackId: string): Promise<AudioQualityMetrics | undefined> {
    const result = await db
      .select()
      .from(audioQualityMetrics)
      .where(eq(audioQualityMetrics.dubbedTrackId, dubbedTrackId))
      .orderBy(desc(audioQualityMetrics.createdAt))
      .limit(1);
    return result[0];
  }

  async createAudioQualityMetrics(metrics: InsertAudioQualityMetrics): Promise<AudioQualityMetrics> {
    const [result] = await db
      .insert(audioQualityMetrics)
      .values(metrics)
      .returning();
    return result;
  }

  // User Dubbing Preferences (ML learning)
  async getUserDubbingPreferences(userId: string): Promise<UserDubbingPreferences | undefined> {
    const result = await db
      .select()
      .from(userDubbingPreferences)
      .where(eq(userDubbingPreferences.userId, userId));
    return result[0];
  }

  async createUserDubbingPreferences(prefs: InsertUserDubbingPreferences): Promise<UserDubbingPreferences> {
    const [result] = await db
      .insert(userDubbingPreferences)
      .values(prefs)
      .onConflictDoUpdate({
        target: userDubbingPreferences.userId,
        set: {
          ...prefs,
          lastUpdated: new Date()
        }
      })
      .returning();
    return result;
  }

  async updateUserDubbingPreferences(userId: string, data: Partial<InsertUserDubbingPreferences>): Promise<UserDubbingPreferences | undefined> {
    const [result] = await db
      .update(userDubbingPreferences)
      .set({ ...data, lastUpdated: new Date() })
      .where(eq(userDubbingPreferences.userId, userId))
      .returning();
    return result;
  }

  // Dubbing Watch History (tracking)
  async getDubbingWatchHistory(userId: string): Promise<Array<{ id: string; dubbedTrackId: string; movieId: string; watchDuration: number | null; completionPercent: string | null; switchedToOriginal: number; watchedAt: Date }>> {
    return await db
      .select({
        id: dubbingWatchHistory.id,
        dubbedTrackId: dubbingWatchHistory.dubbedTrackId,
        movieId: dubbingWatchHistory.movieId,
        watchDuration: dubbingWatchHistory.watchDuration,
        completionPercent: dubbingWatchHistory.completionPercent,
        switchedToOriginal: dubbingWatchHistory.switchedToOriginal,
        watchedAt: dubbingWatchHistory.watchedAt
      })
      .from(dubbingWatchHistory)
      .where(eq(dubbingWatchHistory.userId, userId))
      .orderBy(desc(dubbingWatchHistory.watchedAt));
  }

  async createDubbingWatchHistory(data: { userId: string; dubbedTrackId: string; movieId: string; watchDuration?: number; totalMovieDuration?: number; completionPercent?: string; switchedToOriginal?: number; switchTime?: number; downloadedTrack?: number; impliedSatisfaction?: string }): Promise<{ id: string }> {
    const [result] = await db
      .insert(dubbingWatchHistory)
      .values(data)
      .returning({ id: dubbingWatchHistory.id });
    return result;
  }
}

export const storage = new DbStorage();
