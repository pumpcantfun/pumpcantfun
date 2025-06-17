#!/bin/bash

# GitHub Repository Setup Script for PumpCantFun Bot
# This script helps you initialize and push your project to GitHub

echo "🚀 PumpCantFun GitHub Setup Script"
echo "=================================="

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install git first."
    exit 1
fi

# Check if we're in the project directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo "❌ Please run this script from the pumpcantfun project root directory"
    exit 1
fi

# Initialize git if not already initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    echo "✅ Git repository initialized"
else
    echo "✅ Git repository already initialized"
fi

# Add all files
echo "📝 Adding files to git..."
git add -A

# Create initial commit
echo "💾 Creating initial commit..."
git commit -m "Initial commit: PumpCantFun bot - parody Twitter bot for pump.fun's suspended account

Features:
- Ultra-short sarcastic tweets (50-80 chars)
- Mention detection and responses
- Subtle $CANT token integration
- Built on Puppet Engine framework
- Twitter API v2 with Basic Plan support
- OpenAI GPT-4 integration
- PM2 deployment ready

🤖 Generated with Claude Code"

echo ""
echo "✅ Local repository is ready!"
echo ""
echo "📌 Next steps:"
echo "1. Create a new repository on GitHub:"
echo "   - Go to https://github.com/new"
echo "   - Name it 'pumpcantfun'"
echo "   - Don't initialize with README, .gitignore, or license"
echo ""
echo "2. After creating the empty repository, run these commands:"
echo ""
echo "   git remote add origin https://github.com/YOUR_USERNAME/pumpcantfun.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "3. Optional: Set up GitHub Actions for automated deployment"
echo ""
echo "📝 Remember to:"
echo "   - Keep your .env file private (it's already in .gitignore)"
echo "   - Update YOUR_USERNAME in the commands above"
echo "   - Consider adding topics: twitter-bot, parody, puppet-engine"
echo ""