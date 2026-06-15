import { Linking } from 'react-native';

import type { MusicService } from '../providers/UserPreferencesProvider';

/** Replace with your RISE FLOW playlist IDs from Spotify / Apple Music. */
const FLOW_PLAYLIST_URLS: Record<Exclude<MusicService, 'none'>, string> = {
  spotify: 'https://open.spotify.com/playlist/37i9dQZF1DWXe9gFZP0gtP',
  apple: 'music://music.apple.com/playlist/lo-fi-chill/pl.u-38oWzoxTNP6',
};

export function getFlowPlaylistUrl(service: MusicService): string | null {
  if (service === 'none') return null;
  return FLOW_PLAYLIST_URLS[service];
}

export async function openFlowPlaylist(service: MusicService): Promise<void> {
  const url = getFlowPlaylistUrl(service);
  if (!url) return;
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  } catch {
    // Silent fail if music app is not installed
  }
}
