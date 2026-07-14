import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getBlockableApps,
  getFocusModeSelection,
  setFocusModeSelection,
  type InstalledApp,
} from '../lib/focusMode';
import { COIN_LABELS, type CoinType } from '../types/coins';

type Props = {
  visible: boolean;
  protocol: CoinType;
  onClose: (saved: boolean) => void;
};

/**
 * Android app-blocking picker. Android has no system app picker (unlike iOS
 * FamilyActivityPicker), so we list installed apps and persist the chosen
 * package names via the native RiseFocusMode module.
 */
export function AppBlockPickerModal({ visible, protocol, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;

    let mounted = true;
    setLoading(true);
    setQuery('');
    void (async () => {
      const [list, current] = await Promise.all([
        getBlockableApps(),
        getFocusModeSelection(protocol),
      ]);
      if (!mounted) return;
      setApps(list);
      setSelected(new Set(current));
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [visible, protocol]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) => a.appName.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q),
    );
  }, [apps, query]);

  const toggle = (pkg: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await setFocusModeSelection(protocol, [...selected]);
      onClose(selected.size > 0);
    } finally {
      setSaving(false);
    }
  };

  const label = COIN_LABELS[protocol];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onClose(selected.size > 0)}>
      <View style={styles.root}>
        <View style={[styles.content, { paddingTop: insets.top + 18 }]}>
          <Text style={styles.title}>Block during {label}</Text>
          <Text style={styles.subtitle}>
            Choose the apps to pause while a {label} session is running.
          </Text>

          <TextInput
            style={styles.searchInput}
            placeholder="Search apps"
            placeholderTextColor="#5C5C66"
            value={query}
            onChangeText={setQuery}
          />

          {loading ? (
            <ActivityIndicator color="#F5F5F7" style={styles.loader} />
          ) : (
            <FlatList
              style={styles.list}
              data={filtered}
              keyExtractor={(item) => item.packageName}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isOn = selected.has(item.packageName);
                return (
                  <Pressable onPress={() => toggle(item.packageName)} style={styles.row}>
                    <Text style={styles.appName} numberOfLines={1}>
                      {item.appName}
                    </Text>
                    <View style={[styles.checkBox, isOn ? styles.checkBoxOn : null]}>
                      {isOn ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.count}>{selected.size} selected</Text>
          <Pressable style={styles.saveButton} onPress={() => void onSave()} disabled={saving}>
            <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={() => onClose(selected.size > 0)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0A0A0C',
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
  },
  title: {
    color: '#F5F5F7',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9A9AA2',
    fontSize: 13,
    fontWeight: '300',
    lineHeight: 20,
    marginBottom: 16,
    marginTop: 6,
  },
  searchInput: {
    backgroundColor: '#131316',
    borderColor: '#222228',
    borderRadius: 12,
    borderWidth: 1,
    color: '#F5F5F7',
    fontSize: 14,
    height: 44,
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  loader: {
    marginTop: 24,
  },
  list: {
    flex: 1,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: '#222228',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  appName: {
    color: '#F5F5F7',
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    paddingRight: 12,
  },
  checkBox: {
    alignItems: 'center',
    borderColor: '#5C5C66',
    borderRadius: 4,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  checkBoxOn: {
    backgroundColor: '#F5F5F7',
    borderColor: '#F5F5F7',
  },
  checkMark: {
    color: '#0A0A0C',
    fontSize: 11,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 28,
  },
  count: {
    color: '#5C5C66',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 8,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
  },
  saveText: {
    color: '#0A0A0C',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginTop: 4,
  },
  cancelText: {
    color: '#9A9AA2',
    fontSize: 14,
    fontWeight: '500',
  },
});
