// config.js — настройки приложения Excel BI (аналог config.json, но в формате JS).
// Загружается через <script src="config.js"> в index.html, что позволяет
// читать настройки через file:// без ошибок CORS.
//
// Переменная window.CONFIG доступна глобально и читается при инициализации приложения.
// Если этот файл отсутствует, используются значения по умолчанию из приложения.

window.CONFIG = {
    // Название приложения
    "appName": "Excel BI",

    // Максимальный размер загружаемого файла в байтах (50 МБ)
    "maxFileSizeBytes": 52428800,

    // Язык интерфейса: "ru" или "en"
    "language": "ru",

    // Тема оформления: "light" или "dark"
    "theme": "light",

    // Цветовые палитры для графиков
    "colorPalettes": {
        "default": [
            "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
            "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
            "#bcbd22", "#17becf"
        ],
        "superset": [
            "#1FA8C9", "#454E7C", "#F26F44", "#FAFAFA",
            "#3DBADD", "#6B6FA2", "#F5A16C", "#D3D3D3"
        ],
        "pastel": [
            "#AEC6CF", "#FFD1DC", "#B5EAD7", "#FFDAC1",
            "#E2F0CB", "#C7CEEA", "#F0E6FF", "#FCE4EC"
        ]
    },

    // Активная цветовая палитра
    "activePalette": "superset",

    // Настройки графиков по умолчанию
    "chartDefaults": {
        "width": 600,
        "height": 400,
        "animation": true,
        "showLegend": true,
        "showGrid": true
    },

    // Настройки дашборда
    "dashboardDefaults": {
        "columns": 2,
        "rowHeight": 400
    }
};
