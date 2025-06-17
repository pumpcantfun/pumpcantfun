/**
 * Event Engine for Puppet Engine
 * Generates and dispatches events to agents
 */

const { v4: uuidv4 } = require('uuid');
const { Event } = require('../core/types');

class EventEngine {
  constructor() {
    this.eventListeners = {};
    this.eventQueue = [];
    this.scheduledEvents = [];
    this.isProcessing = false;
    this.eventHistory = [];
  }
  
  /**
   * Register an event listener
   */
  addEventListener(eventType, callback) {
    if (!this.eventListeners[eventType]) {
      this.eventListeners[eventType] = [];
    }
    this.eventListeners[eventType].push(callback);
    return this; // For chaining
  }
  
  /**
   * Remove an event listener
   */
  removeEventListener(eventType, callback) {
    if (this.eventListeners[eventType]) {
      this.eventListeners[eventType] = this.eventListeners[eventType]
        .filter(listener => listener !== callback);
    }
    return this;
  }
  
  /**
   * Create and queue a new event
   */
  createEvent(type, data, options = {}) {
    const event = new Event(type, data);
    event.id = uuidv4();
    
    // Set target agents if specified
    if (options.targetAgentIds) {
      event.targetAgentIds = options.targetAgentIds;
    }
    
    // Set priority if specified
    if (options.priority) {
      event.priority = options.priority;
    }
    
    // Add to queue
    this.queueEvent(event);
    
    return event;
  }
  
  /**
   * Add an event to the queue
   */
  queueEvent(event) {
    this.eventQueue.push(event);
    this.sortEventQueue();
    
    // Start processing if not already doing so
    if (!this.isProcessing) {
      this.processEvents();
    }
    
    return this;
  }
  
  /**
   * Schedule an event for the future
   */
  scheduleEvent(type, data, delayMs, options = {}) {
    const event = new Event(type, data);
    event.id = uuidv4();
    
    // Set target agents if specified
    if (options.targetAgentIds) {
      event.targetAgentIds = options.targetAgentIds;
    }
    
    // Set priority if specified
    if (options.priority) {
      event.priority = options.priority;
    }
    
    // Schedule for future
    const scheduledTime = Date.now() + delayMs;
    const scheduledEvent = {
      event,
      scheduledTime
    };
    
    this.scheduledEvents.push(scheduledEvent);
    this.sortScheduledEvents();
    
    return event;
  }
  
  /**
   * Sort the event queue by priority
   */
  sortEventQueue() {
    // Sort by priority (critical > high > normal > low)
    const priorityValues = {
      'critical': 3,
      'high': 2,
      'normal': 1,
      'low': 0
    };
    
    this.eventQueue.sort((a, b) => {
      return priorityValues[b.priority] - priorityValues[a.priority];
    });
  }
  
  /**
   * Sort scheduled events by scheduled time
   */
  sortScheduledEvents() {
    this.scheduledEvents.sort((a, b) => a.scheduledTime - b.scheduledTime);
  }
  
  /**
   * Check scheduled events and add any due events to the queue
   */
  checkScheduledEvents() {
    const now = Date.now();
    const dueEvents = [];
    const futureEvents = [];
    
    // Split into due and future events
    this.scheduledEvents.forEach(scheduledEvent => {
      if (scheduledEvent.scheduledTime <= now) {
        dueEvents.push(scheduledEvent.event);
      } else {
        futureEvents.push(scheduledEvent);
      }
    });
    
    // Update scheduled events list
    this.scheduledEvents = futureEvents;
    
    // Add due events to the queue
    dueEvents.forEach(event => this.queueEvent(event));
    
    return dueEvents.length;
  }
  
  /**
   * Process events in the queue
   */
  async processEvents() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      // Check for scheduled events that are due
      this.checkScheduledEvents();
      
      // Process all queued events
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        await this.dispatchEvent(event);
        
        // Add to history
        this.eventHistory.push({
          event,
          processedAt: new Date()
        });
        
        // Cap history size
        if (this.eventHistory.length > 100) {
          this.eventHistory.shift();
        }
      }
    } catch (error) {
      console.error('Error processing events:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Dispatch an event to all relevant listeners
   */
  async dispatchEvent(event) {
    // Get all listeners for this event type
    const listeners = this.eventListeners[event.type] || [];
    
    // Also include 'all' event listeners
    const allListeners = this.eventListeners['all'] || [];
    
    // Combine listeners
    const combinedListeners = [...listeners, ...allListeners];
    
    // No listeners, no work to do
    if (combinedListeners.length === 0) {
      return;
    }
    
    // Dispatch to all listeners
    const promises = combinedListeners.map(async (listener) => {
      try {
        await listener(event);
      } catch (error) {
        console.error(`Error in event listener for ${event.type}:`, error);
      }
    });
    
    await Promise.all(promises);
  }
  
  /**
   * Generate a random news event
   */
  generateRandomNewsEvent() {
    // Sample news topics
    const newsTopics = [
      'technology breakthrough',
      'political development',
      'entertainment news',
      'scientific discovery',
      'business announcement',
      'sports highlight',
      'internet trend',
      'cultural moment'
    ];
    
    // Sample news templates
    const newsTemplates = [
      'Breaking: Major {topic} announced today.',
      'New {topic} shakes up the industry.',
      'Unexpected {topic} surprises everyone.',
      'Controversial {topic} sparks debate.',
      'Exciting {topic} gets everyone talking.'
    ];
    
    // Select random topic and template
    const topic = newsTopics[Math.floor(Math.random() * newsTopics.length)];
    const template = newsTemplates[Math.floor(Math.random() * newsTemplates.length)];
    
    // Create the news headline
    const headline = template.replace('{topic}', topic);
    
    // Create the event
    return this.createEvent('news', {
      headline,
      topic,
      description: headline,
      url: null // In a real system, this might link to a detailed article
    });
  }
  
  /**
   * Generate a random mood event for a specific agent
   */
  generateMoodEvent(agentId) {
    // Mood shift options
    const moodShifts = [
      { 
        name: 'sudden inspiration', 
        valence: 0.3, 
        arousal: 0.4, 
        dominance: 0.2
      },
      { 
        name: 'mild frustration', 
        valence: -0.2, 
        arousal: 0.3, 
        dominance: -0.1
      },
      { 
        name: 'pleasant surprise', 
        valence: 0.4, 
        arousal: 0.3, 
        dominance: 0.1
      },
      { 
        name: 'brief melancholy', 
        valence: -0.3, 
        arousal: -0.2, 
        dominance: -0.1
      },
      { 
        name: 'creative surge', 
        valence: 0.3, 
        arousal: 0.4, 
        dominance: 0.3
      }
    ];
    
    // Pick a random mood shift
    const moodShift = moodShifts[Math.floor(Math.random() * moodShifts.length)];
    
    // Create the event
    return this.createEvent('mood_shift', {
      name: moodShift.name,
      description: `Experiencing ${moodShift.name}`,
      valenceShift: moodShift.valence,
      arousalShift: moodShift.arousal,
      dominanceShift: moodShift.dominance
    }, {
      targetAgentIds: [agentId], // Only target this specific agent
      priority: 'normal'
    });
  }
  
  /**
   * Generate a random interaction prompt between two agents
   */
  generateInteractionEvent(agentId1, agentId2) {
    // Interaction templates
    const interactionTemplates = [
      '{agent1} noticed {agent2}\'s recent post about {topic}',
      '{agent1} remembered something {agent2} said about {topic}',
      '{agent1} saw {agent2} mentioned in a discussion about {topic}',
      'Something reminded {agent1} of {agent2}\'s take on {topic}',
      '{agent1} wondered what {agent2} would think about {topic}'
    ];
    
    // Sample topics
    const topics = [
      'current trends',
      'a shared interest',
      'a recent news item',
      'a philosophical question',
      'an industry development',
      'a creative idea'
    ];
    
    // Select random template and topic
    const template = interactionTemplates[Math.floor(Math.random() * interactionTemplates.length)];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    
    // Fill in the template
    const description = template
      .replace('{agent1}', agentId1)
      .replace('{agent2}', agentId2)
      .replace('{topic}', topic);
    
    // Create the event
    return this.createEvent('interaction_prompt', {
      description,
      initiatorId: agentId1,
      targetId: agentId2,
      topic
    }, {
      targetAgentIds: [agentId1], // Target the initiating agent
      priority: 'normal'
    });
  }
  
  /**
   * Setup periodic random events
   */
  setupRandomEvents(agentIds, options = {}) {
    const newsInterval = options.newsInterval || 6 * 60 * 60 * 1000; // 6 hours
    const moodInterval = options.moodInterval || 4 * 60 * 60 * 1000; // 4 hours
    const interactionInterval = options.interactionInterval || 8 * 60 * 60 * 1000; // 8 hours
    
    // Schedule recurring news events
    setInterval(() => {
      this.generateRandomNewsEvent();
    }, newsInterval);
    
    // Schedule recurring mood events for each agent
    agentIds.forEach(agentId => {
      setInterval(() => {
        this.generateMoodEvent(agentId);
      }, moodInterval + Math.random() * 60 * 60 * 1000); // Add some randomness
    });
    
    // Schedule recurring interaction events between agents
    if (agentIds.length >= 2) {
      setInterval(() => {
        // Determine how many interactions to trigger (1-3)
        const interactionCount = Math.floor(Math.random() * 3) + 1;
        
        // Generate multiple interactions
        for (let i = 0; i < interactionCount; i++) {
          // Don't generate too many at once if there are few agents
          if (i > 0 && agentIds.length < 4) break;
          
          // Pick two random agents
          const shuffled = [...agentIds].sort(() => 0.5 - Math.random());
          const agent1 = shuffled[0];
          const agent2 = shuffled[1];
          
          // Only proceed if we found two different agents
          if (agent1 && agent2 && agent1 !== agent2) {
            this.generateInteractionEvent(agent1, agent2);
            
            // Sometimes generate bi-directional interaction (agent2 also notices agent1)
            if (Math.random() < 0.3) {
              this.generateInteractionEvent(agent2, agent1);
            }
          }
        }
      }, interactionInterval);
    }
  }
}

module.exports = EventEngine; 