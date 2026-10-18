import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Platform, SafeAreaView, Switch, Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// ─── CONSTANTS ─────────────────────────────────────────────────────────────
const POLL_MS    = 150;
const WIN_SIZE   = 10;
const CALIB_SECS = 30;
const STORAGE = {
  settings: '@vg:settings',
  baseline: '@vg:baseline',
  history:  '@vg:history',
};

const DEFAULT_SETTINGS = {
  volumeThresholdDb: 12,
  durationMs:        2000,
  speedMultiplier:   1.6,
  cooldownMs:        15000,
  alertVibration:    true,
  alertVoice:        true,
  voiceMessage:      'Ти говориш занадто голосно',
  speedMessage:      'Ти говориш занадто швидко, сповільнись',
};

const DEFAULT_BASELINE = {
  avgDb:      -30,
  stdDb:        6,
  speechRate:  40,
  calibrated: false,
};

// ─── UTILS ─────────────────────────────────────────────────────────────────
const Divider = () => <View style={{ height:1, backgroundColor:C.border }}/>;
const Lbl = ({ children, style }) => <Text style={[s.label, style]}>{children}</Text>;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const dbPct = db => clamp((db + 60) / 60, 0, 1) * 100;
const fmtTs = ts => new Date(ts).toLocaleTimeString('uk-UA', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

// ═══════════════════════════════════════════════════════════════════════════
export default function App() {

  // ── UI STATE ───────────────────────────────────────────────────────────
  const [tab,          setTab]          = useState('monitor');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [smoothDb,     setSmoothedDb]   = useState(-60);
  const [alertState,   setAlertState]   = useState('idle');
  const [settings,     setSettings]     = useState(DEFAULT_SETTINGS);
  const [baseline,     setBaseline]     = useState(DEFAULT_BASELINE);
  const [alerts,       setAlerts]       = useState([]);

  const [calibPhase,    setCalibPhase]    = useState('idle');
  const [calibProgress, setCalibProgress] = useState(0);
  const [calibResult,   setCalibResult]   = useState(null);

  // ── REFS ───────────────────────────────────────────────────────────────
  const recRef          = useRef(null);
  const pollRef         = useRef(null);
  const dbWinRef        = useRef([]);
  const cooldownRef     = useRef(false);
  const volSinceRef     = useRef(null);
  const speechActiveRef = useRef(false);
  const speechEvtsRef   = useRef([]);
  const calibSampRef    = useRef([]);
  const smoothDbRef     = useRef(-60);
  const settingsRef     = useRef(DEFAULT_SETTINGS);
  const baselineRef     = useRef(DEFAULT_BASELINE);

  // keep refs in sync with state (needed inside setInterval closures)
  useEffect(() => { smoothDbRef.current  = smoothDb;  }, [smoothDb]);
  useEffect(() => { settingsRef.current  = settings;  }, [settings]);
  useEffect(() => { baselineRef.current  = baseline;  }, [baseline]);

  // ── LOAD SAVED ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [sv, bv, hv] = await Promise.all([
          AsyncStorage.getItem(STORAGE.settings),
          AsyncStorage.getItem(STORAGE.baseline),
          AsyncStorage.getItem(STORAGE.history),
        ]);
        if (sv) { const p = JSON.parse(sv); setSettings(p); settingsRef.current = p; }
        if (bv) { const p = JSON.parse(bv); setBaseline(p); baselineRef.current = p; }
        if (hv) setAlerts(JSON.parse(hv));
      } catch (_) {}
    })();
    return () => { cleanupAudio(); };
  }, []);

  const persist = async (key, val) => {
    try { await AsyncStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  };

  const saveSettings = (s) => { setSettings(s); settingsRef.current = s; persist(STORAGE.settings, s); };
  const saveBaseline = (b) => { setBaseline(b); baselineRef.current = b; persist(STORAGE.baseline, b); };

  // ── AUDIO CLEANUP ──────────────────────────────────────────────────────
  const cleanupAudio = async () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (recRef.current)  { try { await recRef.current.stopAndUnloadAsync(); } catch (_) {} recRef.current = null; }
    try { deactivateKeepAwake(); } catch (_) {}
  };

  // ── MONITORING ─────────────────────────────────────────────────────────
  const startMonitoring = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Потрібен мікрофон', 'Дозвольте доступ до мікрофону у налаштуваннях телефону.');
      return;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true });
      await rec.startAsync();
      recRef.current = rec;

      dbWinRef.current       = [];
      cooldownRef.current    = false;
      volSinceRef.current    = null;
      speechActiveRef.current = false;
      speechEvtsRef.current  = [];

      pollRef.current = setInterval(pollMonitor, POLL_MS);
      await activateKeepAwakeAsync();
      setIsMonitoring(true);
      setAlertState('normal');
    } catch (e) {
      Alert.alert('Помилка запуску', e.message);
    }
  };

  const stopMonitoring = async () => {
    await cleanupAudio();
    setIsMonitoring(false);
    setSmoothedDb(-60);
    setAlertState('idle');
  };

  const pollMonitor = async () => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      const st = await rec.getStatusAsync();
      if (!st.isRecording) return;

      const db  = st.metering ?? -60;
      const set = settingsRef.current;
      const bl  = baselineRef.current;

      // rolling average
      const w = dbWinRef.current;
      w.push(db);
      if (w.length > WIN_SIZE) w.shift();
      const avg = w.reduce((a, v) => a + v, 0) / w.length;
      setSmoothedDb(avg);

      // VAD — count speech segment starts per minute
      const voiceFloor = bl.avgDb - 22;
      const speaking   = db > voiceFloor;
      if (speaking && !speechActiveRef.current) speechEvtsRef.current.push(Date.now());
      speechActiveRef.current = speaking;
      const now = Date.now();
      speechEvtsRef.current = speechEvtsRef.current.filter(t => now - t < 60000);

      if (cooldownRef.current) { setAlertState('cooldown'); return; }

      const volLimit = bl.avgDb + set.volumeThresholdDb;
      if (avg > volLimit) {
        setAlertState('loud');
        if (!volSinceRef.current) {
          volSinceRef.current = now;
        } else if (now - volSinceRef.current >= set.durationMs) {
          triggerAlert('volume', avg);
        }
      } else {
        volSinceRef.current = null;
        const rate = speechEvtsRef.current.length;
        if (bl.calibrated && rate > 8 && rate > bl.speechRate * set.speedMultiplier) {
          setAlertState('fast');
          triggerAlert('speed', avg);
        } else {
          setAlertState('normal');
        }
      }
    } catch (_) {}
  };

  const triggerAlert = async (type, db) => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    const set = settingsRef.current;

    if (set.alertVibration) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 350);
    }
    if (set.alertVoice) {
      Speech.speak(type === 'volume' ? set.voiceMessage : set.speedMessage, { language:'uk', rate:0.85 });
    }

    const entry = { id: Date.now(), type, timestamp: Date.now(), db: Math.round(db) };
    setAlerts(prev => {
      const updated = [entry, ...prev].slice(0, 50);
      persist(STORAGE.history, updated);
      return updated;
    });

    setTimeout(() => { cooldownRef.current = false; }, set.cooldownMs);
  };

  // ── CALIBRATION ────────────────────────────────────────────────────────
  const startCalibration = async () => {
    if (isMonitoring) await stopMonitoring();
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Потрібен мікрофон'); return; }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true });
      await rec.startAsync();
      recRef.current = rec;
      calibSampRef.current = [];
      setCalibPhase('running');
      setCalibProgress(0);

      const totalSamples = Math.round(CALIB_SECS * 1000 / POLL_MS);
      pollRef.current = setInterval(async () => {
        const r = recRef.current;
        if (!r) return;
        const st = await r.getStatusAsync();
        if (!st.isRecording) return;
        calibSampRef.current.push(st.metering ?? -60);
        setCalibProgress(Math.min(calibSampRef.current.length / totalSamples, 1));
        if (calibSampRef.current.length >= totalSamples) {
          clearInterval(pollRef.current); pollRef.current = null;
          await r.stopAndUnloadAsync(); recRef.current = null;
          finishCalibration(calibSampRef.current);
        }
      }, POLL_MS);
    } catch (e) {
      Alert.alert('Помилка', e.message);
      setCalibPhase('idle');
    }
  };

  const finishCalibration = (samples) => {
    const avg = samples.reduce((a, v) => a + v, 0) / samples.length;
    const std = Math.sqrt(samples.reduce((a, v) => a + (v - avg) ** 2, 0) / samples.length);
    const floor = avg - 18;
    let segs = 0, wasOn = false;
    for (const db of samples) {
      const on = db > floor;
      if (on && !wasOn) segs++;
      wasOn = on;
    }
    const speechRate = Math.max(Math.round(segs * (60 / CALIB_SECS)), 5);
    const nb = { avgDb: Math.round(avg * 10) / 10, stdDb: Math.round(std * 10) / 10, speechRate, calibrated: true };
    saveBaseline(nb);
    setCalibResult({ avgDb: nb.avgDb, speechRate: nb.speechRate });
    setCalibPhase('done');
  };

  const cancelCalibration = async () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (recRef.current)  { try { await recRef.current.stopAndUnloadAsync(); } catch (_) {} recRef.current = null; }
    setCalibPhase('idle');
    setCalibProgress(0);
  };

  // ── DERIVED ────────────────────────────────────────────────────────────
  const TABS = [
    { key:'monitor',   label:'Монітор',    icon:'◎' },
    { key:'calibrate', label:'Калібровка', icon:'◈' },
    { key:'history',   label:`Журнал${alerts.length ? ` (${alerts.length})` : ''}`, icon:'◷' },
    { key:'settings',  label:'Налаш.',     icon:'◻' },
  ];

  const METER_COLOR = { idle:C.dim, normal:C.green, loud:C.red, fast:C.amber, cooldown:C.blue }[alertState] ?? C.dim;
  const STATUS = {
    idle:     { text:'● ОЧІКУВАННЯ',   color:C.dim   },
    normal:   { text:'● НОРМА',        color:C.green },
    loud:     { text:'▲ ГОЛОСНО',      color:C.red   },
    fast:     { text:'▶▶ ШВИДКО',      color:C.amber },
    cooldown: { text:'◌ ОХОЛОДЖЕННЯ',  color:C.blue  },
  }[alertState] ?? { text:'●', color:C.dim };

  const volLimitDb = baseline.avgDb + settings.volumeThresholdDb;
  const fillPct    = `${clamp(dbPct(smoothDb), 0, 100)}%`;
  const basePct    = `${clamp(dbPct(baseline.avgDb), 1, 97)}%`;
  const limitPct   = `${clamp(dbPct(volLimitDb),  1, 97)}%`;

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>

      {/* TOP BAR */}
      <View style={s.topBar}>
        <View style={s.topRow}>
          <Text style={s.appTitle}>VoiceGuard</Text>
          {isMonitoring && <View style={s.livePill}><Text style={s.liveTxt}>● LIVE</Text></View>}
        </View>
        <View style={s.tabRow}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
              style={[s.tabBtn, tab === t.key && s.tabBtnActive]}>
              <Text style={[s.tabTxt, tab === t.key && s.tabTxtActive]}>{t.icon} {t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.container}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ══════════════════════════ MONITOR */}
        {tab === 'monitor' && (
          <View>
            <View style={s.meterCard}>
              <View style={s.goldStripe}/>
              <Lbl>РІВЕНЬ ГУЧНОСТІ</Lbl>
              <View style={s.dbRow}>
                <Text style={[s.dbNum, { color: METER_COLOR }]}>{Math.round(smoothDb)}</Text>
                <View style={s.dbSide}>
                  <Text style={s.dbUnit}>dBFS</Text>
                  <View style={[s.statusPill, { backgroundColor: STATUS.color + '1A', borderColor: STATUS.color + '55' }]}>
                    <Text style={[s.statusTxt, { color: STATUS.color }]}>{STATUS.text}</Text>
                  </View>
                </View>
              </View>

              {/* Bar meter */}
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: fillPct, backgroundColor: METER_COLOR }]}/>
                <View style={[s.barMark, { left: basePct,  backgroundColor: C.green }]}/>
                <View style={[s.barMark, { left: limitPct, backgroundColor: C.red   }]}/>
              </View>
              <View style={s.barLbls}>
                <Text style={[s.barLbl, { color: C.green }]}>▲ {Math.round(baseline.avgDb)} норма</Text>
                <Text style={[s.barLbl, { color: C.red   }]}>▲ {Math.round(volLimitDb)} поріг</Text>
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.85}
              onPress={isMonitoring ? stopMonitoring : startMonitoring}
              style={[s.mainBtn, isMonitoring ? s.mainBtnStop : s.mainBtnStart]}>
              <Text style={[s.mainBtnTxt, isMonitoring && { color: C.red }]}>
                {isMonitoring ? '■  Зупинити моніторинг' : '▶  Почати моніторинг'}
              </Text>
            </TouchableOpacity>

            <View style={s.grid}>
              {[
                { lbl:'БАЗОВА НОРМА',  val: baseline.calibrated ? `${baseline.avgDb} dBFS`    : 'не налаш.', col: baseline.calibrated ? C.green : C.mid },
                { lbl:'ПОРІГ',         val: `${Math.round(volLimitDb)} dBFS`,                               col: C.amber },
                { lbl:'ТЕМП МОВЛЕННЯ', val: baseline.calibrated ? `${baseline.speechRate} фр/хв` : 'не налаш.', col: baseline.calibrated ? C.gold : C.mid },
                { lbl:'СПОВІЩЕНЬ',     val: String(alerts.length),                                           col: C.text  },
              ].map((st, i) => (
                <View key={i} style={s.gridCell}>
                  <Lbl>{st.lbl}</Lbl>
                  <Text style={[s.gridVal, { color: st.col }]}>{st.val}</Text>
                </View>
              ))}
            </View>

            {!baseline.calibrated && (
              <TouchableOpacity onPress={() => setTab('calibrate')} style={s.warnBanner}>
                <Text style={{ fontSize:20 }}>⚠️</Text>
                <View style={{ flex:1 }}>
                  <Text style={s.warnTitle}>Калібрування не виконано</Text>
                  <Text style={s.warnSub}>Натисни, щоб налаштувати особисту норму голосу</Text>
                </View>
                <Text style={[s.label, { color:C.amber }]}>→</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ══════════════════════════ CALIBRATE */}
        {tab === 'calibrate' && (
          <View>
            <Text style={s.pageTitle}>Калібрування</Text>
            <Text style={s.pageSub}>
              Говори природно {CALIB_SECS} секунд — застосунок визначить твою звичайну гучність та темп мовлення.
            </Text>

            {calibPhase === 'idle' && (
              <View>
                {baseline.calibrated && (
                  <View style={[s.card, { marginBottom:12 }]}>
                    <View style={{ padding:16 }}>
                      <Lbl>ПОТОЧНА КАЛІБРОВКА</Lbl>
                      <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:12 }}>
                        <View>
                          <Text style={[s.calibNum, { color:C.green }]}>{baseline.avgDb}</Text>
                          <Text style={s.calibNumLbl}>dBFS — гучність</Text>
                        </View>
                        <View style={{ alignItems:'flex-end' }}>
                          <Text style={[s.calibNum, { color:C.gold }]}>{baseline.speechRate}</Text>
                          <Text style={s.calibNumLbl}>фраз/хв — темп</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
                <View style={[s.card, { marginBottom:14 }]}>
                  <View style={{ padding:16, paddingBottom:8 }}><Lbl>ЯК ЦЕ ПРАЦЮЄ</Lbl></View>
                  {[
                    '🎤  Говори у звичному темпі й гучності',
                    '📍  Тримай телефон там, де будеш зазвичай',
                    '🔄  Повтори в тверезому стані для точної норми',
                    '✏️  Пороги можна змінити у вкладці Налаш.',
                  ].map((tip, i) => (
                    <View key={i} style={[s.tipRow, { borderTopWidth: i === 0 ? 0 : 1 }]}>
                      <Text style={s.tipTxt}>{tip}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity onPress={startCalibration} style={s.primaryBtn} activeOpacity={0.85}>
                  <Text style={s.primaryBtnTxt}>◎  Почати калібрування</Text>
                </TouchableOpacity>
                {baseline.calibrated && (
                  <TouchableOpacity
                    onPress={() => { saveBaseline(DEFAULT_BASELINE); setCalibResult(null); }}
                    style={s.ghostBtn}>
                    <Text style={s.ghostBtnTxt}>Скинути калібрування</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {calibPhase === 'running' && (
              <View>
                <View style={[s.card, { marginBottom:12 }]}>
                  <View style={{ padding:26, alignItems:'center' }}>
                    <Text style={{ fontSize:52, marginBottom:14 }}>🎙️</Text>
                    <Text style={[s.pageTitle, { textAlign:'center', marginBottom:6 }]}>Говори зараз...</Text>
                    <Text style={[s.pageSub, { textAlign:'center', marginBottom:20 }]}>
                      Залишилось ≈{Math.max(Math.ceil(CALIB_SECS * (1 - calibProgress)), 0)} сек
                    </Text>
                    <View style={s.calibTrack}>
                      <View style={[s.calibFill, { width:`${calibProgress * 100}%` }]}/>
                    </View>
                    <Text style={[s.label, { marginTop:8 }]}>{Math.round(calibProgress * 100)}%</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={cancelCalibration} style={s.ghostBtn}>
                  <Text style={s.ghostBtnTxt}>Скасувати</Text>
                </TouchableOpacity>
              </View>
            )}

            {calibPhase === 'done' && calibResult && (
              <View>
                <View style={[s.card, { borderColor:'rgba(74,174,120,0.45)', marginBottom:12 }]}>
                  <View style={{ padding:20 }}>
                    <View style={{ flexDirection:'row', alignItems:'center', marginBottom:16 }}>
                      <Text style={{ fontSize:28, marginRight:12 }}>✅</Text>
                      <View>
                        <Text style={[s.pageTitle, { marginBottom:2 }]}>Готово!</Text>
                        <Text style={s.pageSub}>Твоя норма збережена</Text>
                      </View>
                    </View>
                    <Divider/>
                    <View style={{ flexDirection:'row', justifyContent:'space-around', paddingTop:16 }}>
                      <View style={{ alignItems:'center' }}>
                        <Text style={[s.calibNum, { color:C.green }]}>{calibResult.avgDb}</Text>
                        <Text style={s.calibNumLbl}>dBFS</Text>
                        <Lbl style={{ marginTop:4 }}>ГУЧНІСТЬ</Lbl>
                      </View>
                      <View style={{ width:1, backgroundColor:C.border }}/>
                      <View style={{ alignItems:'center' }}>
                        <Text style={[s.calibNum, { color:C.gold }]}>{calibResult.speechRate}</Text>
                        <Text style={s.calibNumLbl}>фраз/хв</Text>
                        <Lbl style={{ marginTop:4 }}>ТЕМП</Lbl>
                      </View>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => { setCalibPhase('idle'); setTab('monitor'); }}
                  style={s.primaryBtn} activeOpacity={0.85}>
                  <Text style={s.primaryBtnTxt}>▶  Почати моніторинг</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCalibPhase('idle')} style={s.ghostBtn}>
                  <Text style={s.ghostBtnTxt}>Повторити калібрування</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ══════════════════════════ HISTORY */}
        {tab === 'history' && (
          <View>
            <View style={s.pageHeader}>
              <View>
                <Text style={s.pageTitle}>Журнал</Text>
                <Text style={s.pageSub}>{alerts.length ? `${alerts.length} сповіщень` : 'Порожньо'}</Text>
              </View>
              {alerts.length > 0 && (
                <TouchableOpacity
                  onPress={() => { setAlerts([]); AsyncStorage.removeItem(STORAGE.history).catch(()=>{}); }}
                  style={s.smallBtn}>
                  <Text style={s.smallBtnTxt}>Очистити</Text>
                </TouchableOpacity>
              )}
            </View>
            {alerts.length === 0 ? (
              <View style={[s.card, { alignItems:'center', padding:44 }]}>
                <Text style={{ fontSize:40, marginBottom:14 }}>📋</Text>
                <Text style={[s.pageTitle, { marginBottom:6 }]}>Порожньо</Text>
                <Text style={[s.pageSub, { textAlign:'center' }]}>Сповіщення з'являться тут під час моніторингу</Text>
              </View>
            ) : (
              <View style={s.card}>
                {alerts.map((a, i) => {
                  const isVol = a.type === 'volume';
                  return (
                    <View key={a.id}>
                      <View style={s.alertRow}>
                        <Text style={s.alertIcon}>{isVol ? '📢' : '⚡'}</Text>
                        <View style={{ flex:1 }}>
                          <Text style={s.alertTitle}>{isVol ? 'Занадто голосно' : 'Занадто швидко'}</Text>
                          <Text style={s.alertMeta}>{fmtTs(a.timestamp)}</Text>
                        </View>
                        <View style={[s.alertTag, {
                          backgroundColor: isVol ? C.redDim : 'rgba(224,122,40,0.12)',
                          borderColor:     isVol ? 'rgba(208,72,72,0.3)' : 'rgba(224,122,40,0.3)',
                        }]}>
                          <Text style={[s.alertTagTxt, { color: isVol ? C.red : C.amber }]}>{a.db} dB</Text>
                        </View>
                      </View>
                      {i < alerts.length - 1 && <Divider/>}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ══════════════════════════ SETTINGS */}
        {tab === 'settings' && (
          <View>
            <Text style={s.pageTitle}>Налаштування</Text>

            <View style={[s.card, { marginBottom:12 }]}>
              <View style={{ padding:16, paddingBottom:8 }}><Lbl>ПОРОГОВІ ЗНАЧЕННЯ</Lbl></View>
              <StepRow label="Поріг гучності"      sub={`+${settings.volumeThresholdDb} dB вище норми`}
                value={settings.volumeThresholdDb}   min={6}   max={20}  step={1}
                display={`+${settings.volumeThresholdDb} dB`}
                onChange={v => saveSettings({ ...settings, volumeThresholdDb: v })}/>
              <Divider/>
              <StepRow label="Час спрацювання"     sub={`${settings.durationMs/1000} сек підтримки`}
                value={settings.durationMs/1000}      min={0.5} max={5}   step={0.5}
                display={`${settings.durationMs/1000}с`}
                onChange={v => saveSettings({ ...settings, durationMs: v * 1000 })}/>
              <Divider/>
              <StepRow label="Поріг темпу мовлення" sub={`×${settings.speedMultiplier.toFixed(1)} від норми`}
                value={settings.speedMultiplier}      min={1.2} max={3}   step={0.1}
                display={`×${settings.speedMultiplier.toFixed(1)}`}
                onChange={v => saveSettings({ ...settings, speedMultiplier: Math.round(v * 10) / 10 })}/>
              <Divider/>
              <StepRow label="Пауза між алертами"  sub={`${settings.cooldownMs/1000} сек між сповіщеннями`}
                value={settings.cooldownMs/1000}      min={5}   max={60}  step={5}
                display={`${settings.cooldownMs/1000}с`}
                onChange={v => saveSettings({ ...settings, cooldownMs: v * 1000 })}/>
            </View>

            <View style={[s.card, { marginBottom:12 }]}>
              <View style={{ padding:16, paddingBottom:8 }}><Lbl>ТИПИ СПОВІЩЕНЬ</Lbl></View>
              <View style={s.toggleRow}>
                <View style={{ flex:1 }}>
                  <Text style={s.toggleLbl}>Вібрація</Text>
                  <Text style={s.toggleSub}>Телефон завібрує двічі</Text>
                </View>
                <Switch value={settings.alertVibration}
                  onValueChange={v => saveSettings({ ...settings, alertVibration: v })}
                  trackColor={{ false:C.border, true:C.goldDim }}
                  thumbColor={settings.alertVibration ? C.gold : C.mid}/>
              </View>
              <Divider/>
              <View style={s.toggleRow}>
                <View style={{ flex:1 }}>
                  <Text style={s.toggleLbl}>Голосове повідомлення (TTS)</Text>
                  <Text style={s.toggleSub}>Синтез мовлення українською</Text>
                </View>
                <Switch value={settings.alertVoice}
                  onValueChange={v => saveSettings({ ...settings, alertVoice: v })}
                  trackColor={{ false:C.border, true:C.goldDim }}
                  thumbColor={settings.alertVoice ? C.gold : C.mid}/>
              </View>
            </View>

            {settings.alertVoice && (
              <View style={[s.card, { marginBottom:12 }]}>
                <View style={{ padding:16, paddingBottom:8 }}><Lbl>ТЕКСТИ ПОВІДОМЛЕНЬ</Lbl></View>
                <View style={s.msgRow}>
                  <Lbl>ПРИ ГУЧНОМУ ГОЛОСІ</Lbl>
                  <TextInput value={settings.voiceMessage}
                    onChangeText={v => saveSettings({ ...settings, voiceMessage: v })}
                    style={s.msgInput} placeholderTextColor={C.dim}
                    placeholder="Текст повідомлення..."/>
                </View>
                <Divider/>
                <View style={s.msgRow}>
                  <Lbl>ПРИ ШВИДКОМУ МОВЛЕННІ</Lbl>
                  <TextInput value={settings.speedMessage}
                    onChangeText={v => saveSettings({ ...settings, speedMessage: v })}
                    style={s.msgInput} placeholderTextColor={C.dim}
                    placeholder="Текст повідомлення..."/>
                </View>
              </View>
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── STEPPER COMPONENT ─────────────────────────────────────────────────────
function StepRow({ label, sub, value, min, max, step, display, onChange }) {
  const dec = () => { if (value > min + 0.001) onChange(Math.round((value - step) * 100) / 100); };
  const inc = () => { if (value < max - 0.001) onChange(Math.round((value + step) * 100) / 100); };
  return (
    <View style={s.stepRow}>
      <View style={{ flex:1 }}>
        <Text style={s.toggleLbl}>{label}</Text>
        <Text style={s.toggleSub}>{sub}</Text>
      </View>
      <View style={s.stepGroup}>
        <TouchableOpacity onPress={dec} style={s.stepBtn}><Text style={s.stepGlyph}>−</Text></TouchableOpacity>
        <Text style={s.stepVal}>{display ?? value}</Text>
        <TouchableOpacity onPress={inc} style={s.stepBtn}><Text style={s.stepGlyph}>+</Text></TouchableOpacity>
      </View>
    </View>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:      { flex:1, backgroundColor:C.bg },
  scroll:    { flex:1 },
  container: { padding:15, paddingBottom:50 },

  topBar:   { backgroundColor:'#09101A', borderBottomWidth:1, borderBottomColor:C.border, paddingHorizontal:15, paddingTop:12, paddingBottom:0 },
  topRow:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  appTitle: { fontFamily:SERIF, fontSize:18, fontWeight:'700', color:C.text, letterSpacing:-0.3 },
  livePill: { backgroundColor:'rgba(208,72,72,0.15)', borderWidth:1, borderColor:'rgba(208,72,72,0.4)', borderRadius:8, paddingHorizontal:10, paddingVertical:3 },
  liveTxt:  { fontSize:10, color:C.red, fontWeight:'700', letterSpacing:1 },

  tabRow:       { flexDirection:'row', gap:4 },
  tabBtn:       { flex:1, paddingVertical:8, borderBottomWidth:2, borderBottomColor:'transparent', alignItems:'center' },
  tabBtnActive: { borderBottomColor:C.gold },
  tabTxt:       { fontSize:9, fontWeight:'500', color:C.mid, fontFamily:Platform.OS==='android'?'sans-serif':'System' },
  tabTxtActive: { color:C.gold, fontWeight:'700' },

  meterCard:  { backgroundColor:'#0F1A2E', borderWidth:1, borderColor:C.borderHi, borderRadius:20, padding:22, marginBottom:12, overflow:'hidden' },
  goldStripe: { position:'absolute', top:0, left:0, right:0, height:2, backgroundColor:C.gold, opacity:0.7 },
  label:      { fontSize:9, letterSpacing:2, color:C.mid, marginBottom:6, fontFamily:Platform.OS==='android'?'sans-serif':'System' },

  dbRow:      { flexDirection:'row', alignItems:'flex-end', marginTop:4, marginBottom:16 },
  dbNum:      { fontFamily:MONO, fontSize:56, fontWeight:'700', letterSpacing:-2, lineHeight:60 },
  dbSide:     { marginLeft:10, paddingBottom:8, justifyContent:'flex-end', gap:8 },
  dbUnit:     { fontFamily:MONO, fontSize:13, color:C.mid },
  statusPill: { borderRadius:8, borderWidth:1, paddingHorizontal:10, paddingVertical:3 },
  statusTxt:  { fontSize:10, fontWeight:'700', letterSpacing:1 },

  barTrack: { height:8, backgroundColor:'#080E18', borderRadius:4, overflow:'hidden', position:'relative', marginBottom:5 },
  barFill:  { position:'absolute', left:0, top:0, bottom:0, borderRadius:4 },
  barMark:  { position:'absolute', top:0, width:2, height:'100%' },
  barLbls:  { flexDirection:'row', justifyContent:'space-between', marginBottom:2 },
  barLbl:   { fontSize:9, letterSpacing:1 },

  mainBtn:      { borderRadius:14, padding:16, alignItems:'center', marginBottom:12 },
  mainBtnStart: { backgroundColor:C.gold },
  mainBtnStop:  { backgroundColor:'transparent', borderWidth:1.5, borderColor:C.red },
  mainBtnTxt:   { fontSize:14, fontWeight:'700', color:'#06090F' },

  grid:     { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:12 },
  gridCell: { flex:1, minWidth:'45%', backgroundColor:C.card, borderWidth:1, borderColor:C.border, borderRadius:12, padding:12 },
  gridVal:  { fontFamily:MONO, fontSize:13, fontWeight:'700', marginTop:4 },

  warnBanner: { flexDirection:'row', alignItems:'center', gap:12, backgroundColor:C.redDim, borderWidth:1, borderColor:'rgba(208,72,72,0.3)', borderRadius:14, padding:14 },
  warnTitle:  { fontSize:13, fontWeight:'600', color:C.text, marginBottom:2 },
  warnSub:    { fontSize:11, color:C.mid, lineHeight:16 },

  card:       { backgroundColor:C.card, borderWidth:1, borderColor:C.border, borderRadius:16, overflow:'hidden' },
  pageTitle:  { fontFamily:SERIF, fontSize:22, fontWeight:'700', color:C.text, marginBottom:4 },
  pageSub:    { fontSize:12, color:C.mid, marginBottom:16, lineHeight:18 },
  pageHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 },

  primaryBtn:    { backgroundColor:C.gold, borderRadius:12, padding:15, alignItems:'center', marginBottom:10 },
  primaryBtnTxt: { fontSize:14, fontWeight:'700', color:'#06090F' },
  ghostBtn:      { backgroundColor:'transparent', borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, alignItems:'center', marginBottom:10 },
  ghostBtnTxt:   { fontSize:13, fontWeight:'600', color:C.mid },
  smallBtn:      { backgroundColor:C.goldDim, borderWidth:1, borderColor:'rgba(201,150,58,0.4)', borderRadius:10, paddingHorizontal:14, paddingVertical:8 },
  smallBtnTxt:   { fontSize:12, fontWeight:'700', color:C.gold },

  tipRow: { padding:12, paddingHorizontal:16, borderTopColor:C.border },
  tipTxt: { fontSize:12, color:C.mid, lineHeight:18 },

  calibTrack:  { height:8, backgroundColor:C.border, borderRadius:4, overflow:'hidden', width:'100%' },
  calibFill:   { height:'100%', backgroundColor:C.gold, borderRadius:4 },
  calibNum:    { fontFamily:MONO, fontSize:30, fontWeight:'700', color:C.text },
  calibNumLbl: { fontSize:11, color:C.mid, marginTop:2 },

  alertRow:    { flexDirection:'row', alignItems:'center', padding:14, paddingHorizontal:16 },
  alertIcon:   { fontSize:20, width:30, textAlign:'center', marginRight:12 },
  alertTitle:  { fontSize:13, fontWeight:'600', color:C.text, marginBottom:2 },
  alertMeta:   { fontSize:11, color:C.mid },
  alertTag:    { borderRadius:6, borderWidth:1, paddingHorizontal:9, paddingVertical:3 },
  alertTagTxt: { fontSize:10, fontWeight:'700', letterSpacing:0.5 },

  stepRow:   { flexDirection:'row', alignItems:'center', padding:14, paddingHorizontal:16 },
  toggleRow: { flexDirection:'row', alignItems:'center', padding:14, paddingHorizontal:16 },
  toggleLbl: { fontSize:13, fontWeight:'600', color:C.text, marginBottom:2 },
  toggleSub: { fontSize:11, color:C.mid },
  stepGroup: { flexDirection:'row', alignItems:'center' },
  stepBtn:   { width:32, height:32, backgroundColor:C.border, borderRadius:8, justifyContent:'center', alignItems:'center' },
  stepGlyph: { fontSize:18, color:C.text, lineHeight:22 },
  stepVal:   { fontFamily:MONO, fontSize:12, color:C.gold, width:56, textAlign:'center' },
  msgRow:    { padding:16 },
  msgInput:  { color:C.text, fontSize:13, borderWidth:1, borderColor:C.borderHi, borderRadius:8, padding:10, marginTop:8 },
});
