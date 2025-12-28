interface TMDBSearchResult {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
}

interface TMDBMovieDetails {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  runtime: number | null;
  genres: { id: number; name: string }[];
}

interface TMDBCredits {
  cast: { name: string; character: string; order: number }[];
  crew: { name: string; job: string }[];
}

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export async function searchTMDBMovie(title: string): Promise<TMDBSearchResult | null> {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY is not configured');
  }

  const url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return null;
    }
    
    return data.results[0];
  } catch (error) {
    console.error('Error searching TMDB:', error);
    throw error;
  }
}

export async function searchTMDBMultiple(title: string): Promise<TMDBSearchResult[]> {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY is not configured');
  }

  const url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return [];
    }
    
    return data.results.slice(0, 10);
  } catch (error) {
    console.error('Error searching TMDB:', error);
    throw error;
  }
}

export async function getTMDBMovieDetails(tmdbId: number): Promise<{
  details: TMDBMovieDetails;
  credits: TMDBCredits;
}> {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY is not configured');
  }

  const detailsUrl = `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
  const creditsUrl = `${TMDB_BASE_URL}/movie/${tmdbId}/credits?api_key=${TMDB_API_KEY}`;
  
  try {
    const [detailsResponse, creditsResponse] = await Promise.all([
      fetch(detailsUrl),
      fetch(creditsUrl)
    ]);
    
    if (!detailsResponse.ok || !creditsResponse.ok) {
      throw new Error(`TMDB API error: ${detailsResponse.status} / ${creditsResponse.status}`);
    }
    
    const details = await detailsResponse.json();
    const credits = await creditsResponse.json();
    
    return { details, credits };
  } catch (error) {
    console.error('Error fetching TMDB details:', error);
    throw error;
  }
}

export async function discoverMovies(params: {
  genreIds?: number[];
  yearFrom?: number;
  yearTo?: number;
  minRating?: number;
  sortBy?: string;
  page?: number;
}): Promise<TMDBSearchResult[]> {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY is not configured');
  }

  const queryParams = new URLSearchParams({
    api_key: TMDB_API_KEY,
    language: 'en-US',
    sort_by: params.sortBy || 'popularity.desc',
    page: String(params.page || 1),
    'vote_count.gte': '100',
  });

  if (params.genreIds && params.genreIds.length > 0) {
    queryParams.append('with_genres', params.genreIds.join(','));
  }

  if (params.yearFrom) {
    queryParams.append('primary_release_date.gte', `${params.yearFrom}-01-01`);
  }

  if (params.yearTo) {
    queryParams.append('primary_release_date.lte', `${params.yearTo}-12-31`);
  }

  if (params.minRating) {
    queryParams.append('vote_average.gte', String(params.minRating));
  }

  const url = `${TMDB_BASE_URL}/discover/movie?${queryParams.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error discovering movies from TMDB:', error);
    throw error;
  }
}

export async function getTMDBGenres(): Promise<{ id: number; name: string }[]> {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY is not configured');
  }

  const url = `${TMDB_BASE_URL}/genre/movie/list?api_key=${TMDB_API_KEY}&language=en-US`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    return data.genres || [];
  } catch (error) {
    console.error('Error fetching TMDB genres:', error);
    throw error;
  }
}

export async function fetchMovieFromTMDB(title: string) {
  const searchResult = await searchTMDBMovie(title);
  
  if (!searchResult) {
    return null;
  }
  
  const { details, credits } = await getTMDBMovieDetails(searchResult.id);
  
  const director = credits.crew.find(person => person.job === 'Director')?.name || 'Unknown';
  const cast = credits.cast
    .slice(0, 10)
    .map(person => person.name);
  
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
  
  const poster = details.poster_path 
    ? `${TMDB_IMAGE_BASE}/w500${details.poster_path}`
    : '/api/assets/thriller-generated.png';
    
  const backdrop = details.backdrop_path
    ? `${TMDB_IMAGE_BASE}/w1280${details.backdrop_path}`
    : '/api/assets/cyberpunk-backdrop.png';
  
  return {
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
  };
}

export async function convertTMDBResultToMovie(result: TMDBSearchResult) {
  const { details, credits } = await getTMDBMovieDetails(result.id);
  
  const director = credits.crew.find(person => person.job === 'Director')?.name || 'Unknown';
  const cast = credits.cast
    .slice(0, 10)
    .map(person => person.name);
  
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
  
  const poster = details.poster_path 
    ? `${TMDB_IMAGE_BASE}/w500${details.poster_path}`
    : '/api/assets/thriller-generated.png';
    
  const backdrop = details.backdrop_path
    ? `${TMDB_IMAGE_BASE}/w1280${details.backdrop_path}`
    : '/api/assets/cyberpunk-backdrop.png';
  
  return {
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
    videoUrl: null
  };
}
