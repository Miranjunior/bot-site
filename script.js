/* ───────── ELEMENTOS ───────── */
const chartEl   = document.getElementById('chart');
const panel     = document.getElementById('signalPanel');
const tableBody = document.getElementById('signalTableBody');
const priceBadge  = document.getElementById('priceBadge');
const changeBadge = document.getElementById('changeBadge');
const banner      = document.getElementById('eventBanner');
const btnSig      = document.getElementById('toggleSignals');
const pairSel  = document.getElementById('pairSelect');
const intSel   = document.getElementById('intervalSelect');
const typeSel  = document.getElementById('typeSelect');

/* ───────── ESTADO ───────── */
let chart, candleSeries, lineSeries, areaSeries, smaSeries, ws;
let lastSMA=null,lastAbove=null,lastPrice=null,smaQueue=[],smaPeriod=14;

/* ───────── INIT ───────── */
btnSig.addEventListener('click',()=>panel.classList.toggle('collapsed'));
['change'].forEach(evt=>{
  pairSel.addEventListener(evt,reload);
  intSel .addEventListener(evt,reload);
  typeSel.addEventListener(evt,toggleType);
});
initChart(); loadData();

/* ───────── FUNÇÕES ───────── */
function initChart(){
  chartEl.innerHTML='';
  chart=LightweightCharts.createChart(chartEl,{
    layout:{background:{color:'#0e1217'},textColor:'#D1D5DB'},
    grid:{vertLines:{color:'#2c313a'},horzLines:{color:'#2c313a'}},
    timeScale:{timeVisible:true,secondsVisible:true},
  });
  candleSeries=chart.addCandlestickSeries();
  lineSeries  =chart.addLineSeries({visible:false});
  areaSeries  =chart.addAreaSeries({visible:false});
  smaSeries   =chart.addLineSeries({color:'#22c55e',lineWidth:2});
}
function toggleType(){
  candleSeries.applyOptions({visible:typeSel.value==='candle'});
  lineSeries  .applyOptions({visible:typeSel.value==='line'});
  areaSeries  .applyOptions({visible:typeSel.value==='area'});
}
function reload(){ closeWS(); initChart(); loadData(); }

async function loadData(){
  const pair=pairSel.value.toUpperCase(),inter=intSel.value;
  showBanner(`Analisando ${pair}...`,true);
  const url=`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${inter}&limit=200`;
  const raw=await fetch(url).then(r=>r.json());
  const candles=raw.map(k=>({time:k[0]/1000,open:+k[1],high:+k[2],low:+k[3],close:+k[4]}));
  candleSeries.setData(candles);
  lineSeries  .setData(candles.map(c=>({time:c.time,value:c.close})));
  areaSeries  .setData(candles.map(c=>({time:c.time,value:c.close})));
  smaSeries   .setData(calcSMA(candles,smaPeriod));
  toggleType(); connectWS(pair,inter);
}

function connectWS(pair,inter){
  ws=new WebSocket(`wss://stream.binance.com:9443/ws/${pair.toLowerCase()}@kline_${inter}`);
  ws.onmessage=e=>{
    const k=JSON.parse(e.data).k;if(!k.x)return; // só após fechar candle
    const c={time:k.t/1000,open:+k.o,high:+k.h,low:+k.l,close:+k.c};
    candleSeries.update(c);
    lineSeries.update({time:c.time,value:c.close});
    areaSeries.update({time:c.time,value:c.close});
    smaSeries.update(lastSMA={time:c.time,value:calcNextSMA(c.close)});
    updateBadges(c.close); checkSignal(c);
  };
}
function closeWS(){if(ws){ws.close();ws=null;}}

/* ─────── INDICADORES ─────── */
function calcSMA(data,p){return data.map((d,i)=>{
  if(i<p-1)return null;
  const slice=data.slice(i-p+1,i+1);
  const v=slice.reduce((s,x)=>s+x.close,0)/p;
  return {time:d.time,value:v};
}).filter(Boolean);}
function calcNextSMA(close){
  smaQueue.push(close);if(smaQueue.length>smaPeriod)smaQueue.shift();
  return smaQueue.reduce((s,x)=>s+x,0)/smaQueue.length;
}

/* ─────── BADGES ─────── */
function updateBadges(price){
  priceBadge.textContent=price.toLocaleString('en-US',{minimumFractionDigits:2});
  if(lastPrice!==null){
    const pct=((price-lastPrice)/lastPrice*100).toFixed(2);
    changeBadge.textContent=`${pct}%`;
    changeBadge.classList.toggle('negative',pct<0);
  }
  lastPrice=price;
}

/* ─────── SINAIS ─────── */
function checkSignal(c){
  if(lastSMA===null)return;
  const above=c.close>lastSMA.value;
  if(lastAbove===null){lastAbove=above;return;}
  if(above!==lastAbove){
    const type=above?'BUY':'SELL';
    addSignalRow(c.time,type,c.close);
    showBanner(`SINAL ${type} • exp. ${intSel.value}`,above);
  }
  lastAbove=above;
}
function addSignalRow(t,type,price){
  const row=`<tr>
      <td>${new Date(t*1000).toLocaleTimeString('pt-BR')}</td>
      <td>${pairSel.value.toUpperCase()}</td>
      <td>${intSel.value}</td>
      <td class="${type==='BUY'?'buy':'sell'}">${type}</td>
      <td>${price.toFixed(2)}</td>
      <td>${intSel.value}</td></tr>`;
  tableBody.insertAdjacentHTML('afterbegin',row);
  if(tableBody.rows.length>50)tableBody.deleteRow(-1);
}
function showBanner(txt,good){
  banner.textContent=txt;
  banner.style.background=good?'var(--accent)':'var(--danger)';
  banner.classList.add('show');
  setTimeout(()=>banner.classList.remove('show'),4000);
}
