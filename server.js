// Plik: server.js (WERSJA DLA RENDER.COM)

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000; // Render używa portu 10000

app.use(cors());
app.use(express.text({ type: '*/*' }));

// Render udostępnia trwały dysk w tej ścieżce
const LOG_DIR = process.env.RENDER_DISK_PATH || __dirname;
const logFilePath = path.join(LOG_DIR, 'form_events.log');

// ENDPOINT 1: Odbieranie danych ze skryptu śledzącego
app.post('/api/track', async (req, res) => {
  try {
    const eventData = JSON.parse(req.body); 
    eventData.serverTimestamp = new Date().toISOString();
    
    console.log('Received event:', eventData);

    const logEntry = JSON.stringify(eventData) + '\n';
    // Używamy fs.appendFile do zapisu na trwałym dysku Render
    await fs.appendFile(logFilePath, logEntry);

    res.status(200).json({ message: 'Event received' });
  } catch (error) {
    console.error('Error in /api/track:', error);
    res.status(400).json({ message: 'Bad Request' });
  }
});

// ENDPOINT 2: Serwowanie danych do dashboardu
app.get('/api/data', async (req, res) => {
  try {
    const data = await fs.readFile(logFilePath, 'utf8');
    let events = data.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line));
    
    const allFormIds = [...new Set(events.map(e => e.form_id))];
    const requestedFormId = req.query.formId;
    if (requestedFormId) {
        events = events.filter(e => e.form_id === requestedFormId);
    }

    // Twoja oryginalna logika przetwarzania - jest w porządku
    const uniqueUsers = new Set(events.map(e => e.user_id));
    const formSessions = new Set();
    const submissions = new Set();
    const abandonments = new Set();
    const fieldInteractions = {};
    const topAbandonmentFields = {};
    const validationErrors = {};
    const uniqueStarters = new Set();
    const uniqueSubmitters = new Set();
    const sessionStartTimes = new Map();
    let totalSubmissionTime = 0;
    for (const event of events) {
      const formSession = event.form_session_id;
      const user = event.user_id;
      if (event.event === 'form_start') {
        formSessions.add(formSession);
        uniqueStarters.add(user);
        sessionStartTimes.set(formSession, new Date(event.timestamp));
      }
      if (event.event === 'form_submission') {
        submissions.add(formSession);
        uniqueSubmitters.add(user);
        if (sessionStartTimes.has(formSession)) {
            totalSubmissionTime += (new Date(event.timestamp) - sessionStartTimes.get(formSession));
        }
      }
      if (event.event === 'form_abandonment') {
        abandonments.add(formSession);
        if (event.last_interacted_field) {
            topAbandonmentFields[event.last_interacted_field] = (topAbandonmentFields[event.last_interacted_field] || 0) + 1;
        }
      }
      if (event.event === 'field_interaction') {
        fieldInteractions[event.field_id] = (fieldInteractions[event.field_id] || 0) + 1;
      }
      if (event.event === 'validation_error') {
        validationErrors[event.field_id] = (validationErrors[event.field_id] || 0) + 1;
      }
    }
    const submissionCount = submissions.size;
    const avgTimeToSubmitSec = submissionCount > 0 ? ((totalSubmissionTime / submissionCount) / 1000).toFixed(1) : 0;
    const sortObjectByValue = obj => Object.fromEntries(Object.entries(obj).sort(([,a],[,b]) => b-a));
    const responseData = {
      allFormIds,
      kpis: {
        totalUniqueUsers: uniqueUsers.size, starts: formSessions.size, submissions: submissionCount,
        abandonments: abandonments.size, conversionRate: formSessions.size > 0 ? (submissionCount / formSessions.size * 100).toFixed(1) : 0,
        uniqueStarters: uniqueStarters.size, uniqueSubmitters: uniqueSubmitters.size, avgTimeToSubmit: avgTimeToSubmitSec
      },
      charts: {
        fieldInteractions: sortObjectByValue(fieldInteractions), topAbandonmentFields: sortObjectByValue(topAbandonmentFields), validationErrors: sortObjectByValue(validationErrors)
      }
    };
    res.json(responseData);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const emptyData = { allFormIds: [], kpis: { totalUniqueUsers: 0, starts: 0, submissions: 0, abandonments: 0, conversionRate: 0, uniqueStarters: 0, uniqueSubmitters: 0, avgTimeToSubmit: 0 }, charts: { fieldInteractions: {}, topAbandonmentFields: {}, validationErrors: {} } };
      return res.json(emptyData);
    }
    console.error('Error in /api/data:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// ENDPOINT 3: Serwowanie pliku HTML dashboardu
app.get('/', (req, res) => {
  // Wklejamy tu ten sam kod HTML co ostatnio (wersja czytelna)
  res.send(`
  <!DOCTYPE html>
  <html lang="pl">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dashboard Analizy Formularzy</title>
      <style>@import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap');:root{--primary-color:#3498db;--secondary-color:#2ecc71;--danger-color:#e74c3c;--background-color:#f4f6f8;--card-background-color:#ffffff;--text-color:#34495e;--light-text-color:#7f8c8d;--border-color:#eaecf1;--shadow-color:rgba(0,0,0,0.08)}body{font-family:'Lato',sans-serif;background-color:var(--background-color);color:var(--text-color);margin:0;padding:20px}.container{max-width:1400px;margin:auto;padding:0 20px}h1{font-size:2.2em;color:var(--text-color);margin-bottom:20px}h2{font-size:1.5em;color:var(--text-color);border-bottom:2px solid var(--border-color);padding-bottom:10px;margin-top:40px;margin-bottom:20px}.header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px;margin-bottom:30px}.filter-container{display:flex;align-items:center;gap:10px;background-color:var(--card-background-color);padding:10px 15px;border-radius:8px;box-shadow:0 2px 4px var(--shadow-color)}.filter-container label{font-weight:bold;color:var(--light-text-color)}#form-filter{padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;background-color:#fff;font-size:1em;min-width:200px}.kpi-container{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px}.kpi-card{background:var(--card-background-color);padding:25px;border-radius:12px;box-shadow:0 4px 12px var(--shadow-color);text-align:center;transition:transform .2s,box-shadow .2s}.kpi-card:hover{transform:translateY(-5px);box-shadow:0 8px 16px rgba(0,0,0,.12)}.kpi-card .value{font-size:3em;font-weight:700;color:var(--primary-color);line-height:1.1}.kpi-card .label{font-size:1em;color:var(--light-text-color);margin-top:10px}.chart-container{background:var(--card-background-color);padding:20px;border-radius:12px;box-shadow:0 4px 12px var(--shadow-color);margin-bottom:30px}@media (max-width:768px){body{padding:10px}.container{padding:0 10px}h1{font-size:1.8em}.header{flex-direction:column;align-items:flex-start}.kpi-container{grid-template-columns:1fr 1fr}.kpi-card .value{font-size:2.2em}}@media (max-width:480px){.kpi-container{grid-template-columns:1fr}}</style>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  </head>
  <body>
      <div class="container">
          <div class="header"><h1>Dashboard Analizy Formularzy</h1><div class="filter-container"><label for="form-filter">Filtruj wg formularza:</label><select id="form-filter"><option value="">Wszystkie formularze</option></select></div></div>
          <h2>Kluczowe Wskaźniki (KPI)</h2>
          <div class="kpi-container"><div class="kpi-card"><div id="kpi-unique-users" class="value">0</div><div class="label">Wszystkich unikalnych użytkowników</div></div><div class="kpi-card"><div id="kpi-starts" class="value">0</div><div class="label">Rozpoczętych sesji</div></div><div class="kpi-card"><div id="kpi-submissions" class="value">0</div><div class="label">Wysłanych formularzy</div></div><div class="kpi-card"><div id="kpi-conversion" class="value">0%</div><div class="label">Współczynnik konwersji</div></div><div class="kpi-card"><div id="kpi-avg-time" class="value">0s</div><div class="label">Śr. czas do wysłania</div></div></div>
          <h2>Lejek Konwersji Formularza</h2><div class="chart-container"><canvas id="funnelChart"></canvas></div>
          <h2>Popularność Pól (Pierwsza Interakcja)</h2><div class="chart-container"><canvas id="fieldChart"></canvas></div>
          <h2>Pola powodujące porzucenie formularza</h2><div class="chart-container"><canvas id="abandonmentChart"></canvas></div>
          <h2>Pola z błędami walidacji</h2><div class="chart-container"><canvas id="errorChart"></canvas></div>
      </div>
      <script>
          document.addEventListener('DOMContentLoaded', function() {
              const chartInstances = {};
              const kpiElements = { uniqueUsers: document.getElementById('kpi-unique-users'), starts: document.getElementById('kpi-starts'), submissions: document.getElementById('kpi-submissions'), conversion: document.getElementById('kpi-conversion'), avgTime: document.getElementById('kpi-avg-time'), };
              const createOrUpdateChart = (id, type, chartData, chartTitle, color = 'rgba(54, 162, 235, 0.6)') => {
                  if (chartInstances[id]) { chartInstances[id].destroy(); }
                  const ctx = document.getElementById(id).getContext('2d');
                  chartInstances[id] = new Chart(ctx, { type: type, data: { labels: Object.keys(chartData), datasets: [{ label: chartTitle, data: Object.values(chartData), backgroundColor: color }] }, options: { scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false }, title: { display: true, text: chartTitle } } } });
              };
              const renderDashboard = (data) => {
                  kpiElements.uniqueUsers.textContent = data.kpis.totalUniqueUsers;
                  kpiElements.starts.textContent = data.kpis.starts;
                  kpiElements.submissions.textContent = data.kpis.submissions;
                  kpiElements.conversion.textContent = data.kpis.conversionRate + '%';
                  kpiElements.avgTime.textContent = data.kpis.avgTimeToSubmit + 's';
                  createOrUpdateChart('funnelChart', 'bar', { 'Rozpoczęte': data.kpis.starts, 'Ukończone': data.kpis.submissions, 'Porzucone': data.kpis.abandonments }, 'Lejek Konwersji');
                  createOrUpdateChart('fieldChart', 'bar', data.charts.fieldInteractions, 'Popularność Pól (Pierwsza Interakcja)');
                  createOrUpdateChart('abandonmentChart', 'bar', data.charts.topAbandonmentFields, 'Najczęstsze pola porzuceń', 'rgba(255, 159, 64, 0.6)');
                  createOrUpdateChart('errorChart', 'bar', data.charts.validationErrors, 'Pola generujące najwięcej błędów', 'rgba(255, 99, 132, 0.6)');
              };
              const populateFilter = (formIds) => {
                  const filter = document.getElementById('form-filter');
                  while (filter.options.length > 1) { filter.remove(1); }
                  formIds.forEach(id => { const option = document.createElement('option'); option.value = id; option.textContent = id; filter.appendChild(option); });
              };
              const fetchData = async (formId = '') => {
                  try {
                      const url = formId ? \`/api/data?formId=\${encodeURIComponent(formId)}\` : '/api/data';
                      const response = await fetch(url);
                      if (!response.ok) { throw new Error('Network response was not ok'); }
                      const data = await response.json();
                      if (!formId) { populateFilter(data.allFormIds); }
                      renderDashboard(data);
                  } catch (error) { console.error("Błąd pobierania danych:", error); }
              };
              document.getElementById('form-filter').addEventListener('change', (event) => { fetchData(event.target.value); });
              fetchData();
              setInterval(() => fetchData(document.getElementById('form-filter').value), 30000); 
          });
      </script>
  </body>
  </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Tracking server running on port ${PORT}`);
});