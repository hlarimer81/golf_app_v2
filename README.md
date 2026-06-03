# 4Play - Golf Scoring App

A real-time golf scoring application built with React, Vite, and Supabase. Support for multiple game types, live leaderboards, and handicap calculations.

## Features

- **Live Real-time Scoring:** All players in a group can see scores update instantly as they are entered on the course.
- **Multiple Game Formats:**
  - 🏆 **Stableford (Quota):** Points-based scoring where players earn points per hole based on net score.
  - ⚔️ **4-Ball Round Robin:** Team-based match play where the best ball per team counts on each hole.
  - 🎰 **Skins:** Individual competition where the lowest score wins the hole (optional carryover).
  - 👑 **Chairman:** King of the hill format. Win a hole outright to become Chairman and earn points.
- **Course Database:** Built-in course data with pars and handicap differentials for accurate net scoring.
- **Handicap Integration:** Optional net scoring using player handicaps.
- **Match Management:** Create new rounds and share a 6-character join code with your group.

## Tech Stack

- **Frontend:** React, Vite
- **Styling:** CSS (Inline styles)
- **Backend/Database:** Supabase (PostgreSQL)
- **Realtime:** Supabase Realtime Channels

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- A Supabase account

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd my-golf-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase**
   - Create a new Supabase project.
   - Run the SQL script found in `demo-data.sql` in your Supabase SQL Editor to set up the necessary tables (`matches`, `teams`, `players`, `scores`).
   - Copy `.env.example` to `.env` and fill in your Supabase project details:
     ```
     VITE_SUPABASE_URL=your_supabase_project_url
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

## Database Schema

The app uses four main tables in Supabase:

- `matches`: Stores the round details (code, course, game type, etc.)
- `teams`: Stores team assignments for team-based games like 4-Ball
- `players`: Stores player information (name, handicap, team)
- `scores`: Stores individual stroke counts per player, per hole

## How to Use

1. **Host a Game:** 
   - Open the app and click "Start Round".
   - Select your game type, course, and configure optional settings (handicaps, quota, carryovers).
   - Enter the player names and handicaps.
   - Share the generated 6-character code with your friends.

2. **Join a Game:**
   - Click "Join Round" on the home screen.
   - Enter the 6-character code provided by the host.

3. **Scoring:**
   - Tap the score box for a player on a specific hole.
   - The app will automatically calculate net scores, points, skins, or chairman status based on the selected game mode.
   - The leaderboard at the top of the screen will update in real-time.

4. **Finishing a Round:**
   - Click the "Finish Round" button pinned at the bottom of the screen to view the final summary.
