const express = require('express');
const router = express.Router();
const categorizeService = require('../services/categorizeService');

/**
 * @route POST /api/categorize
 * @desc Kategoryzuje artykuły przy użyciu AI lub słów kluczowych
 * @access Public
 * @body {Array} articles - Artykuły do kategoryzacji
 * @body {Object} options - Opcje kategoryzacji
 */
router.post('/', async (req, res) => {
  try {
    const { articles, options = {} } = req.body;
    
    // Check if articles array is valid
    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request: articles array is required' 
      });
    }
    
    // Categorize articles using the service
    const result = await categorizeService.categorizeArticles(articles, options);
    
    // Return the categorized articles
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in categorize API handler:', error);
    return res.status(500).json({ 
      categorizedArticles: {},
      fromCache: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    });
  }
});

/**
 * @route GET /api/categorize/categories
 * @desc Returns predefined categories
 * @access Public
 */
router.get('/categories', (req, res) => {
  res.json({ categories: categorizeService.getCategories() });
});

module.exports = router; 