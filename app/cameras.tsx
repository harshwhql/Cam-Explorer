import { StyleSheet, Text, View } from 'react-native';

import { canMove, moveCamera, toggleFavorite } from '@/core/arrange';
import { useCameras } from '@/hooks/useCameras';
import { useAppStore } from '@/storage/store';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/controls';
import { colors, radius, space, type } from '@/ui/theme';

/** Favourites (pinned first, and first in line for live video) + custom camera order. */
export default function ArrangeCamerasScreen() {
  const { cameras } = useCameras();
  const favorites = useAppStore((s) => s.settings.favorites);
  const update = useAppStore((s) => s.updateSettings);

  return (
    <Screen title="Arrange cameras" subtitle="Favourites stay at the top of the grid. Use ▲ ▼ to reorder.">
      {cameras.length === 0 ? <Text style={styles.empty}>Add a recorder or camera first.</Text> : null}
      {cameras.map((cam, i) => {
        const fav = favorites.includes(cam.id);
        return (
          <View key={cam.id} style={styles.row} testID={`arrange-${cam.id}`}>
            <Button
              icon={fav ? 'star' : 'star-outline'}
              compact
              variant="ghost"
              selected={fav}
              hasTVPreferredFocus={i === 0}
              accessibilityLabel={`${fav ? 'Unfavourite' : 'Favourite'} ${cam.name}`}
              onPress={() => update({ favorites: toggleFavorite(favorites, cam.id) })}
            />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {i + 1}. {cam.name}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {cam.deviceName} · channel {cam.channel}
              </Text>
            </View>
            <Button
              icon="arrow-up"
              compact
              disabled={!canMove(cameras, cam.id, -1, favorites)}
              accessibilityLabel={`Move ${cam.name} up`}
              onPress={() => update({ cameraOrder: moveCamera(cameras, cam.id, -1, favorites) })}
            />
            <Button
              icon="arrow-down"
              compact
              disabled={!canMove(cameras, cam.id, 1, favorites)}
              accessibilityLabel={`Move ${cam.name} down`}
              onPress={() => update({ cameraOrder: moveCamera(cameras, cam.id, 1, favorites) })}
            />
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: type.label },
  empty: { color: colors.textDim, fontSize: type.body },
});
