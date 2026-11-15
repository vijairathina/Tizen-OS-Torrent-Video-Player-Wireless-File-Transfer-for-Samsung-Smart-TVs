/**
 * Legacy compatibility bridge: forwards all calls to VideoPlayer module.
 */
if (typeof window !== 'undefined') {
    window.Amnis = window.VideoPlayer;
}
