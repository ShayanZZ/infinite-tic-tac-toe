import ThemeManager from './modules/theme.js';
import Game from './modules/game.js';
import UI from './modules/ui.js';
import Multiplayer from './modules/multiplayer.js';

/**
 * Initialize the Infinite Tic-Tac-Toe game when DOM is ready
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Create a circular reference to connect Game and UI
    const game = new Game();
    const ui = new UI(game);
    game.ui = ui;
    
    // Initialize theme manager
    new ThemeManager();
}); 