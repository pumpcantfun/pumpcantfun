/**
 * Agent Manager for Puppet Engine
 * Handles loading, managing, and controlling agent behavior
 */

const fs = require('fs');
const path = require('path');
const { Agent, Personality, StyleGuide } = require('../core/types');
const MemoryManager = require('../memory/memory-manager');
const OpenAIProvider = require('../llm/openai-provider');
const GrokProvider = require('../llm/grok-provider');
const TwitterClient = require('../twitter/twitter-client');
const cron = require('node-cron');
const behaviorRandomizer = require('./behavior-randomizer');

class AgentManager {
  constructor(options = {}) {
    this.agents = {};
    this.memoryManager = options.memoryManager || new MemoryManager();
    this.defaultLLMProvider = options.llmProvider || new OpenAIProvider();
    this.llmProviders = options.llmProviders || { 
      openai: this.defaultLLMProvider,
      grok: new GrokProvider()
    };
    this.agentLLMProviders = {}; // Map of agent ID to their specific LLM provider
    this.twitterClient = options.twitterClient || new TwitterClient();
    this.eventEngine = options.eventEngine;
    
    this.lastPostTime = {}; // Track when agents last posted
    this.postSchedules = {}; // Cron schedules for agent posts
    this.nextPostTimes = {}; // Track next scheduled post time for each agent
    this.processedTweetIds = new Set(); // Track IDs of processed tweets
    
    // Twitter API error tracking
    this.apiErrorCounts = {}; // Track consecutive API errors by agent
    this.apiCooldowns = {}; // Track cooldown end times by agent
    
    // Setup event listeners
    if (this.eventEngine) {
      this.setupEventListeners();
    }
  }
  
  /**
   * Load agents from configuration files
   */
  async loadAgents(configDir = 'config/agents') {
    try {
      // Get all agent config files
      const files = fs.readdirSync(configDir);
      
      // Load each agent
      for (const file of files) {
        if (file.endsWith('.json')) {
          const configPath = path.join(configDir, file);
          const agentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          await this.loadAgent(agentConfig);
        }
      }
      
      console.log(`Loaded ${Object.keys(this.agents).length} agents`);
    } catch (error) {
      console.error('Error loading agents:', error);
      throw error;
    }
  }
  
  /**
   * Load a single agent from configuration
   */
  async loadAgent(config) {
    try {
      if (!config.id) {
        throw new Error('Agent config must have an ID');
      }
      
      // Create new agent
      const agent = new Agent();
      agent.id = config.id;
      agent.name = config.name || config.id;
      agent.description = config.description || '';
      
      // Set up personality
      if (config.personality) {
        agent.personality.traits = config.personality.traits || [];
        agent.personality.values = config.personality.values || [];
        agent.personality.speakingStyle = config.personality.speaking_style || '';
        agent.personality.interests = config.personality.interests || [];
      }
      
      // Set up style guide
      if (config.style_guide) {
        agent.styleGuide.voice = config.style_guide.voice || '';
        agent.styleGuide.tone = config.style_guide.tone || '';
        
        if (config.style_guide.formatting) {
          agent.styleGuide.formatting.usesHashtags = config.style_guide.formatting.uses_hashtags || false;
          agent.styleGuide.formatting.hashtagStyle = config.style_guide.formatting.hashtag_style || '';
          agent.styleGuide.formatting.usesEmojis = config.style_guide.formatting.uses_emojis || false;
          agent.styleGuide.formatting.emojiFrequency = config.style_guide.formatting.emoji_frequency || '';
          agent.styleGuide.formatting.capitalization = config.style_guide.formatting.capitalization || '';
          agent.styleGuide.formatting.sentenceLength = config.style_guide.formatting.sentence_length || '';
        }
        
        agent.styleGuide.topicsToAvoid = config.style_guide.topics_to_avoid || [];
      }
      
      // Set up custom system prompt if provided
      if (config.custom_system_prompt) {
        agent.customSystemPrompt = config.custom_system_prompt;
        console.log(`Loaded custom system prompt for agent ${agent.id}`);
      }
      
      // Set up rotating system prompts if provided
      if (config.rotating_system_prompts && Array.isArray(config.rotating_system_prompts) && config.rotating_system_prompts.length > 0) {
        agent.rotatingSystemPrompts = config.rotating_system_prompts;
        console.log(`Loaded ${agent.rotatingSystemPrompts.length} rotating system prompts for agent ${agent.id}`);
      } else {
        // Initialize with empty array if not provided
        agent.rotatingSystemPrompts = [];
      }
      
      // Set up behavior
      if (config.behavior) {
        if (config.behavior.post_frequency) {
          agent.behavior.postFrequency.minHoursBetweenPosts = 
            config.behavior.post_frequency.min_hours_between_posts || 3;
          agent.behavior.postFrequency.maxHoursBetweenPosts = 
            config.behavior.post_frequency.max_hours_between_posts || 12;
          agent.behavior.postFrequency.peakPostingHours = 
            config.behavior.post_frequency.peak_posting_hours || [];
        }
        
        if (config.behavior.interaction_patterns) {
          agent.behavior.interactionPatterns.replyProbability = 
            config.behavior.interaction_patterns.reply_probability || 0.5;
          agent.behavior.interactionPatterns.quoteTweetProbability = 
            config.behavior.interaction_patterns.quote_tweet_probability || 0.3;
          agent.behavior.interactionPatterns.likeProbability = 
            config.behavior.interaction_patterns.like_probability || 0.7;
        }
        
        if (config.behavior.content_preferences) {
          agent.behavior.contentPreferences.maxThreadLength = 
            config.behavior.content_preferences.max_thread_length || 3;
          agent.behavior.contentPreferences.typicalPostLength = 
            config.behavior.content_preferences.typical_post_length || 240;
          agent.behavior.contentPreferences.linkSharingFrequency = 
            config.behavior.content_preferences.link_sharing_frequency || 0.2;
        }
      }
      
      // Set agent's LLM provider based on configuration
      if (config.llm_provider) {
        const providerName = config.llm_provider.toLowerCase();
        if (this.llmProviders[providerName]) {
          this.agentLLMProviders[agent.id] = this.llmProviders[providerName];
          console.log(`Using ${providerName} provider for agent ${agent.id}`);
        } else {
          console.log(`LLM provider ${providerName} not found for agent ${agent.id}, using default provider`);
          this.agentLLMProviders[agent.id] = this.defaultLLMProvider;
        }
      } else {
        // Default to OpenAI if not specified
        this.agentLLMProviders[agent.id] = this.defaultLLMProvider;
      }
      
      // Initialize memory
      if (config.initial_memory) {
        agent.memory = this.memoryManager.initializeAgentMemory(
          agent.id, 
          config.initial_memory
        );
      } else {
        agent.memory = this.memoryManager.getAgentMemory(agent.id);
      }
      
      // Register agent-specific Twitter client if credentials are provided
      if (config.twitter_credentials) {
        console.log(`Registering Twitter client for agent ${agent.id}`);
        
        // Check if we're using API or web scraping
        const useTwitterAPI = process.env.USE_TWITTER_API !== 'false';
        
        if (useTwitterAPI) {
          // Using official API - check for API keys
          if (config.twitter_credentials.apiKey && 
              config.twitter_credentials.apiKeySecret && 
              config.twitter_credentials.accessToken && 
              config.twitter_credentials.accessTokenSecret) {
            this.twitterClient.registerAgentClient(agent.id, config.twitter_credentials);
          } else {
            console.log(`No valid Twitter API credentials for agent ${agent.id}, using default client`);
          }
        } else {
          // Using web scraping - check for username/password
          if (config.twitter_credentials.username && 
              config.twitter_credentials.password) {
            this.twitterClient.registerAgentClient(agent.id, config.twitter_credentials);
          } else {
            // Check if credentials exist in environment variables
            const envUsername = process.env[`TWITTER_USERNAME_${agent.id}`];
            const envPassword = process.env[`TWITTER_PASSWORD_${agent.id}`];
            
            if (envUsername && envPassword) {
              this.twitterClient.registerAgentClient(agent.id, {
                username: envUsername,
                password: envPassword
              });
            } else {
              console.log(`No valid Twitter credentials for agent ${agent.id}, using default client`);
            }
          }
        }
      } else {
        console.log(`No Twitter credentials provided for agent ${agent.id}, using default client`);
      }
      
      // Store the agent
      this.agents[agent.id] = agent;
      
      // Schedule posts for this agent
      this.scheduleAgentPosts(agent.id);
      
      return agent;
    } catch (error) {
      console.error(`Error loading agent from config:`, error);
      throw error;
    }
  }
  
  /**
   * Get an agent by ID
   */
  getAgent(agentId) {
    const agent = this.agents[agentId];
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return agent;
  }
  
  /**
   * Get the LLM provider for a specific agent
   */
  getLLMProviderForAgent(agentId) {
    return this.agentLLMProviders[agentId] || this.defaultLLMProvider;
  }
  
  /**
   * Schedule posts for an agent based on their posting frequency
   */
  scheduleAgentPosts(agentId) {
    const agent = this.getAgent(agentId);
    
    // Cancel existing schedule if any
    if (this.postSchedules[agentId]) {
      this.postSchedules[agentId].stop();
    }
    
    // Use a recurring check that schedules the next post dynamically
    // This allows for timing variations while maintaining consistent activity
    const checkInterval = 60 * 1000; // Check every minute
    
    // Schedule the recurring check
    this.postSchedules[agentId] = cron.schedule('* * * * *', () => {
      const now = Date.now();
      
      // If we have a next post time and it's in the past, create a post
      if (this.nextPostTimes[agentId] && now >= this.nextPostTimes[agentId]) {
        // Reset next post time
        this.nextPostTimes[agentId] = null;
        
        // Create the post
        this.createAgentPost(agentId);
        
        // Schedule the next post with randomized timing
        this.scheduleNextPost(agentId);
      } 
      // If we don't have a next post time scheduled, create one
      else if (!this.nextPostTimes[agentId]) {
        this.scheduleNextPost(agentId);
      }
    });
    
    // Schedule the first post with a short delay to start things off
    setTimeout(() => {
      this.scheduleNextPost(agentId);
    }, 10000); // 10 seconds delay
    
    console.log(`Scheduled posting for agent ${agentId}`);
  }
  
  /**
   * Schedule the next post for an agent with natural timing variations
   */
  scheduleNextPost(agentId) {
    const agent = this.getAgent(agentId);
    
    // Get randomized interval for next post
    const nextPostInterval = behaviorRandomizer.getNextPostInterval(agent);
    const nextPostTime = Date.now() + nextPostInterval;
    
    // Store the next post time
    this.nextPostTimes[agentId] = nextPostTime;
    
    // Log the schedule
    const minutesUntilPost = Math.round(nextPostInterval / (60 * 1000));
    console.log(`Scheduled next post for agent ${agentId} in ~${minutesUntilPost} minutes`);
  }
  
  /**
   * Create a new post for an agent
   */
  async createAgentPost(agentId, options = {}) {
    try {
      const agent = this.getAgent(agentId);
      
      // Check if enough time has passed since last post
      const now = Date.now();
      const minTimeBetweenPosts = agent.behavior.postFrequency.minHoursBetweenPosts * 60 * 60 * 1000;
      
      if (
        agent.lastPostTime && 
        now - agent.lastPostTime < minTimeBetweenPosts &&
        !options.ignoreTimeConstraint
      ) {
        console.log(`Too soon for agent ${agentId} to post again`);
        return null;
      }
      
      // Get the agent's LLM provider
      const llmProvider = this.getLLMProviderForAgent(agentId);
      if (!llmProvider) {
        throw new Error(`LLM provider '${agent.llm_provider}' not found for agent ${agentId}`);
      }
      
      let content = '';
      let usedPromptIndex = -1; // Track which prompt was used (-1 = custom prompt, -2 = default)
      let tweetMetadata = {}; // Store metadata about the generated tweet
      
      // If the agent has rotating prompts, capture which one is used
      if (agent.rotatingSystemPrompts && agent.rotatingSystemPrompts.length > 0) {
        // We don't know which one will be selected yet, but we'll track it in metadata
        tweetMetadata.hasRotatingPrompts = true;
        tweetMetadata.numRotatingPrompts = agent.rotatingSystemPrompts.length;
      }
      
      if (options.task === 'reply' && options.replyTo) {
        // For replies, use the reply-specific method
        content = await llmProvider.generateContent(agent, {
          task: 'reply',
          replyTo: options.replyTo,
          avoidContextQuestions: options.avoidContextQuestions
        });
        
        // Double check to ensure no @mentions are included in replies
        content = content.replace(/@\w+\s?/g, '');
      } else {
        // For new tweets, use direct generateTweet method with minimal overhead
        // This approach lets the custom system prompt shine through
        
        // If we're using Coby agent, use the enhanced direct approach
        if (agentId === 'coby-agent') {
          // Use the custom system prompt directly as the user prompt
          // This bypasses any wrapper logic and sends the prompt straight to the model
          const userPrompt = agent.customSystemPrompt;
          
          content = await llmProvider.generateTweet(agent, userPrompt);
        } else {
          // For other agents, use a simpler approach that still preserves their personality
          content = await llmProvider.generateTweet(agent);
        }
      }
      
      // Post-processing to ensure style compliance
      // Enforce lowercase for Coby's tweets
      if (agentId === 'coby-agent') {
        content = content.toLowerCase();
      }
      
      // Post to Twitter if client is available
      let tweetId = null;
      if (this.twitterClient) {
        try {
          // For replies, use replyToTweetId
          const tweetOptions = {};
          if (options.task === 'reply' && options.replyTo && options.replyTo.id) {
            tweetOptions.replyToTweetId = options.replyTo.id;
          }
          
          const tweet = await this.twitterClient.postTweet(agentId, content, tweetOptions);
          tweetId = tweet.id;
          
          if (options.task === 'reply') {
            console.log(`Posted reply for ${agentId}: ${content}`);
          } else {
            console.log(`Posted tweet for ${agentId}: ${content}`);
          }
        } catch (tweetError) {
          console.error(`Error posting tweet for ${agentId}:`, tweetError);
        }
      }
      
      // Track the post for the agent
      agent.lastPostTime = now;
      
      // Store tweet in memory if memory manager is available
      if (this.memoryManager) {
        // Store prompt metadata
        const tweetData = { 
          content, 
          timestamp: now, 
          id: tweetId,
          isReply: options.task === 'reply',
          metadata: tweetMetadata  // Include metadata about which prompt was used
        };
        
        this.memoryManager.addTweetToAgentMemory(agentId, tweetData);
      }
      
      // Schedule the next post
      this.scheduleNextPost(agentId);
      
      return { content, agentId, tweetId };
    } catch (error) {
      console.error(`Error creating post for agent ${agentId}:`, error);
      throw error;
    }
  }
  
  /**
   * Process an agent reaction to a tweet
   */
  async processAgentReaction(agentId, tweet) {
    try {
      const agent = this.getAgent(agentId);
      const llmProvider = this.getLLMProviderForAgent(agentId);
      
      // Get the agent's username for more accurate self-mention filtering
      let agentUsername = null;
      try {
        const meResult = await this.twitterClient.getClientForAgent(agentId).v2.me();
        agentUsername = meResult.data.username.toLowerCase();
      } catch (error) {
        console.log(`Unable to fetch username for filtering: ${error.message}`);
        // Continue without the username - we'll still have the ID check
      }
      
      // Enhanced check to skip if the tweet is from the agent itself (check both ID and username)
      const isSelfMention = 
        tweet.authorId === agentId || 
        (agentUsername && tweet.authorUsername && 
         tweet.authorUsername.toLowerCase() === agentUsername);
      
      if (isSelfMention) {
        console.log(`Skipping self-mention from ${tweet.authorUsername || tweet.authorId}`);
        return null;
      }
      
      // Skip if we've already processed this tweet
      if (this.processedTweetIds.has(tweet.id)) {
        console.log(`Skipping tweet ${tweet.id} as it was already processed`);
        return null;
      }
      
      // Add this tweet to our processed set
      this.processedTweetIds.add(tweet.id);
      
      // For mentions and replies, always reply
      // Check for mentions in different ways to be thorough
      const isMention = 
        tweet.isDirectMention || // Check the direct mention flag first
        tweet.content.toLowerCase().includes(`@${agent.name.toLowerCase()}`) || 
        tweet.content.toLowerCase().includes(`@${agentId.toLowerCase()}`) || 
        tweet.replyToId && String(tweet.replyToId).includes(agentId);
      
      console.log(`Checking mention status for tweet: "${tweet.content.substring(0, 30)}..."`);
      console.log(`isMention: ${isMention}, author: ${tweet.authorId}, replyToId: ${tweet.replyToId}`);
      
      if (isMention) {
        console.log(`Detected mention of ${agentId}, creating reply immediately`);
        
        // For replies, we need to check if this is a reply to another tweet
        // If so, fetch that tweet to include in the context
        let originalTweet = null;
        let conversationHistory = [];
        let hasMeaningfulContext = false;
        
        if (tweet.replyToId) {
          try {
            console.log(`Fetching original tweet ${tweet.replyToId} for context`);
            originalTweet = await this.twitterClient.getTweet(tweet.replyToId);
            console.log(`Found original tweet: "${originalTweet.content.substring(0, 30)}..."`);
            hasMeaningfulContext = true;
            
            // Recursively fetch the conversation thread if not already provided
            if (!tweet.conversationHistory) {
              await this.fetchConversationThread(tweet.replyToId, conversationHistory, agentId);
              
              // Sort conversation history chronologically (oldest first)
              conversationHistory.sort((a, b) => {
                if (a.timestamp && b.timestamp) {
                  return a.timestamp - b.timestamp;
                }
                return 0;
              });
              
              // Add the current tweet to conversation history
              conversationHistory.push({
                role: "user",
                content: tweet.content,
                timestamp: tweet.createdAt ? tweet.createdAt.getTime() : Date.now()
              });
              
              // Enhance the context with the conversation history
              tweet.originalTweet = originalTweet;
              tweet.conversationHistory = conversationHistory;
            }
          } catch (error) {
            console.error(`Error fetching original tweet ${tweet.replyToId}:`, error);
            // Continue anyway even if we couldn't fetch the original
          }
        }
        
        // If there's no meaningful context, provide some default context
        if (!hasMeaningfulContext) {
          // Check if the tweet content is asking about context
          const tweetContent = tweet.content.toLowerCase();
          if (tweetContent.includes("what") && 
              (tweetContent.includes("tweet") || 
               tweetContent.includes("context") || 
               tweetContent.includes("talking about"))) {
            
            console.log("User is asking about context. Providing a response with fresh conversation starter.");
            
            // Create a reply immediately, with special flag to avoid context questions
            return this.createAgentPost(agentId, {
              task: 'reply',
              replyTo: tweet,
              avoidContextQuestions: true,  // Special flag to handle this case
              ignoreTimeConstraint: true // Allow replies anytime
            });
          }
        }
        
        // Create a reply immediately, bypassing the usual reaction generation
        return this.createAgentPost(agentId, {
          task: 'reply',
          replyTo: tweet,
          ignoreTimeConstraint: true // Allow replies anytime
        });
      }
      
      // Generate reaction using LLM
      const reaction = await llmProvider.generateReaction(agent, tweet);
      
      // Adjust probabilities based on configuration
      const { replyProbability, quoteTweetProbability, likeProbability } = 
        agent.behavior.interactionPatterns;
      
      // Strong preference for replies over quote tweets
      if (reaction.action === 'quote' && Math.random() > quoteTweetProbability * 0.5) {
        // 50% reduced chance of quote tweeting compared to configured probability
        console.log(`Agent ${agentId} chose to ignore instead of quote tweet based on probability settings`);
        reaction.action = 'ignore';
      }
      
      // Determine action based on reaction
      switch (reaction.action) {
        case 'reply':
          // Only reply if probability check passes
          if (Math.random() <= replyProbability) {
            // For regular replies, also fetch the original tweet for context if needed
            if (!tweet.originalTweet && tweet.id) {
              try {
                console.log(`Fetching tweet ${tweet.id} for reply context`);
                
                // Recursively fetch the conversation thread
                let conversationHistory = [];
                
                // The initial tweet is already available, just add it to history
                conversationHistory.push({
                  role: "user",
                  content: tweet.content,
                  timestamp: tweet.createdAt ? tweet.createdAt.getTime() : Date.now()
                });
                
                // If this tweet is a reply to another, build the thread
                if (tweet.replyToId) {
                  await this.fetchConversationThread(tweet.replyToId, conversationHistory, agentId);
                  
                  // Sort conversation history chronologically (oldest first)
                  conversationHistory.sort((a, b) => {
                    if (a.timestamp && b.timestamp) {
                      return a.timestamp - b.timestamp;
                    }
                    return 0;
                  });
                }
                
                // We already have this tweet, just ensure it's properly assigned
                tweet.originalTweet = tweet;
                tweet.conversationHistory = conversationHistory;
              } catch (error) {
                console.error(`Error ensuring tweet context for ${tweet.id}:`, error);
              }
            }
            
            // Create a reply
            return this.createAgentPost(agentId, {
              task: 'reply',
              replyTo: tweet,
              ignoreTimeConstraint: true // Allow replies anytime
            });
          } else {
            console.log(`Agent ${agentId} chose not to reply based on probability settings`);
            return null;
          }
          
        case 'quote':
          // Create a quote tweet
          return this.createAgentPost(agentId, {
            task: 'quote_tweet',
            quoteTweet: tweet,
            ignoreTimeConstraint: true // Allow quotes anytime
          });
          
        case 'like':
          // Like the tweet
          if (Math.random() <= likeProbability) {
            await this.twitterClient.likeTweet(agentId, tweet.id);
            
            // Record the interaction
            this.updateAgentRelationship(agentId, tweet.authorId, {
              description: `I liked ${tweet.authorId}'s tweet: "${tweet.content.substring(0, 50)}..."`
            });
            
            return { action: 'like', tweetId: tweet.id };
          } else {
            console.log(`Agent ${agentId} chose not to like based on probability settings`);
            return null;
          }
          
        case 'ignore':
        default:
          // No action
          return null;
      }
    } catch (error) {
      console.error(`Error processing reaction for agent ${agentId}:`, error);
      throw error;
    }
  }
  
  /**
   * Process an event for an agent
   */
  async processAgentEvent(agentId, event) {
    try {
      const agent = this.getAgent(agentId);
      
      // Skip if not targeted at this agent and not a broadcast
      if (
        event.targetAgentIds && 
        event.targetAgentIds.length > 0 && 
        !event.targetAgentIds.includes(agentId)
      ) {
        return;
      }
      
      switch (event.type) {
        case 'news':
          // Process news event - might trigger a post
          const newsUpdate = await this.llmProvider.generateMemoryUpdate(agent, event);
          
          // Update memory
          this.memoryManager.addMemory(
            agentId,
            newsUpdate.memory || `News: ${event.data.headline}`,
            'event',
            { importance: newsUpdate.importance }
          );
          
          // Update mood
          agent.updateMood(
            newsUpdate.valenceShift,
            newsUpdate.arousalShift,
            newsUpdate.dominanceShift
          );
          
          // Possibly create a post about this news
          if (newsUpdate.importance > 0.7 || Math.random() < 0.3) {
            return this.createAgentPost(agentId, {
              topic: event.data.headline
            });
          }
          break;
          
        case 'mood_shift':
          // Process mood event
          this.memoryManager.addMemory(
            agentId,
            event.data.description,
            'event',
            { importance: 0.6 }
          );
          
          // Update mood
          agent.updateMood(
            event.data.valenceShift,
            event.data.arousalShift,
            event.data.dominanceShift
          );
          
          // High arousal events might trigger a post
          if (event.data.arousalShift > 0.3 || Math.random() < 0.2) {
            return this.createAgentPost(agentId);
          }
          break;
          
        case 'interaction_prompt':
          // Process interaction prompt
          if (event.data.initiatorId === agentId) {
            // This agent is prompted to interact with another
            const targetId = event.data.targetId;
            
            try {
              // Get recent posts from the target agent
              console.log(`Fetching recent tweets from agent ${targetId} for interaction`);
              const recentTweets = await this.twitterClient.getUserTimeline(targetId, { limit: 5 });
              
              if (recentTweets && recentTweets.length > 0) {
                // Pick a random tweet to react to
                const randomIndex = Math.floor(Math.random() * recentTweets.length);
                const tweetToReactTo = recentTweets[randomIndex];
                
                console.log(`Agent ${agentId} will react to tweet: "${tweetToReactTo.content.substring(0, 30)}..."`);
                
                // Process reaction to the real tweet
                return this.processAgentReaction(agentId, tweetToReactTo);
              } else {
                // Fallback to fake post if no tweets found
                console.log(`No tweets found for ${targetId}, using a fake post instead`);
                const fakePost = {
                  id: `fake-${Date.now()}`,
                  content: `This is a post about ${event.data.topic}`,
                  authorId: targetId,
                  createdAt: new Date()
                };
                
                // Process reaction to the fake post
                return this.processAgentReaction(agentId, fakePost);
              }
            } catch (error) {
              console.error(`Error fetching tweets for agent ${targetId}:`, error);
              // Fallback to fake post in case of error
              const fakePost = {
                id: `fake-${Date.now()}`,
                content: `This is a post about ${event.data.topic}`,
                authorId: targetId,
                createdAt: new Date()
              };
              
              // Process reaction to the fake post
              return this.processAgentReaction(agentId, fakePost);
            }
          }
          break;
      }
    } catch (error) {
      console.error(`Error processing event for agent ${agentId}:`, error);
      throw error;
    }
  }
  
  /**
   * Update an agent's relationship with another agent
   */
  async updateAgentRelationship(agentId, targetAgentId, interaction) {
    try {
      const agent = this.getAgent(agentId);
      
      // Generate relationship update
      const update = await this.llmProvider.generateRelationshipUpdate(
        agent, 
        targetAgentId, 
        interaction
      );
      
      // Apply the update
      this.memoryManager.updateRelationship(agentId, targetAgentId, {
        sentiment: (agent.memory.relationships[targetAgentId]?.sentiment || 0) + update.sentimentChange,
        familiarity: (agent.memory.relationships[targetAgentId]?.familiarity || 0) + update.familiarityChange,
        trust: (agent.memory.relationships[targetAgentId]?.trust || 0) + update.trustChange,
        notes: update.note ? [update.note] : [],
        recentInteractions: [interaction.description]
      });
      
      return update;
    } catch (error) {
      console.error(`Error updating relationship for agent ${agentId} with ${targetAgentId}:`, error);
      throw error;
    }
  }
  
  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Listen for all events
    this.eventEngine.addEventListener('all', async (event) => {
      // Process the event for each agent
      for (const agentId of Object.keys(this.agents)) {
        await this.processAgentEvent(agentId, event);
      }
    });
  }
  
  /**
   * Start streaming Twitter for mentions for all agents
   * Uses the Twitter filtered stream API for real-time mention notifications
   */
  async startStreamingMentions() {
    console.log(`Starting Twitter mention monitoring for all agents`);
    
    // Check if streaming is disabled in .env
    const useStreaming = process.env.USE_TWITTER_STREAMING !== 'false';
    if (!useStreaming) {
      console.log('Twitter streaming API is disabled in .env, using polling instead');
      
      // Start polling for all agents
      for (const agentId of Object.keys(this.agents)) {
        this._startPollingMentionsForAgent(agentId, 
          parseInt(process.env.MENTION_POLLING_INTERVAL) || 60000);
      }
      
      return;
    }
    
    // Important notice about required API level
    console.log('NOTE: Twitter Filtered Stream API requires Pro access level ($5000/month)');
    console.log('If streaming fails, the system will automatically fall back to polling');
    
    // Keep track of active streams
    this.mentionStreams = {};
    
    // Start a stream for each agent
    for (const agentId of Object.keys(this.agents)) {
      try {
        console.log(`Setting up real-time mention stream for agent ${agentId}...`);
        
        // Define callback to process mentions in real-time
        const onMention = async (mention) => {
          console.log(`Processing real-time mention for agent ${agentId}: "${mention.content.substring(0, 30)}..."`);
          
          // Process the mention right away
          await this.processAgentReaction(agentId, mention);
        };
        
        // Start the stream with retry logic
        const maxRetries = 2;
        let retryCount = 0;
        let stream = null;
        
        while (retryCount <= maxRetries && !stream) {
          try {
            if (retryCount > 0) {
              console.log(`Retry attempt ${retryCount} for starting mention stream for agent ${agentId}`);
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            // Attempt to start the stream
            stream = await this.twitterClient.startMentionStream(agentId, onMention);
            
            // If we get here, the stream started successfully
            this.mentionStreams[agentId] = stream;
            console.log(`Successfully started mention stream for agent ${agentId}`);
            
          } catch (error) {
            console.error(`Error starting mention stream for agent ${agentId} (attempt ${retryCount + 1}):`, error.message);
            retryCount++;
            
            // If we've reached max retries, fall back to polling
            if (retryCount > maxRetries) {
              console.log(`Reached max retries (${maxRetries}). Falling back to polling for agent ${agentId}`);
              this._startPollingMentionsForAgent(
                agentId, 
                parseInt(process.env.MENTION_POLLING_INTERVAL) || 10000
              );
            }
          }
        }
      } catch (error) {
        console.error(`Failed to set up streaming for agent ${agentId}:`, error.message);
        console.log(`Falling back to polling for agent ${agentId}`);
        
        // Fall back to polling
        this._startPollingMentionsForAgent(
          agentId, 
          parseInt(process.env.MENTION_POLLING_INTERVAL) || 10000
        );
      }
    }
  }
  
  /**
   * Stop streaming mentions for all agents
   */
  async stopStreamingMentions() {
    console.log('Stopping all mention streams...');
    
    // Close all streams
    if (this.mentionStreams) {
      for (const [agentId, stream] of Object.entries(this.mentionStreams)) {
        try {
          if (stream && typeof stream.close === 'function') {
            console.log(`Closing mention stream for agent ${agentId}...`);
            await stream.close().catch(err => {
              console.warn(`Non-fatal error closing stream for ${agentId}:`, err);
            });
            console.log(`Closed mention stream for agent ${agentId}`);
          }
        } catch (error) {
          console.error(`Error closing mention stream for agent ${agentId}:`, error);
        }
      }
      this.mentionStreams = {};
    }
    
    // Clear all polling intervals
    if (this.mentionPollingIntervals) {
      for (const [agentId, intervalId] of Object.entries(this.mentionPollingIntervals)) {
        clearInterval(intervalId);
        console.log(`Stopped polling mentions for agent ${agentId}`);
      }
      this.mentionPollingIntervals = {};
    }
    
    console.log('All mention streams stopped');
  }
  
  /**
   * Fall back method to poll for mentions instead of streaming
   * @private
   */
  _startPollingMentionsForAgent(agentId, intervalMs = 60000) {
    console.log(`Starting polling for Twitter mentions for agent ${agentId} every ${intervalMs/1000} seconds`);
    
    // Load processed tweets when starting polling
    this.loadProcessedTweets();
    
    // Track last seen mention ID for this agent
    let lastMentionId = null;
    // Store username to filter mentions
    let agentUsername = null;
    
    // Initialize error tracking for this agent if not exists
    if (!this.apiErrorCounts[agentId]) {
      this.apiErrorCounts[agentId] = 0;
    }
    
    // Set up interval to check mentions
    const intervalId = setInterval(async () => {
      try {
        // Check if we're in a cooldown period
        const now = Date.now();
        if (this.apiCooldowns[agentId] && now < this.apiCooldowns[agentId]) {
          const remainingCooldownMinutes = Math.ceil((this.apiCooldowns[agentId] - now) / (60 * 1000));
          console.log(`Skipping mention check for agent ${agentId} - in cooldown for ${remainingCooldownMinutes} more minutes`);
          return;
        }
        
        console.log(`Polling for mentions for agent ${agentId}...`);
        
        // If we don't have the agent's username yet, get it
        if (!agentUsername) {
          try {
            const meResult = await this.twitterClient.getClientForAgent(agentId).v2.me();
            agentUsername = meResult.data.username.toLowerCase();
            console.log(`Stored agent username ${agentUsername} for filtering mentions`);
          } catch (error) {
            console.error(`Error getting username for agent ${agentId}:`, error);
            this._handleApiError(agentId, error);
            return;
          }
        }
        
        // Get mentions for this agent
        const mentions = await this.twitterClient.getAgentMentions(
          agentId, 
          { sinceId: lastMentionId }
        );
        
        // Reset error count on successful API call
        this.apiErrorCounts[agentId] = 0;
        
        if (mentions.length > 0) {
          console.log(`Found ${mentions.length} new mentions for agent ${agentId}`);
          
          // Update last seen mention ID
          lastMentionId = mentions[0].id;
          
          // Filter out self-mentions and process each real mention
          const filteredMentions = mentions.filter(mention => {
            // Check if this is a self-mention by comparing author username
            const isSelfMention = mention.authorUsername && 
                                  agentUsername && 
                                  mention.authorUsername.toLowerCase() === agentUsername;
            
            if (isSelfMention) {
              return false;
            }
            
            // Also filter out tweets we've already processed
            if (this.processedTweetIds.has(mention.id)) {
              return false;
            }
            
            return true;
          });
          
          // Log a summary instead of individual skipped mentions
          const skippedCount = mentions.length - filteredMentions.length;
          if (skippedCount > 0) {
            console.log(`Skipped ${skippedCount} already processed or self mentions`);
          }
          
          console.log(`Processing ${filteredMentions.length} mentions after filtering out self-mentions and already processed tweets`);
          
          for (const mention of filteredMentions) {
            // Add more details to the mention
            mention.isDirectMention = true;
            
            // If this is a reply to another tweet, fetch that tweet for context
            if (mention.replyToId) {
              try {
                console.log(`Fetching original tweet ${mention.replyToId} for mention context`);
                const originalTweet = await this.twitterClient.getTweet(mention.replyToId);
                console.log(`Found original tweet: "${originalTweet.content.substring(0, 30)}..."`);
                
                // Create conversation history
                let conversationHistory = [];
                
                // Recursively fetch the conversation thread
                await this.fetchConversationThread(mention.replyToId, conversationHistory, agentId);
                
                // Sort conversation history chronologically (oldest first)
                conversationHistory.sort((a, b) => {
                  if (a.timestamp && b.timestamp) {
                    return a.timestamp - b.timestamp;
                  }
                  return 0;
                });
                
                // Add current mention to conversation history
                conversationHistory.push({
                  role: "user",
                  content: mention.content,
                  timestamp: mention.createdAt.getTime()
                });
                
                // Enhance the mention with context
                mention.originalTweet = originalTweet;
                mention.conversationHistory = conversationHistory;
              } catch (error) {
                console.error(`Error fetching original tweet for mention ${mention.id}:`, error);
              }
            }
            
            await this.processAgentReaction(agentId, mention);
          }
          
          // Save processed tweets after handling mentions
          this.saveProcessedTweets();
        }
      } catch (error) {
        console.error(`Error checking mentions for agent ${agentId}:`, error);
        this._handleApiError(agentId, error);
      }
    }, intervalMs);
    
    // Store the interval ID so we can clear it if needed
    this.mentionPollingIntervals = this.mentionPollingIntervals || {};
    this.mentionPollingIntervals[agentId] = intervalId;
  }
  
  /**
   * Handle API errors with progressive backoff
   * @private
   */
  _handleApiError(agentId, error) {
    // Increment error count
    this.apiErrorCounts[agentId] = (this.apiErrorCounts[agentId] || 0) + 1;
    
    // Calculate backoff time based on number of consecutive errors
    // Start with 1 minute, then 5, 15, 30, and max at 60 minutes
    let backoffMinutes = 1;
    
    if (this.apiErrorCounts[agentId] >= 5) {
      backoffMinutes = 60; // Maximum backoff of 1 hour
    } else if (this.apiErrorCounts[agentId] >= 4) {
      backoffMinutes = 30;
    } else if (this.apiErrorCounts[agentId] >= 3) {
      backoffMinutes = 15;
    } else if (this.apiErrorCounts[agentId] >= 2) {
      backoffMinutes = 5;
    }
    
    // Apply longer backoff for rate limit errors
    if (error.code === 429 || (error.errors && error.errors.some(e => e.code === 88))) {
      backoffMinutes = Math.max(backoffMinutes, 15);
      console.log(`Rate limit exceeded for Twitter API. Applying extended cooldown.`);
    }
    
    // Set cooldown end time
    const cooldownMs = backoffMinutes * 60 * 1000;
    this.apiCooldowns[agentId] = Date.now() + cooldownMs;
    
    console.log(`Twitter API error for agent ${agentId}. Setting cooldown for ${backoffMinutes} minutes.`);
    console.log(`API calls will resume after ${new Date(this.apiCooldowns[agentId]).toLocaleTimeString()}`);
  }
  
  /**
   * Recursively fetch the conversation thread for a tweet
   * This helps build a complete conversation history
   */
  async fetchConversationThread(tweetId, conversationHistory, agentId, depth = 0, maxDepth = 5) {
    // Limit recursion depth to avoid infinite loops
    if (depth >= maxDepth) return;
    
    try {
      // Fetch the tweet
      const tweet = await this.twitterClient.getTweet(tweetId);
      
      // Add to conversation history
      conversationHistory.push({
        role: tweet.authorId === agentId ? "agent" : "user",
        content: tweet.content,
        timestamp: tweet.createdAt.getTime()
      });
      
      // If this tweet is a reply to another, recursively fetch that one too
      if (tweet.replyToId) {
        await this.fetchConversationThread(
          tweet.replyToId, 
          conversationHistory, 
          agentId, 
          depth + 1, 
          maxDepth
        );
      }
    } catch (error) {
      console.error(`Error fetching tweet ${tweetId} for conversation thread:`, error);
      // Continue even if we can't fetch a tweet in the thread
    }
  }

  // Add a method to persist the processed tweets
  saveProcessedTweets() {
    try {
      // Convert Set to Array for storage
      const processedTweets = Array.from(this.processedTweetIds);
      // Only keep the most recent 1000 tweets to avoid excessive memory usage
      const recentTweets = processedTweets.slice(-1000);
      
      // Save to file
      fs.writeFileSync(
        path.join(process.cwd(), 'data', 'processed_tweets.json'), 
        JSON.stringify(recentTweets),
        'utf8'
      );
      console.log(`Saved ${recentTweets.length} processed tweet IDs`);
    } catch (error) {
      console.error('Error saving processed tweets:', error);
    }
  }
  
  // Add a method to load the processed tweets
  loadProcessedTweets() {
    try {
      const filePath = path.join(process.cwd(), 'data', 'processed_tweets.json');
      
      // Create directory if it doesn't exist
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Check if file exists
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const processedTweets = JSON.parse(data);
        
        // Add to the Set
        processedTweets.forEach(id => this.processedTweetIds.add(id));
        console.log(`Loaded ${processedTweets.length} previously processed tweet IDs`);
      } else {
        console.log('No previous processed tweets found');
        // Create an empty file
        fs.writeFileSync(filePath, '[]', 'utf8');
      }
    } catch (error) {
      console.error('Error loading processed tweets:', error);
      // Initialize with empty set in case of error
      this.processedTweetIds = new Set();
    }
  }
}

module.exports = AgentManager; 