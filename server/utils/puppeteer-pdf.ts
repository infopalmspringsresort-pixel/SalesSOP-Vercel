import puppeteer from 'puppeteer';
import { generateQuotationHTML } from './quotation-pdf-template';
import fs from 'fs';
import path from 'path';

export async function generateQuotationPDF(quotation: any): Promise<Buffer> {
  // Generate HTML from quotation data
  const html = generateQuotationHTML(quotation);

  // Configure Puppeteer for serverless environments (Render, Vercel, etc.)
  const isProduction = process.env.NODE_ENV === 'production';
  const launchOptions: any = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // Important for serverless
      '--disable-gpu',
    ],
  };

  // For serverless environments, configure Chrome path
  if (isProduction) {
    // Set cache directory for Render
    if (process.env.RENDER) {
      launchOptions.userDataDir = '/tmp/puppeteer-cache';
      // Set the cache directory environment variable for Puppeteer
      process.env.PUPPETEER_CACHE_DIR = '/opt/render/.cache/puppeteer';
    }

    // Try to find Chrome executable
    // Method 1: Use Puppeteer's executablePath (if Chrome was installed via puppeteer browsers install)
    try {
      const puppeteerExecutablePath = puppeteer.executablePath();
      if (puppeteerExecutablePath && fs.existsSync(puppeteerExecutablePath)) {
        launchOptions.executablePath = puppeteerExecutablePath;
        console.log(`[PDF] Using Puppeteer's detected Chrome at: ${puppeteerExecutablePath}`);
      }
    } catch (e) {
      console.warn('[PDF] Puppeteer.executablePath() failed:', e);
    }

    // Method 2: Try common cache locations
    if (!launchOptions.executablePath) {
      // First, try the known Render path structure from build logs
      const renderChromePath = '/opt/render/.cache/puppeteer/chrome/linux-142.0.7444.175/chrome-linux64/chrome';
      if (fs.existsSync(renderChromePath)) {
        launchOptions.executablePath = renderChromePath;
        console.log(`[PDF] Using Render Chrome at: ${renderChromePath}`);
      }
      
      // If not found, search common cache locations
      if (!launchOptions.executablePath) {
        const possibleCachePaths = [
          process.env.PUPPETEER_CACHE_DIR,
          process.env.HOME ? path.join(process.env.HOME, '.cache', 'puppeteer') : null,
          '/opt/render/.cache/puppeteer',
          '/tmp/.cache/puppeteer',
          '/root/.cache/puppeteer',
        ].filter(Boolean);

        for (const cachePath of possibleCachePaths) {
        try {
          if (cachePath && fs.existsSync(cachePath)) {
            // Look for Chrome in the cache directory
            // Structure can be: cachePath/chrome/linux-VERSION/chrome-linux64/chrome
            // Or: cachePath/chrome/chrome-linux64/chrome
            const findChromeRecursive = (dir: string, depth: number = 0): string | null => {
              if (depth > 3) return null; // Prevent infinite recursion
              
              try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                
                // First, check if chrome executable is directly here
                const chromePath = path.join(dir, 'chrome');
                if (fs.existsSync(chromePath) && fs.statSync(chromePath).isFile()) {
                  return chromePath;
                }
                
                // Check for chrome-linux64/chrome structure
                const chromeLinux64Path = path.join(dir, 'chrome-linux64', 'chrome');
                if (fs.existsSync(chromeLinux64Path)) {
                  return chromeLinux64Path;
                }
                
                // Recursively search subdirectories
                for (const entry of entries) {
                  if (entry.isDirectory()) {
                    const found = findChromeRecursive(path.join(dir, entry.name), depth + 1);
                    if (found) return found;
                  }
                }
              } catch (e) {
                // Continue searching
              }
              return null;
            };
            
            const foundPath = findChromeRecursive(cachePath);
            if (foundPath) {
              launchOptions.executablePath = foundPath;
              console.log(`[PDF] Found Chrome in cache at: ${foundPath}`);
              break;
            }
          }
        } catch (e) {
          console.warn(`[PDF] Error searching cache path ${cachePath}:`, e);
        }
        }
      }
    }

    // Method 3: Try system Chrome/Chromium
    if (!launchOptions.executablePath) {
      const systemChromePaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/opt/google/chrome/chrome',
        '/snap/bin/chromium',
      ];

      for (const chromePath of systemChromePaths) {
        try {
          if (fs.existsSync(chromePath)) {
            launchOptions.executablePath = chromePath;
            console.log(`[PDF] Using system Chrome at: ${chromePath}`);
            break;
          }
        } catch (e) {
          // Continue checking
        }
      }
    }

    // Log if we still don't have a path
    if (!launchOptions.executablePath) {
      console.warn('[PDF] Could not find Chrome executable. Puppeteer will try to download it.');
      console.warn('[PDF] PUPPETEER_CACHE_DIR:', process.env.PUPPETEER_CACHE_DIR);
      console.warn('[PDF] HOME:', process.env.HOME);
      console.warn('[PDF] RENDER:', process.env.RENDER);
    }
  }

  // Launch Puppeteer
  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
  } catch (error) {
    console.error('[PDF] Failed to launch Puppeteer:', error);
    // If launch fails, try without executablePath (let Puppeteer find it)
    if (launchOptions.executablePath) {
      console.log('[PDF] Retrying without explicit executablePath...');
      delete launchOptions.executablePath;
      browser = await puppeteer.launch(launchOptions);
    } else {
      throw error;
    }
  }

  try {
    const page = await browser.newPage();
    
    // Set content and wait for it to load
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generate PDF with improved page break handling
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '25mm', // Increased bottom margin for footer
        left: '15mm',
      },
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: false, // We handle footer in CSS
    });

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('[PDF] Error generating PDF:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

