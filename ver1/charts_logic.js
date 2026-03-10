// charts_logic.js — логика создания и управления графиками.
// Использует библиотеку Chart.js для рендеринга графиков.
// Поддерживает: линейный, столбчатый, круговой, точечный, площадной,
// горизонтальный столбчатый, радарный и смешанный графики.

// Хранилище созданных графиков
var CHARTS = {};

// Экземпляры Chart.js (для управления рендерингом)
var CHART_INSTANCES = {};

// Счётчик для уникальных ID графиков
var CHART_ID_COUNTER = 0;

// Типы графиков с описаниями (аналог Superset)
var CHART_TYPES = [
    { id: 'bar',            label: 'Столбчатая диаграмма',         icon: '📊', chartjs: 'bar' },
    { id: 'line',           label: 'Линейный график',              icon: '📈', chartjs: 'line' },
    { id: 'pie',            label: 'Круговая диаграмма',           icon: '🥧', chartjs: 'pie' },
    { id: 'doughnut',       label: 'Кольцевая диаграмма',          icon: '🍩', chartjs: 'doughnut' },
    { id: 'area',           label: 'График с областью',            icon: '📉', chartjs: 'line' },
    { id: 'horizontalBar',  label: 'Горизонтальная диаграмма',     icon: '↔️', chartjs: 'bar' },
    { id: 'scatter',        label: 'Диаграмма рассеяния',          icon: '✦',  chartjs: 'scatter' },
    { id: 'radar',          label: 'Радарная диаграмма',           icon: '🕸️', chartjs: 'radar' },
    { id: 'bubble',         label: 'Пузырьковая диаграмма',        icon: '⬤',  chartjs: 'bubble' },
    { id: 'polarArea',      label: 'Полярная диаграмма',           icon: '☀️', chartjs: 'polarArea' },
    { id: 'table',          label: 'Таблица',                      icon: '📋', chartjs: null }
];

// Функции агрегации
var AGG_FUNCTIONS = [
    { id: 'sum',   label: 'Сумма (SUM)' },
    { id: 'avg',   label: 'Среднее (AVG)' },
    { id: 'count', label: 'Количество (COUNT)' },
    { id: 'min',   label: 'Минимум (MIN)' },
    { id: 'max',   label: 'Максимум (MAX)' }
];

/**
 * Создаёт новый график на основе конфигурации.
 * @param {Object} config - Конфигурация графика
 * @returns {Object} Объект графика
 */
function createChart(config) {
    CHART_ID_COUNTER++;
    var chartId = 'chart_' + CHART_ID_COUNTER + '_' + Date.now();

    var chart = {
        id: chartId,
        title: config.title || 'График ' + CHART_ID_COUNTER,
        type: config.type || 'bar',
        datasetId: config.datasetId || CURRENT_DATASET_ID,
        xColumn: config.xColumn || '',
        yColumns: config.yColumns || [],
        aggFunction: config.aggFunction || 'sum',
        useAggregation: config.useAggregation !== false,
        colorPalette: config.colorPalette || 'superset',
        showLegend: config.showLegend !== false,
        showGrid: config.showGrid !== false,
        createdAt: new Date().toISOString()
    };

    CHARTS[chartId] = chart;
    return chart;
}

/**
 * Обновляет конфигурацию существующего графика.
 * @param {string} chartId - ID графика
 * @param {Object} updates - Обновления конфигурации
 */
function updateChart(chartId, updates) {
    if (!CHARTS[chartId]) return;
    for (var key in updates) {
        if (updates.hasOwnProperty(key)) {
            CHARTS[chartId][key] = updates[key];
        }
    }
}

/**
 * Удаляет график по ID.
 * @param {string} chartId - ID графика
 */
function deleteChart(chartId) {
    // Уничтожаем экземпляр Chart.js, если он существует
    if (CHART_INSTANCES[chartId]) {
        CHART_INSTANCES[chartId].destroy();
        delete CHART_INSTANCES[chartId];
    }
    delete CHARTS[chartId];
}

/**
 * Возвращает все созданные графики.
 * @returns {Array} Массив объектов графиков
 */
function getAllCharts() {
    var result = [];
    for (var id in CHARTS) {
        if (CHARTS.hasOwnProperty(id)) {
            result.push(CHARTS[id]);
        }
    }
    return result;
}

/**
 * Рендерит график в указанный canvas-элемент.
 * @param {Object} chart - Объект графика
 * @param {HTMLElement} canvasEl - Элемент canvas
 */
function renderChartToCanvas(chart, canvasEl) {
    var dataset = getDataset(chart.datasetId);
    if (!dataset) {
        console.error('Датасет не найден: ' + chart.datasetId);
        return;
    }

    // Уничтожаем предыдущий экземпляр, если есть
    if (CHART_INSTANCES[chart.id]) {
        CHART_INSTANCES[chart.id].destroy();
        delete CHART_INSTANCES[chart.id];
    }

    // Для типа "table" рендерим HTML-таблицу
    if (chart.type === 'table') {
        renderTableChart(chart, dataset, canvasEl);
        return;
    }

    // Готовим данные для Chart.js
    var chartData = prepareChartData(chart, dataset);
    if (!chartData) return;

    // Формируем конфигурацию Chart.js
    var chartjsConfig = buildChartjsConfig(chart, chartData);

    // Создаём экземпляр Chart.js
    var ctx = canvasEl.getContext('2d');
    try {
        CHART_INSTANCES[chart.id] = new Chart(ctx, chartjsConfig);
    } catch (e) {
        console.error('Ошибка создания графика:', e);
    }
}

/**
 * Подготавливает данные для Chart.js из датасета.
 * @param {Object} chart - Объект конфигурации графика
 * @param {Object} dataset - Объект датасета
 * @returns {Object|null} Подготовленные данные или null при ошибке
 */
function prepareChartData(chart, dataset) {
    if (!chart.xColumn || chart.yColumns.length === 0) return null;

    var palette = getColorPalette(chart.colorPalette);
    var datasets = [];

    if (chart.type === 'scatter') {
        // Диаграмма рассеяния: xColumn и первый yColumn
        var yCol = chart.yColumns[0];
        var scatterPoints = [];
        for (var i = 0; i < dataset.rows.length; i++) {
            var row = dataset.rows[i];
            var xVal = parseFloat(String(row[chart.xColumn]).replace(',', '.'));
            var yVal = parseFloat(String(row[yCol]).replace(',', '.'));
            if (!isNaN(xVal) && !isNaN(yVal)) {
                scatterPoints.push({ x: xVal, y: yVal });
            }
        }
        datasets.push({
            label: yCol,
            data: scatterPoints,
            backgroundColor: palette[0] + '99',
            borderColor: palette[0],
            pointRadius: 5
        });
        return { labels: [], datasets: datasets };
    }

    if (chart.type === 'bubble') {
        // Пузырьковая диаграмма: требует x, y, r
        var yColB = chart.yColumns[0];
        var rColB = chart.yColumns[1] || chart.yColumns[0];
        var bubblePoints = [];
        for (var bi = 0; bi < dataset.rows.length; bi++) {
            var bRow = dataset.rows[bi];
            var bx = parseFloat(String(bRow[chart.xColumn]).replace(',', '.'));
            var by = parseFloat(String(bRow[yColB]).replace(',', '.'));
            var br = parseFloat(String(bRow[rColB]).replace(',', '.'));
            if (!isNaN(bx) && !isNaN(by)) {
                bubblePoints.push({ x: bx, y: by, r: isNaN(br) ? 5 : Math.max(2, Math.min(br / 10, 30)) });
            }
        }
        datasets.push({
            label: yColB,
            data: bubblePoints,
            backgroundColor: palette[0] + '99',
            borderColor: palette[0]
        });
        return { labels: [], datasets: datasets };
    }

    // Для остальных типов: агрегируем или берём серию
    var labels;
    for (var yi = 0; yi < chart.yColumns.length; yi++) {
        var yColumn = chart.yColumns[yi];
        var chartDataResult;

        if (chart.useAggregation) {
            chartDataResult = aggregateData(dataset, chart.xColumn, yColumn, chart.aggFunction);
        } else {
            chartDataResult = getSeriesData(dataset, chart.xColumn, yColumn);
        }

        if (yi === 0) {
            labels = chartDataResult.labels;
        }

        var color = palette[yi % palette.length];
        var dsConfig = {
            label: yColumn,
            data: chartDataResult.values,
            backgroundColor: color + (chart.type === 'area' ? '66' : 'CC'),
            borderColor: color,
            borderWidth: 2
        };

        // Настройки для линейного и площадного графиков
        if (chart.type === 'line' || chart.type === 'area') {
            dsConfig.tension = 0.3;
            dsConfig.fill = chart.type === 'area';
            dsConfig.pointRadius = 4;
        }

        // Горизонтальная диаграмма
        if (chart.type === 'horizontalBar') {
            dsConfig.indexAxis = 'y';
        }

        datasets.push(dsConfig);
    }

    return { labels: labels, datasets: datasets };
}

/**
 * Формирует полную конфигурацию Chart.js.
 * @param {Object} chart - Объект конфигурации графика
 * @param {Object} chartData - Подготовленные данные
 * @returns {Object} Конфигурация Chart.js
 */
function buildChartjsConfig(chart, chartData) {
    // Определяем тип Chart.js
    var chartType = 'bar';
    for (var i = 0; i < CHART_TYPES.length; i++) {
        if (CHART_TYPES[i].id === chart.type) {
            chartType = CHART_TYPES[i].chartjs || 'bar';
            break;
        }
    }

    var options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: chart.showLegend,
                position: 'top'
            },
            title: {
                display: !!chart.title,
                text: chart.title,
                font: { size: 14 }
            },
            tooltip: {
                mode: 'index',
                intersect: false
            }
        }
    };

    // Для круговых диаграмм — убираем оси
    var isPieType = (chart.type === 'pie' || chart.type === 'doughnut' ||
                     chart.type === 'radar' || chart.type === 'polarArea');

    if (!isPieType) {
        options.scales = {
            x: {
                grid: { display: chart.showGrid },
                ticks: { maxRotation: 45 }
            },
            y: {
                grid: { display: chart.showGrid },
                beginAtZero: true
            }
        };
    }

    // Горизонтальная диаграмма — переключаем оси
    if (chart.type === 'horizontalBar') {
        options.indexAxis = 'y';
    }

    // Для scatter и bubble — числовые оси
    if (chart.type === 'scatter' || chart.type === 'bubble') {
        options.scales = {
            x: { type: 'linear', grid: { display: chart.showGrid } },
            y: { type: 'linear', grid: { display: chart.showGrid } }
        };
    }

    return {
        type: chartType,
        data: chartData,
        options: options
    };
}

/**
 * Рендерит тип "table" — HTML-таблица вместо canvas.
 * @param {Object} chart - Объект конфигурации графика
 * @param {Object} dataset - Объект датасета
 * @param {HTMLElement} canvasEl - Контейнер для таблицы
 */
function renderTableChart(chart, dataset, canvasEl) {
    // Определяем отображаемые колонки
    var displayCols = [];
    if (chart.xColumn) displayCols.push(chart.xColumn);
    for (var i = 0; i < chart.yColumns.length; i++) {
        if (displayCols.indexOf(chart.yColumns[i]) === -1) {
            displayCols.push(chart.yColumns[i]);
        }
    }
    if (displayCols.length === 0) {
        displayCols = dataset.columns.map(function(c) { return c.name; });
    }

    var html = '<div class="table-chart-wrapper"><table class="chart-table"><thead><tr>';
    for (var j = 0; j < displayCols.length; j++) {
        html += '<th>' + escapeHtml(displayCols[j]) + '</th>';
    }
    html += '</tr></thead><tbody>';

    var maxRows = Math.min(dataset.rows.length, 100);
    for (var r = 0; r < maxRows; r++) {
        html += '<tr>';
        for (var c = 0; c < displayCols.length; c++) {
            var val = dataset.rows[r][displayCols[c]];
            html += '<td>' + escapeHtml(val === null || val === undefined ? '' : String(val)) + '</td>';
        }
        html += '</tr>';
    }

    if (dataset.rows.length > 100) {
        html += '<tr><td colspan="' + displayCols.length + '" class="more-rows">... ещё ' +
            (dataset.rows.length - 100) + ' строк (показаны первые 100)</td></tr>';
    }
    html += '</tbody></table></div>';

    // Вставляем таблицу вместо canvas
    var parent = canvasEl.parentNode;
    if (parent) {
        var tableDiv = document.createElement('div');
        tableDiv.className = 'table-chart-container';
        tableDiv.innerHTML = html;
        tableDiv.id = 'table-' + chart.id;
        parent.replaceChild(tableDiv, canvasEl);
    }
}

/**
 * Возвращает цветовую палитру по имени.
 * @param {string} paletteName - Название палитры
 * @returns {Array} Массив цветов HEX
 */
function getColorPalette(paletteName) {
    var palettes = (window.CONFIG && window.CONFIG.colorPalettes) ? window.CONFIG.colorPalettes : {
        default: ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf'],
        superset: ['#1FA8C9','#454E7C','#F26F44','#FAFAFA','#3DBADD','#6B6FA2','#F5A16C','#D3D3D3']
    };
    return palettes[paletteName] || palettes['superset'] || palettes['default'];
}
