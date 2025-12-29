import type { InsertMovie } from "@shared/schema";

interface InstagramMediaItem {
  id: string;
  media_type: string;
  media_url: string;
  permalink: string;
  caption?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

interface InstagramResponse {
  data: InstagramMediaItem[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
  };
}

export interface InstagramReel {
  id: string;
  permalink: string;
  videoUrl: string;
  caption: string;
  timestamp: string;
  likes: number;
  comments: number;
}

/**
 * Fetch all reels from an Instagram Business/Creator account
 * @param accessToken - Instagram Graph API access token
 * @param userId - Instagram Business Account ID (optional, will be fetched if not provided)
 * @returns Array of Instagram reels with metadata
 */
export async function fetchInstagramReels(
  accessToken: string,
  userId?: string
): Promise<InstagramReel[]> {
  try {
    // If userId not provided, fetch it from the access token
    let igUserId = userId;
    if (!igUserId) {
      igUserId = await getInstagramUserId(accessToken);
    }

    const allReels: InstagramReel[] = [];
    let nextUrl: string | undefined = 
      `https://graph.facebook.com/v18.0/${igUserId}/media?fields=id,media_type,media_url,permalink,caption,timestamp,like_count,comments_count&access_token=${accessToken}`;

    // Fetch all pages of media (Instagram paginates results)
    while (nextUrl) {
      const response = await fetch(nextUrl);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Instagram API error: ${errorData.error?.message || response.statusText}`
        );
      }

      const data: InstagramResponse = await response.json();

      // Filter for reels (VIDEO media type with /reel/ in permalink)
      const reels = data.data
        .filter(
          (item) =>
            item.media_type === "VIDEO" &&
            item.permalink?.includes("/reel/")
        )
        .map((item) => ({
          id: item.id,
          permalink: item.permalink,
          videoUrl: item.media_url,
          caption: item.caption || "",
          timestamp: item.timestamp,
          likes: item.like_count || 0,
          comments: item.comments_count || 0,
        }));

      allReels.push(...reels);

      // Check if there are more pages
      nextUrl = data.paging?.next;
    }

    console.log(`✅ Fetched ${allReels.length} reels from Instagram`);
    return allReels;
  } catch (error) {
    console.error("❌ Error fetching Instagram reels:", error);
    throw error;
  }
}

/**
 * Get Instagram Business Account user ID from access token
 * @param accessToken - Instagram Graph API access token
 * @returns Instagram Business Account user ID
 */
export async function getInstagramUserId(
  accessToken: string
): Promise<string> {
  try {
    // First get Facebook Page ID
    const pageResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
    );

    if (!pageResponse.ok) {
      throw new Error("Failed to fetch Facebook Page ID");
    }

    const pageData = await pageResponse.json();
    
    if (!pageData.data || pageData.data.length === 0) {
      throw new Error(
        "No Facebook Pages found. Please ensure your access token has the correct permissions."
      );
    }

    const pageId = pageData.data[0].id;

    // Then get Instagram Business Account ID linked to the page
    const igResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${accessToken}`
    );

    if (!igResponse.ok) {
      throw new Error("Failed to fetch Instagram Business Account");
    }

    const igData = await igResponse.json();

    if (!igData.instagram_business_account?.id) {
      throw new Error(
        "No Instagram Business Account found. Please ensure your Instagram account is linked to your Facebook Page."
      );
    }

    return igData.instagram_business_account.id;
  } catch (error) {
    console.error("❌ Error getting Instagram user ID:", error);
    throw error;
  }
}

/**
 * Extract movie title from Instagram reel caption using AI
 * This will be implemented to use OpenAI to parse captions and extract movie titles
 */
export async function extractMovieTitleFromCaption(
  caption: string
): Promise<string | null> {
  // This will be implemented in the next step with OpenAI integration
  // For now, we'll look for common patterns like:
  // - "Movie: Title" or "Film: Title"
  // - #MovieName hashtags
  // - First line of caption before emojis
  
  if (!caption) return null;

  // Try to find "Movie:" or "Film:" prefix
  const movieMatch = caption.match(/(?:movie|film):\s*([^\n#]+)/i);
  if (movieMatch) {
    return movieMatch[1].trim();
  }

  // Try to extract from hashtags
  const hashtagMatch = caption.match(/#(\w+(?:\s+\w+)*)/);
  if (hashtagMatch) {
    // Convert hashtag to readable title (e.g., #TheMatrix -> The Matrix)
    return hashtagMatch[1]
      .replace(/([A-Z])/g, " $1")
      .trim()
      .replace(/\s+/g, " ");
  }

  // Fallback: use first line
  const firstLine = caption.split("\n")[0].trim();
  if (firstLine.length > 0 && firstLine.length < 100) {
    return firstLine;
  }

  return null;
}
