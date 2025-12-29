// Vercel serverless function wrapper for Express app
import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env'), override: true });

import { initializeSentry, sentryRequestHandler, sentryTracingHandler, sentryErrorHandler } from '../server/sentry';
import express, { type Request, Response, NextFunction } from 'express';
import { registerRoutes } from '../server/routes';
import { serveStatic } from '../server/vite';
import { globalAuditMiddleware } from '../server/middleware/global-audit';

// Set default timezone to Indian Standard Time (GMT+5:30)
process.env.TZ = 'Asia/Kolkata';

// Initialize Sentry before everything else
initializeSentry();

const app = express();

// Sentry request instrumentation
app.use(sentryRequestHandler());
app.use(sentryTracingHandler());

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add comprehensive audit logging middleware
app.use(globalAuditMiddleware());

// Initialize routes (we ignore the returned Server for Vercel)
let initialized = false;

async function initializeApp() {
  if (initialized) return app;
  
  try {
    // Register all routes (returns Server but we don't need it for Vercel)
    await registerRoutes(app);
    
    // Serve static files in production
    serveStatic(app);
    
    // Error handler
    app.use(sentryErrorHandler());
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });
    
    initialized = true;
  } catch (error) {
    console.error('Failed to initialize app:', error);
    throw error;
  }
  
  return app;
}

// Initialize the app (don't await here to avoid blocking)
const appPromise = initializeApp().catch((err) => {
  console.error('Failed to initialize Express app:', err);
  throw err;
});

// Export as Vercel serverless function handler
export default async (req: Request, res: Response) => {
  try {
    const expressApp = await appPromise;
    return expressApp(req, res);
  } catch (error) {
    console.error('Handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        message: 'Internal Server Error', 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
};

