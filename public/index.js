class AdventureManager {
    constructor() {
        this.adventures = [];
        this.currentAdventure = null;
        this.init();
    }

    async init() {
        await this.loadAdventures();
        this.setupEventListeners();
    }

    async loadAdventures() {
        try {
            const response = await fetch('/api/adventures');
            if (response.ok) {
                this.adventures = await response.json();
                this.renderAdventureList();
            } else {
                console.error('Failed to load adventures');
                this.showError('Failed to load adventures');
            }
        } catch (error) {
            console.error('Error loading adventures:', error);
            this.showError('Error loading adventures');
        }
    }

    renderAdventureList() {
        const adventureList = document.getElementById('adventureList');
        
        if (this.adventures.length === 0) {
            adventureList.innerHTML = `
                <div class="no-adventures">
                    <i class="fas fa-book-dead"></i>
                    <p>No adventures found. Create your first adventure to get started!</p>
                </div>
            `;
            return;
        }

        adventureList.innerHTML = this.adventures.map(adventure => `
            <div class="adventure-item" data-adventure-id="${adventure.id}">
                <div class="adventure-info">
                    <div class="adventure-header">
                        <h3>${adventure.name}</h3>
                        ${adventure.password ? '<i class="fas fa-lock" title="Password Protected"></i>' : ''}
                    </div>
                    ${adventure.description ? `<p class="adventure-description">${adventure.description}</p>` : ''}
                    <p class="adventure-meta">
                        <i class="fas fa-calendar"></i> Created: ${new Date(adventure.created).toLocaleDateString()}
                    </p>
                </div>
                <div class="adventure-actions">
                    <button class="btn btn-primary" onclick="adventureManager.accessAdventure('${adventure.id}')">
                        <i class="fas fa-play"></i> Open
                    </button>
                    <button class="btn btn-secondary" onclick="adventureManager.openPlayerView('${adventure.id}')">
                        <i class="fas fa-eye"></i> Player View
                    </button>
                    <button class="btn btn-danger" onclick="adventureManager.deleteAdventure('${adventure.id}', '${adventure.name}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    async createAdventure() {
        const name = document.getElementById('adventureName').value.trim();
        const description = document.getElementById('adventureDescription').value.trim();
        const password = document.getElementById('adventurePassword').value;

        if (!name) {
            this.showError('Adventure name is required');
            return;
        }

        try {
            const response = await fetch('/api/adventures', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, description, password })
            });

            if (response.ok) {
                const newAdventure = await response.json();
                this.adventures.push(newAdventure);
                this.renderAdventureList();
                this.clearCreateForm();
                this.showSuccess(`Adventure "${name}" created successfully!`);
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to create adventure');
            }
        } catch (error) {
            console.error('Error creating adventure:', error);
            this.showError('Error creating adventure');
        }
    }

    async accessAdventure(adventureId) {
        const adventure = this.adventures.find(a => a.id === adventureId);
        if (!adventure) return;

        if (adventure.password) {
            this.currentAdventure = adventure;
            this.showAdventureAccessModal();
        } else {
            window.location.href = `/adventure/${adventureId}/dm`;
        }
    }

    async verifyAdventureAccess() {
        const password = document.getElementById('accessPassword').value;
        const adventure = this.currentAdventure;

        if (!adventure) return;

        try {
            const response = await fetch(`/api/adventures/${adventure.id}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });

            if (response.ok) {
                this.closeAdventureAccessModal();
                window.location.href = `/adventure/${adventure.id}/dm`;
            } else {
                const error = await response.json();
                this.showError(error.error || 'Invalid password');
            }
        } catch (error) {
            console.error('Error verifying access:', error);
            this.showError('Error verifying access');
        }
    }

    openPlayerView(adventureId) {
        window.open(`/adventure/${adventureId}/player`, '_blank');
    }

    async deleteAdventure(adventureId, adventureName) {
        const adventure = this.adventures.find(a => a.id === adventureId);
        if (!adventure) return;

        this.currentAdventure = adventure;
        document.getElementById('deleteAdventureName').textContent = adventureName;
        
        const passwordSection = document.getElementById('deletePasswordSection');
        if (adventure.password) {
            passwordSection.style.display = 'block';
        } else {
            passwordSection.style.display = 'none';
        }
        
        this.showDeleteAdventureModal();
    }

    async confirmDeleteAdventure() {
        const adventure = this.currentAdventure;
        if (!adventure) return;

        const password = document.getElementById('deletePassword').value;
        
        try {
            const response = await fetch(`/api/adventures/${adventure.id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });

            if (response.ok) {
                this.adventures = this.adventures.filter(a => a.id !== adventure.id);
                this.renderAdventureList();
                this.closeDeleteAdventureModal();
                this.showSuccess(`Adventure "${adventure.name}" deleted successfully!`);
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to delete adventure');
            }
        } catch (error) {
            console.error('Error deleting adventure:', error);
            this.showError('Error deleting adventure');
        }
    }

    showAdventureAccessModal() {
        document.getElementById('adventureAccessModal').style.display = 'block';
        document.getElementById('accessPassword').value = '';
        document.getElementById('accessPassword').focus();
    }

    closeAdventureAccessModal() {
        document.getElementById('adventureAccessModal').style.display = 'none';
        this.currentAdventure = null;
    }

    showDeleteAdventureModal() {
        document.getElementById('deleteAdventureModal').style.display = 'block';
        document.getElementById('deletePassword').value = '';
    }

    closeDeleteAdventureModal() {
        document.getElementById('deleteAdventureModal').style.display = 'none';
        this.currentAdventure = null;
    }

    clearCreateForm() {
        document.getElementById('adventureName').value = '';
        document.getElementById('adventureDescription').value = '';
        document.getElementById('adventurePassword').value = '';
    }

    setupEventListeners() {
        // Create adventure button
        document.getElementById('createAdventureBtn').addEventListener('click', () => {
            this.createAdventure();
        });

        // Enter key in create form
        document.getElementById('adventureName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createAdventure();
            }
        });

        // Modal close buttons
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    modal.style.display = 'none';
                }
            });
        });

        // Click outside modal to close
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });

        // Enter key in password fields
        document.getElementById('accessPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.verifyAdventureAccess();
            }
        });

        document.getElementById('deletePassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.confirmDeleteAdventure();
            }
        });
    }

    showError(message) {
        // Simple error display - you could enhance this with a proper notification system
        alert(`Error: ${message}`);
    }

    showSuccess(message) {
        // Simple success display - you could enhance this with a proper notification system
        alert(`Success: ${message}`);
    }
}

// Global functions for modal interactions
function closeAdventureAccessModal() {
    adventureManager.closeAdventureAccessModal();
}

function verifyAdventureAccess() {
    adventureManager.verifyAdventureAccess();
}

function closeDeleteAdventureModal() {
    adventureManager.closeDeleteAdventureModal();
}

function confirmDeleteAdventure() {
    adventureManager.confirmDeleteAdventure();
}

// Initialize the adventure manager when the page loads
let adventureManager;
document.addEventListener('DOMContentLoaded', () => {
    adventureManager = new AdventureManager();
});
