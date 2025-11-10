import AI from './ai.js';
import Multiplayer from './multiplayer.js';

/**
 * Main game logic module for Infinite Tic-Tac-Toe
 */
export default class Game {
    constructor(ui) {
        this.ui = ui;
        
        // Game settings
        this.gameMode = 'ai';
        this.aiDifficulty = 'easy';
        this.scoreLimit = 0;
        this.turnTimeLimit = 0;
        this.highlightRemoval = true;

        // Game state
        this.currentPlayer = 'X';
        this.gameActive = true;
        this.playerMoves = { 'X': [], 'O': [] };
        this.scores = { 'X': 0, 'O': 0 };
        this.timeLeft = 0;
        this.nextStarter = 'X';
        this.winningCombination = null;
        
        // Timers
        this.countdownInterval = null;
        this.aiMoveTimeout = null;

        // Loop prevention
        this.loopStates = new Map();
        this.enableSafeStrategy = false;
        this.stateHistory = [];
        
        // Multiplayer
        this.multiplayer = new Multiplayer(this);

        // Flag for sent win update
        this.sentWinUpdate = false;
    }

    /**
     * Reset the game state
     */
    resetGame() {
        this.playerMoves = { 'X': [], 'O': [] };
        this.scores = { 'X': 0, 'O': 0 };
    }

    /**
     * Clear all active timers
     */
    clearTimers() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        if (this.aiMoveTimeout) {
            clearTimeout(this.aiMoveTimeout);
            this.aiMoveTimeout = null;
        }
    }

    /**
     * Initialize a new game
     */
    initGame() {
        this.playerMoves = { 'X': [], 'O': [] };
        this.gameActive = true;
        this.currentPlayer = this.nextStarter;
        this.nextStarter = this.nextStarter === 'X' ? 'O' : 'X';
        this.winningCombination = null;
        this.loopStates.clear();
        this.enableSafeStrategy = false;
        this.stateHistory = [];
        
        this.clearTimers();

        this.ui.statusElem.style.order = '0';
        this.ui.timerElem.style.order = '1';
        this.ui.updateStatus();
        this.startTurnTimer();

        // For multiplayer, update the initial game state
        if (this.gameMode === 'multiplayer' && this.multiplayer.isHost) {
            this.multiplayer.updateGameState(null);
        } else if (this.gameMode === 'ai' && this.currentPlayer === 'O') {
            this.aiMoveTimeout = setTimeout(() => this.makeAIMove(), 500);
        }
    }

    /**
     * Start the timer for current turn
     */
    startTurnTimer() {
        if (this.turnTimeLimit > 0) {
            this.timeLeft = this.turnTimeLimit;
            this.ui.updateTimerDisplay();
            
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
            }
            
            this.countdownInterval = setInterval(() => {
                this.timeLeft--;
                this.ui.updateTimerDisplay();
                
                if (this.timeLeft <= 0) {
                    clearInterval(this.countdownInterval);
                    this.handleTimeOut();
                }
            }, 1000);
        } else {
            this.ui.timerElem.textContent = '';
        }
    }

    /**
     * Handle when time runs out
     */
    handleTimeOut() {
        if (!this.gameActive) return;
        this.gameActive = false;
        
        const winner = this.currentPlayer === 'X' ? 'O' : 'X';
        
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        
        setTimeout(() => {
            this.scores[winner]++;
            this.ui.renderScoresWithAnimation(winner);
            
            if (this.scoreLimit > 0 && this.scores[winner] >= this.scoreLimit) {
                this.ui.showGameEnd(`${winner} Wins the Match!`);
            } else {
                setTimeout(() => {
                    this.ui.initBoard();
                    this.initGame();
                }, 1000);
            }
        }, 1000);
    }

    /**
     * Make a move on the board
     * 
     * @param {number} index - Board position to make move on (0-8)
     */
    makeMove(index) {
        if (!this.gameActive) return;
        
        const cell = this.ui.boardElem.children[index];
        if (cell.textContent) return;
        
        // For multiplayer, only allow moves on player's turn
        if (this.gameMode === 'multiplayer') {
            const isPlayerTurn = this.multiplayer.isPlayerTurn(this.currentPlayer);
            if (!isPlayerTurn || this.multiplayer.processingUpdate) {
                console.log('Not your turn or processing update, ignoring move');
                return;
            }
            
            console.log('Making multiplayer move as', this.currentPlayer, 'at position', index);
        }

        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }

        this.ui.removeDimHighlights();

        // Add the move to the board
        cell.textContent = this.currentPlayer;
        cell.classList.add(this.currentPlayer.toLowerCase(), 'mark-animation');
        
        // Ensure playerMoves arrays exist
        if (!this.playerMoves[this.currentPlayer]) {
            this.playerMoves[this.currentPlayer] = [];
        }
        
        // Add move to the player's moves
        this.playerMoves[this.currentPlayer].push(index);
        
        console.log('Move added for', this.currentPlayer, 'at', index, 'total moves:', JSON.stringify(this.playerMoves));

        // Remove oldest move if player has more than 3 marks
        if (this.playerMoves[this.currentPlayer].length > 3) {
            const oldestMove = this.playerMoves[this.currentPlayer].shift();
            const oldCell = this.ui.boardElem.children[oldestMove];
            oldCell.textContent = '';
            oldCell.classList.remove('x', 'o', 'mark-animation', 'dim');
        }

        // Check for a win
        const winResult = this.checkWin(this.playerMoves[this.currentPlayer]);
        if (winResult.hasWon) {
            this.winningCombination = winResult.combination;
            
            // If multiplayer and this is a winning move, send update IMMEDIATELY
            if (this.gameMode === 'multiplayer') {
                console.log('Sending winning move to opponent immediately');
                this.sentWinUpdate = true; // Set flag to avoid duplicate updates
                
                // Determine if this win reaches the score limit
                const matchEnded = this.scoreLimit > 0 && (this.scores[this.currentPlayer] + 1) >= this.scoreLimit;
                
                // Send update with match end information if needed
                this.multiplayer.updateGameState(index, matchEnded, this.currentPlayer);
            }
            
            this.handleWin();
            return;
        }

        // Switch players
        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.ui.updateStatus();
        this.startTurnTimer();
        this.ui.updateNextRemoval();

        // If multiplayer, update the game state
        if (this.gameMode === 'multiplayer') {
            console.log('Sending move to opponent, new state:', JSON.stringify(this.playerMoves));
            
            // Send regular move updates without delay
            this.multiplayer.updateGameState(index);
        } else if (this.gameMode === 'ai' && this.currentPlayer === 'O' && this.gameActive) {
            this.aiMoveTimeout = setTimeout(() => this.makeAIMove(), 500);
        }
    }

    /**
     * Make an AI move
     */
    makeAIMove() {
        if (!this.gameActive || !this.ui.boardElem.children.length) return;
        
        // Check for loop conditions
        if (this.playerMoves['O'].length >= 3 && !this.enableSafeStrategy) {
            const currentState = this.getBoardState();
            const stateCount = this.loopStates.get(currentState) || 0;
            this.loopStates.set(currentState, stateCount + 1);
            
            if (stateCount >= 2) {
                this.handleDraw();
                return;
            }
        }

        // Get AI move
        const move = AI.makeMove(
            this.playerMoves['X'], 
            this.playerMoves['O'], 
            this.aiDifficulty
        );

        if (move !== null && this.gameActive) {
            this.makeMove(move);
        }
    }

    /**
     * Get the current board state as a string (for loop detection)
     * 
     * @returns {string} String representation of current board state
     */
    getBoardState() {
        return [
            [...this.playerMoves['X']].sort().toString(),
            [...this.playerMoves['O']].sort().toString()
        ].join('|');
    }

    /**
     * Check if a player has won with their current moves
     * 
     * @param {Array} moves - Array of move indices to check
     * @returns {Object} Object with hasWon flag and winning combination
     */
    checkWin(moves) {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];
        for (const pattern of winPatterns) {
            if (pattern.every(pos => moves.includes(pos))) {
                return { hasWon: true, combination: pattern };
            }
        }
        return { hasWon: false, combination: null };
    }

    /**
     * Handle a win
     */
    handleWin() {
        this.gameActive = false;
        this.ui.highlightWinningCells(this.winningCombination);
        
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        
        setTimeout(() => {
            const winner = this.currentPlayer;
            
            // In multiplayer mode, if we already sent the win update in makeMove,
            // the score was already incremented in updateGameState(), so don't increment again
            // Otherwise, increment the score here
            if (!(this.gameMode === 'multiplayer' && this.sentWinUpdate)) {
                this.scores[winner]++;
            }
            
            this.ui.renderScoresWithAnimation(winner);
            
            // Check if game should end due to score limit
            const matchEnded = this.scoreLimit > 0 && this.scores[winner] >= this.scoreLimit;
            
            // If multiplayer, update the game state with the win
            // (Only if we haven't already sent the update in makeMove)
            if (this.gameMode === 'multiplayer' && !this.sentWinUpdate) {
                // Update game state to include win information
                this.multiplayer.updateGameState(null, matchEnded, winner);
                
                // Check for game end
                if (matchEnded) {
                    // Reset play again choices before showing game end screen
                    this.multiplayer.resetPlayAgainChoices();
                    this.ui.showGameEnd(`${winner} Wins the Match!`);
                } else {
                    // Use multiplayer reset mechanism
                    this.multiplayer.scheduleGameReset();
                }
            } else if (this.gameMode === 'multiplayer') {
                // We already sent the update in makeMove, just handle the game end check
                if (matchEnded) {
                    // Reset play again choices before showing game end screen
                    this.multiplayer.resetPlayAgainChoices();
                    this.ui.showGameEnd(`${winner} Wins the Match!`);
                } else {
                    // Use multiplayer reset mechanism
                    this.multiplayer.scheduleGameReset();
                }
            } else {
                // For local games
                if (matchEnded) {
                    this.ui.showGameEnd(`${winner} Wins the Match!`);
                } else {
                    setTimeout(() => {
                        this.ui.initBoard();
                        this.initGame();
                    }, 1000);
                }
            }
            
            // Reset flag after handling win
            this.sentWinUpdate = false;
        }, 1000);
    }

    /**
     * Handle a draw
     */
    handleDraw() {
        this.gameActive = false;
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        this.ui.showDrawState();

        setTimeout(() => {
            this.ui.initBoard();
            this.initGame();
        }, 1000);
    }
} 