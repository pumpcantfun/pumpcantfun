/**
 * Memory Manager for Puppet Engine agents
 * Handles storing, retrieving, and updating agent memories
 * Now with MongoDB support as primary storage and file-based as fallback
 */

const { v4: uuidv4 } = require('uuid');
const { AgentMemory, MemoryItem, Relationship } = require('../core/types');
const fs = require('fs');
const path = require('path');
const db = require('../utils/database');

class MemoryManager {
  constructor(options = {}) {
    this.agentMemories = {};
    this.memoryLimit = options.memoryLimit || process.env.DEFAULT_AGENT_MEMORY_LIMIT || 100;
    this.dataDirectory = options.dataDirectory || 'data/memories';
    this.maxMemoryItems = options.maxMemoryItems || 100;
    this.maxTweetHistory = options.maxTweetHistory || 50; // Track last 50 tweets per agent
    this.persistenceEnabled = options.persistenceEnabled !== false;
    
    // Storage preference - try MongoDB first, then file
    this.useMongoDb = options.useMongoDb !== false;
    this.mongoDbConnected = false;
    
    // Ensure memory directory exists (for file fallback)
    if (!fs.existsSync(this.dataDirectory)) {
      fs.mkdirSync(this.dataDirectory, { recursive: true });
    }
    
    // Initialize MongoDB connection
    if (this.useMongoDb) {
      this._initializeMongoDb();
    }
  }
  
  /**
   * Initialize MongoDB connection
   * @private
   */
  async _initializeMongoDb() {
    try {
      await db.connectToDatabase();
      this.mongoDbConnected = true;
      console.log('MemoryManager connected to MongoDB');
    } catch (error) {
      console.error('Failed to connect to MongoDB, falling back to file storage:', error);
      this.mongoDbConnected = false;
    }
  }
  
  /**
   * Initialize an agent's memory from configuration
   */
  async initializeAgentMemory(agentId, initialMemory = {}) {
    const memory = new AgentMemory();
    
    // Add core memories
    if (initialMemory.coreMemories && Array.isArray(initialMemory.coreMemories)) {
      initialMemory.coreMemories.forEach(content => {
        const memoryItem = new MemoryItem(content, 'core');
        memoryItem.id = uuidv4();
        memoryItem.importance = 1.0; // Core memories are maximally important
        memory.coreMemories.push(memoryItem);
      });
    }
    
    // Initialize relationships
    if (initialMemory.relationships && typeof initialMemory.relationships === 'object') {
      Object.keys(initialMemory.relationships).forEach(targetId => {
        const relationshipData = initialMemory.relationships[targetId];
        const relationship = new Relationship(targetId);
        
        // Copy relationship attributes
        Object.assign(relationship, relationshipData);
        
        memory.relationships[targetId] = relationship;
      });
    }
    
    // Add recent events
    if (initialMemory.recentEvents && Array.isArray(initialMemory.recentEvents)) {
      initialMemory.recentEvents.forEach(event => {
        const memoryItem = new MemoryItem(event.content || event, 'event');
        memoryItem.id = uuidv4();
        memoryItem.timestamp = event.timestamp ? new Date(event.timestamp) : new Date();
        memoryItem.importance = event.importance || 0.7;
        memory.recentEvents.push(memoryItem);
      });
    }
    
    // Add tweet history tracking
    if (initialMemory.tweetHistory && Array.isArray(initialMemory.tweetHistory)) {
      initialMemory.tweetHistory.forEach(tweet => {
        const tweetMemory = new MemoryItem(tweet.content, 'tweet');
        tweetMemory.id = uuidv4();
        tweetMemory.timestamp = tweet.timestamp ? new Date(tweet.timestamp) : new Date();
        tweetMemory.importance = 0.8; // Assuming a default importance for tweets
        memory.tweetHistory.push(tweetMemory);
      });
    }
    
    this.agentMemories[agentId] = memory;
    
    // Save to MongoDB if connected, otherwise save to disk
    await this.saveMemory(agentId);
    
    return memory;
  }
  
  /**
   * Get agent memory, initializing if necessary
   */
  async getAgentMemory(agentId) {
    // Try to get from memory cache first
    if (this.agentMemories[agentId]) {
      return this.agentMemories[agentId];
    }
    
    // Try to load from MongoDB
    if (this.mongoDbConnected) {
      try {
        const memoryCollection = await db.getCollection(db.COLLECTIONS.MEMORIES);
        const memoryDoc = await memoryCollection.findOne({ agentId });
        
        if (memoryDoc) {
          this.agentMemories[agentId] = this._deserializeMemoryDocument(memoryDoc);
          console.log(`Loaded memory for agent ${agentId} from MongoDB`);
          return this.agentMemories[agentId];
        }
      } catch (error) {
        console.error(`Error loading memory for agent ${agentId} from MongoDB:`, error);
      }
    }
    
    // Fallback to file storage
    try {
      const memoryPath = path.join(this.dataDirectory, `${agentId}.json`);
      
      if (fs.existsSync(memoryPath)) {
        const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
        this.agentMemories[agentId] = memory;
        
        // Make sure tweetHistory exists (backward compatibility)
        if (!memory.tweetHistory) {
          memory.tweetHistory = [];
        }
        
        console.log(`Loaded memory for agent ${agentId} from file`);
        return memory;
      }
    } catch (error) {
      console.error(`Error loading memory for agent ${agentId} from file:`, error);
    }
    
    // If not found, initialize a new memory
    return this.initializeAgentMemory(agentId);
  }
  
  /**
   * Add a new memory to an agent
   */
  async addMemory(agentId, content, type = 'general', options = {}) {
    const memory = await this.getAgentMemory(agentId);
    const memoryItem = new MemoryItem(content, type);
    memoryItem.id = uuidv4();
    
    // Apply options
    if (options.importance !== undefined) memoryItem.importance = options.importance;
    if (options.emotionalValence !== undefined) memoryItem.emotionalValence = options.emotionalValence;
    if (options.associations) memoryItem.associations = options.associations;
    if (options.metadata) memoryItem.metadata = options.metadata;
    
    // Store in appropriate collection
    if (type === 'core') {
      memory.coreMemories.push(memoryItem);
    } else if (type === 'event') {
      memory.recentEvents.push(memoryItem);
      // Trim events if needed
      if (memory.recentEvents.length > this.memoryLimit / 2) {
        memory.recentEvents.sort((a, b) => b.importance - a.importance);
        memory.recentEvents = memory.recentEvents.slice(0, this.memoryLimit / 2);
      }
    } else {
      memory.longTermMemories.push(memoryItem);
      // Trim long-term memories if needed
      if (memory.longTermMemories.length > this.memoryLimit) {
        memory.longTermMemories.sort((a, b) => b.importance - a.importance);
        memory.longTermMemories = memory.longTermMemories.slice(0, this.memoryLimit);
      }
    }
    
    // Save to MongoDB or disk
    await this.saveMemory(agentId);
    
    return memoryItem;
  }
  
  /**
   * Record a new post by the agent
   */
  async recordPost(agentId, tweetContent, tweetId, metadata = {}) {
    const memory = await this.getAgentMemory(agentId);
    const postMemory = new MemoryItem(`I posted: "${tweetContent}"`, 'post');
    postMemory.id = uuidv4();
    postMemory.metadata = {
      tweetId,
      fullText: tweetContent,
      ...metadata
    };
    
    memory.recentPosts.push(postMemory);
    
    // Keep only the last 20 posts in recent memory
    if (memory.recentPosts.length > 20) {
      memory.recentPosts.shift();
    }
    
    // Add to tweet history
    if (!memory.tweetHistory) {
      memory.tweetHistory = [];
    }
    
    // Push the new post to the front
    memory.tweetHistory.unshift(postMemory);
    
    // Trim the history to keep only maxTweetHistory
    if (memory.tweetHistory.length > this.maxTweetHistory) {
      memory.tweetHistory = memory.tweetHistory.slice(0, this.maxTweetHistory);
    }
    
    // Save tweet to MongoDB Tweet collection if enabled
    if (this.mongoDbConnected) {
      try {
        const tweetCollection = await db.getCollection(db.COLLECTIONS.TWEETS);
        await tweetCollection.insertOne({
          agentId,
          tweetId,
          content: tweetContent,
          timestamp: new Date(),
          metadata
        });
        console.log(`Saved tweet ${tweetId} to MongoDB for agent ${agentId}`);
      } catch (error) {
        console.error(`Error saving tweet to MongoDB for agent ${agentId}:`, error);
      }
    }
    
    // Save memory to MongoDB or disk
    await this.saveMemory(agentId);
    
    return postMemory;
  }
  
  /**
   * Update or create a relationship with another agent
   */
  async updateRelationship(agentId, targetAgentId, changes = {}) {
    const memory = await this.getAgentMemory(agentId);
    const relationship = memory.getRelationship(targetAgentId);
    
    // Apply changes
    Object.keys(changes).forEach(key => {
      if (key === 'sentiment' || key === 'familiarity' || key === 'trust') {
        // Ensure values are within bounds
        relationship[key] = Math.max(-1, Math.min(1, changes[key]));
      } else if (key === 'recentInteractions' && Array.isArray(changes[key])) {
        relationship.recentInteractions = [
          ...changes[key],
          ...relationship.recentInteractions
        ].slice(0, 10); // Keep only 10 most recent
      } else if (key === 'notes' && Array.isArray(changes[key])) {
        relationship.notes = [...changes[key], ...relationship.notes];
      } else if (key === 'sharedExperiences' && Array.isArray(changes[key])) {
        relationship.sharedExperiences = [
          ...changes[key],
          ...relationship.sharedExperiences
        ];
      } else {
        relationship[key] = changes[key];
      }
    });
    
    relationship.lastInteractionDate = new Date();
    
    // Save memory to MongoDB or disk
    await this.saveMemory(agentId);
    
    return relationship;
  }
  
  /**
   * Search for relevant memories based on a query
   */
  async searchMemories(agentId, query, options = {}) {
    const memory = await this.getAgentMemory(agentId);
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.3;
    
    // Simple keyword-based relevance for now
    // In a real implementation, this would use semantic search or embeddings
    const relevanceScore = (memoryItem) => {
      const content = memoryItem.content.toLowerCase();
      const queryTerms = query.toLowerCase().split(' ');
      
      // Count matching terms
      const matches = queryTerms.filter(term => content.includes(term)).length;
      return matches / queryTerms.length;
    };
    
    // Combine all memories
    const allMemories = [
      ...memory.coreMemories,
      ...memory.recentEvents,
      ...memory.longTermMemories
    ];
    
    // Score and filter memories
    const scoredMemories = allMemories
      .map(item => ({ 
        item,
        score: relevanceScore(item) * item.importance
      }))
      .filter(({ score }) => score > threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    return scoredMemories.map(({ item }) => item);
  }
  
  /**
   * Get all memories to serialize for an agent
   */
  serializeAgentMemory(agentId) {
    const memory = this.agentMemories[agentId];
    return {
      agentId,
      coreMemories: memory.coreMemories,
      recentEvents: memory.recentEvents,
      recentPosts: memory.recentPosts,
      relationships: memory.relationships,
      longTermMemories: memory.longTermMemories,
      tweetHistory: memory.tweetHistory,
      lastUpdated: new Date()
    };
  }
  
  /**
   * Convert MongoDB document back to memory object
   * @private
   */
  _deserializeMemoryDocument(doc) {
    const memory = new AgentMemory();
    
    if (doc.coreMemories) memory.coreMemories = doc.coreMemories;
    if (doc.recentEvents) memory.recentEvents = doc.recentEvents;
    if (doc.recentPosts) memory.recentPosts = doc.recentPosts;
    if (doc.relationships) memory.relationships = doc.relationships;
    if (doc.longTermMemories) memory.longTermMemories = doc.longTermMemories;
    if (doc.tweetHistory) memory.tweetHistory = doc.tweetHistory;
    
    return memory;
  }
  
  /**
   * Save memory to MongoDB if connected, otherwise to disk
   */
  async saveMemory(agentId) {
    const memory = this.agentMemories[agentId];
    
    // Only proceed if persistence is enabled
    if (!this.persistenceEnabled) return;
    
    // First try to save to MongoDB
    if (this.mongoDbConnected) {
      try {
        const memoryCollection = await db.getCollection(db.COLLECTIONS.MEMORIES);
        const memoryDoc = this.serializeAgentMemory(agentId);
        
        // Use upsert to insert or update
        await memoryCollection.updateOne(
          { agentId },
          { $set: memoryDoc },
          { upsert: true }
        );
        
        console.log(`Saved memory for agent ${agentId} to MongoDB`);
        return; // Skip file storage if MongoDB save was successful
      } catch (error) {
        console.error(`Error saving memory for agent ${agentId} to MongoDB:`, error);
        // Fall through to file storage as backup
      }
    }
    
    // Fall back to file storage
    try {
      const memoryPath = path.join(this.dataDirectory, `${agentId}.json`);
      fs.writeFileSync(memoryPath, JSON.stringify(this.serializeAgentMemory(agentId)));
      console.log(`Saved memory for agent ${agentId} to file (MongoDB fallback)`);
    } catch (error) {
      console.error(`Error saving memory for agent ${agentId} to file:`, error);
    }
  }
  
  /**
   * Save token state to database
   * @param {string} agentId - Agent ID
   * @param {object} tokenState - Token state to save
   */
  async saveTokenState(agentId, tokenState) {
    if (this.mongoDbConnected) {
      try {
        const tokenCollection = await db.getCollection(db.COLLECTIONS.TOKENS);
        
        // Add timestamp and agent ID
        const tokenDoc = {
          ...tokenState,
          agentId,
          lastUpdated: new Date()
        };
        
        // Use upsert to create or update
        await tokenCollection.updateOne(
          { agentId },
          { $set: tokenDoc },
          { upsert: true }
        );
        
        console.log(`Saved token state for agent ${agentId} to MongoDB`);
      } catch (error) {
        console.error(`Error saving token state to MongoDB for agent ${agentId}:`, error);
      }
    }
  }
  
  /**
   * Get token state from database
   * @param {string} agentId - Agent ID
   * @returns {object|null} Token state or null if not found
   */
  async getTokenState(agentId) {
    if (this.mongoDbConnected) {
      try {
        const tokenCollection = await db.getCollection(db.COLLECTIONS.TOKENS);
        const tokenDoc = await tokenCollection.findOne({ agentId });
        
        if (tokenDoc) {
          // Remove MongoDB-specific fields
          const { _id, ...tokenState } = tokenDoc;
          return tokenState;
        }
      } catch (error) {
        console.error(`Error getting token state from MongoDB for agent ${agentId}:`, error);
      }
    }
    
    return null;
  }
  
  /**
   * Get recent tweet history for an agent
   * @param {string} agentId - The agent ID
   * @param {number} limit - Maximum number of tweets to return (defaults to 10)
   * @returns {Array} Recent tweets
   */
  async getRecentTweets(agentId, limit = 10) {
    // Try to get from MongoDB first if connected
    if (this.mongoDbConnected) {
      try {
        const tweetCollection = await db.getCollection(db.COLLECTIONS.TWEETS);
        const tweets = await tweetCollection.find(
          { agentId }
        )
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
        
        if (tweets && tweets.length > 0) {
          return tweets;
        }
      } catch (error) {
        console.error(`Error getting recent tweets from MongoDB for agent ${agentId}:`, error);
      }
    }
    
    // Fall back to memory
    const memory = await this.getAgentMemory(agentId);
    
    if (!memory.tweetHistory) {
      return [];
    }
    
    return memory.tweetHistory.slice(0, limit);
  }
  
  /**
   * Check if a topic has been recently tweeted about
   * @param {string} agentId - The agent ID
   * @param {string} topic - Topic to check for
   * @param {number} lookbackCount - How many tweets to check (defaults to 10)
   * @returns {boolean} Whether the topic has been recently tweeted about
   */
  async hasRecentlyTweetedAbout(agentId, topic, lookbackCount = 10) {
    const recentTweets = await this.getRecentTweets(agentId, lookbackCount);
    
    if (!recentTweets || recentTweets.length === 0) {
      return false;
    }
    
    // Check if any of them contain the topic (case insensitive)
    const topicLower = topic.toLowerCase();
    return recentTweets.some(tweet => {
      const content = tweet.content || (tweet.metadata && tweet.metadata.fullText) || '';
      return content.toLowerCase().includes(topicLower);
    });
  }
  
  /**
   * Extract potential topics from previous tweets for avoidance
   * @param {string} agentId - The agent ID
   * @param {number} lookbackCount - How many tweets to analyze
   * @returns {Array} Array of potential topics to avoid repeating
   */
  async getRecentTopics(agentId, lookbackCount = 15) {
    const recentTweets = await this.getRecentTweets(agentId, lookbackCount);
    
    if (!recentTweets || recentTweets.length === 0) {
      return [];
    }
    
    // Extract topics (this is a simplified approach - could be enhanced with NLP)
    const topics = new Set();
    const commonWords = new Set(['the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'like', 'as', 'from', 'but', 'not', 'or', 'if', 'when', 'what', 'why', 'how', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'this', 'that', 'these', 'those', 'it', 'its', 'it\'s', 'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'his', 'her', 'our', 'their', 'mine', 'yours', 'his', 'hers', 'ours', 'theirs']);
    
    recentTweets.forEach(tweet => {
      // Get the content from tweet
      const content = tweet.content || (tweet.metadata && tweet.metadata.fullText) || '';
      
      // Extract potential nouns and topics
      const words = content
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/); // Split by whitespace
      
      words.forEach(word => {
        // Skip common words and very short words
        if (!commonWords.has(word) && word.length > 3) {
          topics.add(word);
        }
      });
    });
    
    return Array.from(topics);
  }
  
  /**
   * Add tweet to an agent's memory
   * @param {string} agentId - ID of the agent
   * @param {Object} tweet - Tweet object with content and timestamp
   */
  async addTweetToAgentMemory(agentId, tweet) {
    // Save to MongoDB tweets collection if connected
    if (this.mongoDbConnected) {
      try {
        const tweetCollection = await db.getCollection(db.COLLECTIONS.TWEETS);
        await tweetCollection.insertOne({
          agentId,
          tweetId: tweet.id || uuidv4(),
          content: tweet.content,
          timestamp: tweet.timestamp || new Date(),
          metadata: tweet.metadata || {}
        });
      } catch (error) {
        console.error(`Error saving tweet to MongoDB for agent ${agentId}:`, error);
      }
    }
    
    // Initialize the agent's memory if it doesn't exist
    if (!this.agentMemories[agentId]) {
      await this.initializeAgentMemory(agentId);
    }
    
    // Initialize tweetHistory array if it doesn't exist
    if (!this.agentMemories[agentId].tweetHistory) {
      this.agentMemories[agentId].tweetHistory = [];
    }
    
    // Add tweet to recent tweets
    this.agentMemories[agentId].tweetHistory.unshift(tweet);
    
    // Keep only the last N tweets
    if (this.agentMemories[agentId].tweetHistory.length > this.maxTweetHistory) {
      this.agentMemories[agentId].tweetHistory = this.agentMemories[agentId].tweetHistory.slice(0, this.maxTweetHistory);
    }
    
    // Save to MongoDB or disk
    await this.saveMemory(agentId);
  }
}

module.exports = MemoryManager; 