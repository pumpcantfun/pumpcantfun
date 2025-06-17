/**
 * API Server for Puppet Engine
 * Provides HTTP endpoints for monitoring and controlling agents
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

class ApiServer {
  constructor(options = {}) {
    this.app = express();
    this.port = options.port || process.env.ENGINE_PORT || 3000;
    
    this.agentManager = options.agentManager;
    this.eventEngine = options.eventEngine;
    this.memoryManager = options.memoryManager;
    
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  /**
   * Set up Express middleware
   */
  setupMiddleware() {
    this.app.use(express.json());
    
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      
      next();
    });
    
    // Logging middleware
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }
  
  /**
   * Set up API routes
   */
  setupRoutes() {
    // Status endpoint
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'online',
        agents: Object.keys(this.agentManager.agents).length,
        uptime: process.uptime()
      });
    });
    
    // Get all agents
    this.app.get('/api/agents', (req, res) => {
      const agents = Object.values(this.agentManager.agents).map(agent => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        lastPostTime: agent.lastPostTime,
        mood: agent.currentMood
      }));
      
      res.json(agents);
    });
    
    // Get a specific agent
    this.app.get('/api/agents/:agentId', (req, res) => {
      try {
        const agent = this.agentManager.getAgent(req.params.agentId);
        
        // Remove circular references for JSON serialization
        const sanitizedAgent = {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          personality: agent.personality,
          styleGuide: agent.styleGuide,
          behavior: agent.behavior,
          currentMood: agent.currentMood,
          lastPostTime: agent.lastPostTime,
          goals: agent.goals
        };
        
        res.json(sanitizedAgent);
      } catch (error) {
        res.status(404).json({ error: error.message });
      }
    });
    
    // Get agent memory
    this.app.get('/api/agents/:agentId/memory', (req, res) => {
      try {
        const agentId = req.params.agentId;
        const memory = this.memoryManager.serializeAgentMemory(agentId);
        res.json(memory);
      } catch (error) {
        res.status(404).json({ error: error.message });
      }
    });
    
    // DEBUG: Get agent prompt context
    this.app.get('/api/agents/:agentId/context', (req, res) => {
      try {
        const agentId = req.params.agentId;
        const agent = this.agentManager.getAgent(agentId);
        
        // Get the LLM provider for this agent
        const llmProvider = this.agentManager.agentLLMProviders[agentId] || this.agentManager.defaultLLMProvider;
        
        // Build context with agent's custom system prompt
        const context = llmProvider.buildAgentPrompt(agent, {
          task: 'post',
          topic: 'Sample topic for debug purposes'
        });
        
        // Print to server console for debugging
        console.log("=== AGENT CONTEXT START ===");
        console.log(context);
        console.log("=== AGENT CONTEXT END ===");
        
        res.json({ 
          context,
          hasCustomPrompt: !!agent.customSystemPrompt
        });
      } catch (error) {
        res.status(404).json({ error: error.message });
      }
    });
    
    // Trigger agent to create a post
    this.app.post('/api/agents/:agentId/post', async (req, res) => {
      try {
        const agentId = req.params.agentId;
        const options = req.body || {};
        
        const tweet = await this.agentManager.createAgentPost(agentId, {
          topic: options.topic,
          threadLength: options.threadLength,
          ignoreTimeConstraint: options.force === true
        });
        
        if (tweet) {
          res.json(tweet);
        } else {
          res.status(429).json({ 
            error: 'Too soon since last post', 
            lastPostTime: this.agentManager.agents[agentId].lastPostTime 
          });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Create a reply to another tweet
    this.app.post('/api/agents/:agentId/reply', async (req, res) => {
      try {
        const agentId = req.params.agentId;
        const { tweetId, content } = req.body;
        
        if (!tweetId) {
          return res.status(400).json({ error: 'tweetId is required' });
        }
        
        // Create a tweet object for the target tweet
        // In a real implementation, this would fetch the tweet from Twitter
        const fakeTweet = {
          id: tweetId,
          content: content || 'This is a placeholder for the original tweet',
          authorId: 'unknown',
          createdAt: new Date()
        };
        
        const reply = await this.agentManager.createAgentPost(agentId, {
          task: 'reply',
          replyTo: fakeTweet,
          ignoreTimeConstraint: true
        });
        
        res.json(reply);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Create a new agent from a config file
    this.app.post('/api/agents', async (req, res) => {
      try {
        const config = req.body;
        
        if (!config || !config.id) {
          return res.status(400).json({ error: 'Valid agent configuration is required' });
        }
        
        const agent = await this.agentManager.loadAgent(config);
        
        // Save the config to disk
        const configDir = path.join(process.cwd(), 'config/agents');
        const configPath = path.join(configDir, `${config.id}.json`);
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        res.status(201).json({
          id: agent.id,
          name: agent.name,
          message: 'Agent created successfully'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Create a custom event
    this.app.post('/api/events', (req, res) => {
      try {
        const { type, data, targetAgentIds, priority, delay } = req.body;
        
        if (!type || !data) {
          return res.status(400).json({ error: 'Event type and data are required' });
        }
        
        let event;
        
        if (delay && delay > 0) {
          // Schedule for future
          event = this.eventEngine.scheduleEvent(type, data, delay, {
            targetAgentIds,
            priority
          });
          
          res.json({
            scheduled: true,
            event: {
              id: event.id,
              type: event.type,
              timestamp: event.timestamp,
              executeAfter: new Date(Date.now() + delay)
            }
          });
        } else {
          // Create immediately
          event = this.eventEngine.createEvent(type, data, {
            targetAgentIds,
            priority
          });
          
          res.json({
            scheduled: false,
            event: {
              id: event.id,
              type: event.type,
              timestamp: event.timestamp
            }
          });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get recent events
    this.app.get('/api/events', (req, res) => {
      const events = this.eventEngine.eventHistory.map(item => ({
        id: item.event.id,
        type: item.event.type,
        data: item.event.data,
        timestamp: item.event.timestamp,
        processedAt: item.processedAt,
        targetAgentIds: item.event.targetAgentIds
      }));
      
      res.json(events);
    });
    
    // Update agent mood directly
    this.app.post('/api/agents/:agentId/mood', (req, res) => {
      try {
        const agentId = req.params.agentId;
        const agent = this.agentManager.getAgent(agentId);
        
        const { valenceShift, arousalShift, dominanceShift } = req.body;
        
        agent.updateMood(
          valenceShift || 0,
          arousalShift || 0,
          dominanceShift || 0
        );
        
        res.json({ 
          agent: agentId, 
          mood: agent.currentMood 
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Add a memory to an agent
    this.app.post('/api/agents/:agentId/memories', (req, res) => {
      try {
        const agentId = req.params.agentId;
        const { content, type, importance } = req.body;
        
        if (!content) {
          return res.status(400).json({ error: 'Memory content is required' });
        }
        
        const memory = this.memoryManager.addMemory(
          agentId,
          content,
          type || 'general',
          { importance: importance || 0.5 }
        );
        
        res.status(201).json(memory);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get agent relationships
    this.app.get('/api/agents/:agentId/relationships', (req, res) => {
      try {
        const agentId = req.params.agentId;
        const agent = this.agentManager.getAgent(agentId);
        
        res.json(agent.memory.relationships);
      } catch (error) {
        res.status(404).json({ error: error.message });
      }
    });
  }
  
  /**
   * Start the API server
   */
  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`Puppet Engine API server listening on port ${this.port}`);
        resolve(this.server);
      });
    });
  }
  
  /**
   * Stop the API server
   */
  stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('Puppet Engine API server stopped');
          resolve();
        });
      });
    }
    return Promise.resolve();
  }
}

module.exports = ApiServer; 