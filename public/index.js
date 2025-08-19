class AdventureManager {
    constructor() {
        this.adventures = [];
        this.currentAdventure = null;
        this.init();
    }

    async init() {
        await this.loadAdventures();
        this.setupEventListeners();
        this.checkJsonFiles();
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

        // Download buttons
        document.getElementById('downloadSpellsBtn').addEventListener('click', () => {
            this.downloadJsonData('spells');
        });

        document.getElementById('downloadMonstersBtn').addEventListener('click', () => {
            this.downloadJsonData('monsters');
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

    async downloadJsonData(type) {
        const urlInput = document.getElementById(`${type}Url`);
        const statusDiv = document.getElementById(`${type}Status`);
        const downloadBtn = document.getElementById(`download${type.charAt(0).toUpperCase() + type.slice(1)}Btn`);
        
        const url = urlInput.value.trim();
        if (!url) {
            this.updateDownloadStatus(statusDiv, 'Please enter a valid URL', 'error');
            return;
        }

        // Update UI to show loading
        this.updateDownloadStatus(statusDiv, 'Downloading...', 'loading');
        downloadBtn.disabled = true;

        try {
            // For GitHub Gists, we need to get the raw content
            let downloadUrl = url;
            if (url.includes('gist.github.com')) {
                // Convert gist URL to raw URL
                const gistId = url.split('/').pop();
                downloadUrl = `https://gist.githubusercontent.com/dmcb/${gistId}/raw/srd-5.2-spells.json`;
                if (type === 'monsters') {
                    downloadUrl = `https://gist.githubusercontent.com/tkfu/${gistId}/raw/srd_5e_monsters.json`;
                }
            }

            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.text();
            
            // Validate that it's JSON
            try {
                JSON.parse(data);
            } catch (e) {
                throw new Error('Invalid JSON data received');
            }

            // Save to localStorage
            localStorage.setItem(`${type}Data`, data);
            localStorage.setItem(`${type}DownloadDate`, new Date().toISOString());

            this.updateDownloadStatus(statusDiv, `${type.charAt(0).toUpperCase() + type.slice(1)} data downloaded successfully!`, 'success');
            
            // Check if both files are downloaded and hide the section
            this.checkJsonFiles();

        } catch (error) {
            console.error(`Error downloading ${type} data:`, error);
            this.updateDownloadStatus(statusDiv, `Failed to download: ${error.message}`, 'error');
        } finally {
            downloadBtn.disabled = false;
        }
    }

    updateDownloadStatus(statusDiv, message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `download-status ${type}`;
    }

    checkJsonFiles() {
        const spellsData = localStorage.getItem('spellsData');
        const monstersData = localStorage.getItem('monstersData');
        const downloadSection = document.getElementById('jsonDownloadSection');

        // Update status displays
        if (spellsData) {
            const downloadDate = localStorage.getItem('spellsDownloadDate');
            const date = new Date(downloadDate).toLocaleDateString();
            this.updateDownloadStatus(
                document.getElementById('spellsStatus'),
                `Downloaded on ${date}`,
                'success'
            );
        }

        if (monstersData) {
            const downloadDate = localStorage.getItem('monstersDownloadDate');
            const date = new Date(downloadDate).toLocaleDateString();
            this.updateDownloadStatus(
                document.getElementById('monstersStatus'),
                `Downloaded on ${date}`,
                'success'
            );
        }

        // Hide the entire download section if both files are downloaded
        if (spellsData && monstersData) {
            downloadSection.style.display = 'none';
        }
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
