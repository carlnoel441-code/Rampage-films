import { neon } from '@neondatabase/serverless';

// This script migrates all movies from development to production database

async function migrateMovies() {
  const devDb = neon(process.env.DATABASE_URL!);
  const prodDb = neon(process.env.DATABASE_URL_PROD!);

  console.log('Starting migration...');
  
  // Get all movies from development
  const movies = await devDb`SELECT * FROM movies ORDER BY year DESC, title ASC`;
  console.log(`Found ${movies.length} movies in development database`);

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const movie of movies) {
    try {
      // Try to insert or update based on unique (title, year) constraint
      const result = await prodDb`
        INSERT INTO movies (
          id, title, description, year, rating, genres, 
          poster, backdrop, video_url, duration, director, cast
        ) VALUES (
          ${movie.id},
          ${movie.title},
          ${movie.description},
          ${movie.year},
          ${movie.rating},
          ${movie.genres},
          ${movie.poster},
          ${movie.backdrop},
          ${movie.video_url},
          ${movie.duration},
          ${movie.director},
          ${movie.cast}
        )
        ON CONFLICT (title, year) 
        DO UPDATE SET
          description = EXCLUDED.description,
          rating = EXCLUDED.rating,
          genres = EXCLUDED.genres,
          poster = EXCLUDED.poster,
          backdrop = EXCLUDED.backdrop,
          video_url = EXCLUDED.video_url,
          duration = EXCLUDED.duration,
          director = EXCLUDED.director,
          cast = EXCLUDED.cast
        RETURNING id
      `;
      
      if (result.length > 0) {
        imported++;
        console.log(`✓ Imported: ${movie.title} (${movie.year})`);
      } else {
        updated++;
        console.log(`✓ Updated: ${movie.title} (${movie.year})`);
      }
    } catch (error: any) {
      skipped++;
      console.log(`✗ Skipped: ${movie.title} (${movie.year}) - ${error.message}`);
    }
  }

  console.log('\n=== Migration Complete ===');
  console.log(`Total processed: ${movies.length}`);
  console.log(`Imported: ${imported}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
}

migrateMovies()
  .then(() => {
    console.log('\n✅ All done! Your movies are now on production.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
