/**
 * Helper utilities for tweet generation
 * Designed to provide minimal additions since we now use comprehensive system prompts
 */

/**
 * Helper functions to increase tweet variety
 */

/**
 * Enhance a tweet instruction with random variations to increase diversity in outputs
 */
function enhanceTweetInstruction(instruction) {
  const variations = [
    "Share a random thought that just came to you.",
    "What's something you've been thinking about today?",
    "Express a strong opinion on something happening right now.",
    "Share an observation about modern life.",
    "What's a hot take you want to share?",
    "Share a thought that feels authentic to your personality.",
    "What's something you'd casually mention to a friend?",
    "Say something that captures your unique voice.",
    "What's on your mind right now? Just spit it out.",
    "Share an unprompted thought in your natural voice."
  ];
  
  // Randomly select a variation 70% of the time
  if (Math.random() < 0.7) {
    const randomIndex = Math.floor(Math.random() * variations.length);
    return variations[randomIndex];
  }
  
  // Otherwise use the original instruction
  return instruction;
}

/**
 * Enhance a reply instruction with random variations
 */
function enhanceReplyInstruction(instruction, replyContext) {
  const variations = [
    "How would you naturally respond to this?",
    "Reply as if you're texting a friend.",
    "What's your authentic, off-the-cuff response?",
    "Reply in your natural voice.",
    "What would be your immediate reaction to this?",
    "Respond in your typical style.",
    "What's your take on this? Reply naturally.",
    "How would you actually respond to this in real life?",
    "Just respond the way you normally would.",
    "What would you actually say to this?"
  ];
  
  // Randomly select a variation 60% of the time
  if (Math.random() < 0.6) {
    const randomIndex = Math.floor(Math.random() * variations.length);
    
    // Combine the tweet context with the variation
    if (replyContext && replyContext.content) {
      return `Someone tweeted at you: "${replyContext.content}"\n\n${variations[randomIndex]}`;
    }
    return variations[randomIndex];
  }
  
  // Otherwise use the original instruction
  return instruction;
}

/**
 * Log information about which prompt was used for an agent
 * @param {Object} agent - The agent 
 * @param {number} promptIndex - The index of the selected prompt
 * @param {string} context - Additional context (e.g., 'reply', 'tweet')
 */
function logPromptSelection(agent, promptIndex, context = 'tweet') {
  if (!agent || promptIndex === undefined) return;
  
  const promptCount = agent.rotatingSystemPrompts ? agent.rotatingSystemPrompts.length : 0;
  const agentName = agent.name || agent.id || 'Unknown agent';
  
  if (promptCount > 0) {
    console.log(`Using prompt ${promptIndex + 1}/${promptCount} for ${agentName} ${context}`);
  } else if (agent.customSystemPrompt) {
    console.log(`Using custom system prompt for ${agentName} ${context}`);
  } else {
    console.log(`Using default generated prompt for ${agentName} ${context}`);
  }
}

module.exports = {
  enhanceTweetInstruction,
  enhanceReplyInstruction,
  logPromptSelection
}; 