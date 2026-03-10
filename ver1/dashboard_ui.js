// dashboard_ui.js — UI-компоненты для управления дашбордами.
// Отвечает за создание дашбордов, размещение графиков на них,
// управление сеткой и экспорт в стиле Apache Superset.

// Хранилище дашбордов
var DASHBOARDS = {};

// Текущий активный дашборд
var CURRENT_DASHBOARD_ID = null;

// Счётчик для уникальных ID дашбордов
var DASHBOARD_ID_COUNTER = 0;

/**
 * Инициализирует интерфейс дашбордов.
 * Вызывается при загрузке приложения.
 */
function initDashboardUI() {
    // Создаём дашборд по умолчанию
    createDefaultDashboard();
    renderDashboardList();
    renderDashboard();
}

/**
 * Создаёт дашборд по умолчанию при первом запуске.
 */
function createDefaultDashboard() {
    if (Object.keys(DASHBOARDS).length === 0) {
        createDashboard('Главный дашборд');
    }
}

/**
 * Создаёт новый дашборд.
 * @param {string} name - Название дашборда
 * @returns {Object} Объект дашборда
 */
function createDashboard(name) {
    DASHBOARD_ID_COUNTER++;
    var dashId = 'dash_' + DASHBOARD_ID_COUNTER + '_' + Date.now();
    var columns = (window.CONFIG && window.CONFIG.dashboardDefaults)
        ? window.CONFIG.dashboardDefaults.columns : 2;

    var dashboard = {
        id: dashId,
        name: name || 'Дашборд ' + DASHBOARD_ID_COUNTER,
        chartIds: [],
        columns: columns,
        createdAt: new Date().toISOString()
    };

    DASHBOARDS[dashId] = dashboard;
    CURRENT_DASHBOARD_ID = dashId;
    return dashboard;
}

/**
 * Возвращает текущий активный дашборд.
 * @returns {Object|null} Объект дашборда или null
 */
function getCurrentDashboard() {
    if (!CURRENT_DASHBOARD_ID) return null;
    return DASHBOARDS[CURRENT_DASHBOARD_ID] || null;
}

/**
 * Добавляет график на текущий дашборд.
 * @param {string} chartId - ID графика
 */
function addChartToDashboard(chartId) {
    var dashboard = getCurrentDashboard();
    if (!dashboard) {
        showNotification('Дашборд не найден', 'error');
        return;
    }

    if (dashboard.chartIds.indexOf(chartId) !== -1) {
        showNotification('График уже добавлен на дашборд', 'info');
        return;
    }

    dashboard.chartIds.push(chartId);
    renderDashboard();
    showNotification('График добавлен на дашборд', 'success');
}

/**
 * Удаляет график с текущего дашборда.
 * @param {string} chartId - ID графика
 */
function removeChartFromDashboard(chartId) {
    var dashboard = getCurrentDashboard();
    if (!dashboard) return;

    var idx = dashboard.chartIds.indexOf(chartId);
    if (idx !== -1) {
        dashboard.chartIds.splice(idx, 1);
        renderDashboard();
        showNotification('График удалён с дашборда', 'info');
    }
}

/**
 * Отрисовывает список дашбордов в боковой панели.
 */
function renderDashboardList() {
    var listEl = document.getElementById('dashboard-list');
    if (!listEl) return;

    var dashboards = Object.values ? Object.values(DASHBOARDS) : getObjectValues(DASHBOARDS);
    var html = '';

    for (var i = 0; i < dashboards.length; i++) {
        var dash = dashboards[i];
        var isActive = (dash.id === CURRENT_DASHBOARD_ID);
        html += '<div class="dashboard-item' + (isActive ? ' active' : '') + '" ' +
            'onclick="switchDashboard(\'' + escapeHtml(dash.id) + '\')">' +
            '<span>📊 ' + escapeHtml(dash.name) + '</span>' +
            '<span class="dash-chart-count">' + dash.chartIds.length + '</span>' +
            '</div>';
    }

    listEl.innerHTML = html;
}

/**
 * Переключает активный дашборд.
 * @param {string} dashId - ID дашборда
 */
function switchDashboard(dashId) {
    if (!DASHBOARDS[dashId]) return;
    CURRENT_DASHBOARD_ID = dashId;
    renderDashboardList();
    renderDashboard();
}

/**
 * Показывает диалог создания нового дашборда.
 */
function promptCreateDashboard() {
    var name = prompt('Название нового дашборда:');
    if (name && name.trim()) {
        var dash = createDashboard(name.trim());
        renderDashboardList();
        renderDashboard();
        showNotification('Дашборд "' + dash.name + '" создан', 'success');
    }
}

/**
 * Отрисовывает текущий дашборд с графиками.
 */
function renderDashboard() {
    var dashboardEl = document.getElementById('dashboard-canvas');
    if (!dashboardEl) return;

    var dashboard = getCurrentDashboard();
    if (!dashboard) {
        dashboardEl.innerHTML = '<div class="empty-dashboard">Нет дашбордов</div>';
        return;
    }

    // Заголовок дашборда
    var titleEl = document.getElementById('dashboard-title');
    if (titleEl) titleEl.textContent = dashboard.name;

    if (dashboard.chartIds.length === 0) {
        dashboardEl.innerHTML = '<div class="empty-dashboard">' +
            '<div class="empty-icon">📊</div>' +
            '<p>Дашборд пуст.</p>' +
            '<p>Создайте графики и нажмите 📌 для добавления на дашборд</p>' +
            '</div>';
        return;
    }

    // Рендерим сетку графиков
    var cols = dashboard.columns || 2;
    var html = '<div class="dashboard-grid" style="grid-template-columns: repeat(' + cols + ', 1fr);">';

    for (var i = 0; i < dashboard.chartIds.length; i++) {
        var chartId = dashboard.chartIds[i];
        var chart = CHARTS[chartId];
        if (!chart) continue;

        var chartTypeInfo = null;
        for (var ti = 0; ti < CHART_TYPES.length; ti++) {
            if (CHART_TYPES[ti].id === chart.type) {
                chartTypeInfo = CHART_TYPES[ti];
                break;
            }
        }
        var typeIcon = chartTypeInfo ? chartTypeInfo.icon : '📊';
        var isTable = chart.type === 'table';

        html += '<div class="dashboard-chart-item" id="dash-item-' + chart.id + '">' +
            '<div class="dashboard-chart-header">' +
            '<span>' + typeIcon + ' ' + escapeHtml(chart.title) + '</span>' +
            '<button class="btn-icon btn-sm" onclick="removeChartFromDashboard(\'' + chart.id + '\')" title="Убрать с дашборда">×</button>' +
            '</div>' +
            '<div class="dashboard-chart-body">' +
            (isTable
                ? '<div id="dash-canvas-' + chart.id + '" class="chart-canvas-area"></div>'
                : '<canvas id="dash-canvas-' + chart.id + '" class="chart-canvas"></canvas>') +
            '</div>' +
            '</div>';
    }
    html += '</div>';
    dashboardEl.innerHTML = html;

    // Рендерим все графики
    for (var j = 0; j < dashboard.chartIds.length; j++) {
        renderDashboardChart(dashboard.chartIds[j]);
    }
}

/**
 * Рендерит отдельный график на дашборде.
 * @param {string} chartId - ID графика
 */
function renderDashboardChart(chartId) {
    var chart = CHARTS[chartId];
    if (!chart) return;

    var canvasEl = document.getElementById('dash-canvas-' + chartId);
    if (!canvasEl) return;

    if (chart.type === 'table') {
        var dataset = getDataset(chart.datasetId);
        if (dataset) renderTableChart(chart, dataset, canvasEl);
    } else {
        renderChartToCanvas(chart, canvasEl);
    }
}

/**
 * Обновляет отображение дашборда (после изменения графиков).
 */
function refreshDashboard() {
    renderDashboard();
}

/**
 * Изменяет количество колонок сетки дашборда.
 * @param {number} cols - Количество колонок (1-4)
 */
function setDashboardColumns(cols) {
    var dashboard = getCurrentDashboard();
    if (!dashboard) return;
    dashboard.columns = Math.min(4, Math.max(1, parseInt(cols)));
    renderDashboard();
}

/**
 * Экспортирует дашборд в PNG (скриншот).
 */
function exportDashboardToPng() {
    var dashboard = getCurrentDashboard();
    if (!dashboard || dashboard.chartIds.length === 0) {
        showNotification('Дашборд пуст', 'warning');
        return;
    }

    if (typeof html2canvas !== 'undefined') {
        var dashboardEl = document.getElementById('dashboard-canvas');
        html2canvas(dashboardEl).then(function(canvas) {
            var link = document.createElement('a');
            link.download = dashboard.name + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    } else {
        showNotification('Функция экспорта требует библиотеку html2canvas', 'info');
    }
}

/**
 * Вспомогательная функция: возвращает значения объекта (аналог Object.values).
 * @param {Object} obj - Объект
 * @returns {Array} Массив значений
 */
function getObjectValues(obj) {
    var result = [];
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            result.push(obj[key]);
        }
    }
    return result;
}
