/**
 * Theme management module for Infinite Tic-Tac-Toe
 */
export default class ThemeManager {
    constructor() {
        this.themeToggle = document.getElementById('theme-toggle');
        this.themeIcon = this.themeToggle.querySelector('.material-symbols-rounded');
        this.init();
    }

    /**
     * Initialize theme functionality
     */
    init() {
        this.loadTheme();
        this.initThemeToggle();
    }

    /**
     * Load saved theme from localStorage or use default
     */
    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (this.themeIcon) {
            this.themeIcon.textContent = savedTheme === 'dark' ? 'dark_mode' : 'light_mode';
        }
    }

    /**
     * Initialize theme toggle button functionality
     */
    initThemeToggle() {
        this.themeToggle.addEventListener('click', () => {
            const html = document.documentElement;
            const isDark = html.getAttribute('data-theme') === 'dark';
            const icon = this.themeIcon;
            
            icon.style.opacity = '0';
            icon.style.transform = 'scale(0.9)';
            
            setTimeout(() => {
                const newTheme = isDark ? 'light' : 'dark';
                html.setAttribute('data-theme', newTheme);
                icon.textContent = isDark ? 'light_mode' : 'dark_mode';
                localStorage.setItem('theme', newTheme);
                
                requestAnimationFrame(() => {
                    icon.style.opacity = '1';
                    icon.style.transform = 'scale(1)';
                });
            }, 150);
        });
    }
} 