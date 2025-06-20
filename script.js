diff --git a/script.js b/script.js
index cb69e0102aabe6b909bb755b150022d1cc1a1598..56f346b21ce9d24af920f06a0c7359f9e8f097d2 100644
--- a/script.js
+++ b/script.js
@@ -1,90 +1,148 @@
 // script.js atualizado com lógica para exibir gráficos e sinais em tempo real
 
 // Configuração inicial
 const chartContainer = document.getElementById('chart');
+const eventBanner = document.getElementById('eventBanner');
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
 
-function initChart() {
+function initChart(type = 'candle') {
   if (chart) chart.remove();
   chart = LightweightCharts.createChart(chartContainer, chartConfig);
-  candleSeries = chart.addCandlestickSeries();
+  switch (type) {
+    case 'line':
+      candleSeries = chart.addLineSeries();
+      break;
+    case 'area':
+      candleSeries = chart.addAreaSeries({
+        lineColor: '#4ade80',
+        topColor: 'rgba(34,197,94,0.4)',
+        bottomColor: 'rgba(34,197,94,0.1)'
+      });
+      break;
+    default:
+      candleSeries = chart.addCandlestickSeries();
+  }
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
 
-function fetchHistorical(pair = 'btcusdt', interval = '1m') {
+function fetchHistorical(pair = 'btcusdt', interval = '1m', type = 'candle') {
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
-      candleSeries.setData(candles);
+      if (type === 'candle') {
+        candleSeries.setData(candles);
+      } else {
+        const line = candles.map(c => ({ time: c.time, value: c.close }));
+        candleSeries.setData(line);
+      }
       smaSeries.setData(calculateSMA(candles));
     });
 }
 
-function subscribeToSocket(pair = 'btcusdt', interval = '1m') {
+function subscribeToSocket(pair = 'btcusdt', interval = '1m', type = 'candle') {
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
-    candleSeries.update(newCandle);
+    if (type === 'candle') {
+      candleSeries.update(newCandle);
+    } else {
+      candleSeries.update({ time: newCandle.time, value: newCandle.close });
+    }
   };
 }
 
 function updateChart() {
   const pair = document.getElementById('pairSelect').value;
   const interval = document.getElementById('intervalSelect').value;
   const type = document.getElementById('typeSelect').value;
 
-  initChart();
-  fetchHistorical(pair, interval);
-  subscribeToSocket(pair, interval);
+  initChart(type);
+  fetchHistorical(pair, interval, type);
+  subscribeToSocket(pair, interval, type);
 }
 
 document.addEventListener('DOMContentLoaded', () => {
   updateChart();
-  document.querySelectorAll('.dropdown select').forEach(select => {
-    select.addEventListener('change', updateChart);
+  ['pairSelect', 'intervalSelect', 'typeSelect'].forEach(id => {
+    document.getElementById(id).addEventListener('change', updateChart);
+  });
+
+  document.querySelectorAll('.sidebar li').forEach((item, idx) => {
+    item.addEventListener('click', () => handleSidebar(idx));
   });
+
+  const toggle = document.getElementById('signalToggle');
+  if (toggle) toggle.addEventListener('click', toggleSignals);
 });
+
+function handleSidebar(index) {
+  const signalPanel = document.querySelector('.signal-panel');
+  if (!signalPanel) return;
+
+  switch (index) {
+    case 0:
+      signalPanel.classList.add('hidden');
+      break;
+    case 1:
+      toggleSignals();
+      break;
+    default:
+      showBanner('Funcionalidade em desenvolvimento');
+  }
+}
+
+function toggleSignals() {
+  const panel = document.querySelector('.signal-panel');
+  if (panel) panel.classList.toggle('hidden');
+}
+
+function showBanner(text) {
+  if (!eventBanner) return;
+  eventBanner.textContent = text;
+  eventBanner.classList.add('show');
+  setTimeout(() => eventBanner.classList.remove('show'), 3000);
+}
