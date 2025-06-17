/**
 * PumpCantFun Bot - FINAL WORKING VERSION
 * Uses v2 mention timeline with production app credentials
 */

require('dotenv').config();
require('dotenv').config({ path: '.env.production' });
const TwitterMentionHandler = require('./twitter/twitter-mention-handler');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

class PumpCantFunBot {
  constructor() {
    // Use original app credentials (they work!)
    this.twitter = new TwitterMentionHandler({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_KEY_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
    });
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.agentConfig = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../config/agents/pumpcantfun-agent.json'), 'utf8')
    );
    
    this.isDryRun = process.env.DRY_RUN === 'true';
    this.stats = {
      startTime: Date.now(),
      tweetsPosted: 0,
      mentionsProcessed: 0,
      errors: 0
    };
  }

  async start() {
    console.log('🚀 Starting PumpCantFun Bot\n');
    console.log('Mode:', this.isDryRun ? 'DRY RUN' : 'LIVE');
    console.log('Features:');
    console.log('✅ Mention detection (v2 API)');
    console.log('✅ Auto-reply to mentions');
    console.log('✅ Scheduled tweets\n');
    
    // Initialize
    const initialized = await this.twitter.initialize();
    if (!initialized) {
      console.error('Failed to initialize bot');
      return;
    }
    
    // Start mention polling
    await this.twitter.startPolling(
      (mention) => this.handleMention(mention),
      60000 // Check every 60 seconds
    );
    
    // Start scheduled tweets
    this.startScheduledTweets();
    
    // Show dashboard
    this.startDashboard();
    
    console.log('\n✅ Bot is running!');
  }

  async handleMention(mention) {
    try {
      console.log(`\n📨 New mention from @${mention.author_username}:`);
      console.log(`   "${mention.text}"`);
      
      // Check reply probability
      if (Math.random() > 0.9) { // 90% reply rate
        console.log('   🎲 Skipping (probability)');
        return;
      }
      
      // Generate reply
      const reply = await this.generateReply(mention.text);
      console.log(`   💬 Reply: "${reply}"`);
      
      // Send reply
      if (this.isDryRun) {
        console.log('   [DRY RUN - not sending]');
      } else {
        await this.twitter.replyToMention(mention.id, reply);
        console.log('   ✅ Reply sent!');
      }
      
      this.stats.mentionsProcessed++;
      
    } catch (error) {
      console.error('Error handling mention:', error);
      this.stats.errors++;
    }
  }

  async generateReply(mentionText) {
    const promptIndex = Math.floor(Math.random() * this.agentConfig.rotating_system_prompts.length);
    const systemPrompt = this.agentConfig.rotating_system_prompts[promptIndex];
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Reply to: "${mentionText}"` }
      ],
      max_tokens: 60,
      temperature: 0.7
    });
    
    return response.choices[0].message.content.trim();
  }

  async generateTweet() {
    const promptIndex = Math.floor(Math.random() * this.agentConfig.rotating_system_prompts.length);
    const systemPrompt = this.agentConfig.rotating_system_prompts[promptIndex];
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate a tweet about being suspended' }
      ],
      max_tokens: 60,
      temperature: 0.8
    });
    
    return response.choices[0].message.content.trim();
  }

  startScheduledTweets() {
    // Post immediately
    this.postScheduledTweet();
    
    // Then every 12.5 minutes
    this.tweetInterval = setInterval(
      () => this.postScheduledTweet(),
      750000 // 12.5 minutes
    );
  }

  async postScheduledTweet() {
    try {
      console.log('\n📝 Posting scheduled tweet...');
      const tweet = await this.generateTweet();
      console.log(`   Tweet: "${tweet}"`);
      
      if (this.isDryRun) {
        console.log('   [DRY RUN - not posting]');
      } else {
        await this.twitter.postTweet(tweet);
        console.log('   ✅ Posted!');
      }
      
      this.stats.tweetsPosted++;
      
    } catch (error) {
      console.error('Error posting tweet:', error);
      this.stats.errors++;
    }
  }

  startDashboard() {
    // Update every 30 seconds
    this.dashboardInterval = setInterval(() => {
      this.showDashboard();
    }, 30000);
    
    // Show immediately
    this.showDashboard();
  }

  showDashboard() {
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000 / 60);
    
    console.log('\n📊 Dashboard Update');
    console.log('═══════════════════════════════════════');
    console.log(`⏱️  Uptime: ${uptime} minutes`);
    console.log(`📤 Tweets posted: ${this.stats.tweetsPosted}`);
    console.log(`💬 Mentions processed: ${this.stats.mentionsProcessed}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    console.log('═══════════════════════════════════════');
  }

  stop() {
    console.log('\n🛑 Stopping bot...');
    this.twitter.stopPolling();
    clearInterval(this.tweetInterval);
    clearInterval(this.dashboardInterval);
    this.showDashboard();
    console.log('\nBot stopped.');
  }
}

// Handle graceful shutdown
const bot = new PumpCantFunBot();

process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT...');
  bot.stop();
  process.exit(0);
});

// Start the bot
bot.start().catch(console.error);