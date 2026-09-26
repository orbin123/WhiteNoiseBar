(async () => {
 const { packager } = await import('@electron/packager');
 const paths = await packager({ dir: __dirname, out: 'dist', name: 'WhiteNoiseBar', platform: 'darwin', arch: 'arm64', appBundleId: 'com.local.whitenoisebar', appVersion: '1.0.0', icon: 'assets/AppIcon.icns', overwrite: true, asar: true, prune: true, ignore: [/^\/dist/, /^\/build.cjs/, /^\/README.md/], extendInfo: { LSUIElement: true, NSHighResolutionCapable: true, NSHumanReadableCopyright: 'WhiteNoiseBar' } });
 console.log(paths.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
