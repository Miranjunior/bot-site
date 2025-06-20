/* ===== CONFIG ===== */
const CHART_LIMIT      = 200;   // velas históricas
const chartDiv         = document.getElementById('chart');
const pairSelect       = document.getElementById('pairSelect');
const intervalSelect   = document.getElementById('intervalSelect');
const signalEl         = document.getElementById('signal');

const BOT_TOKEN = '';   // preencha se quiser Telegram
const CHAT_ID   = '';

/* ===== STATE ===== */
let candleSeries, smaSeries, bbUpperSeries, bbLowerSeries;
let rsiSeries, macdLineSeries, macdSignalSeries, macdHistSeries;
let ws, prices = [], lastPriceAbove = null;
let currentPair      = pairSelect.value;     // ex.: btcusdt
let currentInterval  = intervalSelect.value; // ex.: 1m

/* ===== INIT ===== */
initChart();
loadPair(currentPair, currentInterval);

pairSelect.addEventListener('change', () => {
  currentPair = pairSelect.value;
  loadPair(currentPair, currentInterval);
});

intervalSelect.addEventListener('change', () => {
  currentInterval = intervalSelect.value;
  loadPair(currentPair, currentInterval);
});

/* ===== CREATE CHART ===== */
function initChart() {
  window.chart = LightweightCharts.createChart(chartDiv, {
    layout: { background: { color: '#0d1117' }, textColor: '#c9d1d9' },
    grid:   { vertLines: { color: '#30363d' }, horzLines: { color: '#30363d' } },
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: { visible: true },
    leftPriceScale:  { visible: true },  // escala extra p/ RSI & MACD
  });

  // --- Price (escala direita)
  candleSeries  = chart.addCandlestickSeries();
  smaSeries     = chart.addLineSeries({ color: '#f7931a', lineWidth: 1 });
  bbUpperSeries = chart.addLineSeries({ color: '#aaaaaa', lineStyle: 2, lineWidth: 1 });
  bbLowerSeries = chart.addLineSeries({ color: '#aaaaaa', lineStyle: 2, lineWidth: 1 });

  // --- Indicadores (escala esquerda)
  rsiSeries       = chart.addLineSeries({ color: '#00bfff', lineWidth: 1, priceScaleId: 'left' });
  macdLineSeries  = chart.addLineSeries({ color: '#2ecc71', lineWidth: 1, priceScaleId: 'left' });
  macdSignalSeries= chart.addLineSeries({ color: '#e74c3c', lineWidth: 1, priceScaleId: 'left' });
  macdHistSeries  = chart.addHistogramSeries({ color: '#9b59b6', priceScaleId: 'left', priceLineVisible: false });
}

/* ===== LOAD DATA ===== */
async function loadPair(pair, interval) {
  // reset dados
  prices = []; lastPriceAbove = null;
  [candleSeries, smaSeries, bbUpperSeries, bbLowerSeries,
   rsiSeries, macdLineSeries, macdSignalSeries, macdHistSeries]
   .forEach(s => s.setData([]));
  if (ws) ws.close();

  // REST histórico
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair.toUpperCase()}&interval=${interval}&limit=${CHART_LIMIT}`;
  const klines = await fetch(url).then(r => r.json());

  const history = klines.map(k => ({
    time:  k[0] / 1000,
    open:  +k[1],
    high:  +k[2],
    low:   +k[3],
    close: +k[4],
  }));
  candleSeries.setData(history);

  history.forEach(p => {
    prices.push(p.close);
    if (prices.length > 26) prices.shift();
    updateIndicators(p.time);
  });

  subscribeWs(pair, interval);
}

/* ===== WEBSOCKET ===== */
function subscribeWs(pair, interval) {
  ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@kline_${interval}`);
  ws.onmessage = e => {
    const k = JSON.parse(e.data).k;
    const point = {
      time:  k.t / 1000,
      open:  +k.o,
      high:  +k.h,
      low:   +k.l,
      close: +k.c,
    };

    candleSeries.update(point);

    if (k.x) { // candle fechado
      prices.push(point.close);
      if (prices.length > 26) prices.shift();
      updateIndicators(point.time);
      detectSignal(point.close);
    }
  };
  ws.onclose = () => console.log('WS closed');
}

/* ===== INDICATORS ===== */
function updateIndicators(time) {
  // --- SMA 20
  if (prices.length >= 20) {
    const sma = avg(prices.slice(-20));
    smaSeries.update({ time, value: sma });
  }

  // --- Bollinger 20, 2σ
  if (prices.length >= 20) {
    const bb = technicalindicators.BollingerBands.calculate({
      period: 20, stdDev: 2, values: prices.slice(-20),
    }).pop();
    bbUpperSeries.update({ time, value: bb.upper });
    bbLowerSeries.update({ time, value: bb.lower });
  }

  // --- RSI 14
  if (prices.length >= 14) {
    const rsi = technicalindicators.RSI.calculate({
      period: 14, values: prices.slice(-14),
    }).pop();
    rsiSeries.update({ time, value: rsi });
  }

  // --- MACD (12,26,9)
  if (prices.length >= 26) {
    const m = technicalindicators.MACD.calculate({
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      values: prices.slice(-26), // usa 26 pontos
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    }).pop();
    macdLineSeries.update({ time, value: m.MACD });
    macdSignalSeries.update({ time, value: m.signal });
    macdHistSeries.update({ time, value: m.histogram });
  }
}

/* ===== SIGNAL + ALERTS ===== */
function detectSignal(price) {
  const last = smaSeries.lastValue();
  if (!last) return;                    // ainda não temos SMA
  const sma = last.value;

  const priceAbove = price > sma;
  if (lastPriceAbove === null) { lastPriceAbove = priceAbove; return; }

  if (priceAbove !== lastPriceAbove) {
    const type = priceAbove ? 'COMPRA (Call)' : 'VENDA (Put)';
    signalEl.textContent = `Sinal gerado: ${type}`;
    signalEl.style.color = priceAbove ? '#2ecc71' : '#e74c3c';
    playSound();
    pushNotification(type);
    sendTelegram(type, price.toFixed(2));
  }
  lastPriceAbove = priceAbove;
}

/* ===== UTILS ===== */
function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

/* ===== AUDIO ===== */
function playSound() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = 600;
  o.connect(g); g.connect(ctx.destination); g.gain.value = 0.1;
  o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 250);
}

/* ===== DESKTOP NOTIF ===== */
function pushNotification(msg) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification('Trade Insights', { body: msg });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification('Trade Insights', { body: msg });
    });
  }
}

/* ===== TELEGRAM ===== */
function sendTelegram(type, price) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const text = `${type} | ${currentPair.toUpperCase()} ${price} (${currentInterval})`;
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  }).catch(e => console.error('TG', e));
}
