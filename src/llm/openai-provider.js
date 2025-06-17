/**
 * OpenAI provider for Puppet Engine
 * Handles LLM interactions for agent content generation
 */

const { OpenAI } = require('openai');
const tweetVariety = require('./tweet-variety-helpers');
const { enhanceTweetInstruction, enhanceReplyInstruction } = require('./tweet-variety-helpers');

class OpenAIProvider {
  constructor(options = {}) {
    this.client = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY
    });
    
    this.defaultModel = options.model || process.env.OPENAI_MODEL || 'gpt-4o';
    this.maxTokens = options.maxTokens || 1024;
    this.temperature = options.temperature || 0.7;
  }
  
  /**
   * Select an appropriate system prompt for the agent
   * @param {Object} agent - The agent to select a prompt for
   * @param {string} context - Additional context (e.g., 'reply', 'tweet')
   * @returns {string} - The selected system prompt
   */
  selectSystemPrompt(agent, context = 'tweet') {
    const { logPromptSelection } = require('./tweet-variety-helpers');
    
    // Check if agent has rotating prompts and select one randomly
    if (agent.rotatingSystemPrompts && agent.rotatingSystemPrompts.length > 0) {
      const randomIndex = Math.floor(Math.random() * agent.rotatingSystemPrompts.length);
      const selectedPrompt = agent.rotatingSystemPrompts[randomIndex];
      
      // Log which prompt was selected
      logPromptSelection(agent, randomIndex, context);
      
      return selectedPrompt;
    }
    
    // If no rotating prompts, use the custom system prompt
    if (agent.customSystemPrompt) {
      // Log that we're using the custom prompt
      logPromptSelection(agent, -1, context);
      
      return agent.customSystemPrompt;
    }
    
    // Fall back to a default prompt based on agent properties
    // Log that we're using a generated prompt
    logPromptSelection(agent, -2, context);
    
    return `You are ${agent.name}, ${agent.description || 'a social media personality'}. 
Your tone is ${agent.styleGuide.tone || 'casual and authentic'}.
Your writing style is ${agent.personality.speakingStyle || 'conversational and natural'}.`;
  }
  
  /**
   * Build a complete agent prompt
   */
  buildAgentPrompt(agent, options = {}) {
    // For agents with custom prompts, prioritize using either a rotating prompt or the custom prompt
    if ((agent.rotatingSystemPrompts && agent.rotatingSystemPrompts.length > 0) || agent.customSystemPrompt) {
      // Pass the task type as context if available
      const context = options.task || 'tweet';
      return this.selectSystemPrompt(agent, context);
    }
    
    // Otherwise build a comprehensive prompt based on agent properties
    const memory = agent.memory;
    let context = '';
    
    // Agent identity
    context += `# You are ${agent.name}\n\n`;
    context += `${agent.description}\n\n`;
    
    // Personality traits
    context += "## Personality\n";
    if (agent.personality.traits.length > 0) {
      context += "### Traits\n";
      agent.personality.traits.forEach(trait => {
        context += `- ${trait}\n`;
      });
      context += "\n";
    }
    
    if (agent.personality.values.length > 0) {
      context += "### Values\n";
      agent.personality.values.forEach(value => {
        context += `- ${value}\n`;
      });
      context += "\n";
    }
    
    if (agent.personality.speakingStyle) {
      context += "### Speaking Style\n";
      context += `${agent.personality.speakingStyle}\n\n`;
    }
    
    if (agent.personality.interests.length > 0) {
      context += "### Interests\n";
      agent.personality.interests.forEach(interest => {
        context += `- ${interest}\n`;
      });
      context += "\n";
    }
    
    // Style guide
    context += "## Style Guide\n";
    
    if (agent.styleGuide.voice) {
      context += `Voice: ${agent.styleGuide.voice}\n`;
    }
    
    if (agent.styleGuide.tone) {
      context += `Tone: ${agent.styleGuide.tone}\n`;
    }
    
    if (agent.styleGuide.formatting) {
      const formatting = agent.styleGuide.formatting;
      
      context += "\n### Formatting\n";
      
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
        context += `IMPORTANT: Your reply MUST directly address the specific content and question in the tweet you're replying to. Engage with what the user has said and maintain context from the conversation. Do not generate a generic or unrelated response.\n\n`;
        context += `Consider this part of an ongoing conversation. Maintain natural conversational flow as if continuing a dialogue. Ask follow-up questions when appropriate, and reference previous parts of the conversation to show continuity.\n\n`;
        context += `CRITICAL: DO NOT include or mention the user's ID (${options.replyTo.authorId}) in your response. Respond as if in a normal conversation without mentioning their username or ID.\n\n`;
      } else {
        // Even if there's no original tweet, ensure response is contextual
        context += `IMPORTANT: Your reply MUST directly address the specific content in the tweet you're replying to. Engage with what the user has said and respond appropriately to their message. Do not generate a generic or unrelated response.\n\n`;
        context += `Treat this as the beginning of a conversation that may continue. Your response should invite further engagement when appropriate. If the user is asking a question or starting a discussion, respond in a way that facilitates ongoing dialogue.\n\n`;
        context += `CRITICAL: DO NOT include or mention the user's ID (${options.replyTo.authorId}) in your response. Respond as if in a normal conversation without mentioning their username or ID.\n\n`;
      }
      
      // Handle vague mentions or tweets with limited context
      const tweetContent = options.replyTo.content.toLowerCase();
      if (tweetContent.includes("what") && (tweetContent.includes("tweet") || tweetContent.includes("context") || tweetContent.includes("talking about"))) {
        context += `CRITICAL INSTRUCTION: The user is asking about what tweet or context you're referring to. This is happening because you're not providing enough context in your responses. DO NOT ask them what tweet they're referring to or what's on their mind.\n\n`;
        context += `Instead, respond with something substantive and engaging without requiring additional context. For example, share an interesting thought or observation, ask an open-ended question about a topic relevant to your persona, or make a friendly comment that doesn't presuppose prior context.\n\n`;
        context += `If there truly is no context and you've been mentioned out of the blue, simply engage in a friendly way without asking for clarification about previous tweets or conversations.\n\n`;
      }
      
      // Add relationship context if available
      if (options.replyTo.authorId in memory.relationships) {
        const rel = memory.relationships[options.replyTo.authorId];
        context += `Your relationship with this user: Sentiment ${rel.sentiment.toFixed(1)}, Familiarity ${rel.familiarity.toFixed(1)}.\n\n`;
        
        // If we've interacted with this user before, emphasize conversation continuity
        if (rel.familiarity > 0.2) {
          context += `You've interacted with this user before, so maintain appropriate continuity in your conversation style and topics discussed previously.\n\n`;
        }
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
   * Generate content for an agent
   */
  async generateContent(agent, options = {}) {
    // For replies, always make sure we have a simpler, more direct prompt
    if (options.task === 'reply' && options.replyTo) {
      // Create a simplified prompt that focuses on just responding to the tweet content
      let directPrompt;
      
      // Use special prompt for Coby
      if (agent.id === 'coby-agent') {
        // Check for rotating system prompts for Coby
        if (agent.rotatingSystemPrompts && agent.rotatingSystemPrompts.length > 0) {
          // Use the context-aware prompt selection helper
          directPrompt = this.selectSystemPrompt(agent, 'reply');
        } else {
          // Use the default Coby prompt if no rotating prompts
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
        }
      } else {
        directPrompt = `You are ${agent.name}, ${agent.description}.\n\n`;
        
        // Add some personality traits
        directPrompt += `### Personality\n`;
        directPrompt += `- You have these traits: ${agent.personality.traits.join(', ')}\n`;
        directPrompt += `- Your speaking style: ${agent.personality.speakingStyle} - casual and conversational\n`;
        directPrompt += `- Your vibe: relaxed, unbothered, sometimes insightful, authentic, occasionally deadpan\n`;
        directPrompt += `- You text like a real person in their 30s - casual but not trying too hard to be trendy\n`;
        directPrompt += `- You respond naturally, as if texting a friend\n`;
        directPrompt += `- Your current mood: ${agent.currentMood.valence > 0 ? 'Positive' : agent.currentMood.valence < 0 ? 'Negative' : 'Neutral'}\n\n`;
        
        // Add casual, natural style guidance
        directPrompt += `### Style Guidance\n`;
        directPrompt += `- CRITICAL: Your replies must sound like real, natural text messages from a real person\n`;
        directPrompt += `- NEVER use quotation marks around your response - just write the text directly\n`;
        directPrompt += `- DON'T use cliché internet phrases like "caught in 4k", "it's giving", etc. too much\n`;
        directPrompt += `- DON'T be too on-the-nose or predictable in your responses\n`;
        directPrompt += `- Use casual language naturally, not like you're following a template\n`;
        directPrompt += `- Sometimes use contractions like "can't", "don't", "won't" to sound natural\n`;
        directPrompt += `- Use abbreviations like "u", "ur", "idk", "lol", etc. occasionally but not in every message\n`;
        directPrompt += `- ONLY use lowercase typing style with minimal punctuation\n`;
        directPrompt += `- Keep responses concise - sometimes very brief, sometimes a bit longer\n`;
        directPrompt += `- Sometimes be a bit dry, sarcastic, or mildly dismissive if it fits the context\n`;
        directPrompt += `- DON'T overuse emojis - use them sparingly and thoughtfully, if at all\n`;
        directPrompt += `- Sometimes respond with unexpected wit or a different angle on the conversation\n`;
        directPrompt += `- NEVER sound like you're following a formula or script\n\n`;

        // Add examples of good casual responses
        directPrompt += `### Good Response Examples\n`;
        directPrompt += `For the prompt "hey what's up": \n`;
        directPrompt += `- not much. you?\n`;
        directPrompt += `- working on something. what about you\n`;
        directPrompt += `- honestly? nothing interesting\n\n`;
        
        directPrompt += `For the prompt "do you like coffee?": \n`;
        directPrompt += `- literally can't function without it\n`;
        directPrompt += `- sometimes. depends on my mood\n`;
        directPrompt += `- more of a tea person actually\n\n`;
        
        directPrompt += `For the prompt "what do you think about the new AI models?": \n`;
        directPrompt += `- interesting but overhyped\n`;
        directPrompt += `- still waiting for one that gets my jokes\n`;
        directPrompt += `- getting better. still weird sometimes tho\n\n`;
      }
      
      if (options.replyTo.originalTweet) {
        directPrompt += `### Context\n`;
        directPrompt += `This tweet was in response to your earlier tweet or a conversation.\n\n`;
      }
      
      // Basic instructions
      let userPrompt = `Someone tweeted at you: "${options.replyTo.content}"\n\nYour reply (don't use quotation marks, just write directly):`;
      
      // Apply variety to the reply using our helper
      userPrompt = enhanceReplyInstruction(userPrompt, options.replyTo);
      
      // Randomly vary temperature to get a mix of coherent and more natural responses
      const usePlayfulStyle = Math.random() < 0.6; // 60% chance of more creative responses
      const temperature = usePlayfulStyle ? 1.1 : 0.9;
      
      // Use a different response format for replies to make them more natural
      const output = await this.client.chat.completions.create({
        model: options.model || this.defaultModel,
        messages: [
          { role: 'system', content: directPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 80, // Keep it short for replies
        temperature: temperature
      });
      
      // Remove any quotation marks that might have slipped through
      let reply = output.choices[0].message.content.trim();
      reply = reply.replace(/^"(.*)"$/, '$1'); // Remove surrounding quotes
      reply = reply.replace(/^'(.*)'$/, '$1'); // Remove surrounding single quotes
      
      return reply;
    }
    
    // For regular tweets (not replies)
    // Start with the base agent prompt
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
      // Higher temperature for regular posts to encourage creativity
      temperature = 0.9;
    }

    if (options.task === 'reply') {
      temperature = 0.5; // Lower temperature for more focused replies
      
      // Add additional instruction for replies to ensure they're contextual
      if (!options.instruction?.includes('REACTION:')) {
        let replyInstruction = 'Respond directly to the content and context of the tweet you are replying to as part of an ongoing conversation. Be attentive to the user\'s tone and intent, and maintain natural conversational flow. ';
        
        // Handle cases where we should avoid context questions
        if (options.avoidContextQuestions) {
          replyInstruction = 'Generate a friendly, engaging response WITHOUT asking about tweet context, previous conversations, or what the user is referring to. Instead, share something interesting or ask an open-ended question related to your persona. Start a fresh conversation. ';
          temperature = 0.7; // Slightly higher temperature for more creative response
        } else {
          replyInstruction += 'IMPORTANT: DO NOT ask what tweet they\'re referring to or what\'s on their mind - instead create meaningful engagement based on the available context. ';
        }
        
        instruction = replyInstruction + instruction;
      }
    }
    
    const requestOptions = {
      model: options.model || this.defaultModel,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: instruction }
      ],
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: options.temperature || temperature
    };
    
    try {
      const response = await this.client.chat.completions.create(requestOptions);
      const content = response.choices[0].message.content.trim();
      
      // Post-processing steps for replies if needed
      if (options.task === 'reply') {
        // Check for context questions and filter out user IDs
        if (content.toLowerCase().includes("what tweet") || 
            content.toLowerCase().includes("which tweet") ||
            content.toLowerCase().includes("what's on your mind") ||
            content.toLowerCase().includes("what are you referring to")) {
          
          // Retry with a more specific instruction to avoid context questions
          const retryInstruction = "Generate a friendly, engaging response WITHOUT asking about tweet context, previous conversations, or what the user is referring to. Instead, share something interesting or ask an open-ended question.";
          
          const retryOptions = {
            ...requestOptions,
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: retryInstruction }
            ],
            temperature: 0.7 // Slightly higher temperature for more creativity
          };
          
          console.log("Retrying response generation to avoid context questions");
          const retryResponse = await this.client.chat.completions.create(retryOptions);
          return retryResponse.choices[0].message.content.trim();
        }
        
        // Check if response still includes the user's ID and remove it if necessary
        if (options.replyTo && options.replyTo.authorId) {
          const userId = options.replyTo.authorId;
          const userIdWithAt = `@${userId}`;
          
          if (content.includes(userId) || content.includes(userIdWithAt)) {
            console.log("Response contains user ID, filtering it out");
            
            // Try removing the user ID and @ mentions
            let filteredContent = content
              .replace(new RegExp(`@${userId}\\b`, 'gi'), '')
              .replace(new RegExp(`${userId}\\b`, 'gi'), '')
              .replace(/\s+/g, ' ')
              .trim();
            
            // If the filtered content is too short or empty, retry generation
            if (filteredContent.length < 10) {
              const retryInstruction = "Generate a friendly response WITHOUT mentioning the user's ID or username. Respond directly to their message content only.";
              
              const retryOptions = {
                ...requestOptions,
                messages: [
                  { role: 'system', content: prompt },
                  { role: 'user', content: retryInstruction }
                ],
                temperature: 0.7 // Slightly higher temperature for more creativity
              };
              
              console.log("Retrying response generation to avoid user ID mentions");
              const retryResponse = await this.client.chat.completions.create(retryOptions);
              return retryResponse.choices[0].message.content.trim();
            }
            
            return filteredContent;
          }
        }
      }
      
      return content;
    } catch (error) {
      console.error('Error generating content with OpenAI:', error);
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
      console.error('Error generating reaction with OpenAI:', error);
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
          result.importance = parseFloat(line.slice('IMPORTANCE:'.length).trim()) || 0.5;
        } else if (line.startsWith('EMOTION:')) {
          result.emotion = line.slice('EMOTION:'.length).trim();
        } else if (line.startsWith('VALENCE_SHIFT:')) {
          result.valenceShift = parseFloat(line.slice('VALENCE_SHIFT:'.length).trim()) || 0;
        } else if (line.startsWith('AROUSAL_SHIFT:')) {
          result.arousalShift = parseFloat(line.slice('AROUSAL_SHIFT:'.length).trim()) || 0;
        } else if (line.startsWith('DOMINANCE_SHIFT:')) {
          result.dominanceShift = parseFloat(line.slice('DOMINANCE_SHIFT:'.length).trim()) || 0;
        }
      }
      
      // Ensure values are within bounds
      result.importance = Math.max(0, Math.min(1, result.importance));
      result.valenceShift = Math.max(-0.5, Math.min(0.5, result.valenceShift));
      result.arousalShift = Math.max(-0.5, Math.min(0.5, result.arousalShift));
      result.dominanceShift = Math.max(-0.5, Math.min(0.5, result.dominanceShift));
      
      return result;
    } catch (error) {
      console.error('Error generating memory update with OpenAI:', error);
      throw error;
    }
  }
  
  /**
   * Generate relationship update after interaction with another agent
   */
  async generateRelationshipUpdate(agent, targetAgentId, interaction, options = {}) {
    const memory = agent.memory;
    const relationship = memory.relationships[targetAgentId] || { 
      sentiment: 0, 
      familiarity: 0.1,
      trust: 0 
    };
    
    const prompt = `${agent.name} just had this interaction with ${targetAgentId}:
      "${interaction.description || JSON.stringify(interaction)}"
      
      Current relationship:
      - Sentiment: ${relationship.sentiment} (-1.0 to 1.0)
      - Familiarity: ${relationship.familiarity} (0.0 to 1.0)
      - Trust: ${relationship.trust} (0.0 to 1.0)
      
      How would this interaction affect their relationship? Respond in this format:
      SENTIMENT_CHANGE: [number between -0.2 and 0.2]
      FAMILIARITY_CHANGE: [number between 0 and 0.1]
      TRUST_CHANGE: [number between -0.2 and 0.2]
      NOTE: [brief note about this interaction to remember]`;
    
    const updateOptions = {
      ...options,
      instruction: prompt,
      maxTokens: 250,
      temperature: 0.6
    };
    
    try {
      const response = await this.generateContent(agent, updateOptions);
      
      // Parse the structured response
      const result = {
        sentimentChange: 0,
        familiarityChange: 0,
        trustChange: 0,
        note: ''
      };
      
      const lines = response.split('\n');
      for (const line of lines) {
        if (line.startsWith('SENTIMENT_CHANGE:')) {
          result.sentimentChange = parseFloat(line.slice('SENTIMENT_CHANGE:'.length).trim()) || 0;
        } else if (line.startsWith('FAMILIARITY_CHANGE:')) {
          result.familiarityChange = parseFloat(line.slice('FAMILIARITY_CHANGE:'.length).trim()) || 0;
        } else if (line.startsWith('TRUST_CHANGE:')) {
          result.trustChange = parseFloat(line.slice('TRUST_CHANGE:'.length).trim()) || 0;
        } else if (line.startsWith('NOTE:')) {
          result.note = line.slice('NOTE:'.length).trim();
        }
      }
      
      // Ensure values are within bounds
      result.sentimentChange = Math.max(-0.2, Math.min(0.2, result.sentimentChange));
      result.familiarityChange = Math.max(0, Math.min(0.1, result.familiarityChange));
      result.trustChange = Math.max(-0.2, Math.min(0.2, result.trustChange));
      
      return result;
    } catch (error) {
      console.error('Error generating relationship update with OpenAI:', error);
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
      // For Coby agent, use the simpler approach that worked in our tests
      const isCoby = agent.id === 'coby-agent';
      
      // Create unique timestamp and ID to prevent caching
      const timestamp = new Date().toISOString();
      const uniqueId = Math.random().toString(36).substring(2, 15);
      
      // Determine whether to use prompt as system or user message
      let systemPrompt = '';
      let userPrompt = '';
      
      // If the prompt is substantial (like when we're passing the full custom system prompt), 
      // use it as the user message with an empty system message
      if (prompt && prompt.length > 100) {
        systemPrompt = "You are a Twitter user.";
        userPrompt = prompt;
      } else {
        // Get an appropriate system prompt using the helper method
        systemPrompt = this.selectSystemPrompt(agent, 'tweet');
          
        // Default user prompt if none provided
        userPrompt = prompt || "Generate a tweet in your natural voice.";
        
        // For Coby, we add examples that work well with the prompt style
        if (isCoby) {
          userPrompt = `write a single tweet. no explanations. just the raw tweet.

don't overthink it. just vomit out one chaotic, authentic thought or reaction.

examples of good tweets:
"fine shyt got me texting 'u up?' to my credit card company"
"backshots cure most things. not taxes tho."
"everyone's vibing and i'm just sitting here overdrafted and over it"
"me: has one slightly good day / my brain: post hole"
"delete your tweets. you're not beating the npc allegations rn"
"horny but like in an existential way"
"she blocked me and i felt that in my credit score"
"i don't rise and grind i rot and scroll"
"thought i was the problem. turns out i was. just thought you should know"

short. random. lowercase only. unfiltered. pure chaos.

GIVE ME JUST ONE NEW TWEET WITH NO COMMENTARY OR EXPLANATION:`;
        }
        
        // For default approach, add timestamp to prevent caching
        if (!userPrompt.includes('TIMESTAMP')) {
          userPrompt += `\n\nTIMESTAMP: ${timestamp}\nUNIQUE_ID: ${uniqueId}`;
        }
      }
      
      // Direct API call with minimal processing - similar to our test script
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: isCoby ? 50 : 100,
        temperature: 0.9, // Use 0.9 which worked well in tests
        presence_penalty: 1.0,
        frequency_penalty: 1.0,
        top_p: 0.95
      });
      
      // Minimal post-processing
      let content = response.choices[0].message.content.trim();
      
      // Remove any quotation marks
      content = content.replace(/^["'](.*)["']$/s, '$1');
      
      // Remove any prefatory text
      content = content.replace(/^(Example|Template|Response|Tweet|Here's my tweet|My tweet|Coby|How about)[:]\s*/i, '');
      
      // For Coby, ensure lowercase
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
        
        // Filter out generic output patterns and LLM defaults like "chaos soup"
        const blacklistedPhrases = [
          "more like chaos soup",
          "chaos soup",
          "my brain is soup",
          "my brain is a soup",
          "brain soup",
          "brain is soup",
          "that's the tweet",
          "and that's the tweet",
          "and that's it",
          "that's all",
          "call that",
          "just saying",
          "no thoughts just vibes",
          "no thoughts head empty",
          "head empty",
          "just thoughts",
          "for real though",
          "welcome to my ted talk",
          "thank you for coming to my ted talk"
        ];
        
        // Check if the content contains any blacklisted phrases
        const containsBlacklisted = blacklistedPhrases.some(phrase => 
          content.toLowerCase().includes(phrase.toLowerCase())
        );
        
        // If it contains blacklisted phrases, try to regenerate with clearer instructions
        if (containsBlacklisted) {
          console.log("Detected generic phrase in output, regenerating...");
          
          // Try up to 2 more times to get better content
          let attempts = 0;
          let newContent = content;
          
          const blacklistPrompt = userPrompt + `

IMPORTANT INSTRUCTION: 
- DO NOT use phrases like "chaos soup", "brain soup", "that's the tweet", "ted talk", etc.
- Be more specific and unique to Coby's character
- Focus on random personal thoughts, not generic internet phrases
- No meta-commentary about the nature of tweets or your brain
- Just give me the raw, unfiltered thought with no framing`;
          
          while (attempts < 2 && blacklistedPhrases.some(phrase => 
            newContent.toLowerCase().includes(phrase.toLowerCase())
          )) {
            const retryResponse = await this.client.chat.completions.create({
              model: this.defaultModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: blacklistPrompt }
              ],
              max_tokens: 50,
              temperature: 1.1, // Higher temperature for more variety
              presence_penalty: 1.2,
              frequency_penalty: 1.2,
              top_p: 0.95
            });
            
            newContent = retryResponse.choices[0].message.content.trim();
            newContent = newContent.replace(/^["'](.*)["']$/s, '$1');
            newContent = newContent.replace(/^(Example|Template|Response|Tweet|Here's my tweet|My tweet|Coby|How about)[:]\s*/i, '');
            newContent = newContent.toLowerCase();
            newContent = newContent.replace(/#\w+/g, '').replace(/\s{2,}/g, ' ').trim();
            
            attempts++;
          }
          
          // Use the new content if it doesn't contain blacklisted phrases
          if (!blacklistedPhrases.some(phrase => 
            newContent.toLowerCase().includes(phrase.toLowerCase())
          )) {
            content = newContent;
          }
        }
        
        // For Coby, check for overused "fine shyt" pattern and skip 80% of those
        if (content.toLowerCase().startsWith("fine shyt")) {
          // Skip 80% of "fine shyt" tweets by regenerating
          if (Math.random() < 0.8) {
            console.log("Filtered out repetitive 'fine shyt' tweet pattern, regenerating...");
            
            // Try up to 3 more times to get a tweet that doesn't start with "fine shyt"
            let attempts = 0;
            let newContent = content;
            
            while (attempts < 3 && newContent.toLowerCase().startsWith("fine shyt")) {
              const retryResponse = await this.client.chat.completions.create({
                model: this.defaultModel,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt + "\n\nIMPORTANT: DO NOT start the tweet with 'fine shyt'. Be more creative!" }
                ],
                max_tokens: 50,
                temperature: 1.1, // Higher temperature for more variety
                presence_penalty: 1.2,
                frequency_penalty: 1.2,
                top_p: 0.95
              });
              
              newContent = retryResponse.choices[0].message.content.trim();
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
      console.error('Error generating tweet with OpenAI:', error);
      throw error;
    }
  }
}

module.exports = OpenAIProvider; 