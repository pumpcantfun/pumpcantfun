/**
 * Twitter Mention Handler - WORKING SOLUTION!
 * Uses v2 API with Production App credentials
 */

const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

class TwitterMentionHandler {
  constructor(credentials) {
    // Use production app credentials for mention access
    this.client = new TwitterApi({
      appKey: credentials.appKey,
      appSecret: credentials.appSecret,
      accessToken: credentials.accessToken,
      accessSecret: credentials.accessTokenSecret
    });
    
    this.userId = null;
    this.username = null;
    this.lastMentionId = null;
    this.processedMentionsFile = path.join(__dirname, '../../data/processed_mentions.json');
    this.processedMentions = this.loadProcessedMentions();
  }

  loadProcessedMentions() {
    try {
      if (fs.existsSync(this.processedMentionsFile)) {
        const data = fs.readFileSync(this.processedMentionsFile, 'utf8');
        const mentionIds = JSON.parse(data);
        console.log(`📝 Loaded ${mentionIds.length} processed mention IDs`);
        return new Set(mentionIds);
      }
    } catch (error) {
      console.error('Error loading processed mentions:', error);
    }
    return new Set();
  }

  saveProcessedMentions() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.processedMentionsFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      const mentionIds = Array.from(this.processedMentions);
      fs.writeFileSync(this.processedMentionsFile, JSON.stringify(mentionIds, null, 2));
    } catch (error) {
      console.error('Error saving processed mentions:', error);
    }
  }

  async initialize() {
    try {
      const me = await this.client.v2.me();
      this.userId = me.data.id;
      this.username = me.data.username;
      console.log(`✅ Mention handler initialized for @${this.username}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Get mentions using v2 mention timeline API
   * THIS WORKS WITH PRODUCTION APP!
   */
  async getMentions(options = {}) {
    try {
      console.log(`🔍 Checking mentions for @${this.username}...`);
      
      const params = {
        max_results: options.limit || 10,
        'tweet.fields': ['created_at', 'author_id', 'conversation_id', 'referenced_tweets', 'in_reply_to_user_id'],
        'user.fields': ['username'],
        expansions: ['author_id', 'referenced_tweets.id', 'in_reply_to_user_id']
      };
      
      // Add pagination
      if (this.lastMentionId) {
        params.since_id = this.lastMentionId;
      }
      
      const mentions = await this.client.v2.userMentionTimeline(this.userId, params);
      
      if (!mentions.data || mentions.data.length === 0) {
        console.log('No new mentions found');
        return [];
      }
      
      console.log(`✅ Found ${mentions.data.data ? mentions.data.data.length : 0} mentions`);
      
      // Check if we have data
      if (!mentions.data.data || mentions.data.data.length === 0) {
        return [];
      }
      
      // Extract user info
      const userMap = {};
      if (mentions.data.includes && mentions.data.includes.users) {
        mentions.data.includes.users.forEach(user => {
          userMap[user.id] = user.username;
        });
      }
      
      // Process mentions
      const newMentions = [];
      for (const mention of mentions.data.data) {
        if (!this.processedMentions.has(mention.id)) {
          this.processedMentions.add(mention.id);
          this.saveProcessedMentions(); // Save immediately
          
          newMentions.push({
            id: mention.id,
            text: mention.text,
            created_at: mention.created_at,
            author_id: mention.author_id,
            author_username: userMap[mention.author_id] || 'unknown',
            in_reply_to_user_id: mention.in_reply_to_user_id,
            conversation_id: mention.conversation_id
          });
        }
      }
      
      // Update last mention ID
      if (newMentions.length > 0) {
        this.lastMentionId = newMentions[0].id;
      }
      
      return newMentions;
      
    } catch (error) {
      console.error('Error getting mentions:', error);
      return [];
    }
  }

  /**
   * Reply to a mention
   */
  async replyToMention(mentionId, replyText) {
    try {
      const result = await this.client.v2.reply(replyText, mentionId);
      console.log(`✅ Replied to mention ${mentionId}`);
      return result.data;
    } catch (error) {
      console.error('Error replying to mention:', error);
      throw error;
    }
  }

  /**
   * Post a regular tweet
   */
  async postTweet(text) {
    try {
      const result = await this.client.v2.tweet(text);
      console.log(`✅ Posted tweet: "${text.substring(0, 50)}..."`);
      return result.data;
    } catch (error) {
      console.error('Error posting tweet:', error);
      throw error;
    }
  }

  /**
   * Start polling for mentions
   */
  async startPolling(onMention, intervalMs = 60000) {
    console.log(`🚀 Starting mention polling every ${intervalMs/1000} seconds`);
    
    // Initial check
    const mentions = await this.getMentions();
    if (mentions.length > 0 && onMention) {
      for (const mention of mentions) {
        await onMention(mention);
      }
    }
    
    // Set up polling
    this.pollingInterval = setInterval(async () => {
      try {
        const mentions = await this.getMentions();
        if (mentions.length > 0 && onMention) {
          for (const mention of mentions) {
            await onMention(mention);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, intervalMs);
    
    return this.pollingInterval;
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      console.log('Stopped mention polling');
    }
  }
}

module.exports = TwitterMentionHandler;