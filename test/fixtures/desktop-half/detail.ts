/** A module of the plugin's own, to prove the bundler pulls the plugin's imports in with it. */
export const badge = (provider: string): string => `via ${provider}`;
