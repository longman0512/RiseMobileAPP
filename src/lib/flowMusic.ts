import { Linking } from 'react-native';

import type { MusicService } from '../providers/UserPreferencesProvider';

/**
 * RISE FLOW playlists. Each service has an app-scheme URL (opens the native app
 * directly) and a web fallback (used when the app is not installed).
 *
 * Spotify: the `spotify:` scheme opens the app; an `https://open.spotify.com`
 * link would otherwise resolve in the browser. Replace with your RISE FLOW
 * playlist IDs.
 */
const SPOTIFY_PLAYLIST_ID = '37i9dQZF1DWXe9gFZP0gtP';

const FLOW_PLAYLISTS: Record<Exclude<MusicService, 'none'>, { app: string; web: string }> = {
  spotify: {
    app: `spotify:playlist:${SPOTIFY_PLAYLIST_ID}`,
    web: `https://open.spotify.com/playlist/${SPOTIFY_PLAYLIST_ID}`,
  },
  apple: {
    app: 'music://music.apple.com/playlist/lo-fi-chill/pl.u-38oWzoxTNP6',
    web: 'https://music.apple.com/playlist/lo-fi-chill/pl.u-38oWzoxTNP6',
  },
};

export function getFlowPlaylistUrl(service: MusicService): string | null {
  if (service === 'none') return null;
  return FLOW_PLAYLISTS[service].app;
}

export async function openFlowPlaylist(service: MusicService): Promise<void> {
  if (service === 'none') return;
  const { app, web } = FLOW_PLAYLISTS[service];
  try {
    // Prefer the native app; fall back to the web player if it isn't installed.
    const canOpenApp = await Linking.canOpenURL(app);
    await Linking.openURL(canOpenApp ? app : web);
  } catch {
    // Last resort: try the web link, then give up silently.
    try {
      await Linking.openURL(web);
    } catch {
      // Silent fail if no handler is available.
    }
  }
}
