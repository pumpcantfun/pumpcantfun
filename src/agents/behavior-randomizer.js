/**
 * Adds natural randomness to agent behaviors
 * Makes timing and interaction patterns less predictable while maintaining consistent activity
 */

/**
 * Generate natural time intervals with randomness
 * @param {Object} agent - Agent object with behavior settings
 * @returns {number} - Time in milliseconds for next post
 */
function getNextPostInterval(agent) {
  // Access the agent's postFrequency property using camelCase keys
  const { minHoursBetweenPosts, maxHoursBetweenPosts, peakPostingHours } = 
    agent.behavior.postFrequency;
  
  // Convert hours to milliseconds
  const minMs = minHoursBetweenPosts * 60 * 60 * 1000;
  const maxMs = maxHoursBetweenPosts * 60 * 60 * 1000;
  
  // Base interval with randomness but ensure it's within bounds
  let interval = minMs + Math.random() * (maxMs - minMs);
  
  // Get current hour
  const currentHour = new Date().getHours();
  
  // Adjust timing based on peak hours - post more frequently during peak times
  const isPeakHour = peakPostingHours.includes(currentHour);
  if (isPeakHour) {
    // Reduce interval by 10-30% during peak hours
    interval = interval * (0.7 + Math.random() * 0.2);
  } else {
    // Increase interval by 10-30% during off-peak hours (but not too much)
    interval = interval * (1.1 + Math.random() * 0.2);
  }
  
  // Sometimes add a small extra delay (0-5 minutes) to seem more natural
  // But only 50% of the time
  if (Math.random() > 0.5) {
    interval += Math.random() * 5 * 60 * 1000; 
  }
  
  // Ensure interval is never larger than the max time set in config
  interval = Math.min(interval, maxMs);
  
  return Math.floor(interval);
}

/**
 * Randomize interaction probabilities slightly to avoid predictable patterns
 * @param {Object} interactionPatterns - Agent's base interaction probabilities
 * @returns {Object} - Modified interaction probabilities
 */
function randomizeInteractionPatterns(interactionPatterns) {
  const randomized = { ...interactionPatterns };
  
  // Add/subtract up to 0.1 from each probability
  Object.keys(randomized).forEach(key => {
    const variation = (Math.random() * 0.2) - 0.1;
    randomized[key] = Math.max(0, Math.min(1, randomized[key] + variation));
  });
  
  return randomized;
}

/**
 * Randomize content preferences slightly
 * @param {Object} contentPreferences - Agent's content preferences
 * @returns {Object} - Modified content preferences
 */
function randomizeContentPreferences(contentPreferences) {
  const randomized = { ...contentPreferences };
  
  // Randomly adjust thread length (+/- 1)
  if (randomized.maxThreadLength && Math.random() > 0.6) {
    const variation = Math.random() > 0.5 ? 1 : -1;
    randomized.maxThreadLength = Math.max(1, randomized.maxThreadLength + variation);
  }
  
  // Randomly adjust typical post length (+/- 20%)
  if (randomized.typicalPostLength) {
    const variationPercent = (Math.random() * 0.4) - 0.2; // -20% to +20%
    randomized.typicalPostLength = Math.max(20, 
      Math.min(280, Math.floor(randomized.typicalPostLength * (1 + variationPercent))));
  }
  
  return randomized;
}

module.exports = {
  getNextPostInterval,
  randomizeInteractionPatterns,
  randomizeContentPreferences
}; 