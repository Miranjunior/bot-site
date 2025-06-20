// script.js
import { createChart } from 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.1/+esm';

let chart, candleSeries, lineSeries, areaSeries, smaSeries;
let socket;

const chartContainer = document.getElementById('chart');

function initChart() {
  chartContainer.innerHTML = '';
  chart = createChart(chartContainer, {
    layout: {
      background: { color: '#0e1217' },
      textColor: '#ffffff',
    },
    grid: {
      vertLines: { color: '#2c313a' },
      horzLines: { color: '#2c313a' },
    },
    timeScale: { timeVisible: true, secondsVisible: true },
  });

  candleSeries = chart.addCandlestickSeries();
  lineSeries = chart.addLineSeries({ visible: false });
  areaSeries = chart.addAreaSeries({ visible: false });
  smaSeries = chart.addLineSeries({ color: '#4ade80', lineWidth: 2 });
}

function fetchHistoricalData(pair, interval) {
  const apiUrl = `https://api.binance.com/api/v3/klines?symbol=${pair.toUpperCase()}&interval=${interval}&limit=200`;
  return fetch(apiUrl)
    .then(res => res.json())
    .then(data => data.map(candle => ({
      time: candle[0] / 1000,
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4])
    })));
}

function calculateSMA(data, period = 9) {
  return data.map((d, i) => {
    if (i < period - 1) return { time: d.time, value: null };
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val.close, 0);
    return { time: d.time, value: sum / period };
  }).filter(d => d.value !== null);
}

function connectSocket(pair, interval, type) {
  if (socket) socket.close();

  const stream = `${pair.toLowerCase()}@kline_${interval}`;
  socket = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);

  socket.onmessage = e => {
    const data = JSON.parse(e.data);
    const k = data.k;

    const candlestick = {
      time: k.t / 1000,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c)
    };

    candleSeries.update(candlestick);
    lineSeries.update({ time: candlestick.time, value: candlestick.close });
    areaSeries.update({ time: candlestick.time, value: candlestick.close });
    updateSMA();
    renderSignal(candlestick);
  };
}

function updateSMA() {
  const seriesData = candleSeries._internal__series._internal__data._internal__items;
  const formatted = Array.from(seriesData).map(item => item._internal_value);
  const sma = calculateSMA(formatted);
  smaSeries.setData(sma);
}

function renderSignal(candle) {
  const lastClose = candle.close;
  const lastOpen = candle.open;
  const direction = lastClose > lastOpen ? 'ALTA' : 'BAIXA';
  const message = `SINAL: Comprar para ${direction} | Duração: 1 minuto`;

  const banner = document.getElementById('updateBanner');
  banner.innerText = message;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 5000);
}

async function startChart() {
  const pair = document.getElementById('pairSelect').value;
  const interval = document.getElementById('intervalSelect').value;
  const type = document.getElementById('typeSelect').value;

  initChart();
  const historicalData = await fetchHistoricalData(pair, interval);
  candleSeries.setData(historicalData);
  lineSeries.setData(historicalData.map(d => ({ time: d.time, value: d.close })));
  areaSeries.setData(historicalData.map(d => ({ time: d.time, value: d.close })));
  smaSeries.setData(calculateSMA(historicalData));

  candleSeries.applyOptions({ visible: type === 'candle' });
  lineSeries.applyOptions({ visible: type === 'line' });
  areaSeries.applyOptions({ visible: type === 'area' });

  connectSocket(pair, interval, type);
}

['pairSelect', 'intervalSelect', 'typeSelect'].forEach(id => {
  document.getElementById(id).addEventListener('change', startChart);
});

startChart();
