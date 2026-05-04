/**
 * Route Analyzer — GPX Upload Tool
 * Handles drag-drop, file upload, API calls, and result rendering
 */

const GRADE_COLORS = {
    'A': 'var(--color-accent)',  // #FF4E50
    'B': '#D4732A',
    'C': '#D4A017',
    'D': '#6B8F4A',
    'E': '#4A7B6B',
    'F': 'var(--color-muted)',
};

class RouteAnalyzer {
    constructor() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.submitBtn = document.getElementById('submitBtn');
        this.loadingState = document.getElementById('loadingState');
        this.errorDisplay = document.getElementById('errorDisplay');
        this.errorMessage = document.getElementById('errorMessage');
        this.resultArea = document.getElementById('resultArea');
        this.gradeAnotherBtn = document.getElementById('gradeAnotherBtn');
        this.elevationProfile = document.getElementById('elevationProfile');
        this.profilePolyline = document.getElementById('profilePolyline');

        this.selectedFile = null;
        this.isLoading = false;

        this._attachEventListeners();
    }

    _attachEventListeners() {
        // Upload area click
        this.uploadArea.addEventListener('click', () => this.fileInput.click());

        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.uploadArea.classList.remove('dragover');
            this._handleFileDrop(e.dataTransfer.files);
        });

        // File input change
        this.fileInput.addEventListener('change', (e) => {
            this._handleFileDrop(e.target.files);
        });

        // Submit button
        this.submitBtn.addEventListener('click', () => this._submitAnalysis());

        // Grade another button
        this.gradeAnotherBtn.addEventListener('click', () => this._resetForm());
    }

    _handleFileDrop(files) {
        if (files.length === 0) return;

        const file = files[0];

        // Validate extension
        if (!file.name.toLowerCase().endsWith('.gpx')) {
            this._showError('Please select a .gpx file');
            return;
        }

        // Validate size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            this._showError('File is too large (max 10MB)');
            return;
        }

        this.selectedFile = file;
        this.fileInput.files = files;
        this._updateUploadAreaWithFile(file.name);
        this._clearError();
    }

    _updateUploadAreaWithFile(filename) {
        const content = this.uploadArea.querySelector('.upload-content');
        content.innerHTML = `<p class="upload-text">Selected: <strong>${filename}</strong></p>`;
    }

    _clearError() {
        this.errorDisplay.style.display = 'none';
        this.errorMessage.textContent = '';
    }

    _showError(message) {
        this.errorMessage.textContent = message;
        this.errorDisplay.style.display = 'block';
        this.resultArea.style.display = 'none';
    }

    _showLoading(show) {
        this.isLoading = show;
        this.loadingState.style.display = show ? 'block' : 'none';
        this.submitBtn.disabled = show;
        if (show) {
            this.submitBtn.textContent = 'Analyzing...';
        } else {
            this.submitBtn.textContent = 'Grade this route';
        }
    }

    _getActivityType() {
        const selected = document.querySelector('input[name="activity_type"]:checked');
        return selected ? selected.value : 'trail';
    }

    async _submitAnalysis() {
        if (!this.selectedFile) {
            this._showError('Please select a GPX file');
            return;
        }

        this._clearError();
        this._showLoading(true);

        try {
            const formData = new FormData();
            formData.append('file', this.selectedFile);
            formData.append('activity_type', this._getActivityType());

            const response = await fetch('/api/python/analyze', {
                method: 'POST',
                body: formData,
                headers: {
                    'Origin': window.location.origin,
                },
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Analysis failed');
            }

            this._displayResults(data);
        } catch (error) {
            this._showError(error.message || 'Failed to analyze route');
        } finally {
            this._showLoading(false);
        }
    }

    _displayResults(data) {
        const { grade, activity, elevation_profile } = data;

        // Update grade display
        const gradeLetter = grade.difficulty_class;
        document.getElementById('resultGradeLetter').textContent = gradeLetter;
        document.getElementById('resultGradeLetter').style.color = GRADE_COLORS[gradeLetter] || 'var(--color-dark)';

        document.getElementById('resultTDS').textContent = grade.terrain_difficulty_score;
        document.getElementById('resultEffort').textContent = grade.effort_descriptor;

        // Update stats
        document.getElementById('resultDistance').textContent = `${activity.total_distance_km.toFixed(1)} km`;
        document.getElementById('resultGain').textContent = `${Math.round(activity.total_elevation_gain)} m`;
        document.getElementById('resultED').textContent = `${activity.elevation_density.toFixed(1)} m/km`;
        document.getElementById('resultClimbs').textContent = activity.climb_count;

        // Render elevation profile
        if (elevation_profile && elevation_profile.length > 0) {
            this._renderElevationProfile(elevation_profile, activity);
        }

        // Show result area
        this.resultArea.style.display = 'block';
        this.uploadArea.style.display = 'none';
        this.submitBtn.style.display = 'none';
        document.querySelector('.activity-type-selector').style.display = 'none';
    }

    _renderElevationProfile(profileData, activity) {
        if (profileData.length < 2) {
            this.profilePolyline.setAttribute('points', '');
            return;
        }

        const svg = this.elevationProfile;
        const svgWidth = 800;
        const svgHeight = 200;
        const padding = 10;

        const maxDist = activity.total_distance_km;
        const minElev = activity.min_elevation;
        const maxElev = activity.max_elevation;
        const elevRange = maxElev - minElev || 1;

        const points = profileData.map(point => {
            const x = (point.distance_km / maxDist) * (svgWidth - 2 * padding) + padding;
            const y = svgHeight - ((point.elevation - minElev) / elevRange) * (svgHeight - 2 * padding) - padding;
            return `${x},${y}`;
        }).join(' ');

        this.profilePolyline.setAttribute('points', points);
    }

    _resetForm() {
        this.selectedFile = null;
        this.fileInput.value = '';
        this.resultArea.style.display = 'none';
        this.uploadArea.style.display = 'block';
        this.submitBtn.style.display = 'block';
        document.querySelector('.activity-type-selector').style.display = 'block';

        const content = this.uploadArea.querySelector('.upload-content');
        content.innerHTML = `<p class="upload-text">Drop GPX file here</p><p class="upload-subtext">or click to select</p>`;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new RouteAnalyzer();
});
