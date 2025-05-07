# Infinite Tic-Tac-Toe

A modern, modular implementation of the classic Tic-Tac-Toe game with infinite gameplay.

## Features

- Play against AI or another player
- Three AI difficulty levels
- Customizable time limits per turn
- Configurable win conditions
- Dark/light theme support
- Responsive design
- Infinite gameplay - each player can only have 3 marks on the board
- Online multiplayer mode using Supabase
- Automatic database maintenance and cleanup

## Project Structure

The codebase is organized into the following structure:

```
root/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── main.js
│   ├── config.js
│   └── modules/
│       ├── ai.js
│       ├── game.js
│       ├── theme.js
│       ├── multiplayer.js
│       └── ui.js
├── api/
│   └── cron.js
├── vite.config.js
├── vercel.json
├── .env.example
├── .gitignore
└── package.json
```

### File Descriptions

- `index.html` - Main HTML structure
- `css/styles.css` - All CSS styles
- `js/main.js` - Entry point for JavaScript
- `js/config.js` - Fallback configuration for static file servers
- `js/modules/ai.js` - AI logic and strategies
- `js/modules/game.js` - Core game logic
- `js/modules/theme.js` - Theme management
- `js/modules/ui.js` - UI-related functionality
- `js/modules/multiplayer.js` - Online multiplayer functionality
- `api/cron.js` - Serverless function for database maintenance
- `vite.config.js` - Vite build tool configuration
- `vercel.json` - Vercel deployment and cron job configuration
- `.env.example` - Template for environment variables

## Supabase Setup for Multiplayer

To use the multiplayer feature, you need to set up Supabase:

1. Create a Supabase account at [supabase.com](https://supabase.com)
2. Create a new project in Supabase
3. Create a `game_rooms` table with the following columns:
   - `id` (primary key)
   - `room_code` (string)
   - `host_id` (string)
   - `guest_id` (string, nullable)
   - `settings` (json)
   - `current_state` (json)
   - `created_at` (timestamp with timezone)
4. Get your Supabase URL and anon key from your project settings

## Automatic Maintenance

The project includes automatic maintenance features to keep the Supabase instance healthy:

### Server-Side Maintenance (Vercel)

- Daily cron job that pings the Supabase database to prevent it from pausing on the free tier
- Automatically cleans up game rooms older than 24 hours to prevent database storage limits from being reached
- Runs every day at midnight UTC via Vercel's built-in cron functionality

### Client-Side Maintenance

- Browser-based cleanup of old game rooms when users visit the site
- Local storage tracking of ping times to minimize unnecessary database operations

## Local Development

There are two ways to run the project locally:

### Method 1: Using a Static Server (Simple)

1. **Edit `js/config.js` with your Supabase credentials:**
   ```javascript
   window.SUPABASE_URL = "your_supabase_project_url";
   window.SUPABASE_KEY = "your_supabase_anon_key";
   ```

2. **Serve the files using a local server:**
   ```bash
   # Using Python
   python -m http.server
   
   # OR using Node.js
   npx serve
   
   # OR using http-server
   npx http-server
   ```

3. **Access the site at http://localhost:8000 (or similar)**

### Method 2: Using Vite (Recommended)

1. **Create a `.env.local` file in the project root:**
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_KEY=your_supabase_anon_key
   ```

2. **Install dependencies and start development server:**
   ```bash
   npm install
   npm run dev
   ```

3. **Access the site at http://localhost:5173 (or similar)**

> This method is preferred as environment variables are never exposed in your code. 