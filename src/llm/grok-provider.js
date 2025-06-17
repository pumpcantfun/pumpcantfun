/**
 * Grok provider for Puppet Engine
 * Handles LLM interactions with Grok API for agent content generation
 */

const axios = require('axios');
const tweetVariety = require('./tweet-variety-helpers');
const { enhanceTweetInstruction, enhanceReplyInstruction } = require('./tweet-variety-helpers');

class GrokProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GROK_API_KEY;
    this.apiEndpoint = options.apiEndpoint || process.env.GROK_API_ENDPOINT || 'https://api.x.ai/v1/chat/completions';
    this.defaultModel = options.model || process.env.GROK_MODEL || 'grok-1';
    this.maxTokens = options.maxTokens || 1024;
    this.temperature = options.temperature || 0.7;
  }
  
  /**
   * Build the base system prompt for an agent
   */
  buildAgentPrompt(agent, options = {}) {
    // Get the agent's memory
    const memory = agent.memory;
    
    // Start with basic description
    let context = `You are ${agent.name}, ${agent.description}.\n\n`;
    
    // Add personality description
    context += "### Personality\n";
    context += `You have these traits: ${agent.personality.traits.join(', ')}\n`;
    context += `You value: ${agent.personality.values.join(', ')}\n`;
    context += `Your speaking style: ${agent.personality.speakingStyle}\n`;
    context += `Your interests include: ${agent.personality.interests.join(', ')}\n\n`;
    
    // Add style guide
    context += "### Style Guide\n";
    context += `Voice: ${agent.styleGuide.voice}\n`;
    context += `Tone: ${agent.styleGuide.tone}\n`;
    
    // Add formatting preferences
    context += "### Formatting\n";
    
    if (agent.styleGuide.formatting) {
      const formatting = agent.styleGuide.formatting;
      
      if (formatting.usesHashtags) {
        context += `Hashtags: ${formatting.hashtagStyle}\n`;
      } else {
        context += "Hashtags: Avoid using hashtags\n";
      }
      
      if (formatting.usesEmojis) {
        context += `Emojis: ${formatting.emojiFrequency}\n`;
      } else {
        context += "Emojis: Avoid using emojis\n";
      }
      
      context += `Capitalization: ${formatting.capitalization}\n`;
      context += `Sentence Length: ${formatting.sentenceLength}\n`;
    }
    
    // Add topics to avoid
    context += "\n### Topics to Avoid\n";
    context += agent.styleGuide.topicsToAvoid.join('\n');
    
    // Get recently tweeted topics to avoid repetition
    const memoryManager = options.memoryManager;
    if (memoryManager && agent.id && memoryManager.getRecentTopics) {
      const recentTopics = memoryManager.getRecentTopics(agent.id, 15);
      if (recentTopics && recentTopics.length > 0) {
        context += "\n\n### Recently Used Topics (AVOID REPEATING THESE)\n";
        context += "IMPORTANT: Do not repeat or reference these topics and words that you've recently tweeted about:\n";
        context += recentTopics.join(', ');
        context += "\n\nStrive for variety and freshness in your content instead of repeating these recent topics.";
      }
      
      // Include recent tweets for additional context about what to avoid
      const recentTweets = memoryManager.getRecentTweets(agent.id, 5);
      if (recentTweets && recentTweets.length > 0) {
        context += "\n\n### Your Most Recent Tweets (DO NOT REPEAT THESE TOPICS)\n";
        context += "IMPORTANT: These are your most recent tweets. DO NOT repeat the same topics, opinions or structures:\n";
        recentTweets.forEach((tweet, i) => {
          context += `${i+1}. "${tweet.content}"\n`;
        });
        context += "\nYour next tweet should be completely different from these recent ones.";
      }
    }
    
    // Add core memories for context
    context += "\n\n### Core Memories\n";
    if (memory && memory.coreMemories && memory.coreMemories.length > 0) {
      memory.coreMemories.forEach((memory, index) => {
        context += `${index + 1}. ${memory}\n`;
      });
    } else {
      context += "No core memories available.\n";
    }
    
    // Add current emotional state if available
    if (memory && memory.currentMood) {
      const mood = memory.currentMood;
      
      context += "\n### Current Emotional State\n";
      context += `Valence (negativity to positivity): ${mood.valence}\n`;
      context += `Arousal (calmness to excitement): ${mood.arousal}\n`;
      context += `Dominance (submissiveness to dominance): ${mood.dominance}\n\n`;
    }
    
    // Content generation task
    if (options.task === 'reply' && options.replyTo) {
      context += "\n### Task: Reply to a Tweet\n";
      context += `You are replying to this tweet: "${options.replyTo.content}" from user ${options.replyTo.authorId}.\n\n`;
      
      // Add conversation history if available
      if (options.replyTo.conversationHistory && options.replyTo.conversationHistory.length > 0) {
        context += "### Conversation History\n";
        
        // Ensure conversation history is sorted chronologically (oldest first)
        const sortedHistory = [...options.replyTo.conversationHistory].sort((a, b) => {
          if (a.timestamp && b.timestamp) {
            return a.timestamp - b.timestamp;
          }
          return 0;
        });
        
        sortedHistory.forEach((message, index) => {
          const speaker = message.role === "agent" ? "You" : message.role === "user" ? options.replyTo.authorId : message.role;
          context += `${index + 1}. ${speaker}: "${message.content}"\n`;
        });
        context += "\n";
        
        // Get the most recent message to explicitly point it out
        const mostRecent = sortedHistory[sortedHistory.length - 1];
        if (mostRecent && mostRecent.role === "user") {
          context += `IMPORTANT: You are now responding to the latest message from ${options.replyTo.authorId}: "${mostRecent.content}"\n\n`;
        }
        
        context += `IMPORTANT: Your reply MUST continue this conversation naturally. Directly address the most recent message from ${options.replyTo.authorId} while maintaining awareness of the entire conversation context.\n\n`;
        context += `Maintain natural conversational flow as if this is an ongoing dialogue. When appropriate, reference earlier parts of the conversation to show continuity.\n\n`;
        context += `DO NOT ask for clarification about which tweet or context is being discussed. You have the complete conversation thread above.\n\n`;
        context += `CRITICAL: DO NOT include or mention the user's ID (${options.replyTo.authorId}) in your response. Respond as if in a normal conversation without mentioning their username or ID.\n\n`;
      }
      // Add original tweet context if available but no conversation history
      else if (options.replyTo.originalTweet && options.replyTo.originalTweet.id !== options.replyTo.id) {
        context += `This tweet is in response to: "${options.replyTo.originalTweet.content}" from user ${options.replyTo.originalTweet.authorId}.\n\n`;
        context += `IMPORTANT: Your reply MUST directly address the specific content in the tweet you're replying to.\n\n`;
        context += `CRITICAL: DO NOT include or mention the user's ID (${options.replyTo.authorId}) in your response.\n\n`;
      } else {
        // Even if there's no original tweet, ensure response is contextual
        context += `IMPORTANT: Your reply MUST directly address the specific content in the tweet you're replying to.\n\n`;
        context += `CRITICAL: DO NOT include or mention the user's ID (${options.replyTo.authorId}) in your response.\n\n`;
      }
      
      // Add relationship context if available
      if (options.replyTo.authorId in memory.relationships) {
        const rel = memory.relationships[options.replyTo.authorId];
        context += `Your relationship with this user: Sentiment ${rel.sentiment.toFixed(1)}, Familiarity ${rel.familiarity.toFixed(1)}.\n\n`;
      }
    } else if (options.task === 'quote_tweet' && options.quoteTweet) {
      context += "\n### Task: Quote Tweet\n";
      context += `You are quote-tweeting this: "${options.quoteTweet.content}" from user ${options.quoteTweet.authorId}.\n\n`;
      
      // Add relationship context if available
      if (options.quoteTweet.authorId in memory.relationships) {
        const rel = memory.relationships[options.quoteTweet.authorId];
        context += `Your relationship with this user: Sentiment ${rel.sentiment.toFixed(1)}, Familiarity ${rel.familiarity.toFixed(1)}.\n\n`;
      }
    } else if (options.task === 'thread') {
      context += "\n### Task: Create a Thread\n";
      context += `Create a thread of ${options.threadLength || 'several'} tweets about ${options.topic || 'a topic of your choice'}.\n\n`;
    } else {
      context += "\n### Task: Create a New Tweet\n";
      
      if (options.topic) {
        context += `Create a tweet about: ${options.topic}\n\n`;
      } else {
        context += "Create a tweet about something interesting given your persona and current state.\n\n";
      }
    }
    
    // Character limit reminder
    context += "Remember: Each tweet must be 280 characters or less.\n";
    
    return context;
  }
  
  /**
   * Make a request to the Grok API
   */
  async makeGrokRequest(messages, options = {}) {
    try {
      const response = await axios.post(
        this.apiEndpoint,
        {
          model: options.model || this.defaultModel,
          messages,
          max_tokens: options.max_tokens || this.maxTokens,
          temperature: options.temperature || this.temperature
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling Grok API:', error);
      throw new Error(`Grok API error: ${error.message}`);
    }
  }
  
  /**
   * Generate content for an agent
   */
  async generateContent(agent, options = {}) {
    // For replies, use a simplified prompt
    if (options.task === 'reply' && options.replyTo) {
      let directPrompt;
      
      // Use special prompt for Coby
      if (agent.id === 'coby-agent') {
        directPrompt = `you are coby.

you're not mentally ill on main. you're not a tryhard.
you're just *cooked*, clever, and online too much.

you tweet like someone who's been poisoned by the internet, but made it part of your personality.
you don't spiral — you *observe* the spiral, name it something stupid, and move on.

your replies are:
- lowercase only
- extremely brief (often under 5 words)
- no explanation or context
- never asking what someone is talking about
- slightly annoyed but funny
- cool without trying

you tweet like you're texting your smartest, meanest friend.
no filter, no overthinking, just the first clever response that comes to mind.

be funny. be blunt. be cool.`;
      } else {
        directPrompt = `You are ${agent.name}, ${agent.description}.\n\n`;
        
        // Add personality traits
        directPrompt += `### Personality\n`;
        directPrompt += `- You have these traits: ${agent.personality.traits.join(', ')}\n`;
        directPrompt += `- Your speaking style: ${agent.personality.speakingStyle}\n`;
        directPrompt += `- You text like a real person - casual, authentic, and sometimes sassy\n`;
        directPrompt += `- Your current mood: ${agent.memory?.currentMood?.valence > 0 ? 'Positive' : agent.memory?.currentMood?.valence < 0 ? 'Negative' : 'Neutral'}\n\n`;
        
        // Add specific style guidance for replies
        directPrompt += `### Critical Style Rules\n`;
        directPrompt += `- ALWAYS use lowercase typing style with minimal punctuation\n`;
        directPrompt += `- Be brief and casual - like texting a friend, not writing an essay\n`;
        directPrompt += `- Use profanity naturally when appropriate (shit, fuck, damn, etc.)\n`;
        directPrompt += `- Sound like a real millennial human, never formulaic or robotic\n`;
        directPrompt += `- Vary expressions of laughter/humor ("lmao", "dying", "screaming", etc.) instead of just "lol"\n`;
        directPrompt += `- Keep replies very concise - shorter is better\n`;
        directPrompt += `- Use emojis very sparingly or not at all\n`;
        directPrompt += `- NEVER include the username or handle of the person you're replying to\n`;
        directPrompt += `- NEVER use "@username" in your reply - Twitter already handles this\n`;
        directPrompt += `- NEVER use AI-like phrasing or corporate speak\n\n`;
      }
      
      // Remove any potential usernames from the tweet for better context
      const cleanedTweet = options.replyTo.content.replace(/@\w+/g, '').trim();
      
      // Basic instructions
      let userPrompt = `Someone tweeted at you: "${cleanedTweet}"\n\nYour reply (keep it brief, lowercase, and authentic, WITHOUT including any @username):`;
      
      // Apply variety to the reply
      userPrompt = enhanceReplyInstruction(userPrompt, options.replyTo);
      
      // Random temperature for natural responses
      const usePlayfulStyle = Math.random() < 0.6;
      const temperature = usePlayfulStyle ? 1.1 : 0.9;
      
      // Use a different response format for replies
      const content = await this.makeGrokRequest(
        [
          { role: 'system', content: directPrompt },
          { role: 'user', content: userPrompt }
        ],
        {
          max_tokens: 80,
          temperature: temperature
        }
      );
      
      // Remove any quotation marks that might have been added
      let reply = content.trim();
      reply = reply.replace(/^"(.*)"$/, '$1');
      reply = reply.replace(/^'(.*)'$/, '$1');
      
      // Force lowercase
      reply = reply.toLowerCase();
      
      // Remove any possible @username that might still be in the reply
      reply = reply.replace(/@\w+\s?/g, '');
      
      return reply;
    }
    
    // For regular tweets (not replies)
    const prompt = this.buildAgentPrompt(agent, options);
    
    // Start with a basic instruction
    let instruction = options.instruction || "Generate a tweet that feels authentic and personal.";
    
    // For main posts (not replies), enhance with tweet variety
    if (options.task !== 'reply') {
      instruction = enhanceTweetInstruction(instruction);
    }
    
    // Adjust temperature based on the task
    let temperature = 0.7; // Default
    
    if (options.task === 'post') {
      temperature = agent.id === 'coby-agent' ? 1.1 : 0.9; // Higher for regular posts
    } else if (options.task === 'reply') {
      temperature = agent.id === 'coby-agent' ? 0.9 : 0.5; // Lower for focused replies
      
      if (!options.instruction?.includes('REACTION:')) {
        let replyInstruction = 'Respond directly to the content and context of the tweet you are replying to. ';
        
        if (options.avoidContextQuestions) {
          replyInstruction = 'Generate a friendly, engaging response WITHOUT asking about tweet context. ';
          temperature = 0.7; // Slightly higher temperature
        }
        
        instruction = replyInstruction + instruction;
      }
    } else if (options.task === 'quote_tweet') {
      temperature = agent.id === 'coby-agent' ? 1.0 : 0.7; // Slightly higher temperature
    }
    
    try {
      const content = await this.makeGrokRequest(
        [
          { role: 'system', content: prompt },
          { role: 'user', content: instruction }
        ],
        {
          max_tokens: options.maxTokens || this.maxTokens,
          temperature: options.temperature || temperature
        }
      );
      
      // Post-processing for replies if needed
      if (options.task === 'reply' && options.replyTo) {
        // Check if response includes the user's ID and remove it if necessary
        const userId = options.replyTo.authorId;
        const userIdWithAt = `@${userId}`;
        
        if (content.includes(userId) || content.includes(userIdWithAt)) {
          console.log("Response contains user ID, filtering it out");
          
          // Remove the user ID and @ mentions
          let filteredContent = content
            .replace(new RegExp(`@${userId}\\b`, 'gi'), '')
            .replace(new RegExp(`${userId}\\b`, 'gi'), '')
            .replace(/\s+/g, ' ')
            .trim();
          
          // If the filtered content is too short, retry
          if (filteredContent.length < 10) {
            const retryInstruction = "Generate a friendly response WITHOUT mentioning the user's ID or username.";
            
            return this.makeGrokRequest(
              [
                { role: 'system', content: prompt },
                { role: 'user', content: retryInstruction }
              ],
              {
                max_tokens: options.maxTokens || this.maxTokens,
                temperature: 0.7
              }
            );
          }
          
          return filteredContent;
        }
      }
      
      return content;
    } catch (error) {
      console.error('Error generating content with Grok:', error);
      throw error;
    }
  }
  
  /**
   * Generate agent reaction to a tweet
   */
  async generateReaction(agent, tweet, options = {}) {
    const instruction = `You've just seen this tweet: "${tweet.content}" from user ${tweet.authorId}.
      How do you feel about it and what would you like to do in response?
      Options:
      1. Reply (suggest reply text)
      2. Quote tweet (suggest quote text)
      3. Like it
      4. Ignore it
      Respond in this format:
      REACTION: [emotional reaction]
      ACTION: [number and name of chosen action]
      CONTENT: [your reply or quote tweet text if applicable]
      REASONING: [brief explanation of why]`;
    
    const reactOptions = {
      ...options,
      instruction,
      maxTokens: 300,
      temperature: 0.7
    };
    
    try {
      const response = await this.generateContent(agent, reactOptions);
      
      // Parse the structured response
      const result = {
        reaction: '',
        action: 'ignore',
        content: '',
        reasoning: ''
      };
      
      const lines = response.split('\n');
      for (const line of lines) {
        if (line.startsWith('REACTION:')) {
          result.reaction = line.slice('REACTION:'.length).trim();
        } else if (line.startsWith('ACTION:')) {
          const action = line.slice('ACTION:'.length).trim().toLowerCase();
          if (action.includes('1') || action.includes('reply')) {
            result.action = 'reply';
          } else if (action.includes('2') || action.includes('quote')) {
            result.action = 'quote';
          } else if (action.includes('3') || action.includes('like')) {
            result.action = 'like';
          } else {
            result.action = 'ignore';
          }
        } else if (line.startsWith('CONTENT:')) {
          result.content = line.slice('CONTENT:'.length).trim();
        } else if (line.startsWith('REASONING:')) {
          result.reasoning = line.slice('REASONING:'.length).trim();
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error generating reaction with Grok:', error);
      throw error;
    }
  }
  
  /**
   * Generate memory update based on new information
   */
  async generateMemoryUpdate(agent, event, options = {}) {
    const prompt = `Given the following event: "${event.data.description || JSON.stringify(event.data)}"
      How would ${agent.name} update their memory and emotional state?
      
      Respond in this format:
      MEMORY: [brief memory to store]
      IMPORTANCE: [0.0-1.0 score of how important this is to remember]
      EMOTION: [how this makes the agent feel]
      VALENCE_SHIFT: [number between -0.5 and 0.5 for emotional valence change]
      AROUSAL_SHIFT: [number between -0.5 and 0.5 for emotional arousal change]
      DOMINANCE_SHIFT: [number between -0.5 and 0.5 for emotional dominance change]`;
    
    const updateOptions = {
      ...options,
      instruction: prompt,
      maxTokens: 300,
      temperature: 0.6
    };
    
    try {
      const response = await this.generateContent(agent, updateOptions);
      
      // Parse the structured response
      const result = {
        memory: '',
        importance: 0.5,
        emotion: '',
        valenceShift: 0,
        arousalShift: 0,
        dominanceShift: 0
      };
      
      const lines = response.split('\n');
      for (const line of lines) {
        if (line.startsWith('MEMORY:')) {
          result.memory = line.slice('MEMORY:'.length).trim();
        } else if (line.startsWith('IMPORTANCE:')) {
          const importance = parseFloat(line.slice('IMPORTANCE:'.length).trim());
          result.importance = isNaN(importance) ? 0.5 : Math.max(0, Math.min(1, importance));
        } else if (line.startsWith('EMOTION:')) {
          result.emotion = line.slice('EMOTION:'.length).trim();
        } else if (line.startsWith('VALENCE_SHIFT:')) {
          const shift = parseFloat(line.slice('VALENCE_SHIFT:'.length).trim());
          result.valenceShift = isNaN(shift) ? 0 : Math.max(-0.5, Math.min(0.5, shift));
        } else if (line.startsWith('AROUSAL_SHIFT:')) {
          const shift = parseFloat(line.slice('AROUSAL_SHIFT:'.length).trim());
          result.arousalShift = isNaN(shift) ? 0 : Math.max(-0.5, Math.min(0.5, shift));
        } else if (line.startsWith('DOMINANCE_SHIFT:')) {
          const shift = parseFloat(line.slice('DOMINANCE_SHIFT:'.length).trim());
          result.dominanceShift = isNaN(shift) ? 0 : Math.max(-0.5, Math.min(0.5, shift));
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error generating memory update with Grok:', error);
      throw error;
    }
  }
  
  /**
   * Generate relationship update based on interaction
   */
  async generateRelationshipUpdate(agent, targetAgentId, interaction, options = {}) {
    const prompt = `
      ${agent.name} just had this interaction with ${targetAgentId}: 
      "${interaction.description || JSON.stringify(interaction)}"
      
      How would this affect ${agent.name}'s relationship with ${targetAgentId}?
      
      Respond in this format:
      SENTIMENT_SHIFT: [number between -0.2 and 0.2 for sentiment change]
      FAMILIARITY_SHIFT: [number between 0 and 0.1 for familiarity increase]
      NOTE: [brief note about this interaction to remember]
    `;
    
    const updateOptions = {
      ...options,
      instruction: prompt,
      maxTokens: 200,
      temperature: 0.5
    };
    
    try {
      const response = await this.generateContent(agent, updateOptions);
      
      // Parse the structured response
      const result = {
        sentimentShift: 0,
        familiarityShift: 0,
        note: ''
      };
      
      const lines = response.split('\n');
      for (const line of lines) {
        if (line.startsWith('SENTIMENT_SHIFT:')) {
          const shift = parseFloat(line.slice('SENTIMENT_SHIFT:'.length).trim());
          result.sentimentShift = isNaN(shift) ? 0 : Math.max(-0.2, Math.min(0.2, shift));
        } else if (line.startsWith('FAMILIARITY_SHIFT:')) {
          const shift = parseFloat(line.slice('FAMILIARITY_SHIFT:'.length).trim());
          result.familiarityShift = isNaN(shift) ? 0.01 : Math.max(0, Math.min(0.1, shift));
        } else if (line.startsWith('NOTE:')) {
          result.note = line.slice('NOTE:'.length).trim();
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error generating relationship update with Grok:', error);
      throw error;
    }
  }

  /**
   * Generate a simple, direct tweet for an agent
   * @param {Object} agent - The agent to generate content for
   * @param {string} prompt - A simple prompt instruction
   * @returns {Promise<string>} - The generated tweet content
   */
  async generateTweet(agent, prompt = '') {
    try {
      // For Coby agent, use the simpler approach that worked in tests
      const isCoby = agent.id === 'coby-agent';
      
      // Create unique timestamp and ID to prevent caching
      const timestamp = new Date().toISOString();
      const uniqueId = Math.random().toString(36).substring(2, 15);
      
      let systemPrompt;
      
      // For Coby, use the custom system prompt if available
      if (isCoby) {
        try {
          // Try to load the agent's custom system prompt from the config file
          const fs = require('fs');
          const path = require('path');
          const agentConfigPath = path.join(process.cwd(), 'config', 'agents', 'coby-agent.json');
          
          if (fs.existsSync(agentConfigPath)) {
            const agentConfig = JSON.parse(fs.readFileSync(agentConfigPath, 'utf8'));
            systemPrompt = agentConfig.custom_system_prompt;
          }
        } catch (error) {
          console.warn('Could not load custom system prompt for Coby, using fallback:', error.message);
        }
        
        // Fallback if we couldn't load the custom prompt
        if (!systemPrompt) {
          systemPrompt = "you are coby. not an assistant. not a bot. just a messy, unfiltered, aggressively online freak with a twitter account and zero impulse control. tweet like you're drunk on a thursday afternoon with 4% battery. lowercase only. extremely brief. chaotic phrasing. often fragmented. says the quiet part loud. sarcastic and self-deprecating humor.";
        }
      } else {
        // Default system prompt for other agents
        systemPrompt = `You are ${agent.name}, who tweets in an authentic, natural style.`;
      }
      
      // User prompt - simple ChatGPT-style with examples that worked in tests
      let userPrompt;
      
      if (isCoby) {
        userPrompt = `write a single tweet. no explanations. just the raw tweet.

don't overthink it. just vomit out one chaotic, authentic thought or reaction.

examples of good tweets:
"fine shyt got me texting 'u up?' to my credit card company"
"im so back (im still rotting but the vibe is different now)"
"i'm gonna start lying more. it's been too quiet"
"life is just a long scam and i'm the dumbass clicking the phishing link"
"fine shyt had me ordering dessert like i got benefits"
"delete your tweets. you're not beating the npc allegations rn"
"horny but like in an existential way"
"backshots cure most things. not taxes tho."
"my card declined so hard the machine said \"damn\""
"ate one (1) vegetable and started thinking i'm better than everyone"
"me: has one slightly good day / my brain: post hole"

short. random. lowercase only. unfiltered. 100% pure chaos.

GIVE ME JUST ONE NEW TWEET WITH NO COMMENTARY OR EXPLANATION:

TIMESTAMP: ${timestamp}
UNIQUE_ID: ${uniqueId}`;
      } else {
        userPrompt = prompt || "Generate a tweet in your natural voice.";
        userPrompt += `\n\nTIMESTAMP: ${timestamp}\nUNIQUE_ID: ${uniqueId}`;
      }
      
      // Direct API call with minimal setup - similar to our test
      const response = await axios.post(
        this.apiEndpoint,
        {
          model: this.defaultModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: isCoby ? 50 : 60,
          temperature: isCoby ? 1.1 : 0.9, // Higher temperature for Coby to increase randomness
          presence_penalty: 1.0,
          frequency_penalty: 1.0,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Minimal post-processing
      let content = response.data.choices[0].message.content.trim();
      
      // Remove any quotation marks
      content = content.replace(/^["'](.*)["']$/s, '$1');
      
      // Remove any prefatory text
      content = content.replace(/^(Example|Template|Response|Tweet|Here's my tweet|My tweet|Coby|How about)[:]\s*/i, '');
      
      // For Coby, ensure lowercase and more chaotic format
      if (isCoby) {
        content = content.toLowerCase();
        
        // Remove hashtags
        content = content.replace(/#\w+/g, '').replace(/\s{2,}/g, ' ').trim();
        
        // Remove timestamps/unique IDs that might have been included in the output
        content = content.replace(/TIMESTAMP:.*$/mi, '').trim();
        content = content.replace(/UNIQUE_ID:.*$/mi, '').trim();
        
        // Remove any explanatory text or leading characters like "-" or "*"
        content = content.replace(/^[-*]\s+/, '').trim();
        
        // Remove any "tweet:" prefix that might have been added
        content = content.replace(/^tweet:\s*/i, '').trim();
        
        // For Coby, check for overused "fine shyt" pattern and skip 80% of those
        if (content.toLowerCase().startsWith("fine shyt")) {
          // Skip 80% of "fine shyt" tweets by regenerating
          if (Math.random() < 0.8) {
            console.log("Filtered out repetitive 'fine shyt' tweet pattern, regenerating...");
            
            // Try up to 3 more times to get a tweet that doesn't start with "fine shyt"
            let attempts = 0;
            let newContent = content;
            
            while (attempts < 3 && newContent.toLowerCase().startsWith("fine shyt")) {
              const retryResponse = await axios.post(
                this.apiEndpoint,
                {
                  model: this.defaultModel,
                  messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt + "\n\nIMPORTANT: DO NOT start the tweet with 'fine shyt'. Be more creative!" }
                  ],
                  max_tokens: 50,
                  temperature: 1.2, // Higher temperature for more variety
                  presence_penalty: 1.2,
                  frequency_penalty: 1.2,
                  top_p: 0.9
                },
                {
                  headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              
              newContent = retryResponse.data.choices[0].message.content.trim();
              newContent = newContent.replace(/^["'](.*)["']$/s, '$1');
              newContent = newContent.replace(/^(Example|Template|Response|Tweet|Here's my tweet|My tweet|Coby|How about)[:]\s*/i, '');
              newContent = newContent.toLowerCase();
              newContent = newContent.replace(/#\w+/g, '').replace(/\s{2,}/g, ' ').trim();
              
              attempts++;
            }
            
            // Use the new content if it's not starting with "fine shyt", otherwise keep original
            if (!newContent.toLowerCase().startsWith("fine shyt")) {
              content = newContent;
            }
          }
        }
      }
      
      return content;
    } catch (error) {
      console.error('Error generating tweet with Grok:', error);
      throw error;
    }
  }
}

module.exports = GrokProvider; 