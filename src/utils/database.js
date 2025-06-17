/**
 * MongoDB Database Connection Utility
 * Handles connections and provides helper methods for database operations
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

// MongoDB connection string from environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/puppet-engine';

// Database and collection names
const DB_NAME = 'puppet-engine';
const COLLECTIONS = {
  MEMORIES: 'agent-memories',
  TWEETS: 'agent-tweets',
  TOKENS: 'agent-tokens',
  EVENTS: 'agent-events'
};

// Singleton client instance
let client = null;
let db = null;

/**
 * Initialize the database connection
 * @returns {Promise<Object>} The database instance
 */
async function connectToDatabase() {
  try {
    if (client) {
      return { client, db };
    }

    console.log('Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('Successfully connected to MongoDB');
    
    db = client.db(DB_NAME);
    
    // Set up any required indexes
    await db.collection(COLLECTIONS.MEMORIES).createIndex({ agentId: 1 });
    await db.collection(COLLECTIONS.TWEETS).createIndex({ agentId: 1, timestamp: -1 });
    await db.collection(COLLECTIONS.TOKENS).createIndex({ agentId: 1 }, { unique: true });
    
    return { client, db };
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}

/**
 * Close the database connection
 * @returns {Promise<void>}
 */
async function closeConnection() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('MongoDB connection closed');
  }
}

/**
 * Get a specific collection
 * @param {string} collectionName - The name of the collection to get
 * @returns {Promise<Collection>} The MongoDB collection
 */
async function getCollection(collectionName) {
  if (!db) {
    await connectToDatabase();
  }
  return db.collection(collectionName);
}

/**
 * Get all collection names
 * @returns {Promise<string[]>} Array of collection names
 */
async function getCollections() {
  if (!db) {
    await connectToDatabase();
  }
  const collections = await db.listCollections().toArray();
  return collections.map(collection => collection.name);
}

// Export the database connection and helper functions
module.exports = {
  connectToDatabase,
  closeConnection,
  getCollection,
  getCollections,
  COLLECTIONS,
  // Helper to check if connected
  isConnected: () => !!client && !!db
}; 