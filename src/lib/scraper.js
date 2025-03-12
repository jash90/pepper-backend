const { load } = require('cheerio');
const puppeteer = require('puppeteer');

/**
 * @typedef {Object} Article
 * @property {string} title - Tytuł artykułu
 * @property {string} description - Opis artykułu
 * @property {string} price - Cena artykułu
 * @property {string} shippingPrice - Cena wysyłki
 * @property {string} image - URL obrazka
 * @property {string} link - Link do artykułu
 */

/**
 * Downloads article data from pepper.pl for a specific page
 * @param {number} pageNumber - Numer strony do pobrania
 * @returns {Promise<Article[]|null>} - Tablica artykułów lub null w przypadku błędu
 */
async function scrapeArticlesFromPepper(pageNumber) {
  try {
    const url = `https://www.pepper.pl?page=${pageNumber}`;

    // Launch puppeteer with additional args
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set a realistic browser user agent string
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    );

    // Set additional headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'max-age=0',
      'Connection': 'keep-alive',
    });

    const timeout = parseInt(process.env.SCRAPING_TIMEOUT) || 30000;
    page.setDefaultNavigationTimeout(timeout);

    console.log(`Navigating to ${url}...`);
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: timeout });
    if (!response || !response.ok()) {
      console.error(`Error response: ${response ? response.status() : 'No response'}`);
      await browser.close();
      throw new Error(`Error fetching URL: ${response ? response.status() : 'No response'}`);
    }

    // Wait for the content to load
    await page.waitForSelector('#content-list', { timeout });
    
    console.log('Content loaded, extracting data...');
    const data = await page.content();
    await browser.close();

    // Load the HTML using Cheerio
    const $ = load(data);

    const selector = 'div#content-list';
    const container = $(selector);

    if (!container.length) {
      console.error(`Target div not found using selector: ${selector}`);
      return null;
    }

    // Extract article data
    const articles = container.find('article');
    if (!articles.length) {
      console.error('Target articles not found within container');
      return null;
    }
    
    const elementsData = [];
    articles.each((_, elem) => {
      const threadListCardBody = $(elem).find('.threadListCard-body');
      const threadListCardImage = $(elem)
        .find('.threadListCard-image')
        .find('img')
        .attr('srcset')?.replace(' 2x', '');
        
      if (!threadListCardBody.length) {
        console.warn('threadListCard-body not found inside an article element');
        return;
      }
      
      const htmlContent = threadListCardBody.html() ?? '';
      if (htmlContent) {
        const extractedData = extractThreadCardData(htmlContent);
        if (extractedData) {
          // Add the image property
          elementsData.push({ ...extractedData, image: threadListCardImage ?? '' });
        }
      }
    });

    // Filter out null values
    return elementsData.filter(article => article !== null);
  } catch (error) {
    console.error('Failed to download elements:', error);
    return null;
  }
}

/**
 * Extracts data from the HTML content of a thread card
 * @param {string} html - HTML content
 * @returns {Omit<Article, 'image'>|null} - Article data without image
 */
function extractThreadCardData(html) {
  const $ = load(html);

  // Find the thread link element
  const threadLinkElem = $('a.thread-link');
  if (!threadLinkElem.length) {
    console.error('Thread link not found');
    return null;
  }
  const link = threadLinkElem.attr('href')?.trim() || '';
  const title = threadLinkElem.attr('title')?.trim() || threadLinkElem.text().trim();

  // Extract thread price
  const price = $('span.thread-price').text().trim();

  // Extract shipping price
  const shippingPrice = $('span.flex--inline.boxAlign-ai--all-c.color--text-TranslucentSecondary')
    .find('span.overflow--wrap-off')
    .text()
    .trim();

  // Extract description from userHtml content
  const description = $('div.userHtml.userHtml-content')
    .find('div.overflow--wrap-break')
    .text()
    .trim();

  return { link, title, price, shippingPrice, description };
}

module.exports = {
  scrapeArticlesFromPepper
}; 