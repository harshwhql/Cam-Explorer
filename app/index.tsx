import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CameraTile } from '@/components/CameraTile';
import { EmptyState } from '@/components/EmptyState';
import { GRID_LAYOUTS, clampPage, gridShape, pageCount, pageItems, pickLiveIds, snapshotIntervalMs, stepPage } from '@/core/layout';
import type { Camera, GridLayout } from '@/core/types';
import { useAppActive, useNow, useScreenFocused } from '@/hooks/lifecycle';
import { useCameras } from '@/hooks/useCameras';
import { useRemote } from '@/hooks/useRemote';
import { useDecoderBudget } from '@/hooks/useDecoderBudget';
import { useAppStore } from '@/storage/store';
import { useUiStore } from '@/storage/uiStore';
import { Button, Icon } from '@/ui/controls';
import { colors, isTV, space, type } from '@/ui/theme';

const LAYOUT_LABEL: Record<GridLayout, string> = { 1: '1', 4: '2×2', 9: '3×3', 16: '4×4' };

export default function LiveScreen() {
  useKeepAwake();
  const { cameras, byDevice } = useCameras();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const online = useAppStore((s) => s.online);
  const appActive = useAppActive();
  const screenFocused = useScreenFocused();
  const active = appActive && screenFocused;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const portrait = height > width;
  const scrollGrid = portrait && !isTV;
  const budget = useDecoderBudget();

  // Tiles beyond the hardware-decoder budget fall back to snapshots, so every layout is usable.
  const layouts = GRID_LAYOUTS;
  const layout = layouts.includes(settings.layout) ? settings.layout : layouts[layouts.length - 1]!;
  const shape = gridShape(layout, portrait && !isTV);
  const perPage = layout;
  const pages = pageCount(cameras.length, perPage);
  // Coming back from full screen: show + focus the camera that was being watched.
  // Derived during render; made permanent (settled) on the next grid interaction.
  const lastViewed = useUiStore((s) => s.lastViewedCameraId);
  const hintIdx = lastViewed ? cameras.findIndex((c) => c.id === lastViewed) : -1;
  const page = hintIdx >= 0 ? Math.floor(hintIdx / perPage) : clampPage(settings.page, cameras.length, perPage);
  const pageCams = useMemo(() => pageItems(cameras, page, perPage), [cameras, page, perPage]);

  // Hardware decoders are scarce on TVs (often only 2): the most recently highlighted
  // tiles stream live video, the rest refresh as snapshots.
  const [recentFocus, setRecentFocus] = useState<string[]>([]);
  const liveIds = useMemo(
    () => pickLiveIds(pageCams.map((c) => c.id), recentFocus, budget),
    [pageCams, recentFocus, budget],
  );
  const snapshotEvery = snapshotIntervalMs(pageCams.length - liveIds.size);

  // ---- focus bookkeeping (TV) ----
  const focusIdx = useRef<number>(-1);
  const [preferredIdx, setPreferredIdx] = useState(0);
  const preferred = hintIdx >= 0 ? hintIdx % perPage : preferredIdx;
  const lastActivity = useRef(0);
  useEffect(() => {
    lastActivity.current = Date.now();
  }, []);

  const settleHint = useCallback(() => {
    if (hintIdx < 0) return;
    setPreferredIdx(hintIdx % perPage);
    updateSettings({ page });
    useUiStore.getState().setLastViewed(null);
  }, [hintIdx, perPage, page, updateSettings]);

  const goPage = useCallback(
    (delta: number, focusAt?: number) => {
      if (pages <= 1) return;
      const next = stepPage(page, delta, cameras.length, perPage);
      const count = pageItems(cameras, next, perPage).length;
      useUiStore.getState().setLastViewed(null);
      setPreferredIdx(Math.min(focusAt ?? 0, Math.max(0, count - 1)));
      updateSettings({ page: next });
    },
    [pages, page, cameras, perPage, updateSettings],
  );

  useRemote((evt) => {
    if (!screenFocused) return;
    lastActivity.current = Date.now();
    const i = focusIdx.current;
    const col = i >= 0 ? i % shape.cols : -1;
    switch (evt.eventType) {
      case 'channelUp':
      case 'next':
      case 'fastForward':
        goPage(1);
        break;
      case 'channelDown':
      case 'previous':
      case 'rewind':
        goPage(-1);
        break;
      case 'right':
        if (i >= 0 && col === shape.cols - 1) goPage(1, i - col);
        break;
      case 'left':
        if (i >= 0 && col === 0) goPage(-1, i + shape.cols - 1);
        break;
      default:
        break;
    }
  });

  // Tour mode: auto-advance pages when nobody is using the remote.
  useEffect(() => {
    if (!settings.tourEnabled || pages <= 1 || !active) return;
    const t = setInterval(() => {
      if (Date.now() - lastActivity.current >= settings.tourIntervalSec * 1000) {
        lastActivity.current = Date.now();
        goPage(1, focusIdx.current >= 0 ? focusIdx.current : 0);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [settings.tourEnabled, settings.tourIntervalSec, pages, active, goPage]);

  const openCamera = useCallback((cam: Camera) => {
    router.push({ pathname: '/camera/[id]', params: { id: cam.id } });
  }, []);
  const fixCamera = useCallback((cam: Camera) => {
    router.push({ pathname: '/devices/edit', params: { id: cam.deviceId } });
  }, []);

  const rows = useMemo(() => {
    const out: (Camera | null)[][] = [];
    for (let r = 0; r < shape.rows; r++) {
      const row: (Camera | null)[] = [];
      for (let c = 0; c < shape.cols; c++) row.push(pageCams[r * shape.cols + c] ?? null);
      // Drop fully-empty trailing rows on the last page (portrait phones).
      if (row.some(Boolean) || !portrait) out.push(row);
    }
    return out;
  }, [pageCams, shape.rows, shape.cols, portrait]);

  if (cameras.length === 0) return <EmptyState />;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <TopBar
        layout={layout}
        layouts={layouts}
        page={page}
        pages={pages}
        onLayout={(l) => {
          useUiStore.getState().setLastViewed(null);
          setPreferredIdx(0);
          updateSettings({ layout: l, page: 0 });
        }}
        onPage={(d) => goPage(d)}
        onBarFocus={() => {
          focusIdx.current = -1;
        }}
      />
      {!online ? (
        <View style={styles.offline}>
          <Icon name="wifi-off" size={16} color={colors.warn} />
          <Text style={styles.offlineText}>No network — cameras reconnect automatically when it is back</Text>
        </View>
      ) : null}
      {/* Portrait phones: true 16:9 tiles in a scrolling column. TV / tablet / landscape: tiles fill the screen. */}
      <GridContainer scroll={scrollGrid} gridKey={`${layout}-${page}`}>
        {rows.map((row, r) => (
          <View key={r} style={scrollGrid ? styles.rowScroll : styles.row}>
            {row.map((cam, c) => {
              const idx = r * shape.cols + c;
              return cam ? (
                <View key={cam.id} style={scrollGrid ? styles.cellScroll : styles.cell}>
                  <CameraTile
                    camera={cam}
                    device={byDevice.get(cam.deviceId)}
                    quality={layout === 1 ? settings.fullscreenQuality : settings.gridQuality}
                    active={active}
                    showLabel={settings.showLabels}
                    number={page * perPage + idx + 1}
                    stallTimeoutMs={settings.stallTimeoutSec * 1000}
                    hasTVPreferredFocus={screenFocused && idx === preferred}
                    onOpen={openCamera}
                    onFix={fixCamera}
                    mode={liveIds.has(cam.id) ? 'live' : 'snapshot'}
                    snapshotIntervalMs={snapshotEvery}
                    onFocusTile={() => {
                      focusIdx.current = idx;
                      setRecentFocus((m) => (m[0] === cam.id ? m : [cam.id, ...m.filter((x) => x !== cam.id)].slice(0, 16)));
                      if (screenFocused) settleHint();
                    }}
                  />
                </View>
              ) : (
                <View key={`empty-${c}`} style={[scrollGrid ? styles.cellScroll : styles.cell, styles.emptyCell]} />
              );
            })}
          </View>
        ))}
      </GridContainer>
    </View>
  );
}

function GridContainer({ scroll, gridKey, children }: { scroll: boolean; gridKey: string; children: React.ReactNode }) {
  if (!scroll) {
    return (
      <View style={styles.grid} key={gridKey}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView key={gridKey} style={styles.flex} contentContainerStyle={styles.gridScroll}>
      {children}
    </ScrollView>
  );
}

function TopBar({
  layout,
  layouts,
  page,
  pages,
  onLayout,
  onPage,
  onBarFocus,
}: {
  layout: GridLayout;
  layouts: GridLayout[];
  page: number;
  pages: number;
  onLayout: (l: GridLayout) => void;
  onPage: (delta: number) => void;
  onBarFocus: () => void;
}) {
  const now = useNow(15000);
  const { width } = useWindowDimensions();
  // Phones < 600dp: icons only. Tablets/small screens < 900dp: no button labels. TVs (960dp) and up: full.
  const narrow = width < 600;
  const compact = width < 900;
  const time = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={styles.bar}>
      <View style={styles.brand}>
        <Icon name="cctv" size={20} color={colors.teal} />
        {!narrow ? (
          <Text style={styles.brandText}>
            Cam<Text style={{ color: colors.teal }}>Explorer</Text>
          </Text>
        ) : null}
      </View>
      {pages > 1 ? (
        <View style={styles.pager}>
          <Button icon="chevron-left" compact variant="ghost" onPress={() => onPage(-1)} onFocus={onBarFocus} accessibilityLabel="Previous page" />
          <Text style={styles.pagerText}>
            {page + 1} / {pages}
          </Text>
          <Button icon="chevron-right" compact variant="ghost" onPress={() => onPage(1)} onFocus={onBarFocus} accessibilityLabel="Next page" />
        </View>
      ) : (
        <View style={styles.flex} />
      )}
      <View style={styles.barRight}>
        {layouts.map((l) => (
          <Button
            key={l}
            label={compact ? undefined : LAYOUT_LABEL[l]}
            icon={l === 1 ? 'square-outline' : l === 4 ? 'view-grid-outline' : l === 9 ? 'grid' : 'grid-large'}
            compact
            selected={l === layout}
            variant="ghost"
            onPress={() => onLayout(l)}
            onFocus={onBarFocus}
            accessibilityLabel={`Layout ${LAYOUT_LABEL[l]}`}
          />
        ))}
        <View style={styles.sep} />
        <Button icon="cctv" label={compact ? undefined : 'Devices'} compact variant="ghost" onPress={() => router.push('/devices')} onFocus={onBarFocus} accessibilityLabel="Devices" />
        <Button icon="cog-outline" compact variant="ghost" onPress={() => router.push('/settings')} onFocus={onBarFocus} accessibilityLabel="Settings" />
        {!narrow ? <Text style={styles.clock}>{time}</Text> : null}
      </View>
    </View>
  );
}

const GAP = isTV ? 4 : 3;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isTV ? 28 : space.sm,
    paddingVertical: isTV ? 8 : 4,
    gap: space.md,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brandText: { color: colors.text, fontSize: type.subtitle, fontWeight: '800', letterSpacing: 0.2 },
  pager: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  pagerText: { color: colors.textDim, fontSize: type.label, fontWeight: '700', minWidth: 44, textAlign: 'center' },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sep: { width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: space.sm },
  clock: { color: colors.textDim, fontSize: type.label, fontWeight: '600', marginLeft: space.md, minWidth: 48 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: isTV ? 28 : space.sm,
    marginBottom: GAP,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,181,71,0.1)',
  },
  offlineText: { color: colors.warn, fontSize: type.label },
  grid: { flex: 1, paddingHorizontal: isTV ? 24 : GAP, paddingBottom: isTV ? 16 : GAP, gap: GAP },
  row: { flex: 1, flexDirection: 'row', gap: GAP },
  cell: { flex: 1 },
  gridScroll: { paddingHorizontal: GAP, paddingBottom: GAP, gap: GAP },
  rowScroll: { flexDirection: 'row', gap: GAP },
  cellScroll: { flex: 1, aspectRatio: 16 / 9 },
  emptyCell: { backgroundColor: colors.surface, borderRadius: 6, opacity: 0.4 },
});
