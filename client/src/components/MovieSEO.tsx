import { useEffect } from 'react';
import { Movie } from '@shared/schema';

interface MovieSEOProps {
  movie: Movie;
}

export default function MovieSEO({ movie }: MovieSEOProps) {
  useEffect(() => {
    const cleanTitle = `${movie.title} (${movie.year}) | Rampage Films`;
    document.title = cleanTitle;

    const description = movie.description || '';
    const cast = (movie.cast && movie.cast.length > 0) ? movie.cast.slice(0, 3).join(', ') : 'An ensemble cast';
    const director = movie.director || 'Unknown';
    const genres = (movie.genres && movie.genres.length > 0) ? movie.genres.join(', ') : 'Classic';
    
    const metaDescription = `Watch ${movie.title} (${movie.year}) - ${description.slice(0, 155)}... Starring ${cast}. Directed by ${director}. ${genres} film available for streaming on Rampage Films.`;
    
    const updateMetaTag = (name: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name';
      let element = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, name);
        document.head.appendChild(element);
      }
      element.content = content;
    };

    updateMetaTag('description', metaDescription);
    updateMetaTag('keywords', `${movie.genres.join(', ')}, ${movie.title}, ${movie.director}, ${movie.year} movie, cult classic, indie film, streaming`);
    
    updateMetaTag('og:title', `${movie.title} (${movie.year})`, true);
    updateMetaTag('og:description', metaDescription.slice(0, 200), true);
    updateMetaTag('og:image', movie.poster, true);
    updateMetaTag('og:url', window.location.href, true);
    updateMetaTag('og:type', 'video.movie', true);
    
    updateMetaTag('twitter:card', 'summary_large_image');
    updateMetaTag('twitter:title', `${movie.title} (${movie.year})`);
    updateMetaTag('twitter:description', metaDescription.slice(0, 200));
    updateMetaTag('twitter:image', movie.poster);

    const schemaData = {
      "@context": "https://schema.org",
      "@type": "Movie",
      "name": movie.title,
      "description": movie.description,
      "image": movie.poster,
      "director": {
        "@type": "Person",
        "name": movie.director
      },
      "actor": movie.cast.map(actor => ({
        "@type": "Person",
        "name": actor
      })),
      "genre": movie.genres,
      "datePublished": movie.year,
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "8.5",
        "bestRating": "10",
        "ratingCount": movie.viewCount || 1
      },
      "duration": `PT${movie.duration}M`
    };

    let schemaScript = document.getElementById('movie-schema') as HTMLScriptElement;
    if (!schemaScript) {
      schemaScript = document.createElement('script');
      schemaScript.id = 'movie-schema';
      schemaScript.type = 'application/ld+json';
      document.head.appendChild(schemaScript);
    }
    schemaScript.textContent = JSON.stringify(schemaData);

    return () => {
      document.title = 'Rampage Films - Rare & Cult Classic Movies';
      
      const scriptToRemove = document.getElementById('movie-schema');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
      
      // Restore default meta tags instead of removing
      updateMetaTag('description', 'Discover rare and cult classic films. Stream unique cinema from around the world on Rampage Films.');
      updateMetaTag('keywords', 'streaming, movies, cult classics, indie films, rare cinema');
      
      updateMetaTag('og:title', 'Rampage Films - Rare & Cult Classic Movies', true);
      updateMetaTag('og:description', 'Discover rare and cult classic films. Stream unique cinema from around the world.', true);
      updateMetaTag('og:type', 'website', true);
      
      // Remove movie-specific tags that don't have defaults
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) ogImage.remove();
      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.remove();
      
      ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'].forEach(name => {
        const meta = document.querySelector(`meta[name="${name}"]`);
        if (meta) meta.remove();
      });
    };
  }, [movie]);

  return null;
}
