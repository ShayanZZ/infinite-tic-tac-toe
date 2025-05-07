/**
 * UI module for Infinite Tic-Tac-Toe
 */
export default class UI {
    constructor(game) {
        this.game = game;
        
        // UI Elements
        this.setupDiv = document.getElementById('game-setup');
        this.mainContainer = document.getElementById('mainContainer');
        this.boardElem = document.getElementById('board');
        this.statusElem = document.getElementById('status');
        this.scoreboardElem = document.getElementById('scoreboard');
        this.timerElem = document.getElementById('timer');
        this.gameEndOverlay = document.getElementById('gameEndOverlay');
        this.winnerText = document.getElementById('winnerText');
        this.aiDifficultyRow = document.getElementById('aiDifficultyRow');
        this.multiplayerOptionsRow = document.getElementById('multiplayerOptionsRow');

        this.backButton = document.getElementById('back-button');
        this.backButton.querySelector('.material-symbols-rounded').textContent = 'logout';
        
        this.confirmOverlay = document.getElementById('backConfirmOverlay');
        this.confirmYesBtn = document.getElementById('backConfirmYesBtn');
        this.confirmNoBtn = document.getElementById('backConfirmNoBtn');
        
        // Multiplayer elements
        this.joinRoomOverlay = document.getElementById('joinRoomOverlay');
        this.hostRoomOverlay = document.getElementById('hostRoomOverlay');
        this.roomCodeDisplay = document.getElementById('roomCodeDisplay');
        this.roomCodeInput = document.getElementById('roomCodeInput');
        this.joinRoomBtn = document.getElementById('joinRoomBtn');
        this.hostBackBtn = document.getElementById('hostBackBtn');
        this.joinBackBtn = document.getElementById('joinBackBtn');
        
        this.init();
    }

    /**
     * Initialize UI components
     */
    init() {
        this.initBackButton();
        this.initConfirmButtons();
        this.initSetup();
        this.initGameEndButtons();
        
        this.aiDifficultyRow.classList.add('visible');
    }

    /**
     * Initialize back button functionality
     */
    initBackButton() {
        this.backButton.addEventListener('click', () => {
            const isInGame = (this.mainContainer.style.display === 'flex');
            if (isInGame) {
                this.showConfirmOverlay('Return to menu?', this.backConfirmAction.bind(this));
            } else {
                this.showConfirmOverlay('Quit the game?', this.quitConfirmAction.bind(this));
            }
        });
    }

    /**
     * Initialize confirmation buttons
     */
    initConfirmButtons() {
        this.confirmYesBtn.addEventListener('click', () => {
            if (this.confirmAction) {
                this.confirmAction();
            }
            this.hideConfirmOverlay();
        });
        
        this.confirmNoBtn.addEventListener('click', () => {
            this.hideConfirmOverlay();
        });
    }

    /**
     * Action for confirming back to menu
     */
    backConfirmAction() {
        this.game.clearTimers();

        // If in multiplayer mode, leave the room
        if (this.game.gameMode === 'multiplayer') {
            this.game.multiplayer.leaveRoom();
        }

        const icon = this.backButton.querySelector('.material-symbols-rounded');
        icon.style.opacity = '0';
        icon.style.transform = 'scale(0.9)';
        
        setTimeout(() => {
            // Force a complete game reset
            this.game.playerMoves = { 'X': [], 'O': [] };
            this.game.currentPlayer = 'X';
            this.game.scores = { 'X': 0, 'O': 0 };
            this.game.gameActive = true;
            this.game.winningCombination = null;
            
            this.mainContainer.style.display = 'none';
            this.setupDiv.style.display = 'flex';
            icon.textContent = 'logout';
            
            requestAnimationFrame(() => {
                icon.style.opacity = '1';
                icon.style.transform = 'scale(1)';
            });
            
            // Make sure the board is properly cleared for the next game
            this.initBoard();
            this.renderScores();
        }, 150);
    }

    /**
     * Action for confirming quit
     */
    quitConfirmAction() {
        window.location.href = 'about:blank';
        window.close();
    }

    /**
     * Show confirmation overlay
     * 
     * @param {string} message - Message to display
     * @param {Function} action - Action to perform on confirmation
     */
    showConfirmOverlay(message, action) {
        const textElem = document.getElementById('backConfirmText');
        textElem.textContent = message;
        this.confirmAction = action;

        this.confirmOverlay.style.display = 'flex';
        setTimeout(() => this.confirmOverlay.classList.add('visible'), 10);
    }

    /**
     * Hide confirmation overlay
     */
    hideConfirmOverlay() {
        this.confirmOverlay.classList.remove('visible');
        setTimeout(() => {
            this.confirmOverlay.style.display = 'none';
        }, 300);
    }

    /**
     * Initialize game setup UI
     */
    initSetup() {
        const modeButtons = document.querySelectorAll('[data-mode]');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modeButtons.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.game.gameMode = btn.dataset.mode;
                
                if (this.game.gameMode === 'ai') {
                    this.aiDifficultyRow.classList.add('visible');
                    this.multiplayerOptionsRow.classList.remove('visible');
                } else if (this.game.gameMode === 'multiplayer') {
                    this.aiDifficultyRow.classList.remove('visible');
                    this.multiplayerOptionsRow.classList.add('visible');
                } else {
                    this.aiDifficultyRow.classList.remove('visible');
                    this.multiplayerOptionsRow.classList.remove('visible');
                }
            });
        });

        const difficultyButtons = document.querySelectorAll('[data-difficulty]');
        difficultyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                difficultyButtons.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.game.aiDifficulty = btn.dataset.difficulty;
            });
        });

        const highlightButtons = document.querySelectorAll('[data-highlight]');
        highlightButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                highlightButtons.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.game.highlightRemoval = btn.dataset.highlight === 'true';
            });
        });

        const roundsSlider = document.getElementById('roundsSlider');
        const roundsVal = document.getElementById('roundsVal');
        roundsSlider.addEventListener('input', () => {
            const val = Number(roundsSlider.value);
            this.game.scoreLimit = val;
            roundsVal.textContent = val === 0 ? '∞' : val;
        });

        const timeSlider = document.getElementById('timeSlider');
        const timeVal = document.getElementById('timeVal');
        timeSlider.addEventListener('input', () => {
            const val = Number(timeSlider.value);
            this.game.turnTimeLimit = val;
            timeVal.textContent = val === 0 ? 'Off' : `${val}s`;
        });

        document.getElementById('startBtn').addEventListener('click', () => {
            // For multiplayer, show host/join options instead of starting immediately
            if (this.game.gameMode === 'multiplayer') {
                // We don't start the game immediately for multiplayer
                return;
            }
            this.startGame();
        });
        
        // Initialize multiplayer controls
        this.initMultiplayerControls();
    }

    /**
     * Initialize multiplayer UI controls
     */
    initMultiplayerControls() {
        // Host button
        document.getElementById('hostBtn').addEventListener('click', async () => {
            try {
                // Reset any existing game state
                this.game.playerMoves = { 'X': [], 'O': [] };
                this.game.currentPlayer = 'X';
                this.game.gameActive = true;
                this.game.winningCombination = null;
                
                const roomCode = await this.game.multiplayer.createRoom();
                this.roomCodeDisplay.textContent = roomCode;
                this.showHostRoomOverlay();
            } catch (error) {
                console.error('Error hosting room:', error);
                this.showAlert('Failed to create room. Please try again.');
            }
        });
        
        // Join button
        document.getElementById('joinBtn').addEventListener('click', () => {
            // Reset any existing game state
            this.game.playerMoves = { 'X': [], 'O': [] };
            this.game.currentPlayer = 'X';
            this.game.gameActive = true;
            this.game.winningCombination = null;
            
            this.showJoinRoomOverlay();
        });
        
        // Host back button
        this.hostBackBtn.addEventListener('click', () => {
            this.game.multiplayer.leaveRoom();
            this.hideHostRoomOverlay();
        });
        
        // Join back button
        this.joinBackBtn.addEventListener('click', () => {
            this.hideJoinRoomOverlay();
        });
        
        // Join room button
        this.joinRoomBtn.addEventListener('click', async () => {
            const roomCode = this.roomCodeInput.value.trim();
            if (!roomCode || roomCode.length !== 4 || isNaN(roomCode)) {
                this.showAlert('Please enter a valid 4-digit room code.');
                return;
            }
            
            try {
                await this.game.multiplayer.joinRoom(roomCode);
                this.hideJoinRoomOverlay();
                
                // Initialize the game board with the current state
                this.startGame();
                
                // Initialize board with existing moves if any
                this.initBoard();
                this.game.multiplayer.renderPlayerMoves();
                this.updateStatus();
                this.renderScores();
                
                // Force a full refresh of game state
                setTimeout(() => {
                    this.game.multiplayer.fetchCurrentState();
                }, 500);
            } catch (error) {
                console.error('Error joining room:', error);
                this.showAlert('Failed to join room. Please check the room code and try again.');
            }
        });
    }
    
    /**
     * Show the host room overlay with the room code
     */
    showHostRoomOverlay() {
        this.hostRoomOverlay.style.display = 'flex';
        setTimeout(() => this.hostRoomOverlay.classList.add('visible'), 10);
    }
    
    /**
     * Hide the host room overlay
     */
    hideHostRoomOverlay() {
        this.hostRoomOverlay.classList.remove('visible');
        setTimeout(() => {
            this.hostRoomOverlay.style.display = 'none';
        }, 300);
    }
    
    /**
     * Show the join room overlay
     */
    showJoinRoomOverlay() {
        this.joinRoomOverlay.style.display = 'flex';
        setTimeout(() => this.joinRoomOverlay.classList.add('visible'), 10);
        this.roomCodeInput.focus();
    }
    
    /**
     * Hide the join room overlay
     */
    hideJoinRoomOverlay() {
        this.joinRoomOverlay.classList.remove('visible');
        setTimeout(() => {
            this.joinRoomOverlay.style.display = 'none';
        }, 300);
    }
    
    /**
     * Show an alert message
     * @param {string} message - The message to display
     */
    showAlert(message) {
        alert(message);
    }

    /**
     * Start the game, switching from setup to game UI
     */
    startGame() {
        // Clear any pending AI moves
        this.game.clearTimers();
        
        // Force a complete game reset
        this.game.scores = { 'X': 0, 'O': 0 };
        this.renderScores();
        
        // Reset player moves and turn state
        if (this.game.gameMode !== 'multiplayer' || !this.game.multiplayer.roomCode) {
            // For new games (not existing multiplayer sessions)
            this.game.playerMoves = { 'X': [], 'O': [] };
            this.game.currentPlayer = 'X';
            this.game.gameActive = true;
            this.game.winningCombination = null;
        }
        
        const icon = this.backButton.querySelector('.material-symbols-rounded');
        icon.style.opacity = '0';
        icon.style.transform = 'scale(0.9)';
        
        setTimeout(() => {
            this.setupDiv.style.display = 'none';
            this.mainContainer.style.display = 'flex';
            
            icon.textContent = 'arrow_back';
            
            requestAnimationFrame(() => {
                icon.style.opacity = '1';
                icon.style.transform = 'scale(1)';
            });
            
            // Initialize the game board
            this.initBoard();
            this.game.initGame();
            
            // Only show "waiting" if we're hosting and don't have a guest yet
            if (this.game.gameMode === 'multiplayer' && this.game.multiplayer.isHost) {
                // Check if the host room overlay is still visible (meaning we're waiting for an opponent)
                const hostRoomOverlay = document.getElementById('hostRoomOverlay');
                if (hostRoomOverlay.style.display === 'none') {
                    // If overlay is hidden, the game is ready to play - don't show waiting message
                } else {
                    // If overlay is visible, we're still waiting for opponent
                    this.statusElem.textContent = 'Waiting for opponent...';
                }
            }
            
            // Ensure we update status to show the correct turn
            this.updateStatus();
        }, 150);
    }

    /**
     * Initialize the game board
     */
    initBoard() {
        // Make sure any winning combination is cleared
        if (this.game.winningCombination) {
            this.game.winningCombination = null;
        }
        
        // First clear any existing cells and their classes
        if (this.boardElem.children.length > 0) {
            Array.from(this.boardElem.children).forEach(cell => {
                cell.classList.remove('winning', 'mark-animation', 'dim', 'draw', 'x', 'o');
                cell.textContent = '';
            });
        }
        
        // Then create new cells or reset if needed
        this.boardElem.innerHTML = '';
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
            
            this.boardElem.appendChild(cell);
        }
    }

    /**
     * Initialize end-game buttons
     */
    initGameEndButtons() {
        document.getElementById('playAgainBtn').addEventListener('click', () => {
            // Handle multiplayer play again differently
            if (this.game.gameMode === 'multiplayer') {
                // Tell the other player we want to play again
                const bothPlayersReady = this.game.multiplayer.handlePlayAgain();
                
                if (!bothPlayersReady) {
                    // Update the play again button text to show waiting
                    const playAgainBtn = document.getElementById('playAgainBtn');
                    playAgainBtn.textContent = 'Waiting for opponent...';
                    playAgainBtn.disabled = true;
                } else {
                    // Both players ready, hide overlay and start new game
                    this.hideGameEndOverlay();
                }
            } else {
                // For local games, just start a new game immediately
                this.hideGameEndOverlay(() => {
                    // Reset scores for a new game
                    this.game.scores = { 'X': 0, 'O': 0 };
                    this.renderScores();
                    this.initBoard();
                    this.game.initGame();
                });
            }
        });
        
        document.getElementById('mainMenuBtn').addEventListener('click', () => {
            this.hideGameEndOverlay(() => {
                // If in multiplayer mode, leave the room
                if (this.game.gameMode === 'multiplayer') {
                    this.game.multiplayer.leaveRoom();
                }
                
                // Return to the main menu
                this.mainContainer.style.display = 'none';
                this.setupDiv.style.display = 'flex';
                
                const icon = this.backButton.querySelector('.material-symbols-rounded');
                icon.textContent = 'logout';
                
                this.game.resetGame();
                this.renderScores();
            });
        });
    }

    /**
     * Show game end overlay
     * 
     * @param {string} message - Message to display
     */
    showGameEnd(message) {
        if (message.includes('X')) {
            this.winnerText.innerHTML = '<span style="color: var(--x-color)">X</span> Wins the Match!';
        } else if (message.includes('O')) {
            this.winnerText.innerHTML = '<span style="color: var(--o-color)">O</span> Wins the Match!';
        } else if (message.includes('Opponent left')) {
            this.winnerText.innerHTML = '<span style="color: #ff5555;">Opponent left the game</span>';
            
            // If in multiplayer mode, disable Play Again button
            if (this.game.gameMode === 'multiplayer') {
                const playAgainBtn = document.getElementById('playAgainBtn');
                if (playAgainBtn) {
                    playAgainBtn.disabled = true;
                    playAgainBtn.textContent = 'Opponent Left';
                }
            }
        } else {
            this.winnerText.textContent = message;
        }
        
        // Reset Play Again button state in case it was previously disabled
        // Only if the opponent hasn't left
        if (!message.includes('Opponent left')) {
            const playAgainBtn = document.getElementById('playAgainBtn');
            if (playAgainBtn) {
                playAgainBtn.textContent = 'Play Again';
                playAgainBtn.disabled = false;
            }
        }
        
        // Check if the other player already chose "Play Again" before this overlay appeared
        if (this.game.gameMode === 'multiplayer' && this.game.multiplayer) {
            // Reset multiplayer play again choices when showing the game end overlay
            this.game.multiplayer.resetPlayAgainChoices();
            
            // If opponent already clicked "Play Again" while we were seeing the game end animation
            if (this.game.multiplayer.opponentWantsPlayAgain) {
                // Add a message indicating opponent wants to play again
                this.winnerText.innerHTML += '<br><span style="font-size: 0.9em; color: var(--text-color)">Opponent wants to play again</span>';
                // Reset the flag
                this.game.multiplayer.opponentWantsPlayAgain = false;
            }
        }
        
        this.gameEndOverlay.style.display = 'flex';
        setTimeout(() => this.gameEndOverlay.classList.add('visible'), 10);
        
        // For multiplayer games, fetch the latest state after a short delay
        // This ensures we see if the opponent already clicked "Play Again"
        if (this.game.gameMode === 'multiplayer' && this.game.multiplayer) {
            setTimeout(() => {
                this.game.multiplayer.fetchCurrentState();
            }, 500);
        }
    }

    /**
     * Hide game end overlay
     * 
     * @param {Function} callback - Function to call after hiding overlay
     */
    hideGameEndOverlay(callback) {
        this.gameEndOverlay.classList.remove('visible');
        
        // Reset the winner text and UI state
        setTimeout(() => {
            this.gameEndOverlay.style.display = 'none';
            
            // Reset Play Again button state
            const playAgainBtn = document.getElementById('playAgainBtn');
            if (playAgainBtn) {
                playAgainBtn.textContent = 'Play Again';
                playAgainBtn.disabled = false;
            }
            
            // Reset winner text to avoid lingering messages
            if (this.winnerText) {
                // Check if this was an "opponent left" message
                const wasOpponentLeft = this.winnerText.innerHTML.includes('Opponent left');
                
                // Store the original winner message without any additional text
                const originalMessage = this.winnerText.innerHTML.split('<br>')[0];
                this.winnerText.innerHTML = originalMessage;
                
                // If opponent left and we're going back to the game, ensure proper state
                if (wasOpponentLeft && !callback) {
                    // Force game to be inactive
                    this.game.gameActive = false;
                }
            }
            
            // Execute callback if provided
            if (callback) callback();
        }, 300);
    }

    /**
     * Update the status display
     */
    updateStatus() {
        if (!this.game) return;
        
        if (this.game.gameMode === 'multiplayer') {
            // Get player symbol based on host status
            const playerSymbol = this.game.multiplayer.isHost ? 'X' : 'O';
            
            // Determine if it's this player's turn
            const isMyTurn = (this.game.currentPlayer === playerSymbol);
            
            // Check if we're actually in a game state (not in host waiting room)
            // For the guest player, hostRoomOverlay is irrelevant, so we should always show the turn
            const hostRoomOverlay = document.getElementById('hostRoomOverlay');
            const isInGameState = !this.game.multiplayer.isHost || 
                                 (hostRoomOverlay && hostRoomOverlay.style.display === 'none');
            
            if (isInGameState) {
                // Set the status text based on whose turn it is
                this.statusElem.textContent = isMyTurn ? 'Your Turn' : 'Opponent\'s Turn';
                
                // Set color based on current player (X or O)
                this.statusElem.style.color =
                    this.game.currentPlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)';
                
                // Log the status update to help with debugging
                console.log(`Status updated: ${this.statusElem.textContent} (You are ${playerSymbol}, current player is ${this.game.currentPlayer})`);
            } else if (this.game.multiplayer.isHost) {
                // Only show waiting message for the host
                this.statusElem.textContent = 'Waiting for opponent...';
            }
        } else {
            // For single player or local multiplayer
            this.statusElem.textContent = `${this.game.currentPlayer}'s Turn`;
            
            // Set color based on current player
            this.statusElem.style.color =
                this.game.currentPlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)';
        }
    }

    /**
     * Update timer display
     */
    updateTimerDisplay() {
        this.timerElem.textContent = this.game.timeLeft > 0 ? this.game.timeLeft : '0';
        this.timerElem.style.color = this.game.currentPlayer === 'X' 
            ? 'var(--x-color)' 
            : 'var(--o-color)';
        
        if (this.game.timeLeft === 0) {
            this.timerElem.classList.add('flash');
        } else {
            this.timerElem.classList.remove('flash');
        }
    }

    /**
     * Render the current scores
     */
    renderScores() {
        const xScore = document.querySelector('.score-x');
        const oScore = document.querySelector('.score-o');
        xScore.textContent = this.game.scores['X'];
        oScore.textContent = this.game.scores['O'];
        xScore.classList.remove('score-animation');
        oScore.classList.remove('score-animation');
    }

    /**
     * Render scores with animation
     * 
     * @param {string} winner - The player who scored ('X' or 'O')
     */
    renderScoresWithAnimation(winner) {
        const xScore = document.querySelector('.score-x');
        const oScore = document.querySelector('.score-o');
        
        xScore.classList.remove('score-animation');
        oScore.classList.remove('score-animation');

        void xScore.offsetWidth;
        void oScore.offsetWidth;

        xScore.textContent = this.game.scores['X'];
        oScore.textContent = this.game.scores['O'];

        if (winner === 'X') {
            xScore.classList.add('score-animation');
        } else {
            oScore.classList.add('score-animation');
        }
    }

    /**
     * Update which cell to highlight for next removal
     */
    updateNextRemoval() {
        if (!this.game.highlightRemoval) return;
        const nextPlayer = this.game.currentPlayer;
        if (this.game.playerMoves[nextPlayer].length === 3) {
            const oldestMove = this.game.playerMoves[nextPlayer][0];
            const oldCell = this.boardElem.children[oldestMove];
            oldCell.classList.add('dim', nextPlayer.toLowerCase());
        }
    }

    /**
     * Highlight winning cells
     * 
     * @param {Array} winningCombination - Array of winning cell indices
     */
    highlightWinningCells(winningCombination) {
        if (winningCombination) {
            winningCombination.forEach(index => {
                this.boardElem.children[index].classList.add('winning');
            });
        }
    }

    /**
     * Set all cells to draw state
     */
    showDrawState() {
        Array.from(this.boardElem.children).forEach(cell => {
            if (cell.textContent) {
                cell.classList.add('draw');
            }
        });
    }

    /**
     * Remove dim highlight from all cells
     */
    removeDimHighlights() {
        Array.from(this.boardElem.children).forEach(cell => {
            cell.classList.remove('dim');
        });
    }
} 