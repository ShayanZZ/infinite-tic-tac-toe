/**
 * AI player module for Infinite Tic-Tac-Toe
 */
export default class AI {
    /**
     * Make an AI move based on the provided difficulty
     * 
     * @param {Array} playerMovesX - Current X player moves
     * @param {Array} playerMovesO - Current O player moves
     * @param {string} difficulty - AI difficulty (easy, medium, hard)
     * @returns {number|null} - The index to make the move on, or null if no valid move
     */
    static makeMove(playerMovesX, playerMovesO, difficulty) {
        // Reference to all player moves for calculations
        this.playerMoves = {
            'X': [...playerMovesX],
            'O': [...playerMovesO]
        };

        let move;
        switch(difficulty) {
            case 'easy':
                move = Math.random() < 0.5 ? this.getSmartMove(1) : this.getRandomMove();
                break;
            case 'medium':
                move = Math.random() < 0.8 ? this.getSmartMove(2) : this.getRandomMove();
                break;
            case 'hard':
                move = this.getSmartMove(3);
                break;
            default:
                move = this.getRandomMove();
        }

        return move;
    }

    /**
     * Get a smart move using AI strategy
     * 
     * @param {number} depth - The depth of evaluation
     * @returns {number|null} - The index to make the move on
     */
    static getSmartMove(depth) {
        const availableMoves = this.getEmptyCells();
        if (availableMoves.length === 0) return null;

        // Prioritize winning moves
        const winningMoves = availableMoves.filter(move => this.wouldWin('O', move));
        if (winningMoves.length > 0) {
            return winningMoves[Math.floor(Math.random() * winningMoves.length)];
        }

        // Prioritize blocking opponent's winning moves
        const blockingMoves = availableMoves.filter(move => this.wouldWin('X', move));
        if (blockingMoves.length > 0) {
            return blockingMoves[Math.floor(Math.random() * blockingMoves.length)];
        }

        // Use a simplified evaluation function for other moves
        const moveScores = new Map();
        let bestScore = -Infinity;

        for (const move of availableMoves) {
            const originalState = {
                'X': [...this.playerMoves['X']],
                'O': [...this.playerMoves['O']]
            };

            this.simulateMove('O', move);
            const score = this.evaluatePosition();
            this.undoMove('O', originalState['O']);

            moveScores.set(move, score);
            bestScore = Math.max(bestScore, score);
        }

        const bestMoves = [...moveScores.entries()]
            .filter(([_, score]) => score === bestScore)
            .map(([move, _]) => move);

        return bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    /**
     * Simulate making a move
     * 
     * @param {string} player - The player making the move ('X' or 'O')
     * @param {number} move - The index to make the move on
     */
    static simulateMove(player, move) {
        this.playerMoves[player].push(move);
        if (this.playerMoves[player].length > 3) {
            this.playerMoves[player].shift();
        }
    }

    /**
     * Undo a simulated move
     * 
     * @param {string} player - The player to undo the move for ('X' or 'O')
     * @param {Array} originalState - The original state to restore
     */
    static undoMove(player, originalState) {
        this.playerMoves[player] = [...originalState];
    }

    /**
     * Check if a move would result in a win
     * 
     * @param {string} player - The player to check for ('X' or 'O')
     * @param {number} move - The potential move
     * @returns {boolean} - True if the move would result in a win
     */
    static wouldWin(player, move) {
        const moves = [...this.playerMoves[player]];
        moves.push(move);
        if (moves.length > 3) moves.shift();
        
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];
        
        for (const pattern of winPatterns) {
            if (pattern.every(pos => moves.includes(pos))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Evaluate the current board position
     * 
     * @returns {number} - Score of the current position
     */
    static evaluatePosition() {
        let score = 0;
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];

        for (const pattern of winPatterns) {
            const oCount = pattern.filter(pos => this.playerMoves['O'].includes(pos)).length;
            const xCount = pattern.filter(pos => this.playerMoves['X'].includes(pos)).length;

            if (oCount > 0 && xCount === 0) {
                score += Math.pow(10, oCount);
            }
            if (xCount > 0 && oCount === 0) {
                score -= Math.pow(10, xCount);
            }
        }

        const centerBonus = 5;
        const cornerBonus = 3;
        const corners = [0, 2, 6, 8];

        if (this.playerMoves['O'].includes(4)) score += centerBonus;
        if (this.playerMoves['X'].includes(4)) score -= centerBonus;

        for (const corner of corners) {
            if (this.playerMoves['O'].includes(corner)) score += cornerBonus;
            if (this.playerMoves['X'].includes(corner)) score -= cornerBonus;
        }
        return score;
    }

    /**
     * Get a random valid move
     * 
     * @returns {number|null} - A random valid move index or null if no valid moves
     */
    static getRandomMove() {
        const emptyCells = this.getEmptyCells();
        if (emptyCells.length === 0) return null;
        return emptyCells[Math.floor(Math.random() * emptyCells.length)];
    }

    /**
     * Get all empty cells on the board
     * 
     * @returns {Array} - Array of empty cell indices
     */
    static getEmptyCells() {
        const boardCells = document.querySelectorAll('.cell');
        const emptyCells = [];
        
        for (let i = 0; i < 9; i++) {
            if (!boardCells[i].textContent) {
                emptyCells.push(i);
            }
        }
        return emptyCells;
    }
} 