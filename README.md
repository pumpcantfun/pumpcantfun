# 🚫 PumpCantFun Bot

A parody Twitter bot for pump.fun's suspended account - bitter, sarcastic, and forever banned. Built with the Puppet Engine framework.

> "suspended for being too fun. classic."

## 🎭 Character

PumpCantFun (@pumpcantfun) is the suspended ghost of pump.fun, eternally bitter about being banned from Twitter. The bot:
- Posts ultra-short, sarcastic tweets (50-80 chars)
- Responds to mentions with dark humor
- Occasionally mentions its $CANT token (only when asked)
- Never uses emojis or hashtags
- Maintains a consistently bitter personality

## ✨ Features

- **Automated Posting**: Tweets every 10-15 minutes
- **Mention Detection**: Monitors and responds to @mentions
- **Character Consistency**: 3 rotating system prompts for variety
- **Token Integration**: Subtle $CANT token mentions
- **Rate Limiting**: Respects Twitter API limits
- **Memory System**: Tracks conversations and interactions

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Twitter Developer Account (Basic Plan $200/month)
- OpenAI API Key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/pumpcantfun.git
cd pumpcantfun
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Add your credentials to `.env`:
```env
TWITTER_API_KEY=your_key
TWITTER_API_KEY_SECRET=your_secret
TWITTER_ACCESS_TOKEN=your_token
TWITTER_ACCESS_TOKEN_SECRET=your_token_secret
OPENAI_API_KEY=your_openai_key
DRY_RUN=true  # Set to false when ready
```

### Running the Bot

**Development mode (dry run):**
```bash
npm start
```

**Production mode:**
```bash
# Set DRY_RUN=false in .env
npm start
```

**With PM2 (recommended):**
```bash
pm2 start src/index.js --name pumpcantfun
pm2 save
pm2 startup
```

## 📁 Project Structure

```
pumpcantfun/
├── src/
│   ├── index.js           # Main bot entry point
│   ├── twitter/           # Twitter integration
│   ├── memory/            # Memory management
│   ├── llm/               # LLM providers
│   └── utils/             # Utilities
├── config/
│   └── agents/
│       └── pumpcantfun-agent.json  # Character config
├── .env.example          # Environment template
├── package.json
└── README.md
```

## 🔧 Configuration

### Character Customization

Edit `config/agents/pumpcantfun-agent.json` to modify:
- Personality traits
- System prompts
- Tweet frequency
- Reply probability

### API Rate Limits

Twitter Basic Plan ($200/month):
- 15,000 posts/month
- 50,000 user requests/month
- Mention timeline access via v2 API

The bot automatically manages rate limits.

## 🛠️ Commands

```bash
npm start              # Start the bot
npm run test:tweets    # Test tweet generation
npm run test:mentions  # Test mention responses
npm run pm2:start      # Start with PM2
npm run pm2:logs       # View PM2 logs
```

## 📊 Monitoring

The bot displays a real-time dashboard showing:
- Uptime
- Tweets posted
- Mentions processed
- Error count

Logs are written to `pumpcantfun.log`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## 📄 License

MIT License

## 🙏 Credits

Built on the [Puppet Engine](https://github.com/puppetengine/puppet-engine) framework.

## ⚠️ Disclaimer

This is a parody bot. Not affiliated with the real pump.fun platform.

---

**$CANT Token**: Only mentioned when directly asked. CA: 7Ead7EPnK6FyyT3JbQp8PxrkHomDHtUJn7qX6nfXpump