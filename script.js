// Utiliza Binance WebSocket para candles de 1 minuto
const chartContainer = document.getElementById('chart');
const pairSelect = document.getElementById('pairSelect');
const signalEl   = document.getElementById('signal');

let candleSeries;
let smaSeries;
let prices = []; // para SMA
let ws;

initChart();
subscribe(pairSelect.value);

// trocar par
pairSelect.addEventListener('change', () => {
    prices = [];
    if (ws) ws.close();
    chart.remove();
    initChart();
    subscribe(pairSelect.value);
});

function initChart() {
    window.chart = LightweightCharts.createChart(chartContainer, {
        layout: {
            background: { color: '#0d1117' },
            textColor: '#c9d1d9',
        },
        grid: {
            vertLines: { color: '#30363d' },
            horzLines: { color: '#30363d' },
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
        },
    });
    candleSeries = chart.addCandlestickSeries();
    smaSeries    = chart.addLineSeries({color: '#f7931a', lineWidth: 1});
}

function subscribe(pair) {
    const endpoint = `wss://stream.binance.com:9443/ws/${pair}@kline_1m`;
    ws = new WebSocket(endpoint);

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const candlestick = message.k;
        const point = {
            time: candlestick.t / 1000,
            open:  parseFloat(candlestick.o),
            high:  parseFloat(candlestick.h),
            low:   parseFloat(candlestick.l),
            close: parseFloat(candlestick.c),
        };

        // Atualiza / adiciona candle
        if (candlestick.x) {
            // candle fechado
            candleSeries.update(point);
            prices.push(point.close);
            if (prices.length > 20) prices.shift(); // mantém últimas 20
            const sma = prices.reduce((a,b)=>a+b,0) / prices.length;
            smaSeries.update({ time: point.time, value: sma });
            checkSignal(point.close, sma);
        } else {
            // candle ainda aberto
            candleSeries.update(point);
        }
    };

    ws.onclose = () => console.log('WS closed');
}

// Simples regra: se preço cruza SMA de baixo para cima = COMPRA, de cima para baixo = VENDA
let lastPriceAbove = null;
function checkSignal(price, sma) {
    const priceAbove = price > sma;
    if (lastPriceAbove === null) {
        lastPriceAbove = priceAbove;
        return;
    }
    if (priceAbove !== lastPriceAbove) {
        const type = priceAbove ? 'COMPRA (Call)' : 'VENDA (Put)';
        signalEl.textContent = `Sinal gerado: ${type}`;
        signalEl.style.color = priceAbove ? '#2ecc71' : '#e74c3c';
    }
    lastPriceAbove = priceAbove;
}
