/**
 * Greek Tombolos Web Map - Frontend Application
 * Handles map visualization, filtering, and user interactions for tombolos data
 */

class TomboloMapApp {
    constructor() {
        this.map = null;
        this.tomboloLayer = null;
        this.markerCluster = null;
        this.currentData = [];
        this.filterOptions = {};
        this.isLoading = false;
        this.filterDebounceTimer = null;
        this.filterUpdateTimer = null;
        this.isUpdatingFilters = false;
        this.tomboloDetailsCache = new Map();
        this.modalElements = null;
        this.popupTemplate = null;
        this.filterOptionsCache = null;
        this.filterOptionsCacheTimestamp = null;
        this.FILTER_CACHE_TTL = 5 * 60 * 1000;
        
        this.init();
    }
    
    async init() {
        this.cacheModalElements();
        this.initMap();
        this.initEventListeners();
        await this.checkDatabaseConnection();
        await this.loadFilterOptions();
        await this.loadStats({});
        await this.loadTomboloData();
    }
    
    initMap() {
        this.map = L.map('map', {
            preferCanvas: false,
            zoomControl: true,
            attributionControl: true,
            renderer: L.svg({ padding: 0.5 }),
            zoomAnimation: true,
            zoomAnimationThreshold: 4,
            fadeAnimation: true,
            markerZoomAnimation: true
        }).setView([39.0742, 21.8243], 7);
        
        const baseMaps = {
            "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }),
            "OpenTopoMap": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenTopoMap contributors',
                maxZoom: 17
            }),
            "Satellite (ESRI)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: '© Esri',
                maxZoom: 19
            }),
            "CartoDB Positron": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap, © CartoDB',
                maxZoom: 19
            }),
            "CartoDB Dark": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap, © CartoDB',
                maxZoom: 19
            })
        };
        
        baseMaps["OpenStreetMap"].addTo(this.map);
        
        L.control.layers(baseMaps, null, {
            position: 'topright',
            collapsed: true
        }).addTo(this.map);
        
        L.control.scale({
            position: 'bottomleft',
            metric: true,
            imperial: false,
            maxWidth: 150
        }).addTo(this.map);
        
        this.addNorthArrow();

        if (typeof MeasurementTool !== 'undefined') {
            this.measurementTool = new MeasurementTool(this.map);
        }
        
        this.markerCluster = L.markerClusterGroup({
            chunkedLoading: true,
            spiderfyOnMaxZoom: false,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            maxClusterRadius: 40,
            disableClusteringAtZoom: 11,
            animate: false,
            animateAddingMarkers: false,
            removeOutsideVisibleBounds: false,
            iconCreateFunction: function(cluster) {
                const count = cluster.getChildCount();
                return new L.DivIcon({
                    html: '<div style="background: #0066cc; color: #fff; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.3); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; font-family: Inter, sans-serif;">' + count + '</div>',
                    className: 'minimal-cluster',
                    iconSize: new L.Point(36, 36)
                });
            }
        });
        
        this.map.addLayer(this.markerCluster);
    }
    
    initEventListeners() {
        // Tab navigation
        if (window.innerWidth > 768) {
            const tabButtons = document.querySelectorAll('.tab-button');
            const tabContents = document.querySelectorAll('.tab-content');
            
            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    tabContents.forEach(content => content.classList.remove('active'));
                    button.classList.add('active');
                    const tabId = button.dataset.tab + '-tab';
                    document.getElementById(tabId).classList.add('active');
                });
            });
        }
        
        // Filter change handler
        const handleFilterChange = async () => {
            if (this.isUpdatingFilters) return;
            this.isUpdatingFilters = true;

            const selectedFilters = {
                prefecture: document.getElementById('prefecture-filter').value,
                island: document.getElementById('island-filter').value,
                type: document.getElementById('type-filter').value,
                category: document.getElementById('category-filter').value,
                submerged: document.getElementById('submerged-filter').value,
                subRcp26: document.getElementById('rcp26-filter').value,
                subRcp85: document.getElementById('rcp85-filter').value
            };
            
            try {
                await this.loadFilterOptions(selectedFilters);
                this.applyFilters();
            } finally {
                this.isUpdatingFilters = false;
            }
        };

        this.handleFilterChange = handleFilterChange;
        
        // Attach filter listeners
        document.getElementById('prefecture-filter').addEventListener('change', handleFilterChange);
        document.getElementById('island-filter').addEventListener('change', handleFilterChange);
        document.getElementById('type-filter').addEventListener('change', handleFilterChange);
        document.getElementById('category-filter').addEventListener('change', handleFilterChange);
        document.getElementById('submerged-filter').addEventListener('change', handleFilterChange);
        document.getElementById('rcp26-filter').addEventListener('change', handleFilterChange);
        document.getElementById('rcp85-filter').addEventListener('change', handleFilterChange);
        
        document.getElementById('clear-filters').addEventListener('click', () => {
            this.clearFilters();
        });
        
        // Modal controls
        const modal = document.getElementById('flood-modal');
        const closeBtn = document.querySelector('.close');
        
        closeBtn.addEventListener('click', () => this.closeModal());
        
        document.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.closeModal();
            }
        });
        
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('active')) {
                this.closeModal();
            }
        });
        
        // Welcome modal
        const welcomeModal = document.getElementById('welcome-modal');
        const closeWelcome = document.getElementById('close-welcome');
        const enterWebGIS = document.getElementById('enter-webgis');
        const aboutBtn = document.getElementById('about-btn');

        const closeWelcomeModal = () => {
            if (welcomeModal) welcomeModal.classList.remove('active');
        };

        if (welcomeModal) {
            setTimeout(() => welcomeModal.classList.add('active'), 300);
            if (closeWelcome) closeWelcome.addEventListener('click', closeWelcomeModal);
            if (enterWebGIS) enterWebGIS.addEventListener('click', closeWelcomeModal);
            welcomeModal.addEventListener('click', (event) => {
                if (event.target === welcomeModal) closeWelcomeModal();
            });
        }

        if (aboutBtn && welcomeModal) {
            aboutBtn.addEventListener('click', () => welcomeModal.classList.add('active'));
        }

        // References modal
        const referencesBtn = document.getElementById('references-btn');
        const referencesModal = document.getElementById('references-modal');
        const closeReferences = document.getElementById('close-references');

        if (referencesBtn && referencesModal) {
            referencesBtn.addEventListener('click', () => referencesModal.classList.add('active'));
            if (closeReferences) {
                closeReferences.addEventListener('click', () => referencesModal.classList.remove('active'));
            }
            referencesModal.addEventListener('click', (event) => {
                if (event.target === referencesModal) referencesModal.classList.remove('active');
            });
        }

        // Mobile controls
        const mobileFiltersToggle = document.getElementById('mobile-filters-toggle');
        const mobileStatsToggle = document.getElementById('mobile-stats-toggle');
        const sidebar = document.getElementById('sidebar');
        const mobileClose = document.getElementById('mobile-sidebar-close');

        if (mobileFiltersToggle && sidebar) {
            mobileFiltersToggle.addEventListener('click', () => {
                sidebar.classList.toggle('active');
                document.getElementById('filters-tab').classList.add('active');
                document.getElementById('stats-tab').classList.remove('active');
            });
        }

        if (mobileStatsToggle && sidebar) {
            mobileStatsToggle.addEventListener('click', () => {
                sidebar.classList.toggle('active');
                document.getElementById('stats-tab').classList.add('active');
                document.getElementById('filters-tab').classList.remove('active');
            });
        }

        if (mobileClose && sidebar) {
            mobileClose.addEventListener('click', () => sidebar.classList.remove('active'));
        }
    }

    async loadFilterOptions(selectedFilters = {}) {
        if (!window.supabaseClient) {
            console.error('❌ Database connection not initialized.');
            this.showError('Database connection not initialized.');
            return;
        }
        
        try {
            this.showFilterLoading(true);
            
            // Prefecture query
            let prefQuery = window.supabaseClient.from('tombolos').select('prefecture_en').not('prefecture_en', 'is', null);
            if (selectedFilters.island) prefQuery = prefQuery.eq('island_en', selectedFilters.island);
            if (selectedFilters.type) prefQuery = prefQuery.eq('tombolo_type', selectedFilters.type);
            if (selectedFilters.category) prefQuery = prefQuery.eq('tombolo_category', selectedFilters.category);
            if (selectedFilters.submerged) prefQuery = prefQuery.eq('submerged', selectedFilters.submerged);
            if (selectedFilters.subRcp26) prefQuery = prefQuery.eq('sub_rcp26', selectedFilters.subRcp26);
            if (selectedFilters.subRcp85) prefQuery = prefQuery.eq('sub_rcp85', selectedFilters.subRcp85);
            const prefData = await this._fetchAllRecords(prefQuery);
            const prefectures = this._getUniqueValues(prefData, 'prefecture_en');
            
            // Island query
            let islandQuery = window.supabaseClient.from('tombolos').select('island_en').not('island_en', 'is', null);
            if (selectedFilters.prefecture) islandQuery = islandQuery.eq('prefecture_en', selectedFilters.prefecture);
            if (selectedFilters.type) islandQuery = islandQuery.eq('tombolo_type', selectedFilters.type);
            if (selectedFilters.category) islandQuery = islandQuery.eq('tombolo_category', selectedFilters.category);
            if (selectedFilters.submerged) islandQuery = islandQuery.eq('submerged', selectedFilters.submerged);
            if (selectedFilters.subRcp26) islandQuery = islandQuery.eq('sub_rcp26', selectedFilters.subRcp26);
            if (selectedFilters.subRcp85) islandQuery = islandQuery.eq('sub_rcp85', selectedFilters.subRcp85);
            const islandData = await this._fetchAllRecords(islandQuery);
            const islands = this._getUniqueValues(islandData, 'island_en');
            
            // Type query
            let typeQuery = window.supabaseClient.from('tombolos').select('tombolo_type').not('tombolo_type', 'is', null);
            if (selectedFilters.prefecture) typeQuery = typeQuery.eq('prefecture_en', selectedFilters.prefecture);
            if (selectedFilters.island) typeQuery = typeQuery.eq('island_en', selectedFilters.island);
            if (selectedFilters.category) typeQuery = typeQuery.eq('tombolo_category', selectedFilters.category);
            if (selectedFilters.submerged) typeQuery = typeQuery.eq('submerged', selectedFilters.submerged);
            const typeData = await this._fetchAllRecords(typeQuery);
            const types = this._getUniqueValues(typeData, 'tombolo_type');
            
            // Category query
            let catQuery = window.supabaseClient.from('tombolos').select('tombolo_category').not('tombolo_category', 'is', null);
            if (selectedFilters.prefecture) catQuery = catQuery.eq('prefecture_en', selectedFilters.prefecture);
            if (selectedFilters.island) catQuery = catQuery.eq('island_en', selectedFilters.island);
            if (selectedFilters.type) catQuery = catQuery.eq('tombolo_type', selectedFilters.type);
            if (selectedFilters.submerged) catQuery = catQuery.eq('submerged', selectedFilters.submerged);
            const catData = await this._fetchAllRecords(catQuery);
            const categories = this._getUniqueValues(catData, 'tombolo_category');
            
            // Submerged query
            let subQuery = window.supabaseClient.from('tombolos').select('submerged').not('submerged', 'is', null);
            if (selectedFilters.prefecture) subQuery = subQuery.eq('prefecture_en', selectedFilters.prefecture);
            if (selectedFilters.island) subQuery = subQuery.eq('island_en', selectedFilters.island);
            if (selectedFilters.type) subQuery = subQuery.eq('tombolo_type', selectedFilters.type);
            if (selectedFilters.category) subQuery = subQuery.eq('tombolo_category', selectedFilters.category);
            const subData = await this._fetchAllRecords(subQuery);
            const submerged = this._getUniqueValues(subData, 'submerged');
            
            // RCP 2.6 query
            let rcp26Query = window.supabaseClient.from('tombolos').select('sub_rcp26').not('sub_rcp26', 'is', null);
            if (selectedFilters.prefecture) rcp26Query = rcp26Query.eq('prefecture_en', selectedFilters.prefecture);
            if (selectedFilters.island) rcp26Query = rcp26Query.eq('island_en', selectedFilters.island);
            const rcp26Data = await this._fetchAllRecords(rcp26Query);
            const subRcp26 = this._getUniqueValues(rcp26Data, 'sub_rcp26');
            
            // RCP 8.5 query
            let rcp85Query = window.supabaseClient.from('tombolos').select('sub_rcp85').not('sub_rcp85', 'is', null);
            if (selectedFilters.prefecture) rcp85Query = rcp85Query.eq('prefecture_en', selectedFilters.prefecture);
            if (selectedFilters.island) rcp85Query = rcp85Query.eq('island_en', selectedFilters.island);
            const rcp85Data = await this._fetchAllRecords(rcp85Query);
            const subRcp85 = this._getUniqueValues(rcp85Data, 'sub_rcp85');
            
            this.filterOptions = { prefectures, islands, types, categories, submerged, subRcp26, subRcp85 };
            this.populateFilterDropdowns(selectedFilters);
            this.showFilterLoading(false);
            
        } catch (error) {
            console.error('❌ Error loading filter options:', error);
            this.showFilterLoading(false);
            this.showError('Failed to load filter options.');
        }
    }
    
    _getUniqueValues(data, fieldName) {
        const uniqueValues = new Set();
        data.forEach(item => {
            const value = item[fieldName];
            if (value !== null && value !== undefined) {
                const processedValue = typeof value === 'string' ? value.trim() : value;
                if (processedValue !== '') uniqueValues.add(processedValue);
            }
        });
        return Array.from(uniqueValues).sort((a, b) => String(a).localeCompare(String(b)));
    }
    
    async _fetchAllRecords(query) {
        const allRecords = [];
        const batchSize = 1000;
        let offset = 0;
        
        while (true) {
            const { data, error } = await query.range(offset, offset + batchSize - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            allRecords.push(...data);
            if (data.length < batchSize) break;
            offset += batchSize;
        }
        return allRecords;
    }
    
    populateFilterDropdowns(selectedFilters = {}) {
        this.populateDropdown('prefecture', this.filterOptions.prefectures, selectedFilters.prefecture);
        this.populateDropdown('island', this.filterOptions.islands, selectedFilters.island);
        this.populateDropdown('type', this.filterOptions.types, selectedFilters.type);
        this.populateDropdown('category', this.filterOptions.categories, selectedFilters.category);
        this.populateDropdown('submerged', this.filterOptions.submerged, selectedFilters.submerged);
        this.populateDropdown('rcp26', this.filterOptions.subRcp26, selectedFilters.subRcp26);
        this.populateDropdown('rcp85', this.filterOptions.subRcp85, selectedFilters.subRcp85);
    }
    
    populateDropdown(filterName, options, currentValue) {
        const select = document.getElementById(`${filterName}-filter`);
        if (!select) return;

        while (select.options.length > 1) select.remove(1);

        options.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });

        if (currentValue) {
            select.value = currentValue;
            select.classList.add('has-value');
        } else {
            select.value = '';
            select.classList.remove('has-value');
        }

        if (window.refreshDropdown) window.refreshDropdown(`${filterName}-filter`);
    }
    
    async loadStats(filters = {}) {
        try {
            // Total count
            let totalQuery = window.supabaseClient.from('tombolos').select('*', { count: 'exact', head: true });
            if (filters.prefecture) totalQuery = totalQuery.eq('prefecture_en', filters.prefecture);
            if (filters.island) totalQuery = totalQuery.eq('island_en', filters.island);
            if (filters.type) totalQuery = totalQuery.eq('tombolo_type', filters.type);
            if (filters.category) totalQuery = totalQuery.eq('tombolo_category', filters.category);
            if (filters.submerged) totalQuery = totalQuery.eq('submerged', filters.submerged);
            if (filters.subRcp26) totalQuery = totalQuery.eq('sub_rcp26', filters.subRcp26);
            if (filters.subRcp85) totalQuery = totalQuery.eq('sub_rcp85', filters.subRcp85);
            const { count: totalCount } = await totalQuery;
            
            // Prefectures count
            const { data: prefData } = await window.supabaseClient.from('tombolos').select('prefecture_en').not('prefecture_en', 'is', null);
            const prefectures = new Set(prefData.map(p => p.prefecture_en)).size;
            
            // Currently submerged
            let subQuery = window.supabaseClient.from('tombolos').select('*', { count: 'exact', head: true }).eq('submerged', 'yes');
            const { count: submergedCount } = await subQuery;
            
            // At risk RCP 8.5
            let riskQuery = window.supabaseClient.from('tombolos').select('*', { count: 'exact', head: true }).eq('sub_rcp85', 'yes');
            const { count: riskCount } = await riskQuery;
            
            document.getElementById('total-events').textContent = totalCount.toLocaleString();
            document.getElementById('total-prefectures').textContent = prefectures.toLocaleString();
            document.getElementById('currently-submerged').textContent = submergedCount.toLocaleString();
            document.getElementById('at-risk-rcp85').textContent = riskCount.toLocaleString();
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }
    
    async loadTomboloData(filters = {}) {
        if (this.isLoading) return;
        
        this.showLoading(true);
        this.isLoading = true;
        
        try {
            let query = window.supabaseClient.from('tombolos')
                .select('id, latitude, longitude, name_en, prefecture_en, island_en, tombolo_type, tombolo_category, submerged, sub_rcp26, sub_rcp85, length_m, height_m')
                .not('latitude', 'is', null)
                .not('longitude', 'is', null);

            if (filters.prefecture) query = query.eq('prefecture_en', filters.prefecture);
            if (filters.island) query = query.eq('island_en', filters.island);
            if (filters.type) query = query.eq('tombolo_type', filters.type);
            if (filters.category) query = query.eq('tombolo_category', filters.category);
            if (filters.submerged) query = query.eq('submerged', filters.submerged);
            if (filters.subRcp26) query = query.eq('sub_rcp26', filters.subRcp26);
            if (filters.subRcp85) query = query.eq('sub_rcp85', filters.subRcp85);
            
            query = query.limit(1000);
            
            const { data, error } = await query;
            if (error) throw error;
            
            console.log(`✅ Loaded ${data.length} tombolos`);
            this.currentData = data;
            this.updateMap();
            this.updateVisiblePointsCount();
            
        } catch (error) {
            console.error('❌ Error loading tombolo data:', error);
            this.showError('Failed to load tombolo data.');
        } finally {
            this.showLoading(false);
            this.isLoading = false;
        }
    }
    
    updateMap() {
        this.markerCluster.clearLayers();
        
        const markers = this.currentData.map(tombolo => {
            const marker = L.circleMarker([tombolo.latitude, tombolo.longitude], {
                radius: 10,
                fillColor: this.getMarkerColor(tombolo),
                color: '#000000',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.95,
                renderer: L.svg(),
                bubblingMouseEvents: false,
                pane: 'markerPane'
            });
            
            const clickArea = L.circleMarker([tombolo.latitude, tombolo.longitude], {
                radius: 16,
                fillColor: 'transparent',
                color: 'transparent',
                weight: 0,
                fillOpacity: 0,
                interactive: true,
                bubblingMouseEvents: false
            });
            
            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                this.showTomboloDetails(tombolo.id);
            });
            
            clickArea.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                this.showTomboloDetails(tombolo.id);
            });
            
            const tooltipContent = `
                <div style="font-size: 12px; padding: 6px; line-height: 1.4;">
                    <strong style="font-size: 13px;">${this.escapeHtml(tombolo.name_en || 'Unknown')}</strong><br>
                    <span style="color: #666;">Island:</span> <strong>${this.escapeHtml(tombolo.island_en || 'N/A')}</strong><br>
                    <span style="color: #666;">Type:</span> ${tombolo.tombolo_type || 'N/A'}<br>
                    <span style="color: #666;">Status:</span> ${tombolo.submerged === 'yes' ? '🌊 Submerged' : '✓ Not Submerged'}
                </div>
            `;
            
            marker.bindTooltip(tooltipContent, {
                direction: 'top',
                offset: [0, -10],
                opacity: 0.9,
                className: 'minimal-tooltip'
            });
            
            clickArea.on('mouseover', () => {
                marker.setStyle({ weight: 3, fillOpacity: 1 });
                marker.openTooltip();
            });
            clickArea.on('mouseout', () => {
                marker.setStyle({ weight: 2, fillOpacity: 0.95 });
                marker.closeTooltip();
            });
            marker.on('mouseover', () => marker.setStyle({ weight: 3, fillOpacity: 1 }));
            marker.on('mouseout', () => marker.setStyle({ weight: 2, fillOpacity: 0.95 }));
            
            return L.layerGroup([marker, clickArea]);
        });
        
        if (markers.length > 0) {
            this.markerCluster.addLayers(markers);
            const bounds = this.markerCluster.getBounds();
            if (bounds.isValid()) this.map.fitBounds(bounds.pad(0.05));
        }
        
        this.updateVisiblePointsCount();
    }
    
    getMarkerColor(tombolo) {
        // Color based on submerged status and RCP scenarios
        if (tombolo.submerged === 'yes') return '#cc0000'; // Red - already submerged
        if (tombolo.sub_rcp85 === 'yes') return '#ff6600'; // Orange - at risk under RCP 8.5
        if (tombolo.sub_rcp26 === 'yes') return '#ffcc00'; // Yellow - at risk under RCP 2.6
        return '#0066cc'; // Blue - currently safe
    }
    
    async showTomboloDetails(tomboloId) {
        if (this.tomboloDetailsCache.has(tomboloId)) {
            this.displayTomboloModal(this.tomboloDetailsCache.get(tomboloId));
            return;
        }
        
        try {
            const { data: tombolo, error } = await window.supabaseClient
                .from('tombolos')
                .select('*')
                .eq('id', tomboloId)
                .single();
            if (error) throw error;
            
            tombolo.reference = 'https://doi.org/10.3390/jmse12122112';
            this.tomboloDetailsCache.set(tomboloId, tombolo);
            this.displayTomboloModal(tombolo);
        } catch (error) {
            console.error('Error loading tombolo details:', error);
            this.showError('Failed to load tombolo details.');
        }
    }
    
    displayTomboloModal(tombolo) {
        if (!this.modalElements) this.cacheModalElements();
        
        const fields = [
            { key: 'id', label: 'ID', highlight: true },
            { key: 'name_en', label: 'Name (EN)' },
            { key: 'name_gr', label: 'Name (GR)' },
            { key: 'prefecture_en', label: 'Prefecture' },
            { key: 'island_en', label: 'Island' },
            { key: 'tombolo_type', label: 'Type' },
            { key: 'tombolo_category', label: 'Category' },
            { key: 'length_m', label: 'Length (m)' },
            { key: 'width_tombolo_m', label: 'Width - Tombolo (m)' },
            { key: 'width_continent_m', label: 'Width - Continent (m)' },
            { key: 'width_island_m', label: 'Width - Island (m)' },
            { key: 'height_m', label: 'Height (m)' },
            { key: 'elevation', label: 'Elevation (m)' },
            { key: 'submerged', label: 'Currently Submerged' },
            { key: 'sub_rcp26', label: 'Submerged (RCP 2.6)' },
            { key: 'sub_rcp85', label: 'Submerged (RCP 8.5)' },
            { key: 'elevation_rcp26', label: 'Elevation RCP 2.6' },
            { key: 'elevation_rcp85', label: 'Elevation RCP 8.5' },
            { key: 'reference', label: 'Reference', isLink: true }
        ];
        
        let html = '';
        fields.forEach(field => {
            const value = tombolo[field.key];
            const displayValue = value !== null && value !== undefined && value.toString().trim() ? value : '-';
            const highlightClass = field.highlight ? 'detail-item-highlighted' : '';
            
            let valueHtml;
            if (field.isLink && value && value.toString().trim() && value !== '-') {
                valueHtml = `<a href="${this.escapeHtml(value)}" target="_blank" rel="noopener noreferrer" style="color: #0066ff; text-decoration: underline;">${this.escapeHtml(value)}</a>`;
            } else if (field.key === 'id') {
                valueHtml = `#${displayValue}`;
            } else {
                valueHtml = this.escapeHtml(String(displayValue));
            }
            
            html += `
                <div class="detail-item ${highlightClass}">
                    <div class="detail-label">${field.label}</div>
                    <div class="detail-value">${valueHtml}</div>
                </div>
            `;
        });
        
        this.modalElements.detailsContainer.innerHTML = html;
        this.modalElements.modal.classList.add('active');
        document.body.classList.add('modal-open');
    }
    
    async applyFilters() {
        const filters = {
            prefecture: document.getElementById('prefecture-filter').value,
            island: document.getElementById('island-filter').value,
            type: document.getElementById('type-filter').value,
            category: document.getElementById('category-filter').value,
            submerged: document.getElementById('submerged-filter').value,
            subRcp26: document.getElementById('rcp26-filter').value,
            subRcp85: document.getElementById('rcp85-filter').value
        };
        
        let activeCount = 0;
        Object.keys(filters).forEach(key => {
            if (!filters[key]) delete filters[key];
            else activeCount++;
        });
        
        this.updateActiveFiltersDisplay(filters);
        this.updateFilterIndicator(activeCount, filters);
        
        if (window.innerWidth <= 768) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('active');
        }
        
        await this.loadTomboloData(filters);
        await this.loadStats(filters);
    }
    
    updateFilterIndicator(count, filters = {}) {
        const toggleBtn = document.getElementById('mobile-filters-toggle');
        if (!toggleBtn) return;
        
        if (count > 0) {
            toggleBtn.textContent = `Filters (${count})`;
            toggleBtn.style.borderColor = 'var(--accent-blue)';
        } else {
            toggleBtn.textContent = 'Filters';
            toggleBtn.style.borderColor = '';
        }
    }
    
    async checkDatabaseConnection() {
        if (!window.supabaseClient) {
            this.showError('Database connection not initialized.');
            return false;
        }
        
        try {
            const { count, error } = await window.supabaseClient
                .from('tombolos')
                .select('*', { count: 'exact', head: true });
            
            if (error) {
                this.showError('Failed to connect to database.');
                return false;
            }
            
            console.log(`✅ Database connected. ${count} tombolos found.`);
            return true;
        } catch (error) {
            this.showError('Database connection error.');
            return false;
        }
    }
    
    showFilterLoading(show) {
        const filterLoading = document.getElementById('filter-loading');
        if (filterLoading) {
            filterLoading.classList.toggle('hidden', !show);
        }
    }
    
    async clearFilters() {
        const filterIds = ['prefecture-filter', 'island-filter', 'type-filter', 'category-filter', 'submerged-filter', 'rcp26-filter', 'rcp85-filter'];
        filterIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.value = '';
                el.classList.remove('has-value');
            }
        });
        
        const summary = document.getElementById('active-filters-summary');
        if (summary) summary.classList.add('hidden');
        
        await this.loadFilterOptions({});
        this.updateFilterIndicator(0, {});
        this.applyFilters();
    }
    
    updateActiveFiltersDisplay(filters) {
        const summary = document.getElementById('active-filters-summary');
        const list = document.getElementById('active-filters-list');
        if (!summary || !list) return;
        
        list.innerHTML = '';
        
        const labels = {
            prefecture: 'Prefecture',
            island: 'Island',
            type: 'Type',
            category: 'Category',
            submerged: 'Submerged',
            subRcp26: 'RCP 2.6',
            subRcp85: 'RCP 8.5'
        };
        
        const activeCount = Object.keys(filters).length;
        if (activeCount === 0) {
            summary.classList.add('hidden');
            return;
        }
        
        summary.classList.remove('hidden');
        
        Object.keys(filters).forEach(key => {
            const badge = document.createElement('div');
            badge.className = 'filter-badge';
            badge.innerHTML = `
                <span class="filter-badge-label">${labels[key] || key}:</span>
                <span class="filter-badge-value">${this.escapeHtml(filters[key])}</span>
                <button class="filter-badge-remove" title="Remove filter">×</button>
            `;
            badge.querySelector('.filter-badge-remove').addEventListener('click', () => this.clearIndividualFilter(key));
            list.appendChild(badge);
        });
    }
    
    async clearIndividualFilter(filterName) {
        const filterIds = {
            prefecture: 'prefecture-filter',
            island: 'island-filter',
            type: 'type-filter',
            category: 'category-filter',
            submerged: 'submerged-filter',
            subRcp26: 'rcp26-filter',
            subRcp85: 'rcp85-filter'
        };
        
        const el = document.getElementById(filterIds[filterName]);
        if (el) {
            el.value = '';
            el.classList.remove('has-value');
        }
        this.applyFilters();
    }
    
    updateVisiblePointsCount() {
        document.getElementById('visible-points').textContent = this.currentData.length.toLocaleString();
    }
    
    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) loading.classList.toggle('hidden', !show);
    }
    
    showError(message) {
        console.error('Error:', message);
        let errorBanner = document.getElementById('error-banner');
        if (errorBanner) {
            const msgEl = document.getElementById('error-banner-message');
            if (msgEl) msgEl.textContent = message;
            errorBanner.classList.remove('hidden');
        }
    }
    
    closeModal() {
        if (this.modalElements && this.modalElements.modal) {
            this.modalElements.modal.classList.remove('active');
        }
        document.body.classList.remove('modal-open');
    }
    
    cacheModalElements() {
        this.modalElements = {
            modal: document.getElementById('flood-modal'),
            detailsContainer: document.getElementById('flood-details')
        };
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    addNorthArrow() {
        const NorthArrowControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: function(map) {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control north-arrow-control');
                container.innerHTML = `
                    <div style="background: white; padding: 5px; border-radius: 4px; box-shadow: 0 1px 5px rgba(0,0,0,0.3); text-align: center;">
                        <div style="font-size: 20px; font-weight: bold; color: #333;">↑</div>
                        <div style="font-size: 10px; font-weight: bold; color: #333;">N</div>
                    </div>
                `;
                return container;
            }
        });
        this.map.addControl(new NorthArrowControl());
    }
}

// Initialize app
const app = new TomboloMapApp();
