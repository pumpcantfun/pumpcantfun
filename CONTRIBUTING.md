# Contributing to PumpCantFun

Thank you for your interest in contributing to PumpCantFun! This document provides guidelines for contributing to the project.

## Code of Conduct

- Be respectful and constructive
- Keep the parody nature fun but not harmful
- Follow Twitter's Terms of Service

## How to Contribute

### Reporting Issues

1. Check existing issues first
2. Use clear, descriptive titles
3. Include steps to reproduce bugs
4. Mention your environment (Node version, OS)

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly:
   ```bash
   npm run test:tweets
   npm run test:mentions
   ```
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request

### Development Setup

1. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/pumpcantfun.git
   cd pumpcantfun
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment:
   ```bash
   cp .env.example .env
   # Add your test credentials
   ```

4. Run in dry mode:
   ```bash
   DRY_RUN=true npm start
   ```

## Code Style

- Use 2 spaces for indentation
- Follow existing patterns in the codebase
- Keep tweets under 80 characters
- No emojis in bot responses
- Maintain the bitter, sarcastic personality

## Character Guidelines

When modifying the bot's personality:
- Keep responses short and bitter
- No promotional content
- $CANT mentions only when asked
- Maintain suspension narrative

## Testing

Before submitting:
- Test tweet generation
- Test mention responses
- Verify character consistency
- Check rate limit handling

## Questions?

Open an issue for discussion or clarification.