# Codex code-mode execution component

The unmodified Windows x64 `codex-code-mode-host.exe` is from the official `@openai/codex-win32-x64` 0.172.0 package. Its SHA-256 is pinned in desktop/runtime-lock.json and sources.json. It is required by code-mode models to invoke built-in image generation; it is distinct from shell access and does not change this app's authentication.

Codex application code retains its Apache-2.0 license in ../codex-APACHE-2.0.txt and the OpenAI/Ratatui notice here. The host also contains Rusty V8 bindings (MIT), V8 (BSD-3-Clause) and ICU data (Unicode-3.0 plus the notices in the full ICU license). Their license files are included here. The pinned V8 dependencies Abseil, Highway, fast_float, simdutf, Dragonbox and FP16 retain the selected Apache-2.0, MIT or Boost licenses alongside them; LLVM notices are also retained in the distribution's dxc license directory. The Codex and image-processing notices in the rest of vendor-licenses remain applicable.

This component is not Apache-only. V8 sources and bindings are pinned by the official Codex 0.172.0 Cargo.lock and third_party/v8/dependencies.bzl. Source URLs and file hashes for the added notices are recorded in sources.json. No binary or runtime source was modified for Windows.

The deno_core_icudata registry package declares MIT and the Deno authors but omits a standalone license file; its original package declaration is preserved, and the standard MIT terms with that attribution are reproduced in deno-core-icudata-MIT.txt. ICU data keeps its separate Unicode license and notices.
