# 🚀 PumpCantFun Bot - Production Deployment Guide

## ⚠️ IMPORTANT: BEFORE STARTING THE BOT

### 1. Environment Variables Check

Check your `.env` file:

```bash
# Check contents
cat .env
```

Ensure these are filled:
- `TWITTER_API_KEY`
- `TWITTER_API_KEY_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_TOKEN_SECRET`
- `OPENAI_API_KEY`
- `DRY_RUN=false` ← IMPORTANT: Must be false for production!

### 2. Final Test with Dry Run

```bash
# Test with DRY_RUN=true
DRY_RUN=true npm start
```

This command:
- ✅ Shows tweets but doesn't send them
- ✅ Checks mentions but doesn't reply
- ✅ Verifies all systems are working

## 🎯 STARTING IN PRODUCTION

### Method 1: Simple Start (For Testing)

```bash
# Set DRY_RUN=false in .env, then:
npm start
```

⚠️ Bot stops when terminal closes!

### Method 2: PM2 Deployment (RECOMMENDED)

```bash
# PM2 is already installed (v6.0.8)

# Start the bot
pm2 start src/index.js --name pumpcantfun

# Watch logs
pm2 logs pumpcantfun

# Check status
pm2 status

# Auto-start on system reboot
pm2 save
pm2 startup
```

### Method 3: Screen/Tmux Deployment

```bash
# Start screen session
screen -S pumpcantfun

# Run the bot
npm start

# Detach from screen (bot keeps running)
# Press Ctrl+A then D

# Reattach to screen
screen -r pumpcantfun
```

## 📊 WHILE BOT IS RUNNING

You'll see when bot starts:
```
🚀 PumpCantFun Bot Starting...
✅ Twitter client initialized
✅ Mention handler initialized for @pumpcantfun
🔄 Next tweet in 12.5 minutes
🔍 Checking mentions every 60 seconds...

┌─────────────────────────────────────┐
│   PumpCantFun Bot Dashboard         │
├─────────────────────────────────────┤
│ Status: 🟢 Active                   │
│ Uptime: 0h 0m 10s                  │
│ Tweets Posted: 0                    │
│ Mentions Processed: 0               │
│ Errors: 0                           │
└─────────────────────────────────────┘
```

## 🛑 STOPPING THE BOT

**If using PM2:**
```bash
pm2 stop pumpcantfun
```

**If running normally:**
- Press Ctrl+C

## 🔍 LOG MONITORING

```bash
# PM2 logs
pm2 logs pumpcantfun

# Or log file
tail -f pumpcantfun.log
```

## ⚡ IMPORTANT NOTES

1. **First Tweet:** Bot posts first tweet 12.5 minutes after starting
2. **Mention Checks:** Checks every 60 seconds
3. **Duplicate Mentions:** Never replies to same mention twice ✅
4. **Rate Limits:** Within safe limits, no 403 errors
5. **Memory:** Remembers all conversations

## 🚨 TROUBLESHOOTING

**Bot not tweeting:**
- Check `DRY_RUN=false`
- Are Twitter credentials correct?

**Not seeing mentions:**
- Are you using original app credentials?
- Not production app!

**403 Rate Limit error:**
- Impossible, limits are safe
- Another bot running on same account?

## 📈 PERFORMANCE TRACKING

Dashboard shows:
- Tweet count
- Mentions processed
- Error count
- Uptime

## 🔄 UPDATING CONTRACT ADDRESS (CA)

**When launching token:**
1. Edit `config/agents/pumpcantfun-agent.json`
2. Replace all `CA: XXXXXXX` with real address
3. Save file - bot auto-reloads config
4. **No need to restart bot!**

---

**READY TO GO? 🚀**

To go production:
1. Set `DRY_RUN=false` in `.env`
2. Run `pm2 start src/index.js --name pumpcantfun`
3. Watch and enjoy!