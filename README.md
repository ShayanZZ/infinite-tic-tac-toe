# Infinite Tic-Tac-Toe

A modern, strategic, infinite variation of the classic Tic-Tac-Toe game. Built with Vanilla JS frontend, Supabase backend integration, and DevOps setup including Docker and Kubernetes with monitoring.

## 🚀 Features

-   **Infinite Gameplay**: The game introduces a strategic twist — each player can only have **3 marks** on the board at a time. When you place a 4th mark, your oldest mark disappears! This prevents draws and keeps the game dynamic.
-   **Real-time Multiplayer**: Play against friends in real-time. Game state is synchronized instantly using **Supabase** real-time subscriptions.
-   **Smart AI**: Challenge yourself against an AI opponent with adjustable difficulty levels.
-   **Modern UI/UX**: A sleek, responsive interface built with Vanilla JavaScript and CSS3, featuring smooth animations and theme support.
-   **Full Observability**: Comprehensive monitoring stack included (Prometheus, Grafana, Node Exporter, Blackbox Exporter)
-   **Containerized & Orchestrated**: Fully Dockerized application with Kubernetes manifests for scalable deployment.

## 🛠 Tech Stack

### Frontend
-   **Core**: HTML5, CSS3, Vanilla JavaScript (ES6+)
-   **Build Tool**: [Vite](https://vitejs.dev/)
-   **State Management**: Custom module-based architecture

### Backend & Infrastructure
-   **Database & Real-time**: [Supabase](https://supabase.com/)
-   **Containerization**: [Docker](https://www.docker.com/)
-   **Orchestration**: [Kubernetes](https://kubernetes.io/)
-   **Reverse Proxy**: [Traefik](https://traefik.io/)

### Monitoring
-   **Metrics Collection**: [Prometheus](https://prometheus.io/)
-   **Visualization**: [Grafana](https://grafana.com/)
-   **Exporters**: Node Exporter, Blackbox Exporter

## 📋 Prerequisites

-   **Node.js** (v18+ recommended)
-   **npm** (v9+)
-   **Docker** & **Docker Compose**
-   **Kubernetes CLI (kubectl)** (optional)

## 🗄️ Supabase Setup for Multiplayer

To use the multiplayer feature, you need to set up Supabase:

1.  **Create Account**: Create a Supabase account at [supabase.com](https://supabase.com).
2.  **New Project**: Create a new project in Supabase.
3.  **Database Setup**: Create a `game_rooms` table with the following columns:
    -   `id` (primary key)
    -   `room_code` (string)
    -   `host_id` (string)
    -   `guest_id` (string, nullable)
    -   `settings` (json)
    -   `current_state` (json)
    -   `created_at` (timestamp with timezone)
4.  **Credentials**: Get your Supabase URL and anon key from your project settings.

## 🔧 Local Development

There are two ways to run the project locally:

### Method 1: Using a Static Server (Simple)

1.  Edit `app/src/js/config.js` with your Supabase credentials:
    ```javascript
    window.SUPABASE_URL = "your_supabase_project_url";
    window.SUPABASE_KEY = "your_supabase_anon_key";
    ```
2.  Serve the files using a local server:
    ```bash
    # Using Python
    python -m http.server

    # OR using Node.js
    npx serve

    # OR using http-server
    npx http-server
    ```
3.  Access the site at `http://localhost:8000`

### Method 2: Using Vite (Recommended)

1.  Create a `.env` file in the project root:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_KEY=your_supabase_anon_key
    ```
2.  Install dependencies and start development server:
    ```bash
    cd app
    npm install
    npm run dev
    ```
3.  Access the site at `http://localhost:5173`.

> **Note**: This method is preferred as environment variables are never exposed in your code.

## 🐳 Running with Docker

### Application Stack
Run the game and Traefik reverse proxy:
```bash
cd docker
docker-compose up -d --build
```
-   **Game**: `http://localhost:8080`
-   **Traefik Dashboard**: `http://localhost:8081`

### Monitoring Stack
Run the full monitoring suite:
```bash
cd docker
docker-compose -f docker-compose.prometheus-grafana.yml up -d
```
-   **Grafana**: `http://localhost:3000` (Default login: `admin` / `admin`)
-   **Prometheus**: `http://localhost:9090`

## ☸️ Deploying to Kubernetes

Deploy the application and monitoring resources to a Kubernetes cluster:

```bash
cd k8s
# Apply core resources
kubectl apply -f namespace.yaml
kubectl apply -f secret.yml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml

# Apply monitoring resources
kubectl apply -f monitoring/
```

## 📂 Project Structure

```
├── app/                        # Frontend Application
│   ├── src/
│   │   ├── js/
│   │   │   ├── modules/        # Game Logic Modules
│   │   │   │   ├── game.js     # Core game rules & state
│   │   │   │   ├── ai.js       # AI opponent logic
│   │   │   │   ├── multiplayer.js # Supabase integration
│   │   │   │   ├── ui.js       # DOM manipulation
│   │   │   │   └── theme.js    # Theme management
│   │   │   └── main.js         # Entry point
│   │   └── css/                # Styles
│   ├── public/                 # Static assets
│   └── vite.config.js          # Build configuration
├── docker/                     # Docker Configuration
│   ├── monitoring/             # Prometheus & Grafana configs
│   ├── docker-compose.yml      # App stack
│   └── docker-compose.prometheus-grafana.yml # Monitoring stack
├── k8s/                        # Kubernetes Manifests
│   ├── monitoring/             # K8s monitoring resources
│   ├── deployment.yaml         # App deployment
│   └── ingress.yaml            # Ingress configuration
└── README.md                   # Project Documentation
```

## 📄 License

[MIT](LICENSE)