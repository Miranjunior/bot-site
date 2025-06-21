/**************************************************
 *  Trade Desk Pro  –  script.js (versão 2025-06) *
 **************************************************/

/* ───────── Elementos do DOM ───────── */
// garante que 'ti' aponte para o objeto da biblioteca
const ti = window.technicalindicators;

const chartEl      = document.getElementById('chart');
const panelEl      = document.getElementById('signalPanel');
const priceBadge   = document.getElementById('priceBadge');
const changeBadge  = document.getElementById('changeBadge');
const bannerEl     = document.getElementById('eventBanner');
const tableBody    = document.getElementById('signalTableBody');

const pairSel  = document.getElementById('pairSelect');
const intSel   = document.getElementById('intervalSelect');
const typeSel  = document.getElementById('typeSelect');
document.getElementById('toggleSignals')
        .addEventListener('click', () => panelEl.classList.toggle('collapsed'));
document.querySelector('.close-signals')
        .addEventListener('click', () => panelEl.classList.add('collapsed'));

/* Botões laterais */
const fibBtn   = document.getElementById('fibBtn');
const trendBtn = document.getElementById('trendBtn');
const zoomBtn  = document.getElementById('zoomBtn');
const indBtn   = document.getElementById('indBtn');

fibBtn .onclick = toggleFib;
trendBtn.onclick = toggleTrend;
zoomBtn.onclick  = toggleZoom;
indBtn .onclick  = () => {
  indVisible = !indVisible;
  smaSeries.applyOptions({ visible: indVisible });
};

/* ───────── Estado global ───────── */
let chart, candleSeries, smaSeries, priceLine;
let wsCandle, wsTrade;
let candles = [], smaQ = [], markers = [];
let lastPrice = null, lastAbove = null, indVisible = true;
let fibLines = [], trendSeries = null, zoomed = false;
const smaPeriod = 14;

/* ───────── Inicialização ───────── */
pairSel.addEventListener('change', reload);
intSel .addEventListener('change', reload);
typeSel.addEventListener('change', applyType);

initChart();
loadData();

/* ───────── Funções principais ───────── */
function initChart() {
  chartEl.innerHTML = '';                 // limpa antigo
  chart = LightweightCharts.createChart(chartEl, {
    layout: { background: { color: '#0e1217' }, textColor: '#d1d5db' },
    grid:   { vertLines: { color: '#2c313a' }, horzLines: { color: '#2c313a' }},
    timeScale: {
      timeVisible: true, secondsVisible: true,
      localization: { timeFormatter: t => {
        const d = new Date(t * 1000);
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }}
    }
  });

  candleSeries = chart.addCandlestickSeries();
  smaSeries    = chart.addLineSeries({ color: '#22c55e', lineWidth: 2 });
  priceLine    = candleSeries.createPriceLine({ price: 0, color: '#22c55e', lineWidth: 2 });
}

async function loadData() {
  const pair = pairSel.value.toUpperCase();
  const tf   = intSel.value;

  bannerMsg(`Carregando ${pair}…`, true);

  /* histórico inicial (200 velas) */
  const hist = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${tf}&limit=200`)
                       .then(r => r.json());
  candles = hist.map(k => ({
    time:  k[0] / 1000,
    open:  +k[1],
    high:  +k[2],
    low:   +k[3],
    close: +k[4]
  }));
  candleSeries.setData(candles);

  smaQ = candles.slice(-smaPeriod).map(c => c.close);
  smaSeries.setData(calcSMA(candles));

  applyType();          // candle/line/area
  openSockets(pair, tf);
}

function reload() {
  closeSockets();
  initChart();
  loadData();
}

/* ───────── WebSockets ───────── */
function openSockets(sym, tf) {
  wsCandle = new WebSocket(`wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@kline_${tf}`);
  wsCandle.onmessage = (e) => {
    const k = JSON.parse(e.data).k;
    const c = {
      time:  k.t / 1000,
      open:  +k.o,
      high:  +k.h,
      low:   +k.l,
      close: +k.c
    };

    candleSeries.update(c);
    priceLine.applyOptions({ price: c.close, title: c.close.toFixed(2) });
    updateBadges(c.close);

    if (k.x) {                    // vela fechou
      candles.push(c);
      if (candles.length > 200) candles.shift();

      smaSeries.update({ time: c.time, value: updateSMAQueue(c.close, true) });
      checkSignal(c);
      askAI(c);                   // ← consulta OpenAI
    } else {                      // vela em formação
      smaSeries.update({ time: c.time, value: updateSMAQueue(c.close, false) });
      checkSignal(c);
    }

    chart.timeScale().scrollToRealTime();
  };

  /* stream de trades (price tick) */
  wsTrade = new WebSocket(`wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@trade`);
  wsTrade.onmessage = (e) => {
    const p = +JSON.parse(e.data).p;
    updateBadges(p);
  };
}

function closeSockets() {
  wsCandle?.close();
  wsTrade?.close();
}

/* ───────── Indicadores locais ───────── */
function calcSMA(arr) {
  return arr.map((d, i) => {
    if (i < smaPeriod - 1) return null;
    const slice = arr.slice(i - smaPeriod + 1, i + 1);
    const avg = slice.reduce((s, x) => s + x.close, 0) / smaPeriod;
    return { time: d.time, value: avg };
  }).filter(Boolean);
}

function updateSMAQueue(price, closed) {
  if (closed) smaQ.push(price);     // nova vela fechada
  else smaQ[smaQ.length - 1] = price;
  if (smaQ.length > smaPeriod) smaQ.shift();
  return smaQ.reduce((s, x) => s + x, 0) / smaQ.length;
}

/* technicalindicators helpers */
function getRSI(src) {
  const r = ti.rsi({ values: src.map(c => c.close), period: 14 });
  return r.length ? r[r.length - 1] : 50;
}
function getMACDHist(src) {
  const m = ti.macd({
    values: src.map(c => c.close),
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9
  });
  return m.length ? m[m.length - 1].histogram : 0;
}

/* ───────── IA (serverless) ───────── */
async function askAI(c) {
  const payload = {
    symbol:   pairSel.value.toUpperCase(),
    interval: intSel.value,
    price:    c.close,
    sma:      smaQ[smaQ.length - 1],
    rsi:      getRSI(candles),
    macdHist: getMACDHist(candles)
  };

  try {
    const res = await fetch('/.netlify/functions/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const sig = await res.json();   // {action,confidence,comment}

    if (sig.action !== 'WAIT') {
      addSignal(c.time, sig.action, c.close);
      bannerMsg(`${sig.action} (${Math.round(sig.confidence * 100)} %) – ${sig.comment}`,
                sig.action === 'BUY');
      console.log('IA sinal', sig);
    }
  } catch (e) {
    console.error('Erro IA', e);
  }
}

/* ───────── UI helpers ───────── */
function updateBadges(price) {
  priceBadge.textContent = price.toLocaleString('en-US', { minimumFractionDigits: 2 });
  if (lastPrice !== null) {
    const pct = ((price - lastPrice) / lastPrice * 100).toFixed(2);
    changeBadge.textContent = `${pct}%`;
    changeBadge.classList.toggle('negative', pct < 0);
  }
  lastPrice = price;
}

function bannerMsg(msg, pos = true) {
  bannerEl.textContent = msg;
  bannerEl.style.background = pos ? '#22c55e' : '#ef4444';
  bannerEl.classList.add('show');
  setTimeout(() => bannerEl.classList.remove('show'), 3000);
}

/* ───────── Sinais visuais ───────── */
function checkSignal(c) {
  const smaVal = smaQ[smaQ.length - 1];
  if (smaVal === undefined) return;
  const above = c.close > smaVal;
  if (lastAbove === null) { lastAbove = above; return; }
  if (above !== lastAbove) {
    addSignal(c.time, above ? 'BUY' : 'SELL', c.close);
    bannerMsg(`SINAL ${above ? 'BUY' : 'SELL'} (local)`, above);
  }
  lastAbove = above;
}

function addSignal(time, action, price) {
  markers.push({
    time,
    position: action === 'BUY' ? 'belowBar' : 'aboveBar',
    color: action === 'BUY' ? '#22c55e' : '#ef4444',
    shape: action === 'BUY' ? 'arrowUp' : 'arrowDown',
    text: `${action} ${price.toFixed(2)}`
  });
  candleSeries.setMarkers(markers.slice(-100));

  const row = `
   <tr>
     <td>${new Date(time * 1000).toLocaleTimeString('pt-BR')}</td>
     <td>${pairSel.value.toUpperCase()}</td>
     <td>${intSel.value}</td>
     <td class="${action === 'BUY' ? 'buy' : 'sell'}">${action}</td>
     <td>${price.toFixed(2)}</td>
   </tr>`;
  tableBody.insertAdjacentHTML('afterbegin', row);
  if (tableBody.rows.length > 60) tableBody.deleteRow(-1);
}

/* ───────── Botões laterais ───────── */
function toggleFib() {
  if (fibLines.length) {
    fibLines.forEach(l => candleSeries.removePriceLine(l));
    fibLines = [];
    return;
  }
  const highs = candles.map(c => c.high);
  const lows  = candles.map(c => c.low);
  const hi = Math.max(...highs), lo = Math.min(...lows);
  [0.236, 0.382, 0.5, 0.618, 0.786].forEach(r => {
    fibLines.push(candleSeries.createPriceLine({
      price: lo + (hi - lo) * r,
      color: 'rgba(255,165,0,.85)',
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: `${(r * 100).toFixed(1)} %`
    }));
  });
}

function toggleTrend() {
  if (trendSeries) {
    chart.removeSeries(trendSeries);
    trendSeries = null;
    return;
  }
  const first = candles[0], last = candles[candles.length - 1];
  trendSeries = chart.addLineSeries({ color: 'rgba(0,123,255,.85)', lineWidth: 2 });
  trendSeries.setData([{ time: first.time, value: first.close },
                       { time: last.time,  value: last.close }]);
}

function toggleZoom() {
  if (!zoomed) {
    const len = candles.length;
    chart.timeScale().setVisibleLogicalRange({ from: len - 60, to: len });
  } else {
    chart.timeScale().fitContent();
  }
  zoomed = !zoomed;
}

/* ───────── Visual (candle/line/area) ───────── */
function applyType() {
  const v = typeSel.value;
  candleSeries.applyOptions({ visible: v === 'candle' });
}

