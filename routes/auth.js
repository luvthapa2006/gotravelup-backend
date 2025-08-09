// =============================
//  GoTravelUp Authentication
// =============================

// Set your backend API base URL here
const API_BASE = 'https://gotravelup-backend.onrender.com';

// Class to manage authentication
class AuthManager {
    constructor() {
        this.signupForm = document.getElementById('signupForm');
        this.loginForm = document.getElementById('loginForm');
        this.referralInput = document.getElementById('referralCode');

        this.init();
    }

    init() {
        if (this.signupForm) {
            this.signupForm.addEventListener('submit', (e) => this.handleSignup(e));
        }

        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        if (this.referralInput) {
            this.referralInput.addEventListener('blur', () => this.validateReferralCode());
        }

        this.checkAuthStatus();
    }

    async handleSignup(event) {
        event.preventDefault();

        const formData = new FormData(this.signupForm);
        const data = Object.fromEntries(formData.entries());

        // Basic validation
        if (!data.username || !data.password || !data.email) {
            alert('Please fill in all required fields.');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                credentials: 'include'
            });

            const result = await res.json();

            if (res.ok) {
                alert('✅ Registration successful! Please log in.');
                window.location.href = 'index.html';
            } else {
                alert(`❌ ${result.message || 'Registration failed.'}`);
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Error connecting to server.');
        }
    }

    async handleLogin(event) {
        event.preventDefault();

        const formData = new FormData(this.loginForm);
        const data = Object.fromEntries(formData.entries());

        if (!data.username || !data.password) {
            alert('Please enter both username and password.');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                credentials: 'include'
            });

            const result = await res.json();

            if (res.ok) {
                alert('✅ Login successful!');
                window.location.href = 'dashboard.html';
            } else {
                alert(`❌ ${result.message || 'Login failed.'}`);
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Error connecting to server.');
        }
    }

    async validateReferralCode() {
        const code = this.referralInput.value.trim();
        if (!code) return;

        try {
            const res = await fetch(`${API_BASE}/api/validate-referral`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ referralCode: code }),
                credentials: 'include'
            });

            const result = await res.json();

            if (res.ok) {
                alert('✅ Referral code is valid!');
            } else {
                alert(`❌ ${result.message || 'Invalid referral code.'}`);
            }
        } catch (error) {
            console.error('Referral validation error:', error);
        }
    }

    async checkAuthStatus() {
        try {
            const res = await fetch(`${API_BASE}/api/profile`, {
                method: 'GET',
                credentials: 'include'
            });

            if (res.ok) {
                console.log('User is logged in.');
            } else {
                console.log('User is not logged in.');
            }
        } catch (error) {
            console.error('Auth check error:', error);
        }
    }
}

// Initialize the AuthManager
document.addEventListener('DOMContentLoaded', () => {
    new AuthManager();
});
        