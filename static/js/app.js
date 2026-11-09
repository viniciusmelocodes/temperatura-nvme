try {
    const savedTheme = localStorage.getItem('nvme-theme');
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    document.documentElement.dataset.theme = savedTheme || systemTheme;
} catch {
    document.documentElement.dataset.theme = 'light';
}

const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const themeLabel = document.getElementById('theme-label');
const sourceSelect = document.getElementById('source-select');
const intervalSelect = document.getElementById('interval-select');
let updateTimer;

function updateThemeButton() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    themeIcon.textContent = isDark ? '☀' : '☾';
    themeLabel.textContent = isDark ? 'Claro' : 'Escuro';
    themeToggle.setAttribute('aria-label', `Ativar tema ${isDark ? 'claro' : 'escuro'}`);
}

themeToggle.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try {
        localStorage.setItem('nvme-theme', theme);
    } catch {}
    updateThemeButton();
});
updateThemeButton();

try {
    const savedSource = localStorage.getItem('nvme-source');
    if (savedSource === 'sysfs' || savedSource === 'smartctl') {
        sourceSelect.value = savedSource;
    }
} catch {}

sourceSelect.addEventListener('change', () => {
    try {
        localStorage.setItem('nvme-source', sourceSelect.value);
    } catch {}
    update();
});

try {
    const savedInterval = localStorage.getItem('nvme-interval');
    if (['10', '30', '60'].includes(savedInterval)) {
        intervalSelect.value = savedInterval;
    }
} catch {}

function configureUpdateInterval() {
    const seconds = Number(intervalSelect.value);
    document.getElementById('interval-label').textContent = `A cada ${seconds} segundos`;
    clearInterval(updateTimer);
    updateTimer = setInterval(update, seconds * 1000);
}

intervalSelect.addEventListener('change', () => {
    try {
        localStorage.setItem('nvme-interval', intervalSelect.value);
    } catch {}
    update();
    configureUpdateInterval();
});

function update() {
    fetch(`/api/temp?source=${encodeURIComponent(sourceSelect.value)}`)
        .then(response => {
            if (!response.ok) throw new Error('Falha ao consultar temperatura');
            return response.json();
        })
        .then(data => {
            const temperatureElement = document.getElementById('temp');
            const status = document.getElementById('status');
            const historyList = document.getElementById('history');
            const historyCount = document.getElementById('history-count');
            const historyEmpty = document.getElementById('history-empty');

            historyList.replaceChildren();
            data.history.slice().reverse().forEach(reading => {
                const item = document.createElement('li');
                const time = document.createElement('time');
                const temperature = document.createElement('strong');
                const readingSource = document.createElement('span');
                const readingDetails = document.createElement('span');

                time.dateTime = reading.time;
                time.textContent = new Date(reading.time).toLocaleString('pt-BR');
                temperature.textContent = `${reading.temp} °C`;
                readingSource.className = 'history-source';
                readingSource.textContent = reading.source;
                readingDetails.className = 'history-reading';
                readingDetails.append(temperature, readingSource);
                item.append(time, readingDetails);
                historyList.append(item);
            });
            historyCount.textContent = `${data.history.length} ${data.history.length === 1 ? 'leitura' : 'leituras'}`;
            historyEmpty.hidden = data.history.length > 0;

            if (data.temp === null) {
                temperatureElement.textContent = '--';
                temperatureElement.className = 'temp';
                status.textContent = data.error || `Sem leitura via ${sourceSelect.value}`;
                status.className = 'status error';
                return;
            }

            temperatureElement.textContent = data.temp;

            if (data.temp < 50) {
                temperatureElement.className = 'temp temp--ok';
                status.textContent = 'Temperatura normal';
                status.className = 'status ok';
            } else if (data.temp < 60) {
                temperatureElement.className = 'temp temp--warm';
                status.textContent = 'Um pouco quente';
                status.className = 'status warm';
            } else {
                temperatureElement.className = 'temp temp--hot';
                status.textContent = 'Temperatura alta!';
                status.className = 'status hot';
            }
        })
        .catch(() => {
            document.getElementById('temp').textContent = '--';
            document.getElementById('temp').className = 'temp';
            document.getElementById('status').textContent = 'Erro de conexão';
            document.getElementById('status').className = 'status error';
        });
}

update();
configureUpdateInterval();
