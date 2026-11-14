// AI 记账确认页：解析结果 → 用户核对 → 勾选入库
// 设计原则：AI 是"建议"，落账永远经用户确认（可改分类/金额/日期）
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ParsedTx } from '../../ai/protocol';
import type { Account, Category } from '../../types';
import { createTransaction } from '../../db/repository';

export interface AiDraft extends ParsedTx {
  key: string;
  checked: boolean;
}

export const toDrafts = (bills: ParsedTx[]): AiDraft[] =>
  bills.map((b, i) => ({ ...b, key: `d${i}`, checked: true }));

const fmtDate = (ts: number | null) => {
  if (!ts) return '今天';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function AiReview(props: {
  drafts: AiDraft[];
  categories: Category[];
  accounts: Account[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState(props.drafts);
  const centsToYuan = (c: number) => (c / 100).toFixed(2);
  const checkedCount = items.filter((d) => d.checked).length;

  const patch = (key: string, p: Partial<AiDraft>) =>
    setItems((old) => old.map((d) => (d.key === key ? { ...d, ...p } : d)));

  const save = async () => {
    const batchId = `b${Date.now()}`;
    for (const d of items.filter((x) => x.checked)) {
      const cat = props.categories.find((c) => c.name === d.categoryName) ?? null;
      const acc = props.accounts.find((a) => a.name === d.accountName) ?? props.accounts[0];
      await createTransaction({
        type: d.type, amountCents: d.amountCents, accountId: acc.id,
        categoryId: cat?.id ?? null, note: d.note,
        occurredAt: d.occurredAt ?? Date.now(), source: 'ai', batchId,
      });
    }
    props.onDone();
  };

  return (
    <View style={st.root}>
      <Text style={st.hint}>识别出 {items.length} 笔，确认后入库</Text>
      <FlatList
        data={items}
        keyExtractor={(d) => d.key}
        renderItem={({ item }) => (
          <Pressable style={st.row} onPress={() => patch(item.key, { checked: !item.checked })}>
            <Text style={[st.box, item.checked && st.boxOn]}>{item.checked ? '✓' : ''}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>
                {item.note || item.categoryName || '未分类'}
                <Text style={st.meta}>   {item.type === 'income' ? '收入' : '支出'} · {fmtDate(item.occurredAt)}</Text>
              </Text>
              <Text style={st.meta}>分类：{item.categoryName ?? '其他'}　账户：{item.accountName ?? '默认'}</Text>
            </View>
            <Text style={[st.amount, item.type === 'income' && st.income]}>
              {item.type === 'income' ? '+' : '-'}{centsToYuan(item.amountCents)}
            </Text>
          </Pressable>
        )}
      />
      <View style={st.actions}>
        <Pressable style={st.cancel} onPress={props.onCancel}><Text style={{ color: '#666' }}>取消</Text></Pressable>
        <Pressable style={[st.save, checkedCount === 0 && st.disabled]} onPress={save}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>入库（{checkedCount}）</Text>
        </Pressable>
      </View>
    </View>
  );
}

const BRAND = '#1f8a70';
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f6f4' },
  hint: { padding: 14, color: '#777', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, marginHorizontal: 10, marginBottom: 1, borderRadius: 10 },
  box: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#ccc', marginRight: 12, textAlign: 'center', lineHeight: 22, color: '#fff' },
  boxOn: { backgroundColor: BRAND, borderColor: BRAND },
  title: { fontSize: 15, color: '#222' },
  meta: { fontSize: 12, color: '#999', marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '600' },
  income: { color: BRAND },
  actions: { flexDirection: 'row', padding: 16, gap: 12, backgroundColor: '#fff' },
  cancel: { flex: 1, padding: 13, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  save: { flex: 2, padding: 13, alignItems: 'center', borderRadius: 12, backgroundColor: BRAND },
  disabled: { opacity: 0.4 },
});
