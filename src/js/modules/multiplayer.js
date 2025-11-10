/**
 * Multiplayer module for Infinite Tic-Tac-Toe using Supabase
 */
export default class Multiplayer {
    constructor(game) {
        this.game = game;
        this.supabase = null;
        this.roomCode = null;
        this.playerId = null;
        this.isHost = false;
        this.gameSubscription = null;
        this.opponentId = null;
        this.lastUpdateTimestamp = 0;
        this.processingUpdate = false;
        this.lastStateRefresh = Date.now();
        this.lastMoveTime = Date.now();
        this.lastMovesCount = 0;
        this.playAgainChoices = { host: false, guest: false }; // Track play again choices
        this.stateReconciliationInterval = null;
        this.opponentWantsPlayAgain = false; // Flag to track if opponent wants to play again before overlay appears
        this.playAgainDeadlockTimer = null; // Timer to detect and resolve Play Again deadlocks
        this.animatedMoves = new Set(); // Track which moves have been animated to prevent re-animation
        this.roundStarter = 'X'; // Track who should start the next round (alternates)
        
        // Initialize Supabase client
        this.initSupabase();
    }

    /**
     * Initialize the Supabase client
     */
    async initSupabase() {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        
        // Check multiple sources for Supabase credentials
        let supabaseUrl;
        let supabaseKey;
        
        // First check if we're in a Vite environment
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
        }
        
        // If not found, try window globals as fallback
        if (!supabaseUrl || !supabaseKey) {
            if (window.SUPABASE_URL && window.SUPABASE_URL !== "your_supabase_url" && 
                window.SUPABASE_KEY && window.SUPABASE_KEY !== "your_supabase_anon_key") {
                supabaseUrl = window.SUPABASE_URL;
                supabaseKey = window.SUPABASE_KEY;
            }
        }
        
        // Validate credentials
        if (!supabaseUrl || !supabaseKey || 
            supabaseUrl === "your_supabase_url" || 
            supabaseKey === "your_supabase_anon_key") {
            console.error('Supabase configuration error: Missing or invalid credentials');
            // Disable multiplayer features
            setTimeout(() => {
                const multiplayerButton = document.querySelector('[data-mode="multiplayer"]');
                if (multiplayerButton) {
                    multiplayerButton.disabled = true;
                    multiplayerButton.title = "Multiplayer unavailable - Configuration missing";
                    multiplayerButton.style.opacity = "0.5";
                    multiplayerButton.style.cursor = "not-allowed";
                }
                
                const multiplayerOptionsRow = document.getElementById('multiplayerOptionsRow');
                if (multiplayerOptionsRow) {
                    multiplayerOptionsRow.style.display = 'none';
                }
            }, 500);
            return;
        }
        
        this.supabase = createClient(supabaseUrl, supabaseKey);
        
        // Generate a unique player ID if one doesn't exist
        this.playerId = localStorage.getItem('playerId');
        if (!this.playerId) {
            this.playerId = crypto.randomUUID();
            localStorage.setItem('playerId', this.playerId);
        }
        
        // Check URL parameters for direct reconnection (new approach)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('reconnect') === 'true') {
            const roomCode = urlParams.get('roomCode');
            const isHost = urlParams.get('isHost') === 'true';
            
            if (roomCode) {
                console.log('Detected reconnection via URL parameters to room:', roomCode);
                this.game.gameMode = 'multiplayer';
                
                // Set game mode to multiplayer
                setTimeout(async () => {
                    try {
                        if (isHost) {
                            console.log('Reconnecting as host to room:', roomCode);
                            
                            // Fetch room data to ensure it exists
                            const { data } = await this.supabase
                                .from('game_rooms')
                                .select()
                                .eq('room_code', roomCode)
                                .single();
                                
                            if (!data) {
                                console.error('Room not found during reconnection');
                                return;
                            }
                            
                            this.roomCode = roomCode;
                            this.isHost = true;
                            this.subscribeToGameUpdates();
                            
                            // Start a completely new game 
                            this.game.playerMoves = { X: [], O: [] };
                            this.game.currentPlayer = 'X';
                            this.game.gameActive = true;
                            this.game.winningCombination = null;
                            this.game.scores = { 'X': 0, 'O': 0 };
                            
                            // Reset UI
                            this.game.ui.initBoard();
                            this.game.ui.renderScores();
                            this.game.ui.updateStatus();
                            
                            // Force a state update to reset the game for both players
                            await this.updateGameState(null, false, null, false, true);
                        } else {
                            console.log('Reconnecting as guest to room:', roomCode);
                            // Join as guest with reconnect flag to force reset
                            await this.joinRoom(roomCode, true);
                        }
                    } catch (error) {
                        console.error('Error during reconnection:', error);
                    }
                }, 300);
            }
        }
        
        // Check if we're reconnecting after a reset via localStorage (keeping for compatibility)
        else if (localStorage.getItem('shouldResetGame') === 'true') {
            const roomCode = localStorage.getItem('resetRoomCode');
            const isHost = localStorage.getItem('resetIsHost') === 'true';
            
            if (roomCode) {
                console.log('Detected post-reload reset state via localStorage, will reconnect to room:', roomCode);
                
                // Set game mode from localStorage
                if (localStorage.getItem('resetGameMode') === 'multiplayer') {
                    this.game.gameMode = 'multiplayer';
                }
                
                // Set game settings from localStorage
                if (localStorage.getItem('resetScoreLimit')) {
                    this.game.scoreLimit = parseInt(localStorage.getItem('resetScoreLimit')) || 0;
                }
                if (localStorage.getItem('resetTurnTimeLimit')) {
                    this.game.turnTimeLimit = parseInt(localStorage.getItem('resetTurnTimeLimit')) || 0;
                }
                if (localStorage.getItem('resetHighlightRemoval')) {
                    this.game.highlightRemoval = localStorage.getItem('resetHighlightRemoval') === 'true';
                }
                
                // Add a small delay to allow the game to initialize first
                setTimeout(async () => {
                    try {
                        // Make sure we're showing the game UI not the setup UI
                        if (this.game.ui.setupDiv.style.display === 'flex' || this.game.ui.setupDiv.style.display === '') {
                            this.game.ui.setupDiv.style.display = 'none';
                            this.game.ui.mainContainer.style.display = 'flex';
                        }
                        
                        if (isHost) {
                            // Fetch current room data to see if it exists
                            const { data } = await this.supabase
                                .from('game_rooms')
                                .select()
                                .eq('room_code', roomCode)
                                .single();
                                
                            if (!data) {
                                console.error('Room not found during reconnection, creating new room');
                                
                                // If room doesn't exist anymore, create a new one with the same code
                                this.roomCode = roomCode;
                                this.isHost = true;
                                
                                // Reset the game state entirely
                                this.game.playerMoves = { X: [], O: [] };
                                this.game.currentPlayer = 'X';
                                this.game.gameActive = true;
                                this.game.winningCombination = null;
                                this.game.scores = { 'X': 0, 'O': 0 };
                                
                                // Clean up localStorage
                                this.clearResetLocalStorage();
                                
                                // Reset the UI
                                this.game.ui.initBoard();
                                this.game.ui.renderScores();
                                this.game.ui.updateStatus();
                                
                                // Make sure we've switched to the game view, not setup view
                                this.game.ui.setupDiv.style.display = 'none';
                                this.game.ui.mainContainer.style.display = 'flex';
                                
                                // Force a state update to ensure both players are in sync
                                this.updateGameState(null);
                            }
                        } else {
                            // As guest, simply rejoin the room
                            await this.joinRoom(roomCode);
                            
                            // Make sure we've switched to the game view, not setup view
                            this.game.ui.setupDiv.style.display = 'none';
                            this.game.ui.mainContainer.style.display = 'flex';
                            
                            // Make sure the game board is initialized properly
                            this.game.ui.startGame();
                            
                            // Clean up localStorage
                            this.clearResetLocalStorage();
                        }
                    } catch (error) {
                        console.error('Error during reconnection:', error);
                    }
                }, 300);
            }
        }
        
        // Run database maintenance on app startup
        this.cleanupOldRooms();
        
        // Set up a ping to keep the database active
        this.setupKeepAlivePing();
    }
    
    /**
     * Clean up old game rooms to save database space
     * @param {number} maxAgeHours - Maximum age of rooms to keep in hours (default: 24)
     */
    async cleanupOldRooms(maxAgeHours = 24) {
        if (!this.supabase) return;
        
        try {
            console.log('Running database maintenance - cleaning up old rooms');
            
            // Calculate the cutoff timestamp (current time - maxAgeHours)
            const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
            
            // First get count of old rooms (for logging purposes)
            const { count } = await this.supabase
                .from('game_rooms')
                .select('*', { count: 'exact', head: true })
                .lt('updated_at', new Date(cutoffTime).toISOString());
            
            console.log(`Found ${count} old game rooms to clean up`);
            
            // Delete old rooms
            if (count > 0) {
                const { error } = await this.supabase
                    .from('game_rooms')
                    .delete()
                    .lt('updated_at', new Date(cutoffTime).toISOString());
                
                if (error) {
                    console.error('Error cleaning up old rooms:', error);
                } else {
                    console.log(`Successfully cleaned up ${count} old game rooms`);
                }
            }
        } catch (error) {
            console.error('Error during database maintenance:', error);
        }
    }
    
    /**
     * Set up a ping mechanism to keep the Supabase instance active
     * Prevents auto-pausing due to 7 days of inactivity
     */
    setupKeepAlivePing() {
        // Store the last ping time in localStorage
        const lastPingTime = localStorage.getItem('lastSupabasePing') 
            ? parseInt(localStorage.getItem('lastSupabasePing'))
            : 0;
        
        const now = Date.now();
        const sixHoursInMillis = 6 * 60 * 60 * 1000;
        
        // If last ping was more than 6 hours ago, ping immediately
        // This ensures we ping at least every 6 hours when someone visits
        if (now - lastPingTime > sixHoursInMillis) {
            console.log('Last ping was more than 6 hours ago, pinging now');
            this.pingSupabase();
        }
        
        // Set up periodic ping every 6 hours to ensure frequent activity
        // This keeps the database active even if cron job fails
        setInterval(() => {
            const lastPing = localStorage.getItem('lastSupabasePing') 
                ? parseInt(localStorage.getItem('lastSupabasePing'))
                : 0;
            const timeSinceLastPing = Date.now() - lastPing;
            
            // Only ping if it's been at least 6 hours since last ping
            if (timeSinceLastPing >= sixHoursInMillis) {
                console.log('Periodic ping triggered (6 hours elapsed)');
                this.pingSupabase();
            }
        }, sixHoursInMillis);
    }
    
    /**
     * Ping Supabase to keep the database active
     */
    async pingSupabase() {
        if (!this.supabase) {
            console.warn('Supabase client not initialized, skipping ping');
            return;
        }
        
        try {
            console.log('Pinging Supabase to keep database active');
            
            // Perform multiple operations to ensure database activity
            // 1. Count query to ensure database is responsive
            const { count, error: countError } = await this.supabase
                .from('game_rooms')
                .select('*', { count: 'exact', head: true });
            
            if (countError) {
                console.error('Error counting rooms in Supabase ping:', countError);
                // Don't update last ping time on error, so we'll retry sooner
                return;
            }
            
            // 2. Perform a select query with ordering to ensure read operations work
            const { data, error } = await this.supabase
                .from('game_rooms')
                .select('room_code, updated_at')
                .order('updated_at', { ascending: false })
                .limit(1);
            
            if (error) {
                console.error('Error in Supabase ping query:', error);
                // Don't update last ping time on error, so we'll retry sooner
                return;
            }
            
            // Update the last ping time only on success
            localStorage.setItem('lastSupabasePing', Date.now().toString());
            console.log(`Supabase ping successful at ${new Date().toISOString()} - Found ${count} rooms`);
        } catch (error) {
            console.error('Error pinging Supabase:', error);
            // Don't update last ping time on error
        }
    }

    /**
     * Create a new game room and generate a code
     * @returns {Promise<string>} The room code
     */
    async createRoom(settings) {
        try {
            // Generate a 4-digit code
            const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
            
            console.log(`Creating room with code: ${roomCode}`);
            
            // Reset game state
            this.game.playerMoves = { X: [], O: [] };
            this.game.currentPlayer = 'X';
            this.game.gameActive = true;
            this.game.winningCombination = null;
            
            // Create room in database
            const { data, error } = await this.supabase
                .from('game_rooms')
                .insert({
                    room_code: roomCode,
                    host_id: this.playerId,
                    settings: {
                        scoreLimit: this.game.scoreLimit,
                        turnTimeLimit: this.game.turnTimeLimit,
                        highlightRemoval: this.game.highlightRemoval
                    },
                    current_state: {
                        player_moves: { X: [], O: [] },
                        current_player: 'X',
                        scores: { X: 0, O: 0 },
                        timestamp: Date.now(),
                        gameActive: true,
                        host_acknowledged: true // Flag to indicate host is ready
                    }
                })
                .select();
                
            if (error) {
                console.error('Error creating room:', error);
                throw error;
            }
            
            console.log('Room created successfully:', data);
            
            this.roomCode = roomCode;
            this.isHost = true;
            
            // Initialize state tracking
            this.initStateTracking();
            
            // Subscribe to room changes
            this.subscribeToGameUpdates();
            
            return roomCode;
        } catch (error) {
            console.error('Error creating room:', error);
            throw error;
        }
    }

    /**
     * Join an existing game room
     * @param {string} roomCode - The room code to join
     * @param {boolean} isReconnect - Whether this is a reconnection after Play Again
     */
    async joinRoom(roomCode, isReconnect = false) {
        try {
            console.log(`Attempting to join room: ${roomCode}${isReconnect ? ' (reconnecting)' : ''}`);
            
            // Check if room exists
            const { data, error } = await this.supabase
                .from('game_rooms')
                .select()
                .eq('room_code', roomCode)
                .single();
                
            if (error) {
                console.error('Error finding room:', error);
                throw error;
            }
            if (!data) {
                console.error('Room not found');
                throw new Error('Room not found');
            }
            
            console.log('Room found:', data);
            
            // Make sure room isn't already full (unless we're the guest reconnecting)
            if (data.guest_id && data.status === 'playing' && data.guest_id !== this.playerId && !isReconnect) {
                throw new Error('Room is already full');
            }
            
            // Create a current state with the guest_acknowledged flag
            const currentState = {
                player_moves: { X: [], O: [] },
                current_player: 'X',
                scores: { X: 0, O: 0 },
                gameActive: true,
                guest_acknowledged: true, // Flag to indicate guest is ready
                timestamp: Date.now()
            };
            
            // If reconnecting after Play Again, also add resetPlayAgainChoices
            if (isReconnect) {
                currentState.playAgainChoices = { host: false, guest: false };
            }
            
            // If reconnecting, force a guest_id update to ensure we're recognized
            const updatePayload = { 
                guest_id: this.playerId,
                status: 'playing',
                current_state: currentState
            };
            
            // Update the room with guest info
            const { error: updateError } = await this.supabase
                .from('game_rooms')
                .update(updatePayload)
                .eq('room_code', roomCode);
                
            if (updateError) {
                console.error('Error joining room:', updateError);
                throw updateError;
            }
            
            console.log('Successfully joined room');
            
            this.roomCode = roomCode;
            this.isHost = false;
            this.opponentId = data.host_id;
            
            // Apply room settings
            if (data.settings) {
                this.game.scoreLimit = data.settings.scoreLimit || 0;
                this.game.turnTimeLimit = data.settings.turnTimeLimit || 0;
                this.game.highlightRemoval = data.settings.highlightRemoval !== false;
            }
            
            // Apply current game state if it exists and we're not reconnecting
            if (data.current_state && !isReconnect) {
                console.log('Applying initial game state:', data.current_state);
                this.game.playerMoves = data.current_state.player_moves || { 'X': [], 'O': [] };
                this.game.currentPlayer = data.current_state.current_player || 'X';
                this.game.scores = data.current_state.scores || { 'X': 0, 'O': 0 };
            } else if (isReconnect) {
                // If reconnecting, reset the game state entirely
                this.game.playerMoves = { X: [], O: [] };
                this.game.currentPlayer = 'X';
                this.game.gameActive = true;
                this.game.winningCombination = null;
                this.game.scores = { 'X': 0, 'O': 0 };
                this.playAgainChoices = { host: false, guest: false };
            }
            
            // Make sure we show the game view, not the setup view
            if (this.game.ui.setupDiv.style.display === 'flex' || this.game.ui.setupDiv.style.display === '') {
                // Switch to game view
                this.game.ui.setupDiv.style.display = 'none';
                this.game.ui.mainContainer.style.display = 'flex';
                
                // Ensure the board is initialized
                this.game.ui.initBoard();
                this.game.ui.renderScores();
                this.game.ui.updateStatus();
            }
            
            // Subscribe to room changes
            this.subscribeToGameUpdates();
            
            return data;
        } catch (error) {
            console.error('Error joining room:', error);
            throw error;
        }
    }

    /**
     * Subscribe to real-time game updates
     */
    subscribeToGameUpdates() {
        if (this.gameSubscription) {
            this.gameSubscription.unsubscribe();
            this.gameSubscription = null;
        }
        
        console.log(`Subscribing to room: ${this.roomCode}`);
        
        // Initialize state tracking for deadlock detection
        this.initStateTracking();
        
        // First fetch the current state to ensure we're in sync
        this.fetchCurrentState();
        
        // Then subscribe to future changes
        this.gameSubscription = this.supabase
            .channel(`room:${this.roomCode}`)
            .on('postgres_changes', { 
                event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
                schema: 'public', 
                table: 'game_rooms',
                filter: `room_code=eq.${this.roomCode}`
            }, payload => {
                console.log('Game update received:', payload);
                this.handleGameUpdate(payload.new);
            })
            .subscribe((status) => {
                console.log(`Subscription status: ${status}`);
                
                // If subscription was successful, force refresh state
                if (status === 'SUBSCRIBED') {
                    setTimeout(() => this.fetchCurrentState(), 100);
                    
                    // Schedule periodic state reconciliation
                    this.stateReconciliationInterval = setInterval(() => {
                        if (!this.processingUpdate && this.game.gameActive) {
                            this.fetchCurrentState();
                        }
                    }, 5000);
                }
            });
    }
    
    /**
     * Fetch current game state from database
     */
    async fetchCurrentState() {
        if (!this.roomCode) return;
        
        try {
            console.log('Fetching current game state...');
            
            const { data, error } = await this.supabase
                .from('game_rooms')
                .select()
                .eq('room_code', this.roomCode)
                .single();
                
            if (error) {
                console.error('Error fetching game state:', error);
                return;
            }
            
            if (data) {
                console.log('Current state fetched:', data);
                this.handleGameUpdate(data);
            }
        } catch (err) {
            console.error('Error fetching current state:', err);
        }
    }

    /**
     * Handle game state updates from the server
     * @param {Object} newState - The new game state
     */
    handleGameUpdate(newState) {
        // If the handler is processing previous update, skip this one to prevent race conditions
        if (this.processingUpdate) {
            return;
        }
        
        // First check for direct reset command - highest priority
        if (newState.current_state && newState.current_state.directReset) {
            console.log('Received DIRECT RESET command from server with ID:', newState.current_state.resetId);
            
            // Set processing flag to lock updates during reset
            this.processingUpdate = true;
            
            // Prioritize this reset operation, ensure it completes
            setTimeout(() => {
                // Force game to be inactive during reset to prevent race conditions
                this.game.gameActive = false;
                
                // Run the more complete reset function
                this.resetEntireGame();
                
                // After a delay, make sure game is activated and ready
                setTimeout(() => {
                    // Ensure game is active and board is properly initialized
                    this.game.gameActive = true;
                    
                    // Release processing lock after all operations complete
                    this.processingUpdate = false;
                    
                    console.log('Direct reset completed successfully');
                }, 600);
            }, 50);
            return;
        }
        
        // Check if other player left the game
        if (newState.current_state && newState.current_state.playerLeft) {
            const leftBy = newState.current_state.leftBy;
            
            // Only notify if we're the remaining player
            if ((this.isHost && leftBy === 'guest') || (!this.isHost && leftBy === 'host')) {
                console.log('Opponent left the game');
                
                // Make sure we don't treat this as a win/loss
                this.game.winningCombination = null;
                
                // If game end overlay is showing, update the text to indicate opponent left
                if (this.game.ui.gameEndOverlay.style.display === 'flex') {
                    // Only update if we haven't already added the opponent left message
                    if (!this.game.ui.winnerText.innerHTML.includes('Opponent left')) {
                        // Get the original winner message
                        const originalMessage = this.game.ui.winnerText.innerHTML.split('<br>')[0];
                        // Add notification that opponent left
                        this.game.ui.winnerText.innerHTML = `${originalMessage}<br><span style="font-size: 0.9em; color: #ff5555;">Opponent left the game</span>`;
                        
                        // Disable "Play Again" button since other player is gone
                        const playAgainBtn = document.getElementById('playAgainBtn');
                        if (playAgainBtn) {
                            playAgainBtn.disabled = true;
                            playAgainBtn.textContent = 'Opponent Left';
                        }
                    }
                } else {
                    // If we're in regular gameplay, show game end with opponent left message
                    this.game.gameActive = false;
                    
                    // Clear any winning state that might be displayed
                    Array.from(this.game.ui.boardElem.children).forEach(cell => {
                        cell.classList.remove('winning');
                    });
                    
                    // Display opponent left message without triggering win logic
                    this.game.ui.gameEndOverlay.style.display = 'flex';
                    this.game.ui.winnerText.innerHTML = '<span style="color: #ff5555;">Opponent left the game</span>';
                    setTimeout(() => this.game.ui.gameEndOverlay.classList.add('visible'), 10);
                    
                    // Disable "Play Again" button since other player is gone
                    const playAgainBtn = document.getElementById('playAgainBtn');
                    if (playAgainBtn) {
                        playAgainBtn.disabled = true;
                        playAgainBtn.textContent = 'Opponent Left';
                    }
                }
                
                return;
            }
        }
        
        // Check for force reset indicator (from guest to host)
        if (newState.current_state && newState.current_state.forceReset && this.isHost) {
            console.log('Host received FORCE RESET command from guest. Sending direct reset...');
            this.sendDirectResetToServer();
            return;
        }
        
        // If host and guest has joined, start the game
        if (this.isHost && newState.guest_id && newState.status === 'playing' && 
            document.getElementById('hostRoomOverlay').style.display !== 'none') {
            console.log('Guest joined, starting game for host');
            this.hideHostOverlayAndStartGame();
            return;
        }
        
        if (!newState.current_state) return;
        
        const state = newState.current_state;
        
        // Make a copy of the current state before applying updates
        const oldPlayerMoves = JSON.stringify(this.game.playerMoves);
        const oldCurrentPlayer = this.game.currentPlayer;
        const hadWinningCombination = this.game.winningCombination !== null;
        
        // Set processing flag to prevent loops
        this.processingUpdate = true;
        
        try {
            // Copy state from server regardless of turn
            if (state.player_moves) {
                // Make a proper deep copy of the moves
                this.game.playerMoves = JSON.parse(JSON.stringify(state.player_moves));
                console.log('Updated player moves:', JSON.stringify(this.game.playerMoves));
            }
            
            if (state.current_player) {
                this.game.currentPlayer = state.current_player;
            }
            
            if (state.scores) {
                // Always use server scores - they are the source of truth
                this.game.scores = JSON.parse(JSON.stringify(state.scores));
                console.log('Scores synced from server:', JSON.stringify(this.game.scores));
            }
            
            // Sync round starter from server if available
            if (state.roundStarter) {
                this.roundStarter = state.roundStarter;
                console.log('Round starter synced from server:', this.roundStarter);
            }
            
            // Check for fullReset flag - handle before other updates but after direct reset
            if (state.fullReset || state.resetId) {
                console.log('Received GAME RESET signal from server', state.resetId || '');
                
                // Force all state to be cleared
                this.game.playerMoves = { X: [], O: [] };
                // Use roundStarter from server if available, otherwise default to X
                this.game.currentPlayer = state.roundStarter || 'X';
                if (state.roundStarter) {
                    this.roundStarter = state.roundStarter;
                }
                this.game.gameActive = true;
                this.game.winningCombination = null;
                // Only reset scores if this is a match reset (not a round reset)
                // For round resets, scores should be preserved from state.scores
                if (state.scores) {
                    this.game.scores = JSON.parse(JSON.stringify(state.scores));
                } else {
                    // If no scores in state, only reset if this is a true full reset (match end)
                    // For now, preserve scores unless explicitly reset
                    // this.game.scores = { 'X': 0, 'O': 0 };
                }
                this.playAgainChoices = { host: false, guest: false };
                
                // Clear animated moves
                this.animatedMoves.clear();
                
                // Make sure game end overlay is closed
                if (this.game.ui.gameEndOverlay.style.display === 'flex') {
                    this.game.ui.gameEndOverlay.style.display = 'none';
                    this.game.ui.gameEndOverlay.classList.remove('visible');
                    
                    // Reset Play Again button state
                    const playAgainBtn = document.getElementById('playAgainBtn');
                    if (playAgainBtn) {
                        playAgainBtn.textContent = 'Play Again';
                        playAgainBtn.disabled = false;
                    }
                }
                
                // Force the game UI to be visible
                this.game.ui.setupDiv.style.display = 'none';
                this.game.ui.mainContainer.style.display = 'flex';
                
                // Completely reset the board
                this.game.ui.initBoard();
                this.game.ui.renderScores();
                this.game.ui.updateStatus();
                
                // Skip further processing and release the lock
                this.processingUpdate = false;
                return;
            }
            
            // Explicitly sync gameActive state to ensure consistency
            if (state.gameActive !== undefined) {
                this.game.gameActive = state.gameActive;
                console.log('Game active state updated from server:', this.game.gameActive);
            }
            
            // Explicitly sync winningCombination - null means clear it
            if (state.winningCombination === null && this.game.winningCombination !== null) {
                console.log('Clearing winning combination from server update');
                this.game.winningCombination = null;
                
                // Clear any winning highlights
                Array.from(this.game.ui.boardElem.children).forEach(cell => {
                    cell.classList.remove('winning');
                });
            }
            
            // Always update the status text
            this.game.ui.updateStatus();
            
            // Check if state has changed significantly
            const stateChanged = oldPlayerMoves !== JSON.stringify(this.game.playerMoves) || 
                               oldCurrentPlayer !== this.game.currentPlayer;
            
            // Always refresh board to ensure synchronization
            if (stateChanged || this.lastStateRefresh < Date.now() - 5000) {
                console.log('Refreshing game board with current state');
                // Record the time of this refresh
                this.lastStateRefresh = Date.now();
                
                // Refresh the board to reflect the current game state
                this.game.ui.initBoard();
                this.renderPlayerMoves();
                this.game.ui.renderScores();
                
                // Detect and fix deadlock condition (both players seeing "Opponent's Turn")
                this.detectAndFixDeadlock(state);
            }
            
            // Handle play again choices if they exist - move this to a separate function for clarity
            if (state && state.playAgainChoices) {
                this.handlePlayAgainChoices(state);
            }
            
            // Check for game over (match winner) first
            if (state.gameOver && state.matchWinner) {
                console.log('Match winner detected:', state.matchWinner);
                this.game.gameActive = false;
                
                // If player has winning combination, show it first
                if (state.winningCombination && !hadWinningCombination) {
                    this.game.winningCombination = state.winningCombination;
                    this.game.ui.highlightWinningCells(state.winningCombination);
                    
                    // Show game end overlay after a delay to allow the player to see the winning move
                    // AND add the showDialogTimestamp to synchronize dialog appearance
                    const dialogDelay = 1500; // Same delay for both winning and losing player
                    
                    if (!state.showDialogTimestamp) {
                        // If we're the host and there's no timestamp, set one to synchronize both players
                        if (this.isHost) {
                            console.log('Setting showDialogTimestamp as host');
                            // Set timestamp for 1.5 seconds in the future
                            const dialogTimestamp = Date.now() + dialogDelay;
                            this.updateDialogTimestamp(dialogTimestamp);
                        }
                        
                        // Show dialog after delay if no timestamp yet
                        setTimeout(() => {
                            this.game.ui.showGameEnd(`${state.matchWinner} Wins the Match!`);
                            // Check if opponent already chose play again
                            if (this.opponentWantsPlayAgain) {
                                const winnerText = document.getElementById('winnerText');
                                const originalText = winnerText.innerHTML;
                                
                                if (!originalText.includes('Opponent wants to play again')) {
                                    winnerText.innerHTML = originalText + '<br><span style="font-size: 0.8em; color: #aaa;">Opponent wants to play again!</span>';
                                }
                                this.opponentWantsPlayAgain = false;
                            }
                        }, dialogDelay);
                    } else {
                        // Use the synchronized timestamp to determine when to show the dialog
                        const remainingDelay = Math.max(0, state.showDialogTimestamp - Date.now());
                        console.log(`Will show dialog in ${remainingDelay}ms based on timestamp ${state.showDialogTimestamp}`);
                        
                        setTimeout(() => {
                            this.game.ui.showGameEnd(`${state.matchWinner} Wins the Match!`);
                            // Check if opponent already chose play again
                            if (this.opponentWantsPlayAgain) {
                                const winnerText = document.getElementById('winnerText');
                                const originalText = winnerText.innerHTML;
                                
                                if (!originalText.includes('Opponent wants to play again')) {
                                    winnerText.innerHTML = originalText + '<br><span style="font-size: 0.8em; color: #aaa;">Opponent wants to play again!</span>';
                                }
                                this.opponentWantsPlayAgain = false;
                            }
                        }, remainingDelay);
                    }
                } else if (state.showDialogTimestamp) {
                    // Handle case where winning combination was already shown but dialog hasn't appeared yet
                    const remainingDelay = Math.max(0, state.showDialogTimestamp - Date.now());
                    console.log(`Will show dialog in ${remainingDelay}ms based on timestamp ${state.showDialogTimestamp}`);
                    
                    setTimeout(() => {
                        this.game.ui.showGameEnd(`${state.matchWinner} Wins the Match!`);
                        // Check if opponent already chose play again
                        if (this.opponentWantsPlayAgain) {
                            const winnerText = document.getElementById('winnerText');
                            const originalText = winnerText.innerHTML;
                            
                            if (!originalText.includes('Opponent wants to play again')) {
                                winnerText.innerHTML = originalText + '<br><span style="font-size: 0.8em; color: #aaa;">Opponent wants to play again!</span>';
                            }
                            this.opponentWantsPlayAgain = false;
                        }
                    }, remainingDelay);
                } else {
                    // Fallback - show immediately if no timing info available
                    this.game.ui.showGameEnd(`${state.matchWinner} Wins the Match!`);
                    // Check if opponent already chose play again
                    if (this.opponentWantsPlayAgain) {
                        const winnerText = document.getElementById('winnerText');
                        const originalText = winnerText.innerHTML;
                        
                        if (!originalText.includes('Opponent wants to play again')) {
                            winnerText.innerHTML = originalText + '<br><span style="font-size: 0.8em; color: #aaa;">Opponent wants to play again!</span>';
                        }
                        this.opponentWantsPlayAgain = false;
                    }
                }
                return;
            }
            
            // Handle win state IMMEDIATELY after board is updated
            if (state.winningCombination && !hadWinningCombination) {
                console.log('Received win state from server:', state.winningCombination);
                this.game.winningCombination = state.winningCombination;
                
                // Check if the score limit has been reached for either player
                const winner = this.isPlayerTurn(oldCurrentPlayer) ? oldCurrentPlayer : (oldCurrentPlayer === 'X' ? 'O' : 'X');
                if (this.game.scoreLimit > 0 && this.game.scores[winner] >= this.game.scoreLimit) {
                    // We need to set up synchronized dialog timing
                    const dialogDelay = 1500; // Same delay for both winning and losing player
                    
                    if (!state.showDialogTimestamp && this.isHost) {
                        console.log('Setting showDialogTimestamp for match win as host');
                        // Set timestamp for 1.5 seconds in the future
                        const dialogTimestamp = Date.now() + dialogDelay;
                        this.updateDialogTimestamp(dialogTimestamp);
                        
                        // Still need to show our own dialog
                        setTimeout(() => {
                            this.game.ui.showGameEnd(`${winner} Wins the Match!`);
                            // Check if opponent already chose play again
                            if (this.opponentWantsPlayAgain) {
                                const winnerText = document.getElementById('winnerText');
                                const originalText = winnerText.innerHTML;
                                
                                if (!originalText.includes('Opponent wants to play again')) {
                                    winnerText.innerHTML = originalText + '<br><span style="font-size: 0.8em; color: #aaa;">Opponent wants to play again!</span>';
                                }
                                this.opponentWantsPlayAgain = false;
                            }
                        }, dialogDelay);
                    } else if (state.showDialogTimestamp) {
                        // Use the synchronized timestamp
                        const remainingDelay = Math.max(0, state.showDialogTimestamp - Date.now());
                        console.log(`Will show match win dialog in ${remainingDelay}ms based on timestamp ${state.showDialogTimestamp}`);
                        
                        setTimeout(() => {
                            this.game.ui.showGameEnd(`${winner} Wins the Match!`);
                            // Check if opponent already chose play again
                            if (this.opponentWantsPlayAgain) {
                                const winnerText = document.getElementById('winnerText');
                                const originalText = winnerText.innerHTML;
                                
                                if (!originalText.includes('Opponent wants to play again')) {
                                    winnerText.innerHTML = originalText + '<br><span style="font-size: 0.8em; color: #aaa;">Opponent wants to play again!</span>';
                                }
                                this.opponentWantsPlayAgain = false;
                            }
                        }, remainingDelay);
                    } else {
                        // Fallback
                        setTimeout(() => {
                            this.game.ui.showGameEnd(`${winner} Wins the Match!`);
                            // Check if opponent already chose play again
                            if (this.opponentWantsPlayAgain) {
                                const winnerText = document.getElementById('winnerText');
                                const originalText = winnerText.innerHTML;
                                
                                if (!originalText.includes('Opponent wants to play again')) {
                                    winnerText.innerHTML = originalText + '<br><span style="font-size: 0.8em; color: #aaa;">Opponent wants to play again!</span>';
                                }
                                this.opponentWantsPlayAgain = false;
                            }
                        }, dialogDelay);
                    }
                    return;
                }
                
                // If score limit not reached, show winning animation for non-winning player
                if (!this.isPlayerTurn(oldCurrentPlayer)) {
                    this.handleRemoteWin(state.winningCombination, state.showDialogTimestamp);
                    return;
                }
            }
        } finally {
            // Reset processing flag after a delay
            setTimeout(() => {
                this.processingUpdate = false;
            }, 300);
        }
    }
    
    /**
     * Detect and fix turn deadlock issues
     */
    detectAndFixDeadlock(state) {
        // If we're in an active game
        if (this.game.gameActive) {
            // Check for both acknowledgment flags - this is a reliable way to detect a properly initialized game
            if (state.host_acknowledged && state.guest_acknowledged) {
                // Both players have acknowledged the game state, so we can be confident in the current_player
                console.log('Both players have acknowledged game start - syncing turn state');
                
                // Update turn state to match server state
                this.game.currentPlayer = state.current_player || 'X';
                this.game.ui.updateStatus();
                return;
            }
            
            // Update last move timestamp if the moves have changed
            const movesCount = 
                (state.player_moves.X ? state.player_moves.X.length : 0) +
                (state.player_moves.O ? state.player_moves.O.length : 0);
                
            if (movesCount !== this.lastMovesCount) {
                this.lastMoveTime = Date.now();
                this.lastMovesCount = movesCount;
            }
            
            // Sync turn state from server if available
            if (state.current_player) {
                this.game.currentPlayer = state.current_player;
                this.game.ui.updateStatus();
            }
        }
    }
    
    /**
     * Force state update to recover from deadlock
     */
    forceStateUpdate() {
        console.log('Forcing state update for recovery');
        this.game.ui.updateStatus();
        this.updateGameState(null);
    }
    
    /**
     * Initialize default state tracking for deadlock detection
     */
    initStateTracking() {
        this.lastStateRefresh = Date.now();
        this.lastMoveTime = Date.now();
        this.lastMovesCount = 0;
        this.animatedMoves = new Set();
        this.lastRenderedMovesSignature = '';
    }
    
    /**
     * Handle remote win (when other player won)
     * @param {Array} winningCombination - The winning cell combination
     * @param {number} dialogTimestamp - The timestamp when to show the dialog
     */
    handleRemoteWin(winningCombination, dialogTimestamp) {
        // Make sure we stop the game
        this.game.gameActive = false;
        
        // Clear any timers
        if (this.game.countdownInterval) {
            clearInterval(this.game.countdownInterval);
            this.game.countdownInterval = null;
        }
        
        // IMMEDIATELY highlight the winning cells - no delay
        this.game.ui.highlightWinningCells(winningCombination);
        
        // Determine the winner - opposite of the local player's role
        const winner = this.isHost ? 'O' : 'X'; // If host, winner is O; if guest, winner is X
        
        // The score should already be synced from the server state in handleGameUpdate
        // But ensure it's at least 1 if it's still 0 (fallback)
        if (this.game.scores[winner] === undefined || this.game.scores[winner] === 0) {
            // This should not happen if scores are properly synced, but as a safety measure:
            const previousScore = this.game.scores[winner] || 0;
            this.game.scores[winner] = previousScore + 1;
            console.log(`Fallback: Incremented remote winner ${winner} score from ${previousScore} to ${this.game.scores[winner]}`);
        }
        
        // IMMEDIATELY show the score animation for the winner
        this.game.ui.renderScoresWithAnimation(winner);
        
        // Wait for the synchronized dialog timing or use default
        const showDialogDelay = dialogTimestamp 
            ? Math.max(0, dialogTimestamp - Date.now()) 
            : 1500; // Default to 1.5 seconds if no timestamp
        
        console.log(`Remote win - will show dialog in ${showDialogDelay}ms${dialogTimestamp ? ' based on timestamp' : ''}`);
        
        // Check if score limit reached
        const matchEnded = this.game.scoreLimit > 0 && this.game.scores[winner] >= this.game.scoreLimit;
        
        if (matchEnded) {
            console.log(`Remote player (${winner}) reached score limit. Showing game end after delay.`);
            // Reset play again choices for a new match
            this.resetPlayAgainChoices();
            
            // Show dialog at synchronized time or after default delay
            setTimeout(() => {
                this.game.ui.showGameEnd(`${winner} Wins the Match!`);
                // Reset processing flag
                this.processingUpdate = false;
            }, showDialogDelay);
        } else {
            // Allow player to see what happened, then reset
            setTimeout(() => {
                // Reinitialize the game after seeing the winning move
                this.scheduleGameReset();
                
                // Reset processing flag
                this.processingUpdate = false;
            }, 2000); // Longer delay to see the winning move
        }
    }
    
    /**
     * Schedule game reset for both players
     */
    scheduleGameReset() {
        console.log('Scheduling game reset');
        setTimeout(() => {
            // Reset the game state (but preserve scores!)
            this.game.playerMoves = { X: [], O: [] };
            this.game.winningCombination = null;
            this.game.gameActive = true;
            
            // Only host determines and sends the new starting player
            // Guest will receive it from the server
            if (this.isHost) {
                // Alternate starting player - if host started last round, guest starts this round
                // The roundStarter alternates: X -> O -> X -> O...
                this.roundStarter = this.roundStarter === 'X' ? 'O' : 'X';
                this.game.currentPlayer = this.roundStarter;
                
                // Clear animated moves for the new round
                this.animatedMoves.clear();
                
                // Update the board
                this.game.ui.initBoard();
                this.game.ui.updateStatus();
                
                // Send the initial state update with the new starting player and preserved scores
                setTimeout(() => this.updateGameState(null), 100);
            } else {
                // Guest: Clear animated moves and wait for server state
                this.animatedMoves.clear();
                // The board and current player will be updated when we receive the server state
            }
        }, 1000);
    }
    
    /**
     * Check if the game state has meaningfully changed
     * @param {Object} currentMoves - Current moves object
     * @param {Object} newMoves - New moves object from server
     * @returns {boolean} - True if state has changed
     */
    hasStateChanged(currentMoves, newMoves) {
        if (!currentMoves || !newMoves) return true;
        
        // Check X moves
        if (!this.areArraysEqual(currentMoves.X || [], newMoves.X || [])) {
            return true;
        }
        
        // Check O moves
        if (!this.areArraysEqual(currentMoves.O || [], newMoves.O || [])) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Compare two arrays for equality
     */
    areArraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        
        // Sort arrays for comparison (since order doesn't matter for moves)
        const sorted1 = [...arr1].sort();
        const sorted2 = [...arr2].sort();
        
        for (let i = 0; i < sorted1.length; i++) {
            if (sorted1[i] !== sorted2[i]) return false;
        }
        
        return true;
    }
    
    /**
     * Render player moves on the board
     */
    renderPlayerMoves() {
        // Get a reference to the cells
        const cells = this.game.ui.boardElem.children;
        if (!cells || cells.length === 0) {
            console.error('Board cells not initialized');
            return;
        }
        
        // Make a copy of player moves to avoid issues during rendering
        const playerMoves = JSON.parse(JSON.stringify(this.game.playerMoves));
        console.log('Rendering player moves:', JSON.stringify(playerMoves));
        
        // Calculate current moves signature to detect if moves have changed
        const currentMovesSignature = JSON.stringify(playerMoves);
        const movesChanged = this.lastRenderedMovesSignature !== currentMovesSignature;
        
        // Clear the board completely first - properly remove all classes
        for (let i = 0; i < cells.length; i++) {
            cells[i].textContent = '';
            cells[i].classList.remove('x', 'o', 'mark-animation', 'dim', 'winning', 'draw');
        }
        
        // If moves have changed, reset the animated moves set
        if (movesChanged) {
            this.animatedMoves.clear();
            this.lastRenderedMovesSignature = currentMovesSignature;
        }
        
        // If there's no game active or we're in a winning state, just render the final state
        if (!this.game.gameActive && this.game.winningCombination) {
            // Render X moves
            if (playerMoves.X && playerMoves.X.length > 0) {
                for (const index of playerMoves.X) {
                    if (index >= 0 && index < cells.length) {
                        cells[index].textContent = 'X';
                        cells[index].classList.add('x');
                    }
                }
            }
            
            // Render O moves
            if (playerMoves.O && playerMoves.O.length > 0) {
                for (const index of playerMoves.O) {
                    if (index >= 0 && index < cells.length) {
                        cells[index].textContent = 'O';
                        cells[index].classList.add('o');
                    }
                }
            }
            
            // Highlight winning cells if there is a winning combination
            if (this.game.winningCombination) {
                this.game.ui.highlightWinningCells(this.game.winningCombination);
            }
            
            return;
        }
        
        // Find the most recent move across both players
        let lastMoveIndex = -1;
        let lastMovePlayer = null;
        
        // Check X moves for last move
        if (playerMoves.X && playerMoves.X.length > 0) {
            const lastXMove = playerMoves.X[playerMoves.X.length - 1];
            lastMoveIndex = lastXMove;
            lastMovePlayer = 'X';
        }
        
        // Check O moves for last move (might override X if O moved last)
        if (playerMoves.O && playerMoves.O.length > 0) {
            const lastOMove = playerMoves.O[playerMoves.O.length - 1];
            
            // Compare with current last move - only if we know the last player
            if (lastMovePlayer === 'X' && this.game.currentPlayer === 'X') {
                // If current player is X, then O moved last
                lastMoveIndex = lastOMove;
                lastMovePlayer = 'O';
            } else if (lastMovePlayer === 'O' && this.game.currentPlayer === 'O') {
                // If current player is O, then X moved last
                lastMoveIndex = playerMoves.X[playerMoves.X.length - 1];
                lastMovePlayer = 'X';
            } else if (lastMovePlayer === null) {
                // If we don't know yet, use O's last move
                lastMoveIndex = lastOMove;
                lastMovePlayer = 'O';
            }
        }
        
        // If there is a winning combination, ensure that at least one winning cell gets animation
        let ensureWinningAnimation = false;
        if (this.game.winningCombination && this.game.winningCombination.length > 0) {
            ensureWinningAnimation = true;
        }
        
        // Helper function to render moves without animation
        const renderMoves = (symbol, moves) => {
            if (!Array.isArray(moves) || moves.length === 0) return;
            
            const className = symbol.toLowerCase();
            
            for (const index of moves) {
                if (index >= 0 && index < cells.length) {
                    const cell = cells[index];
                    cell.textContent = symbol;
                    cell.classList.add(className);
                    
                    // Add animation to the last move or to a winning move if we need to ensure animation
                    // Only animate if this move hasn't been animated before
                    const moveKey = `${symbol}-${index}`;
                    const isWinningCell = this.game.winningCombination && 
                                        this.game.winningCombination.includes(index);
                    
                    if ((index === lastMoveIndex && symbol === lastMovePlayer) || 
                        (ensureWinningAnimation && isWinningCell)) {
                        // Only add animation if this move hasn't been animated yet
                        if (!this.animatedMoves.has(moveKey)) {
                            cell.classList.add('mark-animation');
                            this.animatedMoves.add(moveKey);
                            if (ensureWinningAnimation && isWinningCell) {
                                ensureWinningAnimation = false;  // Only animate one cell
                            }
                        }
                    }
                }
            }
        };
        
        // Render X moves - handle both object notations
        if (playerMoves.X) {
            renderMoves('X', playerMoves.X);
        } else if (playerMoves['X']) {
            renderMoves('X', playerMoves['X']);
        }
        
        // Render O moves - handle both object notations
        if (playerMoves.O) {
            renderMoves('O', playerMoves.O);
        } else if (playerMoves['O']) {
            renderMoves('O', playerMoves['O']);
        }
        
        // If there's a winning combination, highlight it
        if (this.game.winningCombination) {
            this.game.ui.highlightWinningCells(this.game.winningCombination);
        }
        
        // Update next removal highlight if needed
        if (this.game.highlightRemoval) {
            this.game.ui.updateNextRemoval();
        }
    }

    /**
     * Hide host overlay and start the game (when guest joins)
     */
    hideHostOverlayAndStartGame() {
        // Hide the host room overlay
        const hostRoomOverlay = document.getElementById('hostRoomOverlay');
        hostRoomOverlay.classList.remove('visible');
        
        // Set processing flag to prevent loops
        this.processingUpdate = true;
        
        setTimeout(async () => {
            hostRoomOverlay.style.display = 'none';
            
            // Reset the game state - ensure proper object format
            this.game.playerMoves = { X: [], O: [] };
            this.game.currentPlayer = 'X';
            this.game.gameActive = true;
            
            // Start the game
            this.game.ui.startGame();
            
            // Update status to indicate it's the host's turn (X)
            this.game.ui.statusElem.textContent = 'Your Turn';
            this.game.ui.statusElem.style.color = 'var(--x-color)';
            
            // Force refresh the game board
            this.game.ui.initBoard();
            
            // Send initial state to server for the guest, including both acknowledgment flags
            const updatePayload = {
                current_state: {
                    player_moves: { X: [], O: [] },
                    current_player: 'X',
                    scores: { X: 0, O: 0 },
                    gameActive: true,
                    host_acknowledged: true,
                    guest_acknowledged: true, // This will come from the guest's join
                    timestamp: Date.now()
                }
            };
            
            // Update the database
            await this.supabase
                .from('game_rooms')
                .update(updatePayload)
                .eq('room_code', this.roomCode);
            
            // Reset processing flag
            setTimeout(() => {
                this.processingUpdate = false;
            }, 500);
        }, 300);
    }

    /**
     * Check if it's the current player's turn
     * @param {string} currentPlayer - The current player (X or O)
     * @returns {boolean} - True if it's this player's turn
     */
    isPlayerTurn(currentPlayer) {
        if (this.isHost) {
            return currentPlayer === 'X';
        } else {
            return currentPlayer === 'O';
        }
    }

    /**
     * Update the game state after making a move
     * @param {number} index - The board position where the move was made
     * @param {boolean} matchEnded - Whether the match has ended due to score limit
     * @param {string} matchWinner - The winner of the match if ended
     * @param {boolean} wantsPlayAgain - Whether this player wants to play again
     * @param {boolean} resetPlayAgainChoices - Whether to reset play again choices
     * @param {boolean} fullReset - Whether to perform a full game reset
     */
    async updateGameState(index, matchEnded = false, matchWinner = null, wantsPlayAgain = false, resetPlayAgainChoices = false, fullReset = false) {
        if (!this.roomCode || this.processingUpdate) return;
        
        console.log('Updating game state', {
            playerMoves: this.game.playerMoves,
            currentPlayer: this.game.currentPlayer,
            scores: this.game.scores,
            winningCombination: this.game.winningCombination,
            matchEnded: matchEnded,
            matchWinner: matchWinner,
            wantsPlayAgain: wantsPlayAgain,
            resetPlayAgainChoices: resetPlayAgainChoices,
            fullReset: fullReset
        });
        
        // Set this flag to prevent receiving our own update
        this.processingUpdate = true;
        
        try {
            // Create a proper deep copy of player moves
            const playerMoves = {
                X: Array.isArray(this.game.playerMoves.X) ? JSON.parse(JSON.stringify(this.game.playerMoves.X)) : [],
                O: Array.isArray(this.game.playerMoves.O) ? JSON.parse(JSON.stringify(this.game.playerMoves.O)) : []
            };
            
            // If there's a matchWinner, increment their score BEFORE creating the payload
            // This ensures the incremented score is included in the update
            if (matchWinner) {
                const currentScore = this.game.scores[matchWinner] || 0;
                this.game.scores[matchWinner] = currentScore + 1;
                console.log(`Incremented score for ${matchWinner} from ${currentScore} to ${this.game.scores[matchWinner]}`);
            }
            
            // Create update payload with current game state (scores now include the increment if matchWinner was set)
            const updatePayload = {
                current_state: {
                    player_moves: playerMoves,
                    current_player: this.game.currentPlayer,
                    scores: JSON.parse(JSON.stringify(this.game.scores)),
                    roundStarter: this.roundStarter, // Include round starter for synchronization
                    timestamp: Date.now(),
                    gameActive: this.game.gameActive
                },
                last_activity: new Date().toISOString()
            };
            
            // If this is a full reset, set special flags
            if (fullReset) {
                console.log('Setting FULL RESET state in update payload');
                updatePayload.current_state.fullReset = true;
                updatePayload.current_state.gameActive = true;
                updatePayload.current_state.winningCombination = null;
                updatePayload.current_state.playAgainChoices = { host: false, guest: false };
                // DO NOT reset scores on full reset - preserve them!
                // updatePayload.current_state.scores = { 'X': 0, 'O': 0 }; // REMOVED
                updatePayload.current_state.player_moves = { 'X': [], 'O': [] };
                updatePayload.current_state.roundStarter = this.roundStarter; // Include round starter
                updatePayload.status = 'playing';
                
                // Skip other flags when doing a full reset to avoid conflicts
                return this.sendStateUpdate(updatePayload);
            }
            
            // Handle play again choices
            if (!updatePayload.current_state.playAgainChoices) {
                updatePayload.current_state.playAgainChoices = { host: false, guest: false };
            }
            
            if (resetPlayAgainChoices) {
                // Reset both players' choices
                updatePayload.current_state.playAgainChoices = { host: false, guest: false };
                
                // Special case: When resetting after both players chose play again, 
                // ensure the game is active and winning combination is cleared
                updatePayload.current_state.gameActive = true;
                updatePayload.current_state.winningCombination = null;
                updatePayload.status = 'playing';
            } else if (wantsPlayAgain) {
                // Update only this player's choice
                if (this.isHost) {
                    updatePayload.current_state.playAgainChoices.host = true;
                    updatePayload.current_state.playAgainChoices.guest = this.playAgainChoices.guest;
                } else {
                    updatePayload.current_state.playAgainChoices.guest = true;
                    updatePayload.current_state.playAgainChoices.host = this.playAgainChoices.host;
                }
            }
            
            // If there's a winning combination, include it
            if (this.game.winningCombination && !resetPlayAgainChoices) {
                updatePayload.current_state.winningCombination = [...this.game.winningCombination];
                
                // If match is explicitly ended, add gameOver flags
                if (matchEnded && matchWinner) {
                    console.log('Adding match end info to update:', matchWinner);
                    updatePayload.current_state.gameOver = true;
                    updatePayload.current_state.matchWinner = matchWinner;
                }
                
                // Set game status to completed if there's a winner
                updatePayload.status = 'completed';
            }
            
            console.log('Sending state update to server:', JSON.stringify(updatePayload));
            
            // Send the update to the server
            return this.sendStateUpdate(updatePayload);
        } catch (error) {
            console.error('Error updating game state:', error);
        } finally {
            // Reset processing flag after a delay
            setTimeout(() => {
                this.processingUpdate = false;
            }, 800);
        }
    }

    /**
     * Leave the current game room
     */
    async leaveRoom() {
        if (!this.roomCode) return;
        
        try {
            // Clear reconciliation interval
            if (this.stateReconciliationInterval) {
                clearInterval(this.stateReconciliationInterval);
                this.stateReconciliationInterval = null;
            }
            
            // Unsubscribe from updates
            if (this.gameSubscription) {
                this.gameSubscription.unsubscribe();
                this.gameSubscription = null;
            }
            
            // Send notification to other player that this player has left
            await this.supabase
                .from('game_rooms')
                .update({
                    current_state: {
                        playerLeft: true,
                        leftBy: this.isHost ? 'host' : 'guest',
                        timestamp: Date.now(),
                        // Include essential game state but clear any winning state
                        player_moves: this.game.playerMoves,
                        current_player: this.game.currentPlayer,
                        scores: this.game.scores,
                        gameActive: false,
                        winningCombination: null
                    }
                })
                .eq('room_code', this.roomCode);
            
            // If host leaves, delete the room after a short delay to allow notification to be received
            if (this.isHost) {
                setTimeout(async () => {
                    await this.supabase
                        .from('game_rooms')
                        .delete()
                        .eq('room_code', this.roomCode);
                }, 1000);
            } else {
                // If guest leaves, update the room
                await this.supabase
                    .from('game_rooms')
                    .update({ 
                        guest_id: null,
                        status: 'waiting'
                    })
                    .eq('room_code', this.roomCode);
            }
            
            this.roomCode = null;
            this.isHost = false;
            this.opponentId = null;
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    }

    /**
     * Handle player choosing Play Again
     * @returns {boolean} True if both players have chosen to play again
     */
    handlePlayAgain() {
        console.log('Player chose Play Again. Current choices:', this.playAgainChoices);
        
        // Update local tracking first
        if (this.isHost) {
            this.playAgainChoices.host = true;
        } else {
            this.playAgainChoices.guest = true;
        }
        
        // Check if both players are already ready based on local state
        const bothPlayersReady = this.playAgainChoices.host && this.playAgainChoices.guest;
        
        // Always send the update to the server immediately
        this.updateGameState(null, false, null, true);
        
        // Check server state to make sure we're in sync
        this.checkServerPlayAgainState();
        
        // If both players are ready locally, perform a complete reset
        if (bothPlayersReady) {
            console.log('Both players ready locally, performing game reset');
            
            // First reset the game locally - this is important for both players
            this.resetEntireGame();
            
            // If host, also send the reset command to server
            if (this.isHost) {
                console.log('Host sending direct reset command');
                this.sendDirectResetToServer();
            }
            
            return true;
        } else {
            // Set a failsafe timer for deadlock situations
            this.setPlayAgainDeadlockTimer();
            return false;
        }
    }
    
    /**
     * Check server state for play again choices to detect and resolve desynchronization
     */
    async checkServerPlayAgainState() {
        try {
            // Fetch the current room state from server
            const { data, error } = await this.supabase
                .from('game_rooms')
                .select()
                .eq('room_code', this.roomCode)
                .single();
                
            if (error) {
                console.error('Error fetching room state:', error);
                return;
            }
            
            // If server has play again choices, check if both players are ready
            if (data && data.current_state && data.current_state.playAgainChoices) {
                const serverChoices = data.current_state.playAgainChoices;
                console.log('Server play again choices:', serverChoices, 'Local choices:', this.playAgainChoices);
                
                // Check if both players are ready on server but not reflected locally
                if (serverChoices.host && serverChoices.guest) {
                    // Update local state
                    this.playAgainChoices = { host: true, guest: true };
                    
                    // If we're host and both players are ready on server, initiate reset
                    if (this.isHost) {
                        console.log('Both players ready on server, host initiating reset');
                        this.sendDirectResetToServer();
                    } else if (this.game.ui.gameEndOverlay.style.display === 'flex') {
                        // For guest, if overlay is showing but host hasn't reset yet
                        console.log('Both players ready on server, guest waiting for host reset');
                        const playAgainBtn = document.getElementById('playAgainBtn');
                        if (playAgainBtn) {
                            playAgainBtn.textContent = 'Waiting for host...';
                            playAgainBtn.disabled = true;
                        }
                        
                        // Send a force reset command after a short delay to ensure host
                        // receives the updated state and has a chance to act
                        setTimeout(() => {
                            const forceResetPayload = {
                                current_state: {
                                    forceReset: true,
                                    playAgainChoices: { host: true, guest: true },
                                    timestamp: Date.now()
                                }
                            };
                            
                            this.supabase
                                .from('game_rooms')
                                .update(forceResetPayload)
                                .eq('room_code', this.roomCode);
                        }, 1500);
                    }
                } else {
                    // Update local state to match server - important for synchronization
                    this.playAgainChoices = { 
                        host: serverChoices.host, 
                        guest: serverChoices.guest 
                    };
                }
            }
        } catch (error) {
            console.error('Error checking server play again state:', error);
        }
    }

    /**
     * Set a timer to detect and resolve Play Again deadlocks
     */
    setPlayAgainDeadlockTimer() {
        // Clear any existing timer
        if (this.playAgainDeadlockTimer) {
            clearTimeout(this.playAgainDeadlockTimer);
            this.playAgainDeadlockTimer = null;
        }
        
        console.log('Setting Play Again deadlock timer');
        
        // Set a new timer
        this.playAgainDeadlockTimer = setTimeout(() => {
            // Only proceed if the game end overlay is still visible
            if (this.game.ui.gameEndOverlay.style.display === 'flex') {
                console.log('Play Again deadlock timer triggered. Checking state...');
                
                // Check if the button is already in waiting state
                const playAgainBtn = document.getElementById('playAgainBtn');
                const isWaiting = playAgainBtn && playAgainBtn.disabled && 
                                 playAgainBtn.textContent === 'Waiting for opponent...';
                
                if (isWaiting) {
                    console.log('In waiting state but no response from opponent. Rechecking server state...');
                    
                    // Force a state check
                    this.fetchCurrentState();
                    
                    // Add another check in case the first one didn't resolve the issue
                    setTimeout(() => {
                        // If still in waiting state, try to recover
                        if (playAgainBtn && playAgainBtn.disabled && 
                            playAgainBtn.textContent === 'Waiting for opponent...' &&
                            this.game.ui.gameEndOverlay.style.display === 'flex') {
                            
                            console.log('Still in waiting state after recheck. Attempting recovery...');
                            
                            // If we're the host, try sending a direct reset
                            if (this.isHost) {
                                console.log('Host attempting recovery by sending direct reset');
                                this.sendDirectResetToServer();
                            } 
                            // If we're the guest, send a force reset command to the host
                            else {
                                console.log('Guest sending force reset command to host');
                                
                                // Create force reset payload
                                const forceResetPayload = {
                                    current_state: {
                                        forceReset: true,
                                        timestamp: Date.now(),
                                        playAgainChoices: { host: true, guest: true } // Force both to true
                                    }
                                };
                                
                                // Send the command
                                this.supabase
                                    .from('game_rooms')
                                    .update(forceResetPayload)
                                    .eq('room_code', this.roomCode)
                                    .then(() => {
                                        // If host still doesn't respond, guest will reload after 3 seconds
                                        setTimeout(() => {
                                            if (this.game.ui.gameEndOverlay.style.display === 'flex' &&
                                                playAgainBtn && playAgainBtn.disabled) {
                                                console.log('Host still not responding. Guest resetting local UI.');
                                                // Reset UI state
                                                playAgainBtn.disabled = false;
                                                playAgainBtn.textContent = 'Play Again';
                                                // Update message
                                                const currentMessage = this.game.ui.winnerText.innerHTML.split('<br>')[0];
                                                this.game.ui.winnerText.innerHTML = `${currentMessage}<br><span style="font-size: 0.9em; color: #ff5555;">Failed to sync with opponent. Try again.</span>`;
                                            }
                                        }, 3000);
                                    });
                            }
                        }
                    }, 2000);
                }
                
                // Set another timer to periodically check server state
                setTimeout(() => this.checkServerPlayAgainState(), 2000);
            }
        }, 3000); // Reduced from 5s to 3s for faster response
    }

    /**
     * Send a direct reset command to the server instead of reloading the page
     */
    async sendDirectResetToServer() {
        console.log('Host is sending DIRECT RESET command to server');
        
        // Create a unique reset ID to ensure this reset is processed by all clients
        const resetId = Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        
        // Ensure a clean local reset first
        this.resetEntireGame();
        
        const resetPayload = {
            current_state: {
                // Include a unique resetId, directReset flag, and timestamp
                resetId: resetId,
                directReset: true,
                player_moves: { 'X': [], 'O': [] },
                current_player: 'X',
                scores: { 'X': 0, 'O': 0 },
                gameActive: true,
                winningCombination: null,
                playAgainChoices: { host: false, guest: false },
                host_acknowledged: true,
                guest_acknowledged: true,
                timestamp: Date.now()
            },
            status: 'playing',
            last_activity: new Date().toISOString()
        };
        
        try {
            console.log('Sending direct reset command with ID:', resetId);
            const { data, error } = await this.supabase
                .from('game_rooms')
                .update(resetPayload)
                .eq('room_code', this.roomCode)
                .select();
            
            if (error) {
                console.error('Error sending direct reset:', error);
                throw error;
            }
            
            console.log('Direct reset sent successfully');
        } catch (error) {
            console.error('Error sending direct reset:', error);
        }
    }

    /**
     * Execute the direct reset locally (for both host and guest)
     */
    executeDirectReset() {
        console.log('Executing direct reset locally');
        
        // Use the more thorough reset method instead of partial reset
        this.resetEntireGame();
        
        // Force a final UI update to ensure board and status are correct
        setTimeout(() => {
            this.game.ui.updateStatus();
            
            // Double-check that the game is active
            this.game.gameActive = true;
        }, 600);
    }

    /**
     * Reset play again choices
     */
    resetPlayAgainChoices() {
        this.playAgainChoices = { host: false, guest: false };
    }

    /**
     * Reset the entire game state
     */
    resetEntireGame() {
        console.log('PERFORMING COMPLETE GAME RESET');
        
        // Reset play again choices
        this.playAgainChoices = { host: false, guest: false };
        
        // Force all async operations to complete
        this.processingUpdate = true;
        
        // Clear any timers
        this.game.clearTimers();
        
        // Force clear all game state (but preserve scores!)
        this.game.gameActive = true; // Set to true immediately to prevent state confusion
        this.game.winningCombination = null;
        this.game.playerMoves = { X: [], O: [] };
        
        // Alternate starting player for the new round
        this.roundStarter = this.roundStarter === 'X' ? 'O' : 'X';
        this.game.currentPlayer = this.roundStarter;
        
        // DO NOT reset scores - they should persist across rounds!
        // this.game.scores = { 'X': 0, 'O': 0 }; // REMOVED - preserve scores
        
        // Clear animated moves
        this.animatedMoves.clear();
        
        // Close end game overlay if open - do this immediately
        if (this.game.ui.gameEndOverlay.style.display === 'flex') {
            this.game.ui.gameEndOverlay.classList.remove('visible');
            this.game.ui.gameEndOverlay.style.display = 'none';
            
            // Reset Play Again button state
            const playAgainBtn = document.getElementById('playAgainBtn');
            if (playAgainBtn) {
                playAgainBtn.textContent = 'Play Again';
                playAgainBtn.disabled = false;
            }
            
            // Reset winner text
            if (this.game.ui.winnerText) {
                const originalMessage = this.game.ui.winnerText.innerHTML.split('<br>')[0];
                this.game.ui.winnerText.innerHTML = originalMessage;
            }
        }
        
        // Force a DOM repaint to clear any visual state
        void document.body.offsetHeight;
        
        // Hard reset the board - completely remove and recreate
        if (this.game.ui.boardElem) {
            // First clear everything from the board
            this.game.ui.boardElem.innerHTML = '';
            
            // Set the board immediately with empty cells
            for (let i = 0; i < 9; i++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.index = i;
                
                const handleInteraction = (e) => {
                    e.preventDefault();
                    if (e.type === 'mousedown' && e.button !== 0) return;
                    if (this.game.gameMode === 'ai' && this.game.currentPlayer === 'O') return;
                    this.game.makeMove(i);
                };

                cell.addEventListener('mousedown', handleInteraction);
                cell.addEventListener('touchstart', handleInteraction, { passive: false });
                
                this.game.ui.boardElem.appendChild(cell);
            }
            
            // Update UI
            this.game.ui.renderScores();
            this.game.ui.updateStatus();
        }
        
        // Reset game properly to ensure clean state
        this.game.resetGame();
        
        // Add a small delay before releasing the processing lock to ensure UI updates
        setTimeout(() => {
            // Force one more status update
            this.game.ui.updateStatus();
            this.processingUpdate = false;
        }, 300);
        
        // Also send an update to the server to ensure both clients are in sync
        setTimeout(() => {
            this.updateGameState(null);
        }, 400);
    }

    /**
     * Signal game reset to other player
     */
    signalGameReset() {
        console.log('Signaling HARDCORE RESET to other player');
        
        // Create a direct reset payload with a unique timestamp
        const resetPayload = {
            current_state: {
                // Add a unique reset ID to ensure this reset is processed
                resetId: Date.now() + '_' + Math.random().toString(36).substring(2, 9),
                fullReset: true,
                hardcoreReset: true, // Special flag for hardcore reset
                player_moves: { 'X': [], 'O': [] },
                current_player: 'X',
                scores: { 'X': 0, 'O': 0 },
                gameActive: true,
                winningCombination: null,
                playAgainChoices: { host: false, guest: false },
                timestamp: Date.now()
            },
            status: 'playing',
            last_activity: new Date().toISOString()
        };
        
        // Make sure we've done our local reset first
        this.hardcoreGameReset();
        
        // Force immediate update by directly calling the database
        try {
            console.log('Sending hardcore reset signal to database');
            this.supabase
                .from('game_rooms')
                .update(resetPayload)
                .eq('room_code', this.roomCode)
                .then(response => {
                    console.log('Hardcore reset signal sent successfully');
                })
                .catch(error => {
                    console.error('Error sending reset signal:', error);
                    this.processingUpdate = false;
                });
        } catch (error) {
            console.error('Error in signalGameReset:', error);
            this.processingUpdate = false;
        }
    }

    /**
     * Send state update to the database
     * @param {Object} updatePayload - The payload to send
     */
    async sendStateUpdate(updatePayload) {
        console.log('Sending state update to server:', JSON.stringify(updatePayload));
        
        try {
            // Update the game state in the database
            const { data, error } = await this.supabase
                .from('game_rooms')
                .update(updatePayload)
                .eq('room_code', this.roomCode)
                .select();
                
            if (error) {
                console.error('Error updating game state:', error);
                throw error;
            }
            
            console.log('Game state updated successfully', data);
        } catch (error) {
            console.error('Error updating game state:', error);
        } finally {
            // Reset processing flag after a delay
            setTimeout(() => {
                this.processingUpdate = false;
            }, 800);
        }
    }

    /**
     * Hardcore game reset - completely recreates the game board and forces state reset
     * Used as a last resort when other reset methods fail
     */
    hardcoreGameReset() {
        console.log('🔥 PERFORMING HARDCORE GAME RESET 🔥');
        
        // Force close any open dialogs first
        if (this.game.ui.gameEndOverlay) {
            this.game.ui.gameEndOverlay.style.display = 'none';
            this.game.ui.gameEndOverlay.classList.remove('visible');
        }
        
        // Reset state variables
        this.processingUpdate = false;
        this.playAgainChoices = { host: false, guest: false };
        
        // Force window reload - most extreme but guaranteed solution
        window.location.reload();
    }

    /**
     * Clear reset local storage
     */
    clearResetLocalStorage() {
        localStorage.removeItem('shouldResetGame');
        localStorage.removeItem('resetRoomCode');
        localStorage.removeItem('resetIsHost');
        localStorage.removeItem('resetGameMode');
        localStorage.removeItem('resetScoreLimit');
        localStorage.removeItem('resetTurnTimeLimit');
        localStorage.removeItem('resetHighlightRemoval');
    }

    /**
     * Update the dialog timestamp in the game state
     * @param {number} timestamp - The timestamp when dialog should appear
     */
    async updateDialogTimestamp(timestamp) {
        try {
            // Create update payload with just the timestamp
            const updatePayload = {
                current_state: {
                    showDialogTimestamp: timestamp
                },
                last_activity: new Date().toISOString()
            };
            
            console.log('Updating dialog timestamp:', timestamp);
            
            // Send the update to the server
            const { error } = await this.supabase
                .from('game_rooms')
                .update(updatePayload)
                .eq('room_code', this.roomCode);
                
            if (error) {
                console.error('Error updating dialog timestamp:', error);
            }
        } catch (error) {
            console.error('Error in updateDialogTimestamp:', error);
        }
    }

    /**
     * Handle play again choices if they exist in the state
     * @param {Object} state - The current game state
     * @private
     */
    handlePlayAgainChoices(state) {
        if (!state.playAgainChoices) return;
        
        console.log('Processing play again choices:', state.playAgainChoices);
        
        // Store previous choices
        const oldChoices = JSON.stringify(this.playAgainChoices);
        // Update local state with server state
        this.playAgainChoices = state.playAgainChoices;
        
        // Check if both players want to play again
        if (state.playAgainChoices.host && state.playAgainChoices.guest) {
            console.log('Both players want to play again according to server state');
            
            // Make sure play again button shows the right state
            const playAgainBtn = document.getElementById('playAgainBtn');
            if (playAgainBtn) {
                if (playAgainBtn.disabled && playAgainBtn.textContent === 'Waiting for opponent...') {
                    console.log('Play Again button was in waiting state, resetting game');
                    // Hide overlay and reset game
                    this.game.ui.hideGameEndOverlay();
                }
            }
            
            // Force reset game state even if overlay is not visible
            // This is critical when host clicks Play Again before guest sees the menu
            if (this.game.ui.gameEndOverlay.style.display !== 'flex') {
                console.log('Game end overlay not visible, forcing game reset anyway');
                this.resetEntireGame();
            }
            
            // If we're the host, we should initiate a game reset
            if (this.isHost) {
                console.log('Host detected both players ready from server, sending reset');
                
                // Allow enough time for any processing to complete
                setTimeout(() => {
                    // Only send if we're still in the game end state
                    if (this.game.ui.gameEndOverlay.style.display === 'flex' || 
                        document.getElementById('playAgainBtn')?.disabled) {
                        this.sendDirectResetToServer();
                    }
                }, 500);
            }
        } 
        // If the other player wants to play again but we haven't chosen yet
        else if ((this.isHost && !state.playAgainChoices.host && state.playAgainChoices.guest) || 
                (!this.isHost && state.playAgainChoices.host && !state.playAgainChoices.guest)) {
            
            console.log('Other player wants to play again');
            
            // If game end overlay is showing
            if (this.game.ui.gameEndOverlay.style.display === 'flex') {
                // Notify this player that opponent wants to play again
                const currentMessage = this.game.ui.winnerText.innerHTML;
                if (!currentMessage.includes('wants to play again')) {
                    this.game.ui.winnerText.innerHTML = `${currentMessage}<br><span style="font-size: 0.9em; color: var(--text-color)">Opponent wants to play again</span>`;
                }
            } else {
                // If overlay isn't showing yet, set flag to show the message when it appears
                this.opponentWantsPlayAgain = true;
            }
        }
    }
} 