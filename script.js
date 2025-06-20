// script.js atualizado com lógica para exibir gráficos e sinais em tempo real

// Configuração inicial
const chartContainer = document.getElementById('chart');
let chart, candleSeries, smaSeries, socket;

const chartConfig = {
  layout: {
    background: { color: '#0e1217' },
    textColor: '#D1D5DB'
  },
  grid: {
    vertLines: { color: '#2c313a' },
    horzLines: { color: '#2c313a' },
  },
  timeScale: {
    timeVisible: true,
    secondsVisible: true,
  },
};

function initChart() {
  if (chart) chart.remove();
  chart = LightweightCharts.createChart(chartContainer, chartConfig);
  candleSeries = chart.addCandlestickSeries();
  smaSeries = chart.addLineSeries({
    color: '#4ade80',
    lineWidth: 2
  });
}

function calculateSMA(data, period = 14) {
  const sma = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
    sma.push({ time: data[i].time, value: sum / period });
  }
  return sma;
}

function fetchHistorical(pair = 'btcusdt', interval = '1m') {
  fetch(`https://api.binance.com/api/v3/klines?symbol=${pair.toUpperCase()}&interval=${interval}&limit=200`)
    .then(res => res.json())
    .then(data => {
      const candles = data.map(d => ({
        time: d[0] / 1000,
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4])
      }));
      candleSeries.setData(candles);
      smaSeries.setData(calculateSMA(candles));
    });
}

function subscribeToSocket(pair = 'btcusdt', interval = '1m') {
  if (socket) socket.close();
  socket = new WebSocket(`wss://stream.binance.com:9443/ws/${pair.toLowerCase()}@kline_${interval}`);

  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    const k = msg.k;
    const newCandle = {
      time: k.t / 1000,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
    };
    candleSeries.update(newCandle);
  };
}

function updateChart() {
  const pair = document.getElementById('pairSelect').value;
  const interval = document.getElementById('intervalSelect').value;
  const type = document.getElementById('typeSelect').value;

  initChart();
  fetchHistorical(pair, interval);
  subscribeToSocket(pair, interval);
}

document.addEventListener('DOMContentLoaded', () => {
  updateChart();
  document.querySelectorAll('.dropdown select').forEach(select => {
    select.addEventListener('change', updateChart);
  });
});
