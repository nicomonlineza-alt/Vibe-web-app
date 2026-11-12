import React, { useMemo, useState, useEffect } from 'react';
import { Activity, Clock3, RefreshCw, Search, BarChart3 } from 'lucide-react';
import './black.css';

const ASSETS = [
  ['NVDA','NVIDIA'],['MSFT','Microsoft'],['AAPL','Apple'],['AMZN','Amazon'],['GOOGL','Alphabet'],
  ['META','Meta Platforms'],['TSLA','Tesla'],['AVGO','Broadcom'],['AMD','Advanced Micro Devices'],['NFLX','Netflix'],
  ['ORCL','Oracle'],['PLTR','Palantir'],['INTC','Intel'],['QCOM','Qualcomm'],['CRM','Salesforce'],
  ['JPM','JPMorgan Chase'],['WMT','Walmart'],['COST','Costco'],['COIN','Coinbase'],['UBER','Uber'],
  ['SHOP','Shopify'],['DIS','Walt Disney'],['BA','Boeing'],['CAT','Caterpillar'],['XOM','Exxon Mobil'],
  ['CVX','Chevron'],['JNJ','Johnson & Johnson'],['LLY','Eli Lilly'],['NKE','Nike'],['MCD','McDonald’s'],
  ['KO','Coca-Cola'],['BAC','Bank of America'],['GS','Goldman Sachs'],['PYPL','PayPal'],['TSM','Taiwan Semiconductor'],
  ['ARM','Arm Holdings'],['MU','Micron Technology'],['CSCO','Cisco'],['IBM','IBM'],['PANW','Palo Alto Networks']
].map(([symbol,name])=>({symbol,name}));

const DURATIONS = [
  {label:'1 Min',interval:'1min',bars:60,description:'One-minute candles'},
  {label:'5 Min',interval:'5min',bars:60,description:'Five-minute candles'},
  {label:'15 Min',interval:'15min',bars:60,description:'Fifteen-minute candles'},
  {label:'1 Hour',interval:'1h',bars:60,description:'Hourly candles'},
  {label:'3 Hour',interval:'1h',bars:100,aggregate:3,description:'Three-hour view, grouped from hourly candles'}
];

const LEARNING_KEY='stocktrends-ai-suggestions-learning-v1';
const SCAN_UNIVERSE=['NVDA','MSFT','AAPL','AMZN','GOOGL','META','TSLA','AVGO','AMD','NFLX'];
const fmt=(v)=>v==null||v===''||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=(v)=>Number.isFinite(Number(v))?(Number(v)>=0?'+':'')+Number(v).toFixed(2)+'%':'—';

const emaSeries=(values,period)=>{
  if(values.length<period)return [];
  const alpha=2/(period+1);
  let current=values.slice(0,period).reduce((sum,v)=>sum+v,0)/period;
  const output=Array(period-1).fill(null);
  output.push(current);
  for(let i=period;i<values.length;i++){current=(values[i]*alpha)+(current*(1-alpha));output.push(current);}
  return output;
};
const rsiValue=(values,period=14)=>{
  if(values.length<=period)return null;
  let gains=0,losses=0;
  for(let i=1;i<=period;i++){const change=values[i]-values[i-1];gains+=Math.max(change,0);losses+=Math.max(-change,0);}
  let avgGain=gains/period,avgLoss=losses/period;
  for(let i=period+1;i<values.length;i++){const change=values[i]-values[i-1];avgGain=((avgGain*(period-1))+Math.max(change,0))/period;avgLoss=((avgLoss*(period-1))+Math.max(-change,0))/period;}
  if(avgLoss===0)return 100;
  return 100-(100/(1+(avgGain/avgLoss)));
};
const aggregateCandles=(candles,size)=>{
  const groups=[];
  const offset=candles.length%size;
  for(let i=offset;i+size<=candles.length;i+=size){
    const rows=candles.slice(i,i+size),first=rows[0],last=rows.at(-1);
    groups.push({datetime:last.datetime,open:Number(first.open),high:Math.max(...rows.map(r=>Number(r.high))),low:Math.min(...rows.map(r=>Number(r.low))),close:Number(last.close),volume:rows.every(r=>r.volume!=null)?rows.reduce((sum,r)=>sum+Number(r.volume),0):null});
  }
  return groups;
};
const calculateIndicators=(candles)=>{
  const closes=candles.map(row=>Number(row.close));
  const ema9=emaSeries(closes,9),ema21=emaSeries(closes,21);
  const fast=emaSeries(closes,12),slow=emaSeries(closes,26);
  const macd=closes.map((_,i)=>fast[i]!=null&&slow[i]!=null?fast[i]-slow[i]:null);
  const macdValues=macd.filter(value=>value!=null);
  const signalValues=emaSeries(macdValues,9);
  const macdSignal=signalValues.length?signalValues.at(-1):null;
  const macdLine=macd.at(-1)??null;
  const volumes=candles.map(row=>row.volume==null?null:Number(row.volume));
  const recentVolumes=volumes.slice(-21,-1).filter(value=>value!=null&&Number.isFinite(value));
  const latestVolume=volumes.at(-1);
  const averageVolume=recentVolumes.length?recentVolumes.reduce((sum,value)=>sum+value,0)/recentVolumes.length:null;
  const lastFive=closes.length>=6?((closes.at(-1)-closes.at(-6))/closes.at(-6))*100:null;
  const priorFive=closes.length>=11?((closes.at(-6)-closes.at(-11))/closes.at(-11))*100:null;
  return {
    rsi14:rsiValue(closes),ema9:ema9.at(-1)??null,ema21:ema21.at(-1)??null,
    macdLine,macdSignal,macdHistogram:macdLine!=null&&macdSignal!=null?macdLine-macdSignal:null,
    latestVolume,averageVolume,relativeVolume:latestVolume!=null&&averageVolume>0?latestVolume/averageVolume:null,
    lastFive,priorFive,candleCount:candles.length,
    macdReady:macdValues.length>=34
  };
};


const scoreObservation=(indicators)=>{
  let score=0;
  if(indicators.ema9!=null&&indicators.ema21!=null)score+=indicators.ema9>indicators.ema21?2:0;
  if(indicators.macdHistogram!=null)score+=indicators.macdHistogram>0?2:0;
  if(indicators.rsi14!=null)score+=indicators.rsi14>=45&&indicators.rsi14<=65?2:indicators.rsi14>65&&indicators.rsi14<70?1:0;
  if(indicators.relativeVolume!=null)score+=indicators.relativeVolume>=1?1:0;
  if(indicators.lastFive!=null)score+=indicators.lastFive>0?1:0;
  return score;
};
const readLearning=()=>{
  try{return JSON.parse(localStorage.getItem(LEARNING_KEY)||'[]');}catch{return [];}
};

export default function BlackDashboard(){
  const [duration,setDuration]=useState(DURATIONS[0]);
  const [selected,setSelected]=useState(['NVDA','MSFT','AAPL']);
  const [search,setSearch]=useState('');
  const [observations,setObservations]=useState([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [updatedAt,setUpdatedAt]=useState(null);
  const [diagnostics,setDiagnostics]=useState([]);
  const [diagnosticsBusy,setDiagnosticsBusy]=useState(false);
  const [learning,setLearning]=useState(()=>readLearning());
  const [aiBusy,setAiBusy]=useState(false);
  const [aiSession,setAiSession]=useState(null);
  const [aiMessage,setAiMessage]=useState('');
  const [secondsLeft,setSecondsLeft]=useState(0);
  useEffect(()=>{
    if(!aiSession||aiSession.status!=='running')return;
    const timer=setInterval(()=>setSecondsLeft(Math.max(0,Math.ceil((aiSession.endsAt-Date.now())/1000))),1000);
    return ()=>clearInterval(timer);
  },[aiSession]);
  useEffect(()=>{
    if(!aiSession||aiSession.status!=='running')return;
    const timer=setInterval(()=>refreshAiSnapshot(aiSession),60000);
    return ()=>clearInterval(timer);
  },[aiSession?.id,aiSession?.status]);
  useEffect(()=>{
    if(aiSession?.status==='running'&&Date.now()>=aiSession.endsAt)finishAiSession(aiSession);
  },[secondsLeft]);
  const filtered=useMemo(()=>ASSETS.filter(a=>(a.symbol+' '+a.name).toLowerCase().includes(search.toLowerCase())),[search]);

  function toggle(symbol){
    setSelected(old=>old.includes(symbol)?old.filter(s=>s!==symbol):old.length>=8?old:[...old,symbol]);
  }



  function saveLearning(entry){
    const next=[entry,...readLearning()].slice(0,100);
    localStorage.setItem(LEARNING_KEY,JSON.stringify(next));
    setLearning(next);
  }

  function learnFromCurrent(){
    const valid=observations.filter(row=>!row.error&&row.indicators);
    if(!valid.length){setAiMessage('Load market observations first. There is no verified data to learn from yet.');return;}
    const entry={id:Date.now(),type:'manual',createdAt:new Date().toISOString(),timeframe:duration.label,stocks:valid.map(row=>({symbol:row.symbol,score:scoreObservation(row.indicators),movement:row.movement,indicators:row.indicators})),note:'Saved indicator snapshot for later educational comparison.'};
    saveLearning(entry);
    setAiMessage('Learning snapshot saved on this device for '+valid.length+' stocks.');
  }

  async function fetchOneMinute(symbol){
    const response=await fetch('/api/market-data?symbol='+encodeURIComponent(symbol)+'&interval=1min&outputsize=60');
    const payload=await response.json();
    if(!response.ok||!Array.isArray(payload.candles)||payload.candles.length<26)throw new Error(payload.error||'Insufficient one-minute history');
    const rows=[...payload.candles].sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime)));
    const indicators=calculateIndicators(rows);
    const latest=rows.at(-1);
    return {symbol,name:ASSETS.find(a=>a.symbol===symbol)?.name||symbol,price:Number(latest.close),lastUpdated:latest.datetime,indicators,score:scoreObservation(indicators)};
  }

  async function refreshAiSnapshot(session){
    if(!session||session.status!=='running'||Date.now()>=session.endsAt)return;
    const values=[];
    for(const stock of session.stocks){
      try{
        const latest=await fetchOneMinute(stock.symbol);
        values.push({symbol:stock.symbol,price:latest.price,change:stock.price?((latest.price-stock.price)/stock.price)*100:null});
      }catch(error){values.push({symbol:stock.symbol,error:error.message,change:null});}
    }
    const elapsed=Math.min(300,Math.max(0,Math.round((Date.now()-new Date(session.startedAt).getTime())/1000)));
    const average=values.filter(row=>Number.isFinite(row.change));
    const point={elapsed,label:Math.floor(elapsed/60)+':'+String(elapsed%60).padStart(2,'0'),values,averageChange:average.length?average.reduce((sum,row)=>sum+row.change,0)/average.length:null};
    setAiSession(current=>{
      if(!current||current.id!==session.id||current.status!=='running')return current;
      const points=current.chartPoints||[];
      if(points.some(item=>item.elapsed===elapsed))return current;
      return {...current,chartPoints:[...points,point].sort((a,b)=>a.elapsed-b.elapsed)};
    });
  }

  async function startAiSuggestions(){
    if(aiBusy||aiSession?.status==='running')return;
    setAiBusy(true);setAiMessage('Scanning a small, predefined watchlist using historical one-minute data…');
    const candidates=[];
    for(const symbol of SCAN_UNIVERSE){
      try{candidates.push(await fetchOneMinute(symbol));}
      catch(error){candidates.push({symbol,error:error.message});}
    }
    const history=learning.filter(entry=>entry.type==='ai-suggestions').flatMap(entry=>entry.stocks||[]).filter(row=>Number.isFinite(row.change)&&Number.isFinite(row.initialScore));
    const ranked=candidates.filter(row=>!row.error).map(row=>{
      const comparable=history.map(past=>({change:past.change,weight:1/(1+Math.abs(past.initialScore-row.score))}));
      const weightTotal=comparable.reduce((sum,item)=>sum+item.weight,0);
      const average=weightTotal?comparable.reduce((sum,item)=>sum+item.change*item.weight,0)/weightTotal:0;
      const learnedAdjustment=comparable.length>=3?Math.max(-1.5,Math.min(1.5,average*0.6)):0;
      return {...row,learnedAdjustment,historySamples:comparable.length,combinedScore:row.score+learnedAdjustment};
    }).sort((a,b)=>b.combinedScore-a.combinedScore).slice(0,5);
    if(ranked.length<5){setAiMessage('Only '+ranked.length+' stocks returned enough data. No five-stock session was started. Try again later.');setAiBusy(false);return;}
    const startedAt=new Date().toISOString();
    const session={id:Date.now(),status:'running',startedAt,endsAt:Date.now()+300000,stocks:ranked.map(row=>({...row})),chartPoints:[{elapsed:0,label:'0:00',values:ranked.map(row=>({symbol:row.symbol,price:row.price,change:0})),averageChange:0}]};
    setAiSession(session);setSecondsLeft(300);setAiMessage('Five stocks selected using indicator scores plus similar past observation outcomes. The five-minute paper observation is now running; no orders are placed.');
    setAiBusy(false);
  }

  async function finishAiSession(session){
    if(aiBusy||session.status!=='running')return;
    setAiBusy(true);setAiMessage('Five minutes complete. Checking the latest observations…');
    const outcomes=[];
    for(const start of session.stocks){
      try{
        const latest=await fetchOneMinute(start.symbol);
        const change=start.price?((latest.price-start.price)/start.price)*100:null;
        outcomes.push({symbol:start.symbol,startPrice:start.price,endPrice:latest.price,change,initialScore:start.score,finalScore:latest.score,lastUpdated:latest.lastUpdated});
      }catch(error){outcomes.push({symbol:start.symbol,error:error.message,initialScore:start.score});}
    }
    const elapsed=300;
    const finalValues=outcomes.map(row=>({symbol:row.symbol,price:row.endPrice,change:row.change,error:row.error}));
    const validFinal=finalValues.filter(row=>Number.isFinite(row.change));
    const finalPoint={elapsed,label:'5:00',values:finalValues,averageChange:validFinal.length?validFinal.reduce((sum,row)=>sum+row.change,0)/validFinal.length:null};
    const chartPoints=[...(session.chartPoints||[]).filter(point=>point.elapsed!==300),finalPoint];
    const entry={id:session.id,type:'ai-suggestions',createdAt:session.startedAt,completedAt:new Date().toISOString(),durationMinutes:5,stocks:outcomes,chartPoints,method:'One-minute indicators plus similarity-weighted learning from prior completed observations; five-minute paper observation only.'};
    saveLearning(entry);
    setAiSession({...session,status:'complete',outcomes,chartPoints});
    setAiMessage('AI Suggestions session completed. Results were saved to the learning journal on this device.');
    setAiBusy(false);setSecondsLeft(0);
  }

  async function runDiagnostics(){
    if(diagnosticsBusy)return;
    setDiagnosticsBusy(true);
    setDiagnostics([]);
    const checks=[];
    for(const timeframe of DURATIONS){
      try{
        const response=await fetch('/api/market-data?symbol=AAPL&interval='+timeframe.interval+'&outputsize=21');
        const payload=await response.json();
        if(!response.ok||!Array.isArray(payload.candles)||payload.candles.length<21){
          throw new Error(payload.error||'Provider returned fewer than 21 valid candles.');
        }
        const latest=[...payload.candles].sort((x,y)=>String(x.datetime).localeCompare(String(y.datetime))).at(-1);
        checks.push({label:timeframe.label,ok:true,source:payload.source||'Market data provider',count:payload.candles.length,last:latest.datetime,detail:timeframe.aggregate?'Uses hourly candles grouped into a 3-hour view.':'21 historical candles received.'});
      }catch(error){
        checks.push({label:timeframe.label,ok:false,detail:error.message});
      }
      setDiagnostics([...checks]);
    }
    setDiagnosticsBusy(false);
  }

  async function loadObservations(){
    if(!selected.length||busy)return;
    setBusy(true);setMessage('Loading up to 60 historical candles per company for indicator calculations. This may take a moment…');
    const results=[];
    for(const symbol of selected){
      try{
        const response=await fetch('/api/market-data?symbol='+encodeURIComponent(symbol)+'&interval='+duration.interval+'&outputsize='+duration.bars);
        const payload=await response.json();
        if(!response.ok||!Array.isArray(payload.candles)||!payload.candles.length)throw new Error(payload.error||'No candle data returned');
        const all=[...payload.candles].sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime)));
        const rows=duration.aggregate?aggregateCandles(all,duration.aggregate):all;
        if(rows.length<26)throw new Error('At least 26 complete candles are needed for the EMA and MACD calculations.');
        const first=rows[0],last=rows.at(-1);
        const open=Number(first.open),close=Number(last.close);
        const high=Math.max(...rows.map(r=>Number(r.high))),low=Math.min(...rows.map(r=>Number(r.low)));
        const movement=open?((close-open)/open)*100:null;
        const indicators=calculateIndicators(rows);
        results.push({symbol,name:ASSETS.find(a=>a.symbol===symbol)?.name||symbol,source:payload.source||'Market data provider',currency:payload.currency||'USD',interval:duration.label,candles:rows.length,open,high,low,close,movement,lastUpdated:last.datetime,volume:rows.reduce((sum,r)=>sum+(Number(r.volume)||0),0),indicators});
      }catch(error){results.push({symbol,name:ASSETS.find(a=>a.symbol===symbol)?.name||symbol,error:error.message});}
    }
    setObservations(results);setUpdatedAt(new Date().toISOString());
    const successful=results.filter(r=>!r.error).length;
    setMessage('Loaded '+successful+' of '+selected.length+' requested market observations. Missing provider data is shown as unavailable; no values are estimated.');
    setBusy(false);
  }

  return <section className="black-dashboard">
    <div className="black-head">
      <div><div className="eyebrow">BLACK · MARKET OBSERVATORY</div><h1><Activity/> Black</h1>
      <p>Explore a wider range of listed companies across five chart timeframes. This workspace displays historical market data for learning and comparison only.</p></div>
      <span className="black-label">40 STOCKS · 5 TIMEFRAMES</span>
    </div>


    <div className="black-diagnostics">
      <div className="black-diagnostics-head">
        <div><div className="eyebrow">SYSTEM CHECK · MARKET DATA</div><h2>Data connection health</h2><p>Test the server-side provider connection against AAPL across all five supported views. This makes five historical-candle requests.</p></div>
        <button className="black-diagnostic-button" onClick={runDiagnostics} disabled={diagnosticsBusy}>{diagnosticsBusy?'Checking providers…':'Run 5-timeframe check'}</button>
      </div>
      {diagnostics.length>0&&<div className="black-diagnostic-grid">{diagnostics.map(item=><article className="black-diagnostic-card" key={item.label}>
        <div><b>{item.label}</b><span className={item.ok?'diagnostic-ok':'diagnostic-fail'}>{item.ok?'CONNECTED':'UNAVAILABLE'}</span></div>
        {item.ok?<><small>{item.source} · {item.count} candles</small><small>Latest candle: {item.last}</small><small>{item.detail}</small></>:<p>{item.detail}</p>}
      </article>)}</div>}
      <p className="black-diagnostic-note">A successful check confirms historical candles can be retrieved; it does not guarantee real-time quotes, uninterrupted provider access, or forecast accuracy.</p>
    </div>


    <div className="black-ai-learning">
      <div className="eyebrow">AI SUGGESTIONS · FIVE-MINUTE OBSERVATION</div>
      <h2>AI Suggestions</h2>
      <p>Screens a fixed watchlist, ranks five stocks using transparent indicators and similarity-weighted results from earlier completed observations, then tracks their recorded prices for five minutes. This is a paper-only learning experiment, not investment advice or a prediction of profit.</p>
      <div className="black-ai-actions">
        <button className="black-load" onClick={startAiSuggestions} disabled={aiBusy||aiSession?.status==='running'}>{aiBusy?'Scanning…':'Start AI Suggestions'}</button>
        <button className="black-learn-button" onClick={learnFromCurrent} disabled={aiBusy}>Learn from loaded observations</button>
      </div>
      {aiSession&&<div className="black-ai-status">
        <b>{aiSession.status==='running'?'Observation in progress':'Five-minute observation complete'}</b>
        {aiSession.status==='running'&&<strong>{Math.floor(secondsLeft/60)}:{String(secondsLeft%60).padStart(2,'0')}</strong>}
        <p>Five selected stocks · paper-only price tracking · no orders. The chart refreshes about once per minute when provider data is available.</p>
        <div className="black-ai-stock-row">{aiSession.stocks.map(row=><span key={row.symbol}>{row.symbol} · score {row.score}/8 · memory {row.learnedAdjustment>=0?'+':''}{row.learnedAdjustment.toFixed(2)}</span>)}</div>
        <div className="black-pnl-chart">
          <div className="black-pnl-chart-head"><b>Live simulated P&amp;L tracker</b><span>Change from starting price (%)</span></div>
          <svg viewBox="0 0 640 260" role="img" aria-label="Line chart showing percentage price changes for five selected stocks during the five-minute observation">
            {[0,1,2,3,4].map(i=><g key={i}><line x1="48" x2="620" y1={24+i*48} y2={24+i*48} className="pnl-grid-line"/><text x="40" y={28+i*48} textAnchor="end" className="pnl-axis-label">{(2-i).toFixed(1)}%</text></g>)}
            {[0,60,120,180,240,300].map((sec,i)=><g key={sec}><line x1={48+i*114.4} x2={48+i*114.4} y1="20" y2="216" className="pnl-grid-line"/><text x={48+i*114.4} y="238" textAnchor="middle" className="pnl-axis-label">{Math.floor(sec/60)}:{String(sec%60).padStart(2,'0')}</text></g>)}
            {aiSession.stocks.map((stock,index)=>{
              const color=['#71e5c6','#65b8ff','#f6c66b','#c29aff','#ff8b9b'][index];
              const points=(aiSession.chartPoints||[]).map(point=>({x:48+(point.elapsed/300)*572,y:120-(Math.max(-2,Math.min(2,point.values.find(v=>v.symbol===stock.symbol)?.change??0))*48)}));
              const path=points.map((point,i)=>(i?'L':'M')+point.x+','+point.y).join(' ');
              return <g key={stock.symbol}><path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>{points.map((point,i)=><circle key={i} cx={point.x} cy={point.y} r="3" fill={color}/>)}</g>;
            })}
            <line x1="48" x2="620" y1="120" y2="120" className="pnl-zero-line"/>
          </svg>
          <div className="black-pnl-legend">{aiSession.stocks.map((stock,index)=><span key={stock.symbol}><i style={{background:['#71e5c6','#65b8ff','#f6c66b','#c29aff','#ff8b9b'][index]}}/>{stock.symbol}</span>)}</div>
          <div className="black-pnl-current">{aiSession.stocks.map(stock=>{
            const latest=[...(aiSession.chartPoints||[])].at(-1)?.values.find(value=>value.symbol===stock.symbol);
            return <span key={stock.symbol}><small>{stock.symbol}</small><b>{latest&&Number.isFinite(latest.change)?pct(latest.change):'—'}</b></span>;
          })}</div>
          <p className="black-indicator-note">This graph plots observed percentage price movement from each stock's starting snapshot. It is not an executed trade or a cash profit/loss figure. Historical provider candles can be delayed; the vertical scale is capped at ±2% for readability.</p>
        </div>
        {aiSession.status==='complete'&&<div className="black-ai-outcomes">{aiSession.outcomes?.map(row=><span key={row.symbol}>{row.symbol}: {row.error?'Data unavailable':pct(row.change)}</span>)}</div>}
      </div>}
      {aiMessage&&<p className="black-ai-message" role="status">{aiMessage}</p>}
      <div className="black-learning-summary"><b>Learning journal</b><span>{learning.length} saved session(s) on this device</span></div>
      {learning.slice(0,5).map(entry=><div className="black-learning-entry" key={entry.id}><span>{entry.type==='ai-suggestions'?'AI Suggestions':'Manual learning'} · {new Date(entry.createdAt).toLocaleString()}</span><small>{entry.stocks?.map(row=>row.symbol).join(', ')}</small></div>)}
      <p className="black-indicator-note">The journal stores snapshots and observed outcomes locally in this browser. It does not train a predictive model or prove a strategy is profitable; past five-minute movement can be noise.</p>
    </div>

    <div className="black-duration">
      <div className="eyebrow">01 · CHOOSE A TIMEFRAME</div>
      <div className="black-options">{DURATIONS.map(d=><button key={d.label} className={duration.label===d.label?'chosen':''} onClick={()=>setDuration(d)}>{d.label}</button>)}</div>
      <p className="black-hint">{duration.description}. The same 40-stock catalogue is available in every timeframe.</p>
    </div>

    <div className="black-picker">
      <div className="black-picker-head"><div><div className="eyebrow">02 · BUILD YOUR WATCHLIST</div><h2>Choose stocks to observe</h2><p>Select up to 8 companies for one market-data refresh.</p></div><strong className="black-count">{selected.length} / 8 selected</strong></div>
      <label className="black-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search 40 stocks by name or ticker…"/></label>
      <div className="black-stock-grid">{filtered.map(asset=><button key={asset.symbol} className={'black-stock-option '+(selected.includes(asset.symbol)?'selected':'')} onClick={()=>toggle(asset.symbol)} aria-pressed={selected.includes(asset.symbol)}><span className="stock-check">{selected.includes(asset.symbol)?'✓':'+'}</span><span><b>{asset.symbol}</b><small>{asset.name}</small></span></button>)}</div>
      <div className="black-picker-actions"><span className="black-hint">A maximum of 8 symbols per refresh helps manage market-data API usage.</span><button className="black-load" disabled={!selected.length||busy} onClick={loadObservations}><RefreshCw size={16} className={busy?'spinning':''}/>{busy?'Loading observations…':'Load market observations'}</button></div>
    </div>

    {message&&<div className="black-message" role="status">{message}</div>}
    <div className="black-section-head"><div><div className="eyebrow">03 · HISTORICAL MARKET DATA</div><h2>Observation results</h2></div><span>{updatedAt?'Updated '+new Date(updatedAt).toLocaleTimeString():'Not loaded yet'}</span></div>
    {!observations.length?<div className="black-empty"><BarChart3 size={25}/><b>Your observation panel is ready</b><p>Choose a timeframe and a few stocks, then load their historical candles to compare recorded price movement.</p></div>:
      <div className="black-results">{observations.map(row=><article className="black-result" key={row.symbol}>
        <div className="black-result-top"><div><b>{row.symbol}</b><small>{row.name}</small></div><span className="black-time-chip">{row.interval}</span></div>
        {row.error?<p className="black-error">Data unavailable: {row.error}</p>:<>
          <div className="black-price">{row.currency} {fmt(row.close)}</div>
          <div className="black-data-grid"><div><small>Open</small><b>{fmt(row.open)}</b></div><div><small>High</small><b>{fmt(row.high)}</b></div><div><small>Low</small><b>{fmt(row.low)}</b></div><div><small>Change in sample</small><b className={row.movement>=0?'neutral-positive':'neutral-negative'}>{pct(row.movement)}</b></div></div>
          <div className="black-result-foot"><span>{row.candles} candle(s) · {row.source}</span><span>{row.lastUpdated}</span></div>
          <div className="black-indicators">
            <div className="black-indicators-title"><b>Technical indicators</b><span>Descriptive · not trade signals</span></div>
            <div className="black-indicator-grid">
              <div><small>RSI (14)</small><b>{fmt(row.indicators.rsi14)}</b><em>{row.indicators.rsi14==null?'Needs more data':row.indicators.rsi14>=70?'Upper range':row.indicators.rsi14<=30?'Lower range':'Middle range'}</em></div>
              <div><small>EMA 9</small><b>{fmt(row.indicators.ema9)}</b><em>Shorter average</em></div>
              <div><small>EMA 21</small><b>{fmt(row.indicators.ema21)}</b><em>Longer average</em></div>
              <div><small>MACD line</small><b>{fmt(row.indicators.macdLine)}</b><em>{row.indicators.macdReady?'12/26 EMA spread':'Early history'}</em></div>
              <div><small>MACD signal</small><b>{fmt(row.indicators.macdSignal)}</b><em>{row.indicators.macdReady?'9-period signal average':'More candles needed'}</em></div>
              <div><small>MACD histogram</small><b>{fmt(row.indicators.macdHistogram)}</b><em>Line minus signal</em></div>
              <div><small>Relative volume</small><b>{row.indicators.relativeVolume==null?'—':fmt(row.indicators.relativeVolume)+'×'}</b><em>Latest vs prior 20</em></div>
              <div><small>Last 5 candles</small><b className={row.indicators.lastFive>=0?'neutral-positive':'neutral-negative'}>{pct(row.indicators.lastFive)}</b><em>Previous 5: {pct(row.indicators.priorFive)}</em></div>
            </div>
            <p className="black-indicator-note">These values describe the candles received from the provider. RSI ranges are context, not instructions; volume may be unavailable. The 3-hour view groups consecutive hourly candles and may not align to official exchange session boundaries.</p>
          </div>
        </>}
      </article>)}</div>}
    <p className="black-disclaimer">Educational observation only. Historical movement and technical indicators are descriptive, not predictions or buy/sell signals. Data availability and delays depend on the connected market-data provider. AI Suggestions is a five-minute paper observation only. No broker connection, real-money trading, or guaranteed-profit claim is included.</p>
  </section>;
}
