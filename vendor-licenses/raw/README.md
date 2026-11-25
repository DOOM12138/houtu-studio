# RAW decoder notices and corresponding source

The JavaScript facade declares ISC (`libraw-wasm` 1.6.0). Its compiled WebAssembly is **not ISC-only**: it contains LibRaw 0.22.1, Little CMS 2.19.1, IJG libjpeg 9f and Emscripten runtime code. This distribution selects LibRaw's CDDL 1.0 option. Original notices and the alternative LGPL text are preserved here; Little CMS, IJG and Emscripten keep their own terms.

Complete upstream library source archives, wrapper C++, worker/index entrypoints and build recipe accompany this distribution in this directory. `sources.json` records versions, upstream link and SHA-256 values. The JPEG source SHA-512 is verified against Emscripten 5.0.7's libjpeg port. Upstream libraries were not modified. This application loads the separate WASM file at runtime and does not restrict replacing it with a compatible modified build.

Build the wrapper with Emscripten 5.0.7 using `compileLibraw.sh` and its pinned source versions, then `build.js` with the upstream development dependencies. The application's Node worker supplies `wasmBinary` directly to the generated core rather than using the browser-only facade. Node Windows decoding is tested; mobile Node compatibility is verified separately on Android.

Current rendering preserves original camera files and a 16-bit developed PNG. Editing views are sRGB 8-bit bitmaps; they are not a full non-destructive RAW/Lightroom pipeline. Camera compatibility depends on this particular build, not merely a filename extension.
