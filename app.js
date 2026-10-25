const SNAPSHOT = window.WORLD_BANK_SNAPSHOT;
const YEAR = SNAPSHOT.year;
const BENFORD = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)));
const CRITICAL_CHI_SQUARE = 15.507;
const SERIES = {
  population: { indicator: 'SP.POP.TOTL', title: 'População por país', unit: 'habitantes', source: 'https://data.worldbank.org/indicator/SP.POP.TOTL', label: 'População, total' },
  gdp: { indicator: 'NY.GDP.MKTP.CD', title: 'PIB por país', unit: 'US$ correntes', source: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD', label: 'PIB (US$ corrente)' },
  area: { indicator: 'AG.LND.TOTL.K2', title: 'Área terrestre', unit: 'km²', source: 'https://data.worldbank.org/indicator/AG.LND.TOTL.K2', label: 'Área terrestre (km²)' },
};

const state = { active: 'population', datasets: {}, randomValues: [], seed: 20261025 };
const $ = (selector) => document.querySelector(selector);
const chart = $('#digit-chart');
const status = $('#chart-status');
const shell = $('.lab-shell');

function firstDigit(value) {
  const match = String(Math.abs(Number(value))).match(/[1-9]/);
  return match ? Number(match[0]) : null;
}

function summarize(values) {
  const counts = Array(9).fill(0);
  let valid = 0;
  for (const value of values) {
    const digit = firstDigit(value);
    if (digit) { counts[digit - 1] += 1; valid += 1; }
  }
  const observed = counts.map((count) => valid ? count / valid : 0);
  const chiSquare = valid ? observed.reduce((sum, frequency, index) => {
    const expectedCount = valid * BENFORD[index];
    const observedCount = counts[index];
    return sum + ((observedCount - expectedCount) ** 2) / expectedCount;
  }, 0) : 0;
  const totalDistance = observed.reduce((sum, frequency, index) => sum + Math.abs(frequency - BENFORD[index]), 0) / 2;
  return { counts, observed, total: valid, chiSquare, totalDistance };
}

function formatPercent(value, digits = 1) {
  return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function formatNumber(value) { return new Intl.NumberFormat('pt-BR').format(value); }

function getChiSquarePValue(statistic) {
  const x = statistic / 2;
  return Math.exp(-x) * (1 + x + (x ** 2) / 2 + (x ** 3) / 6);
}

function drawChart(summary) {
  const width = 720; const height = 330;
  const left = 48; const right = 20; const top = 22; const bottom = 38;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const maxValue = Math.max(0.35, ...BENFORD, ...summary.observed) * 1.12;
  const x = (index) => left + (index + 0.5) * (plotWidth / 9);
  const y = (value) => top + plotHeight * (1 - value / maxValue);
  const barWidth = plotWidth / 9 * 0.54;

  $('#chart-grid').innerHTML = '';
  $('#chart-bars').innerHTML = '';
  $('#chart-line').innerHTML = '';
  $('#chart-labels').innerHTML = '';

  for (let tick = 0; tick <= 3; tick += 1) {
    const value = maxValue * tick / 3;
    const yy = y(value);
    $('#chart-grid').insertAdjacentHTML('beforeend', `<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" stroke="#ddd7c9" stroke-width="1"/><text x="${left - 8}" y="${yy + 4}" text-anchor="end" fill="#55564d" font-size="10" font-family="DM Mono, monospace">${Math.round(value * 100)}%</text>`);
  }
  summary.observed.forEach((value, index) => {
    const barY = y(value); const barHeight = top + plotHeight - barY;
    $('#chart-bars').insertAdjacentHTML('beforeend', `<rect x="${x(index) - barWidth / 2}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="#476e64"><title>Algarismo ${index + 1}: observado ${formatPercent(value)}; Benford ${formatPercent(BENFORD[index])}</title></rect>`);
    $('#chart-labels').insertAdjacentHTML('beforeend', `<text x="${x(index)}" y="${height - 13}" text-anchor="middle" fill="#292b25" font-size="11" font-family="DM Mono, monospace">${index + 1}</text>`);
  });
  const points = BENFORD.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  $('#chart-line').innerHTML = `<polyline points="${points}" fill="none" stroke="#c45138" stroke-width="2.5" stroke-dasharray="6 5"/>${BENFORD.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="3.2" fill="#f7f2e5" stroke="#963b2b" stroke-width="1.5"><title>Algarismo ${index + 1}: Benford ${formatPercent(value)}</title></circle>`).join('')}`;
  $('#chart-svg-desc').textContent = `Barras observadas em uma amostra de ${formatNumber(summary.total)} valores e linha com as probabilidades teóricas de Benford. O algarismo 1 tem probabilidade de 30,1 por cento e o 9 de 4,6 por cento.`;
  chart.removeAttribute('hidden');
  status.hidden = true;
}

function setLoading(message = 'Buscando os dados no Banco Mundial…') {
  chart.setAttribute('hidden', '');
  status.hidden = false;
  status.classList.remove('is-error');
  status.textContent = message;
  shell.setAttribute('aria-busy', 'true');
}

function showError(message) {
  chart.setAttribute('hidden', '');
  status.hidden = false;
  status.classList.add('is-error');
  status.innerHTML = `${message}<button class="retry-button" id="retry-load" type="button">Tentar buscar novamente</button>`;
  $('#retry-load').addEventListener('click', loadRealData);
  shell.setAttribute('aria-busy', 'false');
}

function showEmpty(message) {
  chart.setAttribute('hidden', '');
  status.hidden = false;
  status.classList.remove('is-error');
  status.textContent = message;
  shell.setAttribute('aria-busy', 'false');
}

function renderAnalysis(summary, key, year = YEAR) {
  const isRandom = key === 'random';
  const pValue = getChiSquarePValue(summary.chiSquare);
  const compatible = summary.chiSquare <= CRITICAL_CHI_SQUARE;
  const leading = summary.observed.map((frequency, index) => ({ digit: index + 1, frequency })).sort((a, b) => b.frequency - a.frequency);
  let message;
  if (summary.total < 100) {
    message = `A lista tem ${formatNumber(summary.total)} valores válidos. Com uma amostra pequena, as oscilações entre algarismos podem ser grandes; interprete o gráfico com cautela.`;
  } else if (compatible) {
    message = `O algarismo ${leading[0].digit} lidera (${formatPercent(leading[0].frequency)}), enquanto ${leading[8].digit} aparece menos (${formatPercent(leading[8].frequency)}). O χ² fica abaixo do corte de 5%: nesta amostra, os dados são compatíveis com a distribuição de Benford.`;
  } else {
    message = `O algarismo ${leading[0].digit} lidera (${formatPercent(leading[0].frequency)}), enquanto ${leading[8].digit} aparece menos (${formatPercent(leading[8].frequency)}). O χ² supera o corte de 5%: esta lista se afasta da previsão de Benford.`;
  }
  if (isRandom) {
    const mode = $('#distribution').value;
    message = mode === 'uniform'
      ? `Os valores foram sorteados com probabilidade uniforme entre 1 e 1.000.000. Cada número tem a mesma chance, então a frequência do primeiro algarismo tende a ficar perto de 1/9, diferente da curva de Benford.`
      : `O logaritmo decimal dos valores foi sorteado uniformemente entre 0 e 6. Intervalos de primeiro algarismo têm larguras logarítmicas distintas, produzindo uma amostra que tende à distribuição de Benford.`;
  }

  $('#analysis-copy').textContent = message;
  $('#chi-square').textContent = summary.chiSquare.toFixed(2).replace('.', ',');
  $('#total-distance').textContent = formatPercent(summary.totalDistance, 1);
  const result = $('#test-result');
  result.classList.toggle('is-deviation', !compatible);
  if (summary.total < 100) {
    result.textContent = 'Amostra pequena: teste apenas ilustrativo';
    result.classList.add('is-deviation');
  } else {
    result.textContent = compatible
      ? `Compatível com Benford no corte de 5% (p ≈ ${pValue.toFixed(3).replace('.', ',')})`
      : `Diferença detectável no corte de 5% (p ≈ ${pValue.toFixed(3).replace('.', ',')})`;
  }
  $('#sample-count').textContent = `${formatNumber(summary.total)} valores · ${year}`;
  document.querySelectorAll('[data-observed]').forEach((cell, index) => {
    cell.textContent = formatPercent(summary.observed[index], 1);
  });
}

function renderDataset(key) {
  state.active = key;
  document.querySelectorAll('.dataset-button').forEach((button) => {
    const active = button.dataset.dataset === key;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const simulator = $('#simulator');
  simulator.hidden = key !== 'random';
  if (key === 'random') {
    $('#chart-kicker').textContent = 'DADOS SIMULADOS · COMPUTADOR';
    $('#chart-title').textContent = $('#distribution').value === 'uniform' ? 'Distribuição uniforme' : 'Distribuição log-uniforme';
    $('#chart-source').textContent = 'Amostra criada localmente pelo navegador com gerador pseudoaleatório e semente inicial reprodutível.';
    $('#sim-explanation').textContent = $('#distribution').value === 'uniform'
      ? 'Cada inteiro entre 1 e 1.000.000 tem a mesma chance. Será que os primeiros algarismos também ficam igualmente prováveis?'
      : 'A escala logarítmica é sorteada por igual entre 10⁰ e 10⁶. Em seguida, cada escala vira um número: 10ˣ.';
    $('#sample-size-value').value = formatNumber(Number($('#sample-size').value));
    const values = state.randomValues.length ? state.randomValues : generateRandom();
    state.randomValues = values;
    const summary = summarize(values);
    if (!summary.total) { showEmpty('A amostra não contém números positivos para analisar.'); return; }
    drawChart(summary);
    renderAnalysis(summary, key, 'amostra');
    shell.setAttribute('aria-busy', 'false');
    return;
  }

  const series = SERIES[key];
  $('#chart-kicker').textContent = 'DADOS REAIS · MUNDO';
  $('#chart-title').textContent = series.title;
  const data = state.datasets[key];
  if (!data) { setLoading(); return; }
  const summary = summarize(data.values);
  if (!summary.total) { showEmpty('Esta lista não contém valores positivos para analisar. Escolha outra série.'); return; }
  drawChart(summary);
  renderAnalysis(summary, key, YEAR);
  $('#chart-source').innerHTML = `Fonte: <a href="${series.source}" target="_blank" rel="noreferrer">Banco Mundial, ${series.label}</a>. Indicador ${series.indicator}, ano ${YEAR}.`;
  shell.setAttribute('aria-busy', 'false');
}

function fetchSeries(key) {
  const series = SERIES[key];
  const entries = SNAPSHOT.series[key]?.entries;
  if (!Array.isArray(entries) || !entries.length) throw new Error(`O retrato local de ${series.label} não está disponível.`);
  return { values: entries.map((row) => Number(row.value)), names: entries.map((row) => row.country), year: YEAR };
}

async function loadRealData() {
  setLoading('Preparando o retrato de dados do Banco Mundial…');
  try {
    const results = Object.keys(SERIES).map((key) => [key, fetchSeries(key)]);
    state.datasets = Object.fromEntries(results.map(([key, promise]) => [key, promise]));
    renderDataset(state.active);
  } catch (error) {
    showError(`Não consegui abrir o retrato local de dados. ${error.message}`);
  }
}

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateRandom() {
  const count = Number($('#sample-size').value);
  const random = randomGenerator(state.seed++);
  if ($('#distribution').value === 'log') {
    return Array.from({ length: count }, () => 10 ** (random() * 6));
  }
  return Array.from({ length: count }, () => Math.floor(random() * 999999) + 1);
}

document.querySelectorAll('.dataset-button').forEach((button) => {
  button.addEventListener('click', () => renderDataset(button.dataset.dataset));
});
$('#run-simulation').addEventListener('click', () => {
  state.randomValues = generateRandom();
  renderDataset('random');
});
$('#sample-size').addEventListener('input', () => {
  $('#sample-size-value').value = formatNumber(Number($('#sample-size').value));
});
$('#distribution').addEventListener('change', () => {
  if (state.active === 'random') {
    state.randomValues = generateRandom();
    renderDataset('random');
  }
});

loadRealData();
