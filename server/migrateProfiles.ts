import { storage } from "./storage";

/**
 * Phase 0 Migration: Create default profiles for all existing users
 * This is idempotent - safe to run multiple times
 */
export async function migrateDefaultProfiles(): Promise<{ created: number; skipped: number }> {
  try {
    // Get all users from the database
    const users = await storage.listUsers();
    
    let created = 0;
    let skipped = 0;
    
    for (const user of users) {
      // Check if user already has profiles
      const existingProfiles = await storage.getUserProfiles(user.id);
      
      if (existingProfiles.length === 0) {
        // Create default profile for this user
        const userName = user.firstName || user.email?.split('@')[0] || "User";
        await storage.createDefaultProfile(user.id, userName);
        created++;
        console.log(`Created default profile for user: ${user.id}`);
      } else {
        skipped++;
      }
    }
    
    console.log(`Profile migration complete: ${created} profiles created, ${skipped} users already had profiles`);
    return { created, skipped };
  } catch (error) {
    console.error("Error migrating default profiles:", error);
    throw error;
  }
}

/**
 * Login safety net: Ensure user has at least one profile
 * Call this during user authentication
 */
export async function ensureUserHasProfile(userId: string, userName: string): Promise<void> {
  try {
    const profiles = await storage.getUserProfiles(userId);
    
    if (profiles.length === 0) {
      console.log(`Creating default profile for user ${userId} (login safety net)`);
      await storage.createDefaultProfile(userId, userName);
    }
  } catch (error) {
    console.error("Error ensuring user has profile:", error);
    // Don't throw - this is a safety net, not critical for login
  }
}
