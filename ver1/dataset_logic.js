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
 * Загружает файл с расширенными настройками (Upload CSV / Upload Excel / Upload Columnar).
 * @param {File} file - Объект файла из input[type=file]
 * @param {Object} options - Настройки загрузки (delimiter, skipRows, sheetName и др.)
 * @param {string} uploadType - Тип загрузки: 'csv', 'excel', 'columnar'
 * @param {Function} onSuccess - Функция обратного вызова при успехе (dataset)
 * @param {Function} onError - Функция обратного вызова при ошибке (message)
 */
function loadFileWithOptions(file, options, uploadType, onSuccess, onError) {
    // Проверяем размер файла
    var maxSize = (window.CONFIG && window.CONFIG.maxFileSizeBytes) ? window.CONFIG.maxFileSizeBytes : 52428800;
    if (file.size > maxSize) {
        onError('Файл слишком большой. Максимальный размер: ' + Math.round(maxSize / 1048576) + ' МБ');
        return;
    }

    var name = file.name.toLowerCase();

    // Проверяем допустимые расширения для каждого типа загрузки
    if (uploadType === 'csv' && !name.endsWith('.csv')) {
        onError('Для Upload CSV выберите файл .csv');
        return;
    }
    if (uploadType === 'excel' && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
        onError('Для Upload Excel выберите файл .xlsx или .xls');
        return;
    }
    if (uploadType === 'columnar' &&
        !name.endsWith('.csv') && !name.endsWith('.tsv') && !name.endsWith('.json')) {
        onError('Для Upload Columnar выберите файл .csv, .tsv или .json');
        return;
    }

    // Колоночный JSON читаем как текст
    if (uploadType === 'columnar' && name.endsWith('.json')) {
        var textReader = new FileReader();
        textReader.onload = function(e) {
            try {
                var dataset = parseColumnarJson(e.target.result, file.name, options);
                onSuccess(dataset);
            } catch (err) {
                onError('Ошибка при чтении JSON: ' + err.message);
            }
        };
        textReader.onerror = function() {
            onError('Ошибка при чтении файла');
        };
        textReader.readAsText(file, 'UTF-8');
        return;
    }

    // TSV-файл для колоночного формата
    if (uploadType === 'columnar' && name.endsWith('.tsv')) {
        var tsvOptions = { delimiter: '\t', skipRows: options.skipRows || 0, rowsToRead: options.rowsToRead || 0,
                           tableName: options.tableName, columnsToRead: options.columnsToRead };
        var tsvReader = new FileReader();
        tsvReader.onload = function(e) {
            try {
                var dataset = parseCsvData(e.target.result, file.name, tsvOptions);
                onSuccess(dataset);
            } catch (err) {
                onError('Ошибка при чтении TSV: ' + err.message);
            }
        };
        tsvReader.onerror = function() {
            onError('Ошибка при чтении файла');
        };
        tsvReader.readAsText(file, 'UTF-8');
        return;
    }

    // Все остальные форматы (xlsx, xls, csv) читаем через ArrayBuffer и SheetJS
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var dataset = parseFileWithOptions(e.target.result, file.name, options, uploadType);
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
 * Парсит файл (Excel/CSV) с учётом расширенных настроек.
 * @param {ArrayBuffer} buffer - Содержимое файла
 * @param {string} fileName - Имя файла
 * @param {Object} options - Настройки загрузки
 * @param {string} uploadType - Тип загрузки
 * @returns {Object} Объект датасета
 */
function parseFileWithOptions(buffer, fileName, options, uploadType) {
    var name = fileName.toLowerCase();
    var isCsv = name.endsWith('.csv');
    var opts = options || {};

    // Настройки чтения SheetJS
    var readOpts = { type: 'array', cellDates: true };
    var workbook = XLSX.read(buffer, readOpts);

    // Определяем лист для Excel
    var sheetName = workbook.SheetNames[0];
    if (opts.sheetName && opts.sheetName.trim() !== '') {
        // Ищем лист по имени (без учёта регистра)
        var requestedSheet = opts.sheetName.trim().toLowerCase();
        for (var s = 0; s < workbook.SheetNames.length; s++) {
            if (workbook.SheetNames[s].toLowerCase() === requestedSheet) {
                sheetName = workbook.SheetNames[s];
                break;
            }
        }
    }

    var worksheet = workbook.Sheets[sheetName];

    // Определяем строку заголовка
    var headerRow = opts.headerRow;
    var sheetToJsonOpts = { defval: null, raw: false };
    if (headerRow === 'none') {
        sheetToJsonOpts.header = 1;
    } else {
        var headerNum = parseInt(headerRow);
        if (!isNaN(headerNum) && headerNum > 0) {
            sheetToJsonOpts.header = headerNum + 1;
        }
    }

    var rows = XLSX.utils.sheet_to_json(worksheet, sheetToJsonOpts);

    if (rows.length === 0) {
        throw new Error('Файл не содержит данных');
    }

    // Для headerRow='none' SheetJS вернёт массивы — конвертируем в объекты
    if (headerRow === 'none' && Array.isArray(rows[0])) {
        rows = convertArrayRowsToObjects(rows);
    }

    // Пропускаем строки (skipRows)
    var skipRows = parseInt(opts.skipRows) || 0;
    if (skipRows > 0 && skipRows < rows.length) {
        rows = rows.slice(skipRows);
    }

    // Ограничиваем количество строк (rowsToRead)
    var rowsToRead = parseInt(opts.rowsToRead) || 0;
    if (rowsToRead > 0 && rowsToRead < rows.length) {
        rows = rows.slice(0, rowsToRead);
    }

    // Фильтруем по выбранным колонкам (columnsToRead для columnar)
    if (opts.columnsToRead && opts.columnsToRead.trim() !== '') {
        var selectedCols = opts.columnsToRead.split(',');
        for (var ci = 0; ci < selectedCols.length; ci++) {
            selectedCols[ci] = selectedCols[ci].trim();
        }
        rows = filterRowColumns(rows, selectedCols);
    }

    if (rows.length === 0) {
        throw new Error('После применения настроек данные отсутствуют');
    }

    // Определяем колонки и их типы
    var columns = detectColumns(rows);

    // Применяем явное задание типов колонок (colTypes для columnar)
    if (opts.colTypes && opts.colTypes.trim() !== '') {
        try {
            var typesMap = JSON.parse(opts.colTypes);
            columns = applyColumnTypes(columns, typesMap);
        } catch (e) {
            // Игнорируем ошибки разбора JSON типов
        }
    }

    // Явные даты из dateColumns (для CSV и Excel)
    if (opts.dateColumns && opts.dateColumns.trim() !== '') {
        var dateCols = opts.dateColumns.split(',');
        for (var di = 0; di < dateCols.length; di++) {
            var dateColName = dateCols[di].trim();
            for (var cj = 0; cj < columns.length; cj++) {
                if (columns[cj].name === dateColName) {
                    columns[cj].type = 'date';
                    break;
                }
            }
        }
    }

    // Создаём датасет
    DATASET_ID_COUNTER++;
    var datasetId = 'dataset_' + DATASET_ID_COUNTER + '_' + Date.now();
    var tableName = (opts.tableName && opts.tableName.trim() !== '') ?
        opts.tableName.trim() :
        fileName.replace(/\.[^.]+$/, '');

    var dataset = {
        id: datasetId,
        name: tableName,
        fileName: fileName,
        sheetName: sheetName,
        sheetNames: workbook.SheetNames,
        uploadType: uploadType,
        columns: columns,
        rows: rows,
        rowCount: rows.length,
        createdAt: new Date().toISOString()
    };

    DATASETS[datasetId] = dataset;
    CURRENT_DATASET_ID = datasetId;

    return dataset;
}

/**
 * Парсит JSON-файл в колоночном формате.
 * Поддерживает: массив объектов [{"col":val,...},...] и объект {"col":[val,...],...}
 * @param {string} text - Текст JSON-файла
 * @param {string} fileName - Имя файла
 * @param {Object} options - Настройки загрузки
 * @returns {Object} Объект датасета
 */
function parseColumnarJson(text, fileName, options) {
    var opts = options || {};
    var parsed = JSON.parse(text);
    var rows = [];

    // Формат: массив объектов
    if (Array.isArray(parsed)) {
        rows = parsed;
    }
    // Формат: объект {"column": [values...], ...}
    else if (typeof parsed === 'object' && parsed !== null) {
        var colKeys = Object.keys(parsed);
        if (colKeys.length > 0 && Array.isArray(parsed[colKeys[0]])) {
            var rowCount = parsed[colKeys[0]].length;
            for (var r = 0; r < rowCount; r++) {
                var row = {};
                for (var c = 0; c < colKeys.length; c++) {
                    row[colKeys[c]] = parsed[colKeys[c]][r];
                }
                rows.push(row);
            }
        } else {
            // Одна строка-объект — превращаем в массив
            rows = [parsed];
        }
    }

    if (rows.length === 0) {
        throw new Error('JSON-файл не содержит данных');
    }

    // Фильтруем по выбранным колонкам
    if (opts.columnsToRead && opts.columnsToRead.trim() !== '') {
        var selectedCols = opts.columnsToRead.split(',');
        for (var ci = 0; ci < selectedCols.length; ci++) {
            selectedCols[ci] = selectedCols[ci].trim();
        }
        rows = filterRowColumns(rows, selectedCols);
    }

    var columns = detectColumns(rows);

    // Применяем явное задание типов
    if (opts.colTypes && opts.colTypes.trim() !== '') {
        try {
            var typesMap = JSON.parse(opts.colTypes);
            columns = applyColumnTypes(columns, typesMap);
        } catch (e) {
            // Игнорируем ошибки разбора
        }
    }

    DATASET_ID_COUNTER++;
    var datasetId = 'dataset_' + DATASET_ID_COUNTER + '_' + Date.now();
    var tableName = (opts.tableName && opts.tableName.trim() !== '') ?
        opts.tableName.trim() :
        fileName.replace(/\.[^.]+$/, '');

    var dataset = {
        id: datasetId,
        name: tableName,
        fileName: fileName,
        uploadType: 'columnar',
        columns: columns,
        rows: rows,
        rowCount: rows.length,
        createdAt: new Date().toISOString()
    };

    DATASETS[datasetId] = dataset;
    CURRENT_DATASET_ID = datasetId;

    return dataset;
}

/**
 * Парсит CSV/TSV текстовый файл.
 * @param {string} text - Текст файла
 * @param {string} fileName - Имя файла
 * @param {Object} options - Настройки загрузки
 * @returns {Object} Объект датасета
 */
function parseCsvData(text, fileName, options) {
    var opts = options || {};
    var delimiter = opts.delimiter || ',';

    // Читаем через SheetJS из текстовой строки
    var workbook = XLSX.read(text, { type: 'string', FS: delimiter, cellDates: true });
    var sheetName = workbook.SheetNames[0];
    var worksheet = workbook.Sheets[sheetName];
    var rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });

    if (rows.length === 0) {
        throw new Error('Файл не содержит данных');
    }

    // Пропускаем строки
    var skipRows = parseInt(opts.skipRows) || 0;
    if (skipRows > 0 && skipRows < rows.length) {
        rows = rows.slice(skipRows);
    }

    // Ограничиваем количество строк
    var rowsToRead = parseInt(opts.rowsToRead) || 0;
    if (rowsToRead > 0 && rowsToRead < rows.length) {
        rows = rows.slice(0, rowsToRead);
    }

    // Фильтруем по выбранным колонкам
    if (opts.columnsToRead && opts.columnsToRead.trim() !== '') {
        var selectedCols = opts.columnsToRead.split(',');
        for (var ci = 0; ci < selectedCols.length; ci++) {
            selectedCols[ci] = selectedCols[ci].trim();
        }
        rows = filterRowColumns(rows, selectedCols);
    }

    if (rows.length === 0) {
        throw new Error('После применения настроек данные отсутствуют');
    }

    var columns = detectColumns(rows);

    DATASET_ID_COUNTER++;
    var datasetId = 'dataset_' + DATASET_ID_COUNTER + '_' + Date.now();
    var tableName = (opts.tableName && opts.tableName.trim() !== '') ?
        opts.tableName.trim() :
        fileName.replace(/\.[^.]+$/, '');

    var dataset = {
        id: datasetId,
        name: tableName,
        fileName: fileName,
        uploadType: 'columnar',
        columns: columns,
        rows: rows,
        rowCount: rows.length,
        createdAt: new Date().toISOString()
    };

    DATASETS[datasetId] = dataset;
    CURRENT_DATASET_ID = datasetId;

    return dataset;
}

/**
 * Конвертирует строки в виде массивов (при отсутствии заголовков)
 * в массив объектов с автоматическими именами колонок (Column 1, Column 2, ...).
 * @param {Array} arrayRows - Массив массивов значений
 * @returns {Array} Массив объектов
 */
function convertArrayRowsToObjects(arrayRows) {
    if (arrayRows.length === 0) return [];
    var firstRow = arrayRows[0];
    var colNames = [];
    for (var i = 0; i < firstRow.length; i++) {
        colNames.push('Column ' + (i + 1));
    }

    var result = [];
    for (var r = 0; r < arrayRows.length; r++) {
        var obj = {};
        for (var c = 0; c < colNames.length; c++) {
            obj[colNames[c]] = arrayRows[r][c] !== undefined ? arrayRows[r][c] : null;
        }
        result.push(obj);
    }
    return result;
}

/**
 * Фильтрует строки, оставляя только указанные колонки.
 * @param {Array} rows - Массив строк
 * @param {Array} selectedCols - Список имён колонок для сохранения
 * @returns {Array} Отфильтрованные строки
 */
function filterRowColumns(rows, selectedCols) {
    if (!selectedCols || selectedCols.length === 0) return rows;
    var result = [];
    for (var r = 0; r < rows.length; r++) {
        var newRow = {};
        for (var c = 0; c < selectedCols.length; c++) {
            var colName = selectedCols[c];
            if (rows[r].hasOwnProperty(colName)) {
                newRow[colName] = rows[r][colName];
            }
        }
        result.push(newRow);
    }
    return result;
}

/**
 * Применяет явно заданные типы колонок.
 * @param {Array} columns - Массив колонок датасета
 * @param {Object} typesMap - Объект {имяКолонки: тип}, тип: 'number', 'date', 'string'
 * @returns {Array} Обновлённый массив колонок
 */
function applyColumnTypes(columns, typesMap) {
    for (var i = 0; i < columns.length; i++) {
        var colName = columns[i].name;
        if (typesMap.hasOwnProperty(colName)) {
            var t = String(typesMap[colName]).toLowerCase();
            if (t === 'number' || t === 'date' || t === 'string') {
                columns[i].type = t;
            }
        }
    }
    return columns;
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
