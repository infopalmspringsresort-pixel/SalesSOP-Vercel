import { MongoClient } from 'mongodb';

export class SessionCleanup {
  private static instance: SessionCleanup;
  private mongoClient: MongoClient | null = null;
  private sessionCollection: any = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): SessionCleanup {
    if (!SessionCleanup.instance) {
      SessionCleanup.instance = new SessionCleanup();
    }
    return SessionCleanup.instance;
  }

  private async connect(): Promise<void> {
    if (this.mongoClient && this.sessionCollection) {
      return; // Already connected
    }

    try {
      this.mongoClient = new MongoClient(process.env.MONGODB_URI!);
      await this.mongoClient.connect();
      const db = this.mongoClient.db(process.env.MONGODB_DB_NAME);
      this.sessionCollection = db.collection('sessions');
      } catch (error) {
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      await this.connect();
      
      const result = await this.sessionCollection.deleteMany({
        expires: { $lt: new Date() }
      });
      
      if (result.deletedCount > 0) {
        }
      
      return result.deletedCount;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Start automatic cleanup every hour
   */
  startAutomaticCleanup(): void {
    if (this.cleanupInterval) {
      return; // Already started
    }

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        }
    }, 60 * 60 * 1000); // Every hour

    }

  /**
   * Stop automatic cleanup
   */
  stopAutomaticCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      }
  }

  /**
   * Invalidate all sessions for a specific user
   * This is used when password is changed to force logout
   */
  async invalidateUserSessions(userId: string): Promise<number> {
    try {
      await this.connect();
      
      // MongoDB session store stores user data in the session
      // Passport stores the user object in session.passport.user
      // The user object can have id or _id field, and might be stored as ObjectId or string
      // We need to handle multiple formats
      const result = await this.sessionCollection.deleteMany({
        $or: [
          // Standard passport format with user.id
          { 'session.passport.user.id': userId },
          // Standard passport format with user._id
          { 'session.passport.user._id': userId },
          // Alternative formats
          { 'session.user.id': userId },
          { 'session.user._id': userId },
          // Handle ObjectId format (if userId is stored as ObjectId string)
          { 'session.passport.user.id': { $regex: userId, $options: 'i' } },
        ]
      });
      
      return result.deletedCount || 0;
    } catch (error) {
      console.error('Error invalidating user sessions:', error);
      // If MongoDB is not available or sessions are in memory, return 0
      // The frontend will still handle logout for the current session
      return 0;
    }
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    this.stopAutomaticCleanup();
    
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.mongoClient = null;
      this.sessionCollection = null;
      }
  }
}

// Export singleton instance
export const sessionCleanup = SessionCleanup.getInstance();

