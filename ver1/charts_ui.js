// charts_ui.js — UI-компоненты для создания и управления графиками.
// Отвечает за панель редактора графиков, предпросмотр и галерею графиков
// в стиле Apache Superset.

// ID текущего редактируемого графика
var EDITING_CHART_ID = null;

/**
 * Инициализирует интерфейс графиков.
 * Вызывается при загрузке приложения.
 */
function initChartsUI() {
    renderChartTypeSelector();
    renderChartGallery();
}

/**
 * Обновляет редактор графиков при смене датасета.
 * @param {Object} dataset - Новый активный датасет
 */
function updateChartEditorDataset(dataset) {
    populateColumnSelectors(dataset);
}

/**
 * Открывает редактор для создания нового графика.
 */
function openNewChartEditor() {
    var dataset = getCurrentDataset();
    if (!dataset) {
        showNotification('Сначала загрузите датасет', 'warning');
        return;
    }

    EDITING_CHART_ID = null;

    // Сбрасываем форму
    resetChartEditorForm();
    populateColumnSelectors(dataset);

    // Показываем редактор
    showView('chart-editor-view');
    document.getElementById('chart-editor-title').textContent = 'Создать график';
}

/**
 * Открывает редактор для редактирования существующего графика.
 * @param {string} chartId - ID редактируемого графика
 */
function openEditChartEditor(chartId) {
    var chart = CHARTS[chartId];
    if (!chart) return;

    var dataset = getDataset(chart.datasetId);
    if (!dataset) {
        showNotification('Датасет графика не найден', 'error');
        return;
    }

    EDITING_CHART_ID = chartId;

    // Заполняем форму данными графика
    fillChartEditorForm(chart);
    populateColumnSelectors(dataset);

    // Восстанавливаем выбор колонок
    restoreColumnSelections(chart);

    // Показываем редактор
    showView('chart-editor-view');
    document.getElementById('chart-editor-title').textContent = 'Редактировать график';
}

/**
 * Сбрасывает форму редактора графиков к значениям по умолчанию.
 */
function resetChartEditorForm() {
    var titleInput = document.getElementById('chart-title-input');
    if (titleInput) titleInput.value = 'Новый график';

    var aggSelect = document.getElementById('chart-agg-func');
    if (aggSelect) aggSelect.value = 'sum';

    var useAggCheck = document.getElementById('chart-use-agg');
    if (useAggCheck) useAggCheck.checked = true;

    var legendCheck = document.getElementById('chart-show-legend');
    if (legendCheck) legendCheck.checked = true;

    var gridCheck = document.getElementById('chart-show-grid');
    if (gridCheck) gridCheck.checked = true;

    // Выбираем первый тип графика
    var typeButtons = document.querySelectorAll('.chart-type-btn');
    if (typeButtons.length > 0) {
        typeButtons[0].classList.add('active');
        for (var i = 1; i < typeButtons.length; i++) {
            typeButtons[i].classList.remove('active');
        }
    }
}

/**
 * Заполняет форму редактора данными графика.
 * @param {Object} chart - Объект графика
 */
function fillChartEditorForm(chart) {
    var titleInput = document.getElementById('chart-title-input');
    if (titleInput) titleInput.value = chart.title;

    var aggSelect = document.getElementById('chart-agg-func');
    if (aggSelect) aggSelect.value = chart.aggFunction;

    var useAggCheck = document.getElementById('chart-use-agg');
    if (useAggCheck) useAggCheck.checked = chart.useAggregation;

    var legendCheck = document.getElementById('chart-show-legend');
    if (legendCheck) legendCheck.checked = chart.showLegend;

    var gridCheck = document.getElementById('chart-show-grid');
    if (gridCheck) gridCheck.checked = chart.showGrid;

    // Выбираем тип графика
    var typeButtons = document.querySelectorAll('.chart-type-btn');
    for (var i = 0; i < typeButtons.length; i++) {
        if (typeButtons[i].dataset.type === chart.type) {
            typeButtons[i].classList.add('active');
        } else {
            typeButtons[i].classList.remove('active');
        }
    }
}

/**
 * Отрисовывает кнопки выбора типа графика.
 */
function renderChartTypeSelector() {
    var container = document.getElementById('chart-type-selector');
    if (!container) return;

    var html = '';
    for (var i = 0; i < CHART_TYPES.length; i++) {
        var ct = CHART_TYPES[i];
        html += '<button class="chart-type-btn' + (i === 0 ? ' active' : '') + '" ' +
            'data-type="' + ct.id + '" ' +
            'onclick="selectChartType(\'' + ct.id + '\')" ' +
            'title="' + escapeHtml(ct.label) + '">' +
            ct.icon + '<br><span>' + escapeHtml(ct.label) + '</span>' +
            '</button>';
    }
    container.innerHTML = html;
}

/**
 * Выбирает тип графика.
 * @param {string} typeId - ID типа графика
 */
function selectChartType(typeId) {
    var buttons = document.querySelectorAll('.chart-type-btn');
    for (var i = 0; i < buttons.length; i++) {
        if (buttons[i].dataset.type === typeId) {
            buttons[i].classList.add('active');
        } else {
            buttons[i].classList.remove('active');
        }
    }

    // Скрываем/показываем настройки в зависимости от типа
    updateEditorForChartType(typeId);
}

/**
 * Обновляет опции редактора в зависимости от типа графика.
 * @param {string} typeId - ID типа графика
 */
function updateEditorForChartType(typeId) {
    var gridRow = document.getElementById('chart-grid-row');
    var aggRow = document.getElementById('chart-agg-row');

    // Для круговых диаграмм сетка не нужна
    var isPie = (typeId === 'pie' || typeId === 'doughnut' || typeId === 'polarArea');
    if (gridRow) gridRow.style.display = isPie ? 'none' : '';

    // Для scatter/bubble агрегация не применяется
    var isScatter = (typeId === 'scatter' || typeId === 'bubble');
    if (aggRow) aggRow.style.display = isScatter ? 'none' : '';
}

/**
 * Заполняет выпадающие списки колонок из датасета.
 * @param {Object} dataset - Объект датасета
 */
function populateColumnSelectors(dataset) {
    var xSelect = document.getElementById('chart-x-column');
    var yContainer = document.getElementById('chart-y-columns');
    if (!xSelect || !yContainer) return;

    // Заполняем список X-колонки
    xSelect.innerHTML = '<option value="">-- Выберите колонку --</option>';
    for (var i = 0; i < dataset.columns.length; i++) {
        var col = dataset.columns[i];
        var option = document.createElement('option');
        option.value = col.name;
        option.textContent = col.name + ' (' + col.type + ')';
        xSelect.appendChild(option);
    }

    // Заполняем чекбоксы Y-колонок (числовые)
    var numericCols = getNumericColumns(dataset);
    if (numericCols.length === 0) {
        // Если нет числовых — показываем все
        numericCols = dataset.columns.map(function(c) { return c.name; });
    }

    var yHtml = '<div class="y-columns-list">';
    for (var j = 0; j < numericCols.length; j++) {
        yHtml += '<label class="y-col-checkbox">' +
            '<input type="checkbox" name="y-column" value="' + escapeHtml(numericCols[j]) + '"' +
            (j === 0 ? ' checked' : '') + '> ' +
            escapeHtml(numericCols[j]) +
            '</label>';
    }
    yHtml += '</div>';
    yContainer.innerHTML = yHtml;
}

/**
 * Восстанавливает выбор колонок при редактировании существующего графика.
 * @param {Object} chart - Объект графика
 */
function restoreColumnSelections(chart) {
    var xSelect = document.getElementById('chart-x-column');
    if (xSelect && chart.xColumn) {
        xSelect.value = chart.xColumn;
    }

    var yCheckboxes = document.querySelectorAll('input[name="y-column"]');
    for (var i = 0; i < yCheckboxes.length; i++) {
        yCheckboxes[i].checked = (chart.yColumns.indexOf(yCheckboxes[i].value) !== -1);
    }
}

/**
 * Сохраняет график из формы редактора.
 * Создаёт новый или обновляет существующий.
 */
function saveChartFromEditor() {
    var dataset = getCurrentDataset();
    if (!dataset) {
        showNotification('Датасет не выбран', 'error');
        return;
    }

    // Читаем значения формы
    var titleInput = document.getElementById('chart-title-input');
    var title = titleInput ? titleInput.value.trim() : 'График';
    if (!title) title = 'График';

    var xSelect = document.getElementById('chart-x-column');
    var xColumn = xSelect ? xSelect.value : '';
    if (!xColumn) {
        showNotification('Выберите колонку для оси X', 'warning');
        return;
    }

    var yCheckboxes = document.querySelectorAll('input[name="y-column"]:checked');
    var yColumns = [];
    for (var i = 0; i < yCheckboxes.length; i++) {
        yColumns.push(yCheckboxes[i].value);
    }
    if (yColumns.length === 0) {
        showNotification('Выберите хотя бы одну колонку для оси Y', 'warning');
        return;
    }

    var activeTypeBtn = document.querySelector('.chart-type-btn.active');
    var chartType = activeTypeBtn ? activeTypeBtn.dataset.type : 'bar';

    var aggSelect = document.getElementById('chart-agg-func');
    var aggFunction = aggSelect ? aggSelect.value : 'sum';

    var useAggCheck = document.getElementById('chart-use-agg');
    var useAgg = useAggCheck ? useAggCheck.checked : true;

    var legendCheck = document.getElementById('chart-show-legend');
    var showLegend = legendCheck ? legendCheck.checked : true;

    var gridCheck = document.getElementById('chart-show-grid');
    var showGrid = gridCheck ? gridCheck.checked : true;

    var config = {
        title: title,
        type: chartType,
        datasetId: dataset.id,
        xColumn: xColumn,
        yColumns: yColumns,
        aggFunction: aggFunction,
        useAggregation: useAgg,
        showLegend: showLegend,
        showGrid: showGrid,
        colorPalette: (window.CONFIG && window.CONFIG.activePalette) ? window.CONFIG.activePalette : 'superset'
    };

    if (EDITING_CHART_ID) {
        // Обновляем существующий график
        updateChart(EDITING_CHART_ID, config);
        showNotification('График обновлён', 'success');
        // Обновляем рендеринг в галерее и на дашборде
        refreshChartRendering(EDITING_CHART_ID);
    } else {
        // Создаём новый график
        var chart = createChart(config);
        showNotification('График "' + title + '" создан', 'success');
        // Добавляем в галерею
        addChartToGallery(chart);
    }

    renderChartGallery();
    showView('explore-view');
}

/**
 * Отменяет редактирование графика.
 */
function cancelChartEditor() {
    EDITING_CHART_ID = null;
    showView('explore-view');
}

/**
 * Добавляет новый график в галерею.
 * @param {Object} chart - Объект графика
 */
function addChartToGallery(chart) {
    renderChartGallery();
}

/**
 * Обновляет рендеринг графика в галерее.
 * @param {string} chartId - ID графика
 */
function refreshChartRendering(chartId) {
    renderChartGallery();
    // Также обновляем на дашборде, если есть
    refreshDashboard();
}

/**
 * Отрисовывает галерею всех созданных графиков.
 */
function renderChartGallery() {
    var gallery = document.getElementById('chart-gallery');
    if (!gallery) return;

    var charts = getAllCharts();
    if (charts.length === 0) {
        gallery.innerHTML = '<div class="empty-gallery">' +
            '<div class="empty-icon">📊</div>' +
            '<p>Нет созданных графиков.</p>' +
            '<p>Загрузите датасет и нажмите "+ Добавить график"</p>' +
            '</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < charts.length; i++) {
        var chart = charts[i];
        html += renderChartCard(chart);
    }
    gallery.innerHTML = html;

    // Рендерим все графики в canvas
    for (var j = 0; j < charts.length; j++) {
        renderChartCardCanvas(charts[j]);
    }
}

/**
 * Генерирует HTML-карточку графика.
 * @param {Object} chart - Объект графика
 * @returns {string} HTML-строка
 */
function renderChartCard(chart) {
    var chartTypeInfo = null;
    for (var i = 0; i < CHART_TYPES.length; i++) {
        if (CHART_TYPES[i].id === chart.type) {
            chartTypeInfo = CHART_TYPES[i];
            break;
        }
    }
    var typeLabel = chartTypeInfo ? chartTypeInfo.label : chart.type;
    var typeIcon = chartTypeInfo ? chartTypeInfo.icon : '📊';
    var isTable = chart.type === 'table';

    return '<div class="chart-card" id="card-' + chart.id + '">' +
        '<div class="chart-card-header">' +
        '<span class="chart-card-title">' + typeIcon + ' ' + escapeHtml(chart.title) + '</span>' +
        '<div class="chart-card-actions">' +
        '<button class="btn-icon" onclick="openEditChartEditor(\'' + chart.id + '\')" title="Редактировать">✏️</button>' +
        '<button class="btn-icon" onclick="addChartToDashboard(\'' + chart.id + '\')" title="Добавить на дашборд">📌</button>' +
        '<button class="btn-icon btn-danger" onclick="confirmDeleteChart(\'' + chart.id + '\')" title="Удалить">🗑️</button>' +
        '</div>' +
        '</div>' +
        '<div class="chart-card-type">' + escapeHtml(typeLabel) + '</div>' +
        '<div class="chart-canvas-wrapper">' +
        (isTable ? '<div id="canvas-' + chart.id + '" class="chart-canvas-area"></div>' :
            '<canvas id="canvas-' + chart.id + '" class="chart-canvas"></canvas>') +
        '</div>' +
        '</div>';
}

/**
 * Рендерит содержимое canvas для карточки графика.
 * @param {Object} chart - Объект графика
 */
function renderChartCardCanvas(chart) {
    var canvasId = 'canvas-' + chart.id;
    var canvasEl = document.getElementById(canvasId);
    if (!canvasEl) return;

    if (chart.type === 'table') {
        var dataset = getDataset(chart.datasetId);
        if (dataset) renderTableChart(chart, dataset, canvasEl);
    } else {
        renderChartToCanvas(chart, canvasEl);
    }
}

/**
 * Удаляет график с подтверждением.
 * @param {string} chartId - ID графика
 */
function confirmDeleteChart(chartId) {
    var chart = CHARTS[chartId];
    if (!chart) return;
    if (confirm('Удалить график "' + chart.title + '"?')) {
        deleteChart(chartId);
        renderChartGallery();
        refreshDashboard();
        showNotification('График удалён', 'info');
    }
}
