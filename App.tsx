// 小账本 LittleLedger —— P0：月流水 + 手动快记 + AI 一句话记账
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, SafeAreaView, StatusBar,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import {
  initStorage, listCategories, listTransactionsMonth, monthSummary,
  createTransaction, deleteTransaction, listAccounts, type NewTx,
} from './src/db/repository';
import type { Category, Account } from './src/types';
import { parseNaturalLanguage } from './src/ai/aiService';
import { AiReview, toDrafts, type AiDraft } from './src/features/ai/AiReview';

const yuan = (cents: number) => (cents / 100).toFixed(2);
const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

export default function App() {
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);
  const [ready, setReady] = useState(false);
  const [txs, setTxs] = useState<Awaited<ReturnType<typeof listTransactionsMonth>>>([]);
  const [summary, setSummary] = useState({ expenseCents: 0, incomeCents: 0 });
  const [cats, setCats] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // 手动记账
  const [addVisible, setAddVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [pickedCat, setPickedCat] = useState<Category | null>(null);

  // AI 记账
  const [aiVisible, setAiVisible] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDrafts, setAiDrafts] = useState<AiDraft[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setTxs(await listTransactionsMonth(year, month));
    setSummary(await monthSummary(year, month));
  }, [year, month]);

  useEffect(() => {
    (async () => {
      await initStorage();
      setCats(await listCategories());
      setAccounts(await listAccounts());
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof txs>();
    for (const t of txs) {
      const k = dayKey(t.occurredAt);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()];
  }, [txs]);

  const addTx = async () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || !pickedCat || accounts.length === 0) return;
    const tx: NewTx = {
      type: 'expense', amountCents: cents, accountId: accounts[0].id,
      categoryId: pickedCat.id, note: '', occurredAt: Date.now(),
    };
    await createTransaction(tx);
    setAmount(''); setPickedCat(null); setAddVisible(false);
    await refresh();
  };

  const runAiParse = async () => {
    const text = aiText.trim();
    if (!text || aiLoading) return;
    setAiLoading(true); setAiError(null);
    try {
      const bills = await parseNaturalLanguage(
        text, cats.map((c) => c.name), accounts.map((a) => a.name), 'dev-device');
      if (bills.length === 0) setAiError('没识别出金额，换个说法试试');
      else setAiDrafts(toDrafts(bills));
    } catch (e: any) {
      setAiError(e?.message ?? 'AI 服务不可达');
    } finally {
      setAiLoading(false);
    }
  };

  const aiDone = async () => {
    setAiDrafts(null); setAiText(''); setAiVisible(false);
    await refresh();
  };

  if (!ready) return <View style={s.center}><Text>加载中…</Text></View>;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <Text style={s.title}>{year}年{month}月</Text>
        <Text style={s.sumLabel}>支出</Text>
        <Text style={s.sumExpense}>¥ {yuan(summary.expenseCents)}</Text>
        <Text style={[s.sumLabel, { marginTop: 8 }]}>收入 ¥ {yuan(summary.incomeCents)}</Text>

        <Pressable style={s.aiBar} onPress={() => setAiVisible(true)}>
          <Text style={s.aiBarIcon}>🤖</Text>
          <Text style={s.aiBarHint}>试试："今天午饭35，昨天打车回家28.5"</Text>
        </Pressable>
      </View>

      <FlatList
        data={byDay}
        keyExtractor={(d) => d[0]}
        contentContainerStyle={{ paddingBottom: 90 }}
        ListEmptyComponent={<View style={s.center}><Text style={{ color: '#999' }}>还没有账，点右下角记一笔</Text></View>}
        renderItem={({ item: [day, list] }) => (
          <View>
            <Text style={s.day}>{day}</Text>
            {list.map((t) => (
              <Pressable key={t.id} onLongPress={() => deleteTransaction(t.id).then(refresh)}>
                <View style={s.row}>
                  <Text style={s.rowIcon}>{t.categoryIcon ?? '💸'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>
                      {t.categoryName ?? '支出'}
                      {t.source === 'ai' ? <Text style={s.aiTag}> AI</Text> : null}
                    </Text>
                    {t.note ? <Text style={s.rowNote}>{t.note}</Text> : null}
                  </View>
                  <Text style={[s.rowAmount, t.type === 'income' && { color: '#1f8a70' }]}>
                    {t.type === 'income' ? '+' : '-'}{yuan(t.amountCents)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      />

      <Pressable style={s.fab} onPress={() => setAddVisible(true)}>
        <Text style={s.fabText}>＋</Text>
      </Pressable>

      {/* 手动记账弹层 */}
      <Modal visible={addVisible} transparent animationType="slide" onRequestClose={() => setAddVisible(false)}>
        <Pressable style={s.mask} onPress={() => setAddVisible(false)}>
          <View style={s.sheet} onStartShouldSetResponder={() => true}>
            <Text style={s.sheetTitle}>记一笔支出</Text>
            <TextInput
              style={s.input} value={amount} onChangeText={setAmount}
              placeholder="金额" keyboardType="decimal-pad" autoFocus
            />
            <FlatList
              horizontal data={cats.filter((c) => c.type === 'expense')} keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[s.chip, pickedCat?.id === item.id && s.chipOn]}
                  onPress={() => setPickedCat(item)}
                >
                  <Text style={[s.chipText, pickedCat?.id === item.id && { color: '#fff' }]}>
                    {item.icon} {item.name}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable style={s.saveBtn} onPress={addTx}>
              <Text style={s.saveText}>保存</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* AI 一句话记账 */}
      <Modal visible={aiVisible} animationType="slide" onRequestClose={() => setAiVisible(false)}>
        <SafeAreaView style={{ flex: 1 }}>
          {aiDrafts ? (
            <AiReview
              drafts={aiDrafts} categories={cats} accounts={accounts}
              onDone={aiDone} onCancel={() => setAiDrafts(null)}
            />
          ) : (
            <View style={{ flex: 1, padding: 16, backgroundColor: '#f6f6f4' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Pressable onPress={() => setAiVisible(false)} hitSlop={12}>
                  <Text style={{ color: '#666', fontSize: 16 }}>✕ 关闭</Text>
                </Pressable>
                <Text style={{ flex: 1, textAlign: 'center', fontWeight: '600', fontSize: 16, marginRight: 60 }}>AI 记账</Text>
              </View>
              <TextInput
                style={s.aiInput} value={aiText} onChangeText={setAiText} multiline autoFocus
                placeholder={'说人话记账，例如：\n今天中午外卖32，上周给妈妈转了1000，昨天卖旧书赚了45'}
                placeholderTextColor="#aaa"
              />
              {aiError ? <Text style={s.aiError}>{aiError}</Text> : null}
              <Pressable style={[s.saveBtn, aiLoading && { opacity: 0.5 }]} onPress={runAiParse} disabled={aiLoading}>
                {aiLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveText}>✨ 识别</Text>}
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const BRAND = '#1f8a70';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f6f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  header: { backgroundColor: BRAND, padding: 20, paddingBottom: 18, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  title: { color: 'rgba(255,255,255,.85)', fontSize: 15 },
  sumLabel: { color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 10 },
  sumExpense: { color: '#fff', fontSize: 34, fontWeight: '700' },
  aiBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,.18)', borderRadius: 12, padding: 12, marginTop: 14 },
  aiBarIcon: { fontSize: 18, marginRight: 10 },
  aiBarHint: { color: 'rgba(255,255,255,.9)', fontSize: 13 },
  day: { color: '#8a8a8a', fontSize: 12, marginHorizontal: 16, marginTop: 14, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, marginHorizontal: 10, marginBottom: 1, borderRadius: 10 },
  rowIcon: { fontSize: 22, marginRight: 12 },
  rowTitle: { fontSize: 15, color: '#222' },
  aiTag: { fontSize: 10, color: BRAND, fontWeight: '700' },
  rowNote: { fontSize: 12, color: '#999', marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '600', color: '#222' },
  fab: { position: 'absolute', right: 22, bottom: 34, width: 56, height: 56, borderRadius: 28, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  fabText: { color: '#fff', fontSize: 28, marginTop: -2 },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
  sheetTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e3e3e0', borderRadius: 10, padding: 12, fontSize: 22, marginBottom: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#f0f0ee', marginRight: 8 },
  chipOn: { backgroundColor: BRAND },
  chipText: { color: '#333' },
  saveBtn: { backgroundColor: BRAND, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 18 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  aiInput: { backgroundColor: '#fff', borderRadius: 14, padding: 14, fontSize: 16, minHeight: 140, textAlignVertical: 'top' },
  aiError: { color: '#c0392b', marginTop: 10, fontSize: 13 },
});
