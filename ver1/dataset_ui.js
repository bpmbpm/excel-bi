// dataset_ui.js — UI-компоненты для управления датасетами.
// Отвечает за отображение панели загрузки файлов, списка датасетов,
// предпросмотра данных и настройки колонок в стиле Apache Superset.

/**
 * Инициализирует интерфейс датасетов.
 * Вызывается при загрузке приложения.
 */
function initDatasetUI() {
    setupFileUploadDragDrop();
    renderDatasetList();
}

/**
 * Настраивает перетаскивание файлов (drag & drop) в зону загрузки.
 */
function setupFileUploadDragDrop() {
    var dropZone = document.getElementById('upload-drop-zone');
    if (!dropZone) return;

    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        var files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFileSelected(files[0]);
        }
    });
}

/**
 * Обрабатывает выбор файла через input или drag&drop.
 * @param {File} file - Выбранный файл
 */
function handleFileSelected(file) {
    showUploadProgress(file.name);
    loadExcelFile(file, function(dataset) {
        hideUploadProgress();
        showUploadSuccess(dataset);
        renderDatasetList();
        renderDatasetPreview(dataset);
        showNotification('Датасет "' + dataset.name + '" успешно загружен (' + dataset.rowCount + ' строк)', 'success');
    }, function(errorMsg) {
        hideUploadProgress();
        showNotification('Ошибка загрузки: ' + errorMsg, 'error');
    });
}

/**
 * Показывает индикатор прогресса загрузки.
 * @param {string} fileName - Имя загружаемого файла
 */
function showUploadProgress(fileName) {
    var uploadArea = document.getElementById('upload-area');
    if (uploadArea) {
        var progressHtml = '<div class="upload-progress">' +
            '<div class="spinner"></div>' +
            '<span>Загрузка файла: ' + escapeHtml(fileName) + '...</span>' +
            '</div>';
        var progressEl = document.getElementById('upload-progress-msg');
        if (progressEl) progressEl.innerHTML = progressHtml;
    }
}

/**
 * Скрывает индикатор прогресса загрузки.
 */
function hideUploadProgress() {
    var progressEl = document.getElementById('upload-progress-msg');
    if (progressEl) progressEl.innerHTML = '';
}

/**
 * Показывает сообщение об успешной загрузке.
 * @param {Object} dataset - Загруженный датасет
 */
function showUploadSuccess(dataset) {
    var progressEl = document.getElementById('upload-progress-msg');
    if (progressEl) {
        progressEl.innerHTML = '<div class="upload-success">✓ Загружено: ' +
            escapeHtml(dataset.name) + ' (' + dataset.rowCount + ' строк, ' +
            dataset.columns.length + ' колонок)</div>';
        setTimeout(function() {
            if (progressEl) progressEl.innerHTML = '';
        }, 3000);
    }
}

/**
 * Отображает список загруженных датасетов в боковой панели.
 */
function renderDatasetList() {
    var listEl = document.getElementById('dataset-list');
    if (!listEl) return;

    var datasets = getAllDatasets();
    if (datasets.length === 0) {
        listEl.innerHTML = '<div class="empty-list">Нет загруженных датасетов</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < datasets.length; i++) {
        var ds = datasets[i];
        var isActive = (ds.id === CURRENT_DATASET_ID);
        html += '<div class="dataset-item' + (isActive ? ' active' : '') + '" ' +
            'data-id="' + escapeHtml(ds.id) + '" ' +
            'onclick="selectDataset(\'' + escapeHtml(ds.id) + '\')">' +
            '<div class="dataset-item-icon">📊</div>' +
            '<div class="dataset-item-info">' +
            '<div class="dataset-item-name">' + escapeHtml(ds.name) + '</div>' +
            '<div class="dataset-item-meta">' + ds.rowCount + ' строк · ' + ds.columns.length + ' колонок</div>' +
            '</div>' +
            '<button class="dataset-item-delete" onclick="deleteDatasetById(\'' + escapeHtml(ds.id) + '\', event)" title="Удалить">×</button>' +
            '</div>';
    }
    listEl.innerHTML = html;
}

/**
 * Выбирает датасет как активный и обновляет UI.
 * @param {string} datasetId - ID датасета
 */
function selectDataset(datasetId) {
    setCurrentDataset(datasetId);
    var dataset = getDataset(datasetId);
    if (dataset) {
        renderDatasetList();
        renderDatasetPreview(dataset);
        // Обновляем выпадающие списки в редакторе графиков
        updateChartEditorDataset(dataset);
    }
}

/**
 * Удаляет датасет по ID с подтверждением.
 * @param {string} datasetId - ID датасета
 * @param {Event} event - Событие клика (для остановки всплытия)
 */
function deleteDatasetById(datasetId, event) {
    event.stopPropagation();
    var ds = getDataset(datasetId);
    if (!ds) return;
    if (confirm('Удалить датасет "' + ds.name + '"?')) {
        removeDataset(datasetId);
        renderDatasetList();
        var currentDs = getCurrentDataset();
        if (currentDs) {
            renderDatasetPreview(currentDs);
        } else {
            clearDatasetPreview();
        }
        showNotification('Датасет удалён', 'info');
    }
}

/**
 * Отображает предпросмотр данных датасета.
 * @param {Object} dataset - Объект датасета
 */
function renderDatasetPreview(dataset) {
    var previewEl = document.getElementById('dataset-preview');
    if (!previewEl) return;

    var stats = computeDatasetStats(dataset);
    var html = '<div class="preview-header">' +
        '<h3>📋 ' + escapeHtml(dataset.name) + '</h3>' +
        '<div class="preview-stats">' +
        '<span class="stat-badge">Строк: ' + stats.rowCount + '</span>' +
        '<span class="stat-badge">Колонок: ' + stats.columnCount + '</span>' +
        '<span class="stat-badge">Числовых: ' + stats.numericColumns + '</span>' +
        '<span class="stat-badge">Категориальных: ' + stats.categoricalColumns + '</span>' +
        '</div>' +
        '</div>';

    // Информация о колонках
    html += '<div class="columns-info">' +
        '<h4>Колонки датасета:</h4>' +
        '<div class="columns-grid">';

    for (var i = 0; i < dataset.columns.length; i++) {
        var col = dataset.columns[i];
        var typeIcon = col.type === 'number' ? '🔢' : (col.type === 'date' ? '📅' : '🔤');
        var typeLabel = col.type === 'number' ? 'число' : (col.type === 'date' ? 'дата' : 'текст');
        html += '<div class="column-badge type-' + col.type + '">' +
            typeIcon + ' ' + escapeHtml(col.name) +
            '<span class="col-type-label">' + typeLabel + '</span>' +
            '</div>';
    }
    html += '</div></div>';

    // Таблица предпросмотра данных (первые 10 строк)
    html += '<div class="data-table-wrapper"><h4>Предпросмотр данных (первые 10 строк):</h4>';
    html += '<div class="data-table-scroll"><table class="data-table"><thead><tr>';

    for (var j = 0; j < dataset.columns.length; j++) {
        html += '<th>' + escapeHtml(dataset.columns[j].name) + '</th>';
    }
    html += '</tr></thead><tbody>';

    var maxRows = Math.min(dataset.rows.length, 10);
    for (var r = 0; r < maxRows; r++) {
        html += '<tr>';
        for (var c = 0; c < dataset.columns.length; c++) {
            var cellVal = dataset.rows[r][dataset.columns[c].name];
            var displayVal = (cellVal === null || cellVal === undefined) ? '' : String(cellVal);
            html += '<td title="' + escapeHtml(displayVal) + '">' + escapeHtml(displayVal) + '</td>';
        }
        html += '</tr>';
    }

    if (dataset.rows.length > 10) {
        html += '<tr><td colspan="' + dataset.columns.length + '" class="more-rows">... ещё ' +
            (dataset.rows.length - 10) + ' строк</td></tr>';
    }

    html += '</tbody></table></div></div>';
    previewEl.innerHTML = html;
}

/**
 * Очищает предпросмотр датасета.
 */
function clearDatasetPreview() {
    var previewEl = document.getElementById('dataset-preview');
    if (previewEl) {
        previewEl.innerHTML = '<div class="empty-preview">Выберите или загрузите датасет</div>';
    }
}

/**
 * Открывает модальное окно загрузки датасета.
 */
function openUploadModal() {
    var modal = document.getElementById('upload-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Сбрасываем состояние input
        var fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.value = '';
        var progressEl = document.getElementById('upload-progress-msg');
        if (progressEl) progressEl.innerHTML = '';
    }
}

/**
 * Закрывает модальное окно загрузки датасета.
 */
function closeUploadModal() {
    var modal = document.getElementById('upload-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Экранирует HTML-спецсимволы для безопасного отображения.
 * @param {string} str - Входная строка
 * @returns {string} Экранированная строка
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
