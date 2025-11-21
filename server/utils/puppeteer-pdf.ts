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

  // For serverless environments, try to use system Chrome or Puppeteer's bundled Chrome
  if (isProduction) {
    // First, try to use Puppeteer's bundled Chrome (if installed via npx puppeteer browsers install)
    try {
      const puppeteerCachePath = process.env.PUPPETEER_CACHE_DIR || 
        (process.env.HOME ? path.join(process.env.HOME, '.cache', 'puppeteer') : null) ||
        (process.env.RENDER ? '/opt/render/.cache/puppeteer' : null) ||
        '/tmp/puppeteer-cache';
      
      // Try to find Chrome in Puppeteer's cache directory
      if (puppeteerCachePath && fs.existsSync(puppeteerCachePath)) {
        const chromeDirs = fs.readdirSync(puppeteerCachePath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        for (const dir of chromeDirs) {
          const chromePath = path.join(puppeteerCachePath, dir, 'chrome-linux64', 'chrome');
          if (fs.existsSync(chromePath)) {
            launchOptions.executablePath = chromePath;
            console.log(`[PDF] Using Puppeteer Chrome at: ${chromePath}`);
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[PDF] Could not find Puppeteer bundled Chrome:', e);
    }

    // If Puppeteer Chrome not found, try system Chrome
    if (!launchOptions.executablePath) {
      const possibleChromePaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/opt/google/chrome/chrome',
      ];

      for (const chromePath of possibleChromePaths) {
        try {
          if (fs.existsSync(chromePath)) {
            launchOptions.executablePath = chromePath;
            console.log(`[PDF] Using system Chrome at: ${chromePath}`);
            break;
          }
        } catch (e) {
          // Continue checking other paths
        }
      }
    }

    // Set cache directory for Render
    if (process.env.RENDER) {
      launchOptions.userDataDir = '/tmp/puppeteer-cache';
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

