import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedDatabase } from "./seed";
import { migrateDefaultProfiles } from "./migrateProfiles";
import { startWorker } from "./jobWorker";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";

const app = express();

// PRODUCTION RECOVERY: Direct route to load recovered movies (no auth required, uses secret key)
import { recoveredMovies } from "./recoveredMoviesData";
import { storage } from "./storage";

app.get("/api/recover", async (req, res) => {
  const key = req.query.key;
  // Accept either the env secret OR the hardcoded key for recovery
  if (key !== process.env.ADMIN_SECRET && key !== "Admin123") {
    return res.send("<h1>Add ?key=Admin123 to URL</h1>");
  }
  
  try {
    console.log("[RECOVER] Starting recovery, movies to import:", recoveredMovies.length);
    
    let existing: any[] = [];
    try {
      existing = await storage.getAllMovies();
      console.log("[RECOVER] Existing movies:", existing.length);
    } catch (dbErr: any) {
      return res.send(`<h1>Database Error</h1><p>Could not get existing movies: ${dbErr.message}</p>`);
    }
    
    const existingIds = new Set(existing.map(m => m.id));
    // Track all title+year combinations to avoid unique constraint violations
    const usedTitleYears = new Set(existing.map(m => `${m.title}::${m.year}`));
    let created = 0;
    let errors: string[] = [];
    
    for (const movie of recoveredMovies) {
      if (existingIds.has(movie.id)) continue;
      try {
        // Make title unique by appending suffix until no conflict
        let uniqueTitle = movie.title;
        let suffix = 1;
        while (usedTitleYears.has(`${uniqueTitle}::${movie.year}`)) {
          uniqueTitle = `${movie.title} (${suffix})`;
          suffix++;
        }
        usedTitleYears.add(`${uniqueTitle}::${movie.year}`);
        
        await storage.createMovieWithId(movie.id, {
          title: uniqueTitle,
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
      } catch (e: any) {
        if (errors.length < 3) errors.push(e.message);
      }
    }
    
    console.log("[RECOVER] Done! Created:", created);
    let errMsg = errors.length > 0 ? `<p>Errors: ${errors.join(", ")}</p>` : "";
    res.send(`<h1>Done!</h1><p>Imported ${created} movies</p>${errMsg}<a href="/">Go Home</a>`);
  } catch (e: any) {
    console.error("[RECOVER] Error:", e);
    res.send(`<h1>Error</h1><p>${e.message}</p><pre>${e.stack}</pre>`);
  }
});

// Import 29 additional movies from movies_export.json
import fs from "fs";
import path from "path";

app.get("/api/import-additional", async (req, res) => {
  const key = req.query.key;
  if (key !== process.env.ADMIN_SECRET && key !== "Admin123") {
    return res.send("<h1>Add ?key=Admin123 to URL</h1>");
  }
  
  try {
    const filePath = path.join(process.cwd(), "attached_assets/movies_export.json");
    const rawData = fs.readFileSync(filePath, "utf8");
    const additionalMovies = JSON.parse(rawData);
    
    console.log("[IMPORT] Starting import, movies to import:", additionalMovies.length);
    
    const existing = await storage.getAllMovies();
    const existingIds = new Set(existing.map(m => m.id));
    const usedTitleYears = new Set(existing.map(m => `${m.title}::${m.year}`));
    
    let created = 0;
    let errors: string[] = [];
    
    for (const movie of additionalMovies) {
      if (existingIds.has(movie.id)) continue;
      try {
        let uniqueTitle = movie.title;
        let suffix = 1;
        while (usedTitleYears.has(`${uniqueTitle}::${movie.year}`)) {
          uniqueTitle = `${movie.title} (${suffix})`;
          suffix++;
        }
        usedTitleYears.add(`${uniqueTitle}::${movie.year}`);
        
        await storage.createMovieWithId(movie.id, {
          title: uniqueTitle,
          description: movie.description,
          year: movie.year,
          rating: movie.rating || "G",
          genres: (movie.genres || []) as string[],
          poster: movie.poster,
          backdrop: movie.backdrop,
          videoUrl: movie.video_url || movie.videoUrl,
          mobileMp4Url: movie.mobileMp4Url || null,
          trailerUrl: movie.trailerUrl || null,
          duration: movie.duration || 0,
          director: movie.director,
          cast: (movie.cast || []) as string[],
          sourceLanguage: movie.sourceLanguage || null,
          introStart: movie.introStart || null,
          introEnd: movie.introEnd || null,
          creditsStart: movie.creditsStart || null,
          subtitleUrl: movie.subtitleUrl || null,
          hostedAssetKey: movie.hostedAssetKey || null,
        });
        created++;
      } catch (e: any) {
        if (errors.length < 5) errors.push(`${movie.title}: ${e.message}`);
      }
    }
    
    console.log("[IMPORT] Done! Created:", created);
    let errMsg = errors.length > 0 ? `<p>Errors: ${errors.join(", ")}</p>` : "";
    res.send(`<h1>Done!</h1><p>Imported ${created} additional movies</p>${errMsg}<a href="/">Go Home</a>`);
  } catch (e: any) {
    console.error("[IMPORT] Error:", e);
    res.send(`<h1>Error</h1><p>${e.message}</p><pre>${e.stack}</pre>`);
  }
});

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not found, skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const { webhook, uuid } = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`,
      { enabled_events: ['*'], description: 'Managed webhook for Stripe sync' }
    );
    console.log(`Webhook configured: ${webhook.url} (UUID: ${uuid})`);

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

app.post(
  '/api/stripe/webhook/:uuid',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      const { uuid } = req.params;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig, uuid);
      
      // Parse event and handle custom logic
      const event = JSON.parse(req.body.toString());
      
      // Handle subscription-related events for filmmaker upgrades
      if (event.type === 'checkout.session.completed') {
        await WebhookHandlers.handleCheckoutSessionCompleted(event.data.object);
      } else if (event.type === 'customer.subscription.updated') {
        await WebhookHandlers.handleSubscriptionUpdated(event.data.object);
      } else if (event.type === 'customer.subscription.deleted') {
        await WebhookHandlers.handleSubscriptionDeleted(event.data.object);
      } else if (event.type === 'payment_intent.succeeded') {
        await WebhookHandlers.handlePaymentIntentSucceeded(event.data.object);
      } else if (event.type === 'payment_intent.payment_failed') {
        await WebhookHandlers.handlePaymentIntentFailed(event.data.object);
      }
      
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await seedDatabase();
  
  // Phase 0: Create default profiles for existing users (idempotent)
  await migrateDefaultProfiles();
  
  // Phase 1: Fix transcoding status for recovered movies with hosted video files
  try {
    const allMovies = await storage.getAllMovies();
    const toFix = allMovies.filter(m => m.hostedAssetKey && m.transcodingStatus !== 'completed');
    if (toFix.length > 0) {
      console.log(`[MIGRATION] Fixing transcoding status for ${toFix.length} movies with hosted videos...`);
      for (const movie of toFix) {
        await storage.updateMovie({
          id: movie.id,
          transcodingStatus: 'completed',
        });
      }
      console.log(`[MIGRATION] Fixed ${toFix.length} movies`);
    }
  } catch (err) {
    console.error('[MIGRATION] Error fixing transcoding status:', err);
  }
  
  // Initialize Stripe schema and sync data
  await initStripe();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    log(`${signal} received, closing server gracefully...`);
    server.close(() => {
      log('Server closed');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      log('Forcing server close after timeout');
      process.exit(1);
    }, 10000);
  };
  
  // Handle process termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle unhandled errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
  
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start background worker for job processing
    // Only in development or when explicitly enabled via ENABLE_WORKER env var
    // In production Autoscale, use a separate Reserved VM deployment for workers
    const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';
    const workerEnabled = process.env.ENABLE_WORKER === 'true';
    
    if (!isProduction || workerEnabled) {
      startWorker('main-worker', 2000);
      log('Background worker started');
    } else {
      log('Background worker disabled (production Autoscale mode)');
    }
  });
})();
