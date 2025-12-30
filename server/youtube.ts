import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=youtube',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('YouTube not connected');
  }
  return accessToken;
}

async function getUncachableYouTubeClient() {
  const accessToken = await getAccessToken();
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken,
  });
  
  return google.youtube({ version: 'v3', auth: oauth2Client });
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  publishedAt: string;
}

export async function fetchPlaylistVideos(playlistId: string): Promise<YouTubeVideo[]> {
  const youtube = await getUncachableYouTubeClient();
  const videos: YouTubeVideo[] = [];
  let nextPageToken: string | undefined;

  try {
    do {
      const response = await youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId: playlistId,
        maxResults: 50,
        pageToken: nextPageToken,
      });

      if (response.data.items) {
        for (const item of response.data.items) {
          const snippet = item.snippet;
          if (!snippet) continue;

          videos.push({
            id: item.contentDetails?.videoId || '',
            title: snippet.title || '',
            description: snippet.description || '',
            thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
            videoUrl: `https://www.youtube.com/watch?v=${item.contentDetails?.videoId}`,
            publishedAt: snippet.publishedAt || '',
          });
        }
      }

      nextPageToken = response.data.nextPageToken || undefined;
    } while (nextPageToken);

    return videos;
  } catch (error: any) {
    console.error('Error fetching YouTube playlist:', error);
    throw new Error(`Failed to fetch YouTube playlist: ${error.message}`);
  }
}

export async function fetchUserPlaylists(): Promise<{ id: string; title: string; itemCount: number }[]> {
  const youtube = await getUncachableYouTubeClient();
  const playlists: { id: string; title: string; itemCount: number }[] = [];
  let nextPageToken: string | undefined;

  try {
    do {
      const response = await youtube.playlists.list({
        part: ['snippet', 'contentDetails'],
        mine: true,
        maxResults: 50,
        pageToken: nextPageToken,
      });

      if (response.data.items) {
        for (const item of response.data.items) {
          const snippet = item.snippet;
          if (!snippet) continue;

          playlists.push({
            id: item.id || '',
            title: snippet.title || '',
            itemCount: item.contentDetails?.itemCount || 0,
          });
        }
      }

      nextPageToken = response.data.nextPageToken || undefined;
    } while (nextPageToken);

    return playlists;
  } catch (error: any) {
    console.error('Error fetching YouTube playlists:', error);
    throw new Error(`Failed to fetch YouTube playlists: ${error.message}`);
  }
}

export async function searchYouTubeVideos(query: string, maxResults: number = 20): Promise<YouTubeVideo[]> {
  const youtube = await getUncachableYouTubeClient();
  const videos: YouTubeVideo[] = [];

  try {
    const response = await youtube.search.list({
      part: ['snippet'],
      q: query,
      type: ['video'],
      maxResults,
      order: 'relevance',
    });

    if (response.data.items) {
      for (const item of response.data.items) {
        const snippet = item.snippet;
        const videoId = item.id?.videoId;
        if (!snippet || !videoId) continue;

        videos.push({
          id: videoId,
          title: snippet.title || '',
          description: snippet.description || '',
          thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          publishedAt: snippet.publishedAt || '',
        });
      }
    }

    return videos;
  } catch (error: any) {
    console.error('Error searching YouTube videos:', error);
    throw new Error(`Failed to search YouTube videos: ${error.message}`);
  }
}
