// --- Config ----
const CHART_LIMIT   = 200;            // velas históricas
const INTERVAL      = '1m';
const chartDiv      = document.getElementById('chart');
const pairSelect    = document.getElementById('pairSelect');
const signalEl      = document.getElementById('signal');

let candleSeries, smaSeries, ws, prices = [], lastPriceAbove = null;

initChart();
loadPair(pairSelect.value);
pairSelect.addEventListener('change', () => loadPair(pairSelect.value));

// ------------ Funções --------------
function initChart() {
  window.chart = LightweightCharts.createChart(chartDiv, {
    layout:       { background:{color:'#0d1117'}, textColor:'#c9d1d9' },
    grid:         { vertLines:{color:'#30363d'}, horzLines:{color:'#30363d'} },
    timeScale:    { timeVisible:true, secondsVisible:false },
  });
  candleSeries = chart.addCandlestickSeries();
  smaSeries    = chart.addLineSeries({ color:'#f7931a', lineWidth:1 });
}

async function loadPair(pair) {
  // limpa tudo
  prices = []; lastPriceAbove = null;
  candleSeries.setData([]); smaSeries.setData([]);
  if (ws) ws.close();

  // 1️⃣ Histórico via REST
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair.toUpperCase()}&interval=${INTERVAL}&limit=${CHART_LIMIT}`;
  const klines = await fetch(url).then(r => r.json());
  const history = klines.map(k => ({
      time:  k[0] / 1000,
      open:  +k[1], high:+k[2], low:+k[3], close:+k[4]
  }));
  candleSeries.setData(history);

  // SMA-20 histórico
  history.forEach(p => {
     prices.push(p.close);
     if (prices.length > 20) prices.shift();
     const sma = prices.reduce((a,b)=>a+b,0) / prices.length;
     smaSeries.update({ time:p.time, value:sma });
  });

  // 2️⃣ Conecta WebSocket para tempo-real
  subscribeWs(pair);
}

function subscribeWs(pair){
  ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@kline_${INTERVAL}`);
  ws.onmessage = e => {
    const k = JSON.parse(e.data).k;
    const point = { time:k.t/1000, open:+k.o, high:+k.h, low:+k.l, close:+k.c };

    candleSeries.update(point);              // atualiza / insere
    if (k.x) {                               // se vela fechou
       prices.push(point.close);
       if (prices.length > 20) prices.shift();
       const sma = prices.reduce((a,b)=>a+b,0)/prices.length;
       smaSeries.update({ time:point.time, value:sma });
       detectSignal(point.close, sma);
    }
  };
  ws.onclose = () => console.log('WS Closed');
}

function detectSignal(price, sma){
  const priceAbove = price > sma;
  if (lastPriceAbove === null){ lastPriceAbove = priceAbove; return; }
  if (priceAbove !== lastPriceAbove){
     const type = priceAbove ? 'COMPRA (Call)' : 'VENDA (Put)';
     signalEl.textContent = `Sinal gerado: ${type}`;
     signalEl.style.color = priceAbove ? '#2ecc71' : '#e74c3c';
  }
  lastPriceAbove = priceAbove;
}
