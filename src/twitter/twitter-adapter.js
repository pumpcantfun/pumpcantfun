/**
 * Twitter Adapter
 * Provides a unified interface to the Twitter API client
 */

const TwitterClient = require('./twitter-client');

class TwitterAdapter {
  /**
   * Create a new TwitterAdapter
   * @param {Object} options Configuration options
   * @param {Object} options.apiCredentials Twitter API credentials
   */
  constructor(options = {}) {
    console.log('Using official Twitter API client');
    this.client = new TwitterClient({
      credentials: {
        apiKey: options.apiCredentials?.apiKey,
        apiKeySecret: options.apiCredentials?.apiKeySecret,
        accessToken: options.apiCredentials?.accessToken,
        accessTokenSecret: options.apiCredentials?.accessTokenSecret,
        bearerToken: options.apiCredentials?.bearerToken
      }
    });
  }
  
  /**
   * Register a Twitter client for an agent
   */
  async registerAgentClient(agentId, credentials) {
    return this.client.registerAgentClient(agentId, credentials);
  }
  
  /**
   * Get the appropriate client for an agent
   */
  getClientForAgent(agentId) {
    return this.client.getClientForAgent(agentId);
  }
  
  /**
   * Post a tweet for an agent
   */
  async postTweet(agentId, content, options = {}) {
    return this.client.postTweet(agentId, content, options);
  }
  
  /**
   * Post a thread of tweets
   */
  async postThread(agentId, contentArray, options = {}) {
    return this.client.postThread(agentId, contentArray, options);
  }
  
  /**
   * Get a tweet by ID
   */
  async getTweet(tweetId) {
    return this.client.getTweet(tweetId);
  }
  
  /**
   * Get recent tweets from a user timeline
   */
  async getUserTimeline(userId, options = {}) {
    return this.client.getUserTimeline(userId, options);
  }
  
  /**
   * Monitor mentions for an agent
   */
  async getAgentMentions(agentId, options = {}) {
    return this.client.getAgentMentions(agentId, options);
  }
  
  /**
   * Like a tweet
   */
  async likeTweet(agentId, tweetId) {
    return this.client.likeTweet(agentId, tweetId);
  }
  
  /**
   * Start streaming mentions for an agent in real-time
   * @param {string} agentId - The ID of the agent to stream mentions for
   * @param {function} onMention - Callback function to handle each mention
   * @param {Object} options - Additional options
   * @returns {Object} - Stream connection object
   */
  async startMentionStream(agentId, onMention, options = {}) {
    return this.client.startMentionStream(agentId, onMention, options);
  }
  
  /**
   * Cleanup resources
   */
  async close() {
    if (this.client && typeof this.client.close === 'function') {
      await this.client.close();
    }
    return;
  }
}

module.exports = TwitterAdapter; 