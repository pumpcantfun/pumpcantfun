/**
 * Core type definitions for the Puppet Engine framework
 */

/**
 * Agent personality definition
 */
class Personality {
  traits = [];
  values = [];
  speakingStyle = '';
  interests = [];
}

/**
 * Style guide for agent's writing and formatting
 */
class StyleGuide {
  voice = '';
  tone = '';
  formatting = {
    usesHashtags: false,
    hashtagStyle: '',
    usesEmojis: false,
    emojiFrequency: '',
    capitalization: '',
    sentenceLength: ''
  };
  topicsToAvoid = [];
}

/**
 * Relationship with another agent
 */
class Relationship {
  constructor(targetAgentId) {
    this.targetAgentId = targetAgentId;
  }
  
  targetAgentId = '';
  sentiment = 0; // -1.0 to 1.0
  familiarity = 0; // 0.0 to 1.0
  trust = 0; // 0.0 to 1.0
  lastInteractionDate = null;
  recentInteractions = [];
  sharedExperiences = [];
  notes = [];
}

/**
 * Memory item stored by an agent
 */
class MemoryItem {
  constructor(content, type = 'general') {
    this.content = content;
    this.type = type;
    this.timestamp = new Date();
  }
  
  id = '';
  content = '';
  type = ''; // 'core', 'interaction', 'event', 'general'
  timestamp = null;
  importance = 0.5; // 0.0 to 1.0
  emotionalValence = 0; // -1.0 to 1.0
  associations = []; // array of memory IDs
  metadata = {};
}

/**
 * Agent memory state containing all memories and relationships
 */
class AgentMemory {
  coreMemories = [];
  recentEvents = [];
  recentPosts = [];
  relationships = {};
  longTermMemories = [];
  
  /**
   * Add a new memory item to the agent
   */
  addMemory(content, type = 'general', importance = 0.5) {
    const memory = new MemoryItem(content, type);
    memory.importance = importance;
    
    if (type === 'core') {
      this.coreMemories.push(memory);
    } else {
      this.longTermMemories.push(memory);
    }
    
    return memory;
  }
  
  /**
   * Get or create a relationship with another agent
   */
  getRelationship(targetAgentId) {
    if (!this.relationships[targetAgentId]) {
      this.relationships[targetAgentId] = new Relationship(targetAgentId);
    }
    return this.relationships[targetAgentId];
  }
}

/**
 * Tweet/post structure
 */
class Tweet {
  id = '';
  content = '';
  mediaUrls = [];
  createdAt = null;
  authorId = '';
  replyToId = null;
  quoteTweetId = null;
  isThread = false;
  threadIds = [];
  metadata = {};
}

/**
 * Agent configuration and state
 */
class Agent {
  id = '';
  name = '';
  description = '';
  personality = new Personality();
  styleGuide = new StyleGuide();
  memory = new AgentMemory();
  customSystemPrompt = null;
  rotatingSystemPrompts = [];
  behavior = {
    postFrequency: {
      minHoursBetweenPosts: 3,
      maxHoursBetweenPosts: 12,
      peakPostingHours: []
    },
    interactionPatterns: {
      replyProbability: 0.5,
      quoteTweetProbability: 0.3,
      likeProbability: 0.7
    },
    contentPreferences: {
      maxThreadLength: 3,
      typicalPostLength: 240,
      linkSharingFrequency: 0.2
    }
  };
  
  currentMood = {
    valence: 0, // -1.0 to 1.0 (negative to positive)
    arousal: 0, // 0.0 to 1.0 (calm to excited)
    dominance: 0.5 // 0.0 to 1.0 (submissive to dominant)
  };
  
  goals = [];
  lastPostTime = null;
  
  /**
   * Update the agent's mood based on a new event
   */
  updateMood(valenceShift, arousalShift, dominanceShift) {
    this.currentMood.valence = Math.max(-1.0, Math.min(1.0, this.currentMood.valence + valenceShift));
    this.currentMood.arousal = Math.max(0.0, Math.min(1.0, this.currentMood.arousal + arousalShift));
    this.currentMood.dominance = Math.max(0.0, Math.min(1.0, this.currentMood.dominance + dominanceShift));
  }
}

/**
 * Event that can influence agent behavior
 */
class Event {
  constructor(type, data) {
    this.type = type;
    this.data = data;
    this.timestamp = new Date();
  }
  
  id = '';
  type = ''; // 'news', 'interaction', 'mood_shift', 'scheduled', 'random'
  data = {};
  timestamp = null;
  targetAgentIds = []; // empty means broadcast to all agents
  priority = 'normal'; // 'low', 'normal', 'high', 'critical'
}

module.exports = {
  Agent,
  Personality,
  StyleGuide,
  AgentMemory,
  MemoryItem,
  Relationship,
  Tweet,
  Event
}; 