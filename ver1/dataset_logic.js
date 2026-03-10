// dataset_logic.js — логика загрузки и обработки Excel-датасетов.
// Использует библиотеку SheetJS (xlsx) для чтения Excel-файлов.
// Предоставляет функции для парсинга, хранения и работы с датасетами.

// Хранилище загруженных датасетов
var DATASETS = {};

// Текущий активный датасет
var CURRENT_DATASET_ID = null;

// Идентификатор для генерации уникальных ID
var DATASET_ID_COUNTER = 0;

/**
 * Загружает Excel-файл и преобразует его в датасет.
 * @param {File} file - Объект файла из input[type=file]
 * @param {Function} onSuccess - Функция обратного вызова при успехе (dataset)
 * @param {Function} onError - Функция обратного вызова при ошибке (message)
 */
function loadExcelFile(file, onSuccess, onError) {
    // Проверяем размер файла
    var maxSize = (window.CONFIG && window.CONFIG.maxFileSizeBytes) ? window.CONFIG.maxFileSizeBytes : 52428800;
    if (file.size > maxSize) {
        onError('Файл слишком большой. Максимальный размер: ' + Math.round(maxSize / 1048576) + ' МБ');
        return;
    }

    // Проверяем расширение файла
    var name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
        onError('Неподдерживаемый формат файла. Поддерживаются: .xlsx, .xls, .csv');
        return;
    }

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var dataset = parseExcelData(e.target.result, file.name);
            onSuccess(dataset);
        } catch (err) {
            onError('Ошибка при чтении файла: ' + err.message);
        }
    };
    reader.onerror = function() {
        onError('Ошибка при чтении файла');
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Парсит данные Excel/CSV и возвращает объект датасета.
 * @param {ArrayBuffer} buffer - Содержимое файла
 * @param {string} fileName - Имя файла
 * @returns {Object} Объект датасета
 */
function parseExcelData(buffer, fileName) {
    // Читаем книгу Excel с помощью SheetJS
    var workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    // Получаем первый лист
    var sheetName = workbook.SheetNames[0];
    var worksheet = workbook.Sheets[sheetName];

    // Преобразуем в массив объектов (первая строка — заголовки)
    var rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });

    if (rows.length === 0) {
        throw new Error('Файл не содержит данных');
    }

    // Определяем колонки и их типы
    var columns = detectColumns(rows);

    // Создаём уникальный ID для датасета
    DATASET_ID_COUNTER++;
    var datasetId = 'dataset_' + DATASET_ID_COUNTER + '_' + Date.now();

    // Формируем объект датасета
    var dataset = {
        id: datasetId,
        name: fileName.replace(/\.[^.]+$/, ''), // Убираем расширение
        fileName: fileName,
        sheetName: sheetName,
        sheetNames: workbook.SheetNames,
        columns: columns,
        rows: rows,
        rowCount: rows.length,
        createdAt: new Date().toISOString()
    };

    // Сохраняем датасет в хранилище
    DATASETS[datasetId] = dataset;
    CURRENT_DATASET_ID = datasetId;

    return dataset;
}

/**
 * Определяет колонки датасета и их типы данных.
 * @param {Array} rows - Массив строк данных
 * @returns {Array} Массив объектов колонок с именем и типом
 */
function detectColumns(rows) {
    if (rows.length === 0) return [];

    var firstRow = rows[0];
    var columns = [];

    for (var colName in firstRow) {
        if (!firstRow.hasOwnProperty(colName)) continue;

        var colType = detectColumnType(rows, colName);
        columns.push({
            name: colName,
            type: colType,
            label: colName
        });
    }

    return columns;
}

/**
 * Определяет тип данных в колонке (число, дата, строка).
 * @param {Array} rows - Массив строк данных
 * @param {string} colName - Имя колонки
 * @returns {string} Тип: 'number', 'date', 'string'
 */
function detectColumnType(rows, colName) {
    var numericCount = 0;
    var dateCount = 0;
    var totalCount = 0;

    // Проверяем первые 100 строк для определения типа
    var sampleSize = Math.min(rows.length, 100);

    for (var i = 0; i < sampleSize; i++) {
        var val = rows[i][colName];
        if (val === null || val === undefined || val === '') continue;
        totalCount++;

        // Проверяем является ли значение датой
        if (val instanceof Date) {
            dateCount++;
            continue;
        }

        // Проверяем является ли значение числом
        var numVal = parseFloat(String(val).replace(',', '.'));
        if (!isNaN(numVal) && String(val).trim() !== '') {
            numericCount++;
            continue;
        }

        // Проверяем является ли значение датой в строковом формате
        var dateRegex = /^\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}$|^\d{4}[.\/\-]\d{1,2}[.\/\-]\d{1,2}$/;
        if (dateRegex.test(String(val).trim())) {
            dateCount++;
        }
    }

    if (totalCount === 0) return 'string';

    // Если более 80% значений — числа, тип числовой
    if (numericCount / totalCount > 0.8) return 'number';

    // Если более 80% значений — даты, тип дата
    if (dateCount / totalCount > 0.8) return 'date';

    return 'string';
}

/**
 * Возвращает датасет по ID.
 * @param {string} datasetId - ID датасета
 * @returns {Object|null} Объект датасета или null
 */
function getDataset(datasetId) {
    return DATASETS[datasetId] || null;
}

/**
 * Возвращает текущий активный датасет.
 * @returns {Object|null} Объект датасета или null
 */
function getCurrentDataset() {
    if (!CURRENT_DATASET_ID) return null;
    return DATASETS[CURRENT_DATASET_ID] || null;
}

/**
 * Возвращает список всех загруженных датасетов.
 * @returns {Array} Массив объектов датасетов
 */
function getAllDatasets() {
    var result = [];
    for (var id in DATASETS) {
        if (DATASETS.hasOwnProperty(id)) {
            result.push(DATASETS[id]);
        }
    }
    return result;
}

/**
 * Удаляет датасет по ID.
 * @param {string} datasetId - ID датасета
 */
function removeDataset(datasetId) {
    if (DATASETS[datasetId]) {
        delete DATASETS[datasetId];
        if (CURRENT_DATASET_ID === datasetId) {
            var remaining = getAllDatasets();
            CURRENT_DATASET_ID = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        }
    }
}

/**
 * Устанавливает активный датасет.
 * @param {string} datasetId - ID датасета
 */
function setCurrentDataset(datasetId) {
    if (DATASETS[datasetId]) {
        CURRENT_DATASET_ID = datasetId;
    }
}

/**
 * Возвращает список числовых колонок датасета.
 * @param {Object} dataset - Объект датасета
 * @returns {Array} Массив имён числовых колонок
 */
function getNumericColumns(dataset) {
    var result = [];
    for (var i = 0; i < dataset.columns.length; i++) {
        if (dataset.columns[i].type === 'number') {
            result.push(dataset.columns[i].name);
        }
    }
    return result;
}

/**
 * Возвращает список строковых (категориальных) колонок датасета.
 * @param {Object} dataset - Объект датасета
 * @returns {Array} Массив имён строковых колонок
 */
function getCategoricalColumns(dataset) {
    var result = [];
    for (var i = 0; i < dataset.columns.length; i++) {
        if (dataset.columns[i].type === 'string' || dataset.columns[i].type === 'date') {
            result.push(dataset.columns[i].name);
        }
    }
    return result;
}

/**
 * Агрегирует данные датасета по указанной колонке.
 * @param {Object} dataset - Объект датасета
 * @param {string} groupByCol - Колонка для группировки
 * @param {string} valueCol - Колонка со значениями
 * @param {string} aggFunc - Функция агрегации: 'sum', 'avg', 'count', 'min', 'max'
 * @returns {Object} Объект {labels: [...], values: [...]}
 */
function aggregateData(dataset, groupByCol, valueCol, aggFunc) {
    var groups = {};
    var counts = {};

    // Группируем данные
    for (var i = 0; i < dataset.rows.length; i++) {
        var row = dataset.rows[i];
        var groupKey = String(row[groupByCol] || '(пусто)');
        var rawVal = row[valueCol];
        var val = parseFloat(String(rawVal).replace(',', '.'));
        var numVal = isNaN(val) ? 0 : val;

        if (!groups[groupKey]) {
            groups[groupKey] = [];
            counts[groupKey] = 0;
        }
        groups[groupKey].push(numVal);
        counts[groupKey]++;
    }

    // Применяем функцию агрегации
    var labels = Object.keys(groups);
    var values = [];

    for (var j = 0; j < labels.length; j++) {
        var key = labels[j];
        var groupValues = groups[key];

        var result;
        if (aggFunc === 'sum') {
            result = groupValues.reduce(function(a, b) { return a + b; }, 0);
        } else if (aggFunc === 'avg') {
            result = groupValues.reduce(function(a, b) { return a + b; }, 0) / groupValues.length;
        } else if (aggFunc === 'count') {
            result = groupValues.length;
        } else if (aggFunc === 'min') {
            result = Math.min.apply(null, groupValues);
        } else if (aggFunc === 'max') {
            result = Math.max.apply(null, groupValues);
        } else {
            result = groupValues.reduce(function(a, b) { return a + b; }, 0);
        }

        values.push(Math.round(result * 100) / 100);
    }

    return { labels: labels, values: values };
}

/**
 * Возвращает отдельные значения из колонки (для временных серий).
 * @param {Object} dataset - Объект датасета
 * @param {string} xCol - Колонка для оси X
 * @param {string} yCol - Колонка для оси Y
 * @returns {Object} Объект {labels: [...], values: [...]}
 */
function getSeriesData(dataset, xCol, yCol) {
    var labels = [];
    var values = [];

    for (var i = 0; i < dataset.rows.length; i++) {
        var row = dataset.rows[i];
        var xVal = row[xCol];
        var yVal = row[yCol];
        var numVal = parseFloat(String(yVal).replace(',', '.'));

        labels.push(String(xVal || ''));
        values.push(isNaN(numVal) ? 0 : numVal);
    }

    return { labels: labels, values: values };
}

/**
 * Вычисляет статистику по датасету.
 * @param {Object} dataset - Объект датасета
 * @returns {Object} Объект со статистическими показателями
 */
function computeDatasetStats(dataset) {
    var stats = {
        rowCount: dataset.rowCount,
        columnCount: dataset.columns.length,
        numericColumns: getNumericColumns(dataset).length,
        categoricalColumns: getCategoricalColumns(dataset).length,
        columns: []
    };

    for (var i = 0; i < dataset.columns.length; i++) {
        var col = dataset.columns[i];
        var colStats = { name: col.name, type: col.type };

        if (col.type === 'number') {
            var vals = [];
            for (var j = 0; j < dataset.rows.length; j++) {
                var raw = dataset.rows[j][col.name];
                var num = parseFloat(String(raw).replace(',', '.'));
                if (!isNaN(num)) vals.push(num);
            }
            if (vals.length > 0) {
                colStats.min = Math.min.apply(null, vals);
                colStats.max = Math.max.apply(null, vals);
                colStats.sum = vals.reduce(function(a, b) { return a + b; }, 0);
                colStats.avg = colStats.sum / vals.length;
                colStats.count = vals.length;
            }
        } else {
            var uniqueVals = {};
            for (var k = 0; k < dataset.rows.length; k++) {
                var v = String(dataset.rows[k][col.name] || '');
                uniqueVals[v] = true;
            }
            colStats.uniqueCount = Object.keys(uniqueVals).length;
        }

        stats.columns.push(colStats);
    }

    return stats;
}
