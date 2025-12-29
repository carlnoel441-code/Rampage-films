import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, index, unique, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 50 }).notNull(),
  avatarUrl: text("avatar_url"),
  isKidsProfile: integer("is_kids_profile").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_profiles_user").on(table.userId),
]);

export const insertProfileSchema = createInsertSchema(profiles).omit({
  id: true,
  createdAt: true,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;

// Filmmaker Accounts - for creators who upload films and can receive tips
export const filmmakerAccounts = pgTable("filmmaker_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  profileImageUrl: text("profile_image_url"),
  websiteUrl: text("website_url"),
  status: varchar("status", { length: 20 }).notNull().default('pending'), // 'pending', 'approved', 'suspended'
  stripeConnectId: varchar("stripe_connect_id"),
  stripeOnboardingComplete: integer("stripe_onboarding_complete").default(0).notNull(),
  totalEarnings: numeric("total_earnings", { precision: 10, scale: 2 }).default('0.00').notNull(),
  pendingBalance: numeric("pending_balance", { precision: 10, scale: 2 }).default('0.00').notNull(),
  // Subscription tier fields
  subscriptionTier: varchar("subscription_tier", { length: 20 }).notNull().default('free'), // 'free', 'pro'
  maxFilms: integer("max_films").default(2).notNull(), // 2 for free, unlimited (-1) for pro
  revenueSharePercent: integer("revenue_share_percent").default(70).notNull(), // 70% for free, 80% for pro
  stripeSubscriptionId: varchar("stripe_subscription_id"), // Stripe subscription ID for pro tier
  subscriptionStatus: varchar("subscription_status", { length: 20 }).default('none'), // 'none', 'active', 'canceled', 'past_due'
  subscriptionEndsAt: timestamp("subscription_ends_at"), // When subscription expires
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_filmmaker_user").on(table.userId),
  index("idx_filmmaker_status").on(table.status),
]);

export const insertFilmmakerAccountSchema = createInsertSchema(filmmakerAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalEarnings: true,
  pendingBalance: true,
});

export type InsertFilmmakerAccount = z.infer<typeof insertFilmmakerAccountSchema>;
export type FilmmakerAccount = typeof filmmakerAccounts.$inferSelect;

export const movies = pgTable("movies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  year: text("year").notNull(),
  rating: text("rating").notNull(),
  genres: text("genres").array().notNull(),
  poster: text("poster").notNull(),
  backdrop: text("backdrop").notNull(),
  videoUrl: text("video_url"),
  mobileMp4Url: text("mobile_mp4_url"),
  trailerUrl: text("trailer_url"),
  duration: integer("duration").notNull(),
  director: text("director").notNull(),
  cast: text("cast").array().notNull(),
  sourceLanguage: text("source_language"),
  introStart: integer("intro_start"),
  introEnd: integer("intro_end"),
  creditsStart: integer("credits_start"),
  subtitleUrl: text("subtitle_url"),
  viewCount: integer("view_count").default(0).notNull(),
  hostedAssetKey: text("hosted_asset_key"),
  transcodingStatus: text("transcoding_status"),
  transcodingError: text("transcoding_error"),
  transcodingUpdatedAt: timestamp("transcoding_updated_at"),
  originalEmbedUrl: text("original_embed_url"),
  // Monetization fields
  filmmakerId: varchar("filmmaker_id").references(() => filmmakerAccounts.id, { onDelete: 'set null' }),
  isFilmmakerUploaded: integer("is_filmmaker_uploaded").default(0).notNull(),
  monetizationEnabled: integer("monetization_enabled").default(0).notNull(),
}, (table) => [
  unique("unique_title_year").on(table.title, table.year),
  index("idx_movies_filmmaker").on(table.filmmakerId),
]);

export const insertMovieSchema = createInsertSchema(movies).omit({
  id: true,
}).extend({
  subtitleUrl: z.string().optional().nullable()
    .refine(
      val => !val || val === '' || (val.toLowerCase().startsWith('https://') && val.toLowerCase().endsWith('.vtt')),
      { message: "Subtitle URL must be HTTPS and end with .vtt (WebVTT format)" }
    )
    .transform(val => val === '' ? null : val),
  introEnd: z.number().int().nonnegative().optional().nullable(),
  creditsStart: z.number().int().nonnegative().optional().nullable(),
});

export const updateMovieSchema = createInsertSchema(movies).partial().required({
  id: true,
}).extend({
  subtitleUrl: z.string().optional().nullable()
    .refine(
      val => val === undefined || !val || val === '' || (val.toLowerCase().startsWith('https://') && val.toLowerCase().endsWith('.vtt')),
      { message: "Subtitle URL must be HTTPS and end with .vtt (WebVTT format)" }
    )
    .transform(val => val === undefined ? undefined : (val === '' ? null : val)),
  introEnd: z.number().int().nonnegative().optional().nullable().transform(val => val === undefined ? undefined : val),
  creditsStart: z.number().int().nonnegative().optional().nullable().transform(val => val === undefined ? undefined : val),
});

export type InsertMovie = z.infer<typeof insertMovieSchema>;
export type UpdateMovie = z.infer<typeof updateMovieSchema>;
export type Movie = typeof movies.$inferSelect;

export const watchlist = pgTable("watchlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: 'cascade' }),
  movieId: varchar("movie_id").notNull().references(() => movies.id, { onDelete: 'cascade' }),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_user_movie_watchlist").on(table.userId, table.movieId),
  index("idx_watchlist_user").on(table.userId),
  index("idx_watchlist_profile").on(table.profileId),
]);

export type Watchlist = typeof watchlist.$inferSelect;
export type InsertWatchlist = typeof watchlist.$inferInsert;

export const watchProgress = pgTable("watch_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: 'cascade' }),
  movieId: varchar("movie_id").notNull().references(() => movies.id, { onDelete: 'cascade' }),
  progressSeconds: integer("progress_seconds").notNull(),
  duration: integer("duration").notNull(),
  lastWatched: timestamp("last_watched").defaultNow().notNull(),
  completed: integer("completed").default(0).notNull(),
}, (table) => [
  unique("unique_user_movie_progress").on(table.userId, table.movieId),
  index("idx_progress_user").on(table.userId),
  index("idx_progress_profile").on(table.profileId),
  index("idx_progress_last_watched").on(table.lastWatched),
]);

export type WatchProgress = typeof watchProgress.$inferSelect;
export type InsertWatchProgress = typeof watchProgress.$inferInsert;

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  movieId: varchar("movie_id").references(() => movies.id, { onDelete: 'cascade' }),
  read: integer("read").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notifications_user").on(table.userId),
  index("idx_notifications_read").on(table.read),
]);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// Background job queue for video downloads, AI dubbing, etc.
export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type", { length: 50 }).notNull(), // 'video-download', 'ai-dubbing', etc.
  status: varchar("status", { length: 20 }).notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed', 'cancelled'
  movieId: varchar("movie_id").references(() => movies.id, { onDelete: 'cascade' }), // nullable for non-movie jobs
  
  // Job-specific data (flexible JSON for different job types)
  // video-download: { sourceUrl: string, targetFormat: string }
  // ai-dubbing: { sourceLanguage: string, targetLanguage: string, modelName: string }
  metadata: jsonb("metadata").notNull().default(sql`'{}'`),
  
  // Progress tracking
  progress: integer("progress").default(0).notNull(), // 0-100 percentage
  progressDetail: jsonb("progress_detail"), // optional richer progress info
  
  // Scheduling and prioritization
  priority: integer("priority").default(0).notNull(), // higher = more important
  scheduledAt: timestamp("scheduled_at").defaultNow().notNull(), // when job becomes eligible
  runAt: timestamp("run_at").defaultNow().notNull(), // when to actually run
  
  // Worker locking (prevent duplicate processing)
  lockedBy: varchar("locked_by"), // worker ID that claimed this job
  lockedAt: timestamp("locked_at"), // when the lock was acquired
  
  // Error handling and retries
  error: text("error"), // error message if failed
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  lastAttemptAt: timestamp("last_attempt_at"), // last time this job was attempted
  retryAfter: timestamp("retry_after"), // don't retry until after this time (exponential backoff)
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  // Composite index for efficient worker polling (status, priority DESC, scheduledAt, createdAt)
  index("idx_jobs_worker_poll").on(table.status, table.priority, table.scheduledAt, table.createdAt),
  index("idx_jobs_type").on(table.type),
  index("idx_jobs_movie").on(table.movieId),
  index("idx_jobs_created").on(table.createdAt),
]);

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateJobSchema = createInsertSchema(jobs).partial().required({
  id: true,
});

export type InsertJob = z.infer<typeof insertJobSchema>;
export type UpdateJob = z.infer<typeof updateJobSchema>;
export type Job = typeof jobs.$inferSelect;

// Genre count type for browse page
export type GenreCount = {
  name: string;
  count: number;
};

// Curated Collections - like Netflix's themed rows
export const collections = pgTable("collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  backdropUrl: text("backdrop_url"),
  movieIds: text("movie_ids").array().notNull().default(sql`'{}'`),
  isActive: integer("is_active").default(1).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_collections_active").on(table.isActive),
  index("idx_collections_order").on(table.displayOrder),
]);

export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateCollectionSchema = createInsertSchema(collections).partial().required({
  id: true,
});

export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type UpdateCollection = z.infer<typeof updateCollectionSchema>;
export type Collection = typeof collections.$inferSelect;

// User Reviews and Ratings
export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: 'cascade' }),
  movieId: varchar("movie_id").notNull().references(() => movies.id, { onDelete: 'cascade' }),
  rating: integer("rating").notNull(), // 1-5 stars
  review: text("review"), // Optional short review (max 500 chars)
  isApproved: integer("is_approved").default(1).notNull(), // For moderation
  isFlagged: integer("is_flagged").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_user_movie_review").on(table.userId, table.movieId),
  index("idx_reviews_movie").on(table.movieId),
  index("idx_reviews_user").on(table.userId),
  index("idx_reviews_approved").on(table.isApproved),
]);

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isApproved: true,
  isFlagged: true,
}).extend({
  rating: z.number().int().min(1).max(5),
  review: z.string().max(500).optional().nullable(),
});

export const updateReviewSchema = createInsertSchema(reviews).partial().required({
  id: true,
});

export type InsertReview = z.infer<typeof insertReviewSchema>;
export type UpdateReview = z.infer<typeof updateReviewSchema>;
export type Review = typeof reviews.$inferSelect;

// Tip Transactions - tracks all tips (platform support + filmmaker specific)
export const tipTransactions = pgTable("tip_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tipType: varchar("tip_type", { length: 30 }).notNull(), // 'platform_support' or 'filmmaker_split'
  
  // Tipper info (optional - can be anonymous)
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  tipperName: text("tipper_name"),
  tipperEmail: text("tipper_email"),
  isAnonymous: integer("is_anonymous").default(0).notNull(),
  
  // Recipient info (for filmmaker tips)
  filmmakerId: varchar("filmmaker_id").references(() => filmmakerAccounts.id, { onDelete: 'set null' }),
  movieId: varchar("movie_id").references(() => movies.id, { onDelete: 'set null' }),
  
  // Financial details (in cents to avoid floating point issues)
  grossAmountCents: integer("gross_amount_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default('USD'),
  processingFeeCents: integer("processing_fee_cents").default(0).notNull(),
  platformShareCents: integer("platform_share_cents").default(0).notNull(), // 30% for filmmaker tips
  filmmakerShareCents: integer("filmmaker_share_cents").default(0).notNull(), // 70% for filmmaker tips
  
  // Stripe payment info
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  stripeChargeId: varchar("stripe_charge_id"),
  
  // Status
  status: varchar("status", { length: 20 }).notNull().default('pending'), // 'pending', 'completed', 'failed', 'refunded'
  
  // Message from tipper
  message: text("message"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_tips_type").on(table.tipType),
  index("idx_tips_filmmaker").on(table.filmmakerId),
  index("idx_tips_movie").on(table.movieId),
  index("idx_tips_status").on(table.status),
  index("idx_tips_created").on(table.createdAt),
]);

export const insertTipTransactionSchema = createInsertSchema(tipTransactions).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertTipTransaction = z.infer<typeof insertTipTransactionSchema>;
export type TipTransaction = typeof tipTransactions.$inferSelect;

// Sponsors - brand profiles for advertising
export const sponsors = pgTable("sponsors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  contactEmail: text("contact_email"),
  contactName: text("contact_name"),
  notes: text("notes"),
  isActive: integer("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_sponsors_active").on(table.isActive),
]);

export const insertSponsorSchema = createInsertSchema(sponsors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSponsor = z.infer<typeof insertSponsorSchema>;
export type Sponsor = typeof sponsors.$inferSelect;

// Sponsorship Placements - where sponsors appear on the site
export const sponsorshipPlacements = pgTable("sponsorship_placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sponsorId: varchar("sponsor_id").notNull().references(() => sponsors.id, { onDelete: 'cascade' }),
  
  // Placement type: 'hero_banner', 'pre_roll_card', 'collection_sponsor', 'footer_banner'
  placementType: varchar("placement_type", { length: 30 }).notNull(),
  
  // Optional targeting
  collectionId: varchar("collection_id").references(() => collections.id, { onDelete: 'set null' }),
  movieId: varchar("movie_id").references(() => movies.id, { onDelete: 'set null' }),
  genreTarget: text("genre_target"), // Target specific genres
  
  // Content
  headline: text("headline"),
  description: text("description"),
  imageUrl: text("image_url"),
  clickUrl: text("click_url"),
  
  // Scheduling
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  isActive: integer("is_active").default(1).notNull(),
  priority: integer("priority").default(0).notNull(),
  
  // Tracking
  impressionCount: integer("impression_count").default(0).notNull(),
  clickCount: integer("click_count").default(0).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_placements_sponsor").on(table.sponsorId),
  index("idx_placements_type").on(table.placementType),
  index("idx_placements_active").on(table.isActive),
  index("idx_placements_dates").on(table.startDate, table.endDate),
]);

export const insertSponsorshipPlacementSchema = createInsertSchema(sponsorshipPlacements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  impressionCount: true,
  clickCount: true,
});

export type InsertSponsorshipPlacement = z.infer<typeof insertSponsorshipPlacementSchema>;
export type SponsorshipPlacement = typeof sponsorshipPlacements.$inferSelect;

// Platform earnings tracking (aggregate for the platform owner)
export const platformEarnings = pgTable("platform_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  earningType: varchar("earning_type", { length: 30 }).notNull(), // 'tip_platform_support', 'tip_platform_share', 'sponsor_payment'
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default('USD'),
  referenceId: varchar("reference_id"), // tipTransaction.id or sponsorshipPlacement.id
  referenceType: varchar("reference_type", { length: 30 }), // 'tip' or 'sponsorship'
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_platform_earnings_type").on(table.earningType),
  index("idx_platform_earnings_created").on(table.createdAt),
]);

// Referral Codes - unique codes for filmmakers and users to share
export const referralCodes = pgTable("referral_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 20 }).notNull().unique(),
  ownerType: varchar("owner_type", { length: 20 }).notNull(), // 'filmmaker', 'user'
  ownerId: varchar("owner_id").notNull(), // filmmaker.id or user.id
  rewardType: varchar("reward_type", { length: 30 }).notNull().default('standard'), // 'standard', 'filmmaker_bonus'
  isActive: integer("is_active").default(1).notNull(),
  totalReferrals: integer("total_referrals").default(0).notNull(),
  totalRewardsEarned: integer("total_rewards_earned").default(0).notNull(), // In cents
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_referral_codes_owner").on(table.ownerType, table.ownerId),
  index("idx_referral_codes_code").on(table.code),
]);

export const insertReferralCodeSchema = createInsertSchema(referralCodes).omit({
  id: true,
  createdAt: true,
  totalReferrals: true,
  totalRewardsEarned: true,
});

export type InsertReferralCode = z.infer<typeof insertReferralCodeSchema>;
export type ReferralCode = typeof referralCodes.$inferSelect;

// Referral Tracking - tracks who referred whom and rewards
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referralCodeId: varchar("referral_code_id").notNull().references(() => referralCodes.id, { onDelete: 'cascade' }),
  referrerId: varchar("referrer_id").notNull(), // The person who shared the code
  referrerType: varchar("referrer_type", { length: 20 }).notNull(), // 'filmmaker', 'user'
  referredId: varchar("referred_id").notNull(), // The new signup
  referredType: varchar("referred_type", { length: 20 }).notNull(), // 'filmmaker', 'user'
  referredEmail: varchar("referred_email"),
  status: varchar("status", { length: 20 }).notNull().default('pending'), // 'pending', 'qualified', 'rewarded'
  rewardAmountCents: integer("reward_amount_cents").default(0).notNull(),
  rewardedAt: timestamp("rewarded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_referrals_code").on(table.referralCodeId),
  index("idx_referrals_referrer").on(table.referrerId),
  index("idx_referrals_status").on(table.status),
]);

export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true,
  createdAt: true,
  rewardedAt: true,
});

export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;

// Email Newsletter Subscriptions
export const newsletterSubscriptions = pgTable("newsletter_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  genres: text("genres").array(), // Preferred genres
  frequency: varchar("frequency", { length: 20 }).notNull().default('weekly'), // 'daily', 'weekly', 'monthly'
  isActive: integer("is_active").default(1).notNull(),
  confirmedAt: timestamp("confirmed_at"),
  unsubscribedAt: timestamp("unsubscribed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_newsletter_email").on(table.email),
  index("idx_newsletter_active").on(table.isActive),
]);

export const insertNewsletterSubscriptionSchema = createInsertSchema(newsletterSubscriptions).omit({
  id: true,
  createdAt: true,
  confirmedAt: true,
  unsubscribedAt: true,
});

export type InsertNewsletterSubscription = z.infer<typeof insertNewsletterSubscriptionSchema>;
export type NewsletterSubscription = typeof newsletterSubscriptions.$inferSelect;

// Social Share Cards - pre-generated shareable content for films
export const socialShareCards = pgTable("social_share_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  movieId: varchar("movie_id").notNull().references(() => movies.id, { onDelete: 'cascade' }),
  cardType: varchar("card_type", { length: 20 }).notNull(), // 'poster', 'quote', 'clip_preview'
  imageUrl: text("image_url"),
  headline: text("headline"),
  caption: text("caption"),
  hashtags: text("hashtags").array(),
  shareCount: integer("share_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_share_cards_movie").on(table.movieId),
]);

export const insertSocialShareCardSchema = createInsertSchema(socialShareCards).omit({
  id: true,
  createdAt: true,
  shareCount: true,
});

export type InsertSocialShareCard = z.infer<typeof insertSocialShareCardSchema>;
export type SocialShareCard = typeof socialShareCards.$inferSelect;

// Dubbed Audio Tracks - stores generated dubbed audio for movies
export const dubbedAudioTracks = pgTable("dubbed_audio_tracks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  movieId: varchar("movie_id").notNull().references(() => movies.id, { onDelete: 'cascade' }),
  languageCode: varchar("language_code", { length: 10 }).notNull(), // e.g., 'es', 'fr', 'de'
  languageName: varchar("language_name", { length: 50 }).notNull(), // e.g., 'Spanish', 'French'
  audioUrl: text("audio_url"), // R2 signed URL (generated on demand)
  audioKey: text("audio_key"), // R2 storage key
  voiceModel: varchar("voice_model", { length: 100 }), // Edge TTS voice used
  duration: integer("duration"), // Duration in seconds
  status: varchar("status", { length: 20 }).notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed'
  progress: integer("progress").default(0).notNull(), // 0-100 percentage
  error: text("error"), // Error message if failed
  averageRating: numeric("average_rating", { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer("rating_count").default(0).notNull(),
  downloadCount: integer("download_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_dubbed_tracks_movie").on(table.movieId),
  index("idx_dubbed_tracks_language").on(table.languageCode),
  index("idx_dubbed_tracks_status").on(table.status),
  unique("unique_movie_language").on(table.movieId, table.languageCode),
]);

export const insertDubbedAudioTrackSchema = createInsertSchema(dubbedAudioTracks).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  averageRating: true,
  ratingCount: true,
  downloadCount: true,
});

export type InsertDubbedAudioTrack = z.infer<typeof insertDubbedAudioTrackSchema>;
export type DubbedAudioTrack = typeof dubbedAudioTracks.$inferSelect;

// Dubbing Quality Ratings - user feedback on dubbed audio quality
export const dubbingQualityRatings = pgTable("dubbing_quality_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dubbedTrackId: varchar("dubbed_track_id").notNull().references(() => dubbedAudioTracks.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  rating: integer("rating").notNull(), // 1-5 stars
  feedback: text("feedback"), // Optional text feedback
  issueType: varchar("issue_type", { length: 50 }), // 'timing', 'voice_quality', 'translation', 'sync', 'other'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dubbing_ratings_track").on(table.dubbedTrackId),
  index("idx_dubbing_ratings_user").on(table.userId),
  unique("unique_user_track_rating").on(table.userId, table.dubbedTrackId),
]);

export const insertDubbingQualityRatingSchema = createInsertSchema(dubbingQualityRatings).omit({
  id: true,
  createdAt: true,
}).extend({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(500).optional().nullable(),
});

export type InsertDubbingQualityRating = z.infer<typeof insertDubbingQualityRatingSchema>;
export type DubbingQualityRating = typeof dubbingQualityRatings.$inferSelect;

// Audio Quality Metrics - automated quality testing results
export const audioQualityMetrics = pgTable("audio_quality_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dubbedTrackId: varchar("dubbed_track_id").notNull().references(() => dubbedAudioTracks.id, { onDelete: 'cascade' }),
  // Sync quality metrics
  syncScore: numeric("sync_score", { precision: 5, scale: 2 }), // 0-100 score for audio/video sync
  avgSyncOffset: numeric("avg_sync_offset", { precision: 6, scale: 3 }), // Average offset in seconds
  maxSyncOffset: numeric("max_sync_offset", { precision: 6, scale: 3 }), // Max offset detected
  // Audio quality metrics
  volumeScore: numeric("volume_score", { precision: 5, scale: 2 }), // 0-100 for consistent volume
  avgLoudness: numeric("avg_loudness", { precision: 6, scale: 2 }), // LUFS measurement
  peakLevel: numeric("peak_level", { precision: 6, scale: 2 }), // Peak dB level
  dynamicRange: numeric("dynamic_range", { precision: 6, scale: 2 }), // Dynamic range in dB
  // Clarity metrics
  clarityScore: numeric("clarity_score", { precision: 5, scale: 2 }), // 0-100 for speech clarity
  silenceRatio: numeric("silence_ratio", { precision: 5, scale: 4 }), // % of audio that is silence
  noiseFloor: numeric("noise_floor", { precision: 6, scale: 2 }), // Background noise level in dB
  // Overall quality
  overallScore: numeric("overall_score", { precision: 5, scale: 2 }), // 0-100 weighted overall score
  qualityGrade: varchar("quality_grade", { length: 2 }), // A, B, C, D, F grade
  issues: text("issues").array(), // Array of detected issues
  recommendations: text("recommendations").array(), // Array of improvement suggestions
  // Metadata
  testVersion: varchar("test_version", { length: 20 }), // Version of quality test algorithm
  testDuration: integer("test_duration"), // Time taken to run tests (ms)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_quality_metrics_track").on(table.dubbedTrackId),
  index("idx_quality_metrics_grade").on(table.qualityGrade),
]);

export const insertAudioQualityMetricsSchema = createInsertSchema(audioQualityMetrics).omit({
  id: true,
  createdAt: true,
});

export type InsertAudioQualityMetrics = z.infer<typeof insertAudioQualityMetricsSchema>;
export type AudioQualityMetrics = typeof audioQualityMetrics.$inferSelect;

// User Dubbing Preferences - ML preference learning
export const userDubbingPreferences = pgTable("user_dubbing_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Language preferences
  preferredLanguages: text("preferred_languages").array(), // Ordered list of preferred dub languages
  primaryLanguage: varchar("primary_language", { length: 10 }), // Most used language
  // Voice preferences (learned from ratings and selections)
  preferredVoiceGender: varchar("preferred_voice_gender", { length: 10 }), // 'male', 'female', 'neutral'
  preferredVoiceStyle: varchar("preferred_voice_style", { length: 20 }), // 'natural', 'dramatic', 'calm'
  preferredSpeakingRate: numeric("preferred_speaking_rate", { precision: 4, scale: 2 }), // 0.5-2.0
  // Volume preferences
  preferredDubbedVolume: numeric("preferred_dubbed_volume", { precision: 4, scale: 2 }), // 0-1 ratio
  preferredOriginalVolume: numeric("preferred_original_volume", { precision: 4, scale: 2 }), // 0-1 ratio for background
  // Quality preferences (learned from which tracks get highest ratings)
  qualityThreshold: numeric("quality_threshold", { precision: 5, scale: 2 }), // Min quality score they accept
  // Usage statistics
  totalDubbedWatched: integer("total_dubbed_watched").default(0).notNull(),
  totalRatingsGiven: integer("total_ratings_given").default(0).notNull(),
  avgRatingGiven: numeric("avg_rating_given", { precision: 3, scale: 2 }),
  // ML confidence scores
  languageConfidence: numeric("language_confidence", { precision: 4, scale: 3 }), // 0-1 how confident in language pref
  voiceConfidence: numeric("voice_confidence", { precision: 4, scale: 3 }), // 0-1 how confident in voice pref
  // Timestamps
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_dub_prefs_user").on(table.userId),
  unique("unique_user_dub_prefs").on(table.userId),
]);

export const insertUserDubbingPreferencesSchema = createInsertSchema(userDubbingPreferences).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export type InsertUserDubbingPreferences = z.infer<typeof insertUserDubbingPreferencesSchema>;
export type UserDubbingPreferences = typeof userDubbingPreferences.$inferSelect;

// Dubbing Watch History - tracks what users watched with dubbing for ML
export const dubbingWatchHistory = pgTable("dubbing_watch_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  dubbedTrackId: varchar("dubbed_track_id").notNull().references(() => dubbedAudioTracks.id, { onDelete: 'cascade' }),
  movieId: varchar("movie_id").notNull().references(() => movies.id, { onDelete: 'cascade' }),
  // Watch metrics
  watchDuration: integer("watch_duration"), // Seconds watched with dubbing active
  totalMovieDuration: integer("total_movie_duration"), // Total movie length
  completionPercent: numeric("completion_percent", { precision: 5, scale: 2 }), // % of movie watched with dub
  // User actions
  switchedToOriginal: integer("switched_to_original").default(0).notNull(), // Did they switch back to original?
  switchTime: integer("switch_time"), // When did they switch (if they did)
  downloadedTrack: integer("downloaded_track").default(0).notNull(), // Did they download the track?
  // Quality feedback inferred from behavior
  impliedSatisfaction: numeric("implied_satisfaction", { precision: 3, scale: 2 }), // 0-5 inferred from behavior
  watchedAt: timestamp("watched_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dub_history_user").on(table.userId),
  index("idx_dub_history_track").on(table.dubbedTrackId),
  index("idx_dub_history_movie").on(table.movieId),
]);
