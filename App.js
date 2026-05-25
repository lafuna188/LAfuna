import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Platform, SafeAreaView,
  Image, ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// ─── API KEY ───────────────────────────────────────────────────────────────
// Paste your Anthropic API key here to enable the Scan feature.
// Get one at: https://console.anthropic.com  →  Settings  →  API Keys
// Leave empty ('') and the other 3 tabs still work fully offline.
const ANTHROPIC_API_KEY = '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';

// ─── DATA ──────────────────────────────────────────────────────────────────
const BALANCE = 3824.60;

const PLANNED = [
  { id:1, name:'Штраф',                     label:'Fine',                     amount:500, icon:'⚠️', urgent:true  },
  { id:2, name:'Соціалка',                  label:'Social payment',           amount:330, icon:'🏛️', urgent:true  },
  { id:3, name:'Страхування',               label:'Insurance',                amount:120, icon:'🛡️', urgent:true  },
  { id:4, name:'Стоматолог',                label:'Dentist',                  amount:100, icon:'🦷', urgent:false },
  { id:5, name:'Масаж',                     label:'Massage',                  amount:65,  icon:'💆', urgent:false },
  { id:6, name:'Дорога в Німеччину',        label:'Trip to Germany',          amount:50,  icon:'🚗', urgent:false },
  { id:7, name:'Подарунки Хельсі і Майклу', label:'Gifts for Helsi & Michael',amount:50,  icon:'🎁', urgent:false },
];

const CAT_ICONS = {
  Food:'🍽️', Transport:'⛽', Health:'💊', Tech:'📱',
  Utilities:'💡', Shopping:'🛍️', Entertainment:'🎭', Other:'🧾',
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
const fmt = n => Number(n).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});

// ─── SMALL COMPONENTS ──────────────────────────────────────────────────────
const Divider = () => <View style={{height:1,backgroundColor:C.border}}/>;
const Lbl = ({children}) => <Text style={s.label}>{children}</Text>;

// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]           = useState('overview');
  const [receipts, setReceipts] = useState([]);

  // scan state
  const [scanStep, setScanStep]     = useState('idle'); // idle|scanning|result|error
  const [scanUri,  setScanUri]      = useState(null);
  const [editFields, setEditFields] = useState(null);
  const [scanError, setScanError]   = useState('');
  const nextId = useRef(100);

  // ── DERIVED ──────────────────────────────────────────────────────────────
  const totalSpent   = receipts.reduce((s,r)=>s+r.amount,0);
  const totalPlanned = PLANNED.reduce((s,p)=>s+p.amount,0);
  const urgentSum    = PLANNED.filter(p=>p.urgent).reduce((s,p)=>s+p.amount,0);
  const afterAll     = BALANCE - totalSpent - totalPlanned;
  const spentPct     = Math.min((totalSpent/BALANCE)*100,100);
  const plannedPct   = Math.min((totalPlanned/BALANCE)*100,100);

  // ── IMAGE PICKER ─────────────────────────────────────────────────────────
  const pickImage = async (useCamera) => {
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed','Please allow camera access.'); return; }
        result = await ImagePicker.launchCameraAsync({ base64:true, quality:0.85 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed','Please allow photo library access.'); return; }
        result = await ImagePicker.launchImageLibraryAsync({ base64:true, quality:0.85 });
      }
      if (!result.canceled && result.assets?.[0]) {
        processImage(result.assets[0]);
      }
    } catch(e) {
      Alert.alert('Error', e.message);
    }
  };

  // ── CLAUDE API SCAN ──────────────────────────────────────────────────────
  const processImage = async (asset) => {
    setScanUri(asset.uri);
    setScanStep('scanning');
    setScanError('');
    setEditFields(null);

    if (!ANTHROPIC_API_KEY) {
      setScanError('No API key set. Open App.js and paste your Anthropic API key into ANTHROPIC_API_KEY to enable scanning.');
      setScanStep('error');
      return;
    }

    try {
      const mimeType = asset.mimeType || 'image/jpeg';
      const base64   = asset.base64;

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
              {type:'image', source:{type:'base64', media_type:mimeType, data:base64}},
              {type:'text',  text:`Analyze this receipt. Reply ONLY with valid JSON, no markdown:
{"store":"vendor name","date":"DD.MM.YYYY","total":0.00,"items":[{"name":"item","amount":0.00}],"category":"Food|Transport|Health|Tech|Utilities|Shopping|Entertainment|Other"}`}
            ]
          }]
        })
      });

      const data = await resp.json();
      if (data.error) throw new Error(data.error.message);

      const txt  = data.content?.find(b=>b.type==='text')?.text || '';
      const json = JSON.parse(txt.replace(/```json|```/g,'').trim());

      setEditFields({
        store:    json.store    || '',
        amount:   json.total != null ? String(json.total) : '',
        date:     json.date     || '',
        category: json.category || 'Other',
        item:     json.items?.map(i=>i.name).join(', ') || '',
      });
      setScanStep('result');

    } catch(e) {
      setScanError(e.message || 'Could not read receipt. Try a clearer photo.');
      setScanStep('error');
    }
  };

  const confirmScan = () => {
    const amt = parseFloat(editFields?.amount);
    if (!editFields || isNaN(amt) || amt <= 0) return;
    setReceipts(prev => [{
      id:       nextId.current++,
      store:    editFields.store    || 'Unknown',
      item:     editFields.item     || 'Scanned receipt',
      category: editFields.category || 'Other',
      amount:   amt,
      date:     editFields.date     || 'Today',
      icon:     CAT_ICONS[editFields.category] || '🧾',
    }, ...prev]);
    resetScan();
    setTab('receipts');
  };

  const resetScan = () => {
    setScanStep('idle'); setScanUri(null);
    setEditFields(null); setScanError('');
  };

  // ── NAV TABS ─────────────────────────────────────────────────────────────
  const TABS = [
    {key:'overview', label:'Overview', icon:'◈'},
    {key:'scan',     label:'Scan',     icon:'◎'},
    {key:'receipts', label:`Spent${receipts.length?` (${receipts.length})`:''}`, icon:'◷'},
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
            <TouchableOpacity key={t.key} onPress={()=>setTab(t.key)} style={[s.tabBtn, tab===t.key && s.tabBtnActive]}>
              <Text style={[s.tabTxt, tab===t.key && s.tabTxtActive]}>{t.icon} {t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

        {/* ═══════════════════════════════════ OVERVIEW */}
        {tab==='overview' && (
          <View>
            {/* Balance card */}
            <View style={s.balanceCard}>
              <View style={s.goldStripe}/>
              <Lbl>CURRENT ACCOUNT BALANCE</Lbl>
              <View style={s.balanceRow}>
                <Text style={s.currSign}>€</Text>
                <Text style={s.balanceNum}>{fmt(BALANCE)}</Text>
              </View>
              {/* progress bar */}
              <View style={s.progressTrack}>
                <View style={[s.progressBg, {width:`${spentPct+plannedPct}%`}]}/>
                <View style={[s.progressFg, {width:`${spentPct}%`}]}/>
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

            {/* 4 stats */}
            <View style={s.statGrid}>
              {[
                {lbl:'Receipts',    val:receipts.length, color:C.gold,  money:false, sub:'scanned'},
                {lbl:'Total Spent', val:totalSpent,      color:C.amber, money:true,  pre:'−€'},
                {lbl:'After Spent', val:BALANCE-totalSpent, color:C.text, money:true, pre:'€'},
                {lbl:'After All',   val:afterAll,        color:afterAll>=0?C.green:C.red, money:true, pre:'€'},
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

            {/* Summary */}
            <View style={s.card}>
              <View style={{paddingHorizontal:18,paddingTop:14,paddingBottom:8}}><Lbl>FULL BREAKDOWN</Lbl></View>
              {[
                {lbl:`Account balance`,            val:BALANCE,      color:C.text,  pre:'€' },
                {lbl:`Spent (${receipts.length} receipts)`, val:totalSpent,   color:C.amber, pre:'−€'},
                {lbl:`Planned (${PLANNED.length} items)`,   val:totalPlanned, color:C.red,   pre:'−€'},
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

        {/* ═══════════════════════════════════ SCAN */}
        {tab==='scan' && (
          <View>
            <Text style={s.pageTitle}>Scan Receipt</Text>
            <Text style={s.pageSub}>Take a photo or choose from gallery — AI reads everything automatically.</Text>

            {/* IDLE */}
            {scanStep==='idle' && (
              <View>
                <View style={s.pickRow}>
                  <TouchableOpacity style={s.pickBtn} onPress={()=>pickImage(true)} activeOpacity={0.8}>
                    <Text style={s.pickIcon}>📷</Text>
                    <Text style={s.pickLabel}>Camera</Text>
                    <Text style={s.pickSub}>Take photo now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.pickBtn} onPress={()=>pickImage(false)} activeOpacity={0.8}>
                    <Text style={s.pickIcon}>🖼️</Text>
                    <Text style={s.pickLabel}>Gallery</Text>
                    <Text style={s.pickSub}>Choose from photos</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.card}>
                  <View style={{padding:14,paddingBottom:8}}><Lbl>TIPS FOR BEST RESULTS</Lbl></View>
                  {['📸  Good lighting — avoid shadows','🔍  Keep receipt flat and in focus','📄  Capture the full receipt','✏️  You can edit data before saving'].map((t,i,arr)=>(
                    <View key={i} style={[s.tipRow,{borderTopWidth:i===0?0:1}]}>
                      <Text style={s.tipTxt}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* SCANNING */}
            {scanStep==='scanning' && (
              <View style={[s.card,{alignItems:'center',padding:32}]}>
                {scanUri && <Image source={{uri:scanUri}} style={s.previewImg} resizeMode="contain"/>}
                <ActivityIndicator size="large" color={C.gold} style={{marginBottom:16}}/>
                <Text style={[s.pickLabel,{marginBottom:6}]}>Reading receipt…</Text>
                <Text style={[s.pageSub,{textAlign:'center'}]}>Claude AI is extracting the data</Text>
              </View>
            )}

            {/* ERROR */}
            {scanStep==='error' && (
              <View style={[s.card,{backgroundColor:C.redDim,borderColor:'rgba(208,72,72,0.3)',padding:20}]}>
                <Text style={[s.pickLabel,{color:C.red,marginBottom:8}]}>⚠️ Could not read receipt</Text>
                <Text style={[s.pageSub,{marginBottom:16}]}>{scanError}</Text>
                <TouchableOpacity onPress={resetScan} style={s.discardBtn}>
                  <Text style={[s.discardTxt,{color:C.red}]}>← Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* RESULT */}
            {scanStep==='result' && editFields && (
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
                    {k:'store',    label:'STORE / VENDOR',    big:false},
                    {k:'amount',   label:'TOTAL AMOUNT (€)',  big:true },
                    {k:'date',     label:'DATE',              big:false},
                    {k:'category', label:'CATEGORY',          big:false},
                    {k:'item',     label:'ITEMS / DESCRIPTION',big:false},
                  ].map(f=>(
                    <View key={f.k} style={s.fieldRow}>
                      <Lbl>{f.label}</Lbl>
                      <TextInput
                        value={editFields[f.k]}
                        onChangeText={v=>setEditFields(p=>({...p,[f.k]:v}))}
                        style={[s.fieldInput, f.big && s.fieldInputBig]}
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

        {/* ═══════════════════════════════════ RECEIPTS */}
        {tab==='receipts' && (
          <View>
            <View style={s.pageHeader}>
              <View>
                <Text style={s.pageTitle}>Receipts</Text>
                <Text style={s.pageSub}>{receipts.length ? `${receipts.length} scanned · €${fmt(totalSpent)} total` : 'No receipts yet'}</Text>
              </View>
              <TouchableOpacity onPress={()=>setTab('scan')} style={s.addBtn}>
                <Text style={s.addBtnTxt}>+ Scan</Text>
              </TouchableOpacity>
            </View>

            {receipts.length===0 ? (
              <View style={[s.card,{alignItems:'center',padding:44}]}>
                <Text style={{fontSize:44,marginBottom:14}}>🧾</Text>
                <Text style={[s.pickLabel,{marginBottom:8}]}>No receipts scanned yet</Text>
                <Text style={[s.pageSub,{marginBottom:20,textAlign:'center'}]}>Use the Scan tab to photograph a receipt</Text>
                <TouchableOpacity onPress={()=>setTab('scan')} style={s.addBtn}>
                  <Text style={s.addBtnTxt}>📷 Scan First Receipt</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.card}>
                {receipts.map((r,i)=>(
                  <View key={r.id}>
                    <View style={s.expRow}>
                      <Text style={s.expIcon}>{r.icon}</Text>
                      <View style={s.expInfo}>
                        <View style={s.expNameRow}>
                          <Text style={s.expName}>{r.store}</Text>
                          <View style={s.aiBadge}><Text style={s.aiBadgeTxt}>AI</Text></View>
                        </View>
                        <Text style={s.expLbl}>{r.item}</Text>
                        <Text style={s.expMeta}>{r.date} · {r.category}</Text>
                      </View>
                      <View style={s.expRight}>
                        <Text style={[s.expAmt,{color:C.amber}]}>−€{fmt(r.amount)}</Text>
                        <Text style={s.expPct}>{totalSpent>0?((r.amount/totalSpent)*100).toFixed(1)+'%':''}</Text>
                      </View>
                    </View>
                    {i<receipts.length-1 && <Divider/>}
                  </View>
                ))}
                <View style={s.listFoot}>
                  <Text style={s.label}>TOTAL SPENT</Text>
                  <Text style={[s.monoMd,{color:C.amber}]}>−€{fmt(totalSpent)}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════ PLANNED */}
        {tab==='planned' && (
          <View>
            <Text style={s.pageTitle}>Planned Expenses</Text>
            <Text style={[s.pageSub,{marginBottom:14}]}>{PLANNED.length} items · €{fmt(totalPlanned)} total</Text>

            <View style={s.statGrid}>
              {[
                {lbl:'URGENT (3)',   val:urgentSum,            color:C.red, sub:'Fine · Social · Insurance'},
                {lbl:'OPTIONAL (4)', val:totalPlanned-urgentSum,color:C.mid,sub:'Dentist · Travel · Gifts'},
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
                      <View style={[s.expRow,p.urgent&&{backgroundColor:'rgba(208,72,72,0.03)'}]}>
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
  safe:       {flex:1,backgroundColor:C.bg},
  scroll:     {flex:1},
  container:  {padding:15,paddingBottom:50},

  topBar:   {backgroundColor:'#09101A',borderBottomWidth:1,borderBottomColor:C.border,paddingHorizontal:15,paddingTop:12,paddingBottom:0},
  topRow:   {flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},
  appTitle: {fontFamily:SERIF,fontSize:18,fontWeight:'700',color:C.text,letterSpacing:-0.3},
  balancePill:{fontFamily:MONO,fontSize:14,fontWeight:'600',color:C.gold},

  tabRow:       {flexDirection:'row',gap:4,paddingBottom:0},
  tabBtn:       {flex:1,paddingVertical:8,borderBottomWidth:2,borderBottomColor:'transparent',alignItems:'center'},
  tabBtnActive: {borderBottomColor:C.gold},
  tabTxt:       {fontSize:10,fontWeight:'500',color:C.mid,fontFamily:Platform.OS==='android'?'sans-serif':'System'},
  tabTxtActive: {color:C.gold,fontWeight:'700'},

  // Balance card
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

  remainBox:   {borderRadius:12,borderWidth:1,padding:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  remainLbl:   {fontSize:11,color:C.mid},
  remainSub:   {fontSize:10,color:C.dim,marginTop:2},
  remainAmt:   {fontFamily:MONO,fontSize:22,fontWeight:'700'},

  // Stats
  statGrid: {flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:12},
  statCard: {flex:1,minWidth:'45%',backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:14,padding:14},
  statVal:  {fontFamily:MONO,fontSize:16,fontWeight:'700',marginBottom:4},
  statSub:  {fontSize:10,color:C.dim},

  // Card
  card: {backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:16,marginBottom:12,overflow:'hidden'},

  // Summary
  sumRow:      {flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:10,paddingHorizontal:18,borderTopWidth:1,borderTopColor:C.border},
  sumLbl:      {fontSize:13,color:C.mid},
  sumVal:      {fontFamily:MONO,fontSize:13,fontWeight:'600'},
  sumTotal:    {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:18,paddingTop:14},
  sumTotalLbl: {fontFamily:SERIF,fontSize:15,fontWeight:'600',color:C.text},
  sumTotalVal: {fontFamily:MONO,fontSize:20,fontWeight:'700'},

  // Page headers
  pageTitle:  {fontFamily:SERIF,fontSize:22,fontWeight:'700',color:C.text,marginBottom:4},
  pageSub:    {fontSize:12,color:C.mid,marginBottom:16,lineHeight:18},
  pageHeader: {flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14},
  sectionTitle:{fontFamily:SERIF,fontSize:16,fontWeight:'600',color:C.text},

  // Scan pick buttons
  pickRow:    {flexDirection:'row',gap:10,marginBottom:14},
  pickBtn:    {flex:1,backgroundColor:C.card,borderWidth:1,borderColor:C.border,borderRadius:16,padding:20,alignItems:'center'},
  pickIcon:   {fontSize:36,marginBottom:10},
  pickLabel:  {fontSize:14,fontWeight:'600',color:C.text,marginBottom:4},
  pickSub:    {fontSize:11,color:C.mid,textAlign:'center'},

  tipRow:     {flexDirection:'row',padding:12,paddingHorizontal:16,borderTopColor:C.border},
  tipTxt:     {fontSize:12,color:C.mid,lineHeight:18},

  previewImg: {width:'100%',height:180,borderRadius:12,marginBottom:16,opacity:0.85},

  // Scan result fields
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

  // Expense rows
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

  aiBadge:      {backgroundColor:'rgba(74,138,232,0.12)',borderWidth:1,borderColor:'rgba(74,138,232,0.3)',borderRadius:4,paddingHorizontal:5,paddingVertical:1},
  aiBadgeTxt:   {fontSize:8,color:C.blue,fontWeight:'700',letterSpacing:0.5},
  urgentChip:   {backgroundColor:C.redDim,borderWidth:1,borderColor:'rgba(208,72,72,0.3)',borderRadius:4,paddingHorizontal:5,paddingVertical:1},
  urgentChipTxt:{fontSize:8,color:C.red,fontWeight:'700',letterSpacing:0.5},

  miniTrack: {height:2,backgroundColor:C.border,borderRadius:1,marginTop:8,overflow:'hidden'},
  miniFill:  {height:'100%',borderRadius:1},

  listFoot: {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:14,paddingHorizontal:16,backgroundColor:'rgba(201,150,58,0.05)'},
  monoMd:   {fontFamily:MONO,fontSize:16,fontWeight:'700'},
});
