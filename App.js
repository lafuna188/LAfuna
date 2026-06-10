import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Platform, SafeAreaView,
  Image, ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ANTHROPIC_API_KEY } from './config';

// ─── DATA ──────────────────────────────────────────────────────────────────
const BALANCE = 3824.60;

const PLANNED = [
  { id:1, name:'Штраф',                      label:'Fine',                      amount:500, icon:'⚠️', urgent:true  },
  { id:2, name:'Соціалка',                   label:'Social payment',            amount:330, icon:'🏛️', urgent:true  },
  { id:3, name:'Страхування',                label:'Insurance',                 amount:120, icon:'🛡️', urgent:true  },
  { id:4, name:'Стоматолог',                 label:'Dentist',                   amount:100, icon:'🦷', urgent:false },
  { id:5, name:'Масаж',                      label:'Massage',                   amount:65,  icon:'💆', urgent:false },
  { id:6, name:'Дорога в Німеччину',         label:'Trip to Germany',           amount:50,  icon:'🚗', urgent:false },
  { id:7, name:'Подарунки Хельсі і Майклу',  label:'Gifts for Helsi & Michael', amount:50,  icon:'🎁', urgent:false },
];

const CAT_ICONS = {
  Food:'🍽️', Transport:'⛽', Health:'💊', Tech:'📱',
  Utilities:'💡', Shopping:'🛍️', Entertainment:'🎭', Other:'🧾',
};

const CAT_COLORS = {
  Food:         { bg:'rgba(201,150,58,0.12)',  border:'rgba(201,150,58,0.35)',  text:'#C9963A' },
  Transport:    { bg:'rgba(74,138,232,0.12)',  border:'rgba(74,138,232,0.35)',  text:'#4A8AE8' },
  Health:       { bg:'rgba(74,174,120,0.12)',  border:'rgba(74,174,120,0.35)',  text:'#4AAE78' },
  Tech:         { bg:'rgba(168,85,247,0.12)',  border:'rgba(168,85,247,0.35)',  text:'#A855F7' },
  Utilities:    { bg:'rgba(234,179,8,0.12)',   border:'rgba(234,179,8,0.35)',   text:'#EAB308' },
  Shopping:     { bg:'rgba(236,72,153,0.12)',  border:'rgba(236,72,153,0.35)',  text:'#EC4899' },
  Entertainment:{ bg:'rgba(249,115,22,0.12)',  border:'rgba(249,115,22,0.35)', text:'#F97316' },
  Other:        { bg:'rgba(96,112,136,0.12)',  border:'rgba(96,112,136,0.35)', text:'#607088' },
};

// ─── COLOURS ───────────────────────────────────────────────────────────────
const C = {
  bg:'#070A12', card:'#0C1220', border:'#152030', borderHi:'#1E3452',
  gold:'#C9963A', goldDim:'rgba(201,150,58,0.13)',
  amber:'#E07A28', red:'#D04848', redDim:'rgba(208,72,72,0.12)',
  green:'#4AAE78', greenDim:'rgba(74,174,120,0.12)',
  blue:'#4A8AE8', blueDim:'rgba(74,138,232,0.12)',
  text:'#EDE8DF', mid:'#607088', dim:'#2A4060',
};

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO  = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
const fmt   = n => Number(n).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});

// DD.MM.YYYY → YYYY-MM-DD for sorting
const parseDateKey = (dateStr) => {
  if (!dateStr || dateStr === 'Today') return 'Today';
  const p = dateStr.split('.');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : dateStr;
};

const formatDayLabel = (key) => {
  if (key === 'Today') return 'Today';
  const p = key.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}` : key;
};

const Divider = () => <View style={{height:1,backgroundColor:C.border}}/>;
const Lbl = ({children}) => <Text style={s.label}>{children}</Text>;

// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]             = useState('overview');
  const [receipts, setReceipts]   = useState([]);
  const [selectedDay, setSelectedDay] = useState('all');

  // single scan
  const [scanStep, setScanStep]     = useState('idle');
  const [scanUri,  setScanUri]      = useState(null);
  const [editFields, setEditFields] = useState(null);
  const [scanError, setScanError]   = useState('');

  // batch
  const [batchStep, setBatchStep]         = useState('idle'); // idle|processing|review
  const [batchProgress, setBatchProgress] = useState({done:0, total:0, current:''});
  const [batchResults, setBatchResults]   = useState([]);
  const [batchDupCount, setBatchDupCount] = useState(0);

  const nextId = useRef(100);

  // ── DERIVED ──────────────────────────────────────────────────────────────
  const totalSpent   = receipts.reduce((s,r)=>s+r.amount,0);
  const totalPlanned = PLANNED.reduce((s,p)=>s+p.amount,0);
  const urgentSum    = PLANNED.filter(p=>p.urgent).reduce((s,p)=>s+p.amount,0);
  const afterAll     = BALANCE - totalSpent - totalPlanned;
  const spentPct     = Math.min((totalSpent/BALANCE)*100,100);
  const plannedPct   = Math.min((totalPlanned/BALANCE)*100,100);

  const receiptsByDay = receipts.reduce((acc,r)=>{
    const k = parseDateKey(r.date);
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});

  const dayKeys = Object.keys(receiptsByDay).sort((a,b)=>{
    if (a==='Today') return -1;
    if (b==='Today') return 1;
    return b.localeCompare(a);
  });

  // ── DUPLICATE CHECK ───────────────────────────────────────────────────────
  const isDup = (fields, existing=[]) => {
    const store  = (fields.store||'').toLowerCase().trim();
    const amount = parseFloat(fields.amount);
    const date   = fields.date;
    const inSaved = receipts.some(r =>
      r.store.toLowerCase().trim()===store &&
      Math.abs(r.amount-amount)<0.01 && r.date===date);
    const inBatch = existing.some(b =>
      !b.isDuplicate && b.fields &&
      (b.fields.store||'').toLowerCase().trim()===store &&
      Math.abs(parseFloat(b.fields.amount)-amount)<0.01 &&
      b.fields.date===date);
    return inSaved || inBatch;
  };

  // ── CLAUDE API CALL ───────────────────────────────────────────────────────
  const scanWithClaude = async (asset) => {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version':'2023-06-01',
      },
      body: JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:800,
        messages:[{
          role:'user',
          content:[
            {type:'image', source:{type:'base64', media_type:asset.mimeType||'image/jpeg', data:asset.base64}},
            {type:'text',  text:`Analyze this receipt. Reply ONLY with valid JSON, no markdown:
{"store":"vendor name","date":"DD.MM.YYYY","total":0.00,"items":[{"name":"item","amount":0.00}],"category":"Food|Transport|Health|Tech|Utilities|Shopping|Entertainment|Other"}`},
          ]
        }]
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    const txt = data.content?.find(b=>b.type==='text')?.text || '';
    return JSON.parse(txt.replace(/```json|```/g,'').trim());
  };

  // ── SINGLE SCAN ───────────────────────────────────────────────────────────
  const pickImage = async (useCamera) => {
    try {
      let result;
      if (useCamera) {
        const {status} = await ImagePicker.requestCameraPermissionsAsync();
        if (status!=='granted'){Alert.alert('Permission needed','Allow camera access.');return;}
        result = await ImagePicker.launchCameraAsync({base64:true,quality:0.85});
      } else {
        const {status} = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status!=='granted'){Alert.alert('Permission needed','Allow photo library access.');return;}
        result = await ImagePicker.launchImageLibraryAsync({base64:true,quality:0.85});
      }
      if (!result.canceled && result.assets?.[0]) processImage(result.assets[0]);
    } catch(e){ Alert.alert('Error',e.message); }
  };

  const processImage = async (asset) => {
    setScanUri(asset.uri); setScanStep('scanning');
    setScanError(''); setEditFields(null);
    if (!ANTHROPIC_API_KEY){
      setScanError('No API key set.'); setScanStep('error'); return;
    }
    try {
      const json = await scanWithClaude(asset);
      setEditFields({
        store:    json.store    || '',
        amount:   json.total!=null ? String(json.total) : '',
        date:     json.date     || '',
        category: json.category || 'Other',
        item:     json.items?.map(i=>i.name).join(', ') || '',
      });
      setScanStep('result');
    } catch(e){
      setScanError(e.message||'Could not read receipt.'); setScanStep('error');
    }
  };

  const confirmScan = () => {
    const amt = parseFloat(editFields?.amount);
    if (!editFields||isNaN(amt)||amt<=0) return;
    setReceipts(prev=>[{
      id:       nextId.current++,
      store:    editFields.store    || 'Unknown',
      item:     editFields.item     || 'Scanned receipt',
      category: editFields.category || 'Other',
      amount:   amt,
      date:     editFields.date     || 'Today',
      icon:     CAT_ICONS[editFields.category] || '🧾',
    }, ...prev]);
    resetScan(); setTab('receipts');
  };

  const resetScan = () => {
    setScanStep('idle'); setScanUri(null);
    setEditFields(null); setScanError('');
  };

  // ── BATCH UPLOAD ──────────────────────────────────────────────────────────
  const pickMultiple = async () => {
    try {
      const {status} = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status!=='granted'){Alert.alert('Permission needed','Allow photo library access.');return;}
      const result = await ImagePicker.launchImageLibraryAsync({
        base64:true, quality:0.85,
        allowsMultipleSelection:true, selectionLimit:20,
      });
      if (!result.canceled && result.assets?.length>0) processBatch(result.assets);
    } catch(e){ Alert.alert('Error',e.message); }
  };

  const processBatch = async (assets) => {
    if (!ANTHROPIC_API_KEY){Alert.alert('No API key','Add your Anthropic API key to App.js');return;}
    setBatchStep('processing');
    setBatchProgress({done:0,total:assets.length,current:''});
    const results = [];
    let dups = 0;

    for (let i=0; i<assets.length; i++) {
      setBatchProgress({done:i,total:assets.length,current:`Scanning ${i+1} of ${assets.length}…`});
      try {
        const json = await scanWithClaude(assets[i]);
        const fields = {
          store:    json.store    || '',
          amount:   json.total!=null ? String(json.total) : '',
          date:     json.date     || '',
          category: json.category || 'Other',
          item:     json.items?.map(x=>x.name).join(', ') || '',
        };
        const dup = isDup(fields, results);
        if (dup) dups++;
        results.push({uri:assets[i].uri, fields, isDuplicate:dup, id:nextId.current++});
      } catch(e) {
        results.push({uri:assets[i].uri, fields:null, isDuplicate:false, error:e.message, id:nextId.current++});
      }
    }

    setBatchResults(results);
    setBatchDupCount(dups);
    setBatchProgress({done:assets.length,total:assets.length,current:'Done!'});
    setBatchStep('review');
  };

  const confirmBatch = () => {
    const toAdd = batchResults
      .filter(r => !r.isDuplicate && r.fields && parseFloat(r.fields.amount)>0)
      .map(r => ({
        id:       r.id,
        store:    r.fields.store    || 'Unknown',
        item:     r.fields.item     || 'Scanned receipt',
        category: r.fields.category || 'Other',
        amount:   parseFloat(r.fields.amount),
        date:     r.fields.date     || 'Today',
        icon:     CAT_ICONS[r.fields.category] || '🧾',
      }));
    setReceipts(prev=>[...toAdd,...prev]);
    resetBatch(); setTab('receipts');
  };

  const resetBatch = () => {
    setBatchStep('idle'); setBatchResults([]);
    setBatchProgress({done:0,total:0,current:''}); setBatchDupCount(0);
  };

  // ── NAV TABS ──────────────────────────────────────────────────────────────
  const TABS = [
    {key:'overview', label:'Overview', icon:'◈'},
    {key:'scan',     label:'Scan',     icon:'◎'},
    {key:'receipts', label:`Receipts${receipts.length?` (${receipts.length})`:''}`, icon:'◷'},
    {key:'planned',  label:'Planned',  icon:'◻'},
  ];

  // ════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>

      {/* TOP BAR */}
      <View style={s.topBar}>
        <View style={s.topRow}>
          <Text style={s.appTitle}>Financial Monitor</Text>
          <Text style={s.balancePill}>€ {fmt(BALANCE)}</Text>
        </View>
        <View style={s.tabRow}>
          {TABS.map(t=>(
            <TouchableOpacity key={t.key} onPress={()=>setTab(t.key)} style={[s.tabBtn, tab===t.key&&s.tabBtnActive]}>
              <Text style={[s.tabTxt, tab===t.key&&s.tabTxtActive]}>{t.icon} {t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

        {/* ════════════════════════════════════ OVERVIEW */}
        {tab==='overview' && (
          <View>
            <View style={s.balanceCard}>
              <View style={s.goldStripe}/>
              <Lbl>CURRENT ACCOUNT BALANCE</Lbl>
              <View style={s.balanceRow}>
                <Text style={s.currSign}>€</Text>
                <Text style={s.balanceNum}>{fmt(BALANCE)}</Text>
              </View>
              <View style={s.progressTrack}>
                <View style={[s.progressBg,{width:`${spentPct+plannedPct}%`}]}/>
                <View style={[s.progressFg,{width:`${spentPct}%`}]}/>
              </View>
              <View style={s.progressLbls}>
                <Text style={s.progressLbl}>Spent <Text style={{color:C.amber,fontFamily:MONO}}>−€{fmt(totalSpent)}</Text></Text>
                <Text style={s.progressLbl}>Planned <Text style={{color:C.red,fontFamily:MONO}}>−€{fmt(totalPlanned)}</Text></Text>
              </View>
              <View style={[s.remainBox,{backgroundColor:afterAll>=0?C.greenDim:C.redDim,borderColor:afterAll>=0?'rgba(74,174,120,0.25)':'rgba(208,72,72,0.25)'}]}>
                <View>
                  <Text style={s.remainLbl}>After all expenses</Text>
                  <Text style={s.remainSub}>balance − spent − planned</Text>
                </View>
                <Text style={[s.remainAmt,{color:afterAll>=0?C.green:C.red}]}>€{fmt(afterAll)}</Text>
              </View>
            </View>

            <View style={s.statGrid}>
              {[
                {lbl:'Receipts',    val:receipts.length,         color:C.gold,                     money:false, sub:'scanned'},
                {lbl:'Total Spent', val:totalSpent,              color:C.amber,                    money:true,  pre:'−€'},
                {lbl:'After Spent', val:BALANCE-totalSpent,      color:C.text,                     money:true,  pre:'€'},
                {lbl:'After All',   val:afterAll,                color:afterAll>=0?C.green:C.red,  money:true,  pre:'€'},
              ].map((st,i)=>(
                <View key={i} style={s.statCard}>
                  <Lbl>{st.lbl.toUpperCase()}</Lbl>
                  <Text style={[s.statVal,{color:st.color}]}>
                    {st.money ? `${st.pre}${fmt(Math.abs(st.val))}` : st.val}
                  </Text>
                  {st.sub && <Text style={s.statSub}>{st.sub}</Text>}
                </View>
              ))}
            </View>

            <View style={s.card}>
              <View style={{paddingHorizontal:18,paddingTop:14,paddingBottom:8}}><Lbl>FULL BREAKDOWN</Lbl></View>
              {[
                {lbl:`Account balance`,                          val:BALANCE,      color:C.text,  pre:'€' },
                {lbl:`Spent (${receipts.length} receipts)`,      val:totalSpent,   color:C.amber, pre:'−€'},
                {lbl:`Planned (${PLANNED.length} items)`,        val:totalPlanned, color:C.red,   pre:'−€'},
              ].map((r,i)=>(
                <View key={i} style={s.sumRow}>
                  <Text style={s.sumLbl}>{r.lbl}</Text>
                  <Text style={[s.sumVal,{color:r.color}]}>{r.pre}{fmt(r.val)}</Text>
                </View>
              ))}
              <View style={[s.sumTotal,{backgroundColor:afterAll>=0?'rgba(74,174,120,0.05)':'rgba(208,72,72,0.05)'}]}>
                <Text style={s.sumTotalLbl}>Net Remaining</Text>
                <Text style={[s.sumTotalVal,{color:afterAll>=0?C.green:C.red}]}>€{fmt(afterAll)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ════════════════════════════════════ SCAN */}
        {tab==='scan' && (
          <View>
            <Text style={s.pageTitle}>Scan Receipts</Text>
            <Text style={s.pageSub}>Upload multiple photos at once — AI scans each one and removes duplicates automatically.</Text>

            {/* IDLE */}
            {scanStep==='idle' && batchStep==='idle' && (
              <View>
                <TouchableOpacity style={s.batchBtn} onPress={pickMultiple} activeOpacity={0.8}>
                  <View style={s.batchBtnInner}>
                    <Text style={s.batchBtnIcon}>📁</Text>
                    <View style={{flex:1}}>
                      <Text style={s.batchBtnTitle}>Batch Upload</Text>
                      <Text style={s.batchBtnSub}>Select up to 20 photos — auto-scan & deduplicate</Text>
                    </View>
                    <Text style={{fontSize:20,color:C.gold}}>→</Text>
                  </View>
                </TouchableOpacity>

                <View style={s.orDivider}>
                  <View style={s.orLine}/><Text style={s.orTxt}>OR SINGLE</Text><View style={s.orLine}/>
                </View>

                <View style={s.pickRow}>
                  <TouchableOpacity style={s.pickBtn} onPress={()=>pickImage(true)} activeOpacity={0.8}>
                    <Text style={s.pickIcon}>📷</Text>
                    <Text style={s.pickLabel}>Camera</Text>
                    <Text style={s.pickSub}>Take photo now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.pickBtn} onPress={()=>pickImage(false)} activeOpacity={0.8}>
                    <Text style={s.pickIcon}>🖼️</Text>
                    <Text style={s.pickLabel}>Gallery</Text>
                    <Text style={s.pickSub}>Choose one photo</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.card}>
                  <View style={{padding:14,paddingBottom:8}}><Lbl>TIPS FOR BEST RESULTS</Lbl></View>
                  {['📸  Good lighting — avoid shadows','🔍  Keep receipt flat and in focus','📄  Capture the full receipt','🔄  Duplicate photos are skipped automatically'].map((t,i)=>(
                    <View key={i} style={[s.tipRow,{borderTopWidth:i===0?0:1}]}>
                      <Text style={s.tipTxt}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* BATCH PROCESSING */}
            {batchStep==='processing' && (
              <View style={[s.card,{alignItems:'center',padding:32}]}>
                <ActivityIndicator size="large" color={C.gold} style={{marginBottom:20}}/>
                <Text style={[s.pickLabel,{marginBottom:6}]}>Scanning receipts…</Text>
                <Text style={[s.pageSub,{textAlign:'center',marginBottom:20}]}>{batchProgress.current}</Text>
                <View style={[s.progressTrack,{width:'100%'}]}>
                  <View style={[s.progressFg,{width:`${batchProgress.total>0?(batchProgress.done/batchProgress.total)*100:0}%`}]}/>
                </View>
                <Text style={[s.label,{marginTop:12}]}>{batchProgress.done} / {batchProgress.total} PHOTOS</Text>
              </View>
            )}

            {/* BATCH REVIEW */}
            {batchStep==='review' && (
              <View>
                <View style={s.batchSummaryRow}>
                  <View style={[s.batchSummaryCard,{borderColor:'rgba(74,174,120,0.3)'}]}>
                    <Text style={[s.batchSumNum,{color:C.green}]}>{batchResults.filter(r=>!r.isDuplicate&&r.fields).length}</Text>
                    <Text style={s.batchSumLbl}>NEW</Text>
                  </View>
                  <View style={[s.batchSummaryCard,{borderColor:'rgba(201,150,58,0.3)'}]}>
                    <Text style={[s.batchSumNum,{color:C.gold}]}>{batchDupCount}</Text>
                    <Text style={s.batchSumLbl}>DUPLICATES</Text>
                  </View>
                  <View style={[s.batchSummaryCard,{borderColor:'rgba(208,72,72,0.3)'}]}>
                    <Text style={[s.batchSumNum,{color:C.red}]}>{batchResults.filter(r=>r.error).length}</Text>
                    <Text style={s.batchSumLbl}>ERRORS</Text>
                  </View>
                </View>

                <View style={[s.card,{marginBottom:14}]}>
                  <View style={{paddingHorizontal:16,paddingVertical:12}}><Lbl>REVIEW BEFORE SAVING</Lbl></View>
                  {batchResults.map((r,i)=>(
                    <View key={r.id}>
                      <View style={[s.batchRow, r.isDuplicate&&{opacity:0.45}]}>
                        <View style={s.batchThumbWrap}>
                          {r.uri && <Image source={{uri:r.uri}} style={s.batchThumb} resizeMode="cover"/>}
                        </View>
                        <View style={s.batchInfo}>
                          {r.error
                            ? <Text style={[s.expName,{color:C.red}]}>⚠️ Could not read</Text>
                            : r.fields
                              ? <>
                                  <Text style={s.expName} numberOfLines={1}>{r.fields.store||'Unknown'}</Text>
                                  <Text style={s.expLbl} numberOfLines={1}>{r.fields.item}</Text>
                                  <Text style={s.expMeta}>{r.fields.date} · {r.fields.category}</Text>
                                </>
                              : null}
                        </View>
                        <View style={{alignItems:'flex-end',minWidth:60}}>
                          {r.isDuplicate
                            ? <View style={s.dupBadge}><Text style={s.dupBadgeTxt}>DUP</Text></View>
                            : r.error
                              ? <View style={s.errBadge}><Text style={s.errBadgeTxt}>ERR</Text></View>
                              : <View style={s.newBadge}><Text style={s.newBadgeTxt}>NEW</Text></View>}
                          {r.fields && (
                            <Text style={[s.expAmt,{color:r.isDuplicate?C.mid:C.amber,marginTop:4,fontSize:13}]}>
                              €{fmt(parseFloat(r.fields.amount)||0)}
                            </Text>
                          )}
                        </View>
                      </View>
                      {i<batchResults.length-1 && <Divider/>}
                    </View>
                  ))}
                </View>

                <View style={s.actionRow}>
                  <TouchableOpacity onPress={resetBatch} style={s.discardBtn}>
                    <Text style={s.discardTxt}>Discard All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmBatch} style={s.confirmBtn}>
                    <Text style={s.confirmTxt}>✓ Save {batchResults.filter(r=>!r.isDuplicate&&r.fields&&parseFloat(r.fields.amount)>0).length} Receipts</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* SINGLE SCANNING */}
            {scanStep==='scanning' && batchStep==='idle' && (
              <View style={[s.card,{alignItems:'center',padding:32}]}>
                {scanUri && <Image source={{uri:scanUri}} style={s.previewImg} resizeMode="contain"/>}
                <ActivityIndicator size="large" color={C.gold} style={{marginBottom:16}}/>
                <Text style={[s.pickLabel,{marginBottom:6}]}>Reading receipt…</Text>
                <Text style={[s.pageSub,{textAlign:'center'}]}>Claude AI is extracting the data</Text>
              </View>
            )}

            {/* SINGLE ERROR */}
            {scanStep==='error' && batchStep==='idle' && (
              <View style={[s.card,{backgroundColor:C.redDim,borderColor:'rgba(208,72,72,0.3)',padding:20}]}>
                <Text style={[s.pickLabel,{color:C.red,marginBottom:8}]}>⚠️ Could not read receipt</Text>
                <Text style={[s.pageSub,{marginBottom:16}]}>{scanError}</Text>
                <TouchableOpacity onPress={resetScan} style={s.discardBtn}>
                  <Text style={[s.discardTxt,{color:C.red}]}>← Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* SINGLE RESULT */}
            {scanStep==='result' && editFields && batchStep==='idle' && (
              <View>
                {scanUri && <Image source={{uri:scanUri}} style={[s.previewImg,{width:'100%',marginBottom:14,borderRadius:14}]} resizeMode="contain"/>}
                <View style={[s.card,{marginBottom:14}]}>
                  <View style={[s.sumRow,{paddingTop:14}]}>
                    <View>
                      <Lbl>AI EXTRACTED DATA</Lbl>
                      <Text style={s.sectionTitle}>Review & Edit</Text>
                    </View>
                    <View style={s.readBadge}><Text style={s.readBadgeTxt}>✓ READ</Text></View>
                  </View>
                  <Divider/>
                  {[
                    {k:'store',    label:'STORE / VENDOR',     big:false},
                    {k:'amount',   label:'TOTAL AMOUNT (€)',   big:true },
                    {k:'date',     label:'DATE',               big:false},
                    {k:'category', label:'CATEGORY',           big:false},
                    {k:'item',     label:'ITEMS / DESCRIPTION',big:false},
                  ].map(f=>(
                    <View key={f.k} style={s.fieldRow}>
                      <Lbl>{f.label}</Lbl>
                      <TextInput
                        value={editFields[f.k]}
                        onChangeText={v=>setEditFields(p=>({...p,[f.k]:v}))}
                        style={[s.fieldInput, f.big&&s.fieldInputBig]}
                        placeholderTextColor={C.dim}
                        keyboardType={f.k==='amount'?'decimal-pad':'default'}
                      />
                    </View>
                  ))}
                </View>
                <View style={s.actionRow}>
                  <TouchableOpacity onPress={resetScan} style={s.discardBtn}>
                    <Text style={s.discardTxt}>Discard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmScan} style={s.confirmBtn}>
                    <Text style={s.confirmTxt}>✓ Add to Receipts</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ════════════════════════════════════ RECEIPTS — BY DAY */}
        {tab==='receipts' && (
          <View>
            <View style={s.pageHeader}>
              <View>
                <Text style={s.pageTitle}>Receipts</Text>
                <Text style={s.pageSub}>
                  {receipts.length
                    ? `${receipts.length} receipts · €${fmt(totalSpent)} · ${dayKeys.length} day${dayKeys.length!==1?'s':''}`
                    : 'No receipts yet'}
                </Text>
              </View>
              <TouchableOpacity onPress={()=>setTab('scan')} style={s.addBtn}>
                <Text style={s.addBtnTxt}>+ Scan</Text>
              </TouchableOpacity>
            </View>

            {receipts.length===0 ? (
              <View style={[s.card,{alignItems:'center',padding:44}]}>
                <Text style={{fontSize:44,marginBottom:14}}>🧾</Text>
                <Text style={[s.pickLabel,{marginBottom:8}]}>No receipts scanned yet</Text>
                <Text style={[s.pageSub,{marginBottom:20,textAlign:'center'}]}>Use the Scan tab to photograph receipts</Text>
                <TouchableOpacity onPress={()=>setTab('scan')} style={s.addBtn}>
                  <Text style={s.addBtnTxt}>📷 Scan Receipts</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {/* Day selector chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayScroll} contentContainerStyle={s.dayScrollContent}>
                  <TouchableOpacity
                    style={[s.dayChip, selectedDay==='all'&&s.dayChipActive]}
                    onPress={()=>setSelectedDay('all')}
                  >
                    <Text style={[s.dayChipTxt, selectedDay==='all'&&s.dayChipTxtActive]}>All</Text>
                    <Text style={[s.dayChipCount, selectedDay==='all'&&{color:C.gold}]}>{receipts.length}</Text>
                  </TouchableOpacity>
                  {dayKeys.map(key=>(
                    <TouchableOpacity
                      key={key}
                      style={[s.dayChip, selectedDay===key&&s.dayChipActive]}
                      onPress={()=>setSelectedDay(key)}
                    >
                      <Text style={[s.dayChipTxt, selectedDay===key&&s.dayChipTxtActive]}>{formatDayLabel(key)}</Text>
                      <Text style={[s.dayChipCount, selectedDay===key&&{color:C.gold}]}>{receiptsByDay[key].length}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Day sections */}
                {(selectedDay==='all' ? dayKeys : [selectedDay]).map(key=>{
                  const dayRecs  = receiptsByDay[key] || [];
                  const dayTotal = dayRecs.reduce((s,r)=>s+r.amount,0);
                  return (
                    <View key={key} style={{marginBottom:16}}>
                      <View style={s.dayHeader}>
                        <View>
                          <Text style={s.dayTitle}>{key==='Today'?'Today':formatDayLabel(key)}</Text>
                          <Text style={s.dayMeta}>{dayRecs.length} receipt{dayRecs.length!==1?'s':''}</Text>
                        </View>
                        <Text style={[s.dayTotal,{color:C.amber}]}>−€{fmt(dayTotal)}</Text>
                      </View>

                      <View style={s.card}>
                        {dayRecs.map((r,i)=>{
                          const cc = CAT_COLORS[r.category] || CAT_COLORS.Other;
                          return (
                            <View key={r.id}>
                              <View style={[s.expRow,{backgroundColor:cc.bg}]}>
                                <Text style={s.expIcon}>{r.icon}</Text>
                                <View style={s.expInfo}>
                                  <View style={s.expNameRow}>
                                    <Text style={s.expName}>{r.store}</Text>
                                    <View style={[s.catChip,{backgroundColor:cc.bg,borderColor:cc.border}]}>
                                      <Text style={[s.catChipTxt,{color:cc.text}]}>{r.category}</Text>
                                    </View>
                                  </View>
                                  <Text style={s.expLbl} numberOfLines={1}>{r.item}</Text>
                                </View>
                                <View style={s.expRight}>
                                  <Text style={[s.expAmt,{color:cc.text}]}>−€{fmt(r.amount)}</Text>
                                  <Text style={s.expPct}>{dayTotal>0?((r.amount/dayTotal)*100).toFixed(1)+'%':''}</Text>
                                </View>
                              </View>
                              {i<dayRecs.length-1 && <Divider/>}
                            </View>
                          );
                        })}
                        <View style={s.listFoot}>
                          <Text style={s.label}>DAY TOTAL</Text>
                          <Text style={[s.monoMd,{color:C.amber}]}>−€{fmt(dayTotal)}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}

                {selectedDay==='all' && (
                  <View style={s.card}>
                    <View style={s.listFoot}>
                      <Text style={s.label}>GRAND TOTAL — ALL DAYS</Text>
                      <Text style={[s.monoMd,{color:C.amber}]}>−€{fmt(totalSpent)}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ════════════════════════════════════ PLANNED */}
        {tab==='planned' && (
          <View>
            <Text style={s.pageTitle}>Planned Expenses</Text>
            <Text style={[s.pageSub,{marginBottom:14}]}>{PLANNED.length} items · €{fmt(totalPlanned)} total</Text>

            <View style={s.statGrid}>
              {[
                {lbl:'URGENT (3)',    val:urgentSum,             color:C.red, sub:'Fine · Social · Insurance'},
                {lbl:'OPTIONAL (4)', val:totalPlanned-urgentSum, color:C.mid, sub:'Dentist · Travel · Gifts'},
              ].map((st,i)=>(
                <View key={i} style={s.statCard}>
                  <Lbl>{st.lbl}</Lbl>
                  <Text style={[s.statVal,{color:st.color}]}>−€{fmt(st.val)}</Text>
                  <Text style={s.statSub}>{st.sub}</Text>
                </View>
              ))}
            </View>

            <View style={s.card}>
              {(()=>{
                let run = BALANCE - totalSpent;
                return PLANNED.map((p,i)=>{
                  run -= p.amount;
                  return (
                    <View key={p.id}>
                      <View style={[s.expRow, p.urgent&&{backgroundColor:'rgba(208,72,72,0.03)'}]}>
                        <Text style={s.expIcon}>{p.icon}</Text>
                        <View style={s.expInfo}>
                          <View style={s.expNameRow}>
                            <Text style={s.expName}>{p.name}</Text>
                            {p.urgent && <View style={s.urgentChip}><Text style={s.urgentChipTxt}>URGENT</Text></View>}
                          </View>
                          <Text style={s.expLbl}>{p.label}</Text>
                          <View style={s.miniTrack}>
                            <View style={[s.miniFill,{width:`${(p.amount/totalPlanned)*100}%`,backgroundColor:p.urgent?C.red:C.mid}]}/>
                          </View>
                        </View>
                        <View style={s.expRight}>
                          <Text style={[s.expAmt,{color:p.urgent?C.red:C.mid}]}>−€{fmt(p.amount)}</Text>
                          <Text style={s.expPct}>{((p.amount/totalPlanned)*100).toFixed(1)}%</Text>
                          <Text style={s.expPct}>→ €{fmt(run)}</Text>
                        </View>
                      </View>
                      {i<PLANNED.length-1 && <Divider/>}
                    </View>
                  );
                });
              })()}
              <View style={s.listFoot}>
                <Text style={s.label}>REMAINING AFTER ALL</Text>
                <Text style={[s.monoMd,{color:C.green}]}>€{fmt(afterAll)}</Text>
              </View>
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:      {flex:1,backgroundColor:C.bg},
  scroll:    {flex:1},
  container: {padding:15,paddingBottom:50},

  topBar:     {backgroundColor:'#09101A',borderBottomWidth:1,borderBottomColor:C.border,paddingHorizontal:15,paddingTop:12,paddingBottom:0},
  topRow:     {flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},
  appTitle:   {fontFamily:SERIF,fontSize:18,fontWeight:'700',color:C.text,letterSpacing:-0.3},
  balancePill:{fontFamily:MONO,fontSize:14,fontWeight:'600',color:C.gold},

  tabRow:       {flexDirection:'row',gap:4,paddingBottom:0},
  tabBtn:       {flex:1,paddingVertical:8,borderBottomWidth:2,borderBottomColor:'transparent',alignItems:'center'},
  tabBtnActive: {borderBottomColor:C.gold},
  tabTxt:       {fontSize:10,fontWeight:'500',color:C.mid,fontFamily:Platform.OS==='android'?'sans-serif':'System'},
  tabTxtActive: {color:C.gold,fontWeight:'700'},

  balanceCard: {backgroundColor:'#0F1A2E',borderWidth:1,borderColor:C.borderHi,borderRadius:20,padding:22,marginBottom:12,overflow:'hidden'},
  goldStripe:  {position:'absolute',top:0,left:0,right:0,height:2,backgroundColor:C.gold,opacity:0.7},
  label:       {fontSize:9,letterSpacing:2,color:C.mid,marginBottom:6,fontFamily:Platform.OS==='android'?'sans-serif':'System'},
  balanceRow:  {flexDirection:'row',alignItems:'flex-end',marginBottom:18,marginTop:4},
  currSign:    {fontFamily:MONO,fontSize:16,color:C.gold,fontWeight:'500',marginBottom:6,marginRight:6},
  balanceNum:  {fontFamily:MONO,fontSize:44,fontWeight:'700',color:C.text,letterSpacing:-2,lineHeight:48},

  progressTrack: {height:6,backgroundColor:'#080E18',borderRadius:3,overflow:'hidden',marginBottom:8},
  progressBg:    {position:'absolute',left:0,top:0,bottom:0,backgroundColor:'rgba(208,72,72,0.22)',borderRadius:3},
  progressFg:    {position:'absolute',left:0,top:0,bottom:0,backgroundColor:C.red,borderRadius:3},
  progressLbls:  {flexDirection:'row',justifyContent:'space-between',marginBottom:16},
  progressLbl:   {fontSize:11,color:C.mid},

  remainBox: {borderRadius:12,borderWidth:1,padding:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  remainLbl: {fontSize:11,color:C.mid},
  remainSub: {fontSize:10,color:C.dim,marginTop:2},
  remainAmt: {fontFamily:MONO,fontSize:22,fontWeight:'700'},

  statGrid: {flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:12},
  statCard: {flex:1,minWidth:'45%',backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:14,padding:14},
  statVal:  {fontFamily:MONO,fontSize:16,fontWeight:'700',marginBottom:4},
  statSub:  {fontSize:10,color:C.dim},

  card: {backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:16,marginBottom:12,overflow:'hidden'},

  sumRow:      {flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:10,paddingHorizontal:18,borderTopWidth:1,borderTopColor:C.border},
  sumLbl:      {fontSize:13,color:C.mid},
  sumVal:      {fontFamily:MONO,fontSize:13,fontWeight:'600'},
  sumTotal:    {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:18,paddingTop:14},
  sumTotalLbl: {fontFamily:SERIF,fontSize:15,fontWeight:'600',color:C.text},
  sumTotalVal: {fontFamily:MONO,fontSize:20,fontWeight:'700'},

  pageTitle:   {fontFamily:SERIF,fontSize:22,fontWeight:'700',color:C.text,marginBottom:4},
  pageSub:     {fontSize:12,color:C.mid,marginBottom:16,lineHeight:18},
  pageHeader:  {flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14},
  sectionTitle:{fontFamily:SERIF,fontSize:16,fontWeight:'600',color:C.text},

  pickRow:  {flexDirection:'row',gap:10,marginBottom:14},
  pickBtn:  {flex:1,backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:16,padding:20,alignItems:'center'},
  pickIcon: {fontSize:36,marginBottom:10},
  pickLabel:{fontSize:14,fontWeight:'600',color:C.text,marginBottom:4},
  pickSub:  {fontSize:11,color:C.mid,textAlign:'center'},

  tipRow: {flexDirection:'row',padding:12,paddingHorizontal:16,borderTopColor:C.border},
  tipTxt: {fontSize:12,color:C.mid,lineHeight:18},

  previewImg: {width:'100%',height:180,borderRadius:12,marginBottom:16,opacity:0.85},

  fieldRow:      {paddingHorizontal:18,paddingVertical:12,borderTopWidth:1,borderTopColor:C.border},
  fieldInput:    {color:C.text,fontSize:14,fontWeight:'500',borderBottomWidth:1,borderBottomColor:C.borderHi,paddingVertical:4,fontFamily:Platform.OS==='android'?'sans-serif':'System'},
  fieldInputBig: {fontFamily:MONO,fontSize:22,fontWeight:'700',color:C.gold},

  actionRow:  {flexDirection:'row',gap:10,marginBottom:16},
  discardBtn: {flex:1,backgroundColor:'transparent',borderWidth:1,borderColor:C.border,borderRadius:12,padding:14,alignItems:'center'},
  discardTxt: {fontSize:13,fontWeight:'600',color:C.mid},
  confirmBtn: {flex:2.5,backgroundColor:C.gold,borderRadius:12,padding:14,alignItems:'center'},
  confirmTxt: {fontSize:13,fontWeight:'700',color:'#06090F'},

  addBtn:    {backgroundColor:C.goldDim,borderWidth:1,borderColor:'rgba(201,150,58,0.4)',borderRadius:10,paddingHorizontal:14,paddingVertical:8},
  addBtnTxt: {fontSize:12,fontWeight:'700',color:C.gold},

  readBadge:    {backgroundColor:'rgba(74,174,120,0.12)',borderWidth:1,borderColor:'rgba(74,174,120,0.3)',borderRadius:6,paddingHorizontal:9,paddingVertical:3},
  readBadgeTxt: {fontSize:9,color:C.green,fontWeight:'700',letterSpacing:1},

  expRow:    {flexDirection:'row',alignItems:'center',padding:14,paddingHorizontal:16},
  expIcon:   {fontSize:22,width:32,textAlign:'center',marginRight:12},
  expInfo:   {flex:1,minWidth:0},
  expNameRow:{flexDirection:'row',alignItems:'center',marginBottom:3,gap:7,flexWrap:'wrap'},
  expName:   {fontSize:14,fontWeight:'600',color:C.text,flexShrink:1},
  expLbl:    {fontSize:12,color:C.mid},
  expMeta:   {fontSize:10,color:C.dim,marginTop:2},
  expRight:  {alignItems:'flex-end',minWidth:85,marginLeft:8},
  expAmt:    {fontFamily:MONO,fontSize:14,fontWeight:'700'},
  expPct:    {fontSize:10,color:C.dim,marginTop:2},

  urgentChip:   {backgroundColor:C.redDim,borderWidth:1,borderColor:'rgba(208,72,72,0.3)',borderRadius:4,paddingHorizontal:5,paddingVertical:1},
  urgentChipTxt:{fontSize:8,color:C.red,fontWeight:'700',letterSpacing:0.5},

  miniTrack: {height:2,backgroundColor:C.border,borderRadius:1,marginTop:8,overflow:'hidden'},
  miniFill:  {height:'100%',borderRadius:1},

  listFoot: {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:14,paddingHorizontal:16,backgroundColor:'rgba(201,150,58,0.05)'},
  monoMd:   {fontFamily:MONO,fontSize:16,fontWeight:'700'},

  // Batch upload
  batchBtn:      {backgroundColor:'#0F1A2E',borderWidth:1.5,borderColor:C.borderHi,borderRadius:16,marginBottom:14,overflow:'hidden'},
  batchBtnInner: {flexDirection:'row',alignItems:'center',padding:18,gap:14},
  batchBtnIcon:  {fontSize:32},
  batchBtnTitle: {fontSize:16,fontWeight:'700',color:C.text,marginBottom:3},
  batchBtnSub:   {fontSize:12,color:C.mid,lineHeight:17},

  orDivider: {flexDirection:'row',alignItems:'center',gap:10,marginBottom:14},
  orLine:    {flex:1,height:1,backgroundColor:C.border},
  orTxt:     {fontSize:9,color:C.dim,letterSpacing:2},

  batchSummaryRow:  {flexDirection:'row',gap:9,marginBottom:14},
  batchSummaryCard: {flex:1,backgroundColor:C.card,borderWidth:1,borderRadius:12,padding:12,alignItems:'center'},
  batchSumNum:      {fontFamily:MONO,fontSize:24,fontWeight:'700',marginBottom:2},
  batchSumLbl:      {fontSize:9,color:C.mid,letterSpacing:1.5},

  batchRow:      {flexDirection:'row',alignItems:'center',padding:12,paddingHorizontal:14,gap:10},
  batchThumbWrap:{width:52,height:52,borderRadius:8,overflow:'hidden',backgroundColor:C.border},
  batchThumb:    {width:52,height:52},
  batchInfo:     {flex:1,minWidth:0},

  dupBadge:    {backgroundColor:'rgba(201,150,58,0.12)',borderWidth:1,borderColor:'rgba(201,150,58,0.3)',borderRadius:4,paddingHorizontal:5,paddingVertical:2},
  dupBadgeTxt: {fontSize:8,color:C.gold,fontWeight:'700',letterSpacing:0.5},
  errBadge:    {backgroundColor:C.redDim,borderWidth:1,borderColor:'rgba(208,72,72,0.3)',borderRadius:4,paddingHorizontal:5,paddingVertical:2},
  errBadgeTxt: {fontSize:8,color:C.red,fontWeight:'700',letterSpacing:0.5},
  newBadge:    {backgroundColor:'rgba(74,174,120,0.12)',borderWidth:1,borderColor:'rgba(74,174,120,0.3)',borderRadius:4,paddingHorizontal:5,paddingVertical:2},
  newBadgeTxt: {fontSize:8,color:C.green,fontWeight:'700',letterSpacing:0.5},

  // Day tabs
  dayScroll:       {marginBottom:14},
  dayScrollContent:{flexDirection:'row',gap:8,paddingRight:4},
  dayChip:         {backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:20,paddingHorizontal:14,paddingVertical:7,alignItems:'center',minWidth:58},
  dayChipActive:   {borderColor:C.gold,backgroundColor:C.goldDim},
  dayChipTxt:      {fontSize:12,fontWeight:'600',color:C.mid,marginBottom:1},
  dayChipTxtActive:{color:C.gold},
  dayChipCount:    {fontSize:10,color:C.dim,fontFamily:MONO},

  dayHeader: {flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',paddingHorizontal:2,marginBottom:8},
  dayTitle:  {fontFamily:SERIF,fontSize:16,fontWeight:'700',color:C.text},
  dayMeta:   {fontSize:11,color:C.mid,marginTop:2},
  dayTotal:  {fontFamily:MONO,fontSize:15,fontWeight:'700'},

  catChip:    {borderWidth:1,borderRadius:4,paddingHorizontal:6,paddingVertical:1},
  catChipTxt: {fontSize:8,fontWeight:'700',letterSpacing:0.5},
});
